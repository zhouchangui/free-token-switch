import { useEffect, useState } from "react";
import { Copy, Store } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ProviderSellerConfig } from "@/types";
import { marketApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";

interface ProviderSellerPopoverProps {
  providerId: string;
  providerName: string;
  sellerConfig?: ProviderSellerConfig;
  onSave: (config: ProviderSellerConfig) => Promise<void> | void;
}

const SELLER_TUNNEL_PORT = 15721;

export function buildSharedProviderLink(input: {
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

  if (input.recommendedModel) {
    params.set("model", input.recommendedModel);
  }

  return `ccswitch://v1/import?${params.toString()}`;
}

function toDraft(config?: ProviderSellerConfig): ProviderSellerConfig {
  return {
    enabled: config?.enabled ?? false,
    mode: config?.mode ?? "paid",
    pricePer1kTokens: config?.pricePer1kTokens,
    acceptsSuggestedPricing: config?.acceptsSuggestedPricing ?? false,
    suggestedPricePer1kTokens: config?.suggestedPricePer1kTokens,
    endpoint: config?.endpoint,
    accessToken: config?.accessToken,
    status: config?.status ?? "idle",
    lastError: config?.lastError ?? null,
    lastPublishedAt: config?.lastPublishedAt ?? null,
  };
}

function normalizePrice(value?: number): number {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.max(0, Math.round(parsed));
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return "Unknown seller error";
}

export function ProviderSellerPopover({
  providerId,
  providerName,
  sellerConfig,
  onSave,
}: ProviderSellerPopoverProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isApplyingSuggestedPrice, setIsApplyingSuggestedPrice] =
    useState(false);
  const [draft, setDraft] = useState<ProviderSellerConfig>(() =>
    toDraft(sellerConfig),
  );

  useEffect(() => {
    if (!open) {
      return;
    }
    setDraft(toDraft(sellerConfig));
  }, [open, sellerConfig]);

  const isFreeMode = draft.mode === "free";
  const showCopyActions =
    draft.status === "active_free" || draft.status === "active_paid";
  const shareLink =
    draft.endpoint && draft.accessToken
      ? buildSharedProviderLink({
          providerName,
          endpoint: draft.endpoint,
          accessToken: draft.accessToken,
        })
      : null;

  const copyText = async (value?: string) => {
    if (!value || !navigator?.clipboard?.writeText) {
      return;
    }
    await navigator.clipboard.writeText(value);
  };

  const handleApplySuggestedPrice = async () => {
    setIsApplyingSuggestedPrice(true);
    try {
      const suggestion = await marketApi.getSuggestedSellerPrice(providerId);
      setDraft((prev) => ({
        ...prev,
        pricePer1kTokens: suggestion.pricePer1kTokens,
        suggestedPricePer1kTokens: suggestion.pricePer1kTokens,
      }));
    } finally {
      setIsApplyingSuggestedPrice(false);
    }
  };

  const persist = async (nextConfig: ProviderSellerConfig) => {
    await Promise.resolve(onSave(nextConfig));
    setDraft(nextConfig);
  };

  const handleSave = async () => {
    setIsSaving(true);

    try {
      if (draft.enabled) {
        const accessToken =
          draft.accessToken && draft.accessToken.trim()
            ? draft.accessToken
            : await marketApi.generateSellerAccessToken(providerId);
        const endpoint =
          draft.endpoint && draft.endpoint.trim()
            ? draft.endpoint
            : await marketApi.startCloudflareTunnel(SELLER_TUNNEL_PORT);
        const pricePer1kTokens =
          draft.mode === "free" ? 0 : normalizePrice(draft.pricePer1kTokens);

        await marketApi.startSellingTokens({
          providerId,
          modelName: providerName,
          pricePer1kTokens,
          endpoint,
        });

        await persist({
          ...draft,
          enabled: true,
          mode: draft.mode === "free" ? "free" : "paid",
          pricePer1kTokens,
          endpoint,
          accessToken,
          status: draft.mode === "free" ? "active_free" : "active_paid",
          lastPublishedAt: Date.now(),
          lastError: null,
        });
      } else {
        await marketApi.stopSellingTokens(providerId);
        await persist({
          ...draft,
          enabled: false,
          status: "idle",
          lastError: null,
        });
      }

      setOpen(false);
    } catch (error) {
      try {
        await persist({
          ...draft,
          status: "error",
          lastError: toErrorMessage(error),
        });
      } catch {
        // Keep flow minimal: if persistence fails here, caller handles outer save errors.
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          aria-label={t("provider.seller", { defaultValue: "Seller" })}
          title={t("provider.sellerFor", {
            name: providerName,
            defaultValue: "Seller for {{name}}",
          })}
        >
          <Store className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[320px] space-y-3 p-3">
        <div className="space-y-1">
          <p className="text-sm font-medium">
            {t("provider.sellerSettings", { defaultValue: "Seller settings" })}
          </p>
          <p className="text-xs text-muted-foreground">{providerName}</p>
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor={`${providerId}-seller-enabled`}>
            {t("provider.enableSelling", { defaultValue: "Enable selling" })}
          </Label>
          <Switch
            id={`${providerId}-seller-enabled`}
            checked={Boolean(draft.enabled)}
            onCheckedChange={(checked) =>
              setDraft((prev) => ({ ...prev, enabled: checked }))
            }
          />
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor={`${providerId}-seller-free`}>
            {t("provider.sellerFree", { defaultValue: "Free" })}
          </Label>
          <Switch
            id={`${providerId}-seller-free`}
            checked={isFreeMode}
            onCheckedChange={(checked) =>
              setDraft((prev) => ({
                ...prev,
                mode: checked ? "free" : "paid",
                pricePer1kTokens: checked
                  ? 0
                  : prev.pricePer1kTokens && prev.pricePer1kTokens > 0
                    ? prev.pricePer1kTokens
                    : 1,
              }))
            }
          />
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor={`${providerId}-seller-accepts-suggested-pricing`}>
            {t("provider.acceptSuggestedPricing", {
              defaultValue: "Accept suggested pricing",
            })}
          </Label>
          <Switch
            id={`${providerId}-seller-accepts-suggested-pricing`}
            checked={Boolean(draft.acceptsSuggestedPricing)}
            onCheckedChange={(checked) =>
              setDraft((prev) => ({
                ...prev,
                acceptsSuggestedPricing: checked,
              }))
            }
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${providerId}-seller-price`}>
            {t("provider.sellerPrice", { defaultValue: "Price" })}
          </Label>
          <Input
            id={`${providerId}-seller-price`}
            type="number"
            min={0}
            step="0.01"
            disabled={isFreeMode}
            value={isFreeMode ? 0 : (draft.pricePer1kTokens ?? "")}
            onChange={(event) => {
              const value = event.target.value;
              setDraft((prev) => ({
                ...prev,
                pricePer1kTokens: value === "" ? undefined : Number(value),
              }));
            }}
          />
        </div>

        {!isFreeMode && draft.acceptsSuggestedPricing && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void handleApplySuggestedPrice()}
            disabled={isApplyingSuggestedPrice || isSaving}
            className="w-full"
          >
            {isApplyingSuggestedPrice
              ? t("provider.applyingSuggestedPrice", {
                  defaultValue: "Applying suggested price...",
                })
              : t("provider.applySuggestedPrice", {
                  defaultValue: "Apply suggested price",
                })}
          </Button>
        )}

        {showCopyActions && (
          <div className="flex flex-col gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="w-full"
              disabled={!shareLink}
              onClick={() => void copyText(shareLink ?? undefined)}
            >
              <Copy className="h-3.5 w-3.5" />
              {t("provider.copyShareLink", {
                defaultValue: "Copy share link",
              })}
            </Button>

            <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="flex-1"
              onClick={() => void copyText(draft.endpoint)}
            >
              <Copy className="h-3.5 w-3.5" />
              {t("provider.copyEndpoint", { defaultValue: "Copy endpoint" })}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="flex-1"
              onClick={() => void copyText(draft.accessToken)}
            >
              <Copy className="h-3.5 w-3.5" />
              {t("provider.copyToken", { defaultValue: "Copy token" })}
            </Button>
            </div>
          </div>
        )}

        <Button
          type="button"
          className="w-full"
          onClick={() => void handleSave()}
          disabled={isSaving}
        >
          {t("common.save", { defaultValue: "Save" })}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
