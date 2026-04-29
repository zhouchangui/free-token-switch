use base64::{engine::general_purpose, Engine as _};
use bytes::Bytes;
use http::{HeaderMap, HeaderValue, StatusCode};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

use super::{
    hyper_client::ProxyResponse,
    providers::{ClaudeAdapter, ProviderAdapter},
    ProxyError,
};
use crate::{
    provider::Provider,
    services::{
        clawtip::{
            market_buyer::{select_seller_for_model, PendingMarketOrder, PendingMarketOrderStore},
            order_file::read_order_file_by_id,
            service::{ClawtipService, CreateClawtipOrderRequest, VerifyClawtipCredentialRequest},
        },
        market::{MarketListing, MarketPaymentListing, MarketService},
    },
};

const MARKET_ORDER_TTL_SECONDS: i64 = 30 * 60;

pub async fn forward_clawtip_market_request(
    provider: &Provider,
    endpoint: &str,
    body: &Value,
    headers: &HeaderMap,
    extensions: &http::Extensions,
    timeout: std::time::Duration,
) -> Result<(ProxyResponse, Option<String>), ProxyError> {
    let model = body
        .get("model")
        .and_then(Value::as_str)
        .ok_or_else(|| ProxyError::InvalidRequest("ClawTip 市场请求缺少 model".to_string()))?;
    let fingerprint = market_request_fingerprint(&provider.id, model, body);
    let request_hash = market_request_hash(body)?;
    let store = PendingMarketOrderStore::default_app();
    store
        .remove_expired(chrono::Utc::now().timestamp())
        .map_err(mask_store_error)?;

    if let Some(pending) = store.get(&fingerprint).map_err(mask_store_error)? {
        log::info!(
            "[ClawTipMarket] 复用待支付订单: provider={}, model={}, requestHash={}, orderNo={}, listing={}",
            provider.id,
            model,
            pending.request_hash,
            pending.order_no,
            pending.listing.provider_id
        );
        return handle_pending_order(pending, endpoint, body, headers, extensions, timeout).await;
    }

    let sellers = MarketService::new().find_sellers().await.map_err(|err| {
        ProxyError::ForwardFailed(format!("ClawTip market seller lookup failed: {err}"))
    })?;
    let Some(listing) = select_seller_for_model(&sellers, model) else {
        log::warn!(
            "[ClawTipMarket] 未找到可用卖家: provider={}, model={}, requestHash={}",
            provider.id,
            model,
            request_hash
        );
        return Ok((
            synthetic_market_error(
                StatusCode::SERVICE_UNAVAILABLE,
                "clawtip_market_no_seller",
                "No available ClawTip market seller matches this model",
            )?,
            None,
        ));
    };

    let order = create_pending_order(
        &store,
        provider,
        model,
        body,
        request_hash,
        fingerprint,
        listing,
    )?;
    Ok((payment_required_response(&order)?, None))
}

pub fn market_request_fingerprint(provider_id: &str, model: &str, body: &Value) -> String {
    let mut hasher = Sha256::new();
    hasher.update(provider_id.as_bytes());
    hasher.update([0]);
    hasher.update(model.as_bytes());
    hasher.update([0]);
    if let Ok(bytes) = serde_json::to_vec(body) {
        hasher.update(bytes);
    }
    hex_lower(&hasher.finalize())
}

pub fn market_request_hash(body: &Value) -> Result<String, ProxyError> {
    let bytes = serde_json::to_vec(body)
        .map_err(|err| ProxyError::InvalidRequest(format!("Invalid JSON body: {err}")))?;
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    Ok(hex_lower(&hasher.finalize()))
}

fn create_pending_order(
    store: &PendingMarketOrderStore,
    provider: &Provider,
    model: &str,
    body: &Value,
    request_hash: String,
    fingerprint: String,
    listing: MarketListing,
) -> Result<PendingMarketOrder, ProxyError> {
    let payment = listing_payment(&listing)?;
    let sm4_key_base64 = generate_sm4_key_base64();
    let now = chrono::Utc::now().timestamp();
    let service = ClawtipService::default_app();
    let created = service
        .create_order(CreateClawtipOrderRequest {
            listing_id: listing.provider_id.clone(),
            prompt: format!(
                "TokensBuddy ClawTip market request: model={model}, requestHash={request_hash}"
            ),
            amount_fen: payment.amount_fen,
            pay_to: payment.pay_to.clone(),
            indicator: payment.indicator.clone(),
            order_no: None,
            endpoint: listing.resource_url.clone(),
            sm4_key_base64: Some(sm4_key_base64.clone()),
            encrypted_data: None,
        })
        .map_err(mask_store_error)?;

    let order = PendingMarketOrder {
        fingerprint,
        provider_id: provider.id.clone(),
        model: model.to_string(),
        request_hash,
        order_no: created.order_no,
        indicator: created.indicator,
        sm4_key_base64,
        listing,
        order_file: created.order_file,
        created_at: now,
        expires_at: now + MARKET_ORDER_TTL_SECONDS,
    };
    store.put(&order).map_err(mask_store_error)?;
    log::info!(
        "[ClawTipMarket] 创建待支付订单: provider={}, model={}, orderNo={}, listing={}",
        provider.id,
        model,
        order.order_no,
        order.listing.provider_id
    );
    let _ = body;
    Ok(order)
}

