use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MockLlmUsage {
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub total_tokens: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MockLlmResponse {
    pub chunks: Vec<String>,
    pub answer: String,
    pub usage: MockLlmUsage,
}

pub fn default_mock_llm_response() -> MockLlmResponse {
    let chunks = vec![
        "这是一次模拟 LLM 调用。".to_string(),
        "支付凭证已校验通过。".to_string(),
        "本次履约完成。".to_string(),
    ];
    MockLlmResponse {
        answer: chunks.join(""),
        chunks,
        usage: MockLlmUsage {
            input_tokens: 32,
            output_tokens: 64,
            total_tokens: 96,
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mock_llm_response_contains_chunks_and_usage() {
        let response = default_mock_llm_response();

        assert_eq!(response.chunks.len(), 3);
        assert_eq!(response.usage.input_tokens, 32);
        assert_eq!(response.usage.output_tokens, 64);
        assert_eq!(response.usage.total_tokens, 96);
        assert!(response.answer.contains("支付凭证已校验通过"));
    }
}
