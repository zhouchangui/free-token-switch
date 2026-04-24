import { render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { ProviderActions } from "@/components/providers/ProviderActions";
import {
  buildSharedProviderLink,
  ProviderShareSettingsDialog,
} from "@/components/providers/ProviderShareSettingsDialog";
import { marketApi } from "@/lib/api";
import { marketApi as actualMarketApi } from "@/lib/api/market";
import { proxyApi } from "@/lib/api/proxy";
import { usageApi } from "@/lib/api/usage";

const { invokeMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
}));

let clipboardWriteTextMock: ReturnType<typeof vi.fn>;

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    marketApi: {
      startCloudflareTunnel: vi.fn(),
      startSellingTokens: vi.fn(),
      generateSellerAccessToken: vi.fn(),
      stopSellingTokens: vi.fn(),
      getSuggestedSellerPrice: vi.fn(),
    },
  };
});

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock("@/lib/api/proxy", () => ({
  proxyApi: {
    getProxyStatus: vi.fn(),
  },
}));

vi.mock("@/lib/api/usage", () => ({
  usageApi: {
    getProviderStats: vi.fn(),
  },
}));

beforeEach(() => {
  invokeMock.mockReset();
  clipboardWriteTextMock = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(globalThis.navigator, "clipboard", {
    configurable: true,
    value: { writeText: clipboardWriteTextMock },
  });
  vi.mocked(marketApi.generateSellerAccessToken).mockReset();
  vi.mocked(marketApi.startCloudflareTunnel).mockReset();
  vi.mocked(marketApi.startSellingTokens).mockReset();
  vi.mocked(marketApi.stopSellingTokens).mockReset();
  vi.mocked(marketApi.getSuggestedSellerPrice).mockReset();
  vi.mocked(proxyApi.getProxyStatus).mockReset();
  vi.mocked(usageApi.getProviderStats).mockReset();
  vi.mocked(proxyApi.getProxyStatus).mockResolvedValue(
    proxyStatusFixture({
      running: false,
      active_connections: 0,
    }),
  );
  vi.mocked(usageApi.getProviderStats).mockResolvedValue(
    providerStatsFixture([]),
  );
});

describe("provider market api", () => {
  it("maps pricePer1kTokens to backend price payload field", async () => {
    invokeMock.mockResolvedValueOnce("ok");

    await actualMarketApi.startSellingTokens({
      providerId: "provider-1",
      modelName: "gpt-4o-mini",
      pricePer1kTokens: 42,
      endpoint: "https://demo.trycloudflare.com",
    });

    expect(invokeMock).toHaveBeenCalledWith("start_selling_tokens", {
      providerId: "provider-1",
      modelName: "gpt-4o-mini",
      price: 42,
      endpoint: "https://demo.trycloudflare.com",
    });
  });
});

describe("buildSharedProviderLink", () => {
  it("builds a shared provider deeplink with shared seller metadata", () => {
    const link = buildSharedProviderLink({
      appId: "codex",
      providerName: "Kimi For Coding",
      endpoint: "https://demo.trycloudflare.com",
      accessToken: "ccs_sell_token",
      recommendedModel: "kimi-for-coding",
    });

    expect(link).toContain("ccswitch://v1/import?resource=provider");
    expect(link).toContain("app=codex");
    expect(link).toContain("providerType=shared_seller");
    expect(link).toContain("shareMode=free");
    expect(link).toContain("requiresModelSelection=true");
    expect(link).toContain("model=kimi-for-coding");
  });

  it("defaults shared provider deeplinks to the Claude app", () => {
    const link = buildSharedProviderLink({
      providerName: "Kimi For Coding",
      endpoint: "https://demo.trycloudflare.com",
      accessToken: "ccs_sell_token",
    });

    expect(link).toContain("app=claude");
  });
});

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

function installClipboardMock() {
  Object.defineProperty(globalThis.navigator, "clipboard", {
    configurable: true,
    value: { writeText: clipboardWriteTextMock },
  });
}

function removeClipboardMock() {
  Object.defineProperty(globalThis.navigator, "clipboard", {
    configurable: true,
    value: undefined,
  });
}

