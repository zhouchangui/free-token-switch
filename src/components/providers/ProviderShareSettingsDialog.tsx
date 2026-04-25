import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Copy, ExternalLink, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type {
  AppId,
  SellerPricingSuggestion,
  SellerRuntimeStatus,
} from "@/lib/api";
import { marketApi } from "@/lib/api";
import { streamCheckProvider } from "@/lib/api/model-test";
import { proxyApi } from "@/lib/api/proxy";
import { settingsApi } from "@/lib/api/settings";
import { usageApi } from "@/lib/api/usage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProviderIcon } from "@/components/ProviderIcon";
import { FullScreenPanel } from "@/components/common/FullScreenPanel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type {
  Provider,
  ProviderShareConfig,
  ProviderShareStatus,
} from "@/types";
import type { ProviderStats } from "@/types/usage";
import {
  deriveShareRuntimeStats,
  normalizeMarketDiscountPercent,
  toProviderShareConfig,
  type ShareRuntimeStats,
} from "@/components/providers/providerShareSettingsUtils";
import { cn } from "@/lib/utils";

const SELLER_TUNNEL_PORT = 15721;
const CLAWTIP_URL = "https://clawtip.jd.com";
const MARKET_PRICE_UNIT = "PER_1M_TOKENS" as const;
const MARKET_PRICE_VERSION = 1;
const MARKET_DISCOUNT_MIN = 50;
const MARKET_DISCOUNT_MAX = 100;
const MARKET_DISCOUNT_STEP = 5;

type ShareStartupStepState = "pending" | "active" | "done" | "error";
type ShareStartupErrorCode =
  | "cloudflared_missing"
  | "local_proxy_unavailable"
  | "network_timeout"
  | "clawtip_unbound"
  | "provider_config_invalid"
  | "provider_quota_or_rate_limited"
  | "pricing_invalid"
  | "pricing_unavailable"
  | "market_publish_failed"
  | "persist_failed"
  | "unknown";
type ShareStartupAction =
  | "copy_install_command"
  | "start_proxy"
  | "open_clawtip"
  | "fill_clawtip_wallet"
  | "retry"
  | "copy_log";
type FriendStartupStep = "tunnel" | "token" | "link";
type MarketStartupStep =
  | "account"
  | "tunnel"
  | "modelTest"
  | "pricing"
  | "publish";
type MarketPricingStrategy = ProviderShareConfig["market"]["pricingStrategy"];
type TranslationFn = ReturnType<typeof useTranslation>["t"];

type ShareStartupStep<TStep extends string> = {
  id: TStep;
  label: string;
};

type ShareStartupError = {
  code: ShareStartupErrorCode;
  title: string;
  description: string;
  primaryAction: ShareStartupAction;
  primaryActionLabel: string;
  secondaryAction?: ShareStartupAction;
  secondaryActionLabel?: string;
  suppressCopyLog?: boolean;
  command?: string;
  log?: string;
};

type ShareStartupState<TStep extends string> = {
  currentStep: TStep | null;
  completedSteps: TStep[];
  error: ShareStartupError | null;
  logs?: string[];
};

type ProxyStatusResult = Awaited<ReturnType<typeof proxyApi.getProxyStatus>>;
type CloudflaredStatusResult = Awaited<
  ReturnType<typeof marketApi.checkCloudflared>
>;

type StartupFailure = {
  __startupFailure: true;
  startupError: ShareStartupError;
};

function emptyStartupState<TStep extends string>(): ShareStartupState<TStep> {
  return {
    currentStep: null,
    completedSteps: [],
    error: null,
    logs: [],
  };
}

function startupFailure(error: ShareStartupError): StartupFailure {
  return {
    __startupFailure: true,
    startupError: error,
  };
}

function isStartupFailure(error: unknown): error is StartupFailure {
  return (
    typeof error === "object" &&
    error !== null &&
    "__startupFailure" in error &&
    (error as StartupFailure).__startupFailure === true
  );
}

function appendStartupLog(logs: string[], log?: string | null): string[] {
  if (!log || logs.includes(log)) {
    return logs;
  }

  return [...logs, log];
}

function isShareChannelActive(config: { status: ProviderShareStatus }) {
  return config.status === "running" || config.status === "starting";
}

function formatProxyRunningLog(
  t: TranslationFn,
  proxyStatus: ProxyStatusResult,
) {
  const connections =
    typeof proxyStatus.active_connections === "number"
      ? proxyStatus.active_connections
      : 0;

  return t("provider.shareStartupLogProxyRunningDetailed", {
    defaultValue:
      "本地代理已运行：127.0.0.1:{{port}}，当前连接数 {{connections}}",
    port: SELLER_TUNNEL_PORT,
    connections,
  });
}

function formatCloudflaredInstalledLog(
  t: TranslationFn,
  cloudflared: CloudflaredStatusResult,
) {
  return t("provider.shareStartupLogCloudflaredInstalledDetailed", {
    defaultValue: "cloudflared 已安装：{{version}}\n路径：{{path}}",
    version:
      cloudflared.version ??
      t("provider.shareStartupLogUnknownVersion", {
        defaultValue: "未知版本",
      }),
    path:
      cloudflared.path ??
      t("provider.shareStartupLogUnknownPath", {
        defaultValue: "未返回路径",
      }),
  });
}

function formatTunnelCommandLog(t: TranslationFn) {
  return t("provider.shareStartupLogTunnelCommand", {
    defaultValue: "准备启动 cloudflared tunnel --url http://localhost:{{port}}",
    port: SELLER_TUNNEL_PORT,
  });
}

export function buildSharedProviderLink(input: {
  appId?: AppId;
  providerName: string;
  endpoint: string;
  accessToken: string;
  recommendedModel?: string;
}) {
  const params = new URLSearchParams({
    resource: "provider",
    app: input.appId ?? "claude",
    name: `${input.providerName} (Shared)`,
    endpoint: input.endpoint,
    apiKey: input.accessToken,
    enabled: "false",
    providerType: "shared_seller",
    shareMode: "free",
    requiresModelSelection: "true",
  });

  if (input.recommendedModel) {
    params.set("model", input.recommendedModel);
  }

  return `tokensbuddy://v1/import?${params.toString()}`;
}

export interface ProviderShareSettingsDialogProps {
  appId: AppId;
  provider: Provider;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaveShareConfig: (config: ProviderShareConfig) => Promise<void> | void;
}

