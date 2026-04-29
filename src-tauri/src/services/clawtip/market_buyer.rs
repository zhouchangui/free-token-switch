use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::services::clawtip::listing::ListingStatus;
use crate::services::market::MarketListing;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PendingMarketOrder {
    pub fingerprint: String,
    pub provider_id: String,
    pub model: String,
    pub request_hash: String,
    pub order_no: String,
    pub indicator: String,
    pub sm4_key_base64: String,
    pub listing: MarketListing,
    pub order_file: String,
    pub created_at: i64,
    pub expires_at: i64,
}

#[derive(Debug, Clone)]
pub struct PendingMarketOrderStore {
    dir: PathBuf,
}

impl PendingMarketOrderStore {
    pub fn new(dir: PathBuf) -> Self {
        Self { dir }
    }

    pub fn default_app() -> Self {
        Self::new(default_pending_market_orders_dir())
    }

    pub fn get(&self, fingerprint: &str) -> Result<Option<PendingMarketOrder>, String> {
        let path = self.path_for(fingerprint);
        if !path.exists() {
            return Ok(None);
        }

        let raw = std::fs::read_to_string(&path)
            .map_err(|err| format!("failed to read pending market order: {err}"))?;
        serde_json::from_str(&raw)
            .map(Some)
            .map_err(|err| format!("failed to parse pending market order: {err}"))
    }

    pub fn put(&self, record: &PendingMarketOrder) -> Result<(), String> {
        std::fs::create_dir_all(&self.dir)
            .map_err(|err| format!("failed to create pending market order dir: {err}"))?;
        let content = serde_json::to_string_pretty(record)
            .map_err(|err| format!("failed to serialize pending market order: {err}"))?;
        std::fs::write(self.path_for(&record.fingerprint), content)
            .map_err(|err| format!("failed to write pending market order: {err}"))
    }

    pub fn remove_expired(&self, now: i64) -> Result<usize, String> {
        if !self.dir.exists() {
            return Ok(0);
        }

        let mut removed = 0usize;
        for entry in std::fs::read_dir(&self.dir)
            .map_err(|err| format!("failed to read pending market order dir: {err}"))?
        {
            let entry =
                entry.map_err(|err| format!("failed to read pending market order entry: {err}"))?;
            let path = entry.path();
            if path.extension().and_then(|value| value.to_str()) != Some("json") {
                continue;
            }
            let raw = match std::fs::read_to_string(&path) {
                Ok(value) => value,
                Err(_) => continue,
            };
            let Ok(record) = serde_json::from_str::<PendingMarketOrder>(&raw) else {
                continue;
            };
            if record.expires_at <= now {
                std::fs::remove_file(&path)
                    .map_err(|err| format!("failed to remove pending market order: {err}"))?;
                removed += 1;
            }
        }
        Ok(removed)
    }

    fn path_for(&self, fingerprint: &str) -> PathBuf {
        self.dir
            .join(format!("{}.json", safe_file_stem(fingerprint)))
    }
}

pub fn default_pending_market_orders_dir() -> PathBuf {
    crate::config::get_app_config_dir()
        .join("clawtip-console")
        .join("market-buyer")
        .join("pending")
}

pub fn select_seller_for_model(listings: &[MarketListing], model: &str) -> Option<MarketListing> {
    let mut candidates = listings
        .iter()
        .filter(|listing| listing_is_usable_for_model(listing, model))
        .cloned()
        .collect::<Vec<_>>();

    candidates.sort_by(|left, right| {
        effective_amount_fen(left)
            .cmp(&effective_amount_fen(right))
            .then_with(|| right.timestamp.cmp(&left.timestamp))
    });

    candidates.into_iter().next()
}

pub fn listing_is_usable_for_model(listing: &MarketListing, model: &str) -> bool {
    listing.status == ListingStatus::Available
        && listing.capacity == 1
        && !listing.resource_url.trim().is_empty()
        && listing
            .access_token
            .as_deref()
            .is_some_and(|value| !value.trim().is_empty())
        && listing.payment.as_ref().is_some_and(|payment| {
            payment.provider == "clawtip"
                && payment.amount_fen > 0
                && !payment.indicator.trim().is_empty()
                && !payment.pay_to.trim().is_empty()
        })
        && model_matches_listing(listing, model)
}

