# 个人生成 API 接入文档

> 本文档只覆盖个人 API。画布设置入口只打开个人 API 文档，不提供企业 API 入口。

## 1. 接入入口

```text
画布 → 账户设置 → 个人 API 接入
```

能力：

- 打开个人 API 文档。
- 创建个人 API Key。
- 查看 Key 前缀、状态、最近调用时间。
- 禁用 API Key。

注意：

- 明文 API Key 只在创建成功时展示一次，请立即复制保存。
- API Key 用于 `/api/open/personal/*`，不使用网页登录 Token。
- 扣当前个人账号余额，会员 / 体验卡折扣实时生效。

## 2. 鉴权方式

所有个人开放 API 请求必须携带：

```http
Authorization: Bearer <个人 API Key>
Content-Type: application/json
```

## 3. 接口列表

| 能力 | 方法 | URL |
|---|---|---|
| 创建生成任务 | `POST` | `/api/open/personal/generation/tasks` |
| 查询任务列表 | `GET` | `/api/open/personal/generation/tasks?limit=100` |
| 查询任务详情 | `GET` | `/api/open/personal/generation/tasks/:id` |
| 主动刷新任务 | `POST` | `/api/open/personal/generation/tasks/:id/query` |

## 4. 创建生成任务

```http
POST /api/open/personal/generation/tasks
Authorization: Bearer sk_live_xxx
Content-Type: application/json
```

### 4.1 请求体示例

```json
{
  "channelKey": "gpt-image",
  "modelId": "model_image_xxx",
  "type": "IMAGE",
  "mode": "txt2img",
  "prompt": "一只赛博朋克风格的猫",
  "negativePrompt": "",
  "inputFiles": [],
  "params": {
    "size": "1024x1024",
    "quantity": 1
  },
  "clientRequestId": "client_order_001"
}
```

### 4.2 请求体参数表

| 字段 | 必填 | 类型穷举 | 说明 |
|---|---:|---|---|
| `channelKey` | 是 | `string` | 渠道 Key，对应后台启用的上游渠道，如 `gpt-image`。不能为空。 |
| `modelId` | 是 | `string` | 模型 ID / modelKey / 模型名，服务端会在该渠道下匹配启用模型。不能为空。 |
| `type` | 是 | `"IMAGE" \| "VIDEO" \| "LLM"` | 生成类型。图片用 `IMAGE`，视频用 `VIDEO`，文本/大模型用 `LLM`。 |
| `mode` | 是 | `string` | 生成模式，如 `txt2img`、`img2img`、`text2video` 等，具体取决于模型适配器。不能为空。 |
| `prompt` | 是 | `string` | 正向提示词。不能为空。 |
| `negativePrompt` | 否 | `string` | 反向提示词。不传时为空。 |
| `inputFiles` | 否 | `array` | 输入文件数组，默认 `[]`。元素可为字符串 URL，也可为对象，结构由具体模型适配器决定。 |
| `params` | 否 | `object` | 模型扩展参数，默认 `{}`。可包含字符串、数字、布尔、数组、对象或 `null`。 |
| `clientRequestId` | 否 | `string` | 客户端幂等 ID，长度 1-160。相同账号下重复提交同一 ID 会返回已存在任务。 |

### 4.3 `params` 常见字段类型

| 字段示例 | 类型穷举 | 说明 |
|---|---|---|
| `size` | `string` | 图片尺寸，如 `1024x1024`。 |
| `width` | `number` | 宽度。 |
| `height` | `number` | 高度。 |
| `quantity` | `number` | 生成数量。 |
| `seed` | `number \| string` | 随机种子，取决于模型要求。 |
| `referenceImages` | `array` | 参考图 URL / 文件对象数组。 |
| `duration` | `number \| string` | 视频时长，取决于模型要求。 |
| `fps` | `number` | 视频帧率。 |
| `metadata` | `object` | 客户自定义附加信息。 |
| 任意扩展字段 | `string \| number \| boolean \| array \| object \| null` | 透传给对应模型适配器，未知字段是否生效取决于后台适配器。 |