async fn handle_pending_order(
    pending: PendingMarketOrder,
    endpoint: &str,
    body: &Value,
    headers: &HeaderMap,
    extensions: &http::Extensions,
    timeout: std::time::Duration,
) -> Result<(ProxyResponse, Option<String>), ProxyError> {
    let service = ClawtipService::default_app();
    let order_file = read_order_file_by_id(
        &service.paths.orders_dir,
        &pending.indicator,
        &pending.order_no,
    )
    .map_err(mask_store_error)?;

    let Some(pay_credential) = order_file.pay_credential.clone() else {
        log::info!(
            "[ClawTipMarket] 待支付订单尚无凭证: provider={}, model={}, requestHash={}, orderNo={}, listing={}",
            pending.provider_id,
            pending.model,
            pending.request_hash,
            pending.order_no,
            pending.listing.provider_id
        );
        return Ok((payment_required_response(&pending)?, None));
    };

    match service.verify_credential(VerifyClawtipCredentialRequest {
        indicator: pending.indicator.clone(),
        order_no: pending.order_no.clone(),
        sm4_key_base64: pending.sm4_key_base64.clone(),
    }) {
        Ok(verified) => {
            log::info!(
                "[ClawTipMarket] 支付凭证校验成功: provider={}, model={}, requestHash={}, orderNo={}, amount={}",
                pending.provider_id,
                pending.model,
                pending.request_hash,
                verified.order_no,
                verified.amount
            );
        }
        Err(err) => {
            log::warn!(
                "[ClawTipMarket] 支付凭证校验失败: provider={}, model={}, requestHash={}, orderNo={}, error={}",
                pending.provider_id,
                pending.model,
                pending.request_hash,
                pending.order_no,
                err
            );
            return Err(ProxyError::AuthError(format!(
                "ClawTip payment credential invalid: {err}"
            )));
        }
    }

    let response = forward_to_seller(
        &pending,
        endpoint,
        body,
        headers,
        extensions,
        timeout,
        &pay_credential,
    )
    .await?;
    Ok((response, None))
}

