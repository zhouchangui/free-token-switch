import { useEffect, useState } from "react";
import { Copy, Store } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ProviderSellerConfig } from "@/types";
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
  onSave: (config: ProviderSellerConfig) => void;
}

function toDraft(config?: ProviderSellerConfig): ProviderSellerConfig {
  return {
    enabled: config?.enabled ?? false,
    mode: config?.mode ?? "free",
    pricePer1kTokens: config?.pricePer1kTokens,
    endpoint: config?.endpoint,
    accessToken: config?.accessToken,
    status: config?.status ?? "idle",
  };
}

export function ProviderSellerPopover({
  providerId,
  providerName,
  sellerConfig,
  onSave,
}: ProviderSellerPopoverProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ProviderSellerConfig>(() =>
    toDraft(sellerConfig),
  );

  useEffect(() => {
    if (!open) {
      return;
    }
    setDraft(toDraft(sellerConfig));
  }, [open, sellerConfig]);

  const isFreeMode = draft.mode !== "paid";
  const showCopyActions =
    draft.status === "active_free" || draft.status === "active_paid";

  const copyText = async (value?: string) => {
    if (!value || !navigator?.clipboard?.writeText) {
      return;
    }
    await navigator.clipboard.writeText(value);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          aria-label={t("provider.seller", { defaultValue: "Seller" })}
          title={t("provider.sellerFor", {
            defaultValue: `Seller for ${providerName}`,
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
            value={draft.pricePer1kTokens ?? ""}
            onChange={(event) => {
              const value = event.target.value;
              setDraft((prev) => ({
                ...prev,
                pricePer1kTokens: value === "" ? undefined : Number(value),
              }));
            }}
          />
        </div>

        {showCopyActions && (
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
        )}

        <Button type="button" className="w-full" onClick={() => onSave(draft)}>
          {t("common.save", { defaultValue: "Save" })}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
