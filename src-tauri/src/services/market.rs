use anyhow::Result;
use nostr_sdk::prelude::*;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex as StdMutex, OnceLock};
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
    #[serde(rename = "modelPrices", default)]
    pub model_prices: Vec<MarketModelPrice>,
    #[serde(rename = "priceUnit", default = "default_market_price_unit")]
    pub price_unit: String,
    #[serde(rename = "priceVersion", default = "default_market_price_version")]
    pub price_version: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketModelPrice {
    pub model_id: String,
    pub enabled: bool,
    pub input_price_per_1m_tokens: f64,
    pub output_price_per_1m_tokens: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cache_read_price_per_1m_tokens: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cache_write_price_per_1m_tokens: Option<f64>,
    pub currency: String,
    pub unit: String,
    pub source: String,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SellerPricingSuggestion {
    #[serde(rename = "pricePer1kTokens")]
    pub price_per_1k_tokens: u64,
    pub source: String,
    #[serde(rename = "modelPrice", skip_serializing_if = "Option::is_none")]
    pub model_price: Option<MarketModelPrice>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CloudflaredCheckResult {
    pub installed: bool,
    pub version: Option<String>,
    pub path: Option<String>,
    #[serde(rename = "installCommand")]
    pub install_command: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SellerRuntimeStatus {
    pub provider_id: String,
    pub tunnel_running: bool,
    pub has_active_token: bool,
    pub status: String,
}

struct ActiveTunnel {
    port: u16,
    url: String,
    child: tokio::process::Child,
}

#[derive(Debug, Clone)]
struct ActiveShareToken {
    provider_id: String,
}

static ACTIVE_SHARE_TOKENS: OnceLock<StdMutex<HashMap<String, ActiveShareToken>>> = OnceLock::new();
const DEFAULT_SELLER_PRICE_PER_1K_TOKENS: u64 = 10;
const MARKET_PRICE_UNIT_PER_1M_TOKENS: &str = "PER_1M_TOKENS";
const MARKET_PRICE_VERSION: u32 = 1;
const OPENROUTER_PRICING_SNAPSHOT_JSON: &str =
    include_str!("../../../src/data/model-pricing/openrouter.json");

#[derive(Debug, Deserialize)]
struct OpenRouterPricingSnapshot {
    #[serde(rename = "fetchedAt")]
    fetched_at: Option<String>,
    models: Vec<OpenRouterPricingModel>,
}

#[derive(Debug, Deserialize)]
struct OpenRouterPricingModel {
    id: String,
    #[serde(rename = "usdPerMillionTokens")]
    usd_per_million_tokens: OpenRouterUsdPerMillionTokens,
}

#[derive(Debug, Deserialize)]
struct OpenRouterUsdPerMillionTokens {
    input: Option<f64>,
    output: Option<f64>,
    #[serde(rename = "cacheRead")]
    cache_read: Option<f64>,
    #[serde(rename = "cacheWrite")]
    cache_write: Option<f64>,
}

fn active_share_tokens() -> &'static StdMutex<HashMap<String, ActiveShareToken>> {
    ACTIVE_SHARE_TOKENS.get_or_init(|| StdMutex::new(HashMap::new()))
}

fn default_market_price_unit() -> String {
    MARKET_PRICE_UNIT_PER_1M_TOKENS.to_string()
}

fn default_market_price_version() -> u32 {
    MARKET_PRICE_VERSION
}

pub struct MarketService {
    keys: Keys,
    client: Client,
    tunnel_process: Arc<RwLock<Option<ActiveTunnel>>>,
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
        let mut tunnel_guard = self.tunnel_process.write().await;
        if let Some(active_tunnel) = tunnel_guard.as_mut() {
            match active_tunnel.child.try_wait() {
                Ok(None) if active_tunnel.port == port => {
                    log::info!(
                        "复用现有 Cloudflare 隧道: port={}, url={}",
                        port,
                        active_tunnel.url
                    );
                    return Ok(active_tunnel.url.clone());
                }
                Ok(None) => {
                    log::info!(
                        "Cloudflare 隧道端口变化，停止旧隧道: old_port={}, new_port={}, old_url={}",
                        active_tunnel.port,
                        port,
                        active_tunnel.url
                    );
                    if let Some(mut previous_tunnel) = tunnel_guard.take() {
                        stop_and_reap_child(&mut previous_tunnel.child).await;
                    }
                }
                Ok(Some(status)) => {
                    log::warn!(
                        "Cloudflare 隧道进程已退出，将重新启动: port={}, url={}, status={}",
                        active_tunnel.port,
                        active_tunnel.url,
                        status
                    );
                    tunnel_guard.take();
                }
                Err(e) => {
                    log::warn!(
                        "检查 Cloudflare 隧道进程状态失败，将重新启动: port={}, url={}, error={}",
                        active_tunnel.port,
                        active_tunnel.url,
                        e
                    );
                    tunnel_guard.take();
                }
            }
        }

        log::info!(
            "准备启动 Cloudflare 隧道: cloudflared tunnel --url http://localhost:{}",
            port
        );

        // 1. 启动 cloudflared
        let mut child = tokio::process::Command::new("cloudflared")
            .args(["tunnel", "--url", &format!("http://localhost:{}", port)])
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| {
                anyhow::anyhow!("无法启动 cloudflared: {}. 请确保已安装 cloudflared。", e)
            })?;
        log::info!(
            "cloudflared 进程已启动，等待 quick tunnel URL: port={}",
            port
        );

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

        *tunnel_guard = Some(ActiveTunnel {
            port,
            url: tunnel_url.clone(),
            child,
        });

        log::info!("Cloudflare 隧道已启动: port={}, url={}", port, tunnel_url);
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

    pub fn generate_and_register_access_token_for(provider_id: &str) -> String {
        let token = Self::generate_access_token_for(provider_id);
        Self::register_access_token_for(provider_id, &token);
        token
    }

    pub fn register_access_token_for(provider_id: &str, token: &str) {
        let token = token.trim();
        if token.is_empty() {
            return;
        }

        let mut tokens = active_share_tokens()
            .lock()
            .unwrap_or_else(|err| err.into_inner());
        tokens.insert(
            token.to_string(),
            ActiveShareToken {
                provider_id: provider_id.to_string(),
            },
        );
    }

    pub fn validate_access_token(token: &str) -> bool {
        let token = token.trim();
        if token.is_empty() {
            return false;
        }

        active_share_tokens()
            .lock()
            .unwrap_or_else(|err| err.into_inner())
            .contains_key(token)
    }

    pub fn has_active_access_token_for(provider_id: &str) -> bool {
        active_share_tokens()
            .lock()
            .unwrap_or_else(|err| err.into_inner())
            .values()
            .any(|token| token.provider_id == provider_id)
    }

    pub fn invalidate_access_tokens_for(provider_id: &str) -> usize {
        let mut tokens = active_share_tokens()
            .lock()
            .unwrap_or_else(|err| err.into_inner());
        let before = tokens.len();
        tokens.retain(|_, token| token.provider_id != provider_id);
        before.saturating_sub(tokens.len())
    }

    #[cfg(test)]
    pub fn clear_access_tokens_for_tests() {
        active_share_tokens()
            .lock()
            .unwrap_or_else(|err| err.into_inner())
            .clear();
    }

    pub async fn seller_runtime_status(&self, provider_id: &str) -> SellerRuntimeStatus {
        let tunnel_running = self.is_tunnel_running().await;
        let has_active_token = Self::has_active_access_token_for(provider_id);
        SellerRuntimeStatus {
            provider_id: provider_id.to_string(),
            tunnel_running,
            has_active_token,
            status: if tunnel_running && has_active_token {
                "running".to_string()
            } else {
                "idle".to_string()
            },
        }
    }

    async fn is_tunnel_running(&self) -> bool {
        let mut tunnel_guard = self.tunnel_process.write().await;
        let Some(active_tunnel) = tunnel_guard.as_mut() else {
            return false;
        };

        match active_tunnel.child.try_wait() {
            Ok(None) => true,
            Ok(Some(status)) => {
                log::warn!(
                    "Cloudflare 隧道进程已退出，清理运行态: port={}, url={}, status={}",
                    active_tunnel.port,
                    active_tunnel.url,
                    status
                );
                tunnel_guard.take();
                false
            }
            Err(e) => {
                log::warn!(
                    "检查 Cloudflare 隧道运行态失败，清理运行态: port={}, url={}, error={}",
                    active_tunnel.port,
                    active_tunnel.url,
                    e
                );
                tunnel_guard.take();
                false
            }
        }
    }

    pub fn suggest_price_for(provider_id: &str) -> SellerPricingSuggestion {
        Self::suggest_price_for_model(provider_id, None)
    }

    pub fn suggest_price_for_model(
        _provider_id: &str,
        model_name: Option<&str>,
    ) -> SellerPricingSuggestion {
        suggest_price_from_openrouter_snapshot(model_name, OPENROUTER_PRICING_SNAPSHOT_JSON)
    }

    pub fn check_cloudflared() -> CloudflaredCheckResult {
        let output = Command::new("cloudflared").arg("--version").output();
        let version = output
            .as_ref()
            .ok()
            .filter(|output| output.status.success())
            .and_then(|output| {
                let stdout = String::from_utf8_lossy(&output.stdout);
                let stderr = String::from_utf8_lossy(&output.stderr);
                first_non_empty_line(&stdout)
                    .or_else(|| first_non_empty_line(&stderr))
                    .map(str::to_string)
            });

        let result = CloudflaredCheckResult {
            installed: version.is_some(),
            version,
            path: resolve_command_path("cloudflared"),
            install_command: install_command_for_os(std::env::consts::OS).to_string(),
        };
        log::info!(
            "cloudflared 检查完成: installed={}, version={}, path={}, install_command={}",
            result.installed,
            result.version.as_deref().unwrap_or("unknown"),
            result.path.as_deref().unwrap_or("unknown"),
            result.install_command
        );
        result
    }

    pub fn stop_selling(&self, provider_id: &str) -> Result<bool> {
        let invalidated_tokens = Self::invalidate_access_tokens_for(provider_id);
        if invalidated_tokens > 0 {
            log::info!(
                "已撤销分享访问令牌: provider_id={}, count={}",
                provider_id,
                invalidated_tokens
            );
        }

        if let Ok(mut guard) = self.tunnel_process.try_write() {
            if let Some(mut active_tunnel) = guard.take() {
                log::info!(
                    "停止 Cloudflare 隧道: port={}, url={}",
                    active_tunnel.port,
                    active_tunnel.url
                );
                stop_and_reap_child_sync(&mut active_tunnel.child);
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

fn suggest_price_from_openrouter_snapshot(
    model_name: Option<&str>,
    snapshot_json: &str,
) -> SellerPricingSuggestion {
    let Some(model_name) = model_name.map(str::trim).filter(|value| !value.is_empty()) else {
        return default_seller_pricing_suggestion();
    };

    let Ok(snapshot) = serde_json::from_str::<OpenRouterPricingSnapshot>(snapshot_json) else {
        return default_seller_pricing_suggestion();
    };

    let updated_at = snapshot
        .fetched_at
        .as_deref()
        .and_then(timestamp_millis_from_rfc3339)
        .unwrap_or(0);

    snapshot
        .models
        .into_iter()
        .find(|model| model.id.eq_ignore_ascii_case(model_name))
        .and_then(|model| {
            let price = suggested_price_per_1k_tokens(&model)?;
            Some(SellerPricingSuggestion {
                price_per_1k_tokens: price,
                source: format!("openrouter:{}", model.id),
                model_price: market_model_price_from_openrouter_model(&model, updated_at),
            })
        })
        .unwrap_or_else(default_seller_pricing_suggestion)
}

fn market_model_price_from_openrouter_model(
    model: &OpenRouterPricingModel,
    updated_at: i64,
) -> Option<MarketModelPrice> {
    let input_price = non_negative_finite(model.usd_per_million_tokens.input).unwrap_or(0.0);
    let output_price = non_negative_finite(model.usd_per_million_tokens.output).unwrap_or(0.0);

    if input_price <= 0.0 && output_price <= 0.0 {
        return None;
    }

    Some(MarketModelPrice {
        model_id: model.id.clone(),
        enabled: true,
        input_price_per_1m_tokens: input_price,
        output_price_per_1m_tokens: output_price,
        cache_read_price_per_1m_tokens: non_negative_finite(
            model.usd_per_million_tokens.cache_read,
        ),
        cache_write_price_per_1m_tokens: non_negative_finite(
            model.usd_per_million_tokens.cache_write,
        ),
        currency: "USD".to_string(),
        unit: "PER_1M_TOKENS".to_string(),
        source: "openrouter".to_string(),
        updated_at,
    })
}

fn suggested_price_per_1k_tokens(model: &OpenRouterPricingModel) -> Option<u64> {
    let price = [
        model.usd_per_million_tokens.input,
        model.usd_per_million_tokens.output,
    ]
    .into_iter()
    .flatten()
    .filter(|value| value.is_finite() && *value > 0.0)
    .fold(0.0_f64, f64::max);

    if price <= 0.0 {
        return None;
    }

    Some(price.ceil().max(1.0) as u64)
}

fn non_negative_finite(value: Option<f64>) -> Option<f64> {
    value.filter(|value| value.is_finite() && *value >= 0.0)
}

fn timestamp_millis_from_rfc3339(value: &str) -> Option<i64> {
    chrono::DateTime::parse_from_rfc3339(value)
        .ok()
        .map(|datetime| datetime.timestamp_millis())
}

fn default_seller_pricing_suggestion() -> SellerPricingSuggestion {
    SellerPricingSuggestion {
        price_per_1k_tokens: DEFAULT_SELLER_PRICE_PER_1K_TOKENS,
        source: "builtin-default".to_string(),
        model_price: None,
    }
}

fn first_non_empty_line(value: &str) -> Option<&str> {
    value.lines().map(str::trim).find(|line| !line.is_empty())
}

fn resolve_command_path(command: &str) -> Option<String> {
    let resolver = if cfg!(target_os = "windows") {
        "where"
    } else {
        "which"
    };

    Command::new(resolver)
        .arg(command)
        .output()
        .ok()
        .filter(|output| output.status.success())
        .and_then(|output| {
            let stdout = String::from_utf8_lossy(&output.stdout);
            first_non_empty_line(&stdout).map(str::to_string)
        })
}

fn install_command_for_os(os: &str) -> &'static str {
    match os {
        "macos" => "brew install cloudflared",
        "windows" => "winget install --id Cloudflare.cloudflared",
        "linux" => "请按发行版安装 cloudflared：https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/",
        _ => "请参考 Cloudflare 官方文档安装 cloudflared：https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/",
    }
}

fn extract_cloudflare_tunnel_url(line: &str) -> Option<String> {
    line.split_whitespace().find_map(|token| {
        let start = token.find("https://")?;
        let raw_candidate = &token[start..];
        let candidate_end = raw_candidate
            .find([',', ';', ')', ']', '"', '\'', '<', '>', '`'])
            .unwrap_or(raw_candidate.len());
        let candidate = raw_candidate[..candidate_end].trim_end_matches(':');
        public_trycloudflare_base_url(candidate)
    })
}

fn public_trycloudflare_base_url(candidate: &str) -> Option<String> {
    let without_scheme = candidate.strip_prefix("https://")?;
    let host_end = without_scheme
        .find(['/', '?', '#'])
        .unwrap_or(without_scheme.len());
    let host = without_scheme[..host_end].trim_end_matches(':');
    let host_lower = host.to_ascii_lowercase();

    if host_lower == "api.trycloudflare.com"
        || !host_lower.ends_with(".trycloudflare.com")
        || host_lower == ".trycloudflare.com"
    {
        return None;
    }

    Some(format!("https://{host}"))
}

#[cfg(test)]
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
            log::info!("从 cloudflared 输出解析到 quick tunnel URL: {}", url);
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

async fn pump_stream_for_tunnel_url<R>(stream: R, tx: mpsc::UnboundedSender<String>) -> Result<()>
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

        let trimmed = line.trim();
        if !sent_first_url {
            log::info!("[cloudflared:start] {}", trimmed);
        } else {
            log::debug!("[cloudflared] {}", trimmed);
        }
        if !sent_first_url {
            if let Some(url) = extract_cloudflare_tunnel_url(&line) {
                sent_first_url = true;
                log::info!("从 cloudflared 输出解析到 quick tunnel URL: {}", url);
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
        extract_cloudflare_tunnel_url, install_command_for_os,
        suggest_price_from_openrouter_snapshot, wait_for_tunnel_url,
        wait_for_tunnel_url_from_streams, MarketListing, MarketModelPrice, MarketService,
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
    fn generate_and_register_access_token_allows_later_validation() {
        MarketService::clear_access_tokens_for_tests();

        let token = MarketService::generate_and_register_access_token_for("provider-1");

        assert!(MarketService::validate_access_token(&token));
        assert!(MarketService::has_active_access_token_for("provider-1"));
    }

    #[test]
    fn invalidating_provider_tokens_rejects_old_access_token() {
        MarketService::clear_access_tokens_for_tests();
        let token = MarketService::generate_and_register_access_token_for("provider-1");

        assert_eq!(MarketService::invalidate_access_tokens_for("provider-1"), 1);

        assert!(!MarketService::validate_access_token(&token));
        assert!(!MarketService::has_active_access_token_for("provider-1"));
    }

    #[test]
    fn suggested_price_is_positive() {
        let suggestion = MarketService::suggest_price_for("provider-1");
        assert!(suggestion.price_per_1k_tokens > 0);
    }

    #[test]
    fn suggested_price_uses_openrouter_snapshot_when_model_matches() {
        let snapshot = r#"{
            "schemaVersion": 1,
            "source": "openrouter",
            "fetchedAt": "2026-04-25T08:00:00.000Z",
            "models": [
                {
                    "id": "anthropic/claude-test",
                    "usdPerMillionTokens": {
                        "input": 3,
                        "output": 15,
                        "cacheRead": 0.3,
                        "cacheWrite": 3.75
                    }
                }
            ]
        }"#;

        let suggestion =
            suggest_price_from_openrouter_snapshot(Some("anthropic/claude-test"), snapshot);

        assert_eq!(suggestion.price_per_1k_tokens, 15);
        assert_eq!(suggestion.source, "openrouter:anthropic/claude-test");
        assert_eq!(
            suggestion.model_price,
            Some(MarketModelPrice {
                model_id: "anthropic/claude-test".to_string(),
                enabled: true,
                input_price_per_1m_tokens: 3.0,
                output_price_per_1m_tokens: 15.0,
                cache_read_price_per_1m_tokens: Some(0.3),
                cache_write_price_per_1m_tokens: Some(3.75),
                currency: "USD".to_string(),
                unit: "PER_1M_TOKENS".to_string(),
                source: "openrouter".to_string(),
                updated_at: 1777104000000,
            })
        );
    }

    #[test]
    fn suggested_price_falls_back_when_model_is_missing_from_snapshot() {
        let snapshot = r#"{
            "schemaVersion": 1,
            "source": "openrouter",
            "models": []
        }"#;

        let suggestion = suggest_price_from_openrouter_snapshot(Some("unknown/model"), snapshot);

        assert_eq!(suggestion.price_per_1k_tokens, 10);
        assert_eq!(suggestion.source, "builtin-default");
        assert!(suggestion.model_price.is_none());
    }

    #[test]
    fn market_listing_serializes_model_price_contract() {
        let listing = MarketListing {
            provider_id: "provider-1".to_string(),
            model_name: "anthropic/claude-test".to_string(),
            price_per_1k_tokens: 15,
            endpoint: "https://seller.trycloudflare.com".to_string(),
            seller_pubkey: "seller-pubkey".to_string(),
            timestamp: 1777104000,
            model_prices: vec![MarketModelPrice {
                model_id: "anthropic/claude-test".to_string(),
                enabled: true,
                input_price_per_1m_tokens: 3.0,
                output_price_per_1m_tokens: 15.0,
                cache_read_price_per_1m_tokens: Some(0.3),
                cache_write_price_per_1m_tokens: Some(3.75),
                currency: "USD".to_string(),
                unit: "PER_1M_TOKENS".to_string(),
                source: "openrouter".to_string(),
                updated_at: 1777104000000,
            }],
            price_unit: "PER_1M_TOKENS".to_string(),
            price_version: 1,
        };

        let value = serde_json::to_value(&listing).unwrap();

        assert_eq!(value["priceUnit"], "PER_1M_TOKENS");
        assert_eq!(value["priceVersion"], 1);
        assert_eq!(
            value["modelPrices"][0]["inputPricePer1mTokens"],
            serde_json::json!(3.0)
        );
        assert_eq!(
            value["modelPrices"][0]["outputPricePer1mTokens"],
            serde_json::json!(15.0)
        );
    }

    #[test]
    fn cloudflared_install_command_matches_supported_platforms() {
        assert_eq!(install_command_for_os("macos"), "brew install cloudflared");
        assert_eq!(
            install_command_for_os("windows"),
            "winget install --id Cloudflare.cloudflared"
        );
        assert!(install_command_for_os("linux").contains("cloudflared"));
    }

    #[test]
    fn check_cloudflared_returns_platform_install_command() {
        let result = MarketService::check_cloudflared();
        assert!(!result.install_command.is_empty());
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

    #[test]
    fn extract_cloudflare_tunnel_url_ignores_cloudflare_api_endpoint() {
        let line = r#"INF request url https://api.trycloudflare.com/tunnel": created tunnel"#;
        let url = extract_cloudflare_tunnel_url(line);
        assert_eq!(url, None);
    }

    #[test]
    fn extract_cloudflare_tunnel_url_skips_api_endpoint_before_public_url() {
        let line = r#"INF api=https://api.trycloudflare.com/tunnel": public=https://demo-123.trycloudflare.com"#;
        let url = extract_cloudflare_tunnel_url(line);
        assert_eq!(url.as_deref(), Some("https://demo-123.trycloudflare.com"));
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

        let url =
            wait_for_tunnel_url_from_streams(Some(stdout_reader), None::<tokio::io::DuplexStream>)
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

        let url =
            wait_for_tunnel_url_from_streams::<tokio::io::Empty, _>(None, Some(stderr_reader))
                .await
                .unwrap();
        assert_eq!(url.as_deref(), Some("https://stderr-123.trycloudflare.com"));
    }
}
