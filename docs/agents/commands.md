# 命令与环境

除非明确在 `landing-page/` 工作，否则使用根应用命令。

## 环境

- 根项目 Node 版本记录在 `.node-version`。
- Rust toolchain 组件记录在 `rust-toolchain.toml`。
- `src-tauri/Cargo.toml` 声明后端 crate 的最低 Rust 版本。
- CI 前端任务使用 Node 20 和 pnpm 10.12.3。

## 根应用

- 安装依赖：`pnpm install`
- 开发模式运行桌面应用：`pnpm dev`
- 只运行 renderer：`pnpm dev:renderer`
- 构建桌面应用：`pnpm build`
- 只构建 renderer：`pnpm build:renderer`
- 前端类型检查：`pnpm typecheck`
- 检查前端格式：`pnpm format:check`
- 格式化前端文件：`pnpm format`
- 运行前端测试：`pnpm test:unit`
- 监听前端测试：`pnpm test:unit:watch`

根 `package.json` 当前没有 `pnpm lint` 脚本。

## Rust 后端

- 检查格式：`cargo fmt --check --manifest-path src-tauri/Cargo.toml`
- 格式化 Rust：`cargo fmt --manifest-path src-tauri/Cargo.toml`
- 运行 lint：`cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings`
- 运行测试：`cargo test --manifest-path src-tauri/Cargo.toml`

## 营销站点

在 `landing-page/` 目录下运行：

- 安装依赖：`npm install`
- 启动开发服务器：`npm run dev`
- 构建：`npm run build`
- 类型检查/lint 脚本：`npm run lint`
- 预览构建结果：`npm run preview`