export function ProviderShareSettingsDialog({
  appId,
  provider,
  open,
  onOpenChange,
  onSaveShareConfig,
}: ProviderShareSettingsDialogProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState("friend");
  const initialShareConfig = useMemo(
    () => toProviderShareConfig(provider.meta),
    [provider.meta],
  );
  const [shareConfig, setShareConfig] =
    useState<ProviderShareConfig>(initialShareConfig);
  const [friendStartup, setFriendStartup] = useState<
    ShareStartupState<FriendStartupStep>
  >(() => emptyStartupState());
  const [marketStartup, setMarketStartup] = useState<
    ShareStartupState<MarketStartupStep>
  >(() => emptyStartupState());
  const shareConfigRef = useRef(initialShareConfig);
  const friendStartOpRef = useRef(0);
  const marketStartOpRef = useRef(0);
  const providerIdRef = useRef(provider.id);
  const startedAt = useMemo(() => {
    const startedAtValues = [
      shareConfig.friend.startedAt,
      shareConfig.market.startedAt,
    ].filter(
      (value): value is number =>
        typeof value === "number" && Number.isFinite(value),
    );

    return startedAtValues.length > 0
      ? Math.min(...startedAtValues)
      : undefined;
  }, [shareConfig.friend.startedAt, shareConfig.market.startedAt]);
  const proxyStatusQuery = useQuery({
    queryKey: ["provider-share", "proxy-status"],
    queryFn: () => proxyApi.getProxyStatus(),
    enabled: open,
    refetchInterval: 2000,
  });
  const shouldReadRuntimeStatus =
    shareConfig.friend.status === "running" ||
    shareConfig.market.status === "running";
  const runtimeStatusQuery = useQuery({
    queryKey: ["provider-share", "seller-runtime-status", provider.id],
    queryFn: () => marketApi.getSellerRuntimeStatus(provider.id),
    enabled: open && shouldReadRuntimeStatus,
    refetchInterval: open && shouldReadRuntimeStatus ? 2000 : false,
  });
  const effectiveRuntimeStatus: SellerRuntimeStatus | null =
    runtimeStatusQuery.data ??
    (shouldReadRuntimeStatus
      ? {
          providerId: provider.id,
          tunnelRunning: false,
          hasActiveToken: false,
          status: "idle",
        }
      : null);
  const providerStatsQuery = useQuery({
    queryKey: [
      "provider-share",
      "provider-stats",
      provider.id,
      appId,
      startedAt ?? 0,
    ],
    queryFn: () => usageApi.getProviderStats(startedAt, undefined, appId),
    enabled: open && Boolean(startedAt),
    refetchInterval: 5000,
  });
  const providerTokensSinceStart = useMemo(() => {
    const providerStatsRows: ProviderStats[] | undefined =
      providerStatsQuery.data;
    const providerStatsRow = providerStatsRows?.find(
      (row) => row.providerId === provider.id,
    );

    return providerStatsRow?.totalTokens ?? 0;
  }, [providerStatsQuery.data, provider.id]);
  const runtimeStats = useMemo(
    () =>
      deriveShareRuntimeStats({
        shareConfig,
        proxyStatus: proxyStatusQuery.data,
        sellerRuntimeStatus: effectiveRuntimeStatus,
        providerTokensSinceStart,
      }),
    [
      effectiveRuntimeStatus,
      providerTokensSinceStart,
      proxyStatusQuery.data,
      shareConfig,
    ],
  );

  useEffect(() => {
    const providerChanged = providerIdRef.current !== provider.id;
    providerIdRef.current = provider.id;
    shareConfigRef.current = initialShareConfig;
    setShareConfig(initialShareConfig);
    setFriendStartup((currentStartup) =>
      providerChanged || !currentStartup.error
        ? emptyStartupState()
        : currentStartup,
    );
    setMarketStartup((currentStartup) =>
      providerChanged || !currentStartup.error
        ? emptyStartupState()
        : currentStartup,
    );
  }, [initialShareConfig, provider.id]);

  const setShareConfigPatch = (
    updater: (current: ProviderShareConfig) => ProviderShareConfig,
  ) => {
    const nextConfig = updater(shareConfigRef.current);
    shareConfigRef.current = nextConfig;
    setShareConfig(nextConfig);
    return nextConfig;
  };

  const saveShareConfigPatch = async (
    updater: (current: ProviderShareConfig) => ProviderShareConfig,
  ) => {
    const nextConfig = setShareConfigPatch(updater);
    await Promise.resolve(onSaveShareConfig(nextConfig));
  };

  const updateFriendEnabled = async (enabled: boolean) => {
    const current = shareConfigRef.current;

    if (current.friend.status === "starting") {
      return;
    }

    if (!enabled) {
      friendStartOpRef.current += 1;
      setFriendStartup(emptyStartupState());
      await marketApi.stopSellingTokens(provider.id);
      await saveShareConfigPatch((latest) => ({
        ...latest,
        friend: {
          ...latest.friend,
          enabled: false,
          status: "idle",
          lastError: null,
        },
      }));
      return;
    }

    const operationId = (friendStartOpRef.current += 1);
    marketStartOpRef.current += 1;
    setMarketStartup(emptyStartupState());
    let currentStep: FriendStartupStep = "tunnel";
    let completedSteps: FriendStartupStep[] = [];
    let startupLogs = [
      t("provider.friendShareStartupLogBegin", {
        defaultValue: "开始启动好友分享通道",
      }),
      t("provider.shareStartupLogCheckProxy", {
        defaultValue: "检查本地代理状态",
      }),
    ];
    const setFriendStartupStep = (
      state: Omit<ShareStartupState<FriendStartupStep>, "logs">,
    ) => {
      setFriendStartup({
        ...state,
        logs: startupLogs,
      });
    };
    const addFriendStartupLog = (log: string) => {
      startupLogs = appendStartupLog(startupLogs, log);
      setFriendStartup((latest) => ({
        ...latest,
        logs: startupLogs,
      }));
    };

    setFriendStartupStep({
      currentStep,
      completedSteps,
      error: null,
    });
    setShareConfigPatch((latest) => ({
      ...latest,
      friend: {
        ...latest.friend,
        enabled: true,
        status: "starting",
        lastError: null,
      },
      market: isShareChannelActive(latest.market)
        ? {
            ...latest.market,
            enabled: false,
            status: "idle",
            lastError: null,
          }
        : latest.market,
    }));

    try {
      if (isShareChannelActive(current.market)) {
        addFriendStartupLog(
          t("provider.friendShareStartupLogStopMarket", {
            defaultValue: "自动关闭卖了换钱通道",
          }),
        );
        await marketApi.stopSellingTokens(provider.id);
      }

      const proxyStatus = await proxyApi.getProxyStatus();
      if (!proxyStatus.running) {
        throw startupFailure({
          code: "local_proxy_unavailable",
          title: t("provider.shareStartupLocalProxyTitle", {
            defaultValue: "本地代理未启动",
          }),
          description: t("provider.shareStartupLocalProxyDescription", {
            defaultValue:
              "需要先启动 TokensBuddy 本地代理，好友才能通过分享通道访问当前供应商。",
          }),
          primaryAction: "start_proxy",
          primaryActionLabel: t("provider.shareStartupActionStartProxy", {
            defaultValue: "启动/重启代理",
          }),
          log: "local proxy is not running",
        });
      }
      addFriendStartupLog(formatProxyRunningLog(t, proxyStatus));

      addFriendStartupLog(
        t("provider.shareStartupLogCheckCloudflared", {
          defaultValue: "本地代理已运行，检查 cloudflared",
        }),
      );
      const cloudflared = await marketApi.checkCloudflared();
      if (!cloudflared.installed) {
        throw startupFailure({
          code: "cloudflared_missing",
          title: t("provider.shareStartupCloudflaredMissingTitle", {
            defaultValue: "未检测到 cloudflared",
          }),
          description: t("provider.shareStartupCloudflaredMissingDescription", {
            defaultValue:
              "需要先安装 cloudflared 才能创建临时分享通道。复制命令后在终端执行，再回来重试。",
          }),
          primaryAction: "copy_install_command",
          primaryActionLabel: t(
            "provider.shareStartupActionCopyInstallCommand",
            {
              defaultValue: "复制安装命令",
            },
          ),
          command: cloudflared.installCommand,
          log: `cloudflared missing. install command: ${cloudflared.installCommand}`,
        });
      }

      addFriendStartupLog(formatCloudflaredInstalledLog(t, cloudflared));
      addFriendStartupLog(formatTunnelCommandLog(t));
      const endpoint =
        await marketApi.startCloudflareTunnel(SELLER_TUNNEL_PORT);

      if (friendStartOpRef.current !== operationId) {
        return;
      }

      addFriendStartupLog(
        t("provider.shareStartupLogTunnelReady", {
          defaultValue: "分享通道已启动：{{endpoint}}",
          endpoint,
        }),
      );
      completedSteps = ["tunnel"];
      currentStep = "token";
      setFriendStartupStep({
        currentStep,
        completedSteps,
        error: null,
      });
      addFriendStartupLog(
        t("provider.friendShareStartupLogToken", {
          defaultValue: "生成访问令牌",
        }),
      );
      const accessToken = await marketApi.generateSellerAccessToken(
        provider.id,
      );

      if (friendStartOpRef.current !== operationId) {
        return;
      }

      completedSteps = ["tunnel", "token"];
      currentStep = "link";
      setFriendStartupStep({
        currentStep,
        completedSteps,
        error: null,
      });
      addFriendStartupLog(
        t("provider.friendShareStartupLogLink", {
          defaultValue: "生成好友导入链接",
        }),
      );
      buildSharedProviderLink({
        appId,
        providerName: provider.name,
        endpoint,
        accessToken,
      });

      const startedAt = Date.now();
      await saveShareConfigPatch((latest) => ({
        ...latest,
        friend: {
          ...latest.friend,
          enabled: true,
          status: "running",
          endpoint,
          accessToken,
          startedAt,
          lastError: null,
        },
        market: {
          ...latest.market,
          enabled: false,
          status: "idle",
          lastError: null,
        },
      }));
      if (friendStartOpRef.current === operationId) {
        void runtimeStatusQuery.refetch();
        setFriendStartup(emptyStartupState());
      }
    } catch (error) {
      if (friendStartOpRef.current !== operationId) {
        return;
      }
      const startupError = isStartupFailure(error)
        ? error.startupError
        : toShareStartupError({
            error,
            fallbackCode:
              currentStep === "link"
                ? "persist_failed"
                : classifyTunnelErrorCode(error),
            fallbackTitle:
              currentStep === "link"
                ? t("provider.shareStartupPersistFailedTitle", {
                    defaultValue: "保存分享配置失败",
                  })
                : t("provider.shareStartupUnknownTitle", {
                    defaultValue: "启动失败",
                  }),
            fallbackDescription:
              currentStep === "link"
                ? t("provider.shareStartupPersistFailedDescription", {
                    defaultValue:
                      "通道和令牌已生成，但保存配置失败。请重试当前步骤。",
                  })
                : t("provider.shareStartupUnknownDescription", {
                    defaultValue:
                      "启动过程中遇到异常。请重试；如果仍失败，可以复制日志继续定位。",
                  }),
            retryLabel: t("provider.shareStartupActionRetry", {
              defaultValue: "重试当前步骤",
            }),
            copyLogLabel: t("provider.shareStartupActionCopyLog", {
              defaultValue: "复制日志",
            }),
            networkTimeoutTitle: t("provider.shareStartupNetworkTimeoutTitle", {
              defaultValue: "网络连接超时",
            }),
            networkTimeoutDescription: t(
              "provider.shareStartupNetworkTimeoutDescription",
              {
                defaultValue: "启动分享通道时等待超时，请确认网络可用后重试。",
              },
            ),
            cloudflaredMissingTitle: t(
              "provider.shareStartupCloudflaredMissingTitle",
              {
                defaultValue: "未检测到 cloudflared",
              },
            ),
            cloudflaredMissingDescription: t(
              "provider.shareStartupCloudflaredMissingDescription",
              {
                defaultValue:
                  "需要先安装 cloudflared 才能创建临时分享通道。复制命令后在终端执行，再回来重试。",
              },
            ),
          });
      startupLogs = appendStartupLog(startupLogs, startupError.log);
      setFriendStartup({
        currentStep,
        completedSteps,
        error: startupError,
        logs: startupLogs,
      });

      if (completedSteps.includes("tunnel") || currentStep === "link") {
        try {
          await marketApi.stopSellingTokens(provider.id);
          void runtimeStatusQuery.refetch();
        } catch (stopError) {
          addFriendStartupLog(
            t("provider.shareStartupLogStopFailed", {
              defaultValue: "清理分享通道失败：{{message}}",
              message: toErrorMessage(stopError),
            }),
          );
        }
      }

      try {
        await saveShareConfigPatch((latest) => ({
          ...latest,
          friend: {
            ...latest.friend,
            enabled: false,
            status: "error",
            lastError: startupError.title,
          },
        }));
      } catch {
        setShareConfigPatch((latest) => ({
          ...latest,
          friend: {
            ...latest.friend,
            enabled: false,
            status: "error",
            lastError: startupError.title,
          },
        }));
      }
    }
  };

  const updateMarketEnabled = async (enabled: boolean) => {
    const current = shareConfigRef.current;

    if (current.market.status === "starting") {
      return;
    }

    if (!enabled) {
      const operationId = (marketStartOpRef.current += 1);
      setMarketStartup(emptyStartupState());
      try {
        await marketApi.stopSellingTokens(provider.id);

        if (marketStartOpRef.current !== operationId) {
          return;
        }

        await saveShareConfigPatch((latest) => ({
          ...latest,
          market: {
            ...latest.market,
            enabled: false,
            status: "idle",
            lastError: null,
          },
        }));
      } catch (error) {
        if (marketStartOpRef.current !== operationId) {
          return;
        }

        try {
          await saveShareConfigPatch((latest) => ({
            ...latest,
            market: {
              ...latest.market,
              enabled: true,
              status: "error",
              lastError: toErrorMessage(error),
            },
          }));
        } catch {
          setShareConfigPatch((latest) => ({
            ...latest,
            market: {
              ...latest.market,
              enabled: true,
              status: "error",
              lastError: toErrorMessage(error),
            },
          }));
        }
      }
      return;
    }

    const operationId = (marketStartOpRef.current += 1);
    friendStartOpRef.current += 1;
    setFriendStartup(emptyStartupState());
    let currentStep: MarketStartupStep = "account";
    let completedSteps: MarketStartupStep[] = [];
    let startupLogs = [
      t("provider.marketShareStartupLogBegin", {
        defaultValue: "开始准备市场发布",
      }),
      t("provider.marketShareStartupLogAccount", {
        defaultValue: "检查 ClawTip 收款账户",
      }),
    ];
    const setMarketStartupStep = (
      state: Omit<ShareStartupState<MarketStartupStep>, "logs">,
    ) => {
      setMarketStartup({
        ...state,
        logs: startupLogs,
      });
    };
    const addMarketStartupLog = (log: string) => {
      startupLogs = appendStartupLog(startupLogs, log);
      setMarketStartup((latest) => ({
        ...latest,
        logs: startupLogs,
      }));
    };

    setMarketStartupStep({
      currentStep,
      completedSteps,
      error: null,
    });
    setShareConfigPatch((latest) => ({
      ...latest,
      market: {
        ...latest.market,
        enabled: true,
        status: "starting",
        lastError: null,
      },
      friend: isShareChannelActive(latest.friend)
        ? {
            ...latest.friend,
            enabled: false,
            status: "idle",
            lastError: null,
          }
        : latest.friend,
    }));

    try {
      if (isShareChannelActive(current.friend)) {
        addMarketStartupLog(
          t("provider.marketShareStartupLogStopFriend", {
            defaultValue: "自动关闭好友分享通道",
          }),
        );
        await marketApi.stopSellingTokens(provider.id);
      }

      const walletAddress =
        shareConfigRef.current.market.clawTipWalletAddress?.trim();
      if (!walletAddress) {
        throw startupFailure(createClawTipUnboundError(t));
      }

      completedSteps = ["account"];
      currentStep = "tunnel";
      setMarketStartupStep({
        currentStep,
        completedSteps,
        error: null,
      });
      addMarketStartupLog(
        t("provider.shareStartupLogCheckProxy", {
          defaultValue: "检查本地代理状态",
        }),
      );

      const proxyStatus = await proxyApi.getProxyStatus();
      if (!proxyStatus.running) {
        throw startupFailure(createLocalProxyUnavailableError(t));
      }
      addMarketStartupLog(formatProxyRunningLog(t, proxyStatus));

      addMarketStartupLog(
        t("provider.shareStartupLogCheckCloudflared", {
          defaultValue: "本地代理已运行，检查 cloudflared",
        }),
      );
      const cloudflared = await marketApi.checkCloudflared();
      if (!cloudflared.installed) {
        throw startupFailure(
          createCloudflaredMissingError(t, cloudflared.installCommand),
        );
      }

      addMarketStartupLog(formatCloudflaredInstalledLog(t, cloudflared));
      addMarketStartupLog(formatTunnelCommandLog(t));
      const endpoint =
        await marketApi.startCloudflareTunnel(SELLER_TUNNEL_PORT);

      if (marketStartOpRef.current !== operationId) {
        return;
      }

      addMarketStartupLog(
        t("provider.shareStartupLogTunnelReady", {
          defaultValue: "分享通道已启动：{{endpoint}}",
          endpoint,
        }),
      );
      completedSteps = ["account", "tunnel"];
      currentStep = "modelTest";
      setMarketStartupStep({
        currentStep,
        completedSteps,
        error: null,
      });
      addMarketStartupLog(
        t("provider.marketShareStartupLogModelTest", {
          defaultValue: "测试当前供应商模型",
        }),
      );

      const modelCheck = await streamCheckProvider(appId, provider.id);
      if (marketStartOpRef.current !== operationId) {
        return;
      }
      if (!modelCheck.success) {
        throw startupFailure(createProviderCheckError(t, modelCheck.message));
      }

      completedSteps = ["account", "tunnel", "modelTest"];
      currentStep = "pricing";
      setMarketStartupStep({
        currentStep,
        completedSteps,
        error: null,
      });
      addMarketStartupLog(
        t("provider.marketShareStartupLogPricing", {
          defaultValue: "读取市场定价",
        }),
      );

      const marketModelName = getProviderMarketModelName(provider, appId);
      const priceSuggestion = await marketApi.getSuggestedSellerPrice(
        provider.id,
        marketModelName,
      );
      const marketConfig = shareConfigRef.current.market;
      const discountPercent = normalizeMarketDiscountPercent(
        marketConfig.discountPercent,
      );
      const shouldApplyDiscount = marketConfig.pricingStrategy === "provider";
      const pricePer1kTokens =
        marketConfig.pricingStrategy === "custom" &&
        typeof marketConfig.pricePer1kTokens === "number"
          ? marketConfig.pricePer1kTokens
          : applyDiscountToPricePer1kTokens(
              priceSuggestion.pricePer1kTokens,
              discountPercent,
            );
      if (!Number.isFinite(pricePer1kTokens) || pricePer1kTokens <= 0) {
        throw startupFailure(createPricingUnavailableError(t));
      }
      const modelPrices = priceSuggestion.modelPrice
        ? [
            shouldApplyDiscount
              ? applyDiscountToModelPrice(
                  priceSuggestion.modelPrice,
                  discountPercent,
                )
              : priceSuggestion.modelPrice,
          ]
        : [];

      if (marketStartOpRef.current !== operationId) {
        return;
      }

      completedSteps = ["account", "tunnel", "modelTest", "pricing"];
      currentStep = "publish";
      setMarketStartupStep({
        currentStep,
        completedSteps,
        error: null,
      });
      addMarketStartupLog(
        t("provider.marketShareStartupLogPublish", {
          defaultValue: "发布到市场",
        }),
      );

      const accessToken = await marketApi.generateSellerAccessToken(
        provider.id,
      );
      await marketApi.startSellingTokens({
        providerId: provider.id,
        modelName: marketModelName,
        pricePer1kTokens,
        endpoint,
        modelPrices,
        priceUnit: MARKET_PRICE_UNIT,
        priceVersion: MARKET_PRICE_VERSION,
      });

      if (marketStartOpRef.current !== operationId) {
        return;
      }

      const startedAt = Date.now();
      await saveShareConfigPatch((latest) => ({
        ...latest,
        friend: {
          ...latest.friend,
          enabled: false,
          status: "idle",
          lastError: null,
        },
        market: {
          ...latest.market,
          enabled: true,
          status: "running",
          endpoint,
          accessToken,
          pricePer1kTokens,
          discountPercent,
          modelPrices,
          priceUnit: MARKET_PRICE_UNIT,
          priceVersion: MARKET_PRICE_VERSION,
          startedAt,
          lastPublishedAt: startedAt,
          lastError: null,
        },
      }));
      if (marketStartOpRef.current === operationId) {
        void runtimeStatusQuery.refetch();
        setMarketStartup(emptyStartupState());
      }
    } catch (error) {
      if (marketStartOpRef.current !== operationId) {
        return;
      }
      const startupError = isStartupFailure(error)
        ? error.startupError
        : toMarketStartupError({
            error,
            step: currentStep,
            t,
          });
      startupLogs = appendStartupLog(startupLogs, startupError.log);
      setMarketStartup({
        currentStep,
        completedSteps,
        error: startupError,
        logs: startupLogs,
      });

      if (completedSteps.includes("tunnel") || currentStep === "publish") {
        try {
          await marketApi.stopSellingTokens(provider.id);
          void runtimeStatusQuery.refetch();
        } catch (stopError) {
          addMarketStartupLog(
            t("provider.shareStartupLogStopFailed", {
              defaultValue: "清理分享通道失败：{{message}}",
              message: toErrorMessage(stopError),
            }),
          );
        }
      }

      try {
        await saveShareConfigPatch((latest) => ({
          ...latest,
          market: {
            ...latest.market,
            enabled: false,
            status: "error",
            lastError: startupError.title,
          },
        }));
      } catch {
        setShareConfigPatch((latest) => ({
          ...latest,
          market: {
            ...latest.market,
            enabled: false,
            status: "error",
            lastError: startupError.title,
          },
        }));
      }
    }
  };

  const saveClawTipWalletAddress = async (walletAddress: string) => {
    const trimmedWalletAddress = walletAddress.trim();
    if (!trimmedWalletAddress) {
      throw new Error(
        t("provider.clawTipWalletAddressRequired", {
          defaultValue: "请填写 ClawTip 钱包地址",
        }),
      );
    }

    await saveShareConfigPatch((latest) => ({
      ...latest,
      market: {
        ...latest.market,
        clawTipWalletAddress: trimmedWalletAddress,
        lastError: null,
      },
    }));
    toast.success(
      t("provider.clawTipWalletSaved", {
        defaultValue: "钱包地址已保存",
      }),
    );
  };

  const saveClawTipWalletAddressAndContinue = async (walletAddress: string) => {
    await saveClawTipWalletAddress(walletAddress);
    void updateMarketEnabled(true);
  };

  const handleFriendStartupAction = async (action: ShareStartupAction) => {
    if (action === "start_proxy") {
      try {
        await proxyApi.startProxyServer();
        await proxyStatusQuery.refetch();
        void updateFriendEnabled(true);
      } catch (error) {
        toast.error(toErrorMessage(error));
      }
      return;
    }

    if (action === "retry") {
      void updateFriendEnabled(true);
    }
  };

  const handleMarketStartupAction = async (action: ShareStartupAction) => {
    if (action === "start_proxy") {
      try {
        await proxyApi.startProxyServer();
        await proxyStatusQuery.refetch();
        void updateMarketEnabled(true);
      } catch (error) {
        toast.error(toErrorMessage(error));
      }
      return;
    }

    if (action === "open_clawtip") {
      try {
        await settingsApi.openExternal(CLAWTIP_URL);
      } catch {
        toast.error(
          t("provider.clawTipOpenFailed", {
            defaultValue: "无法打开 ClawTip，请稍后重试",
          }),
        );
      }
      return;
    }

    if (action === "retry") {
      void updateMarketEnabled(true);
    }
  };

  const updateMarketPricingStrategy = async (
    pricingStrategy: MarketPricingStrategy,
  ) => {
    if (shareConfigRef.current.market.pricingStrategy === pricingStrategy) {
      return;
    }

    await saveShareConfigPatch((latest) => ({
      ...latest,
      market: {
        ...latest.market,
        pricingStrategy,
      },
    }));
  };

  const updateMarketDiscountPercent = async (discountPercent: number) => {
    await saveShareConfigPatch((latest) => ({
      ...latest,
      market: {
        ...latest.market,
        discountPercent: normalizeMarketDiscountPercent(discountPercent),
      },
    }));
  };

  return (
    <FullScreenPanel
      isOpen={open}
      title={t("provider.shareSettings", { defaultValue: "分享设置" })}
      onClose={() => onOpenChange(false)}
    >
      <div className="mx-auto w-full max-w-5xl text-slate-950">
        <section className="rounded-lg bg-white p-5 shadow-sm">
          <ProviderShareHeader
            provider={provider}
            config={shareConfig}
            runtimeStatus={effectiveRuntimeStatus}
          />
          <ShareExperimentalNotice />
          <ProviderShareStatsStrip stats={runtimeStats} />

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mt-4 grid w-fit grid-cols-2 bg-slate-100">
              <TabsTrigger value="friend">
                {t("provider.friendShare", { defaultValue: "好友分享" })}
              </TabsTrigger>
              <TabsTrigger value="market">
                {t("provider.marketShare", { defaultValue: "卖了换钱" })}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="friend" className="mt-4">
              <FriendSharePanel
                appId={appId}
                provider={provider}
                config={shareConfig}
                runtimeStatus={effectiveRuntimeStatus}
                startup={friendStartup}
                onEnabledChange={updateFriendEnabled}
                onStartupAction={handleFriendStartupAction}
              />
            </TabsContent>

            <TabsContent value="market" className="mt-4">
              <MarketSharePanel
                config={shareConfig}
                startup={marketStartup}
                onEnabledChange={updateMarketEnabled}
                onStartupAction={handleMarketStartupAction}
                onClawTipWalletSubmit={saveClawTipWalletAddress}
                onClawTipWalletSubmitAndContinue={
                  saveClawTipWalletAddressAndContinue
                }
                onPricingStrategyChange={updateMarketPricingStrategy}
                onDiscountPercentChange={updateMarketDiscountPercent}
              />
            </TabsContent>
          </Tabs>
        </section>
      </div>
    </FullScreenPanel>
  );
}