function renderDialog() {
  const onSaveShareConfig = vi.fn();

  renderWithQueryClient(
    <ProviderShareSettingsDialog
      appId="codex"
      provider={{
        id: "provider-1",
        name: "Codex",
        settingsConfig: {},
        websiteUrl: "https://openai.com/chatgpt/pricing",
      }}
      open={true}
      onOpenChange={vi.fn()}
      onSaveShareConfig={onSaveShareConfig}
    />,
  );

  return { onSaveShareConfig };
}

function renderWithQueryClient(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

function proxyStatusFixture(status: {
  running: boolean;
  active_connections: number;
}): Awaited<ReturnType<typeof proxyApi.getProxyStatus>> {
  return status as Awaited<ReturnType<typeof proxyApi.getProxyStatus>>;
}

function providerStatsFixture(
  rows: Array<{ providerId: string; totalTokens: number }>,
): Awaited<ReturnType<typeof usageApi.getProviderStats>> {
  return rows as unknown as Awaited<
    ReturnType<typeof usageApi.getProviderStats>
  >;
}

describe("ProviderShareSettingsDialog V10 layout", () => {
  it("opens the V10 share settings dialog from provider actions", async () => {
    const user = userEvent.setup();

    renderWithQueryClient(
      <ProviderActions
        appId="codex"
        isCurrent={false}
        onSwitch={vi.fn()}
        onEdit={vi.fn()}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
        provider={{
          id: "provider-1",
          name: "Codex",
          settingsConfig: {},
          websiteUrl: "https://openai.com/chatgpt/pricing",
        }}
        onSaveShareConfig={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /分享设置/i }));

    expect(
      screen.getByRole("dialog", { name: /分享设置/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "分享拼车" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "卖了换钱" })).toBeInTheDocument();
  });

  it("renders live runtime stats from proxy and usage queries", async () => {
    vi.mocked(proxyApi.getProxyStatus).mockResolvedValueOnce(
      proxyStatusFixture({
        running: true,
        active_connections: 3,
      }),
    );
    vi.mocked(usageApi.getProviderStats).mockResolvedValueOnce(
      providerStatsFixture([
        {
          providerId: "provider-1",
          totalTokens: 18420,
        },
      ]),
    );

    renderWithQueryClient(
      <ProviderShareSettingsDialog
        appId="codex"
        provider={{
          id: "provider-1",
          name: "Codex",
          settingsConfig: {},
          meta: {
            shareConfig: {
              friend: {
                enabled: true,
                status: "running",
                startedAt: 1713916800000,
                lastError: null,
              },
              market: {
                enabled: false,
                status: "idle",
                pricingStrategy: "provider",
                lastError: null,
                lastPublishedAt: null,
              },
            },
          },
        }}
        open={true}
        onOpenChange={vi.fn()}
        onSaveShareConfig={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(
        within(screen.getByText("通道状态").closest("div")!).getByText(
          "运行中",
        ),
      ).toBeInTheDocument();
      expect(
        within(screen.getByText("当前连接数").closest("div")!).getByText("3"),
      ).toBeInTheDocument();
      expect(
        within(
          screen.getByText("本次启动已使用 Token").closest("div")!,
        ).getByText("18,420"),
      ).toBeInTheDocument();
    });
    expect(usageApi.getProviderStats).toHaveBeenCalledWith(
      1713916800000,
      undefined,
      "codex",
    );
  });

  it("does not poll proxy or usage queries while closed", async () => {
    renderWithQueryClient(
      <ProviderShareSettingsDialog
        appId="codex"
        provider={{
          id: "provider-1",
          name: "Codex",
          settingsConfig: {},
          meta: {
            shareConfig: {
              friend: {
                enabled: true,
                status: "running",
                startedAt: 1713916800000,
                lastError: null,
              },
              market: {
                enabled: false,
                status: "idle",
                pricingStrategy: "provider",
                lastError: null,
                lastPublishedAt: null,
              },
            },
          },
        }}
        open={false}
        onOpenChange={vi.fn()}
        onSaveShareConfig={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(proxyApi.getProxyStatus).not.toHaveBeenCalled();
      expect(usageApi.getProviderStats).not.toHaveBeenCalled();
    });
  });

  it("renders provider header, runtime stats, and V10 tabs", () => {
    renderDialog();

    expect(
      screen.getByRole("dialog", { name: /分享设置/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("Codex")).toBeInTheDocument();
    expect(
      screen.getByText("https://openai.com/chatgpt/pricing"),
    ).toBeInTheDocument();
    expect(screen.getByText("通道状态")).toBeInTheDocument();
    expect(screen.getByText("当前连接数")).toBeInTheDocument();
    expect(screen.getByText("本次启动已使用 Token")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "分享拼车" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "卖了换钱" })).toBeInTheDocument();
  });

  it("uses the provider card URL derivation in the dialog header", () => {
    renderWithQueryClient(
      <ProviderShareSettingsDialog
        appId="claude"
        provider={{
          id: "provider-1",
          name: "Claude Proxy",
          icon: "openai",
          settingsConfig: {
            env: {
              ANTHROPIC_BASE_URL: "https://api.example.com/anthropic",
            },
          },
        }}
        open={true}
        onOpenChange={vi.fn()}
        onSaveShareConfig={vi.fn()}
      />,
    );

    expect(screen.getByText("Claude Proxy")).toBeInTheDocument();
    expect(
      screen.getByText("https://api.example.com/anthropic"),
    ).toBeInTheDocument();
  });

  it("keeps dialog content scrollable for small viewports", () => {
    renderDialog();

    expect(screen.getByRole("dialog", { name: /分享设置/i })).toHaveClass(
      "overflow-y-auto",
    );
    expect(screen.getByRole("dialog", { name: /分享设置/i })).not.toHaveClass(
      "overflow-hidden",
    );
  });

  it("uses matching capsule switches in both tabs", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("tab", { name: "分享拼车" }));
    const friendPanel = screen.getByRole("tabpanel", { name: "分享拼车" });
    expect(
      within(friendPanel).getByRole("switch", { name: /分享拼车/i }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "卖了换钱" }));
    const marketPanel = screen.getByRole("tabpanel", { name: "卖了换钱" });
    expect(
      within(marketPanel).getByRole("switch", { name: /允许市场售卖/i }),
    ).toBeInTheDocument();
  });

  it("starts friend sharing and persists the friend channel", async () => {
    const user = userEvent.setup();
    const onSaveShareConfig = vi.fn().mockResolvedValue(undefined);
    vi.mocked(marketApi.generateSellerAccessToken).mockResolvedValueOnce(
      "ccs_sell_friend",
    );
    vi.mocked(marketApi.startCloudflareTunnel).mockResolvedValueOnce(
      "https://friend.trycloudflare.com",
    );

    renderWithQueryClient(
      <ProviderShareSettingsDialog
        appId="codex"
        provider={{ id: "provider-1", name: "Codex", settingsConfig: {} }}
        open={true}
        onOpenChange={vi.fn()}
        onSaveShareConfig={onSaveShareConfig}
      />,
    );

    await user.click(screen.getByRole("tab", { name: "分享拼车" }));
    const friendSwitch = screen.getByRole("switch", { name: /分享拼车/i });
    await user.click(friendSwitch);

    await waitFor(() => {
      expect(marketApi.generateSellerAccessToken).toHaveBeenCalledWith(
        "provider-1",
      );
      expect(marketApi.startCloudflareTunnel).toHaveBeenCalledWith(15721);
      expect(onSaveShareConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          friend: expect.objectContaining({
            enabled: true,
            status: "running",
            endpoint: "https://friend.trycloudflare.com",
            accessToken: "ccs_sell_friend",
            startedAt: expect.any(Number),
            lastError: null,
          }),
        }),
      );
    });
  });

  it("reuses an existing friend access token when starting sharing", async () => {
    const user = userEvent.setup();
    const onSaveShareConfig = vi.fn().mockResolvedValue(undefined);
    vi.mocked(marketApi.startCloudflareTunnel).mockResolvedValueOnce(
      "https://friend.trycloudflare.com",
    );

    renderWithQueryClient(
      <ProviderShareSettingsDialog
        appId="codex"
        provider={{
          id: "provider-1",
          name: "Codex",
          settingsConfig: {},
          meta: {
            shareConfig: {
              friend: {
                enabled: false,
                status: "idle",
                accessToken: "existing-token",
                lastError: null,
              },
              market: {
                enabled: false,
                status: "idle",
                pricingStrategy: "provider",
                lastError: null,
                lastPublishedAt: null,
              },
            },
          },
        }}
        open={true}
        onOpenChange={vi.fn()}
        onSaveShareConfig={onSaveShareConfig}
      />,
    );

    await user.click(screen.getByRole("tab", { name: "分享拼车" }));
    await user.click(screen.getByRole("switch", { name: /分享拼车/i }));

    await waitFor(() => {
      expect(marketApi.generateSellerAccessToken).not.toHaveBeenCalled();
      expect(marketApi.startCloudflareTunnel).toHaveBeenCalledWith(15721);
      expect(onSaveShareConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          friend: expect.objectContaining({
            accessToken: "existing-token",
          }),
        }),
      );
    });
  });

  it("copies friend endpoint and token after the friend channel is ready", async () => {
    const user = userEvent.setup();
    installClipboardMock();

    renderWithQueryClient(
      <ProviderShareSettingsDialog
        appId="codex"
        provider={{
          id: "provider-1",
          name: "Kimi For Coding",
          settingsConfig: {},
          meta: {
            shareConfig: {
              friend: {
                enabled: true,
                status: "running",
                endpoint: "https://demo.trycloudflare.com",
                accessToken: "ccs_sell_token",
                lastError: null,
              },
              market: {
                enabled: false,
                status: "idle",
                pricingStrategy: "provider",
                lastError: null,
                lastPublishedAt: null,
              },
            },
          },
        }}
        open={true}
        onOpenChange={vi.fn()}
        onSaveShareConfig={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("tab", { name: "分享拼车" }));
    await waitFor(() => {
      expect(proxyApi.getProxyStatus).toHaveBeenCalled();
    });
    expect(
      screen.getByRole("button", { name: "复制端点和令牌" }),
    ).not.toBeDisabled();
    await user.click(screen.getByRole("button", { name: "复制端点和令牌" }));

    await waitFor(() => {
      expect(clipboardWriteTextMock).toHaveBeenCalledWith(
        "Endpoint: https://demo.trycloudflare.com\nToken: ccs_sell_token",
      );
    });
    expect(toast.success).toHaveBeenCalledWith("端点和令牌已复制");
  });

  it("disables friend copy actions when clipboard is unavailable", async () => {
    const user = userEvent.setup();
    removeClipboardMock();

    renderWithQueryClient(
      <ProviderShareSettingsDialog
        appId="codex"
        provider={{
          id: "provider-1",
          name: "Kimi For Coding",
          settingsConfig: {},
          meta: {
            shareConfig: {
              friend: {
                enabled: true,
                status: "running",
                endpoint: "https://demo.trycloudflare.com",
                accessToken: "ccs_sell_token",
                lastError: null,
              },
              market: {
                enabled: false,
                status: "idle",
                pricingStrategy: "provider",
                lastError: null,
                lastPublishedAt: null,
              },
            },
          },
        }}
        open={true}
        onOpenChange={vi.fn()}
        onSaveShareConfig={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("tab", { name: "分享拼车" }));

    expect(
      screen.getByRole("button", { name: "复制端点和令牌" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "复制好友导入链接" }),
    ).toBeDisabled();
  });

  it("shows a toast after copying the friend import link", async () => {
    const user = userEvent.setup();
    installClipboardMock();

    renderWithQueryClient(
      <ProviderShareSettingsDialog
        appId="codex"
        provider={{
          id: "provider-1",
          name: "Kimi For Coding",
          settingsConfig: {},
          meta: {
            shareConfig: {
              friend: {
                enabled: true,
                status: "running",
                endpoint: "https://demo.trycloudflare.com",
                accessToken: "ccs_sell_token",
                lastError: null,
              },
              market: {
                enabled: false,
                status: "idle",
                pricingStrategy: "provider",
                lastError: null,
                lastPublishedAt: null,
              },
            },
          },
        }}
        open={true}
        onOpenChange={vi.fn()}
        onSaveShareConfig={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("tab", { name: "分享拼车" }));
    await waitFor(() => {
      expect(proxyApi.getProxyStatus).toHaveBeenCalled();
    });
    await user.click(screen.getByRole("button", { name: "复制好友导入链接" }));

    await waitFor(() => {
      expect(clipboardWriteTextMock).toHaveBeenCalledWith(
        expect.stringContaining("providerType=shared_seller"),
      );
      expect(clipboardWriteTextMock).toHaveBeenCalledWith(
        expect.stringContaining("app=codex"),
      );
    });
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("好友导入链接已复制");
    });
  });

  it("starts market selling and persists the market channel", async () => {
    const user = userEvent.setup();
    const onSaveShareConfig = vi.fn().mockResolvedValue(undefined);
    vi.mocked(marketApi.generateSellerAccessToken).mockResolvedValueOnce(
      "ccs_sell_market",
    );
    vi.mocked(marketApi.startCloudflareTunnel).mockResolvedValueOnce(
      "https://market.trycloudflare.com",
    );
    vi.mocked(marketApi.startSellingTokens).mockResolvedValueOnce("event-id-1");

    renderWithQueryClient(
      <ProviderShareSettingsDialog
        appId="codex"
        provider={{ id: "provider-1", name: "Codex", settingsConfig: {} }}
        open={true}
        onOpenChange={vi.fn()}
        onSaveShareConfig={onSaveShareConfig}
      />,
    );

    await user.click(screen.getByRole("tab", { name: "卖了换钱" }));
    await user.click(screen.getByRole("switch", { name: /允许市场售卖/i }));

    await waitFor(() => {
      expect(marketApi.generateSellerAccessToken).toHaveBeenCalledWith(
        "provider-1",
      );
      expect(marketApi.startCloudflareTunnel).toHaveBeenCalledWith(15721);
      expect(marketApi.startSellingTokens).toHaveBeenCalledWith({
        providerId: "provider-1",
        modelName: "Codex",
        pricePer1kTokens: 0,
        endpoint: "https://market.trycloudflare.com",
      });
      expect(onSaveShareConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          market: expect.objectContaining({
            enabled: true,
            status: "running",
            endpoint: "https://market.trycloudflare.com",
            accessToken: "ccs_sell_market",
            startedAt: expect.any(Number),
            lastPublishedAt: expect.any(Number),
            lastError: null,
          }),
        }),
      );
    });
  });

  it("stops market selling before persisting the market channel as idle", async () => {
    const user = userEvent.setup();
    const onSaveShareConfig = vi.fn().mockResolvedValue(undefined);
    vi.mocked(marketApi.stopSellingTokens).mockResolvedValueOnce(true);

    renderWithQueryClient(
      <ProviderShareSettingsDialog
        appId="codex"
        provider={{
          id: "provider-1",
          name: "Codex",
          settingsConfig: {},
          meta: {
            shareConfig: {
              friend: {
                enabled: false,
                status: "idle",
                lastError: null,
              },
              market: {
                enabled: true,
                status: "running",
                pricingStrategy: "provider",
                endpoint: "https://market.trycloudflare.com",
                accessToken: "ccs_sell_market",
                startedAt: 1713916800000,
                lastPublishedAt: 1713916800000,
                lastError: null,
              },
            },
          },
        }}
        open={true}
        onOpenChange={vi.fn()}
        onSaveShareConfig={onSaveShareConfig}
      />,
    );

    await user.click(screen.getByRole("tab", { name: "卖了换钱" }));
    await user.click(screen.getByRole("switch", { name: /允许市场售卖/i }));

    await waitFor(() => {
      expect(marketApi.stopSellingTokens).toHaveBeenCalledWith("provider-1");
      expect(onSaveShareConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          market: expect.objectContaining({
            enabled: false,
            status: "idle",
            lastError: null,
          }),
        }),
      );
    });
  });

  it("preserves market state when a delayed friend start completes after market", async () => {
    const user = userEvent.setup();
    const friendTunnel = createDeferred<string>();
    const onSaveShareConfig = vi.fn().mockResolvedValue(undefined);
    vi.mocked(marketApi.generateSellerAccessToken).mockResolvedValueOnce(
      "ccs_sell_market",
    );
    vi.mocked(marketApi.startCloudflareTunnel)
      .mockReturnValueOnce(friendTunnel.promise)
      .mockResolvedValueOnce("https://market.trycloudflare.com");
    vi.mocked(marketApi.startSellingTokens).mockResolvedValueOnce("event-id-1");

    renderWithQueryClient(
      <ProviderShareSettingsDialog
        appId="codex"
        provider={{
          id: "provider-1",
          name: "Codex",
          settingsConfig: {},
          meta: {
            shareConfig: {
              friend: {
                enabled: false,
                status: "idle",
                accessToken: "existing-friend-token",
                lastError: null,
              },
              market: {
                enabled: false,
                status: "idle",
                pricingStrategy: "provider",
                lastError: null,
                lastPublishedAt: null,
              },
            },
          },
        }}
        open={true}
        onOpenChange={vi.fn()}
        onSaveShareConfig={onSaveShareConfig}
      />,
    );

    await user.click(screen.getByRole("tab", { name: "分享拼车" }));
    await user.click(screen.getByRole("switch", { name: /分享拼车/i }));

    await user.click(screen.getByRole("tab", { name: "卖了换钱" }));
    await user.click(screen.getByRole("switch", { name: /允许市场售卖/i }));

    await waitFor(() => {
      expect(onSaveShareConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          market: expect.objectContaining({
            enabled: true,
            status: "running",
            endpoint: "https://market.trycloudflare.com",
            accessToken: "ccs_sell_market",
          }),
        }),
      );
    });

    friendTunnel.resolve("https://friend.trycloudflare.com");

    await waitFor(() => {
      expect(onSaveShareConfig).toHaveBeenLastCalledWith(
        expect.objectContaining({
          friend: expect.objectContaining({
            enabled: true,
            status: "running",
            endpoint: "https://friend.trycloudflare.com",
            accessToken: "existing-friend-token",
          }),
          market: expect.objectContaining({
            enabled: true,
            status: "running",
            endpoint: "https://market.trycloudflare.com",
            accessToken: "ccs_sell_market",
          }),
        }),
      );
    });
  });

  it("disables the friend switch while sharing is starting", async () => {
    const user = userEvent.setup();
    const tunnel = createDeferred<string>();
    const onSaveShareConfig = vi.fn().mockResolvedValue(undefined);
    vi.mocked(marketApi.generateSellerAccessToken).mockResolvedValueOnce(
      "ccs_sell_friend",
    );
    vi.mocked(marketApi.startCloudflareTunnel).mockReturnValueOnce(
      tunnel.promise,
    );

    renderWithQueryClient(
      <ProviderShareSettingsDialog
        appId="codex"
        provider={{ id: "provider-1", name: "Codex", settingsConfig: {} }}
        open={true}
        onOpenChange={vi.fn()}
        onSaveShareConfig={onSaveShareConfig}
      />,
    );

    await user.click(screen.getByRole("tab", { name: "分享拼车" }));
    const friendSwitch = screen.getByRole("switch", { name: /分享拼车/i });
    await user.click(friendSwitch);

    await waitFor(() => {
      expect(friendSwitch).toBeDisabled();
    });

    tunnel.resolve("https://friend.trycloudflare.com");

    await waitFor(() => {
      expect(friendSwitch).not.toBeDisabled();
    });
  });

  it("does not render the removed side step list or pre-publish checklist", () => {
    renderDialog();

    expect(screen.queryByText("1. 收款账户")).not.toBeInTheDocument();
    expect(screen.queryByText("发布前检查")).not.toBeInTheDocument();
    expect(screen.queryByText("查看市场发布")).not.toBeInTheDocument();
  });

  it("renders the required V10 market cards", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("tab", { name: "卖了换钱" }));

    expect(screen.getByText("ClawTip 收款账户")).toBeInTheDocument();
    expect(screen.getByText("定价策略")).toBeInTheDocument();
  });
});
