# ClawTip Console Relay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first executable P2-0 slice for TokensBuddy: local ClawTip order-file paths, structured process logs, relay-compatible listing data, and a console entry that can publish/list/buy/wait/call through a local persistent relay registry before final real ClawTip key validation.

**Architecture:** Add a focused `src-tauri/src/services/clawtip/` module with small files for order paths, process logging, listing schemas, relay abstraction, SM4 credential handling, mock LLM fulfillment, and seller inspection views. Add `src-tauri/src/bin/clawtip-console.rs` as a thin CLI shell over the service. The first slice uses a local JSON relay registry so separate console commands can publish and discover listings deterministically; `--real-relay` uses the same listing shape with Nostr `kind 31990`.

**Tech Stack:** Rust 2021, serde/serde_json, dirs, uuid, chrono, nostr-compatible listing JSON, cargo tests.

---

## File Structure

- Create `src-tauri/src/services/clawtip/mod.rs`: public module exports.
- Create `src-tauri/src/services/clawtip/order_file.rs`: TokensBuddy ClawTip order directory and order-file path helpers.
- Create `src-tauri/src/services/clawtip/process_log.rs`: structured process log events with redaction.
- Create `src-tauri/src/services/clawtip/config.rs`: seller config initialization with env references.
- Create `src-tauri/src/services/clawtip/crypto.rs`: SM4 encrypted_data helpers for ClawTip order payloads.
- Create `src-tauri/src/services/clawtip/credential.rs`: mock/real payCredential decrypt and verification helpers.
- Create `src-tauri/src/services/clawtip/mock_llm.rs`: deterministic mock stream response and usage.
- Create `src-tauri/src/services/clawtip/fulfillment.rs`: local idempotent fulfillment registry.
- Create `src-tauri/src/services/clawtip/listing.rs`: relay-compatible ClawTip listing structs and builders.
- Create `src-tauri/src/services/clawtip/relay.rs`: fake relay adapter plus local persistent relay registry for deterministic console/testing.
- Create `src-tauri/src/bin/clawtip-console.rs`: console entry with `seller init-config/publish/unpublish/orders/order/status/relays`, `buyer list/buy/wait-payment/call`, and `dev order-path/mock-pay`.
- Modify `src-tauri/src/services/mod.rs`: export `clawtip`.
- Modify `src-tauri/Cargo.toml`: register the `clawtip-console` binary if Cargo does not auto-detect it.
- Modify `package.json`: add `clawtip:console`.
- Modify `docs/superpowers/specs/2026-04-25-clawtip-console-buy-sell-design.md`: keep TokensBuddy path and logging decisions current.

## Task 1: TokensBuddy Order Path and Process Logs

**Files:**

- Create: `src-tauri/src/services/clawtip/mod.rs`
- Create: `src-tauri/src/services/clawtip/order_file.rs`
- Create: `src-tauri/src/services/clawtip/process_log.rs`
- Modify: `src-tauri/src/services/mod.rs`

- [x] **Step 1: Write failing tests**

Add tests in `order_file.rs` and `process_log.rs`:

```rust
#[test]
fn default_orders_dir_uses_tokens_buddy_app_state() {
    let dir = default_tokens_buddy_orders_dir_for_home(std::path::Path::new("/Users/tester"));
    assert_eq!(
        dir,
        std::path::PathBuf::from("/Users/tester/.tokens-buddy/clawtip-console/orders")
    );
}

#[test]
fn order_file_path_places_order_under_indicator() {
    let path = order_file_path(
        std::path::Path::new("/Users/tester/.tokens-buddy/clawtip-console/orders"),
        "abc123",
        "202604250001",
    );
    assert_eq!(
        path,
        std::path::PathBuf::from(
            "/Users/tester/.tokens-buddy/clawtip-console/orders/abc123/202604250001.json"
        )
    );
}

#[test]
fn process_log_redacts_sensitive_fields() {
    let event = ProcessLogEvent::new("clawtip.config.loaded")
        .field("payTo", "payto_1234567890abcdef")
        .field("sm4key", "secret-key")
        .field("payCredential", "credential-secret");

    let rendered = event.to_json_line();

    assert!(rendered.contains("clawtip.config.loaded"));
    assert!(rendered.contains("payto_12***cdef"));
    assert!(!rendered.contains("secret-key"));
    assert!(!rendered.contains("credential-secret"));
}
```

