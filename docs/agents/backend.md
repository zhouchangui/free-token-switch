# 后端约定

## 技术栈

- Rust + Tauri 2，Tokio，Axum/Hyper，rustls，rusqlite，serde，reqwest，以及 `thiserror`/`anyhow` 相关模式。
- 暴露给前端的 Tauri 命令名保持 camelCase。

## 边界

- `src-tauri/src/commands/` 中的命令保持轻薄，业务逻辑放到 `src-tauri/src/services/`。
- 持久化逻辑放到 `src-tauri/src/database/dao/`，schema 与 migration 改动放到 `src-tauri/src/database/`。
- 代理相关行为放到 `src-tauri/src/proxy/`。
- 深链接解析放到 `src-tauri/src/deeplink/`。
- 应用专属的 MCP、session、config 行为沿用现有应用专属模块。

## 错误与安全

- 命令边界以下优先使用结构化错误，例如 `AppError`、`thiserror` 或现有 Result 模式。
- 只有在命令边界需要给前端展示时，才转换成前端友好的字符串。
- 绝不记录原始 API Key、Bearer Token、供应商凭据、认证码或包含秘密的完整 URL。
- 日志与诊断中要脱敏 query 值和含密字段。
- 谨慎处理用户配置目录下的文件路径；保留现有存储位置与迁移行为。

## 跨边界改动

- 修改命令输入/输出时，同步更新 Rust 类型、前端 `src/lib/api/` wrapper 与 TypeScript 类型。
- 修改数据库结构时，添加或更新 migration，并在可行时用 Rust 测试覆盖行为。
- 修改代理行为时，同时考虑 streaming、body transform、provider routing、failover、usage logging 与 health status 的联动。
- 修改启动、自启动、托盘、深链接或窗口行为时，考虑 macOS、Windows、Linux 的平台差异。
