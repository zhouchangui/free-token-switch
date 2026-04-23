# Provider Seller Popover Design

**Date:** 2026-04-23

**Goal:** 在供应商卡片动作区新增“出售闲置 token”入口，使用就地轻量弹层配置每个供应商的售卖状态、免费分享与定价方式，并复用现有 P2P market 基础能力。

## Context

当前仓库已经具备独立的 `MarketPanel` 页面，以及后端 `start_cloudflare_tunnel`、`start_selling_tokens`、`find_ai_sellers` 等命令，但卖家能力仅存在于独立页面中，没有嵌入到供应商卡片的主工作流里。

用户希望：

- 每个供应商卡片都显示售卖入口
- 每个供应商都可以独立开启售卖
- 配置方式为卡片内就地弹出的轻量面板，而不是跳转页面
- 去掉“销售比例”字段
- 定价支持两种模式：免费、手动定价
- 可选开启“接受付费定价服务”，用于获取平台/第三方建议价格并一键采用
- 免费模式下展示可复制的调用地址与访问 token

## Non-Goals

- 不在本轮设计中实现完整的卖家订单管理页
- 不在本轮设计中实现多租户权限、结算历史或收益报表
- 不重做独立 `MarketPanel` 的买家列表体验
- 不在本轮引入复杂的多 tunnel 进程管理或定时刷新策略

## Recommended Approach

推荐采用“卡片按钮 + Popover 轻面板 + 每供应商独立元数据”的方案。

原因：

- 最贴近用户提供的交互草图
- 进入路径最短，不打断主界面供应商管理流
- 能直接复用已有 market 后端命令
- UI 范围集中在 `ProviderActions` 与供应商元数据扩展，改动边界清晰

## UI Design

### Action Button

在 `src/components/providers/ProviderActions.tsx` 的图标按钮区新增一个售卖按钮：

- 所有供应商卡片都显示
- 默认态使用 `ghost` 风格
- 售卖中高亮显示，并通过 tooltip/title 呈现“售卖中”
- 点击后打开就地 `Popover`

图标建议优先使用 `Store`，与现有 `MarketPanel` 语义一致。

### Popover Content

弹层保持轻量，只包含当前决策所需字段：

1. `开启售卖`
2. `免费提供`
3. `价格（Sats / 1k tokens）`
4. `接受付费定价服务`
5. `获取建议价`
6. `一键采用建议价`
7. `调用地址`
8. `访问 token`
9. `复制地址`
10. `复制 token`
11. `复制完整接入信息`

交互规则：

- 当 `免费提供 = true` 时，价格输入禁用并显示为 `0`
- 当 `免费提供 = false` 时，允许输入手动价格
- 当 `接受付费定价服务 = true` 时，显示“获取建议价”和“采用建议价”
- 当尚未开启售卖时，复制区隐藏
- 当免费模式成功开启后，复制区显示地址和 token
- 当付费模式成功开启后，复制区可继续显示地址和 token，便于卖家自测或手工分发

### Status Feedback

按钮和弹层内都需要有明确状态：

- `idle`：未开启
- `starting`：正在启动 tunnel / 广播
- `active_free`：免费分享中
- `active_paid`：付费售卖中
- `error`：最近一次启动或刷新失败

按钮只显示浓缩状态，详细错误信息放到弹层底部。

## Data Model

在前端 `ProviderMeta` 下新增一组 seller 元数据，按供应商持久化：

```ts
interface ProviderSellerConfig {
  enabled?: boolean;
  mode?: "free" | "paid";
  pricePer1kTokens?: number;
  acceptsSuggestedPricing?: boolean;
  suggestedPricePer1kTokens?: number | null;
  endpoint?: string;
  accessToken?: string;
  status?: "idle" | "starting" | "active_free" | "active_paid" | "error";
  lastError?: string | null;
  lastPublishedAt?: number | null;
}
```

挂载位置：

```ts
interface ProviderMeta {
  sellerConfig?: ProviderSellerConfig;
}
```

设计原则：

- 这是供应商级别的 UI/业务状态，不属于全局 `settings`
- 使用 provider 元数据可与现有卡片、编辑、切换流自然集成
- `endpoint` 和 `accessToken` 存在元数据中，方便重开应用后继续展示

## Backend Design

### Current Backend Reuse

