# TokensBuddy DESIGN.md

## 1. Visual Theme & Atmosphere

TokensBuddy 的官网视觉应是一套“可信开发者控制台”语言，而不是交易所、钱包或泛 AI 营销页。它的第一印象要让用户立刻明白: 这是一个面向 AI 编码工具的 Token 切换、分享与交易工作台；Token 可以流动，但每一次流动都在可见、可停、可回退的边界里。

整体气质以深色技术工作台为主，浅色页面也必须保留结构化、克制、可扫描的产品感。首屏可以更有品牌张力，但不能只用抽象渐变撑场面；必须露出 Provider 切换、好友分享、市场发布或路由状态等真实产品信号。视觉故事从“本地 Provider”出发，经由“好友分享通道”，最终到“市场流通轨道”，让用户理解 TokensBuddy 的价值不是投机，而是把闲置资源变成可控协作。

**关键特征:**

- 深色开发者控制台优先: `#101827` / `#111827` 作为官网首屏和产品视觉底色。
- 品牌主色是可信蓝 `#0A84FF`，表达当前 Provider、主行动和可控状态。
- 流动路径使用青色 `#22D3EE`，但保持细线、低透明度和明确节点，不做无边界扩散。
- 健康状态使用绿色 `#10B981`，只表达可用、成功、通道开启，不表达收益。
- 分享温度使用珊瑚色 `#F97366`，只用于好友、邀请、空状态和社媒点缀。
- 市场交易使用琥珀色 `#F59E0B`，只用于价格、发布、付款确认和交易提示。
- 页面结构应像产品官网与控制台说明的结合: 信息密度高、边界清楚、少装饰。
- 禁止使用钱币、K 线、交易盘口、火箭、暴富、加密货币项目风格。

## 2. Color Palette & Roles

### Brand & Flow

- **TokensBuddy Blue** (`#0A84FF`): 主品牌色。用于主按钮、当前 Provider、选中态、关键链接、官网主行动按钮。
- **Flow Cyan** (`#22D3EE`): 流动色。用于 Token 流线、连接路径、路由高亮、官网流程图。
- **Flow Emerald** (`#10B981`): 健康色。用于通道健康、分享已启用、可用资源、成功状态。
- **Buddy Coral** (`#F97366`): 分享温度色。用于好友分享、邀请、空状态、社媒卡片局部点缀。
- **Rail Amber** (`#F59E0B`): 市场强调色。用于价格、发布市场、付款确认、交易警告。
- **Error Red** (`#EF4444`): 错误与危险操作。用于删除、停止分享、失败、高风险提示。

### Dark Surfaces

- **Control Canvas** (`#101827`): 官网首屏、产品 mockup 外层、深色品牌画布。
- **Panel Dark** (`#111827`): 控制台面板、导航、深色卡片主背景。
- **Card Dark** (`#1F2937`): Provider 卡片、流程节点、市场 listing 卡片。
- **Inset Dark** (`#0B1220`): 代码块、终端片段、嵌入式配置展示。
- **Dark Border** (`rgba(148, 163, 184, 0.22)`): 深色默认描边。
- **Dark Hairline** (`rgba(255, 255, 255, 0.08)`): 深色极细分隔线。

### Light Surfaces

- **Page Light** (`#FFFFFF`): 浅色页面背景。
- **Surface Light** (`#FAFAFA`): 次级面板、浅色区块。
- **Card Light** (`#FFFFFF`): 浅色卡片和内容容器。
- **Hover Light** (`#F4F4F5`): 浅色悬停与轻选中背景。
- **Border Light** (`#E4E4E7`): 浅色默认边框。

### Text

- **Text Dark Primary** (`#FAFAFA`): 深色背景主标题和正文。
- **Text Dark Secondary** (`#A1A1AA`): 深色背景描述、元数据、说明。
- **Text Light Primary** (`#18181B`): 浅色背景主文字。
- **Text Light Secondary** (`#71717A`): 浅色背景描述、元数据、辅助信息。
- **Muted Label** (`#94A3B8`): 技术标签、流程标签、轻提示。

### Usage Rules

- 蓝色是系统可信底座，不能被绿色、橙色或珊瑚色抢占主视觉。
- 绿色只表示健康和可用，不表示盈利、收入或交易成功收益。
- 琥珀色只出现在市场、价格、付款和需要确认的交易步骤。
- 珊瑚色只服务分享和人的关系，不进入密钥、付款、权限确认等高风险场景。
- 深色模式允许青色流线有轻微发光，但发光面积必须小，不能变成霓虹风。

