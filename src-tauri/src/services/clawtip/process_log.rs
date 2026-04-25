use serde_json::{json, Map, Value};

const REDACTED: &str = "[redacted]";

#[derive(Debug, Clone)]
pub struct ProcessLogEvent {
    event: String,
    fields: Map<String, Value>,
}

impl ProcessLogEvent {
    pub fn new(event: impl Into<String>) -> Self {
        Self {
            event: event.into(),
            fields: Map::new(),
        }
    }

    pub fn field(mut self, key: impl Into<String>, value: impl Into<String>) -> Self {
        let key = key.into();
        let value = value.into();
        self.fields
            .insert(key.clone(), Value::String(redact_field(&key, &value)));
        self
    }

    pub fn to_json_line(&self) -> String {
        let mut output = Map::new();
        output.insert("event".to_string(), json!(self.event));
        for (key, value) in &self.fields {
            output.insert(key.clone(), value.clone());
        }
        serde_json::to_string(&Value::Object(output))
            .unwrap_or_else(|_| "{\"event\":\"clawtip.log.serialize_error\"}".to_string())
    }
}

fn redact_field(key: &str, value: &str) -> String {
    let normalized = key
        .chars()
        .filter(|ch| *ch != '_' && *ch != '-')
        .flat_map(char::to_lowercase)
        .collect::<String>();

    match normalized.as_str() {
        "payto" => redact_identifier(value),
        "sm4key" | "sm4keybase64" | "paycredential" | "encrypteddata" | "credential" | "secret" => {
            REDACTED.to_string()
        }
        _ => value.to_string(),
    }
}

fn redact_identifier(value: &str) -> String {
    let chars = value.chars().collect::<Vec<_>>();
    if chars.len() <= 12 {
        return REDACTED.to_string();
    }

    let prefix = chars.iter().take(8).collect::<String>();
    let suffix = chars
        .iter()
        .skip(chars.len().saturating_sub(4))
        .collect::<String>();
    format!("{prefix}***{suffix}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn process_log_redacts_sensitive_fields() {
        let event = ProcessLogEvent::new("clawtip.config.loaded")
            .field("payTo", "payto_1234567890abcdef")
            .field("sm4key", "secret-key")
            .field("payCredential", "credential-secret");

        let rendered = event.to_json_line();

        assert!(rendered.contains("clawtip.config.loaded"));
        assert!(rendered.contains("payto_12***cdef"));
        assert!(!rendered.contains("secret-key"));
        assert!(!rendered.contains("credential-secret"));
    }
}
