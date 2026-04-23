use anyhow::Result;
use nostr_sdk::prelude::*;
use serde::{Deserialize, Serialize};
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};
use tokio::io::{AsyncBufReadExt, AsyncRead};
use tokio::sync::{mpsc, Mutex, RwLock};
use tokio::time::timeout;
use uuid::Uuid;

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
    relays_initialized: AtomicBool,
    connect_lock: Mutex<()>,
}

impl MarketService {
    pub fn new() -> Self {
        let keys = Keys::generate();
        let client = Client::new(keys.clone());

        Self {
            keys,
            client,
            tunnel_process: Arc::new(RwLock::new(None)),
            relays_initialized: AtomicBool::new(false),
            connect_lock: Mutex::new(()),
        }
    }

    /// 确保中继器初始化完成；每次调用都会尝试连接，以支持自动重连。
    async fn ensure_connected(&self) {
        if !self.relays_initialized.load(Ordering::SeqCst) {
            let _connect_guard = self.connect_lock.lock().await;
            if !self.relays_initialized.load(Ordering::SeqCst) {
                let mut any_relay_added = false;

                if let Err(e) = self.client.add_relay("wss://relay.damus.io").await {
                    log::error!("添加 Nostr 中继器失败: {e}");
                } else {
                    any_relay_added = true;
                }
                if let Err(e) = self.client.add_relay("wss://nos.lol").await {
                    log::error!("添加 Nostr 中继器失败: {e}");
                } else {
                    any_relay_added = true;
                }

                if any_relay_added {
                    self.relays_initialized.store(true, Ordering::SeqCst);
                } else {
                    log::warn!("Nostr 中继器初始化失败，将在下次调用时重试");
                }
            }
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

        // 2. 从 stdout/stderr 中读取生成的临时域名（兼容不同 cloudflared 版本）
        let stdout = child.stdout.take();
        let stderr = child.stderr.take();
        if stdout.is_none() && stderr.is_none() {
            stop_and_reap_child(&mut child).await;
            return Err(anyhow::anyhow!(
                "cloudflared 未提供可读取的输出流，无法获取隧道地址。"
            ));
        }

        let tunnel_url = match timeout(
            std::time::Duration::from_secs(15),
            wait_for_tunnel_url_from_streams(stdout, stderr),
        )
        .await
        {
            Ok(Ok(Some(url))) => url,
            Ok(Ok(None)) => {
                stop_and_reap_child(&mut child).await;
                return Err(anyhow::anyhow!(
                    "未能从 cloudflared 获取域名。请检查是否安装并联网。"
                ));
            }
            Ok(Err(e)) => {
                stop_and_reap_child(&mut child).await;
                return Err(anyhow::anyhow!("读取 cloudflared 输出失败: {e}"));
            }
            Err(_) => {
                stop_and_reap_child(&mut child).await;
                return Err(anyhow::anyhow!(
                    "等待 cloudflared 隧道地址超时（15 秒）。请稍后重试。"
                ));
            }
        };

        let mut tunnel_guard = self.tunnel_process.write().await;
        if let Some(mut previous_child) = tunnel_guard.take() {
            stop_and_reap_child(&mut previous_child).await;
        }
        *tunnel_guard = Some(child);

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
        format!(
            "ccs_sell_{}_{}",
            provider_id.replace('-', "_"),
            Uuid::new_v4()
        )
    }

    pub fn suggest_price_for(_provider_id: &str) -> SellerPricingSuggestion {
        SellerPricingSuggestion {
            price_per_1k_tokens: 10,
            source: "builtin-default".to_string(),
        }
    }

    pub fn stop_selling(&self, _provider_id: &str) -> Result<bool> {
        if let Ok(mut guard) = self.tunnel_process.try_write() {
            if let Some(mut child) = guard.take() {
                stop_and_reap_child_sync(&mut child);
            }
        }
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

async fn wait_for_tunnel_url(
    reader: &mut (impl tokio::io::AsyncBufRead + Unpin),
) -> Result<Option<String>> {
    let mut line = String::new();
    loop {
        line.clear();
        if reader.read_line(&mut line).await? == 0 {
            return Ok(None);
        }
        log::debug!("Cloudflared: {}", line.trim());
        if let Some(url) = extract_cloudflare_tunnel_url(&line) {
            return Ok(Some(url));
        }
    }
}

async fn wait_for_tunnel_url_from_streams<S, E>(
    stdout: Option<S>,
    stderr: Option<E>,
) -> Result<Option<String>>
where
    S: AsyncRead + Unpin + Send + 'static,
    E: AsyncRead + Unpin + Send + 'static,
{
    let (tx, mut rx) = mpsc::unbounded_channel::<String>();
    if let Some(stdout) = stdout {
        tokio::spawn(pump_stream_for_tunnel_url(stdout, tx.clone()));
    }
    if let Some(stderr) = stderr {
        tokio::spawn(pump_stream_for_tunnel_url(stderr, tx.clone()));
    }
    drop(tx);

    Ok(rx.recv().await)
}

async fn pump_stream_for_tunnel_url<R>(
    stream: R,
    tx: mpsc::UnboundedSender<String>,
) -> Result<()>
where
    R: AsyncRead + Unpin + Send + 'static,
{
    let mut reader = tokio::io::BufReader::new(stream);
    let mut line = String::new();
    let mut sent_first_url = false;

    loop {
        line.clear();
        if reader.read_line(&mut line).await? == 0 {
            break;
        }

        log::debug!("Cloudflared: {}", line.trim());
        if !sent_first_url {
            if let Some(url) = extract_cloudflare_tunnel_url(&line) {
                sent_first_url = true;
                let _ = tx.send(url);
            }
        }
    }
    Ok(())
}

fn stop_and_reap_child_sync(child: &mut tokio::process::Child) {
    if matches!(child.try_wait(), Ok(Some(_))) {
        return;
    }

    if let Err(e) = child.start_kill() {
        log::warn!("停止 cloudflared 进程失败: {e}");
        return;
    }

    let deadline = Instant::now() + Duration::from_secs(3);
    loop {
        match child.try_wait() {
            Ok(Some(_)) => return,
            Ok(None) => {
                if Instant::now() >= deadline {
                    log::warn!("等待 cloudflared 进程退出超时");
                    return;
                }
                thread::sleep(Duration::from_millis(50));
            }
            Err(e) => {
                log::warn!("等待 cloudflared 进程退出失败: {e}");
                return;
            }
        }
    }
}

async fn stop_and_reap_child(child: &mut tokio::process::Child) {
    if matches!(child.try_wait(), Ok(Some(_))) {
        return;
    }

    if let Err(e) = child.start_kill() {
        log::warn!("停止 cloudflared 进程失败: {e}");
        return;
    }

    match timeout(std::time::Duration::from_secs(3), child.wait()).await {
        Ok(Ok(_)) => {}
        Ok(Err(e)) => log::warn!("等待 cloudflared 进程退出失败: {e}"),
        Err(_) => log::warn!("等待 cloudflared 进程退出超时"),
    }
}

#[cfg(test)]
mod tests {
    use super::{
        extract_cloudflare_tunnel_url, wait_for_tunnel_url, wait_for_tunnel_url_from_streams,
        MarketService,
    };
    use tokio::io::AsyncWriteExt;

    #[test]
    fn generate_access_token_returns_non_empty_value() {
        let token = MarketService::generate_access_token_for("provider-1");
        assert!(!token.is_empty());
        assert!(token.starts_with("ccs_sell_"));
    }

    #[test]
    fn generate_access_token_is_non_predictable() {
        let token_a = MarketService::generate_access_token_for("provider-1");
        let token_b = MarketService::generate_access_token_for("provider-1");
        assert_ne!(token_a, token_b);
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

    #[tokio::test]
    async fn wait_for_tunnel_url_extracts_first_valid_domain() {
        let (stream_reader, mut stream_writer) = tokio::io::duplex(256);
        tokio::spawn(async move {
            let _ = stream_writer
                .write_all(
                    b"INF starting tunnel\nINF endpoint https://demo-123.trycloudflare.com ready\n",
                )
                .await;
        });

        let mut reader = tokio::io::BufReader::new(stream_reader);
        let url = wait_for_tunnel_url(&mut reader).await.unwrap();
        assert_eq!(url.as_deref(), Some("https://demo-123.trycloudflare.com"));
    }

    #[tokio::test]
    async fn wait_for_tunnel_url_from_streams_supports_stdout() {
        let (stdout_reader, mut stdout_writer) = tokio::io::duplex(256);
        tokio::spawn(async move {
            let _ = stdout_writer
                .write_all(b"INF https://stdout-123.trycloudflare.com active\n")
                .await;
        });

        let url = wait_for_tunnel_url_from_streams(
            Some(stdout_reader),
            None::<tokio::io::DuplexStream>,
        )
            .await
            .unwrap();
        assert_eq!(url.as_deref(), Some("https://stdout-123.trycloudflare.com"));
    }

    #[tokio::test]
    async fn wait_for_tunnel_url_from_streams_supports_stderr() {
        let (stderr_reader, mut stderr_writer) = tokio::io::duplex(256);
        tokio::spawn(async move {
            let _ = stderr_writer
                .write_all(b"ERR https://stderr-123.trycloudflare.com active\n")
                .await;
        });

        let url = wait_for_tunnel_url_from_streams::<tokio::io::Empty, _>(None, Some(stderr_reader))
            .await
            .unwrap();
        assert_eq!(url.as_deref(), Some("https://stderr-123.trycloudflare.com"));
    }
}
