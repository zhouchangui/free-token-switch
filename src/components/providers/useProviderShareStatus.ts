import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toProviderShareConfig } from "@/components/providers/providerShareSettingsUtils";
import { marketApi, type AppId } from "@/lib/api";
import type { ProvidersQueryData } from "@/lib/query/queries";
import type { Provider } from "@/types";

export type ProviderShareActivity = "friend" | "market" | null;

export function useProviderShareStatus(
  appId: AppId,
  providerId?: string,
  fallbackProvider?: Provider,
) {
  const queryClient = useQueryClient();
  const queryKey = ["providers", appId] as const;

  const { data } = useQuery<ProvidersQueryData>({
    queryKey,
    enabled: false,
    queryFn: async () =>
      queryClient.getQueryData<ProvidersQueryData>(queryKey) ?? {
        providers: {},
        currentProviderId: "",
      },
  });

  const baseProvider = providerId
    ? (data?.providers[providerId] ?? fallbackProvider)
    : fallbackProvider;
  const baseShareConfig = baseProvider
    ? toProviderShareConfig(baseProvider.meta)
    : null;
  const shouldReadRuntime =
    Boolean(providerId) &&
    (baseShareConfig?.friend.status === "running" ||
      baseShareConfig?.market.status === "running");
  const runtimeStatusQuery = useQuery({
    queryKey: ["provider-share", "seller-runtime-status", providerId],
    queryFn: () => marketApi.getSellerRuntimeStatus(providerId!),
    enabled: shouldReadRuntime,
    refetchInterval: shouldReadRuntime ? 2000 : false,
  });

  return useMemo(() => {
    const provider = providerId
      ? (data?.providers[providerId] ?? fallbackProvider)
      : fallbackProvider;
    const shareConfig = provider ? toProviderShareConfig(provider.meta) : null;
    const runtimeRunning = runtimeStatusQuery.data?.status === "running";
    const friendActive =
      (shareConfig?.friend.status === "running" && runtimeRunning) ||
      shareConfig?.friend.status === "starting";
    const marketActive =
      (shareConfig?.market.status === "running" && runtimeRunning) ||
      shareConfig?.market.status === "starting";
    const activity: ProviderShareActivity = marketActive
      ? "market"
      : friendActive
        ? "friend"
        : null;

    return {
      shareConfig,
      isShareEnabled:
        shareConfig?.friend.enabled === true ||
        shareConfig?.market.enabled === true,
      isShareInProgress: activity !== null,
      activity,
    };
  }, [data?.providers, fallbackProvider, providerId, runtimeStatusQuery.data]);
}