- [x] **Step 2: Run tests and verify they fail**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml clawtip -- --nocapture
```

Expected: compile failure because the `clawtip` module and helpers do not exist.

- [x] **Step 3: Implement minimal helpers**

Implement:

```rust
pub fn default_tokens_buddy_orders_dir_for_home(home: &Path) -> PathBuf;
pub fn default_tokens_buddy_orders_dir() -> PathBuf;
pub fn order_file_path(base: &Path, indicator: &str, order_no: &str) -> PathBuf;

pub struct ProcessLogEvent { ... }
impl ProcessLogEvent {
    pub fn new(event: impl Into<String>) -> Self;
    pub fn field(self, key: impl Into<String>, value: impl Into<String>) -> Self;
    pub fn to_json_line(&self) -> String;
}
```

Sensitive keys are `sm4key`, `sm4_key`, `sm4_key_base64`, `payCredential`, `pay_credential`, `encrypted_data`, `encryptedData`, `credential`, and `secret`.

- [x] **Step 4: Run tests and verify they pass**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml clawtip -- --nocapture
```

Expected: TokensBuddy order path and process log tests pass.

## Task 2: Relay-Compatible Listing Shape

**Files:**

- Create: `src-tauri/src/services/clawtip/listing.rs`

- [x] **Step 1: Write failing tests**

Add tests:

```rust
#[test]
fn listing_json_keeps_existing_market_fields_and_clawtip_extensions() {
    let listing = ClawtipListing::new_available(ClawtipListingInput {
        listing_id: "local-mock-llm".to_string(),
        seller_id: "local-seller".to_string(),
        seller_pubkey: "npub-test".to_string(),
        model_id: "mock-llm".to_string(),
        amount_fen: 1,
        endpoint: "http://127.0.0.1:37891".to_string(),
        indicator: "indicator123".to_string(),
        timestamp: 1777111200,
    });

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
}

#[test]
fn listing_status_update_preserves_identity_and_changes_timestamp() {
    let listing = ClawtipListing::new_available(...);
    let busy = listing.with_status(ListingStatus::Busy, 1777111300);

    assert_eq!(busy.provider_id, listing.provider_id);
    assert_eq!(busy.payment.provider, "clawtip");
    assert_eq!(busy.status, ListingStatus::Busy);
    assert_eq!(busy.timestamp, 1777111300);
}
```

- [x] **Step 2: Run tests and verify they fail**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml clawtip::listing -- --nocapture
```

Expected: compile failure because listing types are missing.

- [x] **Step 3: Implement listing structs**

Implement `ClawtipListing`, `ClawtipPaymentListing`, `ListingStatus`, and `ClawtipListingInput` with serde names matching the spec.

- [x] **Step 4: Run tests and verify they pass**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml clawtip::listing -- --nocapture
```

Expected: listing tests pass.

## Task 3: Fake Relay Adapter, Local Registry, and Console Skeleton

**Files:**

- Create: `src-tauri/src/services/clawtip/relay.rs`
- Create: `src-tauri/src/bin/clawtip-console.rs`
- Modify: `package.json`

- [x] **Step 1: Write failing tests**

Add tests in `relay.rs`:

```rust
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
}
```

- [x] **Step 2: Run tests and verify they fail**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml clawtip::relay -- --nocapture
```

Expected: compile failure because `FakeRelay` does not exist.

- [x] **Step 3: Implement fake relay and CLI**

Implement:

```rust
pub struct FakeRelay { ... }
impl FakeRelay {
    pub fn publish(&self, listing: ClawtipListing) -> Result<String, String>;
    pub fn find_available_clawtip_listings(&self) -> Vec<ClawtipListing>;
}

