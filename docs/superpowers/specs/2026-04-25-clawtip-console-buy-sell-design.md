# ClawTip 独立买卖测试模块设计

**日期：** 2026-04-25
**范围：** P2-0 ClawTip 独立测试模块
**目标：** 在不接入现有市场 UI、Cloudflare tunnel 和真实 LLM provider 的前提下，通过 console 独立跑通“卖家上架、发布到 relay 市场、买家从 relay 发现并购买、ClawTip 真实支付、支付凭证校验、模拟 LLM 调用、幂等履约”的完整闭环。

## 背景和结论

ClawTip 文档给了三阶段订单文件协议作为接入参考，但 TokensBuddy 是独立项目，不绑定第三方 skill 运行时：

1. TokensBuddy seller 创建订单，并把订单 JSON 写到自己的本地状态目录：`~/.tokens-buddy/clawtip-console/orders/{indicator}/{order_no}.json`。
2. 买家通过 ClawTip 支付流程支付，支付流程读取订单参数，并把 `payCredential` 写回同一个订单记录。
3. 开发者服务读取 `payCredential`，用商家 `sm4key` 解密，校验 `orderNo`、`amount`、`payTo`、`payStatus` 后，再决定是否履约。

本模块采用 **Rust 核心服务 + console 二进制 + relay 市场适配器 + ClawTip 订单文件兼容层**。推荐这个方案，是因为订单、凭证、幂等履约、relay listing、状态机、单席位锁后续都要接入 Tauri、proxy 和 market；核心如果先写在 Rust service 中，console 只是调用入口，后续集成成本最低。

## 方案选择

### 方案 A：只写 Node/Python console 脚本

优点是最快，贴近 ClawTip 技能模板。缺点是支付校验、订单状态、幂等履约后续还要在 Rust 中重写，容易出现测试模块通过但真实集成走另一套逻辑。

### 方案 B：Rust 核心服务 + console 二进制 + relay 适配器（已确认）

优点是 console 测试、relay 市场发布、Tauri 命令、proxy 集成都复用同一套核心逻辑；真实支付校验、SM4 解密、订单状态机、relay listing 状态和履约记录不会分叉。缺点是第一步需要补一个 Rust console 入口、relay 适配器和少量配置/存储结构。

### 方案 C：直接做 ClawTip Skill 示例包

优点是最贴近 ClawTip 文档示例。缺点是对我们当前目标过早绑定第三方 skill runner，不利于先验证 TokensBuddy seller 端真实收款、凭证校验和后续 market/proxy 集成。

**已确认方案：** 方案 B。P2-0 只兼容 ClawTip 支付协议和订单字段，不依赖第三方 skill 运行时；relay 发布/发现必须走现有 market 使用的 Nostr `kind 31990` 方向，避免测试模块和后续真实市场分裂。

## 决策记录

- 用户确认采用方案 B：Rust 核心服务 + console 二进制 + relay 适配器。
- 订单文件目录使用 TokensBuddy 本地状态目录：`~/.tokens-buddy/clawtip-console/orders/{indicator}/{order_no}.json`。
- P2-0 必须包含 relay 市场发布、发现和状态更新，LLM 调用可以继续模拟。
- 过程日志是第一版验收项，不能只靠最终状态判断交易链路是否跑通。
- 当前 P2-0 console 默认使用本地 JSON relay registry 和本地 JSON fulfillment store，保证自动化闭环稳定；公开 Nostr relay 使用显式 `--real-relay`，避免测试过程向公共 relay 写入事件。
- HTTP seller 服务和 SQLite 是后续集成层，不阻塞本阶段 console 真实支付验证。

## 第一版边界

### 包含

- 独立 console 流程，不依赖现有市场 UI。
- 本地 seller 配置文件，支持真实 `payTo` 和 `sm4key`。
- relay-compatible listing 发布、查询和状态更新；默认写入本地 JSON relay registry，显式传 `--real-relay` 时连接 Nostr relay。
- 本地 listing registry 用于 P2-0 自动化测试、缓存、调试和离线回放；真实公开 relay 验证需要用户确认 relay 列表后执行。
- 真实 ClawTip 订单文件生成，字段兼容官方文档。
- 真实 `clawtip` 支付后，从订单文件读取 `payCredential`。
- seller 端用 `sm4key` 解密并校验支付凭证。
- 模拟 LLM 流式调用，不请求真实上游模型。
- 订单文件、调用、履约记录落本地 JSON store，保证重复调用不重复履约；SQLite 留给 Tauri/market 正式集成时再统一迁移。
- mock pay 模式仅用于自动化测试，不作为真实交易路径。

