use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::services::clawtip::{
    mock_llm::{default_mock_llm_response, MockLlmUsage},
    order_file::ClawtipOrderFile,
};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClawtipFulfillmentRecord {
    pub order_no: String,
    pub call_session_id: String,
    pub status: String,
    pub amount_fen: i64,
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub answer: String,
    pub completed_at: i64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ClawtipFulfillmentResult {
    pub already_fulfilled: bool,
    pub call_session_id: String,
    pub answer: String,
    pub usage: MockLlmUsage,
}

#[derive(Debug, Clone)]
pub struct LocalFulfillmentStore {
    path: PathBuf,
}

impl LocalFulfillmentStore {
    pub fn new(path: PathBuf) -> Self {
        Self { path }
    }

    pub fn default_path() -> PathBuf {
        crate::config::get_app_config_dir()
            .join("clawtip-console")
            .join("fulfillments.json")
    }

    pub fn fulfill_once(
        &self,
        order: &ClawtipOrderFile,
    ) -> Result<ClawtipFulfillmentResult, String> {
        let mut records = read_records(&self.path)?;
        if let Some(existing) = records
            .iter()
            .find(|record| record.order_no == order.order_no && record.status == "fulfilled")
        {
            return Ok(ClawtipFulfillmentResult {
                already_fulfilled: true,
                call_session_id: existing.call_session_id.clone(),
                answer: existing.answer.clone(),
                usage: MockLlmUsage {
                    input_tokens: existing.input_tokens,
                    output_tokens: existing.output_tokens,
                    total_tokens: existing.input_tokens + existing.output_tokens,
                },
            });
        }

        let mock = default_mock_llm_response();
        let record = ClawtipFulfillmentRecord {
            order_no: order.order_no.clone(),
            call_session_id: format!("call_{}", uuid::Uuid::new_v4().simple()),
            status: "fulfilled".to_string(),
            amount_fen: order.amount,
            input_tokens: mock.usage.input_tokens,
            output_tokens: mock.usage.output_tokens,
            answer: mock.answer.clone(),
            completed_at: chrono::Utc::now().timestamp(),
        };
        let result = ClawtipFulfillmentResult {
            already_fulfilled: false,
            call_session_id: record.call_session_id.clone(),
            answer: record.answer.clone(),
            usage: mock.usage,
        };
        records.push(record);
        write_records(&self.path, &records)?;
        Ok(result)
    }

    pub fn records(&self) -> Result<Vec<ClawtipFulfillmentRecord>, String> {
        read_records(&self.path)
    }

    pub fn record_for_order(
        &self,
        order_no: &str,
    ) -> Result<Option<ClawtipFulfillmentRecord>, String> {
        Ok(self
            .records()?
            .into_iter()
            .find(|record| record.order_no == order_no))
    }
}

fn read_records(path: &Path) -> Result<Vec<ClawtipFulfillmentRecord>, String> {
    if !path.exists() {
        return Ok(Vec::new());
    }
    let raw = std::fs::read_to_string(path)
        .map_err(|err| format!("failed to read fulfillment store {}: {err}", path.display()))?;
    serde_json::from_str(&raw).map_err(|err| {
        format!(
            "failed to parse fulfillment store {}: {err}",
            path.display()
        )
    })
}

fn write_records(path: &Path, records: &[ClawtipFulfillmentRecord]) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| format!("invalid fulfillment store path: {}", path.display()))?;
    std::fs::create_dir_all(parent).map_err(|err| {
        format!(
            "failed to create fulfillment store directory {}: {err}",
            parent.display()
        )
    })?;
    let content = serde_json::to_string_pretty(records)
        .map_err(|err| format!("failed to serialize fulfillment store: {err}"))?;
    std::fs::write(path, content).map_err(|err| {
        format!(
            "failed to write fulfillment store {}: {err}",
            path.display()
        )
    })
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
            pay_credential: Some("mock-pay-credential".to_string()),
        }
    }

    #[test]
    fn fulfillment_store_records_once_and_returns_duplicate_on_second_call() {
        let temp_dir = tempfile::tempdir().expect("create temp dir");
        let store = LocalFulfillmentStore::new(temp_dir.path().join("fulfillments.json"));
        let order = sample_order();

        let first = store.fulfill_once(&order).expect("first fulfillment");
        let second = store.fulfill_once(&order).expect("second fulfillment");

        assert!(!first.already_fulfilled);
        assert!(second.already_fulfilled);
        assert_eq!(first.call_session_id, second.call_session_id);
        assert_eq!(first.answer, second.answer);
        assert_eq!(first.usage.total_tokens, 96);
    }

    #[test]
    fn fulfillment_store_can_find_record_by_order() {
        let temp_dir = tempfile::tempdir().expect("create temp dir");
        let store = LocalFulfillmentStore::new(temp_dir.path().join("fulfillments.json"));
        let order = sample_order();

        store.fulfill_once(&order).expect("fulfill order");

        let records = store.records().expect("read records");
        let record = store
            .record_for_order("202604250001")
            .expect("read record by order")
            .expect("record exists");

        assert_eq!(records.len(), 1);
        assert_eq!(record.order_no, "202604250001");
        assert_eq!(record.status, "fulfilled");
        assert_eq!(record.input_tokens, 32);
        assert_eq!(record.output_tokens, 64);
        assert!(store
            .record_for_order("missing")
            .expect("read missing record")
            .is_none());
    }
}