function ProviderShareHeader({
  provider,
  config,
  runtimeStatus,
}: {
  provider: Provider;
  config: ProviderShareConfig;
  runtimeStatus?: SellerRuntimeStatus | null;
}) {
  const { t } = useTranslation();
  const runtimeRunning = runtimeStatus?.status === "running";
  const isFriendActive =
    (config.friend.status === "running" && runtimeRunning) ||
    config.friend.status === "starting";
  const isMarketActive =
    (config.market.status === "running" && runtimeRunning) ||
    config.market.status === "starting";
  const statusLabel = isMarketActive
    ? t("provider.marketShareActive", { defaultValue: "售卖中" })
    : isFriendActive
      ? t("provider.friendShareActive", { defaultValue: "分享中" })
      : null;

  return (
    <header className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
      <div className="flex min-w-0 items-start gap-3">
        <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-base font-semibold text-emerald-700">
          <ProviderIcon
            icon={provider.icon}
            name={provider.name}
            color={provider.iconColor}
            size={26}
          />
        </div>
        <div className="min-w-0">
          <h2 className="truncate text-xl font-semibold text-slate-950">
            {provider.name}
          </h2>
        </div>
      </div>
      {statusLabel && (
        <div
          data-share-header-status=""
          className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 shadow-[0_0_0_1px_rgba(16,185,129,0.16)] [&>svg]:animate-spin"
        >
          <Loader2 className="h-3.5 w-3.5" />
          {statusLabel}
        </div>
      )}
    </header>
  );
}

