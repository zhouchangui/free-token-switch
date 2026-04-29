import { invoke } from "@tauri-apps/api/core";
import type { MarketPriceUnit, ProviderMarketModelPrice } from "@/types";

export interface SellerPricingSuggestion {
  pricePer1kTokens: number;
  source: string;
  modelPrice?: ProviderMarketModelPrice;
}

export interface StartSellingTokensInput {
  providerId: string;
  modelName: string;
  // Frontend-facing field, aligned with ProviderSellerConfig semantics.
  pricePer1kTokens: number;
  endpoint: string;
  modelPrices?: ProviderMarketModelPrice[];
  priceUnit?: MarketPriceUnit;
  priceVersion?: number;
  amountFen?: number;
  payTo?: string;
  indicator?: string;
  accessToken?: string;
}

export interface CloudflaredCheckResult {
  installed: boolean;
  version?: string | null;
  path?: string | null;
  installCommand: string;
}

export interface SellerRuntimeStatus {
  providerId: string;
  tunnelRunning: boolean;
  hasActiveToken: boolean;
  status: "idle" | "running";
}

export interface MarketPaymentListing {
  provider: string;
  mode: string;
  amountFen: number;
  currency: string;
  skillSlug: string;
  indicator: string;
  payTo: string;
}

export interface MarketListing {
  provider_id: string;
  model_name: string;
  price_per_1k_tokens: number;
  endpoint: string;
  seller_pubkey: string;
  timestamp: number;
  status?: "available" | "reserved" | "busy" | "offline";
  capacity?: number;
  payment?: MarketPaymentListing | null;
  resourceUrl?: string;
  amountFen?: number;
  accessToken?: string | null;
}

export const marketApi = {
  async checkCloudflared(): Promise<CloudflaredCheckResult> {
    return await invoke("check_cloudflared");
  },

  async startCloudflareTunnel(port: number): Promise<string> {
    return await invoke("start_cloudflare_tunnel", { port });
  },

  async findAiSellers(): Promise<MarketListing[]> {
    return await invoke("find_ai_sellers");
  },

  async startSellingTokens(input: StartSellingTokensInput): Promise<string> {
    return await invoke("start_selling_tokens", {
      input: {
        providerId: input.providerId,
        modelName: input.modelName,
        // Backend command contract expects `price` as the legacy compatibility field.
        price: input.pricePer1kTokens,
        endpoint: input.endpoint,
        modelPrices: input.modelPrices ?? [],
        priceUnit: input.priceUnit ?? "PER_1M_TOKENS",
        priceVersion: input.priceVersion ?? 1,
        amountFen: input.amountFen,
        payTo: input.payTo,
        indicator: input.indicator,
        accessToken: input.accessToken,
      },
    });
  },

  async stopSellingTokens(providerId: string): Promise<boolean> {
    return await invoke("stop_selling_tokens", { providerId });
  },

  async generateSellerAccessToken(providerId: string): Promise<string> {
    return await invoke("generate_seller_access_token", { providerId });
  },

  async getSuggestedSellerPrice(
    providerId: string,
    modelName?: string,
  ): Promise<SellerPricingSuggestion> {
    return await invoke("get_suggested_seller_price", {
      providerId,
      modelName,
    });
  },

  async getSellerRuntimeStatus(
    providerId: string,
  ): Promise<SellerRuntimeStatus> {
    return await invoke("get_seller_runtime_status", { providerId });
  },
};