fn model_matches_listing(listing: &MarketListing, model: &str) -> bool {
    if listing.model_name.eq_ignore_ascii_case(model) {
        return true;
    }

    listing
        .model_prices
        .iter()
        .any(|price| price.enabled && price.model_id.eq_ignore_ascii_case(model))
}

fn effective_amount_fen(listing: &MarketListing) -> i64 {
    listing
        .payment
        .as_ref()
        .map(|payment| payment.amount_fen)
        .unwrap_or(listing.amount_fen)
}

fn safe_file_stem(value: &str) -> String {
    value
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
                ch
            } else {
                '_'
            }
        })
        .collect()
}

#[allow(dead_code)]
fn _assert_path_send_sync(_: &Path) {}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::clawtip::listing::ListingStatus;
    use crate::services::market::{MarketListing, MarketModelPrice, MarketPaymentListing};

    fn sample_listing() -> MarketListing {
        MarketListing {
            provider_id: "provider-1".to_string(),
            model_name: "claude-sonnet-4-6".to_string(),
            price_per_1k_tokens: 10,
            endpoint: "https://seller.example.com".to_string(),
            seller_pubkey: "seller-pubkey".to_string(),
            timestamp: 100,
            model_prices: vec![MarketModelPrice {
                model_id: "claude-sonnet-4-6".to_string(),
                enabled: true,
                input_price_per_1m_tokens: 3.0,
                output_price_per_1m_tokens: 15.0,
                cache_read_price_per_1m_tokens: None,
                cache_write_price_per_1m_tokens: None,
                currency: "USD".to_string(),
                unit: "PER_1M_TOKENS".to_string(),
                source: "openrouter".to_string(),
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
                amount_fen: 3,
                currency: "CNY_FEN".to_string(),
                skill_slug: "tokens-buddy-llm-console".to_string(),
                indicator: "tokens-buddy-provider-1".to_string(),
                pay_to: "payto_abc".to_string(),
            }),
            resource_url: "https://seller.example.com".to_string(),
            amount_fen: 3,
            access_token: Some("seller-token".to_string()),
        }
    }

    #[test]
    fn pending_order_store_roundtrips_and_expires_records() {
        let temp = tempfile::tempdir().expect("temp dir");
        let store = PendingMarketOrderStore::new(temp.path().to_path_buf());
        let record = PendingMarketOrder {
            fingerprint: "fp-1".to_string(),
            provider_id: "market-provider".to_string(),
            model: "claude-sonnet-4-6".to_string(),
            request_hash: "hash-1".to_string(),
            order_no: "202604270001".to_string(),
            indicator: "tokens-buddy-provider-1".to_string(),
            sm4_key_base64: "MDEyMzQ1Njc4OUFCQ0RFRg==".to_string(),
            listing: sample_listing(),
            order_file: "/tmp/order.json".to_string(),
            created_at: 10,
            expires_at: 20,
        };

        store.put(&record).expect("write pending order");

        let loaded = store.get("fp-1").expect("read pending order");
        assert_eq!(
            loaded.as_ref().map(|value| value.order_no.as_str()),
            Some("202604270001")
        );

        let removed = store.remove_expired(21).expect("remove expired");
        assert_eq!(removed, 1);
        assert!(store.get("fp-1").expect("read after expiry").is_none());
    }

    #[test]
    fn resolver_selects_available_clawtip_listing_by_model_price_and_timestamp() {
        let mut expensive = sample_listing();
        expensive.amount_fen = 8;
        expensive.payment.as_mut().unwrap().amount_fen = 8;
        expensive.timestamp = 200;

        let mut cheap_old = sample_listing();
        cheap_old.provider_id = "cheap-old".to_string();
        cheap_old.amount_fen = 2;
        cheap_old.payment.as_mut().unwrap().amount_fen = 2;
        cheap_old.timestamp = 100;

        let mut cheap_new = cheap_old.clone();
        cheap_new.provider_id = "cheap-new".to_string();
        cheap_new.timestamp = 300;

        let selected =
            select_seller_for_model(&[expensive, cheap_old, cheap_new], "claude-sonnet-4-6")
                .expect("select seller");

        assert_eq!(selected.provider_id, "cheap-new");
    }

    #[test]
    fn resolver_rejects_listing_without_access_token() {
        let mut listing = sample_listing();
        listing.access_token = None;

        let selected = select_seller_for_model(&[listing], "claude-sonnet-4-6");

        assert!(selected.is_none());
    }
}
