# 客户直连生图 / 生视频 API 接入文档

> 本文档覆盖新增开放 API。原画布内部接口保持不变，不建议客户直接调用。

## 1. 接入方式总览

| 接入方式 | Token 来源 | 接口前缀 | 是否登录过期 | 扣费主体 | 折扣规则 |
|---|---|---|---|---|---|
| 画布原功能 | 登录 Token | `/api/generation/*` | 会过期 | 个人钱包 | 跟随个人会员 |
| 个人开放 API | 画布设置生成的个人 API Key | `/api/open/personal/*` | 默认不过期 | 个人钱包 | 实时跟随个人会员/体验卡 |
| 企业开放 API | 超级管理员创建的企业 Token | `/api/open/enterprise/*` | 默认不过期，可设置过期 | 企业钱包 | 免会员，固定 VIP 4 折 |

## 2. 个人 API Key

入口：

```text
画布 / 后台账户中心 → API 接入
```

能力：

- 创建个人 API Key。
- 查看 Key 前缀、状态、最近调用时间。
- 禁用 API Key。
- 打开 API 对接文档。

注意：

- 明文 Key 只在创建时展示一次。
- API 调用不使用网页登录 Token。
- API Key 长期有效，但账号禁用、余额不足、会员/体验卡到期都会实时生效。

请求头：

```http
Authorization: Bearer <个人API Key>
Content-Type: application/json
```

## 3. 企业 API Token

企业体系：

```text
EnterpriseAccount
├── billingUserId 企业结算钱包
├── EnterpriseUser 企业后台登录用户
└── EnterpriseApiToken 企业 API 调用 Token
```

超级管理员后台接口：

| 能力 | 方法 | URL |
|---|---|---|
| 企业列表 | `GET` | `/api/admin/enterprise/accounts` |
| 创建企业与企业管理员 | `POST` | `/api/admin/enterprise/accounts` |
| 创建企业 Token | `POST` | `/api/admin/enterprise/accounts/:id/tokens` |
| 禁用企业 Token | `PATCH` | `/api/admin/enterprise/tokens/:id/disable` |
| 企业充值 | `POST` | `/api/admin/enterprise/accounts/:id/recharge` |

企业后台接口：

| 能力 | 方法 | URL |
|---|---|---|
| 企业登录 | `POST` | `/api/enterprise/auth/login` |
| 当前企业用户 | `GET` | `/api/enterprise/auth/me` |
| 数据概览 | `GET` | `/api/enterprise/dashboard/summary` |
| 积分余额 | `GET` | `/api/enterprise/wallet` |
| 积分流水 | `GET` | `/api/enterprise/wallet/logs?page=1&pageSize=20` |
| 任务列表 | `GET` | `/api/enterprise/generation/tasks?page=1&pageSize=20` |
| 任务详情 | `GET` | `/api/enterprise/generation/tasks/:id` |
| API Token 只读列表 | `GET` | `/api/enterprise/api-tokens` |

企业 Token 请求头：

```http
Authorization: Bearer <企业API Token>
Content-Type: application/json
```

## 4. 开放 API 列表

### 个人开放 API

| 能力 | 方法 | URL |
|---|---|---|
| 创建任务 | `POST` | `/api/open/personal/generation/tasks` |
| 查询任务列表 | `GET` | `/api/open/personal/generation/tasks?limit=100` |
| 查询任务详情 | `GET` | `/api/open/personal/generation/tasks/:id` |
| 主动刷新任务 | `POST` | `/api/open/personal/generation/tasks/:id/query` |

### 企业开放 API

| 能力 | 方法 | URL |
|---|---|---|
| 创建任务 | `POST` | `/api/open/enterprise/generation/tasks` |
| 查询任务列表 | `GET` | `/api/open/enterprise/generation/tasks?limit=100` |
| 查询任务详情 | `GET` | `/api/open/enterprise/generation/tasks/:id` |
| 主动刷新任务 | `POST` | `/api/open/enterprise/generation/tasks/:id/query` |

## 5. 创建任务

个人：

```http
POST /api/open/personal/generation/tasks
Authorization: Bearer sk_live_xxx
Content-Type: application/json
```

企业：

```http
POST /api/open/enterprise/generation/tasks
Authorization: Bearer ent_live_xxx
Content-Type: application/json
```

请求体：

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

响应：

```json
{
  "ok": true,
  "task": {
    "id": "task_xxx",
    "status": "RUNNING",
    "type": "IMAGE",
    "mode": "txt2img",
    "chargedCredits": 400
  },
  "chargedCredits": 400,
  "balance": 9600
}
```

## 6. 查询任务

```http
GET /api/open/personal/generation/tasks/:id
GET /api/open/enterprise/generation/tasks/:id
```

主动刷新：

```http
POST /api/open/personal/generation/tasks/:id/query
POST /api/open/enterprise/generation/tasks/:id/query
```

列表：

```http
GET /api/open/personal/generation/tasks?limit=100
GET /api/open/enterprise/generation/tasks?limit=100
```

## 7. 计费规则

个人开放 API：

- 扣个人钱包。
- 账号状态必须 `ACTIVE`。
- 有效会员 / 体验卡：VIP 4 折。
- 无会员：原价。
- 余额不足拒绝创建任务。

企业开放 API：

- 扣企业账号绑定的企业钱包。
- 企业无需购买会员。
- 固定按 VIP 4 折计费。
- 企业账号或 Token 禁用后拒绝调用。

## 8. 错误码

| code | 含义 |
|---|---|
| `OPEN_API_TOKEN_REQUIRED` | 缺少个人 API Token |
| `OPEN_API_TOKEN_INVALID` | 个人 API Token 无效或已禁用 |
| `ENTERPRISE_API_TOKEN_REQUIRED` | 缺少企业 API Token |
| `ENTERPRISE_API_TOKEN_INVALID` | 企业 API Token 无效或已禁用 |
| `ENTERPRISE_API_TOKEN_EXPIRED` | 企业 API Token 已过期 |
| `ENTERPRISE_DISABLED` | 企业账号已禁用 |
| `USER_DISABLED` | 个人账号已禁用 |
| `INSUFFICIENT_BALANCE` | 余额不足 |
| `PROVIDER_NOT_FOUND` | 渠道不可用 |
| `MODEL_NOT_FOUND` | 模型不可用 |
| `GENERATION_TASK_NOT_FOUND` | 任务不存在或无权访问 |

## 9. 安全说明

- 不暴露上游 `apiKey`、`baseUrl`、`secretKey`。
- 个人 API Key、企业 API Token 数据库只保存 Hash。
- 明文 Token 只在创建时返回一次。
- 客户请求体不允许传 `userId`，任务归属由 Token 自动识别。
- 开放 API 路径独立，不影响原画布调用。
