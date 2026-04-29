import { describe, expect, it, vi } from "vitest";
import { clawtipApi } from "@/lib/api/clawtip";

const { invokeMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

describe("clawtipApi", () => {
  it("creates orders through the Tauri command contract", async () => {
    invokeMock.mockResolvedValueOnce({
      listingId: "listing-1",
      indicator: "indicator123",
      orderNo: "202604270001",
      amountFen: 2,
      payTo: "payto_1234567890abcdef",
      orderFile: "/tmp/order.json",
      endpoint: "http://127.0.0.1:15721",
      paymentProvider: "clawtip",
    });

    await clawtipApi.createOrder({
      listingId: "listing-1",
      prompt: "hello",
      amountFen: 2,
      payTo: "payto_1234567890abcdef",
      indicator: "indicator123",
      endpoint: "http://127.0.0.1:15721",
    });

    expect(invokeMock).toHaveBeenCalledWith("clawtip_create_order", {
      input: {
        listingId: "listing-1",
        prompt: "hello",
        amountFen: 2,
        payTo: "payto_1234567890abcdef",
        indicator: "indicator123",
        endpoint: "http://127.0.0.1:15721",
      },
    });
  });

  it("calls paid inference through the Tauri command contract", async () => {
    invokeMock.mockResolvedValueOnce({
      orderNo: "202604270001",
      callSessionId: "call_1",
      alreadyFulfilled: false,
      answer: "ok",
      inputTokens: 1,
      outputTokens: 2,
    });

    await clawtipApi.callPaidInferenceOnce({
      indicator: "indicator123",
      orderNo: "202604270001",
      sm4KeyBase64: "secret",
      listingId: "listing-1",
    });

    expect(invokeMock).toHaveBeenCalledWith(
      "clawtip_call_paid_inference_once",
      {
        input: {
          indicator: "indicator123",
          orderNo: "202604270001",
          sm4KeyBase64: "secret",
          listingId: "listing-1",
        },
      },
    );
  });
});