### 不包含

- 不启动 cloudflared tunnel。
- 不调用真实 LLM provider。
- 不复用好友分享 token。
- 不做前端 UI。
- 不在仓库内保存真实 `payTo` 或 `sm4key`。

## 配置设计

真实配置保存在用户本机，不进入 git：

```text
~/.tokens-buddy/clawtip-market.toml
```

推荐内容：

```toml
[clawtip]
mode = "production"
payment_provider = "clawtip"
pay_to = "env:CLAWTIP_PAY_TO"
sm4_key_base64 = "env:CLAWTIP_SM4_KEY"
skill_slug = "tokens-buddy-llm-console"
skill_id = "si-tokens-buddy-llm-console"
description = "TokensBuddy LLM console test call"
resource_url = "http://127.0.0.1:37891"
order_ttl_seconds = 600
credential_max_age_seconds = 1800

[seller]
seller_id = "local-seller"
listing_id = "local-mock-llm"
model_id = "mock-llm"
amount_fen = 1
capacity = 1
max_output_tokens = 256

[storage]
database_path = "~/.tokens-buddy/clawtip-console/clawtip.db"
market_dir = "~/.tokens-buddy/clawtip-console/market"
orders_dir = "~/.tokens-buddy/clawtip-console/orders"

[relay]
enabled = true
event_kind = 31990
relays = [
  "wss://relay.damus.io",
  "wss://nos.lol"
]
private_key = "auto"
publish_timeout_seconds = 8
fetch_timeout_seconds = 5

[mock_llm]
chunk_delay_ms = 120
input_tokens = 32
output_tokens = 64
chunks = [
  "这是一次模拟 LLM 调用。",
  "支付凭证已校验通过。",
  "本次履约完成。"
]
```

配置规则：

- `pay_to` 可以直接填值，也可以使用 `env:CLAWTIP_PAY_TO` 引用环境变量。
- `sm4_key_base64` 必须优先使用环境变量引用；如果用户坚持写入配置文件，文件权限必须收紧到当前用户可读写。
- `skill_slug` 用于计算 ClawTip `indicator = md5(skill_slug)`，一旦真实测试通过就不要随意改。
- `amount_fen` 是 ClawTip 第一版测试商品金额，单位是人民币分。模型按 token 计价会在 P2B/P2 集成时映射到单次调用预付金额。
- `resource_url` 第一版指向 seller console 服务。单机测试可以是 `http://127.0.0.1:37891`；跨机器 relay 测试必须由用户提供可访问 endpoint。P2-0 不负责启动 tunnel，但 listing 字段、发布流程和状态更新必须按真实 relay 市场设计。
- `relay.private_key = "auto"` 表示本地生成并持久化 seller 市场身份。后续接入应用时可迁移到统一市场密钥管理。

仓库只提供示例配置：

```text
docs/examples/clawtip-market.example.toml
```

示例配置只能包含占位符，不能包含真实 `payTo`、`sm4key`、支付凭证或含密 URL。

## Console 命令设计

统一入口：

```bash
pnpm clawtip:console -- <subcommand>
```

底层执行：

```bash
cargo run --manifest-path src-tauri/Cargo.toml --bin clawtip-console -- <subcommand>
```

### 卖家命令

```bash
pnpm clawtip:console -- seller init-config \
  --pay-to env:CLAWTIP_PAY_TO \
  --sm4-key env:CLAWTIP_SM4_KEY
```

创建 `~/.tokens-buddy/clawtip-market.toml`，不打印密钥原文。

```bash
pnpm clawtip:console -- seller serve --port 37891
```

后续 P2-1 命令：启动本地 seller HTTP 服务，用于创建订单、校验支付凭证和模拟 LLM 调用。P2-0 console 闭环直接调用 Rust service，不依赖 HTTP 服务。

```bash
pnpm clawtip:console -- seller publish \
  --model mock-llm \
  --amount-fen 1 \
  --endpoint http://127.0.0.1:37891
```

发布 relay listing，状态为 `available`，并把同一份 listing 写入本地 registry 作为缓存。该命令必须返回 relay event id、seller pubkey、listing id 和 endpoint。

