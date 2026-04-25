import type {
  ProviderMeta,
  ProviderShareConfig,
  ProviderShareStatus,
  ProviderSellerConfig,
} from "@/types";
import type { SellerRuntimeStatus } from "@/lib/api/market";

interface ProxyStatusLike {
  running?: boolean;
  active_connections?: number;
}

export interface DeriveShareRuntimeStatsInput {
  shareConfig: ProviderShareConfig;
  proxyStatus?: ProxyStatusLike | null;
  sellerRuntimeStatus?: SellerRuntimeStatus | null;
  providerTokensSinceStart: number;
}

export interface ShareRuntimeStats {
  channelStatus: ProviderShareStatus;
  channelStatusLabel: string;
  activeConnections: number;
  tokensUsedThisRun: number;
  tokensUsedThisRunLabel: string;
}

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
    discountPercent: 100,
    lastError: null,
    lastPublishedAt: null,
  },
};

const statusLabels: Record<ProviderShareStatus, string> = {
  running: "运行中",
  starting: "启动中",
  error: "异常",
  idle: "未运行",
};

export function toProviderShareConfig(
  meta?: ProviderMeta,
): ProviderShareConfig {
  const legacyMarketConfig = toMarketConfigFromSellerConfig(meta?.sellerConfig);
  const marketConfig = {
    ...idleShareConfig.market,
    ...legacyMarketConfig,
    ...meta?.shareConfig?.market,
  };

  return {
    friend: {
      ...idleShareConfig.friend,
      ...meta?.shareConfig?.friend,
    },
    market: {
      ...marketConfig,
      discountPercent: normalizeMarketDiscountPercent(
        marketConfig.discountPercent,
      ),
    },
  };
}

export function normalizeMarketDiscountPercent(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 100;
  }

  return Math.min(100, Math.max(50, Math.round(value / 5) * 5));
}

export function formatTokenCount(value: number): string {
  if (!Number.isFinite(value) || value < 0) {
    return "0";
  }

  return Math.floor(value).toLocaleString("en-US");
}

export function deriveShareRuntimeStats(
  input: DeriveShareRuntimeStatsInput,
): ShareRuntimeStats {
  const channelStatus = deriveChannelStatus(
    input.shareConfig,
    input.sellerRuntimeStatus,
  );
  const tokensUsedThisRun = normalizeCount(input.providerTokensSinceStart);
  const activeConnections =
    channelStatus === "running" && input.proxyStatus?.running === true
      ? normalizeCount(input.proxyStatus.active_connections ?? 0)
      : 0;

  return {
    channelStatus,
    channelStatusLabel: statusLabels[channelStatus],
    activeConnections,
    tokensUsedThisRun,
    tokensUsedThisRunLabel: formatTokenCount(tokensUsedThisRun),
  };
}

function toMarketConfigFromSellerConfig(
  sellerConfig?: ProviderSellerConfig,
): Partial<ProviderShareConfig["market"]> {
  if (!sellerConfig) {
    return {};
  }

  const marketConfig: Partial<ProviderShareConfig["market"]> = {
    enabled: sellerConfig.enabled ?? false,
    status: toShareStatusFromSellerStatus(sellerConfig.status),
    pricingStrategy: "provider",
    lastPublishedAt: sellerConfig.lastPublishedAt ?? null,
    lastError: sellerConfig.lastError ?? null,
  };

  if (typeof sellerConfig.pricePer1kTokens === "number") {
    marketConfig.pricePer1kTokens = sellerConfig.pricePer1kTokens;
  }

  if (sellerConfig.endpoint) {
    marketConfig.endpoint = sellerConfig.endpoint;
  }

  if (sellerConfig.accessToken) {
    marketConfig.accessToken = sellerConfig.accessToken;
  }

  if (typeof sellerConfig.lastPublishedAt === "number") {
    marketConfig.startedAt = sellerConfig.lastPublishedAt;
  }

  return marketConfig;
}

function toShareStatusFromSellerStatus(
  status: ProviderSellerConfig["status"],
): ProviderShareStatus {
  if (status === "active_free" || status === "active_paid") {
    return "running";
  }

  if (status === "starting" || status === "error") {
    return status;
  }

  return "idle";
}

function deriveChannelStatus(
  shareConfig: ProviderShareConfig,
  sellerRuntimeStatus?: SellerRuntimeStatus | null,
): ProviderShareStatus {
  const statuses = [shareConfig.friend.status, shareConfig.market.status];

  if (statuses.includes("running")) {
    if (sellerRuntimeStatus && sellerRuntimeStatus.status !== "running") {
      return statuses.includes("starting") ? "starting" : "idle";
    }
    return "running";
  }

  if (statuses.includes("starting")) {
    return "starting";
  }

  if (statuses.includes("error")) {
    return "error";
  }

  return "idle";
}

function normalizeCount(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }

  return Math.floor(value);
}
