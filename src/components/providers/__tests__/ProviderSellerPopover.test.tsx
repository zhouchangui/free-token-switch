import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { marketApi } from "@/lib/api";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildSharedProviderLink,
  ProviderSellerPopover,
} from "@/components/providers/ProviderSellerPopover";
import type { Provider } from "@/types";

const { invokeMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
}));

let clipboardWriteTextMock: ReturnType<typeof vi.fn>;

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

beforeEach(() => {
  invokeMock.mockReset();
  clipboardWriteTextMock = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: clipboardWriteTextMock },
  });
});

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

describe("ProviderSellerPopover", () => {
  it("disables price input when free mode is enabled", async () => {
    const user = userEvent.setup();

    render(
      <ProviderSellerPopover
        providerId="provider-1"
        providerName="Demo"
        sellerConfig={{ enabled: false, mode: "free", status: "idle" }}
        onSave={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /seller/i }));
    expect(screen.getByLabelText(/price/i)).toBeDisabled();
  });

  it("shows copy actions after a free seller becomes active", async () => {
    const user = userEvent.setup();

    render(
      <ProviderSellerPopover
        providerId="provider-1"
        providerName="Demo"
        sellerConfig={{
          enabled: true,
          mode: "free",
          status: "active_free",
          endpoint: "https://demo.trycloudflare.com",
          accessToken: "ccs_sell_demo",
        }}
        onSave={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /seller/i }));
    expect(
      screen.getByRole("button", { name: /copy endpoint/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /copy token/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /copy share link/i }),
    ).toBeInTheDocument();
  });

  it("builds a shared provider deeplink with shared seller metadata", () => {
    const link = buildSharedProviderLink({
      providerName: "Kimi For Coding",
      endpoint: "https://demo.trycloudflare.com",
      accessToken: "ccs_sell_token",
      recommendedModel: "kimi-for-coding",
    });

    expect(link).toContain("ccswitch://v1/import?resource=provider");
    expect(link).toContain("providerType=shared_seller");
    expect(link).toContain("shareMode=free");
    expect(link).toContain("requiresModelSelection=true");
    expect(link).toContain("model=kimi-for-coding");
  });

  it("enables selling via market api and persists active free seller config", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    invokeMock
      .mockResolvedValueOnce("seller-token")
      .mockResolvedValueOnce("https://demo.trycloudflare.com")
      .mockResolvedValueOnce("ok");

    render(
      <ProviderSellerPopover
        providerId="provider-1"
        providerName="Demo"
        sellerConfig={{ enabled: false, mode: "free", status: "idle" }}
        onSave={onSave}
      />,
    );

    await user.click(screen.getByRole("button", { name: /seller/i }));
    await user.click(screen.getAllByRole("switch")[0]);
    await user.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1);
    });

    expect(invokeMock).toHaveBeenCalledWith("generate_seller_access_token", {
      providerId: "provider-1",
    });
    expect(invokeMock).toHaveBeenCalledWith("start_cloudflare_tunnel", {
      port: 15721,
    });
    expect(invokeMock).toHaveBeenCalledWith("start_selling_tokens", {
      providerId: "provider-1",
      modelName: "Demo",
      price: 0,
      endpoint: "https://demo.trycloudflare.com",
    });
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: true,
        mode: "free",
        status: "active_free",
        endpoint: "https://demo.trycloudflare.com",
        accessToken: "seller-token",
        lastError: null,
        lastPublishedAt: expect.any(Number),
      }),
    );
  });

  it("disables selling via market api and persists idle status", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    invokeMock.mockResolvedValueOnce(true);

    render(
      <ProviderSellerPopover
        providerId="provider-1"
        providerName="Demo"
        sellerConfig={{
          enabled: true,
          mode: "paid",
          status: "active_paid",
          endpoint: "https://demo.trycloudflare.com",
          accessToken: "seller-token",
          pricePer1kTokens: 12,
        }}
        onSave={onSave}
      />,
    );

    await user.click(screen.getByRole("button", { name: /seller/i }));
    await user.click(screen.getAllByRole("switch")[0]);
    await user.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1);
    });

    expect(invokeMock).toHaveBeenCalledWith("stop_selling_tokens", {
      providerId: "provider-1",
    });
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: false,
        status: "idle",
        lastError: null,
      }),
    );
  });

  it("fetches suggested price and uses it when enabling paid mode", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    invokeMock
      .mockResolvedValueOnce({ pricePer1kTokens: 37, source: "suggested" })
      .mockResolvedValueOnce("seller-token")
      .mockResolvedValueOnce("https://demo.trycloudflare.com")
      .mockResolvedValueOnce("ok");

    render(
      <ProviderSellerPopover
        providerId="provider-1"
        providerName="Demo"
        sellerConfig={{
          enabled: false,
          mode: "paid",
          pricePer1kTokens: 1,
          acceptsSuggestedPricing: true,
          status: "idle",
        }}
        onSave={onSave}
      />,
    );

    await user.click(screen.getByRole("button", { name: /seller/i }));
    await user.click(screen.getByRole("button", { name: /apply suggested/i }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("get_suggested_seller_price", {
        providerId: "provider-1",
      });
    });
    expect(screen.getByLabelText(/price/i)).toHaveValue(37);

    await user.click(screen.getAllByRole("switch")[0]);
    await user.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1);
    });
    expect(invokeMock).toHaveBeenCalledWith("start_selling_tokens", {
      providerId: "provider-1",
      modelName: "Demo",
      price: 37,
      endpoint: "https://demo.trycloudflare.com",
    });
  });
});
