# Provider Share Settings V10 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current compact seller popover with the V10 share settings experience: a provider-level dialog for friend sharing and market selling, with matching capsule switches and live runtime statistics.

**Architecture:** Keep provider share state in provider metadata so it survives reloads and follows the existing provider update flow. Render the V10 design as a dedicated `ProviderShareSettingsDialog` opened from the existing provider action button, backed by small pure helpers for state normalization, runtime statistics, and token formatting. Use existing `marketApi`, `proxyApi`, and usage statistics APIs; no new backend command is required for the V10 UI slice.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Radix Dialog/Tabs/Switch via local UI wrappers, React Query, Vitest + Testing Library, Tauri API wrappers.

---

## Implementation Scheme

The current implementation exposes `ProviderSellerPopover` from `src/components/providers/ProviderSellerPopover.tsx`. V10 should replace that small popover with a larger dialog that matches the HTML prototype at `.superpowers/brainstorm/74088-1776996815/content/provider-share-compact-v10.html`.

The real app implementation should keep the existing action-button entry point in `ProviderActions`, but the clicked icon opens the new dialog. Inside the dialog:

- Header shows provider icon, provider name, and provider URL derived from the same display logic used by `ProviderCard`.
- Runtime strip replaces the previous safety text with three stats: channel status, current connections, and tokens used since this share start.
- Tabs switch between `分享拼车` and `卖了换钱`.
- Both tab headers use the same green capsule switch pattern: action label, status label, and `Switch`.
- Friend sharing starts a tunnel, creates or reuses a seller access token, persists friend share state, and then shows copy actions.
- Market selling starts the same tunnel path plus `startSellingTokens`, persists market state, and shows account/pricing cards only; the V10 red-box removals stay removed.

State model:

```ts
export type ProviderShareStatus = "idle" | "starting" | "running" | "error";

export interface ProviderFriendShareConfig {
  enabled: boolean;
  status: ProviderShareStatus;
  endpoint?: string;
  accessToken?: string;
  startedAt?: number;
  lastError?: string | null;
}

export interface ProviderMarketShareConfig {
  enabled: boolean;
  status: ProviderShareStatus;
  pricingStrategy: "provider" | "custom";
  pricePer1kTokens?: number;
  endpoint?: string;
  accessToken?: string;
  startedAt?: number;
  lastPublishedAt?: number | null;
  lastError?: string | null;
}

export interface ProviderShareConfig {
  friend: ProviderFriendShareConfig;
  market: ProviderMarketShareConfig;
}
```

Compatibility rule:

- Existing `meta.sellerConfig` remains readable.
- New saves write `meta.shareConfig`.
- `toProviderShareConfig()` maps an existing active `sellerConfig` into `shareConfig.market` so users do not lose current seller state.

Runtime stats rule:

- Channel status is `运行中` if either `shareConfig.friend.status` or `shareConfig.market.status` is `running`; it is `启动中` if either is `starting`; it is `未运行` otherwise.
- Current connections come from `proxyApi.getProxyStatus().active_connections`.
- Tokens used since this start comes from `usageApi.getProviderStats(startedAt, undefined, appId)` and the matching provider row’s `total_tokens`.
- `startedAt` is set when a friend or market capsule starts successfully.

## File Structure

- Modify: `src/types.ts`
  Responsibility: add `ProviderShareConfig` types and attach `shareConfig` to `ProviderMeta` while keeping `sellerConfig`.
- Create: `src/components/providers/providerShareSettingsUtils.ts`
  Responsibility: normalize legacy seller state, derive runtime labels, format token counts, and build persisted next config objects.
- Create: `src/components/providers/ProviderShareSettingsDialog.tsx`
  Responsibility: implement the V10 dialog, tabs, capsule switches, runtime strip, copy actions, market account card, and pricing cards.
- Modify: `src/components/providers/ProviderActions.tsx`
  Responsibility: open `ProviderShareSettingsDialog` from the existing seller/share action slot.
- Modify: `src/components/providers/ProviderCard.tsx`
  Responsibility: pass provider URL, icon metadata, app id, and seller/share persistence callback to the dialog.
- Modify: `src/hooks/useProviderActions.ts`
  Responsibility: persist `shareConfig` through the existing provider update helper.
- Modify: `src/lib/api/market.ts`
  Responsibility: keep existing market wrappers and reuse them from the new dialog.
- Modify: `src/i18n/locales/zh.json`
  Responsibility: add Chinese V10 copy.
- Modify: `src/i18n/locales/en.json`
  Responsibility: add English V10 copy.
- Modify: `src/i18n/locales/ja.json`
  Responsibility: add Japanese V10 copy.
- Create: `src/components/providers/__tests__/providerShareSettingsUtils.test.ts`
  Responsibility: pure unit tests for normalization and runtime stats.
- Create: `src/components/providers/__tests__/ProviderShareSettingsDialog.test.tsx`
  Responsibility: user-visible UI and interaction tests for the V10 design.
