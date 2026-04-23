# Provider Seller Popover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-provider seller button and inline popover that lets users enable free or paid selling, copy endpoint/token details, and apply suggested pricing without leaving the provider card.

**Architecture:** Extend `ProviderMeta` with seller state, expose a small market API wrapper on the frontend, add three focused Tauri commands for stop/token/pricing flows, and render a dedicated `ProviderSellerPopover` component from `ProviderActions`. Persist seller state by updating the provider record so the UI survives reloads and stays aligned with existing provider mutation flows.

**Tech Stack:** React 18, TypeScript, Vitest + Testing Library, Tauri 2 commands, Rust service tests, React Query, Radix Popover, Sonner toasts, i18next.

---

## File Structure

- Modify: `src/types.ts`
  Responsibility: define `ProviderSellerConfig` and attach it to `ProviderMeta`.
- Create: `src/lib/api/market.ts`
  Responsibility: typed frontend wrappers for seller-specific Tauri commands.
- Modify: `src/lib/api/index.ts`
  Responsibility: export `marketApi`.
- Create: `src/components/providers/ProviderSellerPopover.tsx`
  Responsibility: lightweight seller UI, local draft state, start/stop/copy/suggest interactions.
- Modify: `src/components/providers/ProviderActions.tsx`
  Responsibility: add seller action button and mount popover trigger/content.
- Modify: `src/components/providers/ProviderCard.tsx`
  Responsibility: pass provider/app context and update callback into the action bar.
- Modify: `src/hooks/useProviderActions.ts`
  Responsibility: persist `sellerConfig` changes by reusing provider update flow.
- Modify: `src/i18n/locales/zh.json`
  Responsibility: Chinese strings for seller UI.
- Modify: `src/i18n/locales/en.json`
  Responsibility: English strings for seller UI.
- Modify: `src/i18n/locales/ja.json`
  Responsibility: Japanese strings for seller UI.
- Modify: `src-tauri/src/services/market.rs`
  Responsibility: generate seller token, compute suggested price, stop selling, and unit-test helpers.
- Modify: `src-tauri/src/commands/market.rs`
  Responsibility: expose new commands to the frontend.
- Modify: `src-tauri/src/lib.rs`
  Responsibility: register the new Tauri commands.
- Create: `src/components/providers/__tests__/ProviderSellerPopover.test.tsx`
  Responsibility: UI behavior tests for free/paid modes and suggestion flow.

## Task 1: Add Seller Types And Frontend Market API

**Files:**
- Modify: `src/types.ts`
- Create: `src/lib/api/market.ts`
- Modify: `src/lib/api/index.ts`
- Test: `src/components/providers/__tests__/ProviderSellerPopover.test.tsx`

- [ ] **Step 1: Write the failing type/API smoke test**

```ts
import type { Provider } from "@/types";
import { describe, expect, it } from "vitest";

describe("provider seller config typing", () => {
  it("allows seller config to be stored inside provider meta", () => {
    const provider: Provider = {
      id: "provider-1",
      name: "Seller Demo",
      settingsConfig: {},
      meta: {
        sellerConfig: {
          enabled: true,
          mode: "free",
          status: "active_free",
          endpoint: "https://demo.trycloudflare.com",
          accessToken: "seller-token",
        },
      },
    };

    expect(provider.meta?.sellerConfig?.status).toBe("active_free");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit -- src/components/providers/__tests__/ProviderSellerPopover.test.tsx`
Expected: FAIL with a TypeScript/runtime error mentioning `sellerConfig` or missing test file.

- [ ] **Step 3: Add the seller types and market API wrappers**

```ts
// src/types.ts
export interface ProviderSellerConfig {
  enabled?: boolean;
  mode?: "free" | "paid";
  pricePer1kTokens?: number;
  acceptsSuggestedPricing?: boolean;
  suggestedPricePer1kTokens?: number | null;
  endpoint?: string;
  accessToken?: string;
  status?: "idle" | "starting" | "active_free" | "active_paid" | "error";
  lastError?: string | null;
  lastPublishedAt?: number | null;
}

export interface ProviderMeta {
  sellerConfig?: ProviderSellerConfig;
  // existing fields stay below
}
```

