use std::{
    path::PathBuf,
    time::{Duration, Instant},
};

use serde::{Deserialize, Serialize};

use crate::services::clawtip::{
    credential::{verify_pay_credential_for_order, ClawtipPaymentCredential},
    crypto::encrypt_clawtip_order_data_base64,
    fulfillment::{ClawtipFulfillmentRecord, LocalFulfillmentStore},
    order_file::{
        default_tokens_buddy_orders_dir, read_order_file_by_id, write_order_file,
        write_order_pay_credential, ClawtipOrderFile,
    },
};

#[derive(Debug, Clone)]
pub struct ClawtipServicePaths {
    pub orders_dir: PathBuf,
    pub fulfillment_store: PathBuf,
}

impl Default for ClawtipServicePaths {
    fn default() -> Self {
        Self {
            orders_dir: default_tokens_buddy_orders_dir(),
            fulfillment_store: LocalFulfillmentStore::default_path(),
        }
    }
}

#[derive(Debug, Clone)]
pub struct ClawtipService {
    pub paths: ClawtipServicePaths,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateClawtipOrderRequest {
    pub listing_id: String,
    pub prompt: String,
    pub amount_fen: i64,
    pub pay_to: String,
    pub indicator: String,
    pub order_no: Option<String>,
    pub endpoint: String,
    pub sm4_key_base64: Option<String>,
    pub encrypted_data: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatedClawtipOrder {
    pub listing_id: String,
    pub indicator: String,
    pub order_no: String,
    pub amount_fen: i64,
    pub pay_to: String,
    pub order_file: String,
    pub endpoint: String,
    pub payment_provider: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WaitClawtipPaymentRequest {
    pub indicator: String,
    pub order_no: String,
    #[serde(default = "default_wait_timeout_ms")]
    pub timeout_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WaitClawtipPaymentResult {
    pub indicator: String,
    pub order_no: String,
    pub payment_status: String,
    pub credential_present: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VerifyClawtipCredentialRequest {
    pub indicator: String,
    pub order_no: String,
    pub sm4_key_base64: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VerifyClawtipCredentialResult {
    pub order_no: String,
    pub amount: String,
    pub pay_to: String,
    pub pay_status: String,
    pub finish_time: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CallPaidInferenceRequest {
    pub indicator: String,
    pub order_no: String,
    pub sm4_key_base64: String,
    pub listing_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CallPaidInferenceResult {
    pub order_no: String,
    pub call_session_id: String,
    pub already_fulfilled: bool,
    pub answer: String,
    pub input_tokens: i64,
    pub output_tokens: i64,
}

impl ClawtipService {
    pub fn new(paths: ClawtipServicePaths) -> Self {
        Self { paths }
    }

    pub fn default_app() -> Self {
        Self::new(ClawtipServicePaths::default())
    }

    pub fn create_order(
        &self,
        request: CreateClawtipOrderRequest,
    ) -> Result<CreatedClawtipOrder, String> {
        let order_no = request.order_no.unwrap_or_else(generate_order_no);
        let encrypted_data = match request.encrypted_data {
            Some(value) if !value.trim().is_empty() => value,
            _ => {
                if let Some(key) = request.sm4_key_base64.as_deref() {
                    encrypt_clawtip_order_data_base64(
                        &order_no,
                        request.amount_fen,
                        &request.pay_to,
                        key,
                    )?
                } else {
                    String::new()
                }
            }
        };
        let order = ClawtipOrderFile {
            skill_id: "si-tokens-buddy-llm-console".to_string(),
            order_no: order_no.clone(),
            amount: request.amount_fen,
            question: request.prompt,
            encrypted_data,
            pay_to: request.pay_to.clone(),
            description: "TokensBuddy paid model call".to_string(),
            slug: "tokens-buddy-llm-console".to_string(),
            resource_url: request.endpoint.clone(),
            pay_credential: None,
        };
        let path = write_order_file(&self.paths.orders_dir, &request.indicator, &order)?;

        Ok(CreatedClawtipOrder {
            listing_id: request.listing_id,
            indicator: request.indicator,
            order_no,
            amount_fen: order.amount,
            pay_to: request.pay_to,
            order_file: path.display().to_string(),
            endpoint: request.endpoint,
            payment_provider: "clawtip".to_string(),
        })
    }

    pub fn attach_pay_credential(
        &self,
        indicator: &str,
        order_no: &str,
        pay_credential: &str,
    ) -> Result<String, String> {
        write_order_pay_credential(&self.paths.orders_dir, indicator, order_no, pay_credential)
            .map(|path| path.display().to_string())
    }

    pub fn wait_payment(
        &self,
        request: WaitClawtipPaymentRequest,
    ) -> Result<WaitClawtipPaymentResult, String> {
        let order = wait_for_payment_credential(
            &self.paths.orders_dir,
            &request.indicator,
            &request.order_no,
            Duration::from_millis(request.timeout_ms),
            Duration::from_millis(250),
        )?;

        Ok(WaitClawtipPaymentResult {
            indicator: request.indicator,
            order_no: order.order_no,
            payment_status: "credential_detected".to_string(),
            credential_present: true,
        })
    }

    pub fn verify_credential(
        &self,
        request: VerifyClawtipCredentialRequest,
    ) -> Result<VerifyClawtipCredentialResult, String> {
        let order = read_order_file_by_id(
            &self.paths.orders_dir,
            &request.indicator,
            &request.order_no,
        )?;
        let credential = order
            .pay_credential
            .as_deref()
            .ok_or_else(|| format!("payCredential missing for order {}", request.order_no))?;
        verify_pay_credential_for_order(&order, credential, &request.sm4_key_base64)
            .map(VerifyClawtipCredentialResult::from)
    }

    pub fn call_paid_inference_once(
        &self,
        request: CallPaidInferenceRequest,
    ) -> Result<CallPaidInferenceResult, String> {
        let order = read_order_file_by_id(
            &self.paths.orders_dir,
            &request.indicator,
            &request.order_no,
        )?;
        let credential = order
            .pay_credential
            .as_deref()
            .ok_or_else(|| format!("payCredential missing for order {}", request.order_no))?;
        verify_pay_credential_for_order(&order, credential, &request.sm4_key_base64)?;

        let store = LocalFulfillmentStore::new(self.paths.fulfillment_store.clone());
        let result = store.fulfill_once(&order)?;

        Ok(CallPaidInferenceResult {
            order_no: order.order_no,
            call_session_id: result.call_session_id,
            already_fulfilled: result.already_fulfilled,
            answer: result.answer,
            input_tokens: result.usage.input_tokens,
            output_tokens: result.usage.output_tokens,
        })
    }

    pub fn fulfillment_records(&self) -> Result<Vec<ClawtipFulfillmentRecord>, String> {
        LocalFulfillmentStore::new(self.paths.fulfillment_store.clone()).records()
    }
}

impl From<ClawtipPaymentCredential> for VerifyClawtipCredentialResult {
    fn from(value: ClawtipPaymentCredential) -> Self {
        Self {
            order_no: value.order_no,
            amount: value.amount,
            pay_to: value.pay_to,
            pay_status: value.pay_status,
            finish_time: value.finish_time,
        }
    }
}

fn wait_for_payment_credential(
    base_dir: &std::path::Path,
    indicator: &str,
    order_no: &str,
    timeout: Duration,
    interval: Duration,
) -> Result<ClawtipOrderFile, String> {
    let started_at = Instant::now();
    loop {
        let order = read_order_file_by_id(base_dir, indicator, order_no)?;
        if order
            .pay_credential
            .as_deref()
            .is_some_and(|value| !value.is_empty())
        {
            return Ok(order);
        }
        if started_at.elapsed() >= timeout {
            return Err(format!(
                "timeout waiting for payCredential on order {order_no}"
            ));
        }
        std::thread::sleep(interval);
    }
}

fn default_wait_timeout_ms() -> u64 {
    30_000
}

fn generate_order_no() -> String {
    format!(
        "{}{}",
        chrono::Utc::now().format("%Y%m%d%H%M%S"),
        uuid::Uuid::new_v4()
            .simple()
            .to_string()
            .chars()
            .take(6)
            .collect::<String>()
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::clawtip::{
        credential::create_mock_pay_credential, order_file::read_order_file_by_id,
    };

    const KEY: &str = "MDEyMzQ1Njc4OUFCQ0RFRg==";

    #[test]
    fn create_order_wait_verify_and_fulfill_once() {
        let temp_dir = tempfile::tempdir().expect("create temp dir");
        let orders_dir = temp_dir.path().join("orders");
        let fulfillment_store = temp_dir.path().join("fulfillments.json");
        let service = ClawtipService::new(ClawtipServicePaths {
            orders_dir,
            fulfillment_store,
        });

        let created = service
            .create_order(CreateClawtipOrderRequest {
                listing_id: "listing-1".to_string(),
                prompt: "hello".to_string(),
                amount_fen: 2,
                pay_to: "payto_1234567890abcdef".to_string(),
                indicator: "indicator123".to_string(),
                order_no: Some("202604270001".to_string()),
                endpoint: "http://127.0.0.1:15721".to_string(),
                sm4_key_base64: Some(KEY.to_string()),
                encrypted_data: None,
            })
            .expect("create order");

        assert_eq!(created.order_no, "202604270001");
        assert_eq!(created.amount_fen, 2);
        assert!(created
            .order_file
            .ends_with("indicator123/202604270001.json"));

        let order =
            read_order_file_by_id(&service.paths.orders_dir, "indicator123", "202604270001")
                .expect("read order");
        let credential = create_mock_pay_credential(&order, KEY, "SUCCESS", "2026-04-27 10:00:00")
            .expect("mock credential");
        service
            .attach_pay_credential("indicator123", "202604270001", &credential)
            .expect("attach credential");

        let waited = service
            .wait_payment(WaitClawtipPaymentRequest {
                indicator: "indicator123".to_string(),
                order_no: "202604270001".to_string(),
                timeout_ms: 0,
            })
            .expect("wait payment");
        assert_eq!(waited.payment_status, "credential_detected");

        let verified = service
            .verify_credential(VerifyClawtipCredentialRequest {
                indicator: "indicator123".to_string(),
                order_no: "202604270001".to_string(),
                sm4_key_base64: KEY.to_string(),
            })
            .expect("verify credential");
        assert_eq!(verified.pay_status, "SUCCESS");

        let first = service
            .call_paid_inference_once(CallPaidInferenceRequest {
                indicator: "indicator123".to_string(),
                order_no: "202604270001".to_string(),
                sm4_key_base64: KEY.to_string(),
                listing_id: Some("listing-1".to_string()),
            })
            .expect("first call");
        let second = service
            .call_paid_inference_once(CallPaidInferenceRequest {
                indicator: "indicator123".to_string(),
                order_no: "202604270001".to_string(),
                sm4_key_base64: KEY.to_string(),
                listing_id: Some("listing-1".to_string()),
            })
            .expect("second call");

        assert!(!first.already_fulfilled);
        assert!(second.already_fulfilled);
        assert_eq!(first.call_session_id, second.call_session_id);
        assert_eq!(service.fulfillment_records().expect("records").len(), 1);
    }

    #[test]
    fn wait_payment_times_out_without_credential() {
        let temp_dir = tempfile::tempdir().expect("create temp dir");
        let service = ClawtipService::new(ClawtipServicePaths {
            orders_dir: temp_dir.path().join("orders"),
            fulfillment_store: temp_dir.path().join("fulfillments.json"),
        });

        service
            .create_order(CreateClawtipOrderRequest {
                listing_id: "listing-1".to_string(),
                prompt: "hello".to_string(),
                amount_fen: 2,
                pay_to: "payto_1234567890abcdef".to_string(),
                indicator: "indicator123".to_string(),
                order_no: Some("202604270002".to_string()),
                endpoint: "http://127.0.0.1:15721".to_string(),
                sm4_key_base64: Some(KEY.to_string()),
                encrypted_data: None,
            })
            .expect("create order");

        let error = service
            .wait_payment(WaitClawtipPaymentRequest {
                indicator: "indicator123".to_string(),
                order_no: "202604270002".to_string(),
                timeout_ms: 0,
            })
            .expect_err("timeout");

        assert!(error.contains("timeout waiting for payCredential"));
    }
}
