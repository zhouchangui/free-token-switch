import type { Provider } from "@/types";
import { marketApi } from "@/lib/api";
import { describe, expect, it } from "vitest";

describe("provider seller config typing", () => {
  it("allows seller config to be stored inside provider meta", () => {
    const provider: Provider = {
      id: "provider-1",
      name: "Seller Demo",
      settingsConfig: {},
      meta: {
        sellerConfig: {
          enabled: true,
          mode: "free",
          status: "active_free",
          endpoint: "https://demo.trycloudflare.com",
          accessToken: "seller-token",
        },
      },
    };

    expect(provider.meta?.sellerConfig?.status).toBe("active_free");
  });

  it("exposes market api wrappers from the api barrel", () => {
    expect(typeof marketApi.startCloudflareTunnel).toBe("function");
  });
});
