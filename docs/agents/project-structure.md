# 项目结构

TokensBuddy 是一个 Tauri 2 桌面应用，用于管理和共享 Claude、Codex、Gemini、OpenCode、OpenClaw、Hermes、MCP、prompts、skills、proxy、sessions、usage、workspace 与 market 等功能中的 API token/provider 配置。

## 主应用

- `src/`：桌面 renderer 源码。
- `src/App.tsx`：主应用外壳、导航状态、app/view 切换、全局 dialog 与事件处理。
- `src/components/`：功能 UI 与共享 UI 基础组件。
- `src/components/ui/`：共享 Radix/Tailwind 基础组件。新增基础组件前优先使用这里已有组件。
- `src/hooks/`：settings、providers、proxy、import/export、MCP、skills、sessions 与应用行为的可复用 React hooks。
- `src/lib/api/`：Tauri 命令前端封装与 API 相关辅助函数。
- `src/lib/query/`：TanStack Query 客户端、query keys、queries、mutations 与 subscriptions。
- `src/config/`：provider presets、app constants、model/config 辅助函数与 provider 专属模板。
- `src/types.ts` 与 `src/types/`：共享前端类型。
- `src/i18n/locales/`：英文、中文、日文 locale JSON 文件。
- `tests/`：前端单元/集成测试、MSW handlers、Tauri mocks 与初始化文件。

## Tauri 后端

- `src-tauri/src/commands/`：暴露给前端的 Tauri 命令边界。
- `src-tauri/src/services/`：后端业务逻辑。
- `src-tauri/src/database/`：schema、migrations、DAOs、backups 与数据库测试。
- `src-tauri/src/proxy/`：proxy server、routing、provider adapters、transforms、streaming、usage logging、health 与 failover 行为。
- `src-tauri/src/mcp/`：支持应用的 MCP sync/import 集成。
- `src-tauri/src/deeplink/`：deep-link 解析与导入行为。
- `src-tauri/src/session_manager/`：支持的 coding app session 发现/解析。
- `src-tauri/tests/`：Rust 集成测试。

## 其他区域

- `landing-page/`：独立 React 19/Vite 营销站点，有自己的 package 文件和 lockfile。
- `docs/`：用户手册、项目笔记与 agent 文档。
- `.github/`：issue templates、PR template、CI/release workflows。
- `.agents/skills/`：本 workspace 使用的本地 agent workflow skills。