pub struct LocalRelayRegistry { ... }
impl LocalRelayRegistry {
    pub fn publish(&self, listing: ClawtipListing) -> Result<String, String>;
    pub fn find_available_clawtip_listings(&self) -> Result<Vec<ClawtipListing>, String>;
}
```

CLI commands:

```bash
pnpm clawtip:console -- dev order-path --indicator abc --order-no 001
pnpm clawtip:console -- seller publish --model mock-llm --amount-fen 1 --endpoint http://127.0.0.1:37891
pnpm clawtip:console -- buyer list
```

Each command prints process-log JSON lines.

- [x] **Step 4: Run tests and smoke commands**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml clawtip -- --nocapture
pnpm clawtip:console -- dev order-path --indicator abc --order-no 001
```

Expected: tests pass and CLI prints a `.tokens-buddy/clawtip-console/orders/abc/001.json` path plus redacted structured logs.

## First Slice Completion Checklist

- [x] Spec records TokensBuddy as an independent app runtime.
- [x] Scheme B is recorded as confirmed.
- [x] Process log requirements are documented and implemented in the first helper.
- [x] Rust tests cover TokensBuddy order path, redaction, listing JSON compatibility, and fake relay filtering.
- [x] Rust tests cover SM4 encrypted_data generation and redaction of `sm4key`.
- [x] Local relay registry persists listings across separate console command invocations.
- [x] `seller publish` and `buyer list` can share a `--relay-store` JSON registry.
- [x] Optional `--real-relay` adapter can publish/list ClawTip listing through Nostr `kind 31990`.
- [x] `seller init-config` writes TokensBuddy-local config with env references.
- [x] `dev mock-pay` writes ClawTip-shaped `payCredential` to the order file.
- [x] `buyer wait-payment` detects `payCredential`.
- [x] `buyer call` decrypts/verifies `payCredential`, returns mock LLM output, and records idempotent fulfillment.
- [x] `seller orders` lists local order files without exposing `payCredential`, `encrypted_data`, or full `payTo`.
- [x] `seller order` shows one order's payment verification status and fulfillment status.
- [x] `seller status` summarizes listing and order counts.
- [x] `seller relays` prints the active relay list for real relay validation planning.
- [x] `pnpm clawtip:console -- dev order-path --indicator abc --order-no 001` works.
- [x] `cargo fmt --check --manifest-path src-tauri/Cargo.toml` passes.
- [x] `cargo test --manifest-path src-tauri/Cargo.toml clawtip -- --nocapture` passes.
- [x] `cargo clippy --manifest-path src-tauri/Cargo.toml --bin clawtip-console --lib -- -D warnings` passes.
- [x] Full local console smoke flow passes after the final seller inspection commands are wired.

## Real-World Validation Completed

- [x] Configure real `CLAWTIP_PAY_TO` through local `.env` without committing secrets.
- [x] Configure real `CLAWTIP_SM4_KEY` through local `.env` without committing secrets.
- [x] Run `buyer buy` with real ClawTip payment instead of `dev mock-pay`.
- [x] Confirm real `payCredential` decrypts with the Rust SM4 implementation.
- [x] Confirm payment status, amount, payTo, and orderNo verification passes against the real credential.
- [x] Confirm `finishTime` can be absent in a real credential and credential verification still passes.
- [x] Run `seller publish --real-relay` / `buyer list --real-relay` against `wss://relay.damus.io`.
- [x] Confirm `rustls` crypto provider initialization avoids Nostr relay runtime panic.

## Remaining Integration Work

- [ ] Persist seller Nostr identity instead of generating a temporary key for each real relay publish.
- [ ] Implement real relay status updates for `reserved`, `busy`, `available`, and `offline`.
- [ ] Let `buyer buy` resolve `amount_fen`, `pay_to`, endpoint, and indicator directly from the selected listing.
- [ ] Add seller HTTP/Tauri integration points so market UI and proxy call the same Rust service logic as console.
- [ ] Replace mock LLM with the real proxy path after paid-call verification.