```bash
pnpm clawtip:console -- seller unpublish --listing-id local-mock-llm
```

发布 `offline` 状态覆盖 listing，用于模拟下架。

```bash
pnpm clawtip:console -- seller status
pnpm clawtip:console -- seller orders
pnpm clawtip:console -- seller order <order_no>
pnpm clawtip:console -- seller relays
```

查看 relay 连接状态、listing、订单、支付和履约状态。

### 买家命令

```bash
pnpm clawtip:console -- buyer list
```

默认从本地 relay registry 读取 listing；传 `--real-relay` 后从 Nostr relay 拉取 `kind 31990` listing，过滤出 ClawTip console listing，展示可购买模型、金额、seller、状态和 endpoint。

```bash
pnpm clawtip:console -- buyer buy \
  --listing-id local-mock-llm \
  --prompt "测试一次模型调用"
```

从 relay listing 读取 seller endpoint，调用 seller 的 create-order 逻辑，生成订单，并把订单文件写入：

```text
~/.tokens-buddy/clawtip-console/orders/{indicator}/{order_no}.json
```

成功输出必须兼容 ClawTip 文档：

```text
ORDER_NO=<order_no>
AMOUNT=<amount_fen>
QUESTION=<prompt>
INDICATOR=<md5(skill_slug)>
ORDER_FILE=<absolute_path>
PAYMENT_PROVIDER=clawtip
```

此时买家需要通过 ClawTip 支付流程完成真实支付。P2-0 先由 console 输出清晰的 `order_no + indicator + order_file`；等确认 ClawTip 可调用 API/CLI 后，再封装成 `buyer pay`。

```bash
pnpm clawtip:console -- buyer wait-payment --order-no <order_no>
```

轮询订单文件，直到发现 `payCredential` 或超时。

```bash
pnpm clawtip:console -- buyer call --order-no <order_no> --stream
```

读取订单文件里的 `payCredential`，调用 seller 的 service-result/inference 逻辑。seller 校验成功后返回模拟流式片段，并写入履约记录。

### 开发测试命令

```bash
pnpm clawtip:console -- dev mock-pay --order-no <order_no> --status SUCCESS
```

仅用于自动化测试：用本地 `sm4key` 生成一个形状等同 ClawTip 的 `payCredential` 并写回订单文件。真实交易验收不能使用该命令。

## 卖家流程

### 1. 配置收款参数

卖家提供 `payTo` 和 `sm4key`。模块把它们写入本地配置或环境变量引用。日志只允许打印：

- `payTo` 的前后脱敏片段。
- `sm4key` 是否存在、长度是否合法。
- 配置文件路径。

不得打印完整 `payTo`、`sm4key`、`payCredential`、`encrypted_data`。

### 2. 启动 seller 本地服务（P2-1）

`seller serve` 是后续 HTTP 集成命令。P2-0 console 直接调用 Rust service；到 P2-1 时，该 HTTP 服务提供三个能力：

- 创建订单。
- 校验支付凭证并发放一次调用权限。
- 模拟 LLM 流式调用并记录履约。

### 3. 上架/发布测试商品到 relay

`seller publish` 将 listing 发布到 relay。第一版 listing 是单商品、单模型、固定金额；content 必须保留现有 `MarketListing` 能读取的字段，并增加状态、容量、支付策略和 ClawTip 元信息：

```json
{
  "provider_id": "local-mock-llm",
  "model_name": "mock-llm",
  "price_per_1k_tokens": 1,
  "endpoint": "http://127.0.0.1:37891",
  "seller_pubkey": "<nostr-pubkey>",
  "timestamp": 1777111200,
  "modelPrices": [],
  "priceUnit": "PER_CALL",
  "priceVersion": 1,
  "listingId": "local-mock-llm",
  "sellerId": "local-seller",
  "modelId": "mock-llm",
  "amountFen": 1,
  "status": "available",
  "capacity": 1,
  "streaming": true,
  "payment": {
    "provider": "clawtip",
    "mode": "per_call_prepaid",
    "amountFen": 1,
    "currency": "CNY_FEN",
    "skillSlug": "tokens-buddy-llm-console",
    "indicator": "<md5-skill-slug>"
  },
  "resourceUrl": "http://127.0.0.1:37891",
  "createdAt": "2026-04-25T00:00:00Z",
  "updatedAt": "2026-04-25T00:00:00Z"
}
```

relay event 使用现有市场方向：

