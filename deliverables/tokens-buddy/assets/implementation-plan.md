# TokensBuddy 交付物实现方案

## 阶段门

- 当前阶段: 第四阶段准备
- 决策状态: 等待用户确认资产生成范围
- 允许生成资产: 否
- 默认覆盖策略: 不覆盖现有项目文件
- 默认输出目录: `/Users/zcg/workroot/tokens-buddy/deliverables/tokens-buddy/generated/`

## 实现目标

把第三阶段确认的视觉系统转成可交付、可评审、可选择是否进入代码仓库的资产包。第一批实现应优先服务品牌识别、官网首屏、README / 分享传播，以及后续 App 视觉改造参考。

## 推荐第一批实现范围

### 1. Logo / App Icon 草案

- 目标:
  - 从当前多彩径向流动图标演进为“流动控制台”标记。
  - 表达 Token 节点、Provider 切换、受控流动。
- 方法候选:
  - SVG 编程优先。
  - 必要时再用 imagegen 做视觉灵感探索，但不直接替换最终矢量。
- 输出格式:
  - `logo/tokensbuddy-mark.svg`
  - `logo/tokensbuddy-mark-mono.svg`
  - `logo/tokensbuddy-lockup.svg`
  - `icons/app-icon-preview.svg`
  - `icons/app-icon-preview.png`
- 覆盖策略:
  - 不覆盖 `src/assets/icons/app-icon.png`。
  - 先输出到 `deliverables/tokens-buddy/generated/`。

### 2. 官网首屏视觉草案

- 目标:
  - 用“流动控制台”表达本地 Provider 切换、好友分享、市场发布三条路径。
  - 作为官网 `design.md` 的首屏落地参考。
- 方法候选:
  - HTML/CSS mockup 优先。
  - 可导出 PNG 用于评审。
- 输出格式:
  - `website/hero-mockup.html`
  - `website/hero-mockup.png`
- 覆盖策略:
  - 不修改项目官网代码。
  - 只生成静态评审稿。

### 3. README / OG 分享图

- 目标:
  - 适合 GitHub README、社媒链接预览和官网分享。
  - 主文案使用“让闲置的 Token 流动起来”。
- 方法候选:
  - HTML/CSS mockup。
- 输出格式:
  - `social/og-image.html`
  - `social/og-image.png`
  - `social/readme-header.png`
- 覆盖策略:
  - 不修改 README。
  - 先作为可选素材交付。

### 4. 三个流程插图

- 目标:
  - 自用切换: Provider / Token 切换。
  - 好友分享: 本地 Provider -> 受控分享通道 -> 好友使用。
  - 市场交易: 配置 -> 测试 -> 发布 -> 下单 -> 结算。
- 方法候选:
  - SVG 编程。
- 输出格式:
  - `illustrations/provider-switch-flow.svg`
  - `illustrations/buddy-share-flow.svg`
  - `illustrations/market-rail-flow.svg`
- 覆盖策略:
  - 不进入 app 代码，先做文档/官网素材。

### 5. 设计 token CSS 草案

- 目标:
  - 把色彩系统转为可实现变量，方便未来应用到 app 或官网。
- 方法候选:
  - 手写 CSS 变量。
- 输出格式:
  - `tokens/tokensbuddy-visual-tokens.css`
- 覆盖策略:
  - 不修改 `src/index.css`。
  - 先输出独立草案，后续再决定是否合并。

## 推荐暂缓

- 直接替换现有 App icon。
- 直接修改 app UI。
- 生成完整官网页面并接入代码。
- 生成吉祥物或人物插画。
- 生成抽象 AI 背景大图。

## 生成方法建议

| 资产 | 推荐方法 | 原因 |
| --- | --- | --- |
| Logo / App icon | SVG 编程 | 需要可编辑、可缩放、可小尺寸识别 |
| 官网首屏视觉 | HTML/CSS mockup | 容易复用到官网实现，也方便导出 PNG |
| OG / README 图 | HTML/CSS mockup | 文案和布局可控，适合多尺寸导出 |
| 流程插图 | SVG 编程 | 路径、节点、状态更精确 |
| 设计 token | CSS 文件 | 方便未来接入 Tailwind / CSS variables |

## 输出目录结构

```text
deliverables/tokens-buddy/generated/
  logo/
  icons/
  website/
  social/
  illustrations/
  tokens/
```

## 需要用户确认

进入实际生成前，请确认:

- 是否生成以上第一批 5 类资产。
- 是否全部输出到 `deliverables/tokens-buddy/generated/`。
- 是否明确不覆盖现有项目文件。
- 是否优先使用 SVG 编程 + HTML/CSS mockup，不优先使用 imagegen。
- 是否需要同时导出 PNG 预览图。

## 当前建议

建议确认第一批范围，先生成不覆盖项目代码的评审资产包。确认后再进入真正的资产生成与 QA。
