use crate::services::market::MarketListing;
use crate::store::AppState;
use tauri::State;

#[tauri::command]
pub async fn start_cloudflare_tunnel(
    state: State<'_, AppState>,
    port: u16,
) -> Result<String, String> {
    state
        .market_service
        .start_tunnel(port)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn start_selling_tokens(
    state: State<'_, AppState>,
    #[allow(non_snake_case)] providerId: String,
    #[allow(non_snake_case)] modelName: String,
    price: u64,
    endpoint: String,
) -> Result<String, String> {
    let listing = MarketListing {
        provider_id: providerId,
        model_name: modelName,
        price_per_1k_tokens: price,
        endpoint,
        seller_pubkey: "".to_string(), // MarketService will sign it
        timestamp: chrono::Utc::now().timestamp() as u64,
    };

    state
        .market_service
        .start_selling(listing)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn find_ai_sellers(state: State<'_, AppState>) -> Result<Vec<MarketListing>, String> {
    state
        .market_service
        .find_sellers()
        .await
        .map_err(|e| e.to_string())
}