- event kind：`31990`。
- event content：listing JSON，必须兼容现有 `MarketListing` 的 `provider_id`、`model_name`、`price_per_1k_tokens`、`endpoint`、`seller_pubkey`、`timestamp`、`modelPrices`、`priceUnit`、`priceVersion` 字段。
- tags：至少包含 `["d", listingId]`、`["status", status]`、`["model", modelId]`、`["payment", "clawtip"]`。
- seller pubkey：由本地 relay identity 签名产生。
- 发布成功后，本地 registry 记录 event id、relay URLs、发布状态和最后发布时间。

状态更新也必须通过 relay 发布：

- `seller publish`：发布 `available`。
- 买家创建订单后：发布 `reserved`。
- 支付成功并开始模拟推理后：发布 `busy`。
- 调用完成后：发布 `available`。
- `seller unpublish` 或停止服务：发布 `offline`。

### 4. 创建订单

买家购买时，seller 生成 `orderNo`，落库订单，并返回 ClawTip 所需字段：

- `orderNo`：不超过 32 字符。
- `amount`：人民币分，正整数。
- `payTo`：卖家收款服务 ID。
- `encryptedData`：SM4 加密后的 `{ "orderNo", "amount", "payTo" }` JSON。

同时 buyer 侧写入订单文件，字段兼容 ClawTip 文档：

```json
{
  "skill-id": "si-tokens-buddy-llm-console",
  "order_no": "20260425183000123456",
  "amount": 1,
  "question": "测试一次模型调用",
  "encrypted_data": "<redacted>",
  "pay_to": "<redacted>",
  "description": "TokensBuddy LLM console test call",
  "slug": "tokens-buddy-llm-console",
  "resource_url": "http://127.0.0.1:37891"
}
```

### 5. 校验支付凭证

支付完成后，ClawTip 将 `payCredential` 写回订单文件。seller 端校验步骤：

1. 用 `sm4key` 解密 `payCredential`。
2. JSON 解析得到 `orderNo`、`amount`、`payTo`、`payStatus`，以及可选的 `finishTime`。
3. 校验 `payStatus == SUCCESS`。
4. 校验 `orderNo` 与本地订单一致。
5. 校验 `amount` 与本地订单金额一致。
6. 校验 `payTo` 与 seller 配置一致。
7. 校验订单未过期。
8. 校验订单未履约。
9. 将订单状态更新为 `paid`。
10. 创建一次调用会话并进入 `fulfilling`。

### 6. 履约和记录

seller 返回模拟 LLM 流式片段，结束后写入：

- 调用开始/结束时间。
- input/output token 模拟用量。
- 订单金额。
- 调用状态。
- 是否已履约。

重复调用同一订单时，不再次扣权益。第一版可以返回历史结果，并明确 `alreadyFulfilled=true`。

## 买家流程

### 1. 从 relay 发现 listing

买家执行 `buyer list`，从配置中的 relay 拉取 `kind 31990` 事件，过滤 `payment.provider == "clawtip"`、`status == "available"`、`capacity == 1` 的 listing。买家展示 relay event id、seller pubkey、model、金额和 endpoint。

### 2. 购买并生成订单

买家执行 `buyer buy`。该命令会：

1. 从 relay 读取 listing。
2. 调用 seller create-order。
3. 计算 `indicator = md5(skill_slug)`。
4. 把订单 JSON 写入 TokensBuddy 本地订单目录。
5. 打印 `ORDER_NO`、`AMOUNT`、`QUESTION`、`INDICATOR`。

### 3. 使用 ClawTip 完成真实支付

买家通过 ClawTip 支付流程提交订单标识，核心参数为：

```json
{
  "order_no": "<ORDER_NO>",
  "indicator": "<INDICATOR>"
}
```

ClawTip 支付流程完成从买家钱包到卖家 `payTo` 的交易，并把 `payCredential` 写回订单记录或返回给 TokensBuddy。

### 4. 等待支付凭证

买家执行 `buyer wait-payment`，console 轮询订单文件。发现 `payCredential` 后，显示脱敏摘要和下一步调用命令。

### 5. 调用模拟 LLM

买家执行 `buyer call --stream`。该命令读取订单文件中的 `question` 和 `payCredential`，把它们交给 seller 端。seller 校验支付成功后返回模拟流式响应。

## HTTP 接口设计（P2-1 预留）

