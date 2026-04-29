use crate::proxy::server::ProxyState;
use crate::services::clawtip::credential::verify_pay_credential_for_order;
use crate::services::clawtip::order_file::ClawtipOrderFile;
use crate::services::clawtip::service::{
    ClawtipService, VerifyClawtipCredentialRequest, VerifyClawtipCredentialResult,
};
use crate::services::market::MarketService;
use axum::{
    body::Body,
    http::{HeaderMap, Request, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
};
use futures::StreamExt;
use serde_json::json;
use std::sync::atomic::{AtomicBool, Ordering};

static CLAWTIP_PROXY_BUSY: AtomicBool = AtomicBool::new(false);

/// X402 支付中间件
///
/// 检查请求是否来自外部，如果是外部请求则强制要求支付凭证 (L402)
pub async fn x402_middleware(
    state: axum::extract::State<ProxyState>,
    req: Request<Body>,
    next: Next,
) -> Response {
    if is_clawtip_market_buyer_path(req.uri().path()) {
        return next.run(req).await;
    }

    let is_external = is_external_request(req.headers());
    if is_external && !has_valid_share_access_token(req.headers()) {
        return (
            StatusCode::UNAUTHORIZED,
            [("Content-Type", "application/json".to_string())],
            json!({
                "error": "Unauthorized",
                "message": "A valid sharing access token is required for external requests."
            })
            .to_string(),
        )
            .into_response();
    }

    let config = state.config.read().await;

    // 1. 如果 P2P 市场未开启，直接放行 (内部使用模式)
    if !config.p2p_market.enabled {
        return next.run(req).await;
    }

    if !is_external {
        return next.run(req).await;
    }

    if let Err(message) =
        validate_clawtip_payment_headers(req.headers(), &ClawtipService::default_app())
    {
        log::warn!("[ClawTipSeller] 支付凭证校验失败: error={message}");
        return (
            StatusCode::PAYMENT_REQUIRED,
            [("Content-Type", "application/json".to_string())],
            json!({
                "error": "Payment Required",
                "message": message
            })
            .to_string(),
        )
            .into_response();
    }

    let Ok(guard) = ClawtipProxySeatGuard::try_acquire() else {
        log::warn!("[ClawTipSeller] 单席位占用中，拒绝新的付费请求");
        return (
            StatusCode::CONFLICT,
            [("Content-Type", "application/json".to_string())],
            json!({
                "error": "Seller Busy",
                "message": "The paid seller seat is currently busy."
            })
            .to_string(),
        )
            .into_response();
    };

    log::info!("[ClawTipSeller] 单席位已占用，开始履约请求");
    let response = next.run(req).await;
    hold_guard_until_response_body_finishes(response, guard)
}

struct ClawtipProxySeatGuard;

impl ClawtipProxySeatGuard {
    fn try_acquire() -> Result<Self, ()> {
        CLAWTIP_PROXY_BUSY
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .map(|_| Self)
            .map_err(|_| ())
    }
}

impl Drop for ClawtipProxySeatGuard {
    fn drop(&mut self) {
        CLAWTIP_PROXY_BUSY.store(false, Ordering::SeqCst);
        log::info!("[ClawTipSeller] 单席位已释放");
    }
}

fn hold_guard_until_response_body_finishes(
    response: Response,
    guard: ClawtipProxySeatGuard,
) -> Response {
    let (parts, body) = response.into_parts();
    let stream = body.into_data_stream().map(move |chunk| {
        let _hold_guard = &guard;
        chunk
    });
    Response::from_parts(parts, Body::from_stream(stream))
}

fn is_external_request(headers: &HeaderMap) -> bool {
    if headers.contains_key("x-forwarded-for")
        || headers.contains_key("cf-connecting-ip")
        || headers.contains_key("x-real-ip")
    {
        return true;
    }

    let Some(host) = headers
        .get("host")
        .and_then(|value| value.to_str().ok())
        .map(str::trim)
        .filter(|value| !value.is_empty())
    else {
        return false;
    };

    let host_without_port = host
        .strip_prefix('[')
        .and_then(|value| value.split_once(']').map(|(inner, _)| inner))
        .or_else(|| host.split(':').next())
        .unwrap_or(host)
        .to_ascii_lowercase();

    !matches!(
        host_without_port.as_str(),
        "localhost" | "127.0.0.1" | "::1" | "0.0.0.0"
    )
}

fn is_clawtip_market_buyer_path(path: &str) -> bool {
    path.starts_with("/clawtip-market/")
}

fn extract_share_access_token(headers: &HeaderMap) -> Option<String> {
    if let Some(token) = headers
        .get("authorization")
        .and_then(|value| value.to_str().ok())
        .and_then(extract_bearer_token)
    {
        return Some(token.to_string());
    }

    for header in ["x-api-key", "api-key"] {
        if let Some(token) = headers
            .get(header)
            .and_then(|value| value.to_str().ok())
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            return Some(token.to_string());
        }
    }

    None
}

