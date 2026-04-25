use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::services::clawtip::{
    crypto::{decrypt_sm4_ecb_pkcs7_base64, encrypt_sm4_ecb_pkcs7_base64},
    order_file::ClawtipOrderFile,
};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClawtipPaymentCredential {
    pub order_no: String,
    pub amount: String,
    pub pay_to: String,
    pub pay_status: String,
    #[serde(default)]
    pub finish_time: Option<String>,
}

pub fn create_mock_pay_credential(
    order: &ClawtipOrderFile,
    sm4_key_base64: &str,
    pay_status: &str,
    finish_time: &str,
) -> Result<String, String> {
    let plaintext = serde_json::to_string(&json!({
        "orderNo": order.order_no,
        "amount": order.amount.to_string(),
        "payTo": order.pay_to,
        "payStatus": pay_status,
        "finishTime": finish_time,
    }))
    .map_err(|err| format!("failed to build mock payCredential plaintext: {err}"))?;

    encrypt_sm4_ecb_pkcs7_base64(&plaintext, sm4_key_base64)
}

pub fn decrypt_pay_credential(
    pay_credential: &str,
    sm4_key_base64: &str,
) -> Result<ClawtipPaymentCredential, String> {
    let plaintext = decrypt_sm4_ecb_pkcs7_base64(pay_credential, sm4_key_base64)?;
    serde_json::from_str(&plaintext)
        .map_err(|err| format!("failed to parse payCredential plaintext: {err}"))
}

pub fn verify_pay_credential_for_order(
    order: &ClawtipOrderFile,
    pay_credential: &str,
    sm4_key_base64: &str,
) -> Result<ClawtipPaymentCredential, String> {
    let credential = decrypt_pay_credential(pay_credential, sm4_key_base64)?;

    if credential.pay_status != "SUCCESS" {
        return Err(format!("payStatus is {}", credential.pay_status));
    }
    if credential.order_no != order.order_no {
        return Err(format!(
            "orderNo mismatch: expected {}, got {}",
            order.order_no, credential.order_no
        ));
    }
    if credential.amount != order.amount.to_string() {
        return Err(format!(
            "amount mismatch: expected {}, got {}",
            order.amount, credential.amount
        ));
    }
    if credential.pay_to != order.pay_to {
        return Err("payTo mismatch".to_string());
    }

    Ok(credential)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_order() -> ClawtipOrderFile {
        ClawtipOrderFile {
            skill_id: "si-tokens-buddy-llm-console".to_string(),
            order_no: "202604250001".to_string(),
            amount: 1,
            question: "测试一次模型调用".to_string(),
            encrypted_data: "encrypted-payload".to_string(),
            pay_to: "payto_1234567890abcdef".to_string(),
            description: "TokensBuddy LLM console test call".to_string(),
            slug: "tokens-buddy-llm-console".to_string(),
            resource_url: "http://127.0.0.1:37891".to_string(),
            pay_credential: None,
        }
    }

    #[test]
    fn mock_pay_credential_decrypts_and_verifies_success() {
        let order = sample_order();
        let key_base64 = "MDEyMzQ1Njc4OUFCQ0RFRg==";
        let credential =
            create_mock_pay_credential(&order, key_base64, "SUCCESS", "2026-04-25 12:00:00")
                .expect("create mock credential");

        let verified = verify_pay_credential_for_order(&order, &credential, key_base64)
            .expect("verify credential");

        assert_eq!(verified.order_no, "202604250001");
        assert_eq!(verified.amount, "1");
        assert_eq!(verified.pay_to, "payto_1234567890abcdef");
        assert_eq!(verified.pay_status, "SUCCESS");
        assert_eq!(verified.finish_time.as_deref(), Some("2026-04-25 12:00:00"));
    }

    #[test]
    fn credential_verify_accepts_real_payload_without_finish_time() {
        let order = sample_order();
        let key_base64 = "MDEyMzQ1Njc4OUFCQ0RFRg==";
        let plaintext = serde_json::to_string(&serde_json::json!({
            "orderNo": order.order_no,
            "amount": order.amount.to_string(),
            "payTo": order.pay_to,
            "payStatus": "SUCCESS",
        }))
        .expect("serialize credential plaintext");
        let credential = encrypt_sm4_ecb_pkcs7_base64(&plaintext, key_base64)
            .expect("encrypt credential plaintext");

        let verified = verify_pay_credential_for_order(&order, &credential, key_base64)
            .expect("verify credential without finishTime");

        assert_eq!(verified.order_no, "202604250001");
        assert_eq!(verified.pay_status, "SUCCESS");
        assert!(verified.finish_time.is_none());
    }

    #[test]
    fn credential_verify_rejects_amount_mismatch() {
        let mut order = sample_order();
        let key_base64 = "MDEyMzQ1Njc4OUFCQ0RFRg==";
        let credential =
            create_mock_pay_credential(&order, key_base64, "SUCCESS", "2026-04-25 12:00:00")
                .expect("create mock credential");
        order.amount = 2;

        let error = verify_pay_credential_for_order(&order, &credential, key_base64)
            .expect_err("reject amount mismatch");

        assert!(error.contains("amount mismatch"));
    }

    #[test]
    fn credential_verify_rejects_non_success_status() {
        let order = sample_order();
        let key_base64 = "MDEyMzQ1Njc4OUFCQ0RFRg==";
        let credential =
            create_mock_pay_credential(&order, key_base64, "PROCESSING", "2026-04-25 12:00:00")
                .expect("create mock credential");

        let error = verify_pay_credential_for_order(&order, &credential, key_base64)
            .expect_err("reject processing status");

        assert!(error.contains("payStatus is PROCESSING"));
    }
}
