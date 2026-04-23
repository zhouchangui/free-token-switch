use axum::{
    body::Body,
    http::{Request, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
};
use serde_json::json;
use crate::proxy::server::ProxyState;

/// X402 支付中间件
/// 
/// 检查请求是否来自外部，如果是外部请求则强制要求支付凭证 (L402)
pub async fn x402_middleware(
    state: axum::extract::State<ProxyState>,
    req: Request<Body>,
    next: Next,
) -> Response {
    let config = state.config.read().await;
    
    // 1. 如果 P2P 市场未开启，直接放行 (内部使用模式)
    if !config.p2p_market.enabled {
        return next.run(req).await;
    }

    // 2. 检查请求是否来自外部 (这里简单通过 host 或 headers 判断)
    // 在生产环境中，我们通常通过远程地址或 Cloudflare 头部来判断
    let is_external = req.headers().contains_key("x-forwarded-for") 
                   || req.headers().get("host").map_or(false, |h| !h.to_str().unwrap_or("").contains("localhost"));

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
    let mock_invoice = format!("lnbc{}...mock_invoice_for_{}_sats", 
                              config.p2p_market.price_per_1k_tokens, 
                              config.p2p_market.price_per_1k_tokens);

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