fn has_valid_share_access_token(headers: &HeaderMap) -> bool {
    extract_share_access_token(headers)
        .as_deref()
        .is_some_and(MarketService::validate_access_token)
}

fn validate_clawtip_payment_headers(
    headers: &HeaderMap,
    service: &ClawtipService,
) -> Result<VerifyClawtipCredentialResult, String> {
    let indicator = required_header(headers, "x-clawtip-indicator")?;
    let order_no = required_header(headers, "x-clawtip-order-no")?;
    let pay_credential = required_header(headers, "x-clawtip-pay-credential")?;
    let sm4_key_base64 = header_value(headers, "x-clawtip-sm4-key")
        .or_else(|| std::env::var("CLAWTIP_SM4_KEY").ok())
        .ok_or_else(|| "ClawTip server secret is not configured.".to_string())?;

    if service
        .attach_pay_credential(&indicator, &order_no, &pay_credential)
        .is_ok()
    {
        let verified = service.verify_credential(VerifyClawtipCredentialRequest {
            indicator,
            order_no,
            sm4_key_base64,
        })?;
        log::info!(
            "[ClawTipSeller] 本地订单凭证校验成功: orderNo={}, amount={}",
            verified.order_no,
            verified.amount
        );
        return Ok(verified);
    }

    let amount = required_header(headers, "x-clawtip-amount-fen")?
        .parse::<i64>()
        .map_err(|err| format!("x-clawtip-amount-fen header is invalid: {err}"))?;
    let pay_to = required_header(headers, "x-clawtip-pay-to")?;
    let order = ClawtipOrderFile {
        skill_id: "si-tokens-buddy-llm-console".to_string(),
        order_no,
        amount,
        question: String::new(),
        encrypted_data: String::new(),
        pay_to,
        description: "TokensBuddy remote paid model call".to_string(),
        slug: "tokens-buddy-llm-console".to_string(),
        resource_url: String::new(),
        pay_credential: None,
    };
    let verified = verify_pay_credential_for_order(&order, &pay_credential, &sm4_key_base64)
        .map(VerifyClawtipCredentialResult::from)?;
    log::info!(
        "[ClawTipSeller] 远程订单凭证校验成功: orderNo={}, amount={}",
        verified.order_no,
        verified.amount
    );
    Ok(verified)
}

fn required_header(headers: &HeaderMap, name: &str) -> Result<String, String> {
    header_value(headers, name).ok_or_else(|| format!("{name} header is required."))
}