## 3. Typography Rules

### Font Family

- **Primary / UI**: `-apple-system`, `BlinkMacSystemFont`, `Segoe UI`, `Roboto`, `Helvetica Neue`, `Arial`, `sans-serif`
- **Monospace / Technical**: `SFMono-Regular`, `ui-monospace`, `Menlo`, `Monaco`, `Consolas`, `Liberation Mono`, `monospace`

### Hierarchy

| Role | Font | Size | Weight | Line Height | Letter Spacing | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Hero Display | Primary | 56px desktop / 40px tablet / 32px mobile | 700 | 1.05 | 0 | 首屏主承诺: “让闲置的 Token 流动起来” |
| Section Heading | Primary | 36px desktop / 28px mobile | 700 | 1.15 | 0 | 官网主章节标题 |
| Panel Heading | Primary | 22px | 650 | 1.25 | 0 | 产品面板、场景区标题 |
| Card Title | Primary | 16px | 650 | 1.35 | 0 | 功能卡片、流程节点 |
| Body Large | Primary | 18px | 400 | 1.60 | 0 | 首屏副标题、章节引言 |
| Body | Primary | 15px-16px | 400 | 1.55 | 0 | 正文说明 |
| UI Text | Primary | 13px-14px | 500 | 1.45 | 0 | 导航、按钮、状态文案 |
| Caption | Primary | 12px | 500 | 1.40 | 0 | 元数据、风险提示、标签 |
| Mono Body | Monospace | 13px | 400 | 1.55 | 0 | Provider、Base URL、endpoint、Token 片段 |
| Mono Label | Monospace | 11px | 500 | 1.40 | 0.02em | 路由标签、短命令、技术徽标 |

### Principles

- 中文标题必须清楚，不要为了“科技感”牺牲可读性。
- 不按视口宽度动态缩放字体；使用明确断点字号。
- 不使用负字距；中文与中英混排全部保持 `letter-spacing: 0`，仅等宽小标签可轻微正字距。
- 官网可以使用较大的标题，但 App 与控制台类面板必须保持紧凑。
- 等宽字体只用于技术片段，不用于大段正文。

## 4. Component Stylings

### Buttons

**Primary Button**

- Background: `#0A84FF`
- Text: `#FFFFFF`
- Padding: `10px 16px`
- Radius: `8px`
- Hover: `#0974E0`
- Use: 下载 TokensBuddy、开始使用、确认主行动。

**Secondary Button**

- Background: dark `rgba(255,255,255,0.06)` / light `#F4F4F5`
- Text: dark `#FAFAFA` / light `#18181B`
- Border: `1px solid` 当前模式边框
- Padding: `10px 16px`
- Radius: `8px`
- Use: 查看 GitHub、了解分享与交易、查看文档。

**Status / Pill Button**

- Background: 按状态使用低透明度色块，例如 `rgba(34, 211, 238, 0.12)`
- Text: 对应状态色或主文字
- Border: 同色低透明度描边
- Radius: `999px`
- Use: 当前 Provider、通道状态、市场阶段、平台标签。

**Danger Button**

- Background: `#EF4444` 或透明红色低透明度背景
- Text: `#FFFFFF` 或 `#EF4444`
- Use: 停止分享、删除 Token、撤销发布。

### Cards & Containers

- Background: 深色 `rgba(31, 41, 55, 0.72)` / 浅色 `#FFFFFF`
- Border: `1px solid rgba(148, 163, 184, 0.22)` 或 `#E4E4E7`
- Radius: `12px` 用于产品面板，`8px` 用于普通卡片。
- Shadow: 深色用边框和亮度层级表达，不依赖大投影；浅色可使用 `0 12px 36px rgba(15, 23, 42, 0.08)`。
- Cards only for: 功能模块、流程步骤、状态面板、市场 listing，不做纯装饰堆叠。

### Navigation

- 桌面端使用简洁横向导航，左侧品牌，右侧产品、分享、市场、安全、GitHub / 下载。
- 背景深色时使用半透明控制台导航: `rgba(16, 24, 39, 0.86)` + hairline border。
- 链接 13-14px、500 weight、颜色低调；当前项或 hover 使用 `#FAFAFA` / `#0A84FF`。
- 移动端折叠为单列菜单，主行动按钮必须仍然可见。

### Badges & Status

