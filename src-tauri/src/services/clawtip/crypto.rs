use base64::{engine::general_purpose::STANDARD, Engine as _};
use ecb::cipher::{block_padding::Pkcs7, BlockModeDecrypt, BlockModeEncrypt, KeyInit};
use serde_json::json;
use sm4::Sm4;

type Sm4EcbEncryptor = ecb::Encryptor<Sm4>;
type Sm4EcbDecryptor = ecb::Decryptor<Sm4>;

pub fn clawtip_encrypted_data_plaintext(
    order_no: &str,
    amount: i64,
    pay_to: &str,
) -> Result<String, String> {
    serde_json::to_string(&json!({
        "orderNo": order_no,
        "amount": amount,
        "payTo": pay_to,
    }))
    .map_err(|err| format!("failed to build ClawTip encrypted_data plaintext: {err}"))
}

pub fn encrypt_clawtip_order_data_base64(
    order_no: &str,
    amount: i64,
    pay_to: &str,
    sm4_key_base64: &str,
) -> Result<String, String> {
    let plaintext = clawtip_encrypted_data_plaintext(order_no, amount, pay_to)?;
    encrypt_sm4_ecb_pkcs7_base64(&plaintext, sm4_key_base64)
}

pub fn encrypt_sm4_ecb_pkcs7_base64(
    plaintext: &str,
    sm4_key_base64: &str,
) -> Result<String, String> {
    let key = decode_sm4_key(sm4_key_base64)?;
    let ciphertext =
        Sm4EcbEncryptor::new((&key).into()).encrypt_padded_vec::<Pkcs7>(plaintext.as_bytes());

    Ok(STANDARD.encode(ciphertext))
}

pub fn decrypt_sm4_ecb_pkcs7_base64(
    encrypted_base64: &str,
    sm4_key_base64: &str,
) -> Result<String, String> {
    let key = decode_sm4_key(sm4_key_base64)?;
    let ciphertext = STANDARD
        .decode(encrypted_base64)
        .map_err(|err| format!("failed to decode SM4 ciphertext as base64: {err}"))?;
    let plaintext = Sm4EcbDecryptor::new((&key).into())
        .decrypt_padded_vec::<Pkcs7>(&ciphertext)
        .map_err(|err| format!("failed to decrypt SM4 ciphertext: {err}"))?;

    String::from_utf8(plaintext).map_err(|err| format!("SM4 plaintext is not UTF-8: {err}"))
}

fn decode_sm4_key(sm4_key_base64: &str) -> Result<[u8; 16], String> {
    let key = STANDARD
        .decode(sm4_key_base64)
        .map_err(|err| format!("failed to decode SM4 key as base64: {err}"))?;
    key.try_into()
        .map_err(|key: Vec<u8>| format!("SM4 key must decode to 16 bytes, got {}", key.len()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sm4_ecb_pkcs7_encrypts_and_decrypts_order_payload() {
        let key_base64 = "MDEyMzQ1Njc4OUFCQ0RFRg==";
        let plaintext = r#"{"orderNo":"202604250001","amount":1,"payTo":"payto_1234567890abcdef"}"#;

        let encrypted =
            encrypt_sm4_ecb_pkcs7_base64(plaintext, key_base64).expect("encrypt payload");
        let decrypted =
            decrypt_sm4_ecb_pkcs7_base64(&encrypted, key_base64).expect("decrypt payload");

        assert_ne!(encrypted, plaintext);
        assert_eq!(decrypted, plaintext);
    }

    #[test]
    fn sm4_key_must_decode_to_16_bytes() {
        let error = encrypt_sm4_ecb_pkcs7_base64("{}", "c2hvcnQ=").expect_err("reject short key");

        assert!(error.contains("16 bytes"));
    }

    #[test]
    fn clawtip_encrypted_data_plaintext_contains_payment_fields() {
        let plaintext =
            clawtip_encrypted_data_plaintext("202604250001", 1, "payto_1234567890abcdef")
                .expect("build plaintext");
        let value: serde_json::Value = serde_json::from_str(&plaintext).expect("parse plaintext");

        assert_eq!(value["orderNo"], "202604250001");
        assert_eq!(value["amount"], 1);
        assert_eq!(value["payTo"], "payto_1234567890abcdef");
    }
}