fn header_value(headers: &HeaderMap, name: &str) -> Option<String> {
    headers
        .get(name)
        .and_then(|value| value.to_str().ok())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn extract_bearer_token(value: &str) -> Option<&str> {
    let (scheme, token) = value.trim().split_once(' ')?;
    if !scheme.eq_ignore_ascii_case("bearer") {
        return None;
    }

    let token = token.trim();
    (!token.is_empty()).then_some(token)
}

#[cfg(test)]
mod tests {
    use super::{
        extract_share_access_token, has_valid_share_access_token, is_external_request,
        validate_clawtip_payment_headers, ClawtipProxySeatGuard,
    };
    use crate::services::clawtip::{
        credential::create_mock_pay_credential,
        order_file::read_order_file_by_id,
        service::{ClawtipService, ClawtipServicePaths, CreateClawtipOrderRequest},
    };
    use crate::services::market::MarketService;
    use axum::http::{HeaderMap, HeaderValue};
    use std::sync::{Mutex, OnceLock};

    fn seat_test_lock() -> std::sync::MutexGuard<'static, ()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(()))
            .lock()
            .unwrap_or_else(|err| err.into_inner())
    }

    #[test]
    fn local_hosts_are_not_treated_as_external_requests() {
        let mut headers = HeaderMap::new();
        headers.insert("host", HeaderValue::from_static("127.0.0.1:15721"));
        assert!(!is_external_request(&headers));

        headers.insert("host", HeaderValue::from_static("localhost:15721"));
        assert!(!is_external_request(&headers));
    }

    #[test]
    fn cloudflare_headers_are_treated_as_external_requests() {
        let mut headers = HeaderMap::new();
        headers.insert("host", HeaderValue::from_static("demo.trycloudflare.com"));
        assert!(is_external_request(&headers));

        let mut forwarded_headers = HeaderMap::new();
        forwarded_headers.insert("x-forwarded-for", HeaderValue::from_static("203.0.113.8"));
        assert!(is_external_request(&forwarded_headers));
    }

    #[test]
    fn clawtip_market_buyer_route_bypasses_x402() {
        assert!(super::is_clawtip_market_buyer_path(
            "/clawtip-market/anthropic/v1/messages"
        ));
        assert!(!super::is_clawtip_market_buyer_path("/v1/messages"));
    }

    #[test]
    fn extracts_share_token_from_bearer_or_api_key_headers() {
        let mut headers = HeaderMap::new();
        headers.insert(
            "authorization",
            HeaderValue::from_static("Bearer ccs_sell_friend"),
        );
        assert_eq!(
            extract_share_access_token(&headers).as_deref(),
            Some("ccs_sell_friend")
        );

        headers.clear();
        headers.insert("x-api-key", HeaderValue::from_static("ccs_sell_friend"));
        assert_eq!(
            extract_share_access_token(&headers).as_deref(),
            Some("ccs_sell_friend")
        );
    }

    #[test]
    fn only_registered_share_tokens_are_valid_for_external_access() {
        MarketService::clear_access_tokens_for_tests();
        let token = MarketService::generate_and_register_access_token_for("provider-1");
        let mut headers = HeaderMap::new();

        assert!(!has_valid_share_access_token(&headers));

        headers.insert(
            "authorization",
            HeaderValue::from_str(&format!("Bearer {token}")).unwrap(),
        );
        assert!(has_valid_share_access_token(&headers));

        MarketService::invalidate_access_tokens_for("provider-1");
        assert!(!has_valid_share_access_token(&headers));
    }

    #[test]
    fn validates_clawtip_payment_headers_against_order_file() {
        let key = "MDEyMzQ1Njc4OUFCQ0RFRg==";
        let temp_dir = tempfile::tempdir().expect("create temp dir");
        let service = ClawtipService::new(ClawtipServicePaths {
            orders_dir: temp_dir.path().join("orders"),
            fulfillment_store: temp_dir.path().join("fulfillments.json"),
        });
        service
            .create_order(CreateClawtipOrderRequest {
                listing_id: "listing-1".to_string(),
                prompt: "hello".to_string(),
                amount_fen: 2,
                pay_to: "payto_1234567890abcdef".to_string(),
                indicator: "indicator123".to_string(),
                order_no: Some("202604270001".to_string()),
                endpoint: "http://127.0.0.1:15721".to_string(),
                sm4_key_base64: Some(key.to_string()),
                encrypted_data: None,
            })
            .expect("create order");
        let order =
            read_order_file_by_id(&service.paths.orders_dir, "indicator123", "202604270001")
                .expect("read order");
        let credential = create_mock_pay_credential(&order, key, "SUCCESS", "2026-04-27 10:00:00")
            .expect("credential");
        let mut headers = HeaderMap::new();
        headers.insert(
            "x-clawtip-indicator",
            HeaderValue::from_static("indicator123"),
        );
        headers.insert(
            "x-clawtip-order-no",
            HeaderValue::from_static("202604270001"),
        );
        headers.insert("x-clawtip-sm4-key", HeaderValue::from_static(key));
        headers.insert(
            "x-clawtip-pay-credential",
            HeaderValue::from_str(&credential).expect("credential header"),
        );

        let verified = validate_clawtip_payment_headers(&headers, &service).expect("valid payment");

        assert_eq!(verified.pay_status, "SUCCESS");
        assert_eq!(verified.order_no, "202604270001");
    }

    #[test]
    fn validates_remote_clawtip_payment_without_local_order_file() {
        let key = "MDEyMzQ1Njc4OUFCQ0RFRg==";
        let buyer_dir = tempfile::tempdir().expect("buyer temp dir");
        let seller_dir = tempfile::tempdir().expect("seller temp dir");
        let buyer_service = ClawtipService::new(ClawtipServicePaths {
            orders_dir: buyer_dir.path().join("orders"),
            fulfillment_store: buyer_dir.path().join("fulfillments.json"),
        });
        let seller_service = ClawtipService::new(ClawtipServicePaths {
            orders_dir: seller_dir.path().join("orders"),
            fulfillment_store: seller_dir.path().join("fulfillments.json"),
        });
        buyer_service
            .create_order(CreateClawtipOrderRequest {
                listing_id: "listing-1".to_string(),
                prompt: "hello".to_string(),
                amount_fen: 2,
                pay_to: "payto_1234567890abcdef".to_string(),
                indicator: "indicator123".to_string(),
                order_no: Some("202604270002".to_string()),
                endpoint: "http://127.0.0.1:15721".to_string(),
                sm4_key_base64: Some(key.to_string()),
                encrypted_data: None,
            })
            .expect("create buyer order");
        let order = read_order_file_by_id(
            &buyer_service.paths.orders_dir,
            "indicator123",
            "202604270002",
        )
        .expect("read buyer order");
        let credential = create_mock_pay_credential(&order, key, "SUCCESS", "2026-04-27 10:00:00")
            .expect("credential");
        let mut headers = HeaderMap::new();
        headers.insert(
            "x-clawtip-indicator",
            HeaderValue::from_static("indicator123"),
        );
        headers.insert(
            "x-clawtip-order-no",
            HeaderValue::from_static("202604270002"),
        );
        headers.insert("x-clawtip-sm4-key", HeaderValue::from_static(key));
        headers.insert("x-clawtip-amount-fen", HeaderValue::from_static("2"));
        headers.insert(
            "x-clawtip-pay-to",
            HeaderValue::from_static("payto_1234567890abcdef"),
        );
        headers.insert(
            "x-clawtip-pay-credential",
            HeaderValue::from_str(&credential).expect("credential header"),
        );

        let verified =
            validate_clawtip_payment_headers(&headers, &seller_service).expect("valid payment");

        assert_eq!(verified.order_no, "202604270002");
        assert_eq!(verified.amount, "2");
    }

    #[test]
    fn rejects_missing_clawtip_payment_headers() {
        let temp_dir = tempfile::tempdir().expect("create temp dir");
        let service = ClawtipService::new(ClawtipServicePaths {
            orders_dir: temp_dir.path().join("orders"),
            fulfillment_store: temp_dir.path().join("fulfillments.json"),
        });
        let headers = HeaderMap::new();

        let error = validate_clawtip_payment_headers(&headers, &service)
            .expect_err("missing payment headers");

        assert!(error.contains("x-clawtip-indicator"));
    }

    #[test]
    fn clawtip_proxy_seat_allows_only_one_holder() {
        let _lock = seat_test_lock();
        super::CLAWTIP_PROXY_BUSY.store(false, std::sync::atomic::Ordering::SeqCst);
        let first = ClawtipProxySeatGuard::try_acquire().expect("first guard");
        assert!(ClawtipProxySeatGuard::try_acquire().is_err());
        drop(first);
        assert!(ClawtipProxySeatGuard::try_acquire().is_ok());
        super::CLAWTIP_PROXY_BUSY.store(false, std::sync::atomic::Ordering::SeqCst);
    }

    #[test]
    fn clawtip_proxy_seat_is_held_by_response_body() {
        let _lock = seat_test_lock();
        super::CLAWTIP_PROXY_BUSY.store(false, std::sync::atomic::Ordering::SeqCst);
        let guard = ClawtipProxySeatGuard::try_acquire().expect("guard");
        let response = axum::response::Response::new(axum::body::Body::from("ok"));
        let response = super::hold_guard_until_response_body_finishes(response, guard);

        assert!(ClawtipProxySeatGuard::try_acquire().is_err());
        drop(response);
        assert!(ClawtipProxySeatGuard::try_acquire().is_ok());
        super::CLAWTIP_PROXY_BUSY.store(false, std::sync::atomic::Ordering::SeqCst);
    }
}
