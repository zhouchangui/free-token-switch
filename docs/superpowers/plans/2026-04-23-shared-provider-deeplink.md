# Shared Provider Deep Link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a seller-side share link button that generates a `ccswitch://` provider import URL, then let recipients confirm import, fetch/select models, and add the shared provider to their list without auto-enabling it.

**Architecture:** Reuse the existing `provider` deeplink protocol and import pipeline, extending it with shared-provider fields plus a dedicated confirmation branch in the import dialog. The seller popover generates the share URL from persisted endpoint/token data; the import dialog resolves shared-provider links by fetching models before import, then persists the chosen model into a normal provider import request.

**Tech Stack:** React 18, TypeScript, Vitest, Tauri deeplink parser/import commands in Rust, existing model-fetch command, i18next, Radix dialogs/popovers.

---

## File Structure

- Modify: `src/components/providers/ProviderSellerPopover.tsx`
  Responsibility: expose share actions and generate a `ccswitch://...` shared-provider link.
- Modify: `src/components/providers/__tests__/ProviderSellerPopover.test.tsx`
  Responsibility: verify share-link generation and copy behavior without losing existing seller tests.
- Modify: `src/lib/api/deeplink.ts`
  Responsibility: extend request typing for shared-provider fields.
- Modify: `src/components/DeepLinkImportDialog.tsx`
  Responsibility: route shared-provider requests through model-fetch validation and confirmation state.
- Create: `src/components/deeplink/SharedProviderConfirmation.tsx`
  Responsibility: render the shared-provider confirmation UI with required model selection.
- Modify: `src-tauri/src/deeplink/mod.rs`
  Responsibility: extend `DeepLinkImportRequest` with shared-provider fields.
- Modify: `src-tauri/src/deeplink/parser.rs`
  Responsibility: parse the new shared-provider fields from the deeplink URL.
- Modify: `src-tauri/src/deeplink/provider.rs`
  Responsibility: import the selected shared-provider model and metadata while keeping `enabled=false`.
- Modify: `src-tauri/src/deeplink/tests.rs`
  Responsibility: parser/import regression coverage for shared-provider links.
- Modify: `src/i18n/locales/zh.json`
- Modify: `src/i18n/locales/en.json`
- Modify: `src/i18n/locales/ja.json`
  Responsibility: seller share-link copy strings and shared-provider confirmation strings.

## Task 1: Extend Shared-Provider Deep Link Schema

**Files:**
- Modify: `src/lib/api/deeplink.ts`
- Modify: `src-tauri/src/deeplink/mod.rs`
- Modify: `src-tauri/src/deeplink/parser.rs`
- Test: `src-tauri/src/deeplink/tests.rs`

- [ ] **Step 1: Write the failing parser test**

```rust
#[test]
fn test_parse_shared_provider_deeplink() {
    let url = "ccswitch://v1/import?resource=provider&app=claude&name=Shared%20Kimi&endpoint=https%3A%2F%2Fdemo.trycloudflare.com&apiKey=token123&model=kimi-for-coding&providerType=shared_seller&shareMode=free&requiresModelSelection=true&enabled=false";

    let request = parse_deeplink_url(url).unwrap();

    assert_eq!(request.provider_type, Some("shared_seller".to_string()));
    assert_eq!(request.share_mode, Some("free".to_string()));
    assert_eq!(request.requires_model_selection, Some(true));
    assert_eq!(request.enabled, Some(false));
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `~/.cargo/bin/cargo test --manifest-path src-tauri/Cargo.toml test_parse_shared_provider_deeplink -- --nocapture`
Expected: FAIL because the new deeplink fields do not exist yet.

- [ ] **Step 3: Add the shared-provider fields to TS + Rust request models and parser**

```ts
// src/lib/api/deeplink.ts
export interface DeepLinkImportRequest {
  providerType?: string;
  shareMode?: string;
  requiresModelSelection?: boolean;
}
```

```rust
// src-tauri/src/deeplink/mod.rs
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeepLinkImportRequest {
    pub provider_type: Option<String>,
    pub share_mode: Option<String>,
    pub requires_model_selection: Option<bool>,
}
```

```rust
// src-tauri/src/deeplink/parser.rs
let provider_type = params.get("providerType").cloned();
let share_mode = params.get("shareMode").cloned();
let requires_model_selection = params
    .get("requiresModelSelection")
    .and_then(|v| v.parse::<bool>().ok());