- Modify: `src/components/providers/__tests__/ProviderSellerPopover.test.tsx`
  Responsibility: remove tests that only apply to the old popover after the new dialog tests cover equivalent behavior.

## Task 1: Add Share Config Types And Pure Helpers

**Files:**
- Modify: `src/types.ts`
- Create: `src/components/providers/providerShareSettingsUtils.ts`
- Create: `src/components/providers/__tests__/providerShareSettingsUtils.test.ts`

- [ ] **Step 1: Write the failing helper tests**

```ts
import { describe, expect, it } from "vitest";
import type { Provider, ProviderSellerConfig } from "@/types";
import {
  deriveShareRuntimeStats,
  formatTokenCount,
  toProviderShareConfig,
} from "@/components/providers/providerShareSettingsUtils";

describe("provider share settings helpers", () => {
  it("normalizes empty provider metadata into idle friend and market configs", () => {
    const provider: Provider = {
      id: "provider-1",
      name: "Codex",
      settingsConfig: {},
    };

    const config = toProviderShareConfig(provider.meta);

    expect(config.friend).toEqual({
      enabled: false,
      status: "idle",
      lastError: null,
    });
    expect(config.market).toEqual({
      enabled: false,
      status: "idle",
      pricingStrategy: "provider",
      lastError: null,
      lastPublishedAt: null,
    });
  });

  it("maps active legacy seller config into the market tab", () => {
    const legacySellerConfig: ProviderSellerConfig = {
      enabled: true,
      mode: "paid",
      pricePer1kTokens: 12,
      endpoint: "https://seller.trycloudflare.com",
      accessToken: "ccs_sell_token",
      status: "active_paid",
      lastPublishedAt: 1_776_996_815_000,
      lastError: null,
    };

    const config = toProviderShareConfig({ sellerConfig: legacySellerConfig });

    expect(config.market).toEqual({
      enabled: true,
      status: "running",
      pricingStrategy: "provider",
      pricePer1kTokens: 12,
      endpoint: "https://seller.trycloudflare.com",
      accessToken: "ccs_sell_token",
      startedAt: 1_776_996_815_000,
      lastPublishedAt: 1_776_996_815_000,
      lastError: null,
    });
  });

  it("derives runtime stats from share state, proxy status, and provider usage", () => {
    const stats = deriveShareRuntimeStats({
      shareConfig: {
        friend: {
          enabled: true,
          status: "running",
          endpoint: "https://friend.trycloudflare.com",
          accessToken: "ccs_sell_friend",
          startedAt: 1_776_996_815_000,
          lastError: null,
        },
        market: {
          enabled: false,
          status: "idle",
          pricingStrategy: "provider",
          lastError: null,
          lastPublishedAt: null,
        },
      },
      proxyStatus: {
        running: true,
        active_connections: 2,
      },
      providerTokensSinceStart: 18420,
    });

    expect(stats).toEqual({
      channelStatus: "running",
      channelStatusLabel: "运行中",
      activeConnections: 2,
      tokensUsedThisRun: 18420,
      tokensUsedThisRunLabel: "18,420",
    });
  });

  it("formats token counts as whole numbers", () => {
    expect(formatTokenCount(0)).toBe("0");
    expect(formatTokenCount(18420)).toBe("18,420");
    expect(formatTokenCount(-7)).toBe("0");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test:unit -- src/components/providers/__tests__/providerShareSettingsUtils.test.ts`

Expected: FAIL because `providerShareSettingsUtils.ts` and `ProviderShareConfig` do not exist.

- [ ] **Step 3: Add the types**

```ts
// src/types.ts
export type ProviderShareStatus = "idle" | "starting" | "running" | "error";

export interface ProviderFriendShareConfig {
  enabled: boolean;
  status: ProviderShareStatus;
  endpoint?: string;
  accessToken?: string;
  startedAt?: number;
  lastError?: string | null;
}

export interface ProviderMarketShareConfig {
  enabled: boolean;
  status: ProviderShareStatus;
  pricingStrategy: "provider" | "custom";
  pricePer1kTokens?: number;
  endpoint?: string;
  accessToken?: string;
  startedAt?: number;
  lastPublishedAt?: number | null;
  lastError?: string | null;
}

export interface ProviderShareConfig {
  friend: ProviderFriendShareConfig;
  market: ProviderMarketShareConfig;
}

export interface ProviderMeta {
  shareConfig?: ProviderShareConfig;
  sellerConfig?: ProviderSellerConfig;
  custom_endpoints?: Record<string, CustomEndpoint>;
  commonConfigEnabled?: boolean;
  usage_script?: UsageScript;
  test_config?: ProviderTestConfig;
  authBinding?: AuthBinding;
}
```

- [ ] **Step 4: Add the helper implementation**