### 4.4 创建任务响应示例

```json
{
  "ok": true,
  "task": {
    "id": "task_xxx",
    "userId": "user_xxx",
    "clientRequestId": "client_order_001",
    "providerId": "provider_xxx",
    "modelId": "model_image_xxx",
    "channelKey": "gpt-image",
    "type": "IMAGE",
    "mode": "txt2img",
    "status": "RUNNING",
    "prompt": "一只赛博朋克风格的猫",
    "negativePrompt": "",
    "inputFilesJson": [],
    "paramsJson": { "size": "1024x1024", "quantity": 1 },
    "upstreamTaskId": "upstream_xxx",
    "upstreamRequestId": "request_xxx",
    "resultJson": null,
    "resultUrlsJson": [],
    "chargedCredits": 400,
    "costAmount": 400,
    "costUsd": "0",
    "refundCredits": 0,
    "refundStatus": null,
    "refundReason": null,
    "errorCode": null,
    "errorMessage": null,
    "retryCount": 0,
    "progress": 0,
    "startedAt": "2026-05-27T12:00:00.000Z",
    "completedAt": null,
    "failedAt": null,
    "refundedAt": null,
    "createdAt": "2026-05-27T12:00:00.000Z",
    "updatedAt": "2026-05-27T12:00:00.000Z"
  },
  "chargedCredits": 400,
  "balance": 9600
}
```

### 4.5 创建任务响应体参数表

| 字段 | 类型穷举 | 说明 |
|---|---|---|
| `ok` | `boolean` | 是否成功。成功为 `true`。 |
| `task` | `object` | 生成任务对象。 |
| `chargedCredits` | `number` | 本次预扣积分。失败任务通常为 `0`。 |
| `balance` | `number \| undefined` | 扣费后的个人余额。部分失败或幂等返回可能没有该字段。 |
| `id` | `string` | 任务 ID。 |
| `userId` | `string` | 归属个人账号 ID。 |
| `clientRequestId` | `string \| null` | 客户端幂等 ID。 |
| `providerId` | `string` | 渠道 ID。 |
| `modelId` | `string` | 模型 ID。 |
| `channelKey` | `string` | 渠道 Key。 |
| `type` | `"IMAGE" \| "VIDEO" \| "LLM"` | 生成类型。 |
| `mode` | `string` | 生成模式。 |
| `status` | `"CREATED" \| "PENDING" \| "RUNNING" \| "SUCCESS" \| "FAILED"` | 任务状态。 |
| `prompt` | `string` | 正向提示词。 |
| `negativePrompt` | `string \| null` | 反向提示词。 |
| `inputFilesJson` | `array` | 输入文件数组。 |
| `paramsJson` | `object` | 创建任务时传入的扩展参数。 |
| `upstreamTaskId` | `string \| null` | 上游任务 ID。 |
| `upstreamRequestId` | `string \| null` | 上游请求 ID。 |
| `resultJson` | `object \| array \| string \| number \| boolean \| null` | 上游原始 / 归一化结果。 |
| `resultUrlsJson` | `array \| null` | 结果资源 URL 数组。 |
| `chargedCredits` | `number` | 任务实际预扣积分。 |
| `costAmount` | `number` | 内部成本金额 / 积分成本。 |
| `costUsd` | `string \| number` | 美元成本，数据库 Decimal 可能序列化为字符串。 |
| `refundCredits` | `number \| null` | 已退款积分。 |
| `refundStatus` | `string \| null` | 退款状态。 |
| `refundReason` | `string \| null` | 退款原因。 |
| `errorCode` | `string \| null` | 失败错误码。 |
| `errorMessage` | `string \| null` | 失败错误信息。 |
| `retryCount` | `number` | 重试次数。 |
| `progress` | `number \| null` | 任务进度，常见范围 0-100。 |
| `startedAt` | `string \| null` | 开始时间，ISO 字符串。 |
| `completedAt` | `string \| null` | 完成时间，ISO 字符串。 |
| `failedAt` | `string \| null` | 失败时间，ISO 字符串。 |
| `refundedAt` | `string \| null` | 退款时间，ISO 字符串。 |
| `createdAt` | `string` | 创建时间，ISO 字符串。 |
| `updatedAt` | `string` | 更新时间，ISO 字符串。 |
| `model` | `object \| undefined` | 查询详情 / 列表时可能返回模型信息。 |
| `provider` | `object \| undefined` | 查询详情 / 列表时可能返回渠道信息。 |

