# 智能体规则

这些规则适用于整个仓库。保持本文件短小；只在任务相关时加载下方细分文档。

## 最高优先级

1. 默认所有面向用户的输出都使用中文，除非用户明确要求其他语言。
2. 保护已有工作。先阅读将要修改的文件，绝不回滚无关改动。
3. 保持改动聚焦。遵循本地模式，避免大范围重构或臆造抽象。
4. 保护秘密。不要记录或暴露 API Key、认证令牌、供应商凭据或含密 URL。
5. 用户可见文案必须走 i18n；改文案时同步更新 `src/i18n/locales/` 三个语言文件。
6. Tauri 命令/API 契约变更时，Rust 与 TypeScript 必须同步。
7. 用最窄但有效的检查验证；无法运行检查时说明原因。
8. 不要声称根项目 `pnpm lint` 通过；当前没有这个脚本。
9. 生成产物和本地状态不得进入提交。

## 开发工作流

- 修改前先判断任务复杂度。需求不清或任务复杂时，使用 [brainstorming](/Users/zcg/workroot/github.com/cc-switch/.agents/skills/brainstorming/SKILL.md)、[writing-plans](/Users/zcg/workroot/github.com/cc-switch/.agents/skills/writing-plans/SKILL.md)、[executing-plans](/Users/zcg/workroot/github.com/cc-switch/.agents/skills/executing-plans/SKILL.md)、[verification-before-completion](/Users/zcg/workroot/github.com/cc-switch/.agents/skills/verification-before-completion/SKILL.md)。
- 任务简单且明确时，使用 [karpathy-guidelines](/Users/zcg/.agents/skills/karpathy-guidelines/SKILL.md)、[test-driven-development](/Users/zcg/workroot/github.com/cc-switch/.agents/skills/test-driven-development/SKILL.md)、[verification-before-completion](/Users/zcg/workroot/github.com/cc-switch/.agents/skills/verification-before-completion/SKILL.md)。
- 开始执行开发任务前，务必考虑是否能交给有相关经验的子智能体来节约主上下文。适合委派时，给子智能体最小必要上下文和清晰验收标准；子智能体完成后，主智能体必须检查 diff 并运行必要验证，不能只信任子智能体结论。
- 复杂度拿不准时询问用户。开始实现前，询问是否需要 [using-git-worktrees](/Users/zcg/workroot/github.com/cc-switch/.agents/skills/using-git-worktrees/SKILL.md) 或新分支。
- 复杂业务逻辑必须做日志驱动验证：设计日志、执行业务流、检查成功与错误路径日志，并优先自动化触发。需要人工 UI 流程时，可询问用户或使用 [@Computer Use](plugin://computer-use@openai-bundled) / [browser-use:browser](/Users/zcg/.codex/plugins/cache/openai-bundled/browser-use/0.1.0-alpha1/skills/browser/SKILL.md)。

## 渐进式文档

- 开发工作流：`docs/agents/development-workflow.md`
- 项目结构：`docs/agents/project-structure.md`
- 命令与本地环境：`docs/agents/commands.md`
- 前端约定：`docs/agents/frontend.md`
- 后端约定：`docs/agents/backend.md`
- 测试、依赖与 PR：`docs/agents/testing-and-pr.md`

## 加载指南

- 从本文件开始。
- 选择任务流程、worktree/分支策略或日志验证时，加载 `development-workflow.md`。
- 定位代码或规划跨模块工作时，加载 `project-structure.md`。
- 运行安装、开发、构建或应用脚本前，加载 `commands.md`。
- 处理 React、TypeScript、UI、query、API 封装或 i18n 时，加载 `frontend.md`。
- 处理 Rust、Tauri 命令、数据库、代理、服务或安全敏感改动时，加载 `backend.md`。
- 最终验证、依赖改动、提交或 PR 前，加载 `testing-and-pr.md`。