P2-0 console 已经直接调用 Rust service；HTTP 接口保留给后续接入 tunnel 和 market buyer。到 P2-1 时，relay listing 的 `endpoint` 必须指向这些 HTTP 接口所在服务。

### `POST /api/clawtip/create-order`

请求：

```json
{
  "listingId": "local-mock-llm",
  "relayEventId": "<event-id>",
  "sellerPubkey": "<nostr-pubkey>",
  "buyerId": "local-buyer",
  "modelId": "mock-llm",
  "prompt": "测试一次模型调用",
  "clientIp": "127.0.0.1"
}
```

响应：

```json
{
  "responseCode": "200",
  "responseMessage": "Success",
  "orderNo": "20260425183000123456",
  "amount": 1,
  "payTo": "<redacted in logs only>",
  "encryptedData": "<sm4-base64>",
  "indicator": "<md5-slug>",
  "slug": "tokens-buddy-llm-console",
  "resourceUrl": "http://127.0.0.1:37891"
}
```

错误响应仍使用 `responseCode`，方便兼容 ClawTip 示例脚本。

### `POST /api/clawtip/service-result`

请求：

```json
{
  "orderNo": "20260425183000123456",
  "credential": "<payCredential>",
  "question": "测试一次模型调用"
}
```

响应：

```json
{
  "responseCode": "200",
  "responseMessage": "Success",
  "payStatus": "SUCCESS",
  "alreadyFulfilled": false,
  "callSessionId": "call_...",
  "answer": "这是一次模拟 LLM 调用。支付凭证已校验通过。本次履约完成。",
  "usage": {
    "inputTokens": 32,
    "outputTokens": 64,
    "totalTokens": 96
  }
}
```

### `GET /api/clawtip/orders/:orderNo`

返回订单状态、支付状态、履约状态和脱敏后的 credential 摘要，用于 console status。

### `POST /api/clawtip/inference-stream`

第一版可选。如果实现流式调用，使用 SSE：

```text
event: delta
data: {"text":"这是一次模拟 LLM 调用。"}

event: delta
data: {"text":"支付凭证已校验通过。"}

event: done
data: {"usage":{"inputTokens":32,"outputTokens":64,"totalTokens":96}}
```

## Rust 模块设计

建议文件：

```text
src-tauri/src/services/clawtip/
  mod.rs
  config.rs
  crypto.rs
  order_file.rs
  relay.rs
  listing.rs
  order.rs
  credential.rs
  fulfillment.rs
  mock_llm.rs
  http.rs

src-tauri/src/bin/clawtip-console.rs
```

职责：

- `config.rs`：读取/写入 `~/.tokens-buddy/clawtip-market.toml`，解析 `env:` 引用。
- `crypto.rs`：SM4 加密/解密，匹配 ClawTip 文档中的 Hutool `SmUtil.sm4(keyBytes)` 行为。
- `order_file.rs`：读写 `~/.tokens-buddy/clawtip-console/orders/{indicator}/{order_no}.json`。
- `relay.rs`：连接 relay、签名并发布 `kind 31990` listing、查询 listing、发布状态更新。
- `listing.rs`：listing 数据结构、本地缓存、上架、下架、状态查询。
- `order.rs`：订单创建、订单状态机、过期处理。
- `credential.rs`：解密和校验 `payCredential`。
- `fulfillment.rs`：幂等履约、调用会话、重复请求处理。
- `mock_llm.rs`：模拟流式响应和 token 用量。
- `http.rs`：本地 seller HTTP 服务。
- `clawtip-console.rs`：命令行解析和输出。

SM4 兼容要求：

- `sm4key` 从 Base64 解码后必须是 16 字节。
- 加密明文为紧凑 JSON：`{"orderNo":"...","amount":"1","payTo":"..."}` 或等价字段。
- 密文为 Base64 字符串。
- 需要用 `clawtip-sandbox` 或真实 `clawtip` 回写的 `payCredential` 做一次解密验收，确认 Rust 实现与 ClawTip/Hutool 模式一致。

## 数据结构

### Listing

```rust
pub struct ClawtipListing {
    pub listing_id: String,
    pub relay_event_id: Option<String>,
    pub seller_id: String,
    pub seller_pubkey: String,
    pub model_id: String,
    pub amount_fen: i64,
    pub status: ListingStatus,
    pub capacity: u32,
    pub payment_provider: String,
    pub payment_mode: String,
    pub price_unit: String,
    pub price_version: u32,
    pub resource_url: String,
    pub relay_urls: Vec<String>,
    pub created_at: i64,
    pub updated_at: i64,
}
```

