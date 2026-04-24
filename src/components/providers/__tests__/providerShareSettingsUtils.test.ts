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

  it("reports running when one channel is running and the other is starting", () => {
    const stats = deriveShareRuntimeStats({
      shareConfig: {
        friend: {
          enabled: true,
          status: "running",
          lastError: null,
        },
        market: {
          enabled: true,
          status: "starting",
          pricingStrategy: "provider",
          lastError: null,
          lastPublishedAt: null,
        },
      },
      proxyStatus: {
        running: true,
        active_connections: 1,
      },
      providerTokensSinceStart: 12,
    });

    expect(stats.channelStatus).toBe("running");
    expect(stats.channelStatusLabel).toBe("运行中");
  });

  it("formats token counts as whole numbers", () => {
    expect(formatTokenCount(0)).toBe("0");
    expect(formatTokenCount(18420)).toBe("18,420");
    expect(formatTokenCount(-7)).toBe("0");
  });
});
