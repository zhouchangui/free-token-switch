# TokensBuddy 资产列表

## 阶段门

- 决策状态: 第一批资产已生成
- 用户已确认资产范围: 是
- 用户已确认生成方法: 是
- 用户已确认格式: 是
- 用户已确认输出目录: 是
- 用户已确认覆盖权限: 是，不覆盖现有项目文件
- 允许生成资产: 是，仅限 `deliverables/tokens-buddy/generated/`
- 实现方案: `assets/implementation-plan.md`

## 必需资产

| 资产 | 方法候选 | 格式 | 状态 | 需要补充 |
| --- | --- | --- | --- | --- |
| 品牌语言 | 文档整理 | Markdown | 已完成草案 | 最终确认能力句 |
| 视觉方向 | 文档整理 | Markdown | 已完成草案 | 确认第三阶段视觉系统 |
| 视觉系统 | 文档整理 | Markdown | 已生成草案 | 用户确认 |
| 色彩系统 | 文档整理 | Markdown / CSS 变量 | 已生成草案 | 是否直接进入代码实现 |
| Logo 简报 | 文档整理 | Markdown | 已生成草案 | 是否保留当前 icon 基因 |
| Icon 规范 | 文档整理 | Markdown | 已生成草案 | 平台尺寸优先级 |
| 官网 DESIGN.md | 文档整理 | Markdown | 已生成 awesome-design-md 格式版本 | 后续可复制到项目根目录给设计/编码 agent 使用 |
| App icon 规范 | SVG 编程 | SVG / PNG | 已生成预览 | 尚未替换现有 app icon |
| 核心界面视觉方向 | 文档整理 / 后续截图标注 | Markdown / PNG | 待确认 | 核心屏幕清单 |
| 工具栏与面板视觉规范 | 文档整理 | Markdown | 待确认 | 核心操作列表 |
| 官网 docs DESIGN.md | 文档整理 | Markdown | 待确认 | 文档结构 |
| 首页 hero 方向 | SVG + HTML/CSS mockup | SVG / HTML / PNG | 已生成草案 | 尚未接入官网 |

## 推荐资产

| 资产 | 方法候选 | 格式 | 状态 | 需要补充 |
| --- | --- | --- | --- | --- |
| 启动页视觉 | SVG 编程 / HTML/CSS mockup | SVG / PNG | 暂未生成 | 加载文案 |
| 状态与反馈视觉 | 文档整理 / SVG 编程 | Markdown / SVG | 暂未生成 | 状态清单 |
| 技术 icon 系统 | SVG 编程 | SVG | 暂未生成 | 技术分类 |
| 代码与终端视觉风格 | 文档整理 | Markdown | 暂未生成 | 示例代码 |
| 官网 OG 分享图 | SVG + HTML/CSS mockup | SVG / HTML / PNG | 已生成草案 | 尚未接入官网 |
| 市场 listing 卡片 | HTML/CSS mockup | PNG / HTML | 暂未生成 | 市场文案 |
| 好友分享流程插图 | SVG 编程 | SVG / PNG | 已生成草案 | 可继续精修 |
| 市场发布流程插图 | SVG 编程 | SVG / PNG | 已生成草案 | 可继续精修 |

## 可选资产

| 资产 | 方法候选 | 格式 | 状态 | 需要补充 |
| --- | --- | --- | --- | --- |
| 快捷命令 icon | SVG 编程 | SVG | 暂未生成 | 命令列表 |
| 社媒卡片模板 | HTML/CSS mockup / 图像生成 | PNG | 暂未生成 | 渠道和尺寸 |
| README 顶部视觉 | SVG 编程 / HTML/CSS mockup | SVG / PNG | 暂未生成 | README 内容结构 |
| 市场卖家徽章 | SVG 编程 | SVG | 暂未生成 | 状态分类 |

## 暂缓资产

| 资产 | 原因 |
| --- | --- |
| 完整 UI mockup | 需要先确认是否改 app 现有界面，不宜在第三阶段提前生成 |
| 完整官网页面视觉稿 | 需要第四阶段确认方法和输出目录 |
| 图片生成版 hero 背景 | 当前产品更适合产品可视化或 SVG/HTML 方案，不优先使用抽象图片 |
| 吉祥物 / 人物角色 | 与可信开发者工具主线不匹配，容易削弱专业感 |

## 第四阶段资产生成门

进入第四阶段前，需要用户明确确认:

- 要生成哪些资产。
- 使用哪种方法: imagegen、SVG 编程、HTML/CSS mockup、Pencil 或其他。
- 输出格式: SVG、PNG、ICO、ICNS、PDF、HTML 等。
- 输出目录。
- 是否允许覆盖现有资产，尤其是 `src/assets/icons/app-icon.png`。

当前状态: 第一批评审资产已生成，未覆盖现有项目文件。

## 推荐第一批实现

- Logo / App Icon 草案。
- 官网首屏视觉草案。
- README / OG 分享图。
- 三个流程插图。
- 设计 token CSS 草案。

默认输出到 `deliverables/tokens-buddy/generated/`，默认不覆盖现有项目文件。

## 已生成文件

- `generated/logo/tokensbuddy-mark.svg`
- `generated/logo/tokensbuddy-mark.png`
- `generated/logo/tokensbuddy-mark-mono.svg`
- `generated/logo/tokensbuddy-lockup.svg`
- `generated/icons/app-icon-preview.svg`
- `generated/icons/app-icon-preview.png`
- `generated/website/hero-mockup.svg`
- `generated/website/hero-mockup.html`
- `generated/website/hero-mockup.png`
- `generated/social/og-image.svg`
- `generated/social/og-image.html`
- `generated/social/og-image.png`
- `generated/social/readme-header.svg`
- `generated/social/readme-header.png`
- `generated/illustrations/provider-switch-flow.svg`
- `generated/illustrations/provider-switch-flow.png`
- `generated/illustrations/buddy-share-flow.svg`
- `generated/illustrations/buddy-share-flow.png`
- `generated/illustrations/market-rail-flow.svg`
- `generated/illustrations/market-rail-flow.png`
- `generated/tokens/tokensbuddy-visual-tokens.css`
