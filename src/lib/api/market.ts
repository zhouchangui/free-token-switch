import { invoke } from "@tauri-apps/api/core";

export interface SellerPricingSuggestion {
  pricePer1kTokens: number;
  source: string;
}

export interface StartSellingTokensInput {
  providerId: string;
  modelName: string;
  // Backend command expects `price` and interprets it as sats per 1k tokens.
  price: number;
  endpoint: string;
}

export const marketApi = {
  async startCloudflareTunnel(port: number): Promise<string> {
    return await invoke("start_cloudflare_tunnel", { port });
  },

  async startSellingTokens(input: StartSellingTokensInput): Promise<string> {
    return await invoke("start_selling_tokens", input);
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