```ts
// src/components/providers/providerShareSettingsUtils.ts
import type {
  ProviderMeta,
  ProviderSellerConfig,
  ProviderShareConfig,
  ProviderShareStatus,
} from "@/types";

type MinimalProxyStatus = {
  running?: boolean;
  active_connections?: number;
};

type RuntimeStatsInput = {
  shareConfig: ProviderShareConfig;
  proxyStatus?: MinimalProxyStatus | null;
  providerTokensSinceStart?: number | null;
};

type RuntimeStats = {
  channelStatus: ProviderShareStatus;
  channelStatusLabel: string;
  activeConnections: number;
  tokensUsedThisRun: number;
  tokensUsedThisRunLabel: string;
};

const idleShareConfig: ProviderShareConfig = {
  friend: {
    enabled: false,
    status: "idle",
    lastError: null,
  },
  market: {
    enabled: false,
    status: "idle",
    pricingStrategy: "provider",
    lastError: null,
    lastPublishedAt: null,
  },
};

function legacyStatusToShareStatus(
  status: ProviderSellerConfig["status"],
): ProviderShareStatus {
  if (status === "active_free" || status === "active_paid") {
    return "running";
  }
  if (status === "starting") {
    return "starting";
  }
  if (status === "error") {
    return "error";
  }
  return "idle";
}

function fromLegacySellerConfig(
  sellerConfig: ProviderSellerConfig,
): ProviderShareConfig {
  const status = legacyStatusToShareStatus(sellerConfig.status);
  const startedAt =
    sellerConfig.lastPublishedAt === null ? undefined : sellerConfig.lastPublishedAt;

  return {
    ...idleShareConfig,
    market: {
      enabled: Boolean(sellerConfig.enabled),
      status,
      pricingStrategy: "provider",
      pricePer1kTokens: sellerConfig.pricePer1kTokens,
      endpoint: sellerConfig.endpoint,
      accessToken: sellerConfig.accessToken,
      startedAt,
      lastPublishedAt: sellerConfig.lastPublishedAt ?? null,
      lastError: sellerConfig.lastError ?? null,
    },
  };
}

export function toProviderShareConfig(meta?: ProviderMeta): ProviderShareConfig {
  if (meta?.shareConfig) {
    return {
      friend: {
        ...idleShareConfig.friend,
        ...meta.shareConfig.friend,
      },
      market: {
        ...idleShareConfig.market,
        ...meta.shareConfig.market,
      },
    };
  }

  if (meta?.sellerConfig) {
    return fromLegacySellerConfig(meta.sellerConfig);
  }

  return idleShareConfig;
}

export function formatTokenCount(value: number): string {
  const normalized = Math.max(0, Math.round(Number.isFinite(value) ? value : 0));
  return new Intl.NumberFormat("en-US").format(normalized);
}

export function deriveShareRuntimeStats({
  shareConfig,
  proxyStatus,
  providerTokensSinceStart,
}: RuntimeStatsInput): RuntimeStats {
  const channelStatus: ProviderShareStatus =
    shareConfig.friend.status === "starting" ||
    shareConfig.market.status === "starting"
      ? "starting"
      : shareConfig.friend.status === "running" ||
          shareConfig.market.status === "running"
        ? "running"
        : shareConfig.friend.status === "error" || shareConfig.market.status === "error"
          ? "error"
          : "idle";

  const channelStatusLabel =
    channelStatus === "running"
      ? "运行中"
      : channelStatus === "starting"
        ? "启动中"
        : channelStatus === "error"
          ? "异常"
          : "未运行";

  const activeConnections =
    proxyStatus?.running && proxyStatus.active_connections
      ? proxyStatus.active_connections
      : 0;
  const tokensUsedThisRun = Math.max(0, providerTokensSinceStart ?? 0);

  return {
    channelStatus,
    channelStatusLabel,
    activeConnections,
    tokensUsedThisRun,
    tokensUsedThisRunLabel: formatTokenCount(tokensUsedThisRun),
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm test:unit -- src/components/providers/__tests__/providerShareSettingsUtils.test.ts`

Expected: PASS.

## Task 2: Build The V10 Dialog Layout

**Files:**
- Create: `src/components/providers/ProviderShareSettingsDialog.tsx`
- Create: `src/components/providers/__tests__/ProviderShareSettingsDialog.test.tsx`

- [ ] **Step 1: Write failing layout tests**

