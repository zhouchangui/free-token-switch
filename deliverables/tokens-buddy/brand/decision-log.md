# TokensBuddy 视觉设计决策记录

## 项目

- 项目代号: tokens-buddy
- 阶段: 2 - 视觉方向探索
- 日期: 2026-04-28
- 决策状态: 第三阶段进行中
- 允许生成资产: 否
- 流程复盘: `brand/stage-1-retrospective.md`

## 已读取上下文

- 产品仓库: `/Users/zcg/workroot/tokens-buddy`
- 现有产品名:
  - 英文: TokensBuddy
  - README / i18n 中的中文辅助名: Token 搭子
- 现有 README 标语:
  - 英文: Share and Monetize Your Unused API Tokens - Let Your API Value Flow
  - 中文: 你的闲置 Token 共享与变现利器 —— 让 API 价值流动起来
- 现有 app 视觉信号:
  - React + Tailwind + Lucide + shadcn-style primitives。
  - 系统字体、蓝色主色、中性灰表面、浅深色模式。
  - 密集桌面工具布局，包含 Provider 卡片、应用切换器、市场面板、用量和设置界面。
  - 当前 app icon 是深色背景上的多彩径向流动标记。

## 第二阶段进入记录

- 用户指令: 按流程进入第二阶段。
- 作为视觉探索前提的第一阶段结论:
  - TokensBuddy 建立在 cc-switch 式 Token / Provider 切换基础上。
  - Token 分享与交易是关键新增价值。
  - 主标语已选择: 让闲置的 Token 流动起来。
  - 视觉探索需要同时表达“切换底座”和“Token 流动故事”。
- 带入第二阶段的开放项:
  - 能力句可在视觉方向确认后继续收紧。
  - 核心叙事可在选定视觉隐喻后继续打磨。

## 第一阶段关键决策

- 品牌主名: TokensBuddy
- 中文辅助名: Token 搭子
- 主标语: 让闲置的 Token 流动起来
- 产品判断:
  - 切换是基础能力。
  - 分享和交易是新增价值。
  - 流动是品牌故事。
- 推荐能力句草案:
  - 面向 AI 编码工具的 Token 切换、分享与交易工作台。
- 推荐一句话介绍:
  - TokensBuddy 延续 cc-switch 的多工具 Provider 切换能力，并进一步支持好友分享、市场发布和 Token 交易，让用不完的 AI Token 可以被需要的人用起来。

## 用户反馈与修正

### 缺少目标用户视角

- 反馈: 上一版候选缺少对目标用户的考量。
- 判断: 反馈成立。上一版主要从产品能力和品牌概念出发，没有先定义“谁会高频打开 TokensBuddy、他当下为什么需要它、他最害怕什么”。
- 修正:
  - 在 `brand-language.md` 中加入受众优先重构。
  - 按 AI 编码重度用户、多 Provider 管理者、好友协作用户、闲置额度拥有者、AI 工具链中控用户拆分路线。
  - 明确主品牌不应只对“想卖 Token 的人”说话。

### 产品核心是 cc-switch 加 Token 分享与交易

- 反馈: 这个产品的核心是在 cc-switch 的基础上增加 Token 分享和交易。
- 判断: 反馈成立，并覆盖上一版“AI 工具链中控”的泛化定位。
- 修正:
  - 更新 `brand-language.md` 中的当前推荐版本。
  - 新增产品核心重构。
  - 新增核心优先的文案候选。
  - 目标用户重新围绕 cc-switch 既有用户、多 Provider 切换用户、有闲置 Token 的 AI 开发者、临时需要 Token 的开发者或好友、小团队协作场景、价格敏感用户组织。

## 已否决或降级方向

### 已否决

- 把 TokensBuddy 直接定义成“Token 交易所”
  - 理由: 过度金融化，容易带来投机、合规和信任风险，也不能覆盖本地 Provider 管理、路由、Skills、MCP、OpenClaw、Hermes 等能力。
- 把品牌做成强吉祥物或过度可爱“搭子”
  - 理由: 会削弱专业工具可信度。Buddy 感更适合微文案、空状态和局部视觉细节。
- 使用“薅羊毛、套利、躺赚、倒卖”等增长黑话
  - 理由: 和产品需要建立的安全、透明、可控形象冲突。

### 已降级

- “共享与变现利器”
  - 理由: 有传播效率，但显得偏单点和偏营销，后续可以作为某个功能模块标题，不建议做总品牌定位。
- “可交易的开发资源”
  - 理由: 概括能力强，但“交易”一词敏感，建议在官网或市场页谨慎使用。

## 专家关注点与取舍

- Brand Guardian:
  - 需要保护品牌不被“倒卖 Token”的联想绑架。
  - 视觉资产应建立可信基础: 本地控制、清晰状态、权限边界、回退感。
- UX Researcher:
  - 用户会关心分享前发生了什么、Token 会不会泄露、如何停止、如何回滚。
  - 品牌语言必须让“安全可控”进入主叙事，而不是只出现在说明文档末尾。
- Visual Storyteller:
  - 推荐视觉叙事围绕“孤岛、节点、通道、流动、控制台”建立。
  - 不推荐围绕“金币、收益曲线、交易大厅”建立主视觉。
- Whimsy Injector:
  - 可以保留轻微幽默和伙伴感，但必须服务于降低复杂工具的紧张感。
  - 趣味表达不应出现在高风险操作确认、付款、分享授权、密钥处理等场景。

## 第二阶段方向选项

- 方向 A: 流动控制台（Flow Console）
- 方向 B: 搭子网络（Buddy Network）
- 方向 C: Token 流通轨道（Token Exchange Rail）
- 推荐: 流动控制台作为主系统，搭子网络作为温度层，Token 流通轨道作为受控市场子系统。
- 输出文件: `strategy/visual-directions.md`

## 第二阶段已确认

- 用户指令: 继续下一个阶段。
- 视为确认:
  - 流动控制台作为主系统。
  - 搭子网络作为分享与引导时刻的温度层。
  - Token 流通轨道作为市场与卖家流程的受控子语言。
- 第三阶段输出:
  - `visual-system/visual-system.md`
  - `colors/color-system.md`
  - `logo/logo-brief.md`
  - `icons/icon-spec.md`
  - `website/design.md`
  - `website/DESIGN.md`
  - `assets/asset-list.md`

## 下一阶段门

- 只有用户确认第三阶段视觉系统和资产列表后，才能进入第四阶段资产生成门。
- 第四阶段确认前，不允许生成 logo、icon、SVG、图片、Pencil、官网 mockup 或浏览器视觉资产。

## 第四阶段准备

- 用户请求: 给出交付物实现。
- 已新增实现方案: `assets/implementation-plan.md`
- 当前状态:
  - 已给出推荐第一批实现范围。
  - 用户已确认执行生成。
  - 已生成第一批评审资产到 `generated/`。
  - 未覆盖现有项目文件。

## 第四阶段生成结果

- Logo / App Icon 草案: 已生成 SVG 和 PNG 预览。
- 官网首屏视觉草案: 已生成 SVG、HTML 和 PNG 预览。
- README / OG 分享图: 已生成 SVG、HTML 和 PNG 预览。
- 三个流程插图: 已生成 SVG 和 PNG 预览。
- 设计 token CSS 草案: 已生成。
- QA 记录:
  - 使用 `rsvg-convert` 导出 PNG。
  - 已检查关键预览图，修复官网首屏副标题过长问题。
  - 未修改 `src/assets/icons/app-icon.png` 或其他现有 app 文件。
