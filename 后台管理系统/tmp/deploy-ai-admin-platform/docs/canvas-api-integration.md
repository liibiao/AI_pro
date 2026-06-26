# 无限画布 API 接入方案

> 当前已经落地了更轻量的兼容接入方式，优先看：
>
> [无限画布接入后台：兼容模式](canvas-workbench-compat.md)

目标前端：

`/Users/billy/Documents/AI_pro/漫剧创作库/tools/workbench-web/image-studio-canvas.html`

现有后端：

`/Users/billy/Documents/AI_pro/漫剧创作库/smart-vision/services/workbench/workbench_server.py`

## 1. 现状判断

当前无限画布不是纯静态页面，已经依赖本地 Python 工作台服务：

- 页面通过 `/workbench-engine.js` 加载共享引擎。
- 生图走 `POST /api/workbench/image-studio/generate`。
- 视频走 `POST /api/workbench/image-studio/video/start` + `GET /api/workbench/image-studio/video/status`。
- 图片、视频、远程代理、对象存储上传、目录选择等都已经在 `workbench_server.py` 中实现。
- 工作流模板和历史记录目前主要保存在浏览器 `localStorage`。
- 前端模型 API Key 目前可由用户在页面内配置并存到本地。

因此接入用户/账户/代理系统时，建议不要重写画布。应该新增一层业务 API，把现有生成接口包住：

1. 生成前：校验登录态、会员权限、余额。
2. 生成中：保留原有图片/视频生成逻辑。
3. 生成后：记录消耗流水、生成记录、代理归属。
4. 保存时：把工作流从 localStorage 升级为服务端保存，同时保留本地降级。

## 2. 前端最小改造点

### 2.1 顶部登录态

在 `.topbar` 中增加：

- 登录 / 注册入口
- 当前用户昵称
- 余额
- 会员状态
- 代理入口，只有代理账号显示

建议调用：

```http
GET /api/account/me
```

返回：

```json
{
  "ok": true,
  "user": {
    "id": "usr_001",
    "nickname": "张三",
    "role": "user",
    "isAgent": false,
    "membership": {
      "active": true,
      "plan": "月卡",
      "expiresAt": "2026-06-08T00:00:00+08:00"
    },
    "wallet": {
      "balance": 12800,
      "currency": "credits"
    }
  }
}
```

### 2.2 生成前扣费预检

改造位置：

- `runGenerate(id)`
- `runVideoGenerate(id)`

在真正调用 `E.generateImageStandalone(...)` 或 `E.startVideoGeneration(...)` 之前调用：

```http
POST /api/billing/usage/preflight
Authorization: Bearer <token>
Content-Type: application/json
```

请求：

```json
{
  "scene": "image_generate",
  "nodeId": "n12",
  "model": "gpt-image-2",
  "quantity": 1,
  "size": "1024x1536",
  "workflowId": "wf_001",
  "metadata": {
    "nodeType": "txt2img"
  }
}
```

返回：

```json
{
  "ok": true,
  "reservationId": "resv_001",
  "estimatedCost": 120,
  "balanceBefore": 12800,
  "balanceAfter": 12680
}
```

如果余额不足：

```json
{
  "ok": false,
  "code": "INSUFFICIENT_BALANCE",
  "error": "余额不足，请充值后再生成"
}
```

### 2.3 生成成功后确认消耗

图片生成成功后，在 `runGenerate(id)` 的 `imgEntries` 写入完成后调用：

```http
POST /api/billing/usage/commit
```

请求：

```json
{
  "reservationId": "resv_001",
  "status": "success",
  "actualCost": 120,
  "providerTaskId": "imgtask_001",
  "result": {
    "imageTaskIds": ["imgtask_001"],
    "urls": ["/api/workbench/image-studio/file?path=..."]
  }
}
```

生成失败或取消时调用：

```http
POST /api/billing/usage/cancel
```

请求：

```json
{
  "reservationId": "resv_001",
  "reason": "cancelled"
}
```

这样可以避免“开始扣了费但生成失败”的纠纷。

### 2.4 服务端工作流保存

当前函数：

```js
function saveWF() {
  const wf = {...};
  localStorage.setItem(WF_KEY, JSON.stringify(wf));
}
```

建议升级为：

```http
POST /api/canvas/workflows
```

请求：

```json
{
  "id": "wf_001",
  "name": "我的工作流",
  "canvas": {
    "nodes": [],
    "conns": [],
    "view": {},
    "next": 1,
    "muted": []
  }
}
```

对应接口：

```http
GET /api/canvas/workflows
GET /api/canvas/workflows/:id
POST /api/canvas/workflows
PUT /api/canvas/workflows/:id
DELETE /api/canvas/workflows/:id
```

前端保留 localStorage 作为离线降级：

- 有 token：优先保存到服务端。
- 未登录或接口失败：保存到 localStorage。

## 3. 后端新增 API 模块

建议新增业务 API 前缀：

```text
/api/auth/*
/api/account/*
/api/billing/*
/api/agent/*
/api/admin/*
/api/canvas/*
```

不要和现有 `/api/workbench/image-studio/*` 混在一起。现有接口偏工具执行，新接口偏业务系统。

### 3.1 Auth

```http
POST /api/auth/register
POST /api/auth/login
POST /api/auth/refresh
POST /api/auth/logout
GET  /api/account/me
```

登录成功返回：

```json
{
  "ok": true,
  "accessToken": "jwt_access",
  "refreshToken": "jwt_refresh",
  "user": {
    "id": "usr_001",
    "nickname": "张三",
    "roles": ["user"]
  }
}
```

### 3.2 钱包和流水

