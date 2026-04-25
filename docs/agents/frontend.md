# 前端约定

## 技术栈

- React 18、Vite、TypeScript strict mode、Tailwind CSS、Radix UI、lucide-react、TanStack Query、i18next、sonner、Vitest + jsdom。
- 从 `src/` 导入时使用 `@/` 别名。
- 新增抽象前，优先使用 `src/components/ui/` 里的现有 UI 基础组件和本地功能模式。

## TypeScript 与数据流

- 保持 TypeScript strict。除非有狭窄且记录清楚的理由，否则避免 `any`。
- 复用 `src/types.ts`、`src/types/` 与邻近功能模块中的共享类型。
- 已有封装时，Tauri 交互通过 `src/lib/api/`。
- 服务端/应用状态通过 `src/lib/query/` 和功能 hooks 管理，不要在组件里临时散落 fetching。
- 当 hooks 或辅助函数能让 UI 组件更易读时，把功能逻辑放进去。

## UI

- 匹配现有紧凑型桌面工具风格。
- 使用 Tailwind token 和邻近组件里的现有 class 模式。
- 应用已有 icon button 或工具控件时，使用 lucide-react 图标。
- 小桌面窗口下布局要稳定；避免按钮、标题、tab、card 文本溢出。
- 不要把 landing-page 风格的 hero section 加进桌面应用。

## i18n

- 用户可见文本属于 i18n。
- 修改文案时同步更新三个 locale 文件：
  - `src/i18n/locales/en.json`
  - `src/i18n/locales/zh.json`
  - `src/i18n/locales/ja.json`
- 使用周围功能既有的 key 命名模式。
- 除非周围代码明确把它当作非用户可见的开发/调试文本，否则不要在组件里硬编码新 UI 文案。

## 测试

- 非平凡行为需要新增或更新 Vitest 测试，尤其是 hooks、query mutations、dialogs、import/export、provider actions 和 UI state transitions。
- 前端测试 helper 位于 `tests/setup*.ts`、`tests/msw/` 和 `tests/utils/`。
