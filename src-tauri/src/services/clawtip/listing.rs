use serde::{Deserialize, Serialize};

#[derive(Debug, Clone)]
pub struct ClawtipListingInput {
    pub listing_id: String,
    pub seller_id: String,
    pub seller_pubkey: String,
    pub model_id: String,
    pub amount_fen: i64,
    pub endpoint: String,
    pub indicator: String,
    pub timestamp: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ListingStatus {
    Available,
    Reserved,
    Busy,
    Offline,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClawtipPaymentListing {
    pub provider: String,
    pub mode: String,
    pub amount_fen: i64,
    pub currency: String,
    pub skill_slug: String,
    pub indicator: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ClawtipListing {
    pub provider_id: String,
    pub model_name: String,
    pub price_per_1k_tokens: i64,
    pub endpoint: String,
    pub seller_pubkey: String,
    pub timestamp: i64,
    #[serde(rename = "modelPrices")]
    pub model_prices: Vec<serde_json::Value>,
    #[serde(rename = "priceUnit")]
    pub price_unit: String,
    #[serde(rename = "priceVersion")]
    pub price_version: u32,
    #[serde(rename = "relayEventId", skip_serializing_if = "Option::is_none")]
    pub relay_event_id: Option<String>,
    #[serde(rename = "listingId")]
    pub listing_id: String,
    #[serde(rename = "sellerId")]
    pub seller_id: String,
    #[serde(rename = "modelId")]
    pub model_id: String,
    #[serde(rename = "amountFen")]
    pub amount_fen: i64,
    pub status: ListingStatus,
    pub capacity: u32,
    pub streaming: bool,
    pub payment: ClawtipPaymentListing,
    #[serde(rename = "resourceUrl")]
    pub resource_url: String,
    #[serde(rename = "createdAt")]
    pub created_at: i64,
    #[serde(rename = "updatedAt")]
    pub updated_at: i64,
}

impl ClawtipListing {
    pub fn new_available(input: ClawtipListingInput) -> Self {
        Self {
            provider_id: input.listing_id.clone(),
            model_name: input.model_id.clone(),
            price_per_1k_tokens: input.amount_fen,
            endpoint: input.endpoint.clone(),
            seller_pubkey: input.seller_pubkey.clone(),
            timestamp: input.timestamp,
            model_prices: Vec::new(),
            price_unit: "PER_CALL".to_string(),
            price_version: 1,
            relay_event_id: None,
            listing_id: input.listing_id,
            seller_id: input.seller_id,
            model_id: input.model_id,
            amount_fen: input.amount_fen,
            status: ListingStatus::Available,
            capacity: 1,
            streaming: true,
            payment: ClawtipPaymentListing {
                provider: "clawtip".to_string(),
                mode: "per_call_prepaid".to_string(),
                amount_fen: input.amount_fen,
                currency: "CNY_FEN".to_string(),
                skill_slug: "tokens-buddy-llm-console".to_string(),
                indicator: input.indicator,
            },
            resource_url: input.endpoint,
            created_at: input.timestamp,
            updated_at: input.timestamp,
        }
    }

    pub fn with_status(&self, status: ListingStatus, timestamp: i64) -> Self {
        let mut listing = self.clone();
        listing.status = status;
        listing.timestamp = timestamp;
        listing.updated_at = timestamp;
        listing
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_input(listing_id: &str) -> ClawtipListingInput {
        ClawtipListingInput {
            listing_id: listing_id.to_string(),
            seller_id: "local-seller".to_string(),
            seller_pubkey: "npub-test".to_string(),
            model_id: "mock-llm".to_string(),
            amount_fen: 1,
            endpoint: "http://127.0.0.1:37891".to_string(),
            indicator: "indicator123".to_string(),
            timestamp: 1_777_111_200,
        }
    }

    #[test]
    fn listing_json_keeps_existing_market_fields_and_clawtip_extensions() {
        let listing = ClawtipListing::new_available(sample_input("local-mock-llm"));

        let value = serde_json::to_value(&listing).expect("serialize listing");

        assert_eq!(value["provider_id"], "local-mock-llm");
        assert_eq!(value["model_name"], "mock-llm");
        assert_eq!(value["price_per_1k_tokens"], 1);
        assert_eq!(value["endpoint"], "http://127.0.0.1:37891");
        assert_eq!(value["seller_pubkey"], "npub-test");
        assert_eq!(value["status"], "available");
        assert_eq!(value["capacity"], 1);
        assert_eq!(value["payment"]["provider"], "clawtip");
        assert_eq!(value["payment"]["mode"], "per_call_prepaid");
        assert_eq!(value["payment"]["indicator"], "indicator123");
        assert_eq!(value["priceUnit"], "PER_CALL");
        assert_eq!(value["priceVersion"], 1);
    }

    #[test]
    fn listing_status_update_preserves_identity_and_changes_timestamp() {
        let listing = ClawtipListing::new_available(sample_input("local-mock-llm"));

        let busy = listing.with_status(ListingStatus::Busy, 1_777_111_300);

        assert_eq!(busy.provider_id, listing.provider_id);
        assert_eq!(busy.model_name, listing.model_name);
        assert_eq!(busy.payment.provider, "clawtip");
        assert_eq!(busy.status, ListingStatus::Busy);
        assert_eq!(busy.timestamp, 1_777_111_300);
    }
}