- **Provider Active**: 蓝色低透明度背景 + 蓝色描边。
- **Sharing Healthy**: 绿色低透明度背景 + 绿色小圆点。
- **Market Pending**: 琥珀低透明度背景 + 琥珀标签。
- **Risk / Danger**: 红色低透明度背景，只用于真正风险。

### Code & Configuration Blocks

- Background: `#0B1220`
- Text: `#E5E7EB`
- Border: `1px solid rgba(148, 163, 184, 0.20)`
- Radius: `10px`
- Font: monospace 13px
- 内容可展示 Provider、Base URL、endpoint、分享链接局部示例；禁止展示真实密钥。

### Flow Diagrams

- 使用节点和流线连接 “本地 Provider -> 好友分享 -> 市场流通”。
- 每个节点必须有标签和状态，不允许只有抽象光线。
- 流线以 `#22D3EE` 为主，透明度控制在 0.35-0.65。
- 市场流程节点可用少量 `#F59E0B`，但不能把页面染成橙色交易风。

## 5. Layout Principles

### Spacing System

- Base unit: `8px`
- App / 控制台密集节奏: `8px`, `12px`, `16px`, `24px`
- 官网节奏: `24px`, `32px`, `48px`, `72px`
- Hero 上下留白: 桌面 72-96px，移动 40-56px。
- 卡片内边距: 普通 16px，重点面板 20-24px。

### Grid & Container

- 最大内容宽度: `1180px` 到 `1240px`。
- 首屏: 左侧品牌承诺 + 右侧产品工作台视觉，或中心文案 + 下方宽屏工作台视觉。
- 核心场景: 三列桌面布局，对应切换、分享、交易；移动端堆叠。
- 安全与控制: 使用清单式布局，不做过度情绪化安全插图。
- 下载与生态: 平台入口、GitHub、tokensbuddy.com 并列展示。

### Whitespace Philosophy

- 留白服务“可信”和“可扫描”，不是制造空泛高级感。
- 产品视觉必须占据足够面积，让用户看到控制台、状态和流程。
- 页面之间用背景层级、边框和模块标题分隔，少用大面积装饰色块。

### Border Radius Scale

- Micro `4px`: 技术标签、状态小片。
- Standard `8px`: 按钮、输入、普通卡片。
- Panel `12px`: 产品面板、截图容器、流程图容器。
- Large `16px`: 首屏工作台外框或重点展示容器。
- Pill `999px`: 状态徽标、Provider 标签、平台标签。

## 6. Depth & Elevation

| Level | Treatment | Use |
| --- | --- | --- |
| Flat | 无投影，背景为 `#101827` 或 `#FFFFFF` | 页面基础背景 |
| Hairline | `1px solid rgba(255,255,255,0.08)` / `#E4E4E7` | 导航、分割线 |
| Surface | 背景亮度提升 + `1px solid rgba(148, 163, 184, 0.22)` | 卡片、列表、流程节点 |
| Panel | `rgba(31,41,55,0.72)` + 内部高光线 | 产品工作台、截图容器 |
| Floating | `0 18px 48px rgba(15,23,42,0.18)` | 浅色模式浮层、弹窗 |
| Focus | 蓝色或青色 2px outline / ring，保持可访问性 | 键盘焦点、表单焦点 |

**Depth Philosophy:** TokensBuddy 的深度来自“可控层级”而不是戏剧化阴影。深色官网使用背景亮度、边框、状态色和节点关系建立层次；浅色页面使用轻投影，但不能变成卡片堆叠营销页。

## 7. Do's and Don'ts

### Do

- 用“流动控制台”作为主视觉系统，让 Token 流动始终有来源、去向和状态。
- 在首屏展示真实产品信号: Provider、分享通道、市场状态、路由路径。
- 使用 `#0A84FF` 承载可信主行动，用 `#22D3EE` 承载流动路径。
- 用绿色表达可用和健康，用琥珀表达市场和交易确认。
- 保持卡片 8-12px 圆角，界面密度清楚、信息可扫描。
- 让安全边界可见: 可停止、可回退、状态可见、不裸发 Key。
- 所有面向用户的官网文案默认中文，品牌名、技术名、路径和命令除外。

### Don't

- 不要做交易所、钱包、K 线、盘口、币面、黑金财富风。
- 不要用“躺赚”“倒卖”“无限额度”“快速赚钱”等文案。
- 不要用纯渐变 hero、抽象 AI 星云或模糊人物图替代产品信号。
- 不要让橙色或绿色变成主品牌色。
- 不要把分享温度色用于付款、密钥、权限确认等高风险场景。
- 不要在深色模式使用大面积霓虹发光。
- 不要在卡片里再套卡片做装饰堆叠。
- 不要展示真实 Token、cookie、Authorization、密钥或完整隐私数据。

