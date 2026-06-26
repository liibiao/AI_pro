# 生成 API 接入说明

画布前端后续只调用本系统 API，不接触上游中转 key。

## 鉴权

所有接口都需要：

```http
Authorization: Bearer <token>
```

登录保护：

- 同一 IP + 账号在 15 分钟内连续失败 10 次后，登录接口会返回 `LOGIN_RATE_LIMITED`。
- 成功登录会清除该账号本次失败计数。

## 模型列表

```http
GET /api/models?type=IMAGE
GET /api/models?type=VIDEO
GET /api/models?type=LLM
```

返回的 `id` 作为 `modelId` 使用。

## 充值订单

```http
GET   /api/recharge/orders
POST  /api/recharge/orders
GET   /api/recharge/orders/:orderNo
POST  /api/recharge/orders/:orderNo/mock-pay
POST  /api/recharge/orders/:orderNo/close
```

当前充值体系已支持：

- 默认 `PAYMENT_MODE=voucher` 时使用兑换码线下支付，普通充值下单接口会提示用户通过代理或管理员获取兑换码后兑换。
- 超级管理员可通过 `/api/admin/recharge-vouchers` 给指定用户生成后台线下充值码；代理可通过 `/api/agent/credit-vouchers` 使用可用额度给绑定客户生成兑换码，也可通过 `/api/agent/credit-grant-requests` 向管理员申请配额。
- 创建充值订单后返回二维码内容，mock 模式返回 `mock-pay://`，支付宝模式返回支付宝预下单二维码。
- 订单列表和订单详情读取前会自动关闭已过期的待支付订单。
- 待支付订单可手动关闭，已支付订单不能关闭。
- 本地联调可用 mock-pay 入账，生产环境禁止 mock-pay。
- 后台“充值管理”会轮询订单列表，并同步更新当前二维码订单状态。

当前积分比例：

```text
1 元 = 100 积分
1 分钱 = 1 积分
```

当前会员策略：

```text
月度会员正式定价：2900 积分 / 29 元 / 30 天
内测体验阶段：月度会员价格暂设为 0 积分
```

## 图片生成

```http
POST /api/generate/image
Content-Type: application/json
```

```json
{
  "modelId": "seed-gpt-image-2",
  "prompt": "一张电影感国漫角色海报",
  "size": "1024x1024",
  "quantity": 1,
  "endpointPath": "/images/generations",
  "extra": {}
}
```

计费：

```text
按分辨率档位扣费：
1K = 5 积分 / 张，平台成本 3.5 积分，毛利 30%
2K = 8 积分 / 张，平台成本 5.6 积分，毛利 30%
3K = 25 积分 / 张，平台成本 17.5 积分，毛利 30%
4K = 50 积分 / 张，平台成本 35 积分，毛利 30%

最终扣费 = 档位积分 * quantity
```

成功返回：

```json
{
  "ok": true,
  "result": {
    "url": "https://...",
    "b64": ""
  },
  "usage": {},
  "balance": 9995,
  "chargedCredits": 5
}
```

## 视频生成

提交任务：

```http
POST /api/generate/video/start
```

```json
{
  "modelId": "video-model-id",
  "prompt": "镜头向前推进，角色抬头",
  "durationSeconds": 5,
  "aspectRatio": "9:16",
  "resolution": "720p",
  "endpointPath": "/video/generations",
  "extra": {}
}
```

计费：

```text
36 积分 / 秒
平台成本 25.2 积分 / 秒
毛利 30%

最终扣费 = durationSeconds * 36
```

查询状态：

```http
POST /api/generate/video/status
```

GET 型上游：

```json
{
  "modelId": "video-model-id",
  "taskId": "upstream-task-id",
  "usageId": "model-usage-id",
  "method": "GET",
  "endpointPath": "/video/status",
  "taskParam": "taskId"
}
```

POST 型上游：

```json
{
  "modelId": "video-model-id",
  "taskId": "upstream-task-id",
  "usageId": "model-usage-id",
  "method": "POST",
  "endpointPath": "/video/status",
  "taskParam": "taskId"
}
```

