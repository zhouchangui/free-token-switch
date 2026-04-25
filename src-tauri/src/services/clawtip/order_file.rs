use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ClawtipOrderFile {
    #[serde(rename = "skill-id")]
    pub skill_id: String,
    pub order_no: String,
    pub amount: i64,
    pub question: String,
    pub encrypted_data: String,
    pub pay_to: String,
    pub description: String,
    pub slug: String,
    pub resource_url: String,
    #[serde(rename = "payCredential", skip_serializing_if = "Option::is_none")]
    pub pay_credential: Option<String>,
}

pub fn default_tokens_buddy_orders_dir_for_home(home: &Path) -> PathBuf {
    home.join(".tokens-buddy")
        .join("clawtip-console")
        .join("orders")
}

pub fn default_tokens_buddy_orders_dir() -> PathBuf {
    crate::config::get_app_config_dir()
        .join("clawtip-console")
        .join("orders")
}

pub fn order_file_path(base: &Path, indicator: &str, order_no: &str) -> PathBuf {
    base.join(indicator).join(format!("{order_no}.json"))
}

pub fn write_order_file(
    base: &Path,
    indicator: &str,
    order: &ClawtipOrderFile,
) -> Result<PathBuf, String> {
    let path = order_file_path(base, indicator, &order.order_no);
    let parent = path
        .parent()
        .ok_or_else(|| format!("invalid order file path: {}", path.display()))?;
    std::fs::create_dir_all(parent).map_err(|err| {
        format!(
            "failed to create order directory {}: {err}",
            parent.display()
        )
    })?;
    let content = serde_json::to_string_pretty(order)
        .map_err(|err| format!("failed to serialize order file: {err}"))?;
    std::fs::write(&path, content)
        .map_err(|err| format!("failed to write order file {}: {err}", path.display()))?;
    Ok(path)
}

pub fn read_order_file(path: &Path) -> Result<ClawtipOrderFile, String> {
    let raw = std::fs::read_to_string(path)
        .map_err(|err| format!("failed to read order file {}: {err}", path.display()))?;
    serde_json::from_str(&raw)
        .map_err(|err| format!("failed to parse order file {}: {err}", path.display()))
}

pub fn read_order_file_by_id(
    base: &Path,
    indicator: &str,
    order_no: &str,
) -> Result<ClawtipOrderFile, String> {
    read_order_file(&order_file_path(base, indicator, order_no))
}

pub fn list_order_files(
    base: &Path,
    indicator_filter: Option<&str>,
) -> Result<Vec<(String, PathBuf, ClawtipOrderFile)>, String> {
    if !base.exists() {
        return Ok(Vec::new());
    }

    let indicators = if let Some(indicator) = indicator_filter {
        vec![(indicator.to_string(), base.join(indicator))]
    } else {
        let mut entries = Vec::new();
        for entry in std::fs::read_dir(base)
            .map_err(|err| format!("failed to read orders directory {}: {err}", base.display()))?
        {
            let entry = entry.map_err(|err| {
                format!(
                    "failed to read orders directory entry {}: {err}",
                    base.display()
                )
            })?;
            if entry
                .file_type()
                .map_err(|err| {
                    format!(
                        "failed to inspect orders directory entry {}: {err}",
                        entry.path().display()
                    )
                })?
                .is_dir()
            {
                entries.push((
                    entry.file_name().to_string_lossy().to_string(),
                    entry.path(),
                ));
            }
        }
        entries.sort_by(|left, right| left.0.cmp(&right.0));
        entries
    };

    let mut orders = Vec::new();
    for (indicator, indicator_dir) in indicators {
        if !indicator_dir.exists() {
            continue;
        }
        for entry in std::fs::read_dir(&indicator_dir).map_err(|err| {
            format!(
                "failed to read indicator order directory {}: {err}",
                indicator_dir.display()
            )
        })? {
            let entry = entry.map_err(|err| {
                format!(
                    "failed to read indicator order directory entry {}: {err}",
                    indicator_dir.display()
                )
            })?;
            let path = entry.path();
            if path.extension().and_then(|ext| ext.to_str()) == Some("json") {
                let order = read_order_file(&path)?;
                orders.push((indicator.clone(), path, order));
            }
        }
    }
    orders.sort_by(|left, right| {
        left.0
            .cmp(&right.0)
            .then_with(|| left.2.order_no.cmp(&right.2.order_no))
    });
    Ok(orders)
}

