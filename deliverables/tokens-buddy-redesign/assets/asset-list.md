# TokensBuddy 重设计资产列表

## 必需

| 资产 | 方法 | 格式 | 状态 | 需要补充 |
| --- | --- | --- | --- | --- |
| 品牌语言 | 文档整理 | Markdown | 已完成 | `brand/brand-language.md` |
| 决策记录 | 文档整理 | Markdown | 已更新 | `brand/decision-log.md` |
| 视觉方向 | 文档整理 | Markdown | 已完成 | `strategy/visual-directions.md` |
| 视觉系统 | 文档整理 | Markdown | 待用户确认 | `visual-system/visual-system.md` |
| 色彩系统 | 文档整理 | Markdown | 待用户确认 | `colors/color-system.md` |
| Logo 简报 | 文档整理 | Markdown | 待用户确认 | `logo/logo-brief.md` |
| Icon 规范 | 文档整理 | Markdown | 待用户确认 | `icons/icon-spec.md` |
| 网站 DESIGN.md | 文档整理 | Markdown | 待用户确认 | `website/DESIGN.md` |
| App icon 规范 | 文档整理 | Markdown | 建议补充 | 平台尺寸要求 |
| 核心屏幕视觉方向 | 文档整理 | Markdown | 建议补充 | Provider、分享、市场、用量 |
| 工具栏与面板视觉规范 | 文档整理 | Markdown | 建议补充 | 核心操作清单 |
| 文档站 / README 设计说明 | 文档整理 | Markdown | 建议补充 | README 与 docs 入口 |

## 推荐

| 资产 | 方法 | 格式 | 状态 | 需要补充 |
| --- | --- | --- | --- | --- |
| 主 logo / app mark | SVG 编程 | SVG + PNG | 未生成 | 需进入资产生成门 |
| App icon 母版 | SVG 编程或矢量设计 | SVG + PNG/ICO | 未生成 | 需确认是否替换现有 `src/assets/icons/app-icon.png` |
| favicon | SVG/ICO 导出 | SVG + ICO + PNG | 未生成 | 需确认 landing-page 和 app 使用入口 |
| 横版 logo | SVG 编程 | SVG + PNG | 未生成 | 需确认中文辅助名是否进入组合 |
| README 头图 | HTML/CSS 或 SVG | PNG + SVG | 未生成 | 需确认文案和尺寸 |
| 官网 hero mockup | HTML/CSS mockup | HTML + PNG + SVG | 未生成 | 需确认是否基于真实 App 截图 |
| OG 分享图 | HTML/CSS mockup | PNG | 未生成 | 分享标题与描述 |
| Provider 路由矩阵插图 | SVG | SVG + PNG | 未生成 | 节点文案 |
| 分享流程插图 | SVG | SVG + PNG | 未生成 | 好友分享流程 |
| 市场发布流程插图 | SVG | SVG + PNG | 未生成 | 市场步骤 |
| 设计 token CSS 草案 | CSS | CSS | 未生成 | 需确认是否准备落地实现 |

## 可选

| 资产 | 方法 | 格式 | 状态 | 需要补充 |
| --- | --- | --- | --- | --- |
| 社媒方图头像 | SVG/PNG 合成 | PNG | 未生成 | 平台尺寸 |
| 公众号头图模板 | HTML/CSS mockup | PNG | 未生成 | 账号与栏目文案 |
| 小红书封面模板 | HTML/CSS mockup | PNG | 未生成 | 是否需要中文传播渠道 |
| 空状态插图 | SVG | SVG + PNG | 未生成 | 具体空状态 |
| 分享成功页视觉 | SVG/HTML | SVG + PNG | 未生成 | 页面文案 |

## 暂缓

| 资产 | 原因 |
| --- | --- |
| AI 生成抽象背景图 | 当前方向更适合 SVG / HTML/CSS 精准控制，AI 图容易产生乱码和赛博噪音 |
| 吉祥物 | 与“专业桌面控制台”第一印象冲突 |
| 大量市场促销图 | 容易把品牌误读成交易/变现平台 |

## 资产生成门

- 用户已确认范围: 是，生成全部推荐图片资产
- 用户已确认方法: 是，调用 `imagegen` 生成位图视觉概念
- 用户已确认格式: 是，PNG 预览为主
- 用户已确认输出目录: 是，`deliverables/tokens-buddy-redesign/generated/` 与 `visual-kit/`
- 用户已确认覆盖权限: 是，不覆盖现有项目文件
- 确认时间: 2026-04-28
- 允许生成资产: 是

## 资产生成方法确认

- 是否允许 AI 生成图片: 是，本轮用于视觉概念和预览图。
- 是否允许 SVG: 本轮不生成 SVG 母版，后续生产化建议补 SVG。
- 是否只输出 PNG: 是，本轮先输出 PNG。
- 是否需要透明背景: 否，本轮先做满画布视觉概念。
- 是否需要满画布背景: 是。
- 是否需要母版: 本轮以 PNG 概念母版替代，后续生产化再补矢量母版。
- 是否允许覆盖已有文件: 否。
- 输出目录: `deliverables/tokens-buddy-redesign/generated/` 与 `visual-kit/`。

## 默认视觉图集结构

```text
visual-kit/
  README.md
  favicon.ico
  png/
    master/
    app-icon/
    favicon/
    avatar/
    logo/
    social/
    preview/
  reference/
```

## 必需概览图

- 路径: `visual-kit/png/preview/brand-kit-overview.png`
- 推荐尺寸: `1600x1080`
- 必含区块:
  - 主图标 / PRIMARY APP ICON
  - 横版组合 / LOGO LOCKUP
  - 图标应用 / ICON USAGE
  - 品牌色彩 / COLOR PALETTE
  - 使用规范 / DO & DON'T