## 5. 查询任务列表

```http
GET /api/open/personal/generation/tasks?limit=100
Authorization: Bearer sk_live_xxx
```

### 查询参数

| 字段 | 必填 | 类型穷举 | 说明 |
|---|---:|---|---|
| `limit` | 否 | `number \| string` | 返回数量，默认 100，最小 1，最大 300。URL 查询参数会以字符串传入，服务端转数字。 |

### 响应体

| 字段 | 类型穷举 | 说明 |
|---|---|---|
| `ok` | `boolean` | 是否成功。 |
| `items` | `array` | 任务数组，每个元素字段同任务对象。 |

## 6. 查询任务详情

```http
GET /api/open/personal/generation/tasks/:id
Authorization: Bearer sk_live_xxx
```

### 路径参数

| 字段 | 必填 | 类型穷举 | 说明 |
|---|---:|---|---|
| `id` | 是 | `string` | 任务 ID。 |

### 响应体

| 字段 | 类型穷举 | 说明 |
|---|---|---|
| `ok` | `boolean` | 是否成功。 |
| `task` | `object` | 任务详情对象。字段见创建任务响应体参数表。 |

## 7. 主动刷新任务

```http
POST /api/open/personal/generation/tasks/:id/query
Authorization: Bearer sk_live_xxx
```

### 路径参数

| 字段 | 必填 | 类型穷举 | 说明 |
|---|---:|---|---|
| `id` | 是 | `string` | 任务 ID。 |

### 响应体

| 字段 | 类型穷举 | 说明 |
|---|---|---|
| `ok` | `boolean` | 是否成功。 |
| `task` | `object` | 刷新后的任务对象。 |
| `refund` | `object \| null \| undefined` | 如果任务失败并触发退款，可能返回退款信息。 |

## 8. 错误响应

```json
{
  "ok": false,
  "error": "个人 API Token 无效或已禁用",
  "code": "OPEN_API_TOKEN_INVALID"
}
```

| 字段 | 类型穷举 | 说明 |
|---|---|---|
| `ok` | `boolean` | 失败为 `false`。 |
| `error` | `string` | 错误说明。 |
| `code` | `string` | 错误码。 |

## 9. 常见错误码

| code | 含义 | 处理方式 |
|---|---|---|
| `OPEN_API_TOKEN_REQUIRED` | 缺少个人 API Key | 检查 `Authorization: Bearer <Key>`。 |
| `OPEN_API_TOKEN_INVALID` | API Key 无效或已禁用 | 重新创建 Key 或检查是否复制完整。 |
| `USER_DISABLED` | 个人账号已禁用 | 联系管理员恢复账号。 |
| `INSUFFICIENT_BALANCE` | 余额不足 | 充值后重试。 |
| `PROVIDER_NOT_FOUND` | 渠道不可用 | 检查 `channelKey`。 |
| `PROVIDER_DISABLED` | 渠道已禁用 | 换可用渠道或联系管理员。 |
| `MODEL_NOT_FOUND` | 模型不可用 | 检查 `modelId`、`type` 是否匹配。 |
| `GENERATION_TASK_NOT_FOUND` | 任务不存在或无权访问 | 确认任务 ID 属于当前 API Key 对应账号。 |
| `GENERATION_SUBMIT_FAILED` | 提交上游失败 | 查看 `errorMessage` 后重试或联系管理员。 |

## 10. 安全说明

- 不要把 API Key 放到公开网页、GitHub、截图或聊天群。
- 怀疑泄露后，立刻在画布账户设置里禁用旧 Key 并创建新 Key。
- 服务端只保存 API Key Hash，无法再次查看明文。
- 请求体不允许指定 `userId`，任务归属由 API Key 自动识别。