```ts
// src/lib/api/market.ts
import { invoke } from "@tauri-apps/api/core";

export interface SellerPricingSuggestion {
  pricePer1kTokens: number;
  source: string;
}

export const marketApi = {
  async startCloudflareTunnel(port: number): Promise<string> {
    return await invoke("start_cloudflare_tunnel", { port });
  },

  async startSellingTokens(input: {
    providerId: string;
    modelName: string;
    price: number;
    endpoint: string;
  }): Promise<string> {
    return await invoke("start_selling_tokens", input);
  },

  async stopSellingTokens(providerId: string): Promise<boolean> {
    return await invoke("stop_selling_tokens", { providerId });
  },

  async generateSellerAccessToken(providerId: string): Promise<string> {
    return await invoke("generate_seller_access_token", { providerId });
  },

  async getSuggestedSellerPrice(
    providerId: string,
  ): Promise<SellerPricingSuggestion> {
    return await invoke("get_suggested_seller_price", { providerId });
  },
};
```

```ts
// src/lib/api/index.ts
export { marketApi } from "./market";
```

- [ ] **Step 4: Run the targeted test to verify it passes**

Run: `pnpm test:unit -- src/components/providers/__tests__/ProviderSellerPopover.test.tsx`
Expected: PASS for the typing smoke test.

- [ ] **Step 5: Commit**

```bash
git add src/types.ts src/lib/api/market.ts src/lib/api/index.ts src/components/providers/__tests__/ProviderSellerPopover.test.tsx
git commit -m "feat: add seller config types and market api"
```

## Task 2: Add Backend Seller Commands And Service Helpers

**Files:**
- Modify: `src-tauri/src/services/market.rs`
- Modify: `src-tauri/src/commands/market.rs`
- Modify: `src-tauri/src/lib.rs`
- Test: `src-tauri/src/services/market.rs`

- [ ] **Step 1: Write the failing Rust unit tests**

```rust
#[cfg(test)]
mod tests {
    use super::MarketService;

    #[test]
    fn generate_access_token_returns_non_empty_value() {
        let token = MarketService::generate_access_token_for("provider-1");
        assert!(!token.is_empty());
        assert!(token.starts_with("ccs_sell_"));
    }

    #[test]
    fn suggested_price_is_positive() {
        let suggestion = MarketService::suggest_price_for("provider-1");
        assert!(suggestion.price_per_1k_tokens > 0);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test market --manifest-path src-tauri/Cargo.toml`
Expected: FAIL because `generate_access_token_for` and `suggest_price_for` do not exist yet.

- [ ] **Step 3: Implement the minimal service and command surface**

```rust
// src-tauri/src/services/market.rs
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SellerPricingSuggestion {
    pub price_per_1k_tokens: u64,
    pub source: String,
}

impl MarketService {
    pub fn generate_access_token_for(provider_id: &str) -> String {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis();
        format!("ccs_sell_{}_{}", provider_id.replace('-', "_"), now)
    }

    pub fn suggest_price_for(_provider_id: &str) -> SellerPricingSuggestion {
        SellerPricingSuggestion {
            price_per_1k_tokens: 10,
            source: "builtin-default".to_string(),
        }
    }

    pub async fn stop_selling(&self, _provider_id: &str) -> anyhow::Result<bool> {
        Ok(true)
    }
}
```

```rust
// src-tauri/src/commands/market.rs
#[tauri::command]
pub async fn stop_selling_tokens(
    state: State<'_, AppState>,
    provider_id: String,
) -> Result<bool, String> {
    state
        .market_service
        .stop_selling(&provider_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn generate_seller_access_token(provider_id: String) -> Result<String, String> {
    Ok(MarketService::generate_access_token_for(&provider_id))
}

#[tauri::command]
pub async fn get_suggested_seller_price(
    provider_id: String,
) -> Result<SellerPricingSuggestion, String> {
    Ok(MarketService::suggest_price_for(&provider_id))
}
```

