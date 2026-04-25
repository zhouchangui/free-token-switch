use crate::services::clawtip::listing::{ClawtipListing, ListingStatus};
use nostr_sdk::prelude::*;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, Once};

static RUSTLS_CRYPTO_PROVIDER: Once = Once::new();

#[derive(Debug, Default)]
pub struct FakeRelay {
    listings: Mutex<Vec<ClawtipListing>>,
}

impl FakeRelay {
    pub fn publish(&self, mut listing: ClawtipListing) -> Result<String, String> {
        let mut listings = self
            .listings
            .lock()
            .map_err(|err| format!("fake relay lock failed: {err}"))?;
        let event_id = format!("fake-event-{}", listings.len() + 1);
        listing.relay_event_id = Some(event_id.clone());
        listings.push(listing);
        Ok(event_id)
    }

    pub fn find_available_clawtip_listings(&self) -> Vec<ClawtipListing> {
        self.listings
            .lock()
            .map(|listings| {
                listings
                    .iter()
                    .filter(|listing| {
                        listing.status == ListingStatus::Available
                            && listing.payment.provider == "clawtip"
                    })
                    .cloned()
                    .collect()
            })
            .unwrap_or_default()
    }
}

#[derive(Debug, Clone)]
pub struct LocalRelayRegistry {
    path: PathBuf,
}

impl LocalRelayRegistry {
    pub fn new(path: PathBuf) -> Self {
        Self { path }
    }

    pub fn default_path() -> PathBuf {
        crate::config::get_app_config_dir()
            .join("clawtip-console")
            .join("market")
            .join("listings.json")
    }

    pub fn publish(&self, mut listing: ClawtipListing) -> Result<String, String> {
        let mut listings = read_listings(&self.path)?;
        let event_id = listing
            .relay_event_id
            .clone()
            .unwrap_or_else(|| format!("local-relay-event-{}", listings.len() + 1));
        listing.relay_event_id = Some(event_id.clone());

        if let Some(existing) = listings
            .iter_mut()
            .find(|existing| existing.listing_id == listing.listing_id)
        {
            *existing = listing;
        } else {
            listings.push(listing);
        }

        write_listings(&self.path, &listings)?;
        Ok(event_id)
    }

    pub fn find_available_clawtip_listings(&self) -> Result<Vec<ClawtipListing>, String> {
        let listings = read_listings(&self.path)?;
        Ok(listings
            .into_iter()
            .filter(|listing| {
                listing.status == ListingStatus::Available && listing.payment.provider == "clawtip"
            })
            .collect())
    }

    pub fn all_listings(&self) -> Result<Vec<ClawtipListing>, String> {
        read_listings(&self.path)
    }

    pub fn update_status(
        &self,
        listing_id: &str,
        status: ListingStatus,
        timestamp: i64,
    ) -> Result<(), String> {
        let mut listings = read_listings(&self.path)?;
        let listing = listings
            .iter_mut()
            .find(|listing| listing.listing_id == listing_id)
            .ok_or_else(|| format!("listing not found: {listing_id}"))?;
        *listing = listing.with_status(status, timestamp);
        write_listings(&self.path, &listings)
    }
}

fn read_listings(path: &Path) -> Result<Vec<ClawtipListing>, String> {
    if !path.exists() {
        return Ok(Vec::new());
    }

    let raw = std::fs::read_to_string(path)
        .map_err(|err| format!("failed to read relay registry {}: {err}", path.display()))?;
    serde_json::from_str(&raw)
        .map_err(|err| format!("failed to parse relay registry {}: {err}", path.display()))
}

fn write_listings(path: &Path, listings: &[ClawtipListing]) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| format!("invalid relay registry path: {}", path.display()))?;
    std::fs::create_dir_all(parent).map_err(|err| {
        format!(
            "failed to create relay registry directory {}: {err}",
            parent.display()
        )
    })?;
    let content = serde_json::to_string_pretty(listings)
        .map_err(|err| format!("failed to serialize relay registry: {err}"))?;
    std::fs::write(path, content)
        .map_err(|err| format!("failed to write relay registry {}: {err}", path.display()))
}

#[derive(Debug, Clone)]
pub struct NostrRelayAdapter {
    relays: Vec<String>,
}

impl NostrRelayAdapter {
    pub fn new(relays: Vec<String>) -> Self {
        Self { relays }
    }

    pub fn default_relays() -> Vec<String> {
        vec![
            "wss://relay.damus.io".to_string(),
            "wss://nos.lol".to_string(),
        ]
    }

