# TokensBuddy 重设计决策记录

## 项目

- 项目代号: tokens-buddy-redesign
- 阶段: 1 - 品牌语言
- 日期: 2026-04-28
- 决策状态: 阶段 1 已确认
- 允许生成资产: 否

## 已读取上下文

- `README.md` / `README_ZH.md`: 当前公开表达强调分享、变现和 API value flow。
- `package.json`: 项目是 Tauri + React + Tailwind 桌面应用。
- `src/index.css`: 当前视觉 token 是中性浅深色 + 蓝色主色。
- `src/App.tsx`: 应用主结构包含多 App 切换、Provider、设置、市场、MCP、Skills、Sessions、Workspace、OpenClaw、Hermes 等面板。
- `src/components/AppSwitcher.tsx`: 顶部多 AI 工具切换器是产品核心识别之一。
- `src/components/providers/ProviderCard.tsx`: Provider 卡片承载当前状态、健康、故障转移、用量、分享入口等高密信息。
- `src/components/market/MarketPanel.tsx`: 市场是重要能力，但目前视觉上已有较强橙色和交易入口信号。
- `deliverables/tokens-buddy/`: 旧视觉交付物已存在，但用户选择推翻旧稿重新定义。

## 用户输入与选择

- 用户请求: 使用 `/Users/zcg/workroot/ddm-skills/ddm-product-visual-design` 技能重新为项目设计视觉语言。
- 范围选择: A，推翻旧稿，重新定义。
- 主标语反馈: “让闲置 Token 流动起来”这个表达可以接受。
- 第一眼视觉选择: A，专业桌面控制台。

## 已确认

- 品牌主名: TokensBuddy
- 中文辅助名: Token 搭子
- 主标语: 让闲置 Token 流动起来
- 主视觉性格: 专业桌面控制台
- 产品定义: 面向 AI 编码工具的本地 Token 控制台，支持 Provider 切换、可控分享与市场交易。
- 核心叙事: 先看清 Token 和 Provider，再让闲置资源在可控边界内被使用。

## 已否决

- 继承旧稿的“流动控制台 + 搭子网络 + 市场轨道”组合。
  - 理由: 用户选择推翻旧稿；旧方向只能作为已看过的参考，不作为新设计基础。
- 把视觉做成交易所、钱包、收益平台。
  - 理由: 会把“闲置 Token 流动起来”误导成金融流动性或投机。
- 把“搭子”做成强社交或强吉祥物系统。
  - 理由: 会削弱专业开发者工具信任感。
- 把市场/交易作为第一眼主视觉。
  - 理由: 市场是核心能力之一，但不是长期品牌信任的第一层。

## 阶段 2 方向选择

- 用户在视觉伴随页面中先点击 A 控制中枢，随后连续选择 B 路由矩阵，并在终端明确回复“选 B”。
- 已确认主方向: 路由矩阵（Route Matrix）。
- 选择理由:
  - 更能表达“闲置 Token 流动起来”，但仍保持专业桌面控制台的可控边界。
  - Provider、工具、好友、市场都可以被表达为节点，Token 只沿授权路径移动。
  - 比控制中枢更有品牌记忆点，比资源账本更适合作为全局主视觉。
- 输出文件: `strategy/visual-directions.md`

## 待进入阶段 3 的开放问题

- 新的专业桌面控制台应该偏哪种具体视觉隐喻:
  - 已选: 路由矩阵。
- 新版 icon 是否保留现有多彩径向“流动”种子，还是完全重画。
- 官网和 App 是否共用同一视觉语言，还是官网可以更强地表达“闲置 Token 流动”。
- 市场模块的橙色、价格、购买入口如何降噪，避免盖过控制台主系统。

## 下一阶段门

- 下一步允许进入阶段 3: 视觉系统与资产列表。
- 阶段 3 必须输出视觉系统、色彩系统、logo / icon 简报、website/DESIGN.md 和资产列表。
- 生成 logo、icon、图片、SVG、Pencil、官网 mockup 或改项目 UI 前，仍需单独进入资产生成门并获得确认。

## 阶段 3 输出记录

- 已新增:
  - `visual-system/visual-system.md`
  - `colors/color-system.md`
  - `logo/logo-brief.md`
  - `icons/icon-spec.md`
  - `website/DESIGN.md`
  - `assets/asset-list.md`
- 阶段 3 状态:
  - 文档已写入。
  - 需要用户反馈。
  - 未生成资产。
  - 未修改现有 App、landing-page、README 或图标文件。
