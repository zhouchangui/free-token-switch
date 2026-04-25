import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { useState, type ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { ProviderActions } from "@/components/providers/ProviderActions";
import {
  buildSharedProviderLink,
  ProviderShareSettingsDialog,
} from "@/components/providers/ProviderShareSettingsDialog";
import { marketApi } from "@/lib/api";
import { marketApi as actualMarketApi } from "@/lib/api/market";
import { streamCheckProvider } from "@/lib/api/model-test";
import { proxyApi } from "@/lib/api/proxy";
import { usageApi } from "@/lib/api/usage";
import type { Provider, ProviderShareConfig } from "@/types";

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
      checkCloudflared: vi.fn(),
      startCloudflareTunnel: vi.fn(),
      startSellingTokens: vi.fn(),
      generateSellerAccessToken: vi.fn(),
      stopSellingTokens: vi.fn(),
      getSuggestedSellerPrice: vi.fn(),
      getSellerRuntimeStatus: vi.fn(),
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
    startProxyServer: vi.fn(),
  },
}));

vi.mock("@/lib/api/model-test", () => ({
  streamCheckProvider: vi.fn(),
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
  vi.mocked(marketApi.checkCloudflared).mockReset();
  vi.mocked(marketApi.startCloudflareTunnel).mockReset();
  vi.mocked(marketApi.startSellingTokens).mockReset();
  vi.mocked(marketApi.stopSellingTokens).mockReset();
  vi.mocked(marketApi.getSuggestedSellerPrice).mockReset();
  vi.mocked(marketApi.getSellerRuntimeStatus).mockReset();
  vi.mocked(proxyApi.getProxyStatus).mockReset();
  vi.mocked(proxyApi.startProxyServer).mockReset();
  vi.mocked(streamCheckProvider).mockReset();
  vi.mocked(usageApi.getProviderStats).mockReset();
  vi.mocked(marketApi.checkCloudflared).mockResolvedValue(
    cloudflaredCheckFixture({
      installed: true,
      version: "cloudflared 2026.1.0",
      path: "/opt/homebrew/bin/cloudflared",
      installCommand: "brew install cloudflared",
    }),
  );
  vi.mocked(proxyApi.getProxyStatus).mockResolvedValue(
    proxyStatusFixture({
      running: false,
      active_connections: 0,
    }),
  );
  vi.mocked(proxyApi.startProxyServer).mockResolvedValue(
    {} as Awaited<ReturnType<typeof proxyApi.startProxyServer>>,
  );
  vi.mocked(streamCheckProvider).mockResolvedValue({
    status: "operational",
    success: true,
    message: "ok",
    modelUsed: "gpt-5",
    testedAt: 1713916800000,
    retryCount: 0,
  });
  vi.mocked(usageApi.getProviderStats).mockResolvedValue(
    providerStatsFixture([]),
  );
  vi.mocked(marketApi.getSellerRuntimeStatus).mockResolvedValue(
    sellerRuntimeStatusFixture({
      providerId: "provider-1",
      tunnelRunning: true,
      hasActiveToken: true,
      status: "running",
    }),
  );
});

describe("provider market api", () => {
  it("maps pricePer1kTokens to backend price payload field", async () => {
    invokeMock.mockResolvedValueOnce("ok");
    const modelPrice = {
      modelId: "gpt-4o-mini",
      enabled: true,
      inputPricePer1mTokens: 0.15,
      outputPricePer1mTokens: 0.6,
      currency: "USD" as const,
      unit: "PER_1M_TOKENS" as const,
      source: "openrouter" as const,
      updatedAt: 1776996815000,
    };

    await actualMarketApi.startSellingTokens({
      providerId: "provider-1",
      modelName: "gpt-4o-mini",
      pricePer1kTokens: 42,
      endpoint: "https://demo.trycloudflare.com",
      modelPrices: [modelPrice],
      priceUnit: "PER_1M_TOKENS",
      priceVersion: 1,
    });

    expect(invokeMock).toHaveBeenCalledWith("start_selling_tokens", {
      input: {
        providerId: "provider-1",
        modelName: "gpt-4o-mini",
        price: 42,
        endpoint: "https://demo.trycloudflare.com",
        modelPrices: [modelPrice],
        priceUnit: "PER_1M_TOKENS",
        priceVersion: 1,
      },
    });
  });

  it("passes modelName when requesting suggested seller price", async () => {
    invokeMock.mockResolvedValueOnce({
      pricePer1kTokens: 15,
      source: "openrouter:anthropic/claude-test",
    });

    await actualMarketApi.getSuggestedSellerPrice(
      "provider-1",
      "anthropic/claude-test",
    );

    expect(invokeMock).toHaveBeenCalledWith("get_suggested_seller_price", {
      providerId: "provider-1",
      modelName: "anthropic/claude-test",
    });
  });

  it("checks cloudflared through the backend command", async () => {
    invokeMock.mockResolvedValueOnce({
      installed: true,
      version: "cloudflared 2026.1.0",
      path: "/opt/homebrew/bin/cloudflared",
      installCommand: "brew install cloudflared",
    });

    await expect(actualMarketApi.checkCloudflared()).resolves.toEqual({
      installed: true,
      version: "cloudflared 2026.1.0",
      path: "/opt/homebrew/bin/cloudflared",
      installCommand: "brew install cloudflared",
    });

    expect(invokeMock).toHaveBeenCalledWith("check_cloudflared");
  });

  it("reads seller runtime status through the backend command", async () => {
    invokeMock.mockResolvedValueOnce({
      providerId: "provider-1",
      tunnelRunning: false,
      hasActiveToken: false,
      status: "idle",
    });

    await expect(
      actualMarketApi.getSellerRuntimeStatus("provider-1"),
    ).resolves.toEqual({
      providerId: "provider-1",
      tunnelRunning: false,
      hasActiveToken: false,
      status: "idle",
    });

    expect(invokeMock).toHaveBeenCalledWith("get_seller_runtime_status", {
      providerId: "provider-1",
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

    expect(link).toContain("tokensbuddy://v1/import?resource=provider");
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

function renderDialogWithShareConfig(shareConfig: ProviderShareConfig) {
  renderWithQueryClient(
    <ProviderShareSettingsDialog
      appId="codex"
      provider={{
        id: "provider-1",
        name: "Codex",
        settingsConfig: {},
        meta: {
          shareConfig,
        },
      }}
      open={true}
      onOpenChange={vi.fn()}
      onSaveShareConfig={vi.fn()}
    />,
  );
}

function renderDialogWithSyncedProvider({
  provider,
  onSaveShareConfig,
}: {
  provider: Provider;
  onSaveShareConfig?: (
    shareConfig: ProviderShareConfig,
  ) => Promise<void> | void;
}) {
  function SyncedShareDialog() {
    const [currentProvider, setCurrentProvider] = useState(provider);

    return (
      <ProviderShareSettingsDialog
        appId="codex"
        provider={currentProvider}
        open={true}
        onOpenChange={vi.fn()}
        onSaveShareConfig={async (shareConfig) => {
          await onSaveShareConfig?.(shareConfig);
          setCurrentProvider((latestProvider) => ({
            ...latestProvider,
            meta: {
              ...latestProvider.meta,
              shareConfig,
            },
          }));
        }}
      />
    );
  }

  return renderWithQueryClient(<SyncedShareDialog />);
}

function renderWithQueryClient(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
    ),
  };
}

function proxyStatusFixture(status: {
  running: boolean;
  active_connections: number;
}): Awaited<ReturnType<typeof proxyApi.getProxyStatus>> {
  return status as Awaited<ReturnType<typeof proxyApi.getProxyStatus>>;
}

function cloudflaredCheckFixture(result: {
  installed: boolean;
  version?: string | null;
  path?: string | null;
  installCommand: string;
}): Awaited<ReturnType<typeof marketApi.checkCloudflared>> {
  return result as Awaited<ReturnType<typeof marketApi.checkCloudflared>>;
}

function sellerRuntimeStatusFixture(result: {
  providerId: string;
  tunnelRunning: boolean;
  hasActiveToken: boolean;
  status: "idle" | "running";
}): Awaited<ReturnType<typeof marketApi.getSellerRuntimeStatus>> {
  return result as Awaited<ReturnType<typeof marketApi.getSellerRuntimeStatus>>;
}

function mockProxyRunning() {
  vi.mocked(proxyApi.getProxyStatus).mockResolvedValue(
    proxyStatusFixture({
      running: true,
      active_connections: 0,
    }),
  );
}

function providerStatsFixture(
  rows: Array<{ providerId: string; totalTokens: number }>,
): Awaited<ReturnType<typeof usageApi.getProviderStats>> {
  return rows as unknown as Awaited<
    ReturnType<typeof usageApi.getProviderStats>
  >;
}

describe("ProviderShareSettingsDialog V10 layout", () => {
  it("opens the V10 share settings panel from provider actions", async () => {
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

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "分享设置" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "好友分享" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "卖了换钱" })).toBeInTheDocument();
  });

  it("rotates the share settings icon when friend sharing is enabled", () => {
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
          meta: {
            shareConfig: {
              friend: {
                enabled: true,
                status: "idle",
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
        onSaveShareConfig={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "分享设置" })).toHaveClass(
      "[&>svg]:animate-spin",
    );
  });

  it("rotates the share settings icon when market selling is enabled", () => {
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
          meta: {
            shareConfig: {
              friend: {
                enabled: false,
                status: "idle",
                lastError: null,
              },
              market: {
                enabled: true,
                status: "idle",
                pricingStrategy: "provider",
                lastError: null,
                lastPublishedAt: 1713916800000,
              },
            },
          },
        }}
        onSaveShareConfig={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "分享设置" })).toHaveClass(
      "[&>svg]:animate-spin",
    );
  });

  it("shows a loading sharing status next to the in-use provider button", async () => {
    renderWithQueryClient(
      <ProviderActions
        appId="codex"
        isCurrent={true}
        onSwitch={vi.fn()}
        onEdit={vi.fn()}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
        provider={{
          id: "provider-1",
          name: "Codex",
          settingsConfig: {},
          meta: {
            shareConfig: {
              friend: {
                enabled: true,
                status: "running",
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
        onSaveShareConfig={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "使用中" })).toBeInTheDocument();
    await waitFor(() => {
      const status = screen
        .getByText("分享中")
        .closest("[data-provider-share-status]");
      expect(status).toHaveClass("[&>svg]:animate-spin");
    });
  });

  it("updates the in-use row sharing status immediately after friend sharing starts from the settings panel", async () => {
    const user = userEvent.setup();
    const provider = {
      id: "provider-1",
      name: "Codex",
      settingsConfig: {},
    };
    mockProxyRunning();
    vi.mocked(marketApi.generateSellerAccessToken).mockResolvedValueOnce(
      "ccs_sell_friend",
    );
    vi.mocked(marketApi.startCloudflareTunnel).mockResolvedValueOnce(
      "https://friend.trycloudflare.com",
    );

    const { queryClient } = renderWithQueryClient(
      <ProviderActions
        appId="codex"
        isCurrent={true}
        onSwitch={vi.fn()}
        onEdit={vi.fn()}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
        provider={provider}
        onSaveShareConfig={vi.fn().mockImplementation(async (shareConfig) => {
          queryClient.setQueryData(["providers", "codex"], {
            providers: {
              [provider.id]: {
                ...provider,
                meta: {
                  shareConfig,
                },
              },
            },
            currentProviderId: provider.id,
          });
        })}
      />,
    );

    await user.click(screen.getByRole("button", { name: "分享设置" }));
    await user.click(screen.getByRole("tab", { name: "好友分享" }));
    await user.click(screen.getByRole("switch", { name: /好友分享/i }));

    await waitFor(() => {
      const status = document.querySelector("[data-provider-share-status]");
      expect(status).toHaveTextContent("分享中");
      expect(status).toHaveClass("[&>svg]:animate-spin");
    });
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

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "分享设置" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Codex")).toBeInTheDocument();
    expect(
      screen.queryByText("https://openai.com/chatgpt/pricing"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("当前供应商的好友分享与市场发布配置"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("通道状态")).toBeInTheDocument();
    expect(screen.getByText("当前连接数")).toBeInTheDocument();
    expect(screen.getByText("本次启动已使用 Token")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "好友分享" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "卖了换钱" })).toBeInTheDocument();
  });

  it("replaces the V10 badge with an animated sharing status when friend sharing is running", async () => {
    renderDialogWithShareConfig({
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
    });

    expect(screen.queryByText("V10")).not.toBeInTheDocument();
    await waitFor(() => {
      const status = screen
        .getByText("分享中")
        .closest("[data-share-header-status]");
      expect(status).toHaveClass("[&>svg]:animate-spin");
    });
  });

  it("replaces the V10 badge with an animated selling status when market selling is running", async () => {
    renderDialogWithShareConfig({
      friend: {
        enabled: false,
        status: "idle",
        lastError: null,
      },
      market: {
        enabled: true,
        status: "running",
        pricingStrategy: "provider",
        lastError: null,
        lastPublishedAt: 1713916800000,
      },
    });

    expect(screen.queryByText("V10")).not.toBeInTheDocument();
    await waitFor(() => {
      const status = screen
        .getByText("售卖中")
        .closest("[data-share-header-status]");
      expect(status).toHaveClass("[&>svg]:animate-spin");
    });
  });

  it("omits provider URL details in the share settings header", () => {
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
      screen.queryByText("https://api.example.com/anthropic"),
    ).not.toBeInTheDocument();
  });

  it("renders share settings as a full-screen panel instead of a dialog", () => {
    renderDialog();

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "分享设置" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("当前供应商的好友分享与市场发布配置"),
    ).not.toBeInTheDocument();
  });

  it("uses matching capsule switches in both tabs", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("tab", { name: "好友分享" }));
    const friendPanel = screen.getByRole("tabpanel", { name: "好友分享" });
    expect(
      within(friendPanel).getByRole("switch", { name: /好友分享/i }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "卖了换钱" }));
    const marketPanel = screen.getByRole("tabpanel", { name: "卖了换钱" });
    expect(
      within(marketPanel).getByRole("switch", { name: /允许市场售卖/i }),
    ).toBeInTheDocument();
  });

  it("renders the friend switch as a compact left aligned capsule with text in a tooltip", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("tab", { name: "好友分享" }));
    const friendPanel = screen.getByRole("tabpanel", { name: "好友分享" });
    const friendSwitch = within(friendPanel).getByRole("switch", {
      name: /好友分享/i,
    });
    const capsule = friendSwitch.closest("[data-share-capsule]");

    expect(capsule).not.toBeNull();
    expect(capsule).toHaveClass("w-fit", "justify-start");
    expect(within(capsule as HTMLElement).queryByText("好友分享")).toBeNull();
    expect(
      within(capsule as HTMLElement).queryByText(
        "点击胶囊后自动启动通道、生成 token 和好友导入链接。",
      ),
    ).toBeNull();

    await user.hover(friendSwitch);

    const tooltip = await screen.findByRole("tooltip");
    expect(within(tooltip).getByText("好友分享")).toBeInTheDocument();
    expect(
      within(tooltip).getByText(
        "点击胶囊后自动启动通道、生成 token 和好友导入链接。",
      ),
    ).toBeInTheDocument();
  });

  it("starts friend sharing and persists the friend channel", async () => {
    const user = userEvent.setup();
    const onSaveShareConfig = vi.fn().mockResolvedValue(undefined);
    mockProxyRunning();
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

    await user.click(screen.getByRole("tab", { name: "好友分享" }));
    const friendSwitch = screen.getByRole("switch", { name: /好友分享/i });
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

  it("automatically turns off market selling when starting friend sharing", async () => {
    const user = userEvent.setup();
    const onSaveShareConfig = vi.fn().mockResolvedValue(undefined);
    mockProxyRunning();
    vi.mocked(marketApi.startCloudflareTunnel).mockResolvedValueOnce(
      "https://friend.trycloudflare.com",
    );
    vi.mocked(marketApi.generateSellerAccessToken).mockResolvedValueOnce(
      "ccs_sell_friend",
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

    await user.click(screen.getByRole("tab", { name: "好友分享" }));
    await user.click(screen.getByRole("switch", { name: /好友分享/i }));

    await waitFor(() => {
      expect(marketApi.stopSellingTokens).toHaveBeenCalledWith("provider-1");
      expect(marketApi.startCloudflareTunnel).toHaveBeenCalledWith(15721);
      expect(onSaveShareConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          friend: expect.objectContaining({
            enabled: true,
            status: "running",
            endpoint: "https://friend.trycloudflare.com",
            accessToken: "ccs_sell_friend",
          }),
          market: expect.objectContaining({
            enabled: false,
            status: "idle",
            lastError: null,
          }),
        }),
      );
    });
  });

  it("shows the friend startup process before generated sharing details", async () => {
    const user = userEvent.setup();
    const tunnel = createDeferred<string>();
    const onSaveShareConfig = vi.fn().mockResolvedValue(undefined);
    mockProxyRunning();
    vi.mocked(marketApi.startCloudflareTunnel).mockReturnValueOnce(
      tunnel.promise,
    );
    vi.mocked(marketApi.generateSellerAccessToken).mockResolvedValueOnce(
      "ccs_sell_friend",
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

    await user.click(screen.getByRole("tab", { name: "好友分享" }));
    await user.click(screen.getByRole("switch", { name: /好友分享/i }));

    expect(screen.getByText("正在准备好友分享")).toBeInTheDocument();
    expect(screen.getByText("启动分享通道")).toBeInTheDocument();
    expect(screen.getByText("生成访问令牌")).toBeInTheDocument();
    expect(screen.getByText("生成好友导入链接")).toBeInTheDocument();
    expect(screen.queryByText("好友入口")).not.toBeInTheDocument();
    expect(screen.queryByText("访问令牌")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "复制端点和令牌" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "复制好友导入链接" }),
    ).not.toBeInTheDocument();

    tunnel.resolve("https://friend.trycloudflare.com");

    await waitFor(() => {
      expect(screen.queryByText("正在准备好友分享")).not.toBeInTheDocument();
      expect(screen.getByText("好友入口")).toBeInTheDocument();
      expect(screen.getByText("访问令牌")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "复制端点和令牌" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "复制好友导入链接" }),
      ).toBeInTheDocument();
    });
  });

  it("prints detailed friend startup logs while the tunnel is starting", async () => {
    const user = userEvent.setup();
    const tunnel = createDeferred<string>();
    const onSaveShareConfig = vi.fn().mockResolvedValue(undefined);
    mockProxyRunning();
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

    await user.click(screen.getByRole("tab", { name: "好友分享" }));
    await user.click(screen.getByRole("switch", { name: /好友分享/i }));

    await waitFor(() => {
      expect(screen.getByText("启动日志")).toBeInTheDocument();
      expect(screen.getByText(/本地代理已运行/)).toBeInTheDocument();
      expect(
        screen.getByText(/cloudflared 已安装：cloudflared 2026\.1\.0/),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/路径：\/opt\/homebrew\/bin\/cloudflared/),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          /准备启动 cloudflared tunnel --url http:\/\/localhost:15721/,
        ),
      ).toBeInTheDocument();
    });
  });

  it("stops friend sharing on the tunnel step when cloudflared is missing", async () => {
    const user = userEvent.setup();
    const onSaveShareConfig = vi.fn().mockResolvedValue(undefined);
    mockProxyRunning();
    vi.mocked(marketApi.checkCloudflared).mockResolvedValueOnce(
      cloudflaredCheckFixture({
        installed: false,
        version: null,
        path: null,
        installCommand: "brew install cloudflared",
      }),
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

    await user.click(screen.getByRole("tab", { name: "好友分享" }));
    await user.click(screen.getByRole("switch", { name: /好友分享/i }));

    await waitFor(() => {
      expect(screen.getByText("正在准备好友分享")).toBeInTheDocument();
      expect(screen.getByText("未检测到 cloudflared")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "复制安装命令" }),
      ).toBeInTheDocument();
      expect(screen.queryByText("好友入口")).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "复制端点和令牌" }),
      ).not.toBeInTheDocument();
    });
    expect(marketApi.startCloudflareTunnel).not.toHaveBeenCalled();
  });

  it("keeps friend startup error steps and logs visible after saved error config syncs back", async () => {
    const user = userEvent.setup();
    const onSaveShareConfig = vi.fn().mockResolvedValue(undefined);
    mockProxyRunning();
    vi.mocked(marketApi.checkCloudflared).mockResolvedValueOnce(
      cloudflaredCheckFixture({
        installed: false,
        version: null,
        path: null,
        installCommand: "brew install cloudflared",
      }),
    );

    renderDialogWithSyncedProvider({
      provider: { id: "provider-1", name: "Codex", settingsConfig: {} },
      onSaveShareConfig,
    });

    await user.click(screen.getByRole("tab", { name: "好友分享" }));
    await user.click(screen.getByRole("switch", { name: /好友分享/i }));

    await waitFor(() => {
      expect(screen.getByText("正在准备好友分享")).toBeInTheDocument();
      expect(screen.getByText("未检测到 cloudflared")).toBeInTheDocument();
      expect(screen.getByRole("switch", { name: /好友分享/i })).toHaveAttribute(
        "aria-checked",
        "false",
      );
      expect(screen.getByText("启动日志")).toBeInTheDocument();
      expect(screen.getByText(/cloudflared missing/)).toBeInTheDocument();
      expect(onSaveShareConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          friend: expect.objectContaining({
            enabled: false,
            status: "error",
            lastError: "未检测到 cloudflared",
          }),
        }),
      );
    });
  });

  it("stops friend sharing on the tunnel step when the local proxy is unavailable", async () => {
    const user = userEvent.setup();
    const onSaveShareConfig = vi.fn().mockResolvedValue(undefined);

    renderWithQueryClient(
      <ProviderShareSettingsDialog
        appId="codex"
        provider={{ id: "provider-1", name: "Codex", settingsConfig: {} }}
        open={true}
        onOpenChange={vi.fn()}
        onSaveShareConfig={onSaveShareConfig}
      />,
    );

    await user.click(screen.getByRole("tab", { name: "好友分享" }));
    await user.click(screen.getByRole("switch", { name: /好友分享/i }));

    await waitFor(() => {
      expect(screen.getByText("本地代理未启动")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "启动/重启代理" }),
      ).toBeInTheDocument();
      expect(screen.queryByText("好友入口")).not.toBeInTheDocument();
    });
    expect(marketApi.checkCloudflared).not.toHaveBeenCalled();
    expect(marketApi.startCloudflareTunnel).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "启动/重启代理" }));

    await waitFor(() => {
      expect(proxyApi.startProxyServer).toHaveBeenCalled();
    });
  });

  it("rotates an existing friend access token when starting sharing", async () => {
    const user = userEvent.setup();
    const onSaveShareConfig = vi.fn().mockResolvedValue(undefined);
    mockProxyRunning();
    vi.mocked(marketApi.startCloudflareTunnel).mockResolvedValueOnce(
      "https://friend.trycloudflare.com",
    );
    vi.mocked(marketApi.generateSellerAccessToken).mockResolvedValueOnce(
      "ccs_sell_rotated",
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

    await user.click(screen.getByRole("tab", { name: "好友分享" }));
    await user.click(screen.getByRole("switch", { name: /好友分享/i }));

    await waitFor(() => {
      expect(marketApi.generateSellerAccessToken).toHaveBeenCalledWith(
        "provider-1",
      );
      expect(marketApi.startCloudflareTunnel).toHaveBeenCalledWith(15721);
      expect(onSaveShareConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          friend: expect.objectContaining({
            accessToken: "ccs_sell_rotated",
          }),
        }),
      );
    });
  });

  it("does not show persisted friend sharing as running when backend runtime is idle", async () => {
    vi.mocked(marketApi.getSellerRuntimeStatus).mockResolvedValueOnce(
      sellerRuntimeStatusFixture({
        providerId: "provider-1",
        tunnelRunning: false,
        hasActiveToken: false,
        status: "idle",
      }),
    );

    renderDialogWithShareConfig({
      friend: {
        enabled: true,
        status: "running",
        endpoint: "https://demo.trycloudflare.com",
        accessToken: "ccs_sell_token",
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
    });

    await waitFor(() => {
      expect(
        within(screen.getByText("通道状态").closest("div")!).getByText(
          "未运行",
        ),
      ).toBeInTheDocument();
    });
    expect(screen.queryByText("分享中")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "复制端点和令牌" }),
    ).not.toBeInTheDocument();
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

    await user.click(screen.getByRole("tab", { name: "好友分享" }));
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

  it("uses colored primary buttons for friend copy actions", async () => {
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

    await user.click(screen.getByRole("tab", { name: "好友分享" }));

    expect(screen.getByRole("button", { name: "复制端点和令牌" })).toHaveClass(
      "bg-blue-600",
    );
    expect(
      screen.getByRole("button", { name: "复制好友导入链接" }),
    ).toHaveClass("bg-emerald-600");
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

    await user.click(screen.getByRole("tab", { name: "好友分享" }));

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

    await user.click(screen.getByRole("tab", { name: "好友分享" }));
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

  it("shows the market startup process and blocks publishing when ClawTip is unbound", async () => {
    const user = userEvent.setup();
    const onSaveShareConfig = vi.fn().mockResolvedValue(undefined);

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
      expect(screen.getByText("正在准备市场发布")).toBeInTheDocument();
      expect(screen.getByText("检查账户")).toBeInTheDocument();
      expect(screen.getByText("启动通道")).toBeInTheDocument();
      expect(screen.getByText("测试模型")).toBeInTheDocument();
      expect(screen.getByText("读取定价")).toBeInTheDocument();
      expect(screen.getByText("发布市场")).toBeInTheDocument();
      expect(screen.getByText("ClawTip 收款账户未绑定")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "前往开通" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "填写钱包地址" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "复制日志" }),
      ).not.toBeInTheDocument();
      expect(screen.queryByText("定价策略")).not.toBeInTheDocument();
      expect(onSaveShareConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          market: expect.objectContaining({
            enabled: false,
            status: "error",
            lastError: "ClawTip 收款账户未绑定",
          }),
        }),
      );
    });
    expect(marketApi.generateSellerAccessToken).not.toHaveBeenCalled();
    expect(marketApi.startCloudflareTunnel).not.toHaveBeenCalled();
    expect(marketApi.startSellingTokens).not.toHaveBeenCalled();
  });

  it("keeps market startup error steps and logs visible after saved error config syncs back", async () => {
    const user = userEvent.setup();
    const onSaveShareConfig = vi.fn().mockResolvedValue(undefined);

    renderDialogWithSyncedProvider({
      provider: {
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
              enabled: false,
              status: "idle",
              pricingStrategy: "provider",
              clawTipWalletAddress: "claw_wallet_123",
              lastError: null,
              lastPublishedAt: null,
            },
          },
        },
      },
      onSaveShareConfig,
    });

    await user.click(screen.getByRole("tab", { name: "卖了换钱" }));
    await user.click(screen.getByRole("switch", { name: /允许市场售卖/i }));

    await waitFor(() => {
      expect(screen.getByText("正在准备市场发布")).toBeInTheDocument();
      expect(screen.getByText("本地代理未启动")).toBeInTheDocument();
      expect(
        screen.getByRole("switch", { name: /允许市场售卖/i }),
      ).toHaveAttribute("aria-checked", "false");
      expect(screen.getByText("启动日志")).toBeInTheDocument();
      expect(
        screen.getByText(/local proxy is not running/),
      ).toBeInTheDocument();
      expect(onSaveShareConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          market: expect.objectContaining({
            enabled: false,
            status: "error",
            lastError: "本地代理未启动",
          }),
        }),
      );
    });
  });

  it("saves the ClawTip wallet address and resumes market startup", async () => {
    const user = userEvent.setup();
    const tunnel = createDeferred<string>();
    const onSaveShareConfig = vi.fn().mockResolvedValue(undefined);
    mockProxyRunning();
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

    await user.click(screen.getByRole("tab", { name: "卖了换钱" }));
    await user.click(screen.getByRole("switch", { name: /允许市场售卖/i }));
    await user.click(screen.getByRole("button", { name: "填写钱包地址" }));
    await user.type(
      screen.getByLabelText("ClawTip 钱包地址"),
      "claw_wallet_123",
    );
    await user.click(screen.getByRole("button", { name: "保存钱包地址" }));

    await waitFor(() => {
      expect(onSaveShareConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          market: expect.objectContaining({
            clawTipWalletAddress: "claw_wallet_123",
          }),
        }),
      );
    });
    await waitFor(() => {
      expect(marketApi.startCloudflareTunnel).toHaveBeenCalledWith(15721);
    });

    expect(
      screen.queryByText("ClawTip 收款账户未绑定"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("启动通道")).toBeInTheDocument();
  });

  it("automatically turns off friend sharing when starting market selling", async () => {
    const user = userEvent.setup();
    const onSaveShareConfig = vi.fn().mockResolvedValue(undefined);
    mockProxyRunning();
    vi.mocked(marketApi.startCloudflareTunnel).mockResolvedValueOnce(
      "https://market.trycloudflare.com",
    );
    vi.mocked(marketApi.generateSellerAccessToken).mockResolvedValueOnce(
      "ccs_sell_market",
    );
    vi.mocked(marketApi.getSuggestedSellerPrice).mockResolvedValueOnce({
      pricePer1kTokens: 10,
      source: "openrouter:codex/default",
      modelPrice: {
        modelId: "codex/default",
        enabled: true,
        inputPricePer1mTokens: 3,
        outputPricePer1mTokens: 15,
        cacheReadPricePer1mTokens: 0.3,
        cacheWritePricePer1mTokens: 3.75,
        currency: "USD",
        unit: "PER_1M_TOKENS",
        source: "openrouter",
        updatedAt: 1776996815000,
      },
    });
    vi.mocked(marketApi.startSellingTokens).mockResolvedValueOnce("event-1");

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
                endpoint: "https://friend.trycloudflare.com",
                accessToken: "ccs_sell_friend",
                startedAt: 1713916800000,
                lastError: null,
              },
              market: {
                enabled: false,
                status: "idle",
                pricingStrategy: "provider",
                discountPercent: 80,
                clawTipWalletAddress: "claw_wallet_123",
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

    await user.click(screen.getByRole("tab", { name: "卖了换钱" }));
    await user.click(screen.getByRole("switch", { name: /允许市场售卖/i }));

    await waitFor(() => {
      expect(marketApi.stopSellingTokens).toHaveBeenCalledWith("provider-1");
      expect(marketApi.startCloudflareTunnel).toHaveBeenCalledWith(15721);
      expect(marketApi.startSellingTokens).toHaveBeenCalledWith(
        expect.objectContaining({
          endpoint: "https://market.trycloudflare.com",
          pricePer1kTokens: 8,
          modelPrices: [
            expect.objectContaining({
              modelId: "codex/default",
              inputPricePer1mTokens: 2.4,
              outputPricePer1mTokens: 12,
              cacheReadPricePer1mTokens: 0.24,
              cacheWritePricePer1mTokens: 3,
              unit: "PER_1M_TOKENS",
            }),
          ],
          priceUnit: "PER_1M_TOKENS",
          priceVersion: 1,
        }),
      );
      expect(onSaveShareConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          friend: expect.objectContaining({
            enabled: false,
            status: "idle",
            lastError: null,
          }),
          market: expect.objectContaining({
            enabled: true,
            status: "running",
            endpoint: "https://market.trycloudflare.com",
            accessToken: "ccs_sell_market",
            discountPercent: 80,
            modelPrices: [
              expect.objectContaining({
                modelId: "codex/default",
                inputPricePer1mTokens: 2.4,
                outputPricePer1mTokens: 12,
                cacheReadPricePer1mTokens: 0.24,
                cacheWritePricePer1mTokens: 3,
                unit: "PER_1M_TOKENS",
              }),
            ],
            priceUnit: "PER_1M_TOKENS",
            priceVersion: 1,
          }),
        }),
      );
    });
  });

  it("persists the market discount slider before selling starts", async () => {
    const onSaveShareConfig = vi.fn().mockResolvedValue(undefined);

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
                enabled: false,
                status: "idle",
                pricingStrategy: "provider",
                discountPercent: 100,
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

    await userEvent.click(screen.getByRole("tab", { name: "卖了换钱" }));
    fireEvent.change(screen.getByRole("slider", { name: "售卖折扣" }), {
      target: { value: "75" },
    });

    await waitFor(() => {
      expect(onSaveShareConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          market: expect.objectContaining({
            discountPercent: 75,
          }),
        }),
      );
    });
    expect(screen.getByText("75%")).toBeInTheDocument();
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

  it("normalizes the other channel off when stopping market selling", async () => {
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
                enabled: true,
                status: "running",
                endpoint: "https://shared.trycloudflare.com",
                accessToken: "ccs_sell_friend",
                startedAt: 1713916800000,
                lastError: null,
              },
              market: {
                enabled: true,
                status: "running",
                pricingStrategy: "provider",
                endpoint: "https://shared.trycloudflare.com",
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
          }),
        }),
      );
    });
  });

  it("cancels a delayed friend start when market selling is selected", async () => {
    const user = userEvent.setup();
    const friendTunnel = createDeferred<string>();
    const onSaveShareConfig = vi.fn().mockResolvedValue(undefined);
    mockProxyRunning();
    vi.mocked(marketApi.startCloudflareTunnel).mockReturnValueOnce(
      friendTunnel.promise,
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

    await user.click(screen.getByRole("tab", { name: "好友分享" }));
    await user.click(screen.getByRole("switch", { name: /好友分享/i }));

    await user.click(screen.getByRole("tab", { name: "卖了换钱" }));
    await user.click(screen.getByRole("switch", { name: /允许市场售卖/i }));

    await waitFor(() => {
      expect(onSaveShareConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          market: expect.objectContaining({
            enabled: false,
            status: "error",
            lastError: "ClawTip 收款账户未绑定",
          }),
        }),
      );
    });

    friendTunnel.resolve("https://friend.trycloudflare.com");

    await waitFor(() => {
      expect(onSaveShareConfig).toHaveBeenLastCalledWith(
        expect.objectContaining({
          friend: expect.objectContaining({
            enabled: false,
            status: "idle",
            accessToken: "existing-friend-token",
          }),
          market: expect.objectContaining({
            enabled: false,
            status: "error",
            lastError: "ClawTip 收款账户未绑定",
          }),
        }),
      );
    });
  });

  it("disables the friend switch while sharing is starting", async () => {
    const user = userEvent.setup();
    const tunnel = createDeferred<string>();
    const onSaveShareConfig = vi.fn().mockResolvedValue(undefined);
    mockProxyRunning();
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

    await user.click(screen.getByRole("tab", { name: "好友分享" }));
    const friendSwitch = screen.getByRole("switch", { name: /好友分享/i });
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

  it("renders the market switch as an equal on/off capsule", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("tab", { name: "卖了换钱" }));

    const marketSwitch = screen.getByRole("switch", {
      name: /允许市场售卖/i,
    });

    expect(marketSwitch).toHaveAttribute("aria-checked", "false");
    expect(marketSwitch).toHaveClass("grid-cols-2");
    expect(marketSwitch).not.toHaveClass("data-[state=unchecked]:bg-gray-200");
    expect(within(marketSwitch).getByText("关闭")).toBeInTheDocument();
    expect(within(marketSwitch).getByText("开启")).toBeInTheDocument();
  });

  it("renders pricing strategy as a two-option selector and persists selection", async () => {
    const user = userEvent.setup();
    const onSaveShareConfig = vi.fn().mockResolvedValue(undefined);

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

    const pricingGroup = screen.getByRole("radiogroup", {
      name: "定价策略",
    });
    const providerOption = within(pricingGroup).getByRole("radio", {
      name: /跟随服务商定价/,
    });
    const customOption = within(pricingGroup).getByRole("radio", {
      name: /自定义价格/,
    });

    expect(providerOption).toHaveAttribute("aria-checked", "true");
    expect(providerOption).toHaveClass("border-blue-500", "bg-blue-50");
    expect(customOption).toHaveAttribute("aria-checked", "false");

    await user.click(customOption);

    await waitFor(() => {
      expect(onSaveShareConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          market: expect.objectContaining({
            pricingStrategy: "custom",
          }),
        }),
      );
    });
  });

  it("shows ClawTip account setup guidance when the payout account is unbound", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("tab", { name: "卖了换钱" }));

    expect(screen.getByText("未绑定")).toBeInTheDocument();
    expect(
      screen.getByText(
        "发布到市场前，需要先开通 ClawTip 收款钱包并配置服务端密钥。",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("1. 开通收款钱包")).toBeInTheDocument();
    expect(screen.getByText("2. 配置服务端密钥")).toBeInTheDocument();
    expect(
      screen.getByText("3. 返回 TokensBuddy 启动市场发布"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /前往开通/ })).toHaveAttribute(
      "href",
      "https://clawtip.jd.com",
    );
    expect(
      screen.getByRole("button", { name: "填写钱包地址" }),
    ).toBeInTheDocument();
  });
});
