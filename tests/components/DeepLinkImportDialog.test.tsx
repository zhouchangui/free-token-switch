import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { emitTauriEvent } from "../msw/tauriMocks";
import { DeepLinkImportDialog } from "@/components/DeepLinkImportDialog";
import { toast } from "sonner";

const parseDeeplinkMock = vi.fn();
const mergeDeeplinkConfigMock = vi.fn();
const importFromDeeplinkMock = vi.fn();
const fetchModelsForConfigMock = vi.fn();

vi.mock("@/lib/api/deeplink", () => ({
  deeplinkApi: {
    parseDeeplink: (...args: unknown[]) => parseDeeplinkMock(...args),
    mergeDeeplinkConfig: (...args: unknown[]) => mergeDeeplinkConfigMock(...args),
    importFromDeeplink: (...args: unknown[]) => importFromDeeplinkMock(...args),
  },
}));

vi.mock("@/lib/api/model-fetch", () => ({
  fetchModelsForConfig: (...args: unknown[]) => fetchModelsForConfigMock(...args),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}));

function renderWithClient() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={client}>
      <DeepLinkImportDialog />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  parseDeeplinkMock.mockReset();
  mergeDeeplinkConfigMock.mockReset();
  importFromDeeplinkMock.mockReset();
  fetchModelsForConfigMock.mockReset();
  vi.clearAllMocks();
});

describe("DeepLinkImportDialog", () => {
  it("opens shared provider confirmation when a shared deeplink is pasted", async () => {
    parseDeeplinkMock.mockResolvedValue({
      version: "v1",
      resource: "provider",
      app: "claude",
      name: "Kimi For Coding (Shared)",
      endpoint: "https://demo.trycloudflare.com",
      apiKey: "token123",
      providerType: "shared_seller",
      requiresModelSelection: true,
    });
    fetchModelsForConfigMock.mockResolvedValue([
      { id: "kimi-for-coding", ownedBy: null },
    ]);

    renderWithClient();

    fireEvent.paste(window, {
      clipboardData: {
        getData: () =>
          "tokensbuddy://v1/import?resource=provider&app=claude&name=Kimi+For+Coding+%28Shared%29",
      },
    });

    await waitFor(() => {
      expect(parseDeeplinkMock).toHaveBeenCalled();
    });
    expect(await screen.findByText(/共享 Provider|shared provider/i)).toBeInTheDocument();
    expect(fetchModelsForConfigMock).toHaveBeenCalledWith(
      "https://demo.trycloudflare.com",
      "token123",
      false,
    );
  });

  it("shows an error toast when shared provider model fetching fails", async () => {
    fetchModelsForConfigMock.mockRejectedValue(new Error("fetch failed"));

    renderWithClient();

    emitTauriEvent("deeplink-import", {
      version: "v1",
      resource: "provider",
      app: "claude",
      name: "Kimi For Coding (Shared)",
      endpoint: "https://demo.trycloudflare.com",
      apiKey: "token123",
      providerType: "shared_seller",
      requiresModelSelection: true,
    });

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled();
    });
  });
});