```tsx
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ProviderShareSettingsDialog } from "@/components/providers/ProviderShareSettingsDialog";

function renderDialog() {
  render(
    <ProviderShareSettingsDialog
      appId="codex"
      provider={{
        id: "provider-1",
        name: "Codex",
        settingsConfig: {},
        websiteUrl: "https://openai.com/chatgpt/pricing",
      }}
      open={true}
      onOpenChange={vi.fn()}
      onSaveShareConfig={vi.fn()}
    />,
  );
}

describe("ProviderShareSettingsDialog V10 layout", () => {
  it("renders provider header, runtime stats, and V10 tabs", () => {
    renderDialog();

    expect(screen.getByRole("dialog", { name: /分享设置/i })).toBeInTheDocument();
    expect(screen.getByText("Codex")).toBeInTheDocument();
    expect(screen.getByText("https://openai.com/chatgpt/pricing")).toBeInTheDocument();
    expect(screen.getByText("通道状态")).toBeInTheDocument();
    expect(screen.getByText("当前连接数")).toBeInTheDocument();
    expect(screen.getByText("本次启动已使用 Token")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "分享拼车" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "卖了换钱" })).toBeInTheDocument();
  });

  it("uses matching capsule switches in both tabs", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("tab", { name: "分享拼车" }));
    const friendPanel = screen.getByRole("tabpanel", { name: "分享拼车" });
    expect(
      within(friendPanel).getByRole("switch", { name: /分享拼车/i }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "卖了换钱" }));
    const marketPanel = screen.getByRole("tabpanel", { name: "卖了换钱" });
    expect(
      within(marketPanel).getByRole("switch", { name: /允许市场售卖/i }),
    ).toBeInTheDocument();
  });

  it("does not render the removed side step list or pre-publish checklist", () => {
    renderDialog();

    expect(screen.queryByText("1. 收款账户")).not.toBeInTheDocument();
    expect(screen.queryByText("发布前检查")).not.toBeInTheDocument();
    expect(screen.queryByText("查看市场发布")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test:unit -- src/components/providers/__tests__/ProviderShareSettingsDialog.test.tsx`

Expected: FAIL because `ProviderShareSettingsDialog` does not exist.

- [ ] **Step 3: Implement the dialog shell**

Use this component contract:

```ts
// src/components/providers/ProviderShareSettingsDialog.tsx
import type { AppId } from "@/lib/api";
import type { Provider, ProviderShareConfig } from "@/types";

export interface ProviderShareSettingsDialogProps {
  appId: AppId;
  provider: Provider;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaveShareConfig: (config: ProviderShareConfig) => Promise<void> | void;
}
```

The rendered structure must use:

- `Dialog`, `DialogContent`, `DialogHeader`, and `DialogTitle` from `src/components/ui/dialog.tsx`.
- `Tabs`, `TabsList`, `TabsTrigger`, and `TabsContent` from `src/components/ui/tabs.tsx`.
- `Switch` from `src/components/ui/switch.tsx`.
- Tailwind utility classes rather than a global CSS file.

The initial JSX hierarchy should be:

```tsx
<Dialog open={open} onOpenChange={onOpenChange}>
  <DialogContent className="max-w-5xl p-0 overflow-hidden" zIndex="top">
    <DialogHeader className="sr-only">
      <DialogTitle>分享设置</DialogTitle>
    </DialogHeader>
    <div className="bg-slate-50 p-6">
      <section className="rounded-xl bg-white p-5">
        <ProviderShareHeader provider={provider} />
        <ProviderShareStatsStrip stats={runtimeStats} />
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mt-4 grid w-fit grid-cols-2">
            <TabsTrigger value="friend">分享拼车</TabsTrigger>
            <TabsTrigger value="market">卖了换钱</TabsTrigger>
          </TabsList>
          <TabsContent value="friend">
            <FriendSharePanel />
          </TabsContent>
          <TabsContent value="market">
            <MarketSharePanel />
          </TabsContent>
        </Tabs>
      </section>
    </div>
  </DialogContent>
</Dialog>
```

The subcomponents stay in the same file for the first slice:

- `ProviderShareHeader`
- `ProviderShareStatsStrip`
- `CapsuleSwitch`
- `FriendSharePanel`
- `MarketSharePanel`
- `PricingStrategyCards`

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test:unit -- src/components/providers/__tests__/ProviderShareSettingsDialog.test.tsx`

Expected: PASS for the V10 layout tests.

## Task 3: Implement Friend And Market Start Flows

**Files:**
- Modify: `src/components/providers/ProviderShareSettingsDialog.tsx`
- Modify: `src/components/providers/__tests__/ProviderShareSettingsDialog.test.tsx`

- [ ] **Step 1: Add failing interaction tests**

```tsx
import { marketApi } from "@/lib/api";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    marketApi: {
      startCloudflareTunnel: vi.fn(),
      startSellingTokens: vi.fn(),
      generateSellerAccessToken: vi.fn(),
      stopSellingTokens: vi.fn(),
      getSuggestedSellerPrice: vi.fn(),
    },
  };
});

it("starts friend sharing and persists the friend channel", async () => {
  const user = userEvent.setup();
  const onSaveShareConfig = vi.fn().mockResolvedValue(undefined);
  vi.mocked(marketApi.generateSellerAccessToken).mockResolvedValueOnce("ccs_sell_friend");
  vi.mocked(marketApi.startCloudflareTunnel).mockResolvedValueOnce(
    "https://friend.trycloudflare.com",
  );

  render(
    <ProviderShareSettingsDialog
      appId="codex"
      provider={{ id: "provider-1", name: "Codex", settingsConfig: {} }}
      open={true}
      onOpenChange={vi.fn()}
      onSaveShareConfig={onSaveShareConfig}
    />,
  );

  await user.click(screen.getByRole("tab", { name: "分享拼车" }));
  await user.click(screen.getByRole("switch", { name: /分享拼车/i }));

  expect(marketApi.generateSellerAccessToken).toHaveBeenCalledWith("provider-1");
  expect(marketApi.startCloudflareTunnel).toHaveBeenCalledWith(15721);
  expect(onSaveShareConfig).toHaveBeenCalledWith(
    expect.objectContaining({
      friend: expect.objectContaining({
        enabled: true,
        status: "running",
        endpoint: "https://friend.trycloudflare.com",
        accessToken: "ccs_sell_friend",
        startedAt: expect.any(Number),
      }),
    }),
  );
});

