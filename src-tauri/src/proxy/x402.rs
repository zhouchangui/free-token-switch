use crate::proxy::server::ProxyState;
use crate::services::market::MarketService;
use axum::{
    body::Body,
    http::{HeaderMap, Request, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
};
use serde_json::json;

/// X402 支付中间件
///
/// 检查请求是否来自外部，如果是外部请求则强制要求支付凭证 (L402)
pub async fn x402_middleware(
    state: axum::extract::State<ProxyState>,
    req: Request<Body>,
    next: Next,
) -> Response {
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

    // 3. 检查 L402 凭证
    let auth_header = req.headers().get("Authorization");
    let has_valid_payment = if let Some(auth) = auth_header {
        let auth_str = auth.to_str().unwrap_or("");
        // 简单校验格式: "L402 <token>:<preimage>"
        auth_str.starts_with("L402 ") && auth_str.contains(':')
    } else {
        false
    };

    if has_valid_payment {
        // TODO: 进一步校验 Preimage 是否真的在闪电网络上支付过
        return next.run(req).await;
    }

    // 4. 未支付，返回 402 Payment Required
    // 这里我们生成一个“模拟发票”，实际项目中应调用钱包 API 生成真实发票
    let mock_invoice = format!(
        "lnbc{}...mock_invoice_for_{}_sats",
        config.p2p_market.price_per_1k_tokens, config.p2p_market.price_per_1k_tokens
    );

    (
        StatusCode::PAYMENT_REQUIRED,
        [
            ("WWW-Authenticate", format!("L402 invoice=\"{}\"", mock_invoice)),
            ("Content-Type", "application/json".to_string()),
        ],
        json!({
            "error": "Payment Required",
            "message": "This is a P2P AI Node. Please pay the invoice via Lightning Network to access.",
            "invoice": mock_invoice,
            "price_per_1k_tokens": config.p2p_market.price_per_1k_tokens
        }).to_string(),
    ).into_response()
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
    use super::{extract_share_access_token, has_valid_share_access_token, is_external_request};
    use crate::services::market::MarketService;
    use axum::http::{HeaderMap, HeaderValue};

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
}