pub fn write_order_pay_credential(
    base: &Path,
    indicator: &str,
    order_no: &str,
    pay_credential: &str,
) -> Result<PathBuf, String> {
    let path = order_file_path(base, indicator, order_no);
    let mut order = read_order_file(&path)?;
    order.pay_credential = Some(pay_credential.to_string());
    write_order_file(base, indicator, &order)?;
    Ok(path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;
    use std::path::{Path, PathBuf};

    #[test]
    fn default_orders_dir_uses_tokens_buddy_app_state() {
        let dir = default_tokens_buddy_orders_dir_for_home(Path::new("/Users/tester"));

        assert_eq!(
            dir,
            PathBuf::from("/Users/tester/.tokens-buddy/clawtip-console/orders")
        );
    }

    #[test]
    fn order_file_path_places_order_under_indicator() {
        let path = order_file_path(
            Path::new("/Users/tester/.tokens-buddy/clawtip-console/orders"),
            "abc123",
            "202604250001",
        );

        assert_eq!(
            path,
            PathBuf::from(
                "/Users/tester/.tokens-buddy/clawtip-console/orders/abc123/202604250001.json"
            )
        );
    }

    #[test]
    fn write_order_file_uses_clawtip_order_schema() {
        let temp_dir = tempfile::tempdir().expect("create temp dir");
        let order = ClawtipOrderFile {
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
        };

        let path =
            write_order_file(temp_dir.path(), "indicator123", &order).expect("write order file");
        let raw = std::fs::read_to_string(path).expect("read order file");
        let value: Value = serde_json::from_str(&raw).expect("parse order file");

        assert_eq!(value["skill-id"], "si-tokens-buddy-llm-console");
        assert_eq!(value["order_no"], "202604250001");
        assert_eq!(value["amount"], 1);
        assert_eq!(value["question"], "测试一次模型调用");
        assert_eq!(value["encrypted_data"], "encrypted-payload");
        assert_eq!(value["pay_to"], "payto_1234567890abcdef");
        assert_eq!(value["description"], "TokensBuddy LLM console test call");
        assert_eq!(value["slug"], "tokens-buddy-llm-console");
        assert_eq!(value["resource_url"], "http://127.0.0.1:37891");
    }

    #[test]
    fn write_pay_credential_updates_existing_order_file() {
        let temp_dir = tempfile::tempdir().expect("create temp dir");
        let order = ClawtipOrderFile {
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
        };
        write_order_file(temp_dir.path(), "indicator123", &order).expect("write order file");

        let path = write_order_pay_credential(
            temp_dir.path(),
            "indicator123",
            "202604250001",
            "mock-pay-credential",
        )
        .expect("write credential");
        let updated = read_order_file_by_id(temp_dir.path(), "indicator123", "202604250001")
            .expect("read updated order");

        assert_eq!(
            path,
            temp_dir
                .path()
                .join("indicator123")
                .join("202604250001.json")
        );
        assert_eq!(
            updated.pay_credential.as_deref(),
            Some("mock-pay-credential")
        );
    }

    #[test]
    fn list_order_files_reads_orders_across_indicators() {
        let temp_dir = tempfile::tempdir().expect("create temp dir");
        let first = sample_order("202604250001");
        let mut second = sample_order("202604250002");
        second.amount = 2;

        write_order_file(temp_dir.path(), "indicator-a", &first).expect("write first");
        write_order_file(temp_dir.path(), "indicator-b", &second).expect("write second");

        let all = list_order_files(temp_dir.path(), None).expect("list all orders");
        let filtered =
            list_order_files(temp_dir.path(), Some("indicator-b")).expect("list filtered orders");

        assert_eq!(all.len(), 2);
        assert_eq!(all[0].0, "indicator-a");
        assert_eq!(all[0].2.order_no, "202604250001");
        assert_eq!(all[1].0, "indicator-b");
        assert_eq!(all[1].2.amount, 2);
        assert_eq!(filtered.len(), 1);
        assert_eq!(filtered[0].0, "indicator-b");
        assert_eq!(filtered[0].2.order_no, "202604250002");
    }

    fn sample_order(order_no: &str) -> ClawtipOrderFile {
        ClawtipOrderFile {
            skill_id: "si-tokens-buddy-llm-console".to_string(),
            order_no: order_no.to_string(),
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
}
