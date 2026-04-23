use anyhow::Result;
use nostr_sdk::prelude::*;
use serde::{Deserialize, Serialize};
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::io::AsyncBufReadExt;
use tokio::sync::RwLock;

/// AI 市场售卖公告
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MarketListing {
    pub provider_id: String,
    pub model_name: String,
    pub price_per_1k_tokens: u64, // 单位：聪 (Sats)
    pub endpoint: String,         // Cloudflare Tunnel 地址
    pub seller_pubkey: String,
    pub timestamp: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SellerPricingSuggestion {
    #[serde(rename = "pricePer1kTokens")]
    pub price_per_1k_tokens: u64,
    pub source: String,
}

pub struct MarketService {
    keys: Keys,
    client: Client,
    tunnel_process: Arc<RwLock<Option<tokio::process::Child>>>,
    connected: AtomicBool,
}

impl MarketService {
    pub fn new() -> Self {
        let keys = Keys::generate();
        let client = Client::new(keys.clone());

        Self {
            keys,
            client,
            tunnel_process: Arc::new(RwLock::new(None)),
            connected: AtomicBool::new(false),
        }
    }

    /// 确保已连接到 Nostr 中继器（懒加载，仅在第一次调用时执行）
    async fn ensure_connected(&self) {
        if self.connected.swap(true, Ordering::SeqCst) {
            return;
        }

        if let Err(e) = self.client.add_relay("wss://relay.damus.io").await {
            log::error!("添加 Nostr 中继器失败: {e}");
        }
        if let Err(e) = self.client.add_relay("wss://nos.lol").await {
            log::error!("添加 Nostr 中继器失败: {e}");
        }
        self.client.connect().await;
        log::info!("MarketService 已连接到 Nostr 网络");
    }

    /// 启动 Cloudflare 隧道 (穿透内网)
    pub async fn start_tunnel(&self, port: u16) -> Result<String> {
        // 1. 启动 cloudflared
        let mut child = tokio::process::Command::new("cloudflared")
            .args(["tunnel", "--url", &format!("http://localhost:{}", port)])
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| {
                anyhow::anyhow!("无法启动 cloudflared: {}. 请确保已安装 cloudflared。", e)
            })?;

        // 2. 从 stderr 中读取生成的临时域名
        let stderr = child.stderr.take().unwrap();
        let mut reader = tokio::io::BufReader::new(stderr);
        let mut line = String::new();
        let mut tunnel_url = String::new();

        // 等待输出域名 (通常是 .trycloudflare.com)
        for _ in 0..100 {
            line.clear();
            if reader.read_line(&mut line).await? == 0 {
                break;
            }
            log::debug!("Cloudflared: {}", line.trim());
            if let Some(url) = extract_cloudflare_tunnel_url(&line) {
                tunnel_url = url;
                break;
            }
        }

        if tunnel_url.is_empty() {
            return Err(anyhow::anyhow!(
                "未能从 cloudflared 获取域名。请检查是否安装并联网。"
            ));
        }

        *self.tunnel_process.write().await = Some(child);
        log::info!("Cloudflare 隧道已启动: {}", tunnel_url);
        Ok(tunnel_url)
    }

    /// 发布售卖信息 (卖方)
    pub async fn start_selling(&self, mut listing: MarketListing) -> Result<String> {
        self.ensure_connected().await;
        listing.seller_pubkey = self.keys.public_key().to_string();
        let content = serde_json::to_string(&listing)?;
        let builder = EventBuilder::new(Kind::from(31990), content);

        let event_id = self.client.send_event_builder(builder).await?;
        log::info!("Nostr 公告已发布: {:?}", event_id);
        Ok(event_id.to_string())
    }

    pub fn generate_access_token_for(provider_id: &str) -> String {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis();
        format!("ccs_sell_{}_{}", provider_id.replace('-', "_"), now)
    }

    pub fn suggest_price_for(_provider_id: &str) -> SellerPricingSuggestion {
        SellerPricingSuggestion {
            price_per_1k_tokens: 10,
            source: "builtin-default".to_string(),
        }
    }

    pub fn stop_selling(&self, _provider_id: &str) -> Result<bool> {
        Ok(true)
    }

    /// 搜索市场上的供应商 (买方)
    pub async fn find_sellers(&self) -> Result<Vec<MarketListing>> {
        self.ensure_connected().await;
        let filter = Filter::new().kind(Kind::from(31990)).limit(50);

        let events = self
            .client
            .fetch_events(filter, std::time::Duration::from_secs(5))
            .await?;

        let mut results = Vec::new();
        for event in events {
            if let Ok(listing) = serde_json::from_str::<MarketListing>(&event.content) {
                results.push(listing);
            }
        }
        Ok(results)
    }
}

fn extract_cloudflare_tunnel_url(line: &str) -> Option<String> {
    line.split_whitespace().find_map(|token| {
        let start = token.find("https://")?;
        let candidate = token[start..].trim_end_matches(|c: char| {
            matches!(c, ',' | ';' | ')' | ']' | '"' | '\'')
        });
        if candidate.contains(".trycloudflare.com") {
            Some(candidate.to_string())
        } else {
            None
        }
    })
}

#[cfg(test)]
mod tests {
    use super::{extract_cloudflare_tunnel_url, MarketService};

    #[test]
    fn generate_access_token_returns_non_empty_value() {
        let token = MarketService::generate_access_token_for("provider-1");
        assert!(!token.is_empty());
        assert!(token.starts_with("ccs_sell_"));
    }

    #[test]
    fn suggested_price_is_positive() {
        let suggestion = MarketService::suggest_price_for("provider-1");
        assert!(suggestion.price_per_1k_tokens > 0);
    }

    #[test]
    fn extract_cloudflare_tunnel_url_handles_trailing_punctuation() {
        let line = "INF + https://abc-123.trycloudflare.com, route ready";
        let url = extract_cloudflare_tunnel_url(line);
        assert_eq!(url.as_deref(), Some("https://abc-123.trycloudflare.com"));
    }

    #[test]
    fn extract_cloudflare_tunnel_url_returns_none_without_cloudflare_domain() {
        let line = "INF + https://example.com ready";
        let url = extract_cloudflare_tunnel_url(line);
        assert_eq!(url, None);
    }
}
