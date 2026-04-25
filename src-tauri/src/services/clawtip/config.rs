use std::path::{Path, PathBuf};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ClawtipConfigInit {
    pub pay_to: String,
    pub sm4_key_base64: String,
}

pub fn default_config_path() -> PathBuf {
    crate::config::get_app_config_dir().join("clawtip-market.toml")
}

pub fn write_clawtip_config(path: &Path, input: &ClawtipConfigInit) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| format!("invalid ClawTip config path: {}", path.display()))?;
    std::fs::create_dir_all(parent).map_err(|err| {
        format!(
            "failed to create ClawTip config directory {}: {err}",
            parent.display()
        )
    })?;
    let content = format!(
        r#"[clawtip]
mode = "production"
payment_provider = "clawtip"
pay_to = "{pay_to}"
sm4_key_base64 = "{sm4_key_base64}"
skill_slug = "tokens-buddy-llm-console"
skill_id = "si-tokens-buddy-llm-console"
description = "TokensBuddy LLM console test call"
resource_url = "http://127.0.0.1:37891"
order_ttl_seconds = 600
credential_max_age_seconds = 1800

[seller]
seller_id = "local-seller"
listing_id = "local-mock-llm"
model_id = "mock-llm"
amount_fen = 1
capacity = 1
max_output_tokens = 256

[storage]
database_path = "~/.tokens-buddy/clawtip-console/clawtip.db"
market_dir = "~/.tokens-buddy/clawtip-console/market"
orders_dir = "~/.tokens-buddy/clawtip-console/orders"

[relay]
enabled = true
event_kind = 31990
relays = ["wss://relay.damus.io", "wss://nos.lol"]
private_key = "auto"
publish_timeout_seconds = 8
fetch_timeout_seconds = 5

[mock_llm]
chunk_delay_ms = 120
input_tokens = 32
output_tokens = 64
chunks = ["这是一次模拟 LLM 调用。", "支付凭证已校验通过。", "本次履约完成。"]
"#,
        pay_to = input.pay_to,
        sm4_key_base64 = input.sm4_key_base64
    );
    std::fs::write(path, content)
        .map_err(|err| format!("failed to write ClawTip config {}: {err}", path.display()))?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600)).map_err(|err| {
            format!(
                "failed to set ClawTip config permissions {}: {err}",
                path.display()
            )
        })?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn write_config_uses_tokens_buddy_paths_and_env_refs() {
        let temp_dir = tempfile::tempdir().expect("create temp dir");
        let path = temp_dir.path().join("clawtip-market.toml");

        write_clawtip_config(
            &path,
            &ClawtipConfigInit {
                pay_to: "env:CLAWTIP_PAY_TO".to_string(),
                sm4_key_base64: "env:CLAWTIP_SM4_KEY".to_string(),
            },
        )
        .expect("write config");
        let raw = std::fs::read_to_string(path).expect("read config");

        assert!(raw.contains("pay_to = \"env:CLAWTIP_PAY_TO\""));
        assert!(raw.contains("sm4_key_base64 = \"env:CLAWTIP_SM4_KEY\""));
        assert!(raw.contains("orders_dir = \"~/.tokens-buddy/clawtip-console/orders\""));
    }
}
