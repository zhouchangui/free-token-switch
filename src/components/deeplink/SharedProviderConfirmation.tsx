import type { DeepLinkImportRequest } from "@/lib/api/deeplink";
import type { FetchedModel } from "@/lib/api/model-fetch";
import { useTranslation } from "react-i18next";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface SharedProviderConfirmationProps {
  request: DeepLinkImportRequest;
  models: FetchedModel[];
  selectedModel: string;
  onSelectModel: (value: string) => void;
  isLoading: boolean;
  error: string | null;
}

export function SharedProviderConfirmation({
  request,
  models,
  selectedModel,
  onSelectModel,
  isLoading,
  error,
}: SharedProviderConfirmationProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 p-3 text-sm text-blue-800 dark:text-blue-200">
        {t("deeplink.sharedProviderHint", {
          defaultValue: "这是一个共享 Provider，导入前需要先校验并选择模型。",
        })}
      </div>

      <div className="grid grid-cols-3 items-center gap-4">
        <div className="font-medium text-sm text-muted-foreground">
          {t("deeplink.providerName")}
        </div>
        <div className="col-span-2 text-sm font-medium">{request.name}</div>
      </div>

      <div className="grid grid-cols-3 items-start gap-4">
        <div className="font-medium text-sm text-muted-foreground pt-0.5">
          {t("deeplink.endpoint")}
        </div>
        <div className="col-span-2 text-sm break-all">{request.endpoint}</div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="shared-provider-model">
          {t("deeplink.sharedProviderModel", {
            defaultValue: "选择模型",
          })}
        </Label>
        <Select
          value={selectedModel}
          onValueChange={onSelectModel}
          disabled={isLoading || !!error || models.length === 0}
        >
          <SelectTrigger id="shared-provider-model">
            <SelectValue
              placeholder={t("deeplink.sharedProviderModelPlaceholder", {
                defaultValue: "请选择模型",
              })}
            />
          </SelectTrigger>
          <SelectContent>
            {models.map((model) => (
              <SelectItem key={model.id} value={model.id}>
                {model.id}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {request.model && models.length > 0 && !models.some((m) => m.id === request.model) ? (
        <p className="text-xs text-amber-700 dark:text-amber-300">
          {t("deeplink.sharedProviderRecommendedModelMissing", {
            defaultValue: "推荐模型不在可用列表中，请重新选择。",
          })}
        </p>
      ) : null}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">
          {t("deeplink.sharedProviderLoadingModels", {
            defaultValue: "正在拉取模型列表...",
          })}
        </p>
      ) : null}

      {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
    </div>
  );
}
