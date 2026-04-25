# 测试、依赖与 PR

## 验证

- 仅前端改动：至少运行 `pnpm typecheck` 和最相关范围的 `pnpm test:unit`。
- 对格式敏感的前端改动：运行 `pnpm format:check`，或先运行 `pnpm format` 再重新检查。
- Rust 改动：运行 `cargo fmt --check --manifest-path src-tauri/Cargo.toml`、`cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings`，以及相关 `cargo test --manifest-path src-tauri/Cargo.toml` 测试。
- 跨边界改动：同时运行覆盖变更命令/API 路径的前端与 Rust 检查。
- 复杂业务逻辑需要日志驱动验证：定义预期日志，运行成功流与错误流，检查日志，并确认没有泄露秘密。
- 验证优先自动化触发。向用户请求人工帮助前，优先使用浏览器自动化、Computer Use、脚本、命令或测试。
- 如果某个命令无法在本地运行，在最终回复中说明命令和原因。

## 依赖与产物

- 根应用依赖由 `pnpm-lock.yaml` 管理；除非依赖变更需要，不要编辑 lockfile。
- `landing-page/` 使用自己的 package 文件和 lockfile。在那里工作时，依赖变更应限制在该应用内。
- 不要提交生成产物或本地状态，例如 `node_modules/`、`dist/`、`release/`、`.tokens-buddy/`、`.codex/`、`.claude/`、`.gemini/`、日志或测试报告。
- 不要提交 `.env`、`.env.local`、本地凭据和私有配置文件。

## Git 与 PR

- 优先使用小而聚焦的分支。
- 提交时使用 Conventional Commit 风格：`feat(scope): ...`、`fix(scope): ...`、`docs(scope): ...`、`chore(scope): ...`。
- PR 前对齐 `.github/pull_request_template.md`：
  - `pnpm typecheck` 通过。
  - `pnpm format:check` 通过。
  - 如果改了 Rust 代码，`cargo clippy` 通过。
  - 如果改了用户可见文案，i18n 文件已更新。
- UI 改动最好附截图或短录屏，尤其是 settings、provider、proxy、market、session 与 workspace 工作流。