## 8. Responsive Behavior

### Breakpoints

| Name | Width | Key Changes |
| --- | --- | --- |
| Mobile | <640px | 单列布局，首屏保留 H1、副标题、主按钮，产品视觉改为纵向流程卡 |
| Tablet | 640-900px | 两列局部布局，场景卡片 2 列，导航可折叠 |
| Desktop | 900-1280px | 标准横向首屏，三场景并列，完整导航 |
| Large Desktop | >1280px | 最大宽度约 1240px，增加留白，不放大字体 |

### Collapsing Strategy

- 首屏标题: 56px -> 40px -> 32px，行高保持紧凑。
- 产品工作台视觉: 桌面横屏面板，移动端拆成 “Provider / 分享 / 市场” 三张步骤卡。
- 流线图: 桌面使用横向路径，移动端改为纵向步骤，不压缩成不可读细图。
- 导航: 桌面横向，移动端折叠；主行动按钮仍需出现在首屏。
- 核心场景: 三列 -> 两列 -> 单列。
- 代码块: 移动端允许横向滚动，禁止挤压到换行失真。

### Accessibility

- 所有按钮和链接触达区域至少 40px 高。
- 状态不能只靠颜色区分，必须配合文字、图标或标签。
- 深色文字对比度优先，彩色小字不得承载唯一关键信息。
- 动效遵守 `prefers-reduced-motion`，关闭后流程仍可理解。

## 9. Agent Prompt Guide

### Quick Color Reference

- 主行动: TokensBuddy Blue `#0A84FF`
- 流动路径: Flow Cyan `#22D3EE`
- 健康状态: Flow Emerald `#10B981`
- 分享点缀: Buddy Coral `#F97366`
- 市场提示: Rail Amber `#F59E0B`
- 危险状态: Error Red `#EF4444`
- 深色画布: Control Canvas `#101827`
- 深色面板: Panel Dark `#111827`
- 深色卡片: Card Dark `#1F2937`
- 浅色边框: `#E4E4E7`
- 深色边框: `rgba(148, 163, 184, 0.22)`

### Example Component Prompts

- “创建 TokensBuddy 官网首屏: 深色 `#101827` 背景，左侧 H1 为‘让闲置的 Token 流动起来’，56px、700、line-height 1.05；副标题说明 Token 切换、分享与交易。右侧展示产品工作台面板，包含 Provider 列表、分享通道和市场发布状态。主按钮使用 `#0A84FF`，次按钮使用半透明深色边框样式。”
- “设计一个 Provider 切换卡片: 深色 `#1F2937` 背景，`1px solid rgba(148,163,184,0.22)` 边框，12px 圆角。标题 16px 650，状态徽标用蓝色低透明度背景。底部显示 Base URL 或 endpoint 的局部示例，使用 13px monospace。”
- “设计好友分享流程图: 节点为‘本地 Provider’、‘好友通道’、‘可停止分享’，用 `#22D3EE` 细流线连接，健康状态使用 `#10B981` 小圆点，少量 `#F97366` 作为邀请提示，不使用人物插画。”
- “设计市场发布步骤: 三个阶段为‘选择闲置 Token’、‘设置可用边界’、‘发布到市场’，琥珀色 `#F59E0B` 只用于价格和待确认状态，整体仍保持蓝色可信系统。”
- “创建安全边界区块: 使用清单式布局展示‘状态可见、分享可停止、配置可回退、不裸发 Key’，每项使用中性图标和短文案，不使用恐吓式红色大面积警告。”

### Iteration Guide

1. 先检查页面是否像开发者产品，而不是像交易所或泛 AI 营销页。
2. 首屏必须同时表达“切换、分享、交易”，并让“流动可控”成为信任前提。
3. 蓝色是主系统，青色是路径，绿色是健康，珊瑚是分享，琥珀是市场；不要混用语义。
4. 每个流程视觉都要有标签、状态和方向，不能只画抽象线条。
5. 中文文案优先清楚可信，避免收益暗示和夸张承诺。
6. 移动端如果流程图不可读，改成步骤卡，不要硬缩放。
7. 所有示例 Token、endpoint、链接必须是脱敏或虚构内容。