### Order

```rust
pub struct ClawtipOrder {
    pub order_no: String,
    pub listing_id: String,
    pub relay_event_id: Option<String>,
    pub seller_pubkey: Option<String>,
    pub buyer_id: Option<String>,
    pub model_id: String,
    pub prompt_hash: String,
    pub amount_fen: i64,
    pub pay_to_hash: String,
    pub status: OrderStatus,
    pub pay_status: Option<String>,
    pub credential_hash: Option<String>,
    pub finish_time: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
    pub expires_at: i64,
}
```

### Payment Credential Plaintext

```rust
pub struct ClawtipPaymentCredential {
    pub order_no: String,
    pub amount: String,
    pub pay_to: String,
    pub pay_status: String,
    pub finish_time: Option<String>,
}
```

### Fulfillment

```rust
pub struct ClawtipFulfillment {
    pub fulfillment_id: String,
    pub order_no: String,
    pub call_session_id: String,
    pub status: FulfillmentStatus,
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub amount_fen: i64,
    pub result_hash: String,
    pub started_at: i64,
    pub completed_at: Option<i64>,
}
```

## 状态机

### Listing 状态

```text
draft -> available -> reserved -> busy -> available
                   \-> offline
```

P2-0 第一版必须发布 `available/offline`，并在购买、支付、调用阶段发布 `reserved/busy/available` 状态更新。这样后续 P2B 单席位调度可以直接复用同一套状态流转。

### Order 状态

```text
created -> order_file_written -> pending_payment -> paid -> fulfilling -> fulfilled
                                     |              |        |
                                     |              |        -> failed
                                     |              -> payment_failed
                                     -> expired
```

### 幂等规则

- 同一 `order_no` 只能创建一条本地订单。
- 同一 `payCredential` 只保存 hash，不保存明文。
- 同一订单 `fulfilled` 后再次 `buyer call` 不再次生成履约，不再次计算收益。
- 第一版可返回历史结果；后续接真实流式 provider 时，需要返回“已履约”或重放缓存结果，不能重新调用上游。

## Console 端到端验收流程

### 真实交易路径

```bash
export CLAWTIP_PAY_TO="你的收款服务ID"
export CLAWTIP_SM4_KEY="你的 sm4key"

pnpm clawtip:console -- seller init-config \
  --pay-to env:CLAWTIP_PAY_TO \
  --sm4-key env:CLAWTIP_SM4_KEY

pnpm clawtip:console -- seller publish \
  --model mock-llm \
  --amount-fen 1 \
  --endpoint http://127.0.0.1:37891

pnpm clawtip:console -- buyer list

pnpm clawtip:console -- buyer buy \
  --listing-id local-mock-llm \
  --prompt "测试一次模型调用" \
  --amount-fen 1 \
  --pay-to "$CLAWTIP_PAY_TO"
```

然后通过 ClawTip 支付流程提交订单：

```json
{
  "order_no": "<ORDER_NO>",
  "indicator": "<INDICATOR>"
}
```

支付完成后：

```bash
pnpm clawtip:console -- buyer wait-payment --order-no <ORDER_NO>
pnpm clawtip:console -- buyer call --order-no <ORDER_NO> --stream
pnpm clawtip:console -- seller order --order-no <ORDER_NO>
pnpm clawtip:console -- seller status
```

通过标准：

- relay 上能拉取到当前 seller 发布的 `available` listing。
- listing 包含 `capacity=1`、`payment.provider=clawtip`、`endpoint`、`status` 和 seller pubkey。
- 订单文件存在且字段完整。
- ClawTip 能识别订单文件并完成支付。
- `payCredential` 被写回订单文件。
- seller 能解密 `payCredential`。
- seller 校验 `orderNo/amount/payTo/payStatus` 通过。
- 模拟 LLM 返回流式片段。
- 订单状态变为 `fulfilled`。
- relay listing 在调用期间变为 `reserved/busy`，调用结束后回到 `available`。
- 重复 `buyer call` 不会重复履约。

### 自动化测试路径

