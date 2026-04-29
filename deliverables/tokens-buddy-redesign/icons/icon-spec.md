# TokensBuddy Icon 规范

## 图标系统目标

产品内图标要帮助用户理解 Token 的状态和路径，不增加装饰噪音。现有 lucide-react 可以继续作为基础图标库，品牌图形只在需要表达 TokensBuddy 自身或路由矩阵时出现。

## App Icon

- 方向: 路由矩阵主标记。
- 母版建议尺寸: 1024x1024。
- 小尺寸优化:
  - 16px / 20px: 只保留 3 个节点 + 1 条路径。
  - 32px: 可增加中央控制节点。
  - 128px 以上: 可增加轻微层次和背景。
- 背景:
  - 桌面 app icon 可使用深色圆角方形或浅色立体表面。
  - 避免透明背景导致系统 Dock / 任务栏中识别弱。

## 功能图标

| 功能 | 推荐图标语言 | 状态色 |
| --- | --- | --- |
| Provider 切换 | `RefreshCw` / 路由节点 | Matrix Blue |
| 本地代理 | `Network` / `Globe` | Matrix Blue / Route Cyan |
| 分享通道 | `Share2` / 链路节点 | Route Cyan / Health Emerald |
| 市场发布 | `Store` / 账本节点 | Ledger Amber |
| 用量 | `BarChart2` / 表格 | Matrix Blue |
| 健康检查 | `ShieldCheck` / 状态点 | Health Emerald |
| 停止分享 | `CircleStop` / `X` | Stop Red |
| 导入链接 | `Download` / 路由入口 | Route Cyan |

## 状态图标

- 运行中: 小绿点 + 文字，不使用大面积绿色背景。
- 连接中: 青色细线或旋转指示，不使用强闪烁。
- 警告: 琥珀描边和图标，不用橙色填满整张卡。
- 错误: 红色图标和短文案，保持明确。
- 停止: 红色，但按钮文案必须具体，如“停止分享通道”。

## 图标尺寸

- 工具栏图标: 16px。
- 按钮内图标: 16px。
- 列表项主图标: 20-24px。
- Provider 卡片图标: 24-32px。
- 空状态图标: 48-64px，使用轻量路由矩阵图形。

## 使用规则

- 产品内优先使用 lucide-react，保持现有技术栈。
- 品牌路由矩阵图形只用于 App icon、logo、空状态、分享/市场关键流程和官网图形。
- 不在每个按钮上重复品牌 mark。
- 不使用硬编码 emoji 作为核心 UI 图标。
- 图标必须有 tooltip 或 aria-label，尤其是 icon-only 按钮。

## 禁止方向

- 币种图标、钱包、金色 token、收益箭头。
- 过度复杂的网络节点图，尤其在 16px 下不可读的图形。
- 多彩渐变堆叠导致和 Provider icon 混淆。