直接复用现有命令：

- `start_cloudflare_tunnel`
- `start_selling_tokens`

### Required Additions

为支持卡片级售卖与免费分享，需要新增最小后端能力：

1. `stop_selling_tokens(providerId)`
2. `generate_seller_access_token(providerId)`
3. `get_suggested_seller_price(providerId)`，第一版允许返回 mock/固定建议价

约束：

- 第一版允许 market service 只维护单个 tunnel 进程，但前端要明确提示“当前版本多个供应商同时售卖时复用同一出口地址”
- `accessToken` 必须是单独生成的分发凭证，不能复用原始 API key
- `stop_selling_tokens` 至少要更新前端可感知状态；即使后端暂时不能真正撤回 Nostr 广播，也要让本地分享失效

## Data Flow

### Enable Selling

1. 用户点击售卖按钮，打开 Popover
2. 用户选择免费或付费模式，并填写价格或启用建议价能力
3. 用户点击开启售卖
4. 前端将 `sellerConfig.status` 置为 `starting`
5. 若本地无 `accessToken`，先调用 `generate_seller_access_token`
6. 若本地无 `endpoint`，调用 `start_cloudflare_tunnel`
7. 组织当前 provider 的 model / endpoint / price 信息，调用 `start_selling_tokens`
8. 成功后更新 `sellerConfig` 为 `active_free` 或 `active_paid`
9. 刷新卡片按钮状态与 Popover 展示

### Disable Selling

1. 用户关闭售卖开关
2. 前端调用 `stop_selling_tokens(providerId)`
3. 成功后保留 `endpoint` 和 `accessToken` 以便复制历史信息，或在 UI 上标记为已停用
4. `status` 回到 `idle`

### Suggested Pricing

1. 用户勾选“接受付费定价服务”
2. 用户点击“获取建议价”
3. 前端调用 `get_suggested_seller_price(providerId)`
4. 返回结果写入 `suggestedPricePer1kTokens`
5. 用户点击“一键采用建议价”后，将建议价写入 `pricePer1kTokens`

## Error Handling

- `cloudflared` 未安装：在弹层中显示明确提示，不切到 active 状态
- tunnel 获取地址失败：保留草稿设置，显示错误
- 广播失败：保留 token 和已填写价格，允许重试
- 建议价获取失败：不影响手动定价和免费模式
- 复制失败：用 toast 提示，不改变配置状态
- 供应商缺少可识别模型名时：禁止开启并提示先补全必要信息

## Testing Strategy

### Frontend

- `ProviderActions` 新按钮显隐与状态样式
- Popover 中免费/付费切换后的字段禁用关系
- 建议价获取与一键采用行为
- 免费模式开启后复制区显示
- 启动失败后的错误态回显

### Data Persistence

- `sellerConfig` 写入 provider 元数据后可重新读取
- 不影响已有 provider meta 字段

### Backend

- `generate_seller_access_token` 返回稳定结构
- `stop_selling_tokens` 可被调用且返回成功状态
- `get_suggested_seller_price` 返回合法数值

## File Impact

预计涉及这些文件：

- `src/types.ts`
- `src/components/providers/ProviderActions.tsx`
- `src/components/providers/ProviderCard.tsx`
- `src/hooks/useProviderActions.ts`
- `src/lib/api/providers.ts` 或对应 provider API 封装
- `src/i18n/locales/zh.json`
- `src/i18n/locales/en.json`
- `src/i18n/locales/ja.json`
- `src-tauri/src/commands/market.rs`
- `src-tauri/src/services/market.rs`

可新增文件：

- `src/components/providers/ProviderSellerPopover.tsx`
- `src/lib/api/market.ts`

## Open Decisions Resolved

- 销售比例：取消，不进入实现
- 售卖入口范围：每个供应商卡片都显示
- 面板形式：就地 Popover
- 免费模式：展示可复制的调用地址与访问 token
- 建议价服务：由平台/第三方生成建议价，用户可一键采用

## Delivery Slice

建议按单个最小可用切片交付：

1. 卡片按钮与 Popover UI
2. `sellerConfig` 前端持久化
3. 免费模式开启 + 地址/token 展示与复制
4. 付费模式开启 + 手动价格
5. 建议价获取与采用
6. 关闭售卖与错误处理补齐