```bash
tmp_dir="$(mktemp -d)"
relay_store="$tmp_dir/listings.json"
orders_dir="$tmp_dir/orders"
fulfillment_store="$tmp_dir/fulfillments.json"
sm4_key="MDEyMzQ1Njc4OUFCQ0RFRg=="

pnpm clawtip:console -- seller publish \
  --model mock-llm \
  --amount-fen 1 \
  --endpoint http://127.0.0.1:37891 \
  --relay-store "$relay_store"

pnpm clawtip:console -- buyer list --relay-store "$relay_store"

pnpm clawtip:console -- buyer buy \
  --listing-id local-mock-llm \
  --prompt "自动化测试" \
  --amount-fen 1 \
  --pay-to payto_1234567890abcdef \
  --sm4-key-base64 "$sm4_key" \
  --indicator dev-indicator \
  --order-no 202604250001 \
  --orders-dir "$orders_dir" \
  --relay-store "$relay_store"

pnpm clawtip:console -- dev mock-pay \
  --order-no 202604250001 \
  --indicator dev-indicator \
  --orders-dir "$orders_dir" \
  --sm4-key-base64 "$sm4_key" \
  --status SUCCESS

pnpm clawtip:console -- buyer wait-payment \
  --order-no 202604250001 \
  --indicator dev-indicator \
  --orders-dir "$orders_dir" \
  --timeout-ms 1000

pnpm clawtip:console -- buyer call \
  --order-no 202604250001 \
  --indicator dev-indicator \
  --orders-dir "$orders_dir" \
  --sm4-key-base64 "$sm4_key" \
  --fulfillment-store "$fulfillment_store" \
  --listing-id local-mock-llm \
  --relay-store "$relay_store" \
  --stream

pnpm clawtip:console -- seller order \
  --order-no 202604250001 \
  --indicator dev-indicator \
  --orders-dir "$orders_dir" \
  --sm4-key-base64 "$sm4_key" \
  --fulfillment-store "$fulfillment_store"

pnpm clawtip:console -- seller status \
  --orders-dir "$orders_dir" \
  --relay-store "$relay_store" \
  --fulfillment-store "$fulfillment_store"
```

自动化测试只证明订单状态、SM4 实现、凭证校验、幂等履约和模拟调用逻辑正确，不证明真实资金交易成功。

relay 自动化测试可使用本地 fake relay adapter 或 nostr-sdk 测试客户端，验证：

- 发布 `available` listing 时生成 event id。
- `buyer list` 只返回 ClawTip payment listing。
- 创建订单后发布 `reserved`。
- mock 支付成功并开始调用后发布 `busy`。
- 调用完成后发布 `available`。
- 下架时发布 `offline`。

公开 relay 验证需要显式加 `--real-relay`，避免自动化测试向公共 relay 写入测试事件。

## 安全要求

- 不把真实 `payTo`、`sm4key`、`payCredential` 写进仓库。
- 日志中对所有敏感值脱敏。
- `payCredential` 只在内存中解密；P2-0 JSON 履约记录不保存凭证明文，后续数据库迁移也只能保存 hash 和解密后的非敏感支付状态。
- 订单文件里必须包含 ClawTip 要求字段，但 console 输出不打印完整 `encrypted_data` 和 `payCredential`。
- 配置文件如果包含直接密钥值，创建或更新后检查权限，macOS/Linux 建议 `0600`。
- 错误信息区分“订单不存在、支付未完成、支付失败、解密失败、金额不匹配、收款方不匹配、已履约”。

## 过程日志要求

P2-0 的 console 和 seller 服务都必须输出结构化过程日志。日志用于定位真实支付链路里的断点，因此每个阶段都要记录 `event`、`orderNo`、`listingId`、`relayEventId`、`status` 和 `durationMs` 中适用的字段。

必须覆盖的日志事件：