    pub async fn publish(&self, listing: ClawtipListing) -> Result<ClawtipListing, String> {
        ensure_rustls_crypto_provider();
        let keys = Keys::generate();
        let client = Client::new(keys.clone());
        add_relays(&client, &self.relays).await?;
        client.connect().await;

        let mut listing = listing;
        listing.seller_pubkey = keys.public_key().to_string();
        let content = serde_json::to_string(&listing)
            .map_err(|err| format!("failed to serialize Nostr listing: {err}"))?;
        let event_id = client
            .send_event_builder(EventBuilder::new(Kind::from(31990), content))
            .await
            .map_err(|err| format!("failed to publish Nostr listing: {err}"))?;
        listing.relay_event_id = Some(event_id.to_string());
        Ok(listing)
    }

    pub async fn find_available_clawtip_listings(&self) -> Result<Vec<ClawtipListing>, String> {
        ensure_rustls_crypto_provider();
        let keys = Keys::generate();
        let client = Client::new(keys);
        add_relays(&client, &self.relays).await?;
        client.connect().await;

        let events = client
            .fetch_events(
                Filter::new().kind(Kind::from(31990)).limit(50),
                std::time::Duration::from_secs(5),
            )
            .await
            .map_err(|err| format!("failed to fetch Nostr listings: {err}"))?;
        let mut listings = Vec::new();
        for event in events {
            if let Ok(mut listing) = serde_json::from_str::<ClawtipListing>(&event.content) {
                if listing.status == ListingStatus::Available
                    && listing.payment.provider == "clawtip"
                {
                    listing.relay_event_id = Some(event.id.to_string());
                    listings.push(listing);
                }
            }
        }
        Ok(listings)
    }
}

fn ensure_rustls_crypto_provider() {
    RUSTLS_CRYPTO_PROVIDER.call_once(|| {
        let _ = rustls::crypto::ring::default_provider().install_default();
    });
}

async fn add_relays(client: &Client, relays: &[String]) -> Result<(), String> {
    for relay in relays {
        client
            .add_relay(relay)
            .await
            .map_err(|err| format!("failed to add Nostr relay {relay}: {err}"))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::clawtip::listing::{ClawtipListing, ClawtipListingInput, ListingStatus};

    fn sample_listing(listing_id: &str, status: ListingStatus) -> ClawtipListing {
        ClawtipListing::new_available(ClawtipListingInput {
            listing_id: listing_id.to_string(),
            seller_id: "local-seller".to_string(),
            seller_pubkey: "npub-test".to_string(),
            model_id: "mock-llm".to_string(),
            amount_fen: 1,
            endpoint: "http://127.0.0.1:37891".to_string(),
            indicator: "indicator123".to_string(),
            timestamp: 1_777_111_200,
        })
        .with_status(status, 1_777_111_200)
    }

    #[test]
    fn fake_relay_publishes_and_filters_available_clawtip_listings() {
        let relay = FakeRelay::default();
        let available = sample_listing("one", ListingStatus::Available);
        let offline = sample_listing("two", ListingStatus::Offline);

        let event_id = relay.publish(available.clone()).expect("publish");
        relay.publish(offline).expect("publish offline");

        let results = relay.find_available_clawtip_listings();

        assert_eq!(event_id, "fake-event-1");
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].provider_id, available.provider_id);
        assert_eq!(results[0].status, ListingStatus::Available);
    }

    #[test]
    fn local_relay_registry_persists_listings_between_instances() {
        let temp_dir = tempfile::tempdir().expect("create temp dir");
        let registry_path = temp_dir.path().join("market").join("listings.json");
        let available = sample_listing("one", ListingStatus::Available);
        let offline = sample_listing("two", ListingStatus::Offline);

        let first_registry = LocalRelayRegistry::new(registry_path.clone());
        let event_id = first_registry.publish(available.clone()).expect("publish");
        first_registry.publish(offline).expect("publish offline");

        let second_registry = LocalRelayRegistry::new(registry_path);
        let results = second_registry
            .find_available_clawtip_listings()
            .expect("read available listings");

        assert_eq!(event_id, "local-relay-event-1");
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].provider_id, available.provider_id);
        assert_eq!(
            results[0].relay_event_id.as_deref(),
            Some("local-relay-event-1")
        );
    }

    #[test]
    fn local_relay_registry_updates_listing_status() {
        let temp_dir = tempfile::tempdir().expect("create temp dir");
        let registry_path = temp_dir.path().join("market").join("listings.json");
        let registry = LocalRelayRegistry::new(registry_path);
        registry
            .publish(sample_listing("one", ListingStatus::Available))
            .expect("publish");

        registry
            .update_status("one", ListingStatus::Busy, 1_777_111_400)
            .expect("update status");
        let available = registry
            .find_available_clawtip_listings()
            .expect("list available");
        let all = registry.all_listings().expect("read all");

        assert!(available.is_empty());
        assert_eq!(all[0].status, ListingStatus::Busy);
        assert_eq!(all[0].updated_at, 1_777_111_400);
    }
}
