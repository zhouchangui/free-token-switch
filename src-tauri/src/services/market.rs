use anyhow::Result;
use nostr_sdk::prelude::*;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::RwLock;
use std::process::Stdio;
use tokio::io::AsyncBufReadExt;

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

pub struct MarketService {
    keys: Keys,
    client: Client,
    tunnel_process: Arc<RwLock<Option<tokio::process::Child>>>,
}

impl MarketService {
    pub fn new() -> Self {
        // 1. 生成或加载本地密钥 (增加错误兜底)
        let keys = Keys::generate();
        let client = Client::new(keys.clone());

        let service = Self {
            keys,
            client,
            tunnel_process: Arc::new(RwLock::new(None)),
        };

        // 2. 后台异步连接，完全不阻塞主进程
        let client_clone = service.client.clone();
        tokio::spawn(async move {
            if let Err(e) = client_clone.add_relay("wss://relay.damus.io").await {
                log::error!("添加 Nostr 中继器失败: {e}");
            }
            if let Err(e) = client_clone.add_relay("wss://nos.lol").await {
                log::error!("添加 Nostr 中继器失败: {e}");
            }
            client_clone.connect().await;
            log::info!("MarketService 已连接到 Nostr 网络");
        });

        service
    }

    /// 启动 Cloudflare 隧道 (穿透内网)
    pub async fn start_tunnel(&self, port: u16) -> Result<String> {
        // 1. 启动 cloudflared
        let mut child = tokio::process::Command::new("cloudflared")
            .args(["tunnel", "--url", &format!("http://localhost:{}", port)])
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| anyhow::anyhow!("无法启动 cloudflared: {}. 请确保已安装 cloudflared。", e))?;

        // 2. 从 stderr 中读取生成的临时域名
        let stderr = child.stderr.take().unwrap();
        let mut reader = tokio::io::BufReader::new(stderr);
        let mut line = String::new();
        let mut tunnel_url = String::new();

        // 等待输出域名 (通常是 .trycloudflare.com)
        for _ in 0..100 { 
            line.clear();
            if reader.read_line(&mut line).await? == 0 { break; }
            log::debug!("Cloudflared: {}", line.trim());
            if let Some(pos) = line.find("https://") {
                if let Some(end) = line[pos..].find(".trycloudflare.com") {
                    tunnel_url = line[pos..pos + end + 19].to_string();
                    break;
                }
            }
        }

        if tunnel_url.is_empty() {
            return Err(anyhow::anyhow!("未能从 cloudflared 获取域名。请检查是否安装并联网。"));
        }

        *self.tunnel_process.write().await = Some(child);
        log::info!("Cloudflare 隧道已启动: {}", tunnel_url);
        Ok(tunnel_url)
    }

    /// 发布售卖信息 (卖方)
    pub async fn start_selling(&self, mut listing: MarketListing) -> Result<String> {
        listing.seller_pubkey = self.keys.public_key().to_string();
        let content = serde_json::to_string(&listing)?;
        let builder = EventBuilder::new(Kind::from(31990), content);

        let event_id = self.client.send_event_builder(builder).await?;
        log::info!("Nostr 公告已发布: {:?}", event_id);
        Ok(event_id.to_string())
    }

    /// 搜索市场上的供应商 (买方)
    pub async fn find_sellers(&self) -> Result<Vec<MarketListing>> {
        let filter = Filter::new()
            .kind(Kind::from(31990))
            .limit(50);
        
        // 0.39 uses fetch_events
        let events = self.client.fetch_events(filter, std::time::Duration::from_secs(5)).await?;
        
        let mut results = Vec::new();
        for event in events {
            if let Ok(listing) = serde_json::from_str::<MarketListing>(&event.content) {
                results.push(listing);
            }
        }
        Ok(results)
    }
}
