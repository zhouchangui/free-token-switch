use crate::services::market::{
    CloudflaredCheckResult, MarketListing, MarketModelPrice, MarketPaymentListing, MarketService,
    SellerPricingSuggestion, SellerRuntimeStatus,
};
use crate::store::AppState;
use serde::Deserialize;
use tauri::State;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartSellingTokensRequest {
    provider_id: String,
    model_name: String,
    price: u64,
    endpoint: String,
    model_prices: Option<Vec<MarketModelPrice>>,
    price_unit: Option<String>,
    price_version: Option<u32>,
    amount_fen: Option<i64>,
    pay_to: Option<String>,
    indicator: Option<String>,
    access_token: Option<String>,
}

#[tauri::command]
pub async fn start_cloudflare_tunnel(
    state: State<'_, AppState>,
    port: u16,
) -> Result<String, String> {
    log::info!("收到启动 Cloudflare 隧道请求: port={}", port);
    match state.market_service.start_tunnel(port).await {
        Ok(url) => {
            log::info!("Cloudflare 隧道请求完成: port={}, url={}", port, url);
            Ok(url)
        }
        Err(e) => {
            log::error!("Cloudflare 隧道请求失败: port={}, error={}", port, e);
            Err(e.to_string())
        }
    }
}

#[tauri::command]
pub async fn check_cloudflared() -> Result<CloudflaredCheckResult, String> {
    Ok(MarketService::check_cloudflared())
}

#[tauri::command]
pub async fn start_selling_tokens(
    state: State<'_, AppState>,
    input: StartSellingTokensRequest,
) -> Result<String, String> {
    log::info!(
        "收到市场发布请求: provider_id={}, model_name={}, price_per_1k_tokens={}, endpoint={}",
        input.provider_id,
        input.model_name,
        input.price,
        input.endpoint
    );
    let amount_fen = input
        .amount_fen
        .unwrap_or_else(|| input.price.max(1) as i64);
    let indicator = input
        .indicator
        .unwrap_or_else(|| format!("tokens-buddy-{}", input.provider_id));
    let pay_to = input.pay_to.unwrap_or_default();
    let listing = MarketListing {
        provider_id: input.provider_id,
        model_name: input.model_name,
        price_per_1k_tokens: input.price,
        endpoint: input.endpoint.clone(),
        seller_pubkey: "".to_string(), // MarketService will sign it
        timestamp: chrono::Utc::now().timestamp() as u64,
        model_prices: input.model_prices.unwrap_or_default(),
        price_unit: input
            .price_unit
            .unwrap_or_else(|| "PER_1M_TOKENS".to_string()),
        price_version: input.price_version.unwrap_or(1),
        status: crate::services::clawtip::listing::ListingStatus::Available,
        capacity: 1,
        streaming: true,
        payment: Some(MarketPaymentListing {
            provider: "clawtip".to_string(),
            mode: "per_call_prepaid".to_string(),
            amount_fen,
            currency: "CNY_FEN".to_string(),
            skill_slug: "tokens-buddy-llm-console".to_string(),
            indicator,
            pay_to,
        }),
        resource_url: input.endpoint,
        amount_fen,
        access_token: input.access_token,
    };

    match state.market_service.start_selling(listing).await {
        Ok(event_id) => {
            log::info!("市场发布完成: event_id={}", event_id);
            Ok(event_id)
        }
        Err(e) => {
            log::error!("市场发布失败: error={}", e);
            Err(e.to_string())
        }
    }
}

#[tauri::command]
pub async fn find_ai_sellers(state: State<'_, AppState>) -> Result<Vec<MarketListing>, String> {
    state
        .market_service
        .find_sellers()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn stop_selling_tokens(
    state: State<'_, AppState>,
    #[allow(non_snake_case)] providerId: String,
) -> Result<bool, String> {
    log::info!("收到停止售卖请求: provider_id={}", providerId);
    state
        .market_service
        .stop_selling(&providerId)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn generate_seller_access_token(
    #[allow(non_snake_case)] providerId: String,
) -> Result<String, String> {
    log::info!("生成分享访问令牌: provider_id={}", providerId);
    Ok(MarketService::generate_and_register_access_token_for(
        &providerId,
    ))
}

#[tauri::command]
pub async fn get_suggested_seller_price(
    #[allow(non_snake_case)] providerId: String,
    #[allow(non_snake_case)] modelName: Option<String>,
) -> Result<SellerPricingSuggestion, String> {
    Ok(MarketService::suggest_price_for_model(
        &providerId,
        modelName.as_deref(),
    ))
}

#[tauri::command]
pub async fn get_seller_runtime_status(
    state: State<'_, AppState>,
    #[allow(non_snake_case)] providerId: String,
) -> Result<SellerRuntimeStatus, String> {
    Ok(state
        .market_service
        .seller_runtime_status(&providerId)
        .await)
}
