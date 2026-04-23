import type { Provider } from "@/types";
import { marketApi } from "@/lib/api";
import { describe, expect, it, vi } from "vitest";

const { invokeMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

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

  it("maps pricePer1kTokens to backend price payload field", async () => {
    invokeMock.mockResolvedValueOnce("ok");

    await marketApi.startSellingTokens({
      providerId: "provider-1",
      modelName: "gpt-4o-mini",
      pricePer1kTokens: 42,
      endpoint: "https://demo.trycloudflare.com",
    } as any);

    expect(invokeMock).toHaveBeenCalledWith("start_selling_tokens", {
      providerId: "provider-1",
      modelName: "gpt-4o-mini",
      price: 42,
      endpoint: "https://demo.trycloudflare.com",
    });
  });
});
