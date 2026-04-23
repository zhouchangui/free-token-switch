# Shared Provider Deep Link Design

**Date:** 2026-04-23

**Goal:** 为卖家分享场景增加“复制分享链接”能力，生成可被 CC Switch 自动识别的 `ccswitch://` provider 导入链接；接收方打开后先弹确认框，再从分享接口拉取模型列表，用户选择模型后导入为列表中的专用共享 provider。

## Context

当前分支已经具备：

- 卖家弹层 `ProviderSellerPopover`
- 卖家 token / 公网地址生成与持久化
- 现有 `ccswitch://v1/import?resource=provider...` deep link 解析与确认弹窗
- provider 导入与持久化链路

当前缺口：

- 无法把公网地址和 token 组织成“可被对方一键导入”的分享链接
- 现有 deeplink provider 导入不区分“普通 provider”与“共享 provider”
- 现有导入确认框不会在导入前验证模型列表

## User Requirements

- 协议继续使用 `ccswitch://...`
- 需要一个按钮复制公网地址和 token 信息
- 需要一个按钮生成分享链接
- 链接内直接带导入需要的信息
- 链接中包含 provider / app 类型信息
- 打开链接后先弹确认框，再导入
- 导入后只添加到列表，不自动启用
- 模型不应被分享方强制写死，只能作为推荐项
- 确认框里模型只能从接口拉取后选择
- 如果拉不到模型列表，就报错并终止导入

## Recommended Approach

推荐在现有 `provider` deeplink 协议上扩展“共享 provider”字段，而不是新增协议或全新资源类型。

原因：

- 最大程度复用现有 `ccswitch://` 解析、事件、确认框与导入逻辑
- 实现成本和风险最低
- 分享 provider 与普通 provider 的差异，主要是“导入前要做模型拉取校验”和“默认不启用”，不值得重造协议

## Deep Link Shape

分享按钮生成的链接仍使用：

```text
ccswitch://v1/import?resource=provider&...
```

新增 / 约定字段：

- `providerType=shared_seller`
- `shareMode=free` 或后续可扩展 `paid`
- `enabled=false`
- `model=<recommendedModel>`
- `requiresModelSelection=true`

完整字段建议：

- `resource=provider`
- `app=claude`
- `name=<provider display name>`
- `homepage=<original provider homepage>`
- `endpoint=<public tunnel url>`
- `apiKey=<seller access token>`
- `icon=<provider icon>`
- `notes=<friendly share note>`
- `enabled=false`
- `model=<recommended model>`
- `providerType=shared_seller`
- `shareMode=free`
- `requiresModelSelection=true`

## Share Buttons

在现有卖家弹层中新增两个动作：

1. `复制公网地址和令牌`
2. `复制分享链接`

行为：

- 若 `endpoint` 或 `accessToken` 缺失，则禁用复制分享链接按钮
- “复制公网地址和令牌”复制结构化文本，方便手工分享
- “复制分享链接”直接复制完整 `ccswitch://...` URL

## Import Confirmation Flow

### Entry

当接收方打开该链接时：

1. 现有 deep link 解析器照常解析成 `provider` request
2. 若检测到 `providerType=shared_seller`，进入共享 provider 确认逻辑

### Shared Provider Confirmation Rules

确认框需要：

- 展示 provider 名称、分享来源说明、公网地址
- 进入确认框后立即使用 `endpoint + apiKey` 拉取模型列表
- 若拉取失败：
  - 直接 toast/error
  - 不允许继续导入
- 若拉取成功：
  - 展示模型下拉框
  - 只能从拉取结果中选择，不允许自由输入
  - 若 deeplink 中提供了 `model` 且命中列表，则默认选中
  - 若未命中，则要求用户手动重新选择

## Imported Provider Result

导入后创建的 provider 应满足：

- `providerType=shared_seller`
- `enabled=false`（只加入列表）
- 使用分享链接中的 `endpoint`
- 使用分享链接中的 `apiKey`
- 使用确认框中最终选定的模型
- 保留图标、主页、备注等展示字段

用户后续自行点击“启用”后才会真正开始使用。

## Model Fetching

模型拉取使用当前已有的模型获取能力，而不是手写新请求流程。

要求：

- 以分享链接里的 `endpoint` 和 `apiKey` 构造临时 provider/config
- 复用现有获取模型列表的 API / service
- 仅当模型拉取成功时才允许导入

## Error Handling

- `endpoint` / `apiKey` 缺失：不生成分享链接
- 打开链接但字段不完整：走现有 deeplink parse/import error
- 模型拉取失败：提示“共享 provider 模型列表获取失败，无法导入”
- 推荐模型不存在：不报错，但要求用户重新选择
- 复制分享链接失败：toast 提示

## File Impact

预计涉及：

- `src/components/providers/ProviderSellerPopover.tsx`
- `src/components/providers/__tests__/ProviderSellerPopover.test.tsx`
- `src/lib/api/deeplink.ts`
- `src/components/DeepLinkImportDialog.tsx`
- `src-tauri/src/deeplink/parser.rs`
- `src-tauri/src/deeplink/provider.rs`
- `src-tauri/src/deeplink/tests.rs`
- `src/i18n/locales/zh.json`
- `src/i18n/locales/en.json`
- `src/i18n/locales/ja.json`

可新增：

- `src/components/deeplink/SharedProviderConfirmation.tsx`

## Testing Strategy

### Frontend

- 卖家弹层在 `endpoint + accessToken` 存在时显示分享链接按钮
- 复制分享链接生成正确的 `ccswitch://...` URL
- 共享 provider 确认框会触发模型拉取
- 模型拉取失败时阻止导入
- 模型只能从列表中选择

### Backend / Parsing

- 新字段能被 deeplink parser 正确解析
- 共享 provider 导入仍走 `resource=provider` 主路径
- 最终 provider 持久化时保留共享标识与选择后的模型

## Open Decisions Resolved

- 协议名：继续使用 `ccswitch://`
- 导入后行为：只加入列表，不自动启用
- 模型策略：推荐模型默认写入，但用户可改
- 模型输入限制：只能从拉取列表中选择
- 拉取失败策略：直接报错，不允许导入