```http
GET  /api/account/wallet
GET  /api/wallets/:userId/logs
GET  /api/account/summary
GET  /api/account/wallet/logs
GET  /api/account/usages
POST /api/recharge/orders
GET  /api/recharge/orders
GET  /api/recharge/orders/:orderNo
POST /api/recharge/orders/:orderNo/mock-pay
POST /api/pay/alipay/notify
POST /api/recharge/vouchers/redeem
POST /api/usage/check
POST /api/usage/consume
POST /api/generate/image
POST /api/generate/video/start
POST /api/generate/video/status
POST /api/generate/llm/chat
GET  /api/data-packs
GET  /api/data-packs/active
GET  /api/data-packs/:id
POST /api/admin/data-packs
PATCH /api/admin/data-packs/:id
POST /api/admin/data-packs/:id/select
```

原则：

- 钱包余额可以缓存。
- 财务最终以 `ledger_entries` 流水为准。
- 默认充值模式是兑换码线下支付，前端优先提供兑换码入口；二维码订单只在系统设置切换为 `alipay` 或 `mock` 时使用。
- 每次生成必须关联 `usage_reservation` 或 `ledger_entry`。
- 本地联调可开启 `GENERATION_MOCK_MODE=true`，生成接口仍会真实扣费并写入 `model_usages`。

### 3.2.1 创作库数据包

后台管理系统提供轻量文件型 data pack registry，默认文件：

```text
后台管理系统/data/data-pack-registry.json
```

用途：

- 向智能视界下发可用创作库数据包。
- 支持后续广告创意、电商商品图、电影、自媒体宣传片等定制创作库。
- 数据包只描述 roots / title / type / metadata，不直接复制业务产物。

普通登录用户可读取：

```http
GET /api/data-packs
GET /api/data-packs/active
GET /api/data-packs/:id
```

管理员可注册、更新和切换：

```http
POST  /api/admin/data-packs
PATCH /api/admin/data-packs/:id
POST  /api/admin/data-packs/:id/select
```

智能视界 Bridge 使用 `POST /api/smart-vision/data-packs/sync` 拉取上述接口，并写入自身 `outputs/.smart-vision/data-pack-registry.json`。

### 3.3 会员和权益

```http
GET  /api/membership/products
GET  /api/membership/plans
GET  /api/membership/current
POST /api/membership/purchase
POST /api/trial-cards/redeem
```

### 3.4 代理系统

```http
GET  /api/agent/me
GET  /api/agent/performance
POST /api/agent/customers
GET  /api/agent/customers
POST /api/agent/accounts/claim
GET  /api/agent/accounts/claimed
GET  /api/agent/accounts/claims
POST /api/agent/accounts/redeem
GET  /api/agent/redemptions
GET  /api/agent/commissions
POST /api/agent/sub-agents
GET  /api/agent/sub-agents
```

关键规则：

- `agent_customer_bindings.customer_id` 必须唯一。
- 客户一旦绑定代理，其他代理不能抢。
- 领取会员账号不产生成本。
- 核销成功才产生成本、业绩和佣金。
- 一级/初创代理才允许创建下级代理和查看下级业绩。

### 3.5 管理后台

```http
GET  /api/dashboard
GET  /api/users
GET  /api/admin/agents
PATCH /api/admin/agents/:id
GET  /api/member-accounts
POST /api/member-accounts/batch-create
GET  /api/admin/model-usages
GET  /api/wallets
GET  /api/settlements
POST /api/settlements/:id/settle
GET  /api/admin-logs
```

## 4. 数据表核心设计

```sql
users
user_sessions
roles
user_roles

wallet_accounts
ledger_entries
recharge_orders
usage_reservations
usage_records

membership_products
membership_orders
membership_accounts
membership_account_claims
membership_redemptions

agents
agent_relations
agent_customer_bindings
agent_commission_rules
agent_commission_entries
agent_settlements

trial_cards
trial_card_uses

canvas_workflows
generation_records
audit_logs
```

## 5. 生成计费状态流

```text
点击生成
  -> preflight 预占费用
  -> 调用现有 /api/workbench/image-studio/generate
  -> 成功：commit，写 usage_records + ledger_entries
  -> 失败：cancel，释放预占
```

视频同理，只是 commit 应该在异步任务最终完成后执行。

## 6. 前端推荐新增工具函数

建议在 `image-studio-canvas.html` 里靠近 `const E = window.WorkbenchEngine || {};` 后加入：

```js
const API_AUTH_TOKEN_KEY = 'mjb_access_token';

function getAuthToken() {
  return localStorage.getItem(API_AUTH_TOKEN_KEY) || '';
}

async function appApi(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (!(options.body instanceof FormData)) headers['Content-Type'] = headers['Content-Type'] || 'application/json';
  const token = getAuthToken();
  if (token) headers.Authorization = 'Bearer ' + token;
  const resp = await fetch(path, { ...options, headers });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || data.ok === false) throw new Error(data.error || data.message || ('HTTP ' + resp.status));
  return data;
}

async function requireUsagePreflight(payload) {
  return appApi('/api/billing/usage/preflight', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

async function commitUsage(payload) {
  return appApi('/api/billing/usage/commit', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

async function cancelUsage(payload) {
  return appApi('/api/billing/usage/cancel', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}
```

## 7. 最小上线顺序

1. 先做 `auth + account/me`，让画布知道当前用户是谁。
2. 再做 `billing preflight/commit/cancel`，把生图和视频消耗纳入流水。
3. 再做 `canvas_workflows`，让用户工作流跟账号绑定。
4. 再做代理客户绑定和会员核销。
5. 最后做完整管理后台和结算。

## 8. 不建议的做法

- 不建议把用户、余额、代理数据继续塞进 localStorage。
- 不建议让前端直接判断代理佣金和财务结算。
- 不建议用“领取账号数量”做成本核算。
- 不建议在画布 HTML 里直接实现复杂业务规则。