```

- [ ] **Step 4: Run test to verify it passes**

Run: `~/.cargo/bin/cargo test --manifest-path src-tauri/Cargo.toml test_parse_shared_provider_deeplink -- --nocapture`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/api/deeplink.ts src-tauri/src/deeplink/mod.rs src-tauri/src/deeplink/parser.rs src-tauri/src/deeplink/tests.rs
git commit -m "feat: extend deeplink schema for shared providers"
```

## Task 2: Add Seller Share-Link Generation

**Files:**
- Modify: `src/components/providers/ProviderSellerPopover.tsx`
- Modify: `src/components/providers/__tests__/ProviderSellerPopover.test.tsx`

- [ ] **Step 1: Write the failing share-link test**

```tsx
it("copies a shared provider deeplink when endpoint and token exist", async () => {
  const user = userEvent.setup();
  Object.assign(navigator, {
    clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
  });

  render(
    <ProviderSellerPopover
      providerId="provider-1"
      providerName="Kimi For Coding"
      sellerConfig={{
        enabled: true,
        mode: "free",
        status: "active_free",
        endpoint: "https://demo.trycloudflare.com",
        accessToken: "ccs_sell_token",
      }}
      onSave={vi.fn()}
    />,
  );

  await user.click(screen.getByRole("button", { name: /seller/i }));
  await user.click(screen.getByRole("button", { name: /copy share link/i }));

  expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
    expect.stringContaining("ccswitch://v1/import?resource=provider"),
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/components/providers/__tests__/ProviderSellerPopover.test.tsx`
Expected: FAIL because the share-link button does not exist yet.

- [ ] **Step 3: Implement share-link generation and copy actions**

```tsx
// src/components/providers/ProviderSellerPopover.tsx
function buildSharedProviderLink(input: {
  providerName: string;
  endpoint: string;
  accessToken: string;
  recommendedModel?: string;
}) {
  const params = new URLSearchParams({
    resource: "provider",
    app: "claude",
    name: `${input.providerName} (Shared)`,
    endpoint: input.endpoint,
    apiKey: input.accessToken,
    enabled: "false",
    providerType: "shared_seller",
    shareMode: "free",
    requiresModelSelection: "true",
  });
  if (input.recommendedModel) params.set("model", input.recommendedModel);
  return `ccswitch://v1/import?${params.toString()}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run src/components/providers/__tests__/ProviderSellerPopover.test.tsx`
Expected: PASS with existing seller tests plus share-link copy coverage.

- [ ] **Step 5: Commit**

```bash
git add src/components/providers/ProviderSellerPopover.tsx src/components/providers/__tests__/ProviderSellerPopover.test.tsx
git commit -m "feat: add shared provider deeplink copy action"
```

## Task 3: Add Shared Provider Confirmation UI

**Files:**
- Create: `src/components/deeplink/SharedProviderConfirmation.tsx`
- Modify: `src/components/DeepLinkImportDialog.tsx`
- Modify: `src/i18n/locales/zh.json`
- Modify: `src/i18n/locales/en.json`
- Modify: `src/i18n/locales/ja.json`

- [ ] **Step 1: Write the failing confirmation test**

```tsx
it("blocks shared provider import when model fetching fails", async () => {
  vi.spyOn(deeplinkApi, "mergeDeeplinkConfig").mockResolvedValue({
    version: "v1",
    resource: "provider",
    app: "claude",
    name: "Shared Kimi",
    endpoint: "https://demo.trycloudflare.com",
    apiKey: "token123",
    providerType: "shared_seller",
    requiresModelSelection: true,
  });
  vi.spyOn(modelFetchApi, "fetchModelsForConfig").mockRejectedValue(
    new Error("fetch failed"),
  );

  // assert toast/error + no import button enabled
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/components/DeepLinkImportDialog.test.tsx`
Expected: FAIL because shared-provider confirmation logic does not exist yet.

