import { invoke } from "@tauri-apps/api/core";

export interface CreateClawtipOrderInput {
  listingId: string;
  prompt: string;
  amountFen: number;
  payTo: string;
  indicator: string;
  orderNo?: string | null;
  endpoint: string;
  sm4KeyBase64?: string | null;
  encryptedData?: string | null;
}

export interface CreatedClawtipOrder {
  listingId: string;
  indicator: string;
  orderNo: string;
  amountFen: number;
  payTo: string;
  orderFile: string;
  endpoint: string;
  paymentProvider: string;
}

export interface WaitClawtipPaymentInput {
  indicator: string;
  orderNo: string;
  timeoutMs?: number;
}

export interface WaitClawtipPaymentResult {
  indicator: string;
  orderNo: string;
  paymentStatus: string;
  credentialPresent: boolean;
}

export interface VerifyClawtipCredentialInput {
  indicator: string;
  orderNo: string;
  sm4KeyBase64: string;
}

export interface VerifyClawtipCredentialResult {
  orderNo: string;
  amount: string;
  payTo: string;
  payStatus: string;
  finishTime?: string | null;
}

export interface CallPaidInferenceInput {
  indicator: string;
  orderNo: string;
  sm4KeyBase64: string;
  listingId?: string | null;
}

export interface CallPaidInferenceResult {
  orderNo: string;
  callSessionId: string;
  alreadyFulfilled: boolean;
  answer: string;
  inputTokens: number;
  outputTokens: number;
}

export const clawtipApi = {
  async createOrder(
    input: CreateClawtipOrderInput,
  ): Promise<CreatedClawtipOrder> {
    return await invoke("clawtip_create_order", { input });
  },

  async waitPayment(
    input: WaitClawtipPaymentInput,
  ): Promise<WaitClawtipPaymentResult> {
    return await invoke("clawtip_wait_payment", { input });
  },

  async verifyCredential(
    input: VerifyClawtipCredentialInput,
  ): Promise<VerifyClawtipCredentialResult> {
    return await invoke("clawtip_verify_credential", { input });
  },

  async callPaidInferenceOnce(
    input: CallPaidInferenceInput,
  ): Promise<CallPaidInferenceResult> {
    return await invoke("clawtip_call_paid_inference_once", { input });
  },
};
