import { invoke } from "@tauri-apps/api/core";

export interface SellerPricingSuggestion {
  pricePer1kTokens: number;
  source: string;
}

export interface StartSellingTokensInput {
  providerId: string;
  modelName: string;
  // Frontend-facing field, aligned with ProviderSellerConfig semantics.
  pricePer1kTokens: number;
  endpoint: string;
}

export const marketApi = {
  async startCloudflareTunnel(port: number): Promise<string> {
    return await invoke("start_cloudflare_tunnel", { port });
  },

  async startSellingTokens(input: StartSellingTokensInput): Promise<string> {
    return await invoke("start_selling_tokens", {
      providerId: input.providerId,
      modelName: input.modelName,
      // Backend command contract expects `price` (sats per 1k tokens).
      price: input.pricePer1kTokens,
      endpoint: input.endpoint,
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
  ): Promise<SellerPricingSuggestion> {
    return await invoke("get_suggested_seller_price", { providerId });
  },
};