async fn forward_to_seller(
    pending: &PendingMarketOrder,
    endpoint: &str,
    body: &Value,
    headers: &HeaderMap,
    extensions: &http::Extensions,
    timeout: std::time::Duration,
    pay_credential: &str,
) -> Result<ProxyResponse, ProxyError> {
    let access_token = pending
        .listing
        .access_token
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| {
            ProxyError::AuthError("ClawTip seller listing missing access token".to_string())
        })?;
    let url = join_url(&pending.listing.resource_url, endpoint);
    let uri = url.parse::<http::Uri>().map_err(|err| {
        ProxyError::ForwardFailed(format!("Invalid ClawTip seller URL '{url}': {err}"))
    })?;
    let mut ordered_headers = headers.clone();
    ordered_headers.remove(http::header::HOST);
    ordered_headers.remove(http::header::CONTENT_LENGTH);
    ordered_headers.insert(
        http::header::AUTHORIZATION,
        HeaderValue::from_str(&format!("Bearer {access_token}")).map_err(|err| {
            ProxyError::Internal(format!("invalid seller access token header: {err}"))
        })?,
    );
    ordered_headers.insert(
        "x-clawtip-indicator",
        HeaderValue::from_str(&pending.indicator)
            .map_err(|err| ProxyError::Internal(format!("invalid indicator header: {err}")))?,
    );
    ordered_headers.insert(
        "x-clawtip-order-no",
        HeaderValue::from_str(&pending.order_no)
            .map_err(|err| ProxyError::Internal(format!("invalid order header: {err}")))?,
    );
    ordered_headers.insert(
        "x-clawtip-pay-credential",
        HeaderValue::from_str(pay_credential)
            .map_err(|err| ProxyError::Internal(format!("invalid pay credential header: {err}")))?,
    );
    ordered_headers.insert(
        "x-clawtip-sm4-key",
        HeaderValue::from_str(&pending.sm4_key_base64)
            .map_err(|err| ProxyError::Internal(format!("invalid sm4 key header: {err}")))?,
    );
    let payment = listing_payment(&pending.listing)?;
    ordered_headers.insert(
        "x-clawtip-amount-fen",
        HeaderValue::from_str(&payment.amount_fen.to_string())
            .map_err(|err| ProxyError::Internal(format!("invalid amount header: {err}")))?,
    );
    ordered_headers.insert(
        "x-clawtip-pay-to",
        HeaderValue::from_str(&payment.pay_to)
            .map_err(|err| ProxyError::Internal(format!("invalid payTo header: {err}")))?,
    );
    if !ordered_headers.contains_key(http::header::CONTENT_TYPE) {
        ordered_headers.insert(
            http::header::CONTENT_TYPE,
            HeaderValue::from_static("application/json"),
        );
    }
    let body_bytes = serde_json::to_vec(body)
        .map_err(|err| ProxyError::InvalidRequest(format!("Invalid JSON body: {err}")))?;
    let upstream_proxy_url = super::http_client::get_current_proxy_url();

    log::info!(
        "[ClawTipMarket] 转发到卖家: provider={}, model={}, requestHash={}, orderNo={}, listing={}, sellerPubkey={}, endpoint={}",
        pending.provider_id,
        pending.model,
        pending.request_hash,
        pending.order_no,
        pending.listing.provider_id,
        pending.listing.seller_pubkey,
        endpoint
    );
    let response = super::hyper_client::send_request(
        uri,
        http::Method::POST,
        ordered_headers,
        extensions.clone(),
        body_bytes,
        timeout,
        upstream_proxy_url.as_deref(),
    )
    .await?;
    log::info!(
        "[ClawTipMarket] 卖家响应: provider={}, model={}, requestHash={}, orderNo={}, listing={}, status={}",
        pending.provider_id,
        pending.model,
        pending.request_hash,
        pending.order_no,
        pending.listing.provider_id,
        response.status()
    );
    Ok(response)
}

pub fn payment_required_response(order: &PendingMarketOrder) -> Result<ProxyResponse, ProxyError> {
    let payment = listing_payment(&order.listing)?;
    let body = json!({
        "type": "error",
        "error": {
            "type": "clawtip_payment_required",
            "message": "ClawTip payment required. Pay the order and retry the identical request.",
            "orderNo": order.order_no,
            "indicator": order.indicator,
            "amountFen": payment.amount_fen,
            "payTo": payment.pay_to,
            "orderFile": order.order_file,
            "sellerPubkey": order.listing.seller_pubkey,
            "listingId": order.listing.provider_id,
            "retryInstruction": "Pay this ClawTip order, then resend the identical request body through the same provider."
        }
    });
    let mut headers = HeaderMap::new();
    headers.insert(
        http::header::CONTENT_TYPE,
        HeaderValue::from_static("application/json"),
    );
    headers.insert(
        "x-clawtip-order-no",
        HeaderValue::from_str(&order.order_no)
            .map_err(|err| ProxyError::Internal(format!("invalid order header: {err}")))?,
    );
    headers.insert(
        "x-clawtip-indicator",
        HeaderValue::from_str(&order.indicator)
            .map_err(|err| ProxyError::Internal(format!("invalid indicator header: {err}")))?,
    );
    headers.insert(http::header::RETRY_AFTER, HeaderValue::from_static("0"));

    Ok(ProxyResponse::Synthetic {
        status: StatusCode::PAYMENT_REQUIRED,
        headers,
        body: Bytes::from(serde_json::to_vec(&body).map_err(|err| {
            ProxyError::Internal(format!("failed to serialize payment response: {err}"))
        })?),
    })
}

fn synthetic_market_error(
    status: StatusCode,
    error_type: &str,
    message: &str,
) -> Result<ProxyResponse, ProxyError> {
    let mut headers = HeaderMap::new();
    headers.insert(
        http::header::CONTENT_TYPE,
        HeaderValue::from_static("application/json"),
    );
    Ok(ProxyResponse::Synthetic {
        status,
        headers,
        body: Bytes::from(
            serde_json::to_vec(&json!({
                "type": "error",
                "error": {
                    "type": error_type,
                    "message": message,
                }
            }))
            .map_err(|err| {
                ProxyError::Internal(format!("failed to serialize market error: {err}"))
            })?,
        ),
    })
}