- `clawtip.config.loaded`：配置文件读取完成，打印配置路径、mode、relay 数量、payTo 脱敏摘要。
- `clawtip.relay.connect.start` / `clawtip.relay.connect.ok` / `clawtip.relay.connect.error`：relay 连接过程。
- `clawtip.listing.publish.start` / `clawtip.listing.publish.ok` / `clawtip.listing.publish.error`：listing 发布过程，成功时打印 event id 和 seller pubkey。
- `clawtip.listing.list.ok`：买家从 relay registry 或真实 relay 拉取 listing 完成，打印数量。
- `clawtip.listing.status.update`：`available/reserved/busy/offline` 状态变更。
- `clawtip.order.create.start` / `clawtip.order.create.ok` / `clawtip.order.create.error`：订单创建过程。
- `clawtip.order_file.write.ok`：TokensBuddy 订单文件写入成功，打印订单文件路径。
- `clawtip.payment.wait.start` / `clawtip.payment.credential.detected` / `clawtip.payment.wait.timeout`：等待 ClawTip 写回支付凭证。
- `clawtip.credential.decrypt.ok` / `clawtip.credential.decrypt.error`：凭证解密过程。
- `clawtip.payment.verify.ok` / `clawtip.payment.verify.reject`：支付状态、金额、收款方和订单号校验结果。
- `clawtip.inference.mock.start` / `clawtip.inference.mock.chunk` / `clawtip.inference.mock.done`：模拟 LLM 流式履约过程。
- `clawtip.fulfillment.record.ok` / `clawtip.fulfillment.duplicate`：履约记录和重复调用处理。

日志禁止输出完整 `sm4key`、`payCredential`、`encrypted_data`、完整 `payTo`。对 `payTo`、credential hash、订单文件路径中的用户目录可以做脱敏；调试模式也不能打印密钥原文。

## 后续集成点

### 接 P2B 单席位调度

复用 `listing.rs` 和 `fulfillment.rs` 的状态机：

- `buyer buy` 创建订单时 listing 进入 `reserved`。
- 支付成功后进入 `busy`。
- 模拟或真实推理结束后回到 `available`。
- 超时或失败进入 `available` 或 `cooldown`。

### 接正式市场 UI

P2-0 已经包含 relay 发布，后续 UI 不需要重新设计市场发布协议，只需要调用同一套服务：

- `seller publish` 对应 UI 的“启动市场售卖”。
- `seller unpublish` 对应 UI 的“停止售卖”。
- listing 中已有 `capacity=1`、`status`、`endpoint`、`payment`、`modelPrices` 扩展位。
- `stop_selling_tokens` 复用 `offline` 状态发布。

### 接真实 proxy

`mock_llm.rs` 替换为 proxy 调用：

- 调用前必须校验订单和支付凭证。
- 请求模型必须存在于 listing 的可售卖模型列表。
- 用量记录保存模型价格快照。
- 流式断开时记录已产生 token 和调用状态。

## 需要用户提供的信息

实现真实交易前，需要你在本地提供：

- `CLAWTIP_PAY_TO`：收款服务 ID。
- `CLAWTIP_SM4_KEY`：与 `payTo` 对应的 sm4key。
- 确认 ClawTip 提供给独立应用调用的支付方式：API、CLI、SDK 或可复用的本地 runner。
- 确认 relay 列表。默认使用现有市场的 `wss://relay.damus.io` 和 `wss://nos.lol`，如需要私有 relay，需要提供 URL。
- 如果要跨设备测试，需要提供一个买家可访问的 seller endpoint；P2-0 不自动启动 tunnel。
- 确认 `payCredential` 的回传方式：写入本地订单文件、HTTP 回调、CLI 输出，或需要 TokensBuddy 主动轮询。

## 实施顺序

1. 写 Rust 单元测试：indicator、订单文件路径、订单 JSON 字段、配置 env 引用。
2. 实现配置读取和订单文件读写。
3. 实现 SM4 加密/解密，并用 mock credential 测试。
4. 实现 relay 适配器：发布、查询、状态更新和本地 fake relay 测试。
5. 实现本地 listing cache 和 seller publish/list。
6. 实现 create-order：生成订单、落库、写订单文件，并发布 `reserved`。
7. 实现 `buyer wait-payment`：轮询 `payCredential`。
8. 实现 credential 校验：解密、校验订单、金额、payTo、状态，并发布 `busy`。
9. 实现 mock LLM 流式履约和幂等记录，完成后发布 `available`。
10. 增加 `dev mock-pay` 自动化测试路径。
11. 用 relay + `clawtip-sandbox` 或真实 `clawtip` 完成一次端到端真实支付验证。

## 自检

- 设计没有把真实交易密钥写入仓库。
- 设计遵循 ClawTip 官方三阶段订单文件协议。
- console 流程覆盖上架、relay 发布、relay 发现、购买、支付、调用。
- 真实交易路径和 mock 自动化路径分开。
- 第一版依赖 relay 市场发布/发现，但不依赖 tunnel 和真实 LLM provider。
- Rust 核心可以被后续 Tauri 命令、market service 和 proxy 复用。