`usageId` 可选，传了之后在任务完成时会回写 `model_usages.response_json/result_url`。

## 语言模型

```http
POST /api/generate/llm/chat
```

```json
{
  "modelId": "seed-gpt-5-5",
  "messages": [
    { "role": "system", "content": "你是专业提示词优化助手" },
    { "role": "user", "content": "帮我优化：少年觉醒灵纹" }
  ],
  "maxOutputTokens": 4096,
  "endpointPath": "/chat/completions",
  "extra": {}
}
```

计费：

```text
上游成本美元 =
  input_tokens / 1,000,000 * input_price_usd_per_1m
  + output_tokens / 1,000,000 * output_price_usd_per_1m

扣除积分 =
  ceil(上游成本美元 * credits_per_usd_cost * markup_rate)
```

如果上游没有返回 `usage`，系统会按文本长度估算 token。

## 上游接口路径

不同上游中转的接口路径可能不一致，所以生成接口允许传 `endpointPath`：

```text
OpenAI 兼容图片：/images/generations
OpenAI 兼容聊天：/chat/completions
视频任务：按上游实际路径配置，例如 /video/generations
```

如果上游 `baseUrl` 已经是 `https://xxx/v1`，`endpointPath` 可以写 `/images/generations`，系统会自动拼接。

## 后台配置上游

后台路径：

```text
模型管理 -> 上游渠道
```

可完成：

- 新增上游渠道：填写 `Base URL` 和上游 API Key。
- 编辑上游渠道：可修改名称、`Base URL`、状态；`API Key` 留空时保留原值。
- 测试上游渠道：默认用 `GET /models` 测试，也可以改成上游实际支持的路径或 `POST` 请求。

后台路径：

```text
模型管理 -> 模型列表
```

可完成：

- 编辑真实模型名，例如 `gpt-image-2`、`gpt-5.4`、`gpt-5.5`。
- 设置图片 1K 基准价、视频秒价和成本积分。
- 设置语言模型 `inputPriceUsdPer1m`、`outputPriceUsdPer1m`、`creditsPerUsdCost`、`markupRate`。
- 启用或停用某个模型。

上游请求有统一超时控制：

```text
UPSTREAM_TIMEOUT_MS=120000
```

超时会返回 `UPSTREAM_TIMEOUT`，网络层失败会返回 `UPSTREAM_NETWORK_ERROR`。生成接口只在上游成功后扣费；上游失败只写失败调用记录，不扣用户余额。

## 后台生成联调

后台路径：

```text
生成联调
```

支持三类模型联调：

- 图片生成：可选择模型、尺寸、数量和图片生成接口路径。
- 视频生成：可选择模型、秒数、比例、清晰度、提交路径；任务创建后可继续用状态路径查询结果。
- 语言模型：可选择模型、最大输出 Token 和聊天接口路径。

视频上游必须返回可识别的任务 ID，例如 `taskId`、`task_id`、`id`、`data.taskId` 或 `data.id`。如果没有返回任务 ID，系统会返回 `UPSTREAM_TASK_ID_MISSING`，并且不会扣费。

视频任务创建成功后会先按秒扣费并写入调用记录。后续查询状态时，如果上游返回失败状态：

```text
failed / error / cancelled / canceled
```

系统会把对应调用记录标记为 `FAILED`，自动写入 `REFUND` 钱包流水，并把本次扣费退回用户余额。重复查询同一个失败任务不会重复退款。

## 调用排查

后台路径：

```text
模型管理 -> 调用记录
```

可按状态、模型类型和返回条数筛选。每条调用记录可以展开查看：

- 用户、模型、上游渠道。
- 扣费积分、成本积分、美元成本。
- 输入 / 输出 / 总 token。
- 请求 JSON、响应 JSON。
- 上游任务 ID、结果地址。
- 失败时的错误原因。

后台“数据概览”会汇总：

- 成功调用数。
- 失败调用数。
- 总消耗积分。
- 总充值积分。
- 代理佣金和核销数。

