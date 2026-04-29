use crate::services::clawtip::service::{
    CallPaidInferenceRequest, CallPaidInferenceResult, ClawtipService, CreateClawtipOrderRequest,
    CreatedClawtipOrder, VerifyClawtipCredentialRequest, VerifyClawtipCredentialResult,
    WaitClawtipPaymentRequest, WaitClawtipPaymentResult,
};

#[tauri::command]
pub async fn clawtip_create_order(
    input: CreateClawtipOrderRequest,
) -> Result<CreatedClawtipOrder, String> {
    ClawtipService::default_app().create_order(input)
}

#[tauri::command]
pub async fn clawtip_wait_payment(
    input: WaitClawtipPaymentRequest,
) -> Result<WaitClawtipPaymentResult, String> {
    ClawtipService::default_app().wait_payment(input)
}

#[tauri::command]
pub async fn clawtip_verify_credential(
    input: VerifyClawtipCredentialRequest,
) -> Result<VerifyClawtipCredentialResult, String> {
    ClawtipService::default_app().verify_credential(input)
}

#[tauri::command]
pub async fn clawtip_call_paid_inference_once(
    input: CallPaidInferenceRequest,
) -> Result<CallPaidInferenceResult, String> {
    ClawtipService::default_app().call_paid_inference_once(input)
}