function ShareExperimentalNotice() {
  const { t } = useTranslation();

  return (
    <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-900">
      <span className="font-medium">
        {t("provider.shareExperimentalNoticeTitle", {
          defaultValue: "实验性能力",
        })}
      </span>
      <span className="ml-2">
        {t("provider.shareExperimentalNoticeDescription", {
          defaultValue:
            "公网分享和市场售卖当前为受限能力；外部访问必须携带本次启动生成的访问令牌，停止后旧令牌会失效。",
        })}
      </span>
    </div>
  );
}

function ProviderShareStatsStrip({ stats }: { stats: ShareRuntimeStats }) {
  const { t } = useTranslation();
  const items = [
    {
      label: t("provider.shareRuntimeChannelStatus", {
        defaultValue: "通道状态",
      }),
      value: t(statusLabelKeyByStatus[stats.channelStatus], {
        defaultValue: stats.channelStatusLabel,
      }),
    },
    {
      label: t("provider.shareRuntimeConnections", {
        defaultValue: "当前连接数",
      }),
      value: String(stats.activeConnections),
    },
    {
      label: t("provider.shareRuntimeTokens", {
        defaultValue: "本次启动已使用 Token",
      }),
      value: stats.tokensUsedThisRunLabel,
    },
  ];

  return (
    <dl className="mt-4 grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-3">
      {items.map((item) => (
        <div key={item.label} className="rounded-md bg-white px-3 py-2">
          <dt className="text-xs text-slate-500">{item.label}</dt>
          <dd className="mt-1 text-sm font-semibold text-slate-900">
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

const statusLabelKeyByStatus: Record<ProviderShareStatus, string> = {
  running: "provider.shareRuntimeRunning",
  starting: "provider.shareRuntimeStarting",
  idle: "provider.shareRuntimeIdle",
  error: "provider.shareRuntimeError",
};

function CapsuleSwitch({
  label,
  description,
  checked,
  disabled,
  ariaLabel,
  onCheckedChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  ariaLabel: string;
  onCheckedChange: (checked: boolean) => Promise<void> | void;
}) {
  const { t } = useTranslation();
  const offLabel = t("provider.shareSwitchOff", { defaultValue: "关闭" });
  const onLabel = t("provider.shareSwitchOn", { defaultValue: "开启" });

  return (
    <div className="flex justify-start">
      <div
        data-share-capsule=""
        className="inline-flex w-fit justify-start rounded-full border border-slate-200 bg-white p-1 shadow-sm"
      >
        <TooltipProvider delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                role="switch"
                aria-checked={checked}
                aria-label={ariaLabel}
                disabled={disabled}
                className={cn(
                  "relative grid h-9 w-28 grid-cols-2 items-center rounded-full border border-slate-300 bg-slate-50 p-1 text-xs font-semibold text-slate-600 shadow-inner transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-wait disabled:opacity-75",
                  checked
                    ? "border-emerald-300 bg-emerald-50"
                    : "border-slate-300 bg-slate-50",
                )}
                onClick={() => {
                  void onCheckedChange(!checked);
                }}
              >
                <span
                  className={cn(
                    "absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-full shadow-sm transition-transform",
                    checked
                      ? "translate-x-full bg-emerald-600"
                      : "translate-x-0 bg-slate-700",
                  )}
                  aria-hidden="true"
                />
                <span
                  className={cn(
                    "relative z-10 text-center transition-colors",
                    checked ? "text-slate-500" : "text-white",
                  )}
                  aria-hidden="true"
                >
                  {offLabel}
                </span>
                <span
                  className={cn(
                    "relative z-10 text-center transition-colors",
                    checked ? "text-white" : "text-slate-500",
                  )}
                  aria-hidden="true"
                >
                  {onLabel}
                </span>
              </button>
            </TooltipTrigger>
            <TooltipContent
              side="right"
              align="center"
              className="max-w-72 bg-slate-950 text-white"
            >
              <div className="grid gap-1">
                <div className="text-sm font-semibold">{label}</div>
                <div className="text-xs leading-relaxed text-white/80">
                  {description}
                </div>
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  );
}

function FriendSharePanel({
  appId,
  provider,
  config,
  runtimeStatus,
  startup,
  onEnabledChange,
  onStartupAction,
}: {
  appId: AppId;
  provider: Provider;
  config: ProviderShareConfig;
  runtimeStatus?: SellerRuntimeStatus | null;
  startup: ShareStartupState<FriendStartupStep>;
  onEnabledChange: (enabled: boolean) => Promise<void> | void;
  onStartupAction: (action: ShareStartupAction) => Promise<void> | void;
}) {
  const { t } = useTranslation();
  const friendEndpoint = config.friend.endpoint;
  const friendAccessToken = config.friend.accessToken;
  const canCopyFriendShare = Boolean(friendEndpoint && friendAccessToken);
  const canUseClipboard = Boolean(globalThis.navigator?.clipboard?.writeText);
  const friendImportLink =
    friendEndpoint && friendAccessToken
      ? buildSharedProviderLink({
          appId,
          providerName: provider.name,
          endpoint: friendEndpoint,
          accessToken: friendAccessToken,
        })
      : null;
  const effectiveStartup: ShareStartupState<FriendStartupStep> =
    startup.currentStep || startup.error
      ? startup
      : config.friend.status === "starting"
        ? {
            currentStep: "tunnel",
            completedSteps: [],
            error: null,
          }
        : startup;
  const showStartupProgress = Boolean(
    effectiveStartup.currentStep || effectiveStartup.error,
  );
  const showFriendDetails =
    !showStartupProgress &&
    config.friend.status === "running" &&
    runtimeStatus?.status === "running" &&
    Boolean(friendEndpoint && friendAccessToken);

  const copyText = async (value: string, successMessage: string) => {
    const clipboard = globalThis.navigator?.clipboard;
    if (!clipboard?.writeText) {
      toast.error(
        t("provider.clipboardUnavailable", {
          defaultValue: "剪贴板不可用",
        }),
      );
      return;
    }
    await clipboard.writeText(value);
    toast.success(successMessage);
  };

  return (
    <div className="grid gap-4 rounded-lg border border-slate-200 bg-white p-4">
      <CapsuleSwitch
        label={t("provider.friendShare", { defaultValue: "好友分享" })}
        description={t("provider.friendShareDescription", {
          defaultValue: "点击胶囊后自动启动通道、生成 token 和好友导入链接。",
        })}
        checked={config.friend.enabled}
        disabled={config.friend.status === "starting"}
        ariaLabel={t("provider.friendShareEnable", {
          defaultValue: "好友分享开关",
        })}
        onCheckedChange={onEnabledChange}
      />
      {showStartupProgress ? (
        <ShareStartupProgressCard
          title={t("provider.friendShareStartingTitle", {
            defaultValue: "正在准备好友分享",
          })}
          steps={getFriendStartupSteps(t)}
          startup={effectiveStartup}
          onPrimaryAction={onStartupAction}
        />
      ) : null}
      {showFriendDetails ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <InfoCard
              title={t("provider.friendEndpoint", { defaultValue: "好友入口" })}
              value={friendEndpoint!}
            />
            <InfoCard
              title={t("provider.friendAccessToken", {
                defaultValue: "访问令牌",
              })}
              value={t("provider.friendAccessTokenReady", {
                defaultValue: "已生成",
              })}
            />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              className="bg-blue-600 text-white hover:bg-blue-700"
              disabled={!canCopyFriendShare || !canUseClipboard}
              onClick={() => {
                if (!friendEndpoint || !friendAccessToken) {
                  return;
                }
                void copyText(
                  `Endpoint: ${friendEndpoint}\nToken: ${friendAccessToken}`,
                  t("provider.copyEndpointAndTokenSuccess", {
                    defaultValue: "端点和令牌已复制",
                  }),
                );
              }}
            >
              <Copy className="h-4 w-4" />
              {t("provider.copyEndpointAndToken", {
                defaultValue: "复制端点和令牌",
              })}
            </Button>
            <Button
              type="button"
              className="bg-emerald-600 text-white hover:bg-emerald-700"
              disabled={!friendImportLink || !canUseClipboard}
              onClick={() => {
                if (!friendImportLink) {
                  return;
                }
                void copyText(
                  friendImportLink,
                  t("provider.copyFriendImportLinkSuccess", {
                    defaultValue: "好友导入链接已复制",
                  }),
                );
              }}
            >
              <Copy className="h-4 w-4" />
              {t("provider.copyFriendImportLink", {
                defaultValue: "复制好友导入链接",
              })}
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}

function getFriendStartupSteps(
  t: ReturnType<typeof useTranslation>["t"],
): Array<ShareStartupStep<FriendStartupStep>> {
  return [
    {
      id: "tunnel",
      label: t("provider.friendShareStepTunnel", {
        defaultValue: "启动分享通道",
      }),
    },
    {
      id: "token",
      label: t("provider.friendShareStepToken", {
        defaultValue: "生成访问令牌",
      }),
    },
    {
      id: "link",
      label: t("provider.friendShareStepLink", {
        defaultValue: "生成好友导入链接",
      }),
    },
  ];
}

function getMarketStartupSteps(
  t: ReturnType<typeof useTranslation>["t"],
): Array<ShareStartupStep<MarketStartupStep>> {
  return [
    {
      id: "account",
      label: t("provider.marketShareStepAccount", {
        defaultValue: "检查账户",
      }),
    },
    {
      id: "tunnel",
      label: t("provider.marketShareStepTunnel", {
        defaultValue: "启动通道",
      }),
    },
    {
      id: "modelTest",
      label: t("provider.marketShareStepModelTest", {
        defaultValue: "测试模型",
      }),
    },
    {
      id: "pricing",
      label: t("provider.marketShareStepPricing", {
        defaultValue: "读取定价",
      }),
    },
    {
      id: "publish",
      label: t("provider.marketShareStepPublish", {
        defaultValue: "发布市场",
      }),
    },
  ];
}

function ShareStartupProgressCard<TStep extends string>({
  title,
  steps,
  startup,
  onPrimaryAction,
  onClawTipWalletSubmit,
}: {
  title: string;
  steps: Array<ShareStartupStep<TStep>>;
  startup: ShareStartupState<TStep>;
  onPrimaryAction: (action: ShareStartupAction) => Promise<void> | void;
  onClawTipWalletSubmit?: (walletAddress: string) => Promise<void> | void;
}) {
  const { t } = useTranslation();
  const currentStep = startup.currentStep;
  const error = startup.error;
  const startupLogs = appendStartupLog(startup.logs ?? [], error?.log);
  const startupLogText = startupLogs.join("\n");
  const [isWalletFormOpen, setIsWalletFormOpen] = useState(false);

  const copyText = async (value: string, successMessage: string) => {
    const clipboard = globalThis.navigator?.clipboard;
    if (!clipboard?.writeText) {
      toast.error(
        t("provider.clipboardUnavailable", {
          defaultValue: "剪贴板不可用",
        }),
      );
      return;
    }
    await clipboard.writeText(value);
    toast.success(successMessage);
  };

  const handlePrimaryAction = async () => {
    if (!error) {
      return;
    }

    if (error.primaryAction === "copy_install_command" && error.command) {
      await copyText(
        error.command,
        t("provider.shareStartupInstallCommandCopied", {
          defaultValue: "安装命令已复制",
        }),
      );
      return;
    }

    if (error.primaryAction === "copy_log" && startupLogText) {
      await copyText(
        startupLogText,
        t("provider.shareStartupLogCopied", {
          defaultValue: "日志已复制",
        }),
      );
      return;
    }

    await onPrimaryAction(error.primaryAction);
  };

  const handleCopyLog = async () => {
    if (!startupLogText) {
      return;
    }
    await copyText(
      startupLogText,
      t("provider.shareStartupLogCopied", {
        defaultValue: "日志已复制",
      }),
    );
  };

  return (
    <div
      className={cn(
        "rounded-lg border p-4",
        error ? "border-red-200 bg-red-50" : "border-blue-200 bg-blue-50",
      )}
      aria-live="polite"
    >
      <div
        className={cn(
          "text-sm font-semibold",
          error ? "text-red-950" : "text-blue-950",
        )}
      >
        {title}
      </div>
      <div className="mt-3 grid gap-2">
        {steps.map((item) => {
          const stepState = getStartupStepState({
            step: item.id,
            currentStep,
            completedSteps: startup.completedSteps,
            error,
          });

          return (
            <div
              key={item.id}
              className="flex items-center gap-3 rounded-md bg-white px-3 py-2 text-sm text-slate-700"
            >
              <StartupStepIcon state={stepState} />
              <span
                className={cn(
                  stepState === "pending"
                    ? "text-slate-500"
                    : "font-medium text-slate-950",
                  stepState === "error" ? "text-red-900" : null,
                )}
              >
                {item.label}
              </span>
            </div>
          );
        })}
      </div>
      {startupLogs.length > 0 ? (
        <div className="mt-4 rounded-md border border-slate-200 bg-white p-3">
          <div className="text-xs font-semibold text-slate-700">
            {t("provider.shareStartupLogTitle", {
              defaultValue: "启动日志",
            })}
          </div>
          <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap break-words rounded bg-slate-950 p-3 text-xs leading-5 text-slate-100">
            {startupLogs.join("\n")}
          </pre>
        </div>
      ) : null}
      {error ? (
        <div className="mt-4 rounded-md border border-red-200 bg-white p-3">
          <div className="text-sm font-semibold text-red-950">
            {error.title}
          </div>
          <p className="mt-1 text-sm leading-6 text-red-800">
            {error.description}
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={() => {
                void handlePrimaryAction();
              }}
            >
              {error.primaryActionLabel}
            </Button>
            {error.secondaryAction === "fill_clawtip_wallet" ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsWalletFormOpen(true)}
              >
                {error.secondaryActionLabel}
              </Button>
            ) : null}
            {error.log &&
            error.primaryAction !== "copy_log" &&
            !error.suppressCopyLog ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  void handleCopyLog();
                }}
              >
                <Copy className="h-4 w-4" />
                {t("provider.shareStartupActionCopyLog", {
                  defaultValue: "复制日志",
                })}
              </Button>
            ) : null}
          </div>
          {error.secondaryAction === "fill_clawtip_wallet" &&
          isWalletFormOpen &&
          onClawTipWalletSubmit ? (
            <ClawTipWalletAddressForm
              className="mt-3"
              onCancel={() => setIsWalletFormOpen(false)}
              onSubmit={onClawTipWalletSubmit}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ClawTipWalletAddressForm({
  className,
  defaultValue = "",
  onCancel,
  onSubmit,
}: {
  className?: string;
  defaultValue?: string;
  onCancel: () => void;
  onSubmit: (walletAddress: string) => Promise<void> | void;
}) {
  const { t } = useTranslation();
  const [walletAddress, setWalletAddress] = useState(defaultValue);
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedWalletAddress = walletAddress.trim();
    if (!trimmedWalletAddress) {
      toast.error(
        t("provider.clawTipWalletAddressRequired", {
          defaultValue: "请填写 ClawTip 钱包地址",
        }),
      );
      return;
    }

    setIsSaving(true);
    try {
      await onSubmit(trimmedWalletAddress);
      onCancel();
    } catch (error) {
      toast.error(toErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form
      className={cn(
        "grid gap-2 rounded-md border border-slate-200 p-3",
        className,
      )}
      onSubmit={(event) => {
        void handleSubmit(event);
      }}
    >
      <label
        htmlFor="clawtip-wallet-address"
        className="text-xs font-medium text-slate-700"
      >
        {t("provider.clawTipWalletAddress", {
          defaultValue: "ClawTip 钱包地址",
        })}
      </label>
      <Input
        id="clawtip-wallet-address"
        value={walletAddress}
        onChange={(event) => setWalletAddress(event.target.value)}
        placeholder={t("provider.clawTipWalletAddressPlaceholder", {
          defaultValue: "填写你的 ClawTip 钱包地址",
        })}
      />
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="submit"
          size="sm"
          className="bg-emerald-600 text-white hover:bg-emerald-700"
          disabled={isSaving}
        >
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {t("provider.saveClawTipWalletAddress", {
            defaultValue: "保存钱包地址",
          })}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={isSaving}
          onClick={onCancel}
        >
          {t("common.cancel", { defaultValue: "取消" })}
        </Button>
      </div>
    </form>
  );
}

function StartupStepIcon({ state }: { state: ShareStartupStepState }) {
  if (state === "done") {
    return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
  }

  if (state === "active") {
    return <Loader2 className="h-4 w-4 animate-spin text-blue-600" />;
  }

  if (state === "error") {
    return (
      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold leading-none text-white">
        !
      </span>
    );
  }

  return <span className="h-4 w-4 rounded-full border border-slate-300" />;
}

function getStartupStepState<TStep extends string>({
  step,
  currentStep,
  completedSteps,
  error,
}: {
  step: TStep;
  currentStep: TStep | null;
  completedSteps: TStep[];
  error: ShareStartupError | null;
}): ShareStartupStepState {
  if (completedSteps.includes(step)) {
    return "done";
  }

  if (currentStep === step) {
    return error ? "error" : "active";
  }

  return "pending";
}

function createClawTipUnboundError(t: TranslationFn): ShareStartupError {
  return {
    code: "clawtip_unbound",
    title: t("provider.marketShareClawTipUnboundTitle", {
      defaultValue: "ClawTip 收款账户未绑定",
    }),
    description: t("provider.marketShareClawTipUnboundDescription", {
      defaultValue:
        "需要先开通 ClawTip 收款钱包并填写钱包地址，才能继续发布到市场。",
    }),
    primaryAction: "open_clawtip",
    primaryActionLabel: t("provider.openClawTip", {
      defaultValue: "前往开通",
    }),
    secondaryAction: "fill_clawtip_wallet",
    secondaryActionLabel: t("provider.fillClawTipWalletAddress", {
      defaultValue: "填写钱包地址",
    }),
    suppressCopyLog: true,
    log: "ClawTip payout wallet address is missing. Market publish is blocked before tunnel/model/pricing steps.",
  };
}

function createLocalProxyUnavailableError(t: TranslationFn): ShareStartupError {
  return {
    code: "local_proxy_unavailable",
    title: t("provider.shareStartupLocalProxyTitle", {
      defaultValue: "本地代理未启动",
    }),
    description: t("provider.shareStartupLocalProxyDescription", {
      defaultValue:
        "需要先启动 TokensBuddy 本地代理，好友才能通过分享通道访问当前供应商。",
    }),
    primaryAction: "start_proxy",
    primaryActionLabel: t("provider.shareStartupActionStartProxy", {
      defaultValue: "启动/重启代理",
    }),
    log: "local proxy is not running",
  };
}

function createCloudflaredMissingError(
  t: TranslationFn,
  installCommand: string,
): ShareStartupError {
  return {
    code: "cloudflared_missing",
    title: t("provider.shareStartupCloudflaredMissingTitle", {
      defaultValue: "未检测到 cloudflared",
    }),
    description: t("provider.shareStartupCloudflaredMissingDescription", {
      defaultValue:
        "需要先安装 cloudflared 才能创建临时分享通道。复制命令后在终端执行，再回来重试。",
    }),
    primaryAction: "copy_install_command",
    primaryActionLabel: t("provider.shareStartupActionCopyInstallCommand", {
      defaultValue: "复制安装命令",
    }),
    command: installCommand,
    log: `cloudflared missing. install command: ${installCommand}`,
  };
}

function createProviderCheckError(
  t: TranslationFn,
  message: string,
): ShareStartupError {
  return {
    code: "provider_config_invalid",
    title: t("provider.marketShareProviderCheckFailedTitle", {
      defaultValue: "模型测试未通过",
    }),
    description:
      message ||
      t("provider.marketShareProviderCheckFailedDescription", {
        defaultValue: "当前供应商测试未通过，请检查模型、密钥或额度后重试。",
      }),
    primaryAction: "retry",
    primaryActionLabel: t("provider.shareStartupActionRetry", {
      defaultValue: "重试当前步骤",
    }),
    log: message,
  };
}

function createPricingUnavailableError(t: TranslationFn): ShareStartupError {
  return {
    code: "pricing_unavailable",
    title: t("provider.marketSharePricingUnavailableTitle", {
      defaultValue: "定价不可用",
    }),
    description: t("provider.marketSharePricingUnavailableDescription", {
      defaultValue: "没有读取到可用定价，请检查定价策略后重试。",
    }),
    primaryAction: "retry",
    primaryActionLabel: t("provider.shareStartupActionRetry", {
      defaultValue: "重试当前步骤",
    }),
    log: "market price is missing or invalid",
  };
}

function toMarketStartupError(input: {
  error: unknown;
  step: MarketStartupStep;
  t: TranslationFn;
}): ShareStartupError {
  const message = toErrorMessage(input.error);
  const codeByStep: Record<MarketStartupStep, ShareStartupErrorCode> = {
    account: "clawtip_unbound",
    tunnel: classifyTunnelErrorCode(input.error),
    modelTest: "provider_config_invalid",
    pricing: "pricing_unavailable",
    publish: "market_publish_failed",
  };

  return toShareStartupError({
    error: input.error,
    fallbackCode: codeByStep[input.step],
    fallbackTitle:
      input.step === "publish"
        ? input.t("provider.marketSharePublishFailedTitle", {
            defaultValue: "市场发布失败",
          })
        : input.t("provider.shareStartupUnknownTitle", {
            defaultValue: "启动失败",
          }),
    fallbackDescription:
      input.step === "publish"
        ? input.t("provider.marketSharePublishFailedDescription", {
            defaultValue: "发布到市场时遇到异常，请重试当前步骤。",
          })
        : message,
    retryLabel: input.t("provider.shareStartupActionRetry", {
      defaultValue: "重试当前步骤",
    }),
    copyLogLabel: input.t("provider.shareStartupActionCopyLog", {
      defaultValue: "复制日志",
    }),
    networkTimeoutTitle: input.t("provider.shareStartupNetworkTimeoutTitle", {
      defaultValue: "网络连接超时",
    }),
    networkTimeoutDescription: input.t(
      "provider.shareStartupNetworkTimeoutDescription",
      {
        defaultValue: "启动分享通道时等待超时，请确认网络可用后重试。",
      },
    ),
    cloudflaredMissingTitle: input.t(
      "provider.shareStartupCloudflaredMissingTitle",
      {
        defaultValue: "未检测到 cloudflared",
      },
    ),
    cloudflaredMissingDescription: input.t(
      "provider.shareStartupCloudflaredMissingDescription",
      {
        defaultValue:
          "需要先安装 cloudflared 才能创建临时分享通道。复制命令后在终端执行，再回来重试。",
      },
    ),
  });
}

function getProviderMarketModelName(provider: Provider, appId: AppId): string {
  const configuredTestModel = provider.meta?.testConfig?.testModel?.trim();
  if (configuredTestModel) {
    return configuredTestModel;
  }

  const config = provider.settingsConfig;
  const directModel =
    typeof config.model === "string"
      ? config.model
      : typeof config.modelName === "string"
        ? config.modelName
        : typeof config.config?.model === "string"
          ? config.config.model
          : null;
  if (directModel?.trim()) {
    return directModel.trim();
  }

  if (appId === "openclaw" && Array.isArray(config.models)) {
    const firstModel = config.models[0];
    if (typeof firstModel?.id === "string" && firstModel.id.trim()) {
      return firstModel.id.trim();
    }
  }

  if (config.models && typeof config.models === "object") {
    const [firstModelId] = Object.keys(config.models);
    if (firstModelId?.trim()) {
      return firstModelId.trim();
    }
  }

  return provider.name;
}

function applyDiscountToPricePer1kTokens(
  pricePer1kTokens: number,
  discountPercent: number,
): number {
  const discount = normalizeMarketDiscountPercent(discountPercent);
  const discountedPrice = pricePer1kTokens * (discount / 100);

  return Math.max(1, Math.ceil(discountedPrice));
}

function applyDiscountToModelPrice(
  modelPrice: NonNullable<SellerPricingSuggestion["modelPrice"]>,
  discountPercent: number,
): NonNullable<SellerPricingSuggestion["modelPrice"]> {
  const discount = normalizeMarketDiscountPercent(discountPercent) / 100;

  return {
    ...modelPrice,
    inputPricePer1mTokens: discountPrice(
      modelPrice.inputPricePer1mTokens,
      discount,
    ),
    outputPricePer1mTokens: discountPrice(
      modelPrice.outputPricePer1mTokens,
      discount,
    ),
    cacheReadPricePer1mTokens: discountOptionalPrice(
      modelPrice.cacheReadPricePer1mTokens,
      discount,
    ),
    cacheWritePricePer1mTokens: discountOptionalPrice(
      modelPrice.cacheWritePricePer1mTokens,
      discount,
    ),
  };
}

function discountOptionalPrice(value: number | undefined, discount: number) {
  return typeof value === "number" ? discountPrice(value, discount) : undefined;
}

function discountPrice(value: number, discount: number) {
  return Number((value * discount).toFixed(12));
}

function MarketSharePanel({
  config,
  startup,
  onEnabledChange,
  onStartupAction,
  onClawTipWalletSubmit,
  onClawTipWalletSubmitAndContinue,
  onPricingStrategyChange,
  onDiscountPercentChange,
}: {
  config: ProviderShareConfig;
  startup: ShareStartupState<MarketStartupStep>;
  onEnabledChange: (enabled: boolean) => Promise<void> | void;
  onStartupAction: (action: ShareStartupAction) => Promise<void> | void;
  onClawTipWalletSubmit: (walletAddress: string) => Promise<void> | void;
  onClawTipWalletSubmitAndContinue: (
    walletAddress: string,
  ) => Promise<void> | void;
  onPricingStrategyChange: (
    pricingStrategy: MarketPricingStrategy,
  ) => Promise<void> | void;
  onDiscountPercentChange: (discountPercent: number) => Promise<void> | void;
}) {
  const { t } = useTranslation();
  const effectiveStartup: ShareStartupState<MarketStartupStep> =
    startup.currentStep || startup.error
      ? startup
      : config.market.status === "starting"
        ? {
            currentStep: "account",
            completedSteps: [],
            error: null,
          }
        : startup;
  const showStartupProgress = Boolean(
    effectiveStartup.currentStep || effectiveStartup.error,
  );

  return (
    <div className="grid gap-4 rounded-lg border border-slate-200 bg-white p-4">
      <CapsuleSwitch
        label={t("provider.marketShare", { defaultValue: "允许市场售卖" })}
        description={t("provider.marketShareDescription", {
          defaultValue: "开启后可把当前通道发布到市场",
        })}
        checked={config.market.enabled}
        disabled={config.market.status === "starting"}
        ariaLabel={t("provider.marketShareEnable", {
          defaultValue: "允许市场售卖开关",
        })}
        onCheckedChange={onEnabledChange}
      />
      {showStartupProgress ? (
        <ShareStartupProgressCard
          title={t("provider.marketShareStartingTitle", {
            defaultValue: "正在准备市场发布",
          })}
          steps={getMarketStartupSteps(t)}
          startup={effectiveStartup}
          onPrimaryAction={onStartupAction}
          onClawTipWalletSubmit={onClawTipWalletSubmitAndContinue}
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <ClawTipAccountCard
            walletAddress={config.market.clawTipWalletAddress}
            onWalletAddressSubmit={onClawTipWalletSubmit}
          />
          <PricingStrategySelector
            config={config}
            disabled={config.market.status === "starting"}
            onChange={onPricingStrategyChange}
            onDiscountPercentChange={onDiscountPercentChange}
          />
        </div>
      )}
    </div>
  );
}

function ClawTipAccountCard({
  walletAddress,
  onWalletAddressSubmit,
}: {
  walletAddress?: string;
  onWalletAddressSubmit: (walletAddress: string) => Promise<void> | void;
}) {
  const { t } = useTranslation();
  const [isWalletFormOpen, setIsWalletFormOpen] = useState(false);
  const hasWalletAddress = Boolean(walletAddress?.trim());

  const openClawTip = async () => {
    try {
      await settingsApi.openExternal(CLAWTIP_URL);
    } catch {
      toast.error(
        t("provider.clawTipOpenFailed", {
          defaultValue: "无法打开 ClawTip，请稍后重试",
        }),
      );
    }
  };

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="text-sm font-semibold text-slate-950">
          {t("provider.clawTipAccount", {
            defaultValue: "ClawTip 收款账户",
          })}
        </div>
        <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
          {hasWalletAddress
            ? t("provider.clawTipWalletConfigured", {
                defaultValue: "已填写",
              })
            : t("provider.clawTipUnbound", { defaultValue: "未绑定" })}
        </span>
      </div>
      <p className="mt-2 text-sm leading-6 text-amber-900">
        {t("provider.clawTipUnboundDescription", {
          defaultValue:
            "发布到市场前，需要先开通 ClawTip 收款钱包并配置服务端密钥。",
        })}
      </p>
      <div className="mt-3 grid gap-1 text-xs leading-5 text-amber-800">
        <span>
          {t("provider.clawTipSetupStepWallet", {
            defaultValue: "1. 开通收款钱包",
          })}
        </span>
        <span>
          {t("provider.clawTipSetupStepSecret", {
            defaultValue: "2. 配置服务端密钥",
          })}
        </span>
        <span>
          {t("provider.clawTipSetupStepReturn", {
            defaultValue: "3. 返回 TokensBuddy 启动市场发布",
          })}
        </span>
      </div>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Button
          asChild
          size="sm"
          className="bg-amber-600 text-white hover:bg-amber-700"
        >
          <a
            href={CLAWTIP_URL}
            target="_blank"
            rel="noreferrer"
            onClick={(event) => {
              event.preventDefault();
              void openClawTip();
            }}
          >
            {t("provider.openClawTip", { defaultValue: "前往开通" })}
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setIsWalletFormOpen(true)}
        >
          {t("provider.fillClawTipWalletAddress", {
            defaultValue: "填写钱包地址",
          })}
        </Button>
      </div>
      {isWalletFormOpen ? (
        <ClawTipWalletAddressForm
          className="mt-3 bg-white/80"
          defaultValue={walletAddress}
          onCancel={() => setIsWalletFormOpen(false)}
          onSubmit={onWalletAddressSubmit}
        />
      ) : null}
    </div>
  );
}

function PricingStrategySelector({
  config,
  disabled,
  onChange,
  onDiscountPercentChange,
}: {
  config: ProviderShareConfig;
  disabled: boolean;
  onChange: (pricingStrategy: MarketPricingStrategy) => Promise<void> | void;
  onDiscountPercentChange: (discountPercent: number) => Promise<void> | void;
}) {
  const { t } = useTranslation();
  const selectedStrategy = config.market.pricingStrategy;
  const discountPercent = normalizeMarketDiscountPercent(
    config.market.discountPercent,
  );
  const options: Array<{
    value: MarketPricingStrategy;
    label: string;
    description: string;
  }> = [
    {
      value: "provider",
      label: t("provider.followProviderPricing", {
        defaultValue: "跟随服务商定价",
      }),
      description: t("provider.followProviderPricingHint", {
        defaultValue: "无需额外设置，保存后可直接发布。",
      }),
    },
    {
      value: "custom",
      label: t("provider.customSellingPrice", {
        defaultValue: "自定义价格",
      }),
      description: t("provider.customSellingPriceHint", {
        defaultValue: "按每 100 万 tokens 编辑模型输入、输出价格。",
      }),
    },
  ];

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="text-sm font-semibold text-slate-950">
        {t("provider.pricingStrategy", { defaultValue: "定价策略" })}
      </div>
      <div className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-3">
        <div className="flex items-center justify-between gap-3">
          <label
            htmlFor="market-discount-slider"
            className="text-sm font-semibold text-slate-900"
          >
            {t("provider.marketDiscount", { defaultValue: "售卖折扣" })}
          </label>
          <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-sm font-semibold text-blue-700">
            {discountPercent}%
          </span>
        </div>
        <input
          id="market-discount-slider"
          type="range"
          min={MARKET_DISCOUNT_MIN}
          max={MARKET_DISCOUNT_MAX}
          step={MARKET_DISCOUNT_STEP}
          value={discountPercent}
          disabled={disabled}
          aria-label={t("provider.marketDiscount", {
            defaultValue: "售卖折扣",
          })}
          className="mt-3 h-2 w-full cursor-pointer accent-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
          onChange={(event) => {
            void onDiscountPercentChange(Number(event.currentTarget.value));
          }}
        />
        <p className="mt-2 text-xs leading-5 text-slate-500">
          {t("provider.marketDiscountHint", {
            defaultValue:
              "启动售卖时按此折扣发布 OpenRouter 参考价，价格单位为每 100 万 tokens。",
          })}
        </p>
      </div>
      <div
        role="radiogroup"
        aria-label={t("provider.pricingStrategy", {
          defaultValue: "定价策略",
        })}
        className="mt-3 grid gap-2 sm:grid-cols-2"
      >
        {options.map((option) => {
          const isSelected = selectedStrategy === option.value;

          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={isSelected}
              disabled={disabled}
              className={cn(
                "flex min-h-[116px] w-full flex-col rounded-lg border bg-white p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-60",
                isSelected
                  ? "border-blue-500 bg-blue-50 text-blue-950 shadow-sm"
                  : "border-slate-200 text-slate-700 hover:border-blue-300 hover:bg-blue-50/40",
              )}
              onClick={() => {
                void onChange(option.value);
              }}
            >
              <span className="flex items-start justify-between gap-3">
                <span className="text-sm font-semibold">{option.label}</span>
                <span
                  className={cn(
                    "mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border",
                    isSelected
                      ? "border-blue-600 bg-blue-600"
                      : "border-slate-300 bg-white",
                  )}
                  aria-hidden="true"
                >
                  {isSelected ? (
                    <span className="h-1.5 w-1.5 rounded-full bg-white" />
                  ) : null}
                </span>
              </span>
              <span
                className={cn(
                  "mt-2 text-xs leading-5",
                  isSelected ? "text-blue-800" : "text-slate-500",
                )}
              >
                {option.description}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function InfoCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="text-sm font-semibold text-slate-950">{title}</div>
      <div className="mt-2 text-sm text-slate-600">{value}</div>
    </div>
  );
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function classifyTunnelErrorCode(error: unknown): ShareStartupErrorCode {
  const message = toErrorMessage(error).toLowerCase();
  if (message.includes("timeout") || message.includes("超时")) {
    return "network_timeout";
  }
  if (
    message.includes("cloudflared") &&
    (message.includes("not found") ||
      message.includes("no such file") ||
      message.includes("未安装"))
  ) {
    return "cloudflared_missing";
  }
  return "unknown";
}

function toShareStartupError(input: {
  error: unknown;
  fallbackCode: ShareStartupErrorCode;
  fallbackTitle: string;
  fallbackDescription: string;
  retryLabel: string;
  copyLogLabel: string;
  networkTimeoutTitle: string;
  networkTimeoutDescription: string;
  cloudflaredMissingTitle: string;
  cloudflaredMissingDescription: string;
}): ShareStartupError {
  const message = toErrorMessage(input.error);

  if (input.fallbackCode === "network_timeout") {
    return {
      code: "network_timeout",
      title: input.networkTimeoutTitle,
      description: input.networkTimeoutDescription,
      primaryAction: "retry",
      primaryActionLabel: input.retryLabel,
      log: message,
    };
  }

  if (input.fallbackCode === "cloudflared_missing") {
    return {
      code: "cloudflared_missing",
      title: input.cloudflaredMissingTitle,
      description: input.cloudflaredMissingDescription,
      primaryAction: "copy_log",
      primaryActionLabel: input.copyLogLabel,
      log: message,
    };
  }

  return {
    code: input.fallbackCode,
    title: input.fallbackTitle,
    description: input.fallbackDescription,
    primaryAction: "retry",
    primaryActionLabel: input.retryLabel,
    log: message,
  };
}