## 会员套餐和账号池

后台路径：

```text
会员套餐
会员账号池
```

接口：

```text
GET   /api/membership/plans
POST  /api/membership/plans
PATCH /api/membership/plans/:id

GET  /api/member-accounts
POST /api/member-accounts/batch-create
POST /api/member-accounts/:id/void
```

当前已支持：

- 后台创建和编辑会员套餐，支持启用 / 停用。
- 后台按套餐批量生成会员账号。
- 未核销会员账号可作废，已核销账号不能作废，避免破坏历史记录。
- 套餐和账号池关键操作会写入后台操作日志。

## 代理排查和对账

后台路径：

```text
代理管理
代理额度
佣金结算
代理工作台
```

当前代理体系已支持：

- 客户防抢：客户已归属其他代理时，录入会返回 `CUSTOMER_BOUND_TO_OTHER_AGENT`。
- 代理业绩：客户数、核销数、已领账号、已核销账号、待结佣金、已结佣金。
- 下级代理统计：下级客户数、核销数、佣金总额、待结佣金。
- 佣金来源展开：可看到客户、套餐、会员账号和核销来源。
- 后台代理客户明细：在“代理管理”中可查看某个代理名下客户、余额、核销数和佣金。
- 后台代理账务详情：在“代理额度”中可查看单个代理的额度账户、额度凭证、额度流水、对账订单和绑定客户。
- 佣金结算：后台可单笔标记结算，也可按代理批量结清所有待结佣金并生成结算单。

排查接口：

```text
GET /api/admin/agents/:id/customers
GET /api/admin/agent-credit/agents/:id/accounting
GET /api/admin/agent-credit/accounts
GET /api/admin/agent-reconciliation-orders
POST /api/admin/agent-reconciliation-orders/:id/settle
GET /api/commissions
POST /api/commissions/:id/settle
GET /api/settlements
POST /api/settlements/agent/:agentId/settle-pending
```

## 体验卡流程

后台路径：

```text
体验卡
```

用户路径：

```text
账户中心 -> 体验卡兑换
```

代理路径：

```text
代理工作台 -> 体验卡
```

当前体验卡体系已支持：

- 后台批量生成体验卡，可指定代理或生成平台通用卡。
- 代理自行生成体验卡，设置数量和有效天数，生成后可复制给客户。
- 用户兑换后开通对应会员权益；如果已有有效会员，会从当前会员到期时间后顺延。
- 代理体验卡兑换时会自动绑定客户归属，已归属其他代理的用户会返回 `USER_BOUND_TO_OTHER_AGENT`。
- 已使用、已作废、已过期的体验卡不能兑换。
- 后台列表和代理列表会在读取前自动把过期未使用的体验卡标记为 `EXPIRED`。
- 后台作废未使用体验卡时会记录操作日志。

## 用户管理

后台路径：

```text
用户管理
```

接口：

```text
GET   /api/users
POST  /api/users
GET   /api/users/:id
PATCH /api/users/:id/status
PATCH /api/users/:id/password
```

当前用户管理已支持：

- 后台创建用户，密码可手填，也可由系统生成初始密码。
- 创建 ADMIN / SUPER_ADMIN 或管理管理员账号需要 SUPER_ADMIN 权限。
- 禁用用户后，该用户不能登录和消费。
- 当前登录账号不能禁用自己，避免后台被锁死。
- 重置密码会生成一次性展示的新密码，并写入后台操作日志。

## 系统设置

后台路径：

```text
系统设置
```

接口：

```text
GET   /api/admin/system-settings
PATCH /api/admin/system-settings
```

当前支持配置：

- 支付模式：`mock` 或 `alipay`。
- 充值比例：每 1 元对应多少积分。
- 支付宝网页二维码参数：App ID、网关、异步通知地址、应用私钥、支付宝公钥。
- 生成 Mock 模式：用于没有真实上游 key 时联调。
- 上游请求超时时间：图片、视频和语言模型真实请求会读取该值。

敏感配置会加密入库，后台列表只显示是否已经配置，不回显明文。