- [ ] **Step 3: Implement shared-provider confirmation state**

```tsx
// src/components/DeepLinkImportDialog.tsx
const isSharedProvider =
  request?.resource === "provider" &&
  request.providerType === "shared_seller";

if (isSharedProvider) {
  // fetch model list on dialog open
  // require explicit model selection from loaded list
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run src/components/DeepLinkImportDialog.test.tsx`
Expected: PASS for the new shared-provider branch.

- [ ] **Step 5: Commit**

```bash
git add src/components/deeplink/SharedProviderConfirmation.tsx src/components/DeepLinkImportDialog.tsx src/i18n/locales/en.json src/i18n/locales/zh.json src/i18n/locales/ja.json
git commit -m "feat: add shared provider import confirmation"
```

## Task 4: Persist Shared Provider Imports With Selected Model

**Files:**
- Modify: `src-tauri/src/deeplink/provider.rs`
- Modify: `src-tauri/src/deeplink/tests.rs`

- [ ] **Step 1: Write the failing import test**

```rust
#[test]
fn deeplink_import_shared_provider_preserves_shared_fields_and_selected_model() {
    let request = DeepLinkImportRequest {
        version: "v1".to_string(),
        resource: "provider".to_string(),
        app: Some("claude".to_string()),
        name: Some("Shared Kimi".to_string()),
        endpoint: Some("https://demo.trycloudflare.com".to_string()),
        api_key: Some("token123".to_string()),
        model: Some("kimi-for-coding".to_string()),
        provider_type: Some("shared_seller".to_string()),
        enabled: Some(false),
        ..Default::default()
    };

    // import, then assert model + providerType + enabled=false round-trip
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `~/.cargo/bin/cargo test --manifest-path src-tauri/Cargo.toml deeplink_import_shared_provider_preserves_shared_fields_and_selected_model -- --nocapture`
Expected: FAIL because provider meta/import path does not preserve the shared-provider metadata yet.

- [ ] **Step 3: Implement shared-provider import preservation**

```rust
// src-tauri/src/deeplink/provider.rs
fn build_provider_meta(request: &DeepLinkImportRequest) -> Result<Option<ProviderMeta>, AppError> {
    let mut meta = ProviderMeta::default();
    if let Some(provider_type) = request.provider_type.clone() {
        meta.provider_type = Some(provider_type);
    }
    // keep existing usage-script behavior
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `~/.cargo/bin/cargo test --manifest-path src-tauri/Cargo.toml deeplink_import_shared_provider_preserves_shared_fields_and_selected_model -- --nocapture`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/deeplink/provider.rs src-tauri/src/deeplink/tests.rs
git commit -m "feat: persist shared provider imports"
```

## Task 5: Final Verification

**Files:**
- Modify: none expected unless verification reveals a concrete defect

- [ ] **Step 1: Run focused frontend verification**

Run: `pnpm exec vitest run src/components/providers/__tests__/ProviderSellerPopover.test.tsx`
Expected: PASS.

Run: `pnpm exec vitest run src/components/DeepLinkImportDialog.test.tsx`
Expected: PASS.

- [ ] **Step 2: Run focused Rust verification**

Run: `~/.cargo/bin/cargo test --manifest-path src-tauri/Cargo.toml test_parse_shared_provider_deeplink -- --nocapture`
Expected: PASS.

Run: `~/.cargo/bin/cargo test --manifest-path src-tauri/Cargo.toml deeplink_import_shared_provider_preserves_shared_fields_and_selected_model -- --nocapture`
Expected: PASS.

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Commit any final verification fix if needed**

```bash
git add -A
git commit -m "test: verify shared provider deeplink flow"
```

## Self-Review

- Spec coverage: plan covers share button generation, shared-provider parsing, confirmation dialog with model fetch, failure-on-fetch-error, and import persistence.
- Placeholder scan: no `TODO` / `TBD` placeholders remain.
- Type consistency: shared-provider fields use `providerType`, `shareMode`, and `requiresModelSelection` in TS and Rust, while persisted provider metadata keeps existing `provider_type` conventions internally.
