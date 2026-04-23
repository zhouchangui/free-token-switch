use crate::database::Database;
use crate::services::{ProxyService, market::MarketService};
use std::sync::Arc;

/// 全局应用状态
pub struct AppState {
    pub db: Arc<Database>,
    pub proxy_service: ProxyService,
    pub market_service: Arc<MarketService>,
}

impl AppState {
    /// 创建新的应用状态
    pub fn new(db: Arc<Database>) -> Self {
        let proxy_service = ProxyService::new(db.clone());
        
        // 使用更加宽容的初始化，防止 MarketService 启动失败导致全盘崩溃
        let market_service = Arc::new(MarketService::new());

        Self { db, proxy_service, market_service }
    }
}