fn listing_payment(listing: &MarketListing) -> Result<&MarketPaymentListing, ProxyError> {
    listing
        .payment
        .as_ref()
        .filter(|payment| payment.provider == "clawtip")
        .ok_or_else(|| {
            ProxyError::InvalidRequest("seller listing missing ClawTip payment".to_string())
        })
}

fn generate_sm4_key_base64() -> String {
    general_purpose::STANDARD.encode(*uuid::Uuid::new_v4().as_bytes())
}

fn join_url(base: &str, endpoint: &str) -> String {
    format!(
        "{}/{}",
        base.trim_end_matches('/'),
        endpoint.trim_start_matches('/')
    )
}

fn mask_store_error(err: String) -> ProxyError {
    ProxyError::Internal(err)
}

fn hex_lower(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

#[allow(dead_code)]
fn _assert_adapter_still_claude() {
    let _adapter: Box<dyn ProviderAdapter> = Box::new(ClaudeAdapter::new());
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::{
        clawtip::listing::ListingStatus,
        market::{MarketModelPrice, MarketPaymentListing},
    };

    #[test]
    fn request_fingerprint_is_stable_and_model_sensitive() {
        let body = json!({"model":"claude-sonnet-4-5","messages":[{"role":"user","content":"hi"}]});
        let same = market_request_fingerprint("provider-1", "claude-sonnet-4-5", &body);
        let again = market_request_fingerprint("provider-1", "claude-sonnet-4-5", &body);
        let other_model = market_request_fingerprint("provider-1", "claude-haiku-4-5", &body);

        assert_eq!(same, again);
        assert_ne!(same, other_model);
    }

    #[tokio::test]
    async fn payment_required_response_does_not_expose_sm4_key() {
        let order = PendingMarketOrder {
            fingerprint: "fp".to_string(),
            provider_id: "provider-1".to_string(),
            model: "claude-sonnet-4-5".to_string(),
            request_hash: "hash".to_string(),
            order_no: "202604270001".to_string(),
            indicator: "indicator-1".to_string(),
            sm4_key_base64: "secret-sm4-key".to_string(),
            listing: sample_listing(),
            order_file: "/tmp/order.json".to_string(),
            created_at: 1,
            expires_at: 2,
        };

        let response = payment_required_response(&order).expect("response");
        assert_eq!(response.status(), StatusCode::PAYMENT_REQUIRED);
        assert_eq!(
            response.headers()["x-clawtip-order-no"],
            HeaderValue::from_static("202604270001")
        );

        let body = String::from_utf8(response.bytes().await.unwrap().to_vec()).unwrap();
        assert!(body.contains("clawtip_payment_required"));
        assert!(body.contains("202604270001"));
        assert!(!body.contains("secret-sm4-key"));
    }

    fn sample_listing() -> MarketListing {
        MarketListing {
            provider_id: "listing-1".to_string(),
            model_name: "claude-sonnet-4-5".to_string(),
            price_per_1k_tokens: 1,
            endpoint: "https://seller.example".to_string(),
            seller_pubkey: "seller-pubkey".to_string(),
            timestamp: 1,
            model_prices: vec![MarketModelPrice {
                model_id: "claude-sonnet-4-5".to_string(),
                enabled: true,
                input_price_per_1m_tokens: 1.0,
                output_price_per_1m_tokens: 2.0,
                cache_read_price_per_1m_tokens: None,
                cache_write_price_per_1m_tokens: None,
                currency: "USD".to_string(),
                unit: "PER_1M_TOKENS".to_string(),
                source: "test".to_string(),
                updated_at: 1,
            }],
            price_unit: "PER_1M_TOKENS".to_string(),
            price_version: 1,
            status: ListingStatus::Available,
            capacity: 1,
            streaming: true,
            payment: Some(MarketPaymentListing {
                provider: "clawtip".to_string(),
                mode: "per_call_prepaid".to_string(),
                amount_fen: 2,
                currency: "CNY_FEN".to_string(),
                skill_slug: "tokens-buddy-llm-console".to_string(),
                indicator: "indicator-1".to_string(),
                pay_to: "payto_1234567890abcdef".to_string(),
            }),
            resource_url: "https://seller.example".to_string(),
            amount_fen: 2,
            access_token: Some("seller-access-token".to_string()),
        }
    }
}
