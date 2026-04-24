import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Copy } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { AppId } from "@/lib/api";
import { marketApi } from "@/lib/api";
import { proxyApi } from "@/lib/api/proxy";
import { usageApi } from "@/lib/api/usage";
import { Button } from "@/components/ui/button";
import { ProviderIcon } from "@/components/ProviderIcon";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import type {
  Provider,
  ProviderShareConfig,
  ProviderShareStatus,
} from "@/types";
import type { ProviderStats } from "@/types/usage";
import { extractProviderDisplayUrl } from "@/components/providers/providerDisplayUtils";
import {
  deriveShareRuntimeStats,
  toProviderShareConfig,
  type ShareRuntimeStats,
} from "@/components/providers/providerShareSettingsUtils";

const SELLER_TUNNEL_PORT = 15721;

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
  const shareConfigRef = useRef(initialShareConfig);
  const friendStartOpRef = useRef(0);
  const marketStartOpRef = useRef(0);
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
        providerTokensSinceStart,
      }),
    [providerTokensSinceStart, proxyStatusQuery.data, shareConfig],
  );

  useEffect(() => {
    shareConfigRef.current = initialShareConfig;
    setShareConfig(initialShareConfig);
  }, [initialShareConfig]);

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
    const friendAtStart = current.friend;

    setShareConfigPatch((latest) => ({
      ...latest,
      friend: {
        ...latest.friend,
        enabled: true,
        status: "starting",
        lastError: null,
      },
    }));

    try {
      const { endpoint, accessToken } = await ensureShareEndpointAndToken({
        providerId: provider.id,
        existingEndpoint: friendAtStart.endpoint,
        existingAccessToken: friendAtStart.accessToken,
      });

      if (friendStartOpRef.current !== operationId) {
        return;
      }

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
      }));
    } catch (error) {
      if (friendStartOpRef.current !== operationId) {
        return;
      }

      try {
        await saveShareConfigPatch((latest) => ({
          ...latest,
          friend: {
            ...latest.friend,
            enabled: false,
            status: "error",
            lastError: toErrorMessage(error),
          },
        }));
      } catch {
        setShareConfigPatch((latest) => ({
          ...latest,
          friend: {
            ...latest.friend,
            enabled: false,
            status: "error",
            lastError: toErrorMessage(error),
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
    const marketAtStart = current.market;

    setShareConfigPatch((latest) => ({
      ...latest,
      market: {
        ...latest.market,
        enabled: true,
        status: "starting",
        lastError: null,
      },
    }));

    let nextEndpoint = marketAtStart.endpoint;
    let nextAccessToken = marketAtStart.accessToken;

    try {
      const { endpoint, accessToken } = await ensureShareEndpointAndToken({
        providerId: provider.id,
        existingEndpoint: marketAtStart.endpoint,
        existingAccessToken: marketAtStart.accessToken,
      });
      nextEndpoint = endpoint;
      nextAccessToken = accessToken;
      const pricePer1kTokens =
        marketAtStart.pricingStrategy === "custom"
          ? normalizePrice(marketAtStart.pricePer1kTokens)
          : 0;

      await marketApi.startSellingTokens({
        providerId: provider.id,
        modelName: provider.name,
        pricePer1kTokens,
        endpoint,
      });

      if (marketStartOpRef.current !== operationId) {
        return;
      }

      const startedAt = Date.now();
      await saveShareConfigPatch((latest) => ({
        ...latest,
        market: {
          ...latest.market,
          enabled: true,
          status: "running",
          pricePer1kTokens,
          endpoint,
          accessToken,
          startedAt,
          lastPublishedAt: startedAt,
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
            enabled: false,
            status: "error",
            endpoint: nextEndpoint,
            accessToken: nextAccessToken,
            lastError: toErrorMessage(error),
          },
        }));
      } catch {
        setShareConfigPatch((latest) => ({
          ...latest,
          market: {
            ...latest.market,
            enabled: false,
            status: "error",
            endpoint: nextEndpoint,
            accessToken: nextAccessToken,
            lastError: toErrorMessage(error),
          },
        }));
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        className="max-w-5xl overflow-y-auto p-0"
        zIndex="top"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>
            {t("provider.shareSettingsFor", {
              name: provider.name,
              defaultValue: "{{name}} 的分享设置",
            })}
          </DialogTitle>
        </DialogHeader>
        <div className="bg-slate-50 p-6 text-slate-950">
          <section className="rounded-lg bg-white p-5 shadow-sm">
            <ProviderShareHeader provider={provider} />
            <ProviderShareStatsStrip stats={runtimeStats} />

            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="mt-4 grid w-fit grid-cols-2 bg-slate-100">
                <TabsTrigger value="friend">
                  {t("provider.friendShare", { defaultValue: "分享拼车" })}
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
                  onEnabledChange={updateFriendEnabled}
                />
              </TabsContent>

              <TabsContent value="market" className="mt-4">
                <MarketSharePanel
                  config={shareConfig}
                  onEnabledChange={updateMarketEnabled}
                />
              </TabsContent>
            </Tabs>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ProviderShareHeader({ provider }: { provider: Provider }) {
  const { t } = useTranslation();
  const fallbackUrlText = t("provider.notConfigured", {
    defaultValue: "未配置接口地址",
  });
  const displayUrl = extractProviderDisplayUrl(provider, fallbackUrlText);

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
          {displayUrl ? (
            <p className="mt-1 truncate text-sm text-slate-500">
              {displayUrl}
            </p>
          ) : null}
          <p className="mt-1 text-sm text-slate-500">
            {t("provider.shareSettingsDescription", {
              defaultValue: "管理好友共享和市场售卖设置",
            })}
          </p>
        </div>
      </div>
      <div className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
        V10
      </div>
    </header>
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
  return (
    <div className="flex items-center justify-between gap-4 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-3">
      <div className="min-w-0">
        <div className="text-sm font-semibold text-emerald-950">{label}</div>
        <div className="mt-0.5 text-xs text-emerald-700">{description}</div>
      </div>
      <Switch
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
        aria-label={ariaLabel}
      />
    </div>
  );
}

function FriendSharePanel({
  appId,
  provider,
  config,
  onEnabledChange,
}: {
  appId: AppId;
  provider: Provider;
  config: ProviderShareConfig;
  onEnabledChange: (enabled: boolean) => Promise<void> | void;
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
        label={t("provider.friendShare", { defaultValue: "分享拼车" })}
        description={t("provider.friendShareDescription", {
          defaultValue: "开启后可把当前通道分享给朋友一起使用",
        })}
        checked={config.friend.enabled}
        disabled={config.friend.status === "starting"}
        ariaLabel={t("provider.friendShareEnable", {
          defaultValue: "分享拼车开关",
        })}
        onCheckedChange={onEnabledChange}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <InfoCard
          title={t("provider.friendEndpoint", { defaultValue: "好友入口" })}
          value={
            friendEndpoint ??
            t("provider.friendEndpointPending", { defaultValue: "待启动" })
          }
        />
        <InfoCard
          title={t("provider.friendAccessToken", {
            defaultValue: "访问令牌",
          })}
          value={
            friendAccessToken
              ? t("provider.friendAccessTokenReady", {
                  defaultValue: "已生成",
                })
              : t("provider.friendAccessTokenPending", {
                  defaultValue: "待生成",
                })
          }
        />
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          variant="outline"
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
          variant="outline"
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
    </div>
  );
}

function MarketSharePanel({
  config,
  onEnabledChange,
}: {
  config: ProviderShareConfig;
  onEnabledChange: (enabled: boolean) => Promise<void> | void;
}) {
  const { t } = useTranslation();

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
      <div className="grid gap-3 md:grid-cols-2">
        <InfoCard
          title={t("provider.clawTipAccount", {
            defaultValue: "ClawTip 收款账户",
          })}
          value={t("provider.clawTipUnbound", {
            defaultValue: "启动后配置收款信息",
          })}
        />
        <PricingStrategyCards config={config} />
      </div>
    </div>
  );
}

function PricingStrategyCards({ config }: { config: ProviderShareConfig }) {
  const { t } = useTranslation();
  const price =
    typeof config.market.pricePer1kTokens === "number"
      ? `${config.market.pricePer1kTokens} / 1K Tokens`
      : t("provider.followProviderPricingHint", {
          defaultValue: "使用平台建议",
        });

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="text-sm font-semibold text-slate-950">
        {t("provider.pricingStrategy", { defaultValue: "定价策略" })}
      </div>
      <div className="mt-3 grid gap-2">
        <div className="rounded-md border border-emerald-200 bg-white p-3">
          <div className="text-xs font-medium text-emerald-700">
            {t("provider.followProviderPricing", { defaultValue: "推荐" })}
          </div>
          <div className="mt-1 text-sm text-slate-900">{price}</div>
        </div>
        <div className="rounded-md border border-slate-200 bg-white p-3">
          <div className="text-xs font-medium text-slate-500">
            {t("provider.customSellingPrice", { defaultValue: "自定义价格" })}
          </div>
          <div className="mt-1 text-sm text-slate-900">
            {t("provider.customSellingPriceHint", {
              defaultValue: "后续任务接入",
            })}
          </div>
        </div>
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

function normalizePrice(value?: number): number {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.max(0, Math.round(parsed));
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