```rust
// src-tauri/src/lib.rs
commands::stop_selling_tokens,
commands::generate_seller_access_token,
commands::get_suggested_seller_price,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test market --manifest-path src-tauri/Cargo.toml`
Expected: PASS for the new seller helper tests.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/services/market.rs src-tauri/src/commands/market.rs src-tauri/src/lib.rs
git commit -m "feat: add seller market commands"
```

## Task 3: Build The Seller Popover UI With TDD

**Files:**
- Create: `src/components/providers/ProviderSellerPopover.tsx`
- Create: `src/components/providers/__tests__/ProviderSellerPopover.test.tsx`

- [ ] **Step 1: Write the failing UI tests**

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProviderSellerPopover } from "@/components/providers/ProviderSellerPopover";

describe("ProviderSellerPopover", () => {
  it("disables price input when free mode is enabled", async () => {
    const user = userEvent.setup();

    render(
      <ProviderSellerPopover
        providerId="provider-1"
        providerName="Demo"
        sellerConfig={{ enabled: false, mode: "free", status: "idle" }}
        onSave={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /seller/i }));
    expect(screen.getByLabelText(/price/i)).toBeDisabled();
  });

  it("shows copy actions after a free seller becomes active", async () => {
    const user = userEvent.setup();

    render(
      <ProviderSellerPopover
        providerId="provider-1"
        providerName="Demo"
        sellerConfig={{
          enabled: true,
          mode: "free",
          status: "active_free",
          endpoint: "https://demo.trycloudflare.com",
          accessToken: "ccs_sell_demo",
        }}
        onSave={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /seller/i }));
    expect(screen.getByRole("button", { name: /copy endpoint/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /copy token/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit -- src/components/providers/__tests__/ProviderSellerPopover.test.tsx`
Expected: FAIL because `ProviderSellerPopover` does not exist yet.

- [ ] **Step 3: Implement the minimal popover component**

```tsx
// src/components/providers/ProviderSellerPopover.tsx
import { useState } from "react";
import { Store } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { ProviderSellerConfig } from "@/types";

interface ProviderSellerPopoverProps {
  providerId: string;
  providerName: string;
  sellerConfig?: ProviderSellerConfig;
  onSave: (config: ProviderSellerConfig) => Promise<void> | void;
}

export function ProviderSellerPopover({
  providerId: _providerId,
  providerName,
  sellerConfig,
  onSave,
}: ProviderSellerPopoverProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<ProviderSellerConfig>({
    enabled: false,
    mode: "paid",
    pricePer1kTokens: 10,
    status: "idle",
    ...sellerConfig,
  });

  const isFree = draft.mode === "free";
  const showCopyPanel =
    draft.status === "active_free" || draft.status === "active_paid";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          aria-label={t("provider.seller.button", { defaultValue: "Seller" })}
        >
          <Store className="h-4 w-4" />
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-80 space-y-4">
        <div className="space-y-1">
          <div className="text-sm font-medium">{providerName}</div>
        </div>

        <div className="flex items-center justify-between">
          <span>{t("provider.seller.enabled", { defaultValue: "Enable selling" })}</span>
          <Switch
            checked={draft.enabled ?? false}
            onCheckedChange={(checked) =>
              setDraft((prev) => ({ ...prev, enabled: checked }))
            }
          />
        </div>

        <div className="flex items-center justify-between">
          <span>{t("provider.seller.freeMode", { defaultValue: "Free" })}</span>
          <Switch
            checked={isFree}
            onCheckedChange={(checked) =>
              setDraft((prev) => ({
                ...prev,
                mode: checked ? "free" : "paid",
                pricePer1kTokens: checked ? 0 : Math.max(prev.pricePer1kTokens ?? 10, 1),
              }))
            }
          />
        </div>

        <Input
          aria-label={t("provider.seller.price", { defaultValue: "Price" })}
          type="number"
          disabled={isFree}
          value={draft.pricePer1kTokens ?? 0}
          onChange={(event) =>
            setDraft((prev) => ({
              ...prev,
              pricePer1kTokens: Number(event.target.value),
            }))
          }
        />

        <Button onClick={() => onSave(draft)}>
          {t("common.save", { defaultValue: "Save" })}
        </Button>

        {showCopyPanel ? (
          <div className="space-y-2">
            <Button variant="outline">
              {t("provider.seller.copyEndpoint", { defaultValue: "Copy endpoint" })}
            </Button>
            <Button variant="outline">
              {t("provider.seller.copyToken", { defaultValue: "Copy token" })}
            </Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:unit -- src/components/providers/__tests__/ProviderSellerPopover.test.tsx`