it("starts market selling and persists the market channel", async () => {
  const user = userEvent.setup();
  const onSaveShareConfig = vi.fn().mockResolvedValue(undefined);
  vi.mocked(marketApi.generateSellerAccessToken).mockResolvedValueOnce("ccs_sell_market");
  vi.mocked(marketApi.startCloudflareTunnel).mockResolvedValueOnce(
    "https://market.trycloudflare.com",
  );
  vi.mocked(marketApi.startSellingTokens).mockResolvedValueOnce("event-id-1");

  render(
    <ProviderShareSettingsDialog
      appId="codex"
      provider={{ id: "provider-1", name: "Codex", settingsConfig: {} }}
      open={true}
      onOpenChange={vi.fn()}
      onSaveShareConfig={onSaveShareConfig}
    />,
  );

  await user.click(screen.getByRole("tab", { name: "卖了换钱" }));
  await user.click(screen.getByRole("switch", { name: /允许市场售卖/i }));

  expect(marketApi.startSellingTokens).toHaveBeenCalledWith({
    providerId: "provider-1",
    modelName: "Codex",
    pricePer1kTokens: 0,
    endpoint: "https://market.trycloudflare.com",
  });
  expect(onSaveShareConfig).toHaveBeenCalledWith(
    expect.objectContaining({
      market: expect.objectContaining({
        enabled: true,
        status: "running",
        endpoint: "https://market.trycloudflare.com",
        accessToken: "ccs_sell_market",
        startedAt: expect.any(Number),
        lastPublishedAt: expect.any(Number),
      }),
    }),
  );
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test:unit -- src/components/providers/__tests__/ProviderShareSettingsDialog.test.tsx`

Expected: FAIL because the capsule switches do not start flows yet.

- [ ] **Step 3: Implement flow handlers**

Implementation rules:

```ts
const SELLER_TUNNEL_PORT = 15721;

async function ensureShareEndpointAndToken(input: {
  providerId: string;
  existingEndpoint?: string;
  existingAccessToken?: string;
}) {
  const accessToken =
    input.existingAccessToken && input.existingAccessToken.trim()
      ? input.existingAccessToken
      : await marketApi.generateSellerAccessToken(input.providerId);
  const endpoint = await marketApi.startCloudflareTunnel(SELLER_TUNNEL_PORT);

  return { endpoint, accessToken };
}
```

Friend start:

```ts
const startedAt = Date.now();
const { endpoint, accessToken } = await ensureShareEndpointAndToken({
  providerId: provider.id,
  existingEndpoint: shareConfig.friend.endpoint,
  existingAccessToken: shareConfig.friend.accessToken,
});

await saveShareConfig({
  ...shareConfig,
  friend: {
    ...shareConfig.friend,
    enabled: true,
    status: "running",
    endpoint,
    accessToken,
    startedAt,
    lastError: null,
  },
});
```

Market start:

```ts
const startedAt = Date.now();
const { endpoint, accessToken } = await ensureShareEndpointAndToken({
  providerId: provider.id,
  existingEndpoint: shareConfig.market.endpoint,
  existingAccessToken: shareConfig.market.accessToken,
});

const pricePer1kTokens =
  shareConfig.market.pricingStrategy === "provider"
    ? 0
    : Math.max(0, Math.round(shareConfig.market.pricePer1kTokens ?? 0));

await marketApi.startSellingTokens({
  providerId: provider.id,
  modelName: provider.name,
  pricePer1kTokens,
  endpoint,
});

await saveShareConfig({
  ...shareConfig,
  market: {
    ...shareConfig.market,
    enabled: true,
    status: "running",
    endpoint,
    accessToken,
    startedAt,
    lastPublishedAt: startedAt,
    lastError: null,
  },
});
```

Error state:

```ts
await saveShareConfig({
  ...shareConfig,
  friend: {
    ...shareConfig.friend,
    enabled: false,
    status: "error",
    lastError: error instanceof Error ? error.message : String(error),
  },
});
```

Use the same pattern for market errors.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test:unit -- src/components/providers/__tests__/ProviderShareSettingsDialog.test.tsx`

Expected: PASS for layout and flow tests.

## Task 4: Wire The Dialog Into Provider Actions And Persistence

**Files:**
- Modify: `src/components/providers/ProviderActions.tsx`
- Modify: `src/components/providers/ProviderCard.tsx`
- Modify: `src/hooks/useProviderActions.ts`
- Modify: `src/components/providers/__tests__/ProviderShareSettingsDialog.test.tsx`

- [ ] **Step 1: Add failing integration test**

```tsx
it("opens the V10 share settings dialog from provider actions", async () => {
  const user = userEvent.setup();

  render(
    <ProviderActions
      appId="codex"
      isCurrent={false}
      onSwitch={vi.fn()}
      onEdit={vi.fn()}
      onDuplicate={vi.fn()}
      onDelete={vi.fn()}
      provider={{
        id: "provider-1",
        name: "Codex",
        settingsConfig: {},
        websiteUrl: "https://openai.com/chatgpt/pricing",
      }}
      onSaveShareConfig={vi.fn()}
    />,
  );

  await user.click(screen.getByRole("button", { name: /分享设置/i }));

  expect(screen.getByRole("dialog", { name: /分享设置/i })).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "分享拼车" })).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "卖了换钱" })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test:unit -- src/components/providers/__tests__/ProviderShareSettingsDialog.test.tsx`

Expected: FAIL because `ProviderActions` still renders `ProviderSellerPopover`.

- [ ] **Step 3: Update action props and rendering**

Change `ProviderActionsProps` to accept the provider object and share config save callback:

```ts
import { ProviderShareSettingsDialog } from "@/components/providers/ProviderShareSettingsDialog";
import type { Provider, ProviderShareConfig } from "@/types";

interface ProviderActionsProps {
  provider?: Provider;
  onSaveShareConfig?: (config: ProviderShareConfig) => Promise<void> | void;
}
```

Render the share button:

```tsx
{provider && onSaveShareConfig && (
  <ProviderShareSettingsDialog
    appId={appId ?? "claude"}
    provider={provider}
    onSaveShareConfig={onSaveShareConfig}
  />
)}
```

Remove the `ProviderSellerPopover` import after this render path is active.

- [ ] **Step 4: Update ProviderCard to pass provider and save callback**

```tsx
<ProviderActions
  appId={appId}
  provider={provider}
  onSaveShareConfig={
    onSaveShareConfig
      ? (config) => onSaveShareConfig(provider, config)
      : undefined
  }
/>
```

- [ ] **Step 5: Add persistence callback in `useProviderActions`**

```ts
const updateShareConfig = useCallback(
  async (provider: Provider, shareConfig: ProviderShareConfig) => {
    await updateProvider({
      ...provider,
      meta: {
        ...provider.meta,
        shareConfig,
      },
    });
  },
  [updateProvider],
);
```

Return `updateShareConfig` from the hook next to the existing `updateSellerConfig`. Keep `updateSellerConfig` until all call sites move to `updateShareConfig`.

- [ ] **Step 6: Run integration tests**

Run: `pnpm test:unit -- src/components/providers/__tests__/ProviderShareSettingsDialog.test.tsx`

Expected: PASS.

## Task 5: Add Runtime Stats Data Queries

**Files:**
- Modify: `src/components/providers/ProviderShareSettingsDialog.tsx`
- Modify: `src/components/providers/__tests__/ProviderShareSettingsDialog.test.tsx`

- [ ] **Step 1: Add failing stat query test**

```tsx
vi.mock("@/lib/api/proxy", () => ({
  proxyApi: {
    getProxyStatus: vi.fn().mockResolvedValue({
      running: true,
      address: "127.0.0.1",
      port: 15721,
      active_connections: 3,
      total_requests: 10,
      success_requests: 10,
      failed_requests: 0,
      success_rate: 100,
      uptime_seconds: 60,
      current_provider: "Codex",
      current_provider_id: "provider-1",
      last_request_at: null,
      last_error: null,
      failover_count: 0,
    }),
  },
}));

vi.mock("@/lib/api/usage", () => ({
  usageApi: {
    getProviderStats: vi.fn().mockResolvedValue([
      {
        provider_id: "provider-1",
        provider_name: "Codex",
        request_count: 4,
        total_tokens: 18420,
        total_cost: "0",
        success_rate: 100,
        avg_latency_ms: 100,
      },
    ]),
  },
}));

it("shows live runtime stats for the active provider", async () => {
  render(
    <ProviderShareSettingsDialog
      appId="codex"
      provider={{
        id: "provider-1",
        name: "Codex",
        settingsConfig: {},
        meta: {
          shareConfig: {
            friend: {
              enabled: true,
              status: "running",
              startedAt: 1_776_996_815_000,
              lastError: null,
            },
            market: {
              enabled: false,
              status: "idle",
              pricingStrategy: "provider",
              lastError: null,
              lastPublishedAt: null,
            },
          },
        },
      }}
      open={true}
      onOpenChange={vi.fn()}
      onSaveShareConfig={vi.fn()}
    />,
  );

  expect(await screen.findByText("运行中")).toBeInTheDocument();
  expect(await screen.findByText("3")).toBeInTheDocument();
  expect(await screen.findByText("18,420")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test:unit -- src/components/providers/__tests__/ProviderShareSettingsDialog.test.tsx`

Expected: FAIL because the dialog still uses static stats.

- [ ] **Step 3: Implement React Query data reads**

Use these query calls in `ProviderShareSettingsDialog`:

```ts
const startedAt =
  shareConfig.friend.startedAt && shareConfig.market.startedAt
    ? Math.min(shareConfig.friend.startedAt, shareConfig.market.startedAt)
    : shareConfig.friend.startedAt ?? shareConfig.market.startedAt;

const proxyStatusQuery = useQuery({
  queryKey: ["provider-share", "proxy-status"],
  queryFn: () => proxyApi.getProxyStatus(),
  refetchInterval: 2000,
});

const providerStatsQuery = useQuery({
  queryKey: [
    "provider-share",
    "provider-stats",
    provider.id,
    appId,
    startedAt ?? 0,
  ],
  queryFn: () => usageApi.getProviderStats(startedAt, undefined, appId),
  enabled: Boolean(startedAt),
  refetchInterval: 5000,
});

const providerTokensSinceStart =
  providerStatsQuery.data?.find((row) => row.provider_id === provider.id)
    ?.total_tokens ?? 0;

const runtimeStats = deriveShareRuntimeStats({
  shareConfig,
  proxyStatus: proxyStatusQuery.data,
  providerTokensSinceStart,
});
```

- [ ] **Step 4: Run stat tests**

Run: `pnpm test:unit -- src/components/providers/__tests__/ProviderShareSettingsDialog.test.tsx`

Expected: PASS.

## Task 6: Add V10 Copy And Remove Old Popover Surface

**Files:**
- Modify: `src/i18n/locales/zh.json`
- Modify: `src/i18n/locales/en.json`
- Modify: `src/i18n/locales/ja.json`
- Delete: `src/components/providers/ProviderSellerPopover.tsx`
- Modify: `src/components/providers/__tests__/ProviderSellerPopover.test.tsx`

- [ ] **Step 1: Add locale keys**

Chinese:

```json
{
  "provider": {
    "shareSettings": "分享设置",
    "shareSettingsFor": "{{name}} 的分享设置",
    "shareSettingsDescription": "当前供应商的拼车与市场发布配置",
    "shareRuntimeChannelStatus": "通道状态",
    "shareRuntimeConnections": "当前连接数",
    "shareRuntimeTokens": "本次启动已使用 Token",
    "shareRuntimeRunning": "运行中",
    "shareRuntimeStarting": "启动中",
    "shareRuntimeIdle": "未运行",
    "shareRuntimeError": "异常",
    "friendShare": "分享拼车",
    "friendShareDescription": "点击胶囊后自动启动通道、生成 token 和好友导入链接。",
    "friendShareEnable": "分享拼车",
    "marketShare": "卖了换钱",
    "marketShareDescription": "点击胶囊后依次检查账户、启动通道、测试模型、读取定价并发布市场。",
    "marketShareEnable": "允许市场售卖",
    "shareSwitchOff": "关闭",
    "shareSwitchStarting": "启动中...",
    "shareSwitchRunning": "运行中",
    "clawTipAccount": "ClawTip 收款账户",
    "clawTipUnbound": "未绑定",
    "clawTipPending": "待检测",
    "followProviderPricing": "跟随服务商定价",
    "followProviderPricingHint": "无需额外设置，保存后可直接发布。",
    "customSellingPrice": "自定义售价",
    "customSellingPriceHint": "按模型编辑 USTC / 百万 TOKEN 的输入、输出价格。"
  }
}
```

English:

```json
{
  "provider": {
    "shareSettings": "Share settings",
    "shareSettingsFor": "Share settings for {{name}}",
    "shareSettingsDescription": "Configure friend sharing and market publishing for this provider",
    "shareRuntimeChannelStatus": "Channel status",
    "shareRuntimeConnections": "Current connections",
    "shareRuntimeTokens": "Tokens used this run",
    "shareRuntimeRunning": "Running",
    "shareRuntimeStarting": "Starting",
    "shareRuntimeIdle": "Not running",
    "shareRuntimeError": "Error",
    "friendShare": "Friend sharing",
    "friendShareDescription": "Start the channel, generate a token, and create a friend import link.",
    "friendShareEnable": "Friend sharing",
    "marketShare": "Sell for money",
    "marketShareDescription": "Check account, start channel, test models, read pricing, and publish to market.",
    "marketShareEnable": "Allow market selling",
    "shareSwitchOff": "Off",
    "shareSwitchStarting": "Starting...",
    "shareSwitchRunning": "Running",
    "clawTipAccount": "ClawTip payout account",
    "clawTipUnbound": "Unbound",
    "clawTipPending": "Pending",
    "followProviderPricing": "Follow provider pricing",
    "followProviderPricingHint": "No extra setup required. Save and publish directly.",
    "customSellingPrice": "Custom price",
    "customSellingPriceHint": "Edit input and output prices in USTC per million tokens."
  }
}
```

Japanese:

```json
{
  "provider": {
    "shareSettings": "共有設定",
    "shareSettingsFor": "{{name}} の共有設定",
    "shareSettingsDescription": "このプロバイダーの友人共有と市場公開を設定します",
    "shareRuntimeChannelStatus": "チャネル状態",
    "shareRuntimeConnections": "現在の接続数",
    "shareRuntimeTokens": "今回の起動で使用した Token",
    "shareRuntimeRunning": "実行中",
    "shareRuntimeStarting": "起動中",
    "shareRuntimeIdle": "未実行",
    "shareRuntimeError": "異常",
    "friendShare": "友人共有",
    "friendShareDescription": "チャネルを起動し、token と友人用インポートリンクを生成します。",
    "friendShareEnable": "友人共有",
    "marketShare": "販売する",
    "marketShareDescription": "アカウント確認、チャネル起動、モデルテスト、価格取得、市場公開を行います。",
    "marketShareEnable": "市場販売を許可",
    "shareSwitchOff": "オフ",
    "shareSwitchStarting": "起動中...",
    "shareSwitchRunning": "実行中",
    "clawTipAccount": "ClawTip 受取アカウント",
    "clawTipUnbound": "未連携",
    "clawTipPending": "確認待ち",
    "followProviderPricing": "プロバイダー価格に従う",
    "followProviderPricingHint": "追加設定なしで保存後すぐ公開できます。",
    "customSellingPrice": "カスタム価格",
    "customSellingPriceHint": "100万 Token あたりの入力・出力価格を USTC で編集します。"
  }
}
```

- [ ] **Step 2: Remove old popover imports and tests**

Delete `src/components/providers/ProviderSellerPopover.tsx` after `ProviderActions` imports `ProviderShareSettingsDialog`.

Move still-useful tests from `ProviderSellerPopover.test.tsx` into `ProviderShareSettingsDialog.test.tsx`:

- shared provider deeplink construction
- copy share link success toast
- market API payload mapping

Then remove `ProviderSellerPopover.test.tsx` if no test remains tied to that filename.

- [ ] **Step 3: Run focused tests**

Run: `pnpm test:unit -- src/components/providers/__tests__/ProviderShareSettingsDialog.test.tsx src/components/providers/__tests__/providerShareSettingsUtils.test.ts`

Expected: PASS.

## Task 7: Final Verification

**Files:**
- All files changed by Tasks 1-6.

- [ ] **Step 1: Run TypeScript checks**

Run: `pnpm typecheck`

Expected: exit 0.

- [ ] **Step 2: Run focused provider tests**

Run: `pnpm test:unit -- src/components/providers/__tests__/ProviderShareSettingsDialog.test.tsx src/components/providers/__tests__/providerShareSettingsUtils.test.ts src/components/providers/__tests__/ProviderSellerPopover.test.tsx`

Expected: exit 0 if `ProviderSellerPopover.test.tsx` still exists; omit that filename after the file is deleted.

- [ ] **Step 3: Run related existing provider tests**

Run: `pnpm test:unit -- tests/hooks/useProviderActions.test.tsx tests/components/ProviderList.test.tsx`

Expected: exit 0.

- [ ] **Step 4: Run a renderer build**

Run: `pnpm build:renderer`

Expected: exit 0.

- [ ] **Step 5: Manual browser check**

Run: `pnpm dev:renderer`

Open the rendered app, hover a provider card, click the share settings action, and verify:

- Dialog opens with provider header.
- Runtime strip has `通道状态`, `当前连接数`, `本次启动已使用 Token`.
- `分享拼车` and `卖了换钱` tabs switch without layout jump.
- Both tabs use matching capsule switches.
- The left step list is absent.
- The `发布前检查` block is absent.
- Friend share start shows copy actions after success.
- Market start leaves the account card and pricing card visible after success.

- [ ] **Step 6: Commit**

```bash
git add src/types.ts \
  src/components/providers/providerShareSettingsUtils.ts \
  src/components/providers/ProviderShareSettingsDialog.tsx \
  src/components/providers/ProviderActions.tsx \
  src/components/providers/ProviderCard.tsx \
  src/hooks/useProviderActions.ts \
  src/i18n/locales/zh.json \
  src/i18n/locales/en.json \
  src/i18n/locales/ja.json \
  src/components/providers/__tests__/providerShareSettingsUtils.test.ts \
  src/components/providers/__tests__/ProviderShareSettingsDialog.test.tsx
git commit -m "feat: add provider share settings v10"
```

## Self-Review

- Spec coverage: The plan covers the V10 status strip, two tabs, matching capsule switches, friend flow, market flow, removed side step list, removed pre-publish checklist, persistence, and runtime stats.
- Placeholder scan: No task depends on undefined labels or open decisions.
- Type consistency: `ProviderShareConfig`, `ProviderFriendShareConfig`, `ProviderMarketShareConfig`, and `ProviderShareStatus` are introduced in Task 1 and reused by every later task.
- Scope check: ClawTip account binding is displayed as a V10 card in this slice; live ClawTip account API integration is intentionally outside this implementation because the current codebase has no ClawTip API surface.