Expected: PASS for free-mode and copy-action tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/providers/ProviderSellerPopover.tsx src/components/providers/__tests__/ProviderSellerPopover.test.tsx
git commit -m "feat: add provider seller popover ui"
```

## Task 4: Wire Seller State Into Provider Actions And Persistence

**Files:**
- Modify: `src/components/providers/ProviderActions.tsx`
- Modify: `src/components/providers/ProviderCard.tsx`
- Modify: `src/hooks/useProviderActions.ts`

- [ ] **Step 1: Write the failing integration test**

```tsx
it("saves updated seller config through provider action callbacks", async () => {
  const onSaveSellerConfig = vi.fn();

  render(
    <ProviderActions
      onSwitch={vi.fn()}
      onEdit={vi.fn()}
      onDuplicate={vi.fn()}
      onDelete={vi.fn()}
      onSaveSellerConfig={onSaveSellerConfig}
      sellerConfig={{ enabled: false, mode: "paid", status: "idle" }}
    />,
  );

  await userEvent.click(screen.getByRole("button", { name: /seller/i }));
  await userEvent.click(screen.getByRole("button", { name: /save/i }));

  expect(onSaveSellerConfig).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit -- src/components/providers/__tests__/ProviderSellerPopover.test.tsx`
Expected: FAIL because `ProviderActions` does not accept seller props yet.

- [ ] **Step 3: Implement provider wiring and persistence helper**

```tsx
// src/components/providers/ProviderActions.tsx
import { ProviderSellerPopover } from "@/components/providers/ProviderSellerPopover";
import type { ProviderSellerConfig } from "@/types";

interface ProviderActionsProps {
  sellerConfig?: ProviderSellerConfig;
  onSaveSellerConfig?: (config: ProviderSellerConfig) => Promise<void> | void;
  providerId?: string;
  providerName?: string;
  // existing props stay below
}

{onSaveSellerConfig && providerId && providerName ? (
  <ProviderSellerPopover
    providerId={providerId}
    providerName={providerName}
    sellerConfig={sellerConfig}
    onSave={onSaveSellerConfig}
  />
) : null}
```

```tsx
// src/components/providers/ProviderCard.tsx
<ProviderActions
  providerId={provider.id}
  providerName={provider.name}
  sellerConfig={provider.meta?.sellerConfig}
  onSaveSellerConfig={(config) => onUpdateSellerConfig?.(provider, config)}
  // existing props stay below
/>
```

```ts
// src/hooks/useProviderActions.ts
import type { ProviderSellerConfig } from "@/types";

const updateSellerConfig = useCallback(
  async (provider: Provider, sellerConfig: ProviderSellerConfig) => {
    const nextProvider: Provider = {
      ...provider,
      meta: {
        ...provider.meta,
        sellerConfig,
      },
    };

    await updateProvider(nextProvider);
  },
  [updateProvider],
);
```

- [ ] **Step 4: Run tests to verify it passes**

Run: `pnpm test:unit -- src/components/providers/__tests__/ProviderSellerPopover.test.tsx`
Expected: PASS for the integration callback test and existing popover tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/providers/ProviderActions.tsx src/components/providers/ProviderCard.tsx src/hooks/useProviderActions.ts
git commit -m "feat: persist seller config from provider cards"
```

## Task 5: Connect Real Seller Flows, Localization, And Full Verification

**Files:**
- Modify: `src/components/providers/ProviderSellerPopover.tsx`
- Modify: `src/i18n/locales/zh.json`
- Modify: `src/i18n/locales/en.json`
- Modify: `src/i18n/locales/ja.json`

- [ ] **Step 1: Write the failing real-flow test**

```tsx
it("requests suggestion and applies it before enabling paid selling", async () => {
  const onSave = vi.fn();

  render(
    <ProviderSellerPopover
      providerId="provider-1"
      providerName="Demo"
      sellerConfig={{ enabled: false, mode: "paid", status: "idle" }}
      onSave={onSave}
    />,
  );

  await userEvent.click(screen.getByRole("button", { name: /seller/i }));
  await userEvent.click(screen.getByLabelText(/accept suggested pricing/i));
  await userEvent.click(screen.getByRole("button", { name: /apply suggested price/i }));

  expect(onSave).not.toHaveBeenCalled();
  expect(screen.getByLabelText(/price/i)).toHaveValue(10);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit -- src/components/providers/__tests__/ProviderSellerPopover.test.tsx`
Expected: FAIL because the suggestion controls and async handlers are not wired yet.

- [ ] **Step 3: Implement async seller flow, copy actions, and translations**

```tsx
// src/components/providers/ProviderSellerPopover.tsx
import { toast } from "sonner";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { marketApi } from "@/lib/api/market";

const handleSuggestPrice = async () => {
  const suggestion = await marketApi.getSuggestedSellerPrice(providerId);
  setDraft((prev) => ({
    ...prev,
    suggestedPricePer1kTokens: suggestion.pricePer1kTokens,
  }));
};

const handleApplySuggestedPrice = () => {
  setDraft((prev) => ({
    ...prev,
    pricePer1kTokens: prev.suggestedPricePer1kTokens ?? prev.pricePer1kTokens,
  }));
};

const handleToggleSelling = async () => {
  if (draft.enabled) {
    const accessToken =
      draft.accessToken ?? (await marketApi.generateSellerAccessToken(providerId));
    const endpoint =
      draft.endpoint ?? (await marketApi.startCloudflareTunnel(15721));
    const price = draft.mode === "free" ? 0 : draft.pricePer1kTokens ?? 0;

    await marketApi.startSellingTokens({
      providerId,
      modelName: providerName,
      price,
      endpoint,
    });

    await onSave({
      ...draft,
      accessToken,
      endpoint,
      status: draft.mode === "free" ? "active_free" : "active_paid",
      lastError: null,
      lastPublishedAt: Date.now(),
    });
    return;
  }

  await marketApi.stopSellingTokens(providerId);
  await onSave({
    ...draft,
    status: "idle",
  });
};

const copyValue = async (value: string, successKey: string) => {
  await writeText(value);
  toast.success(t(successKey));
};
```

```json
// src/i18n/locales/en.json
{
  "provider": {
    "seller": {
      "button": "Seller",
      "enabled": "Enable selling",
      "freeMode": "Free sharing",
      "price": "Price (Sats / 1k tokens)",
      "acceptSuggestedPricing": "Accept suggested pricing",
      "fetchSuggestedPrice": "Fetch suggested price",
      "applySuggestedPrice": "Apply suggested price",
      "copyEndpoint": "Copy endpoint",
      "copyToken": "Copy token",
      "copyBundle": "Copy full access info"
    }
  }
}
```

- [ ] **Step 4: Run the full verification suite**

Run: `pnpm test:unit -- src/components/providers/__tests__/ProviderSellerPopover.test.tsx`
Expected: PASS for suggestion flow, free/paid state, and copy-panel coverage.

Run: `pnpm typecheck`
Expected: PASS with no TypeScript errors.

Run: `cargo test market --manifest-path src-tauri/Cargo.toml`
Expected: PASS for seller backend helper tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/providers/ProviderSellerPopover.tsx src/i18n/locales/zh.json src/i18n/locales/en.json src/i18n/locales/ja.json
git commit -m "feat: connect seller popover flows"
```

## Self-Review

- Spec coverage: covered per-provider button, inline popover, free mode copy info, paid mode pricing, suggested pricing, stop flow, persistence, and verification.
- Placeholder scan: no `TODO`, `TBD`, or “similar to above” shortcuts remain.
- Type consistency: plan uses one seller config name, one market API surface, and one status enum across frontend and backend tasks.
