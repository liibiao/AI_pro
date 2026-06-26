# 后台管理系统最终开发落地方案

## 1. 项目定位

本项目建设一套轻量、可上线、易部署的 AI 生成商业平台后台系统。系统独立于现有无限画布前端，后续通过 API 给无限画布接入登录、余额、模型列表、生成扣费、会员权益和工作流保存能力。

当前业务模式采用“商业平台模式”：

```text
上游中转站提供模型 key 和额度
  -> 你的后台统一接入上游 key
  -> 用户在你的平台充值
  -> 用户按你的定价使用图片、视频、语言模型
  -> 后台记录消耗、成本、利润、代理佣金
```

用户不接触上游 key，也不需要自己配置中转。用户只看到你的产品、余额、价格和生成结果。

## 2. 第一版目标

第一版目标不是做复杂中转站，而是做一个可运营的 AI 生成服务后台。

必须完成：

- 用户注册、登录、登录态维护
- 钱包余额和积分流水
- 图片模型、视频模型、语言模型统一管理
- 上游渠道 key 管理
- 图片按张计费
- 视频按秒计费
- 语言模型按 token 美元成本倍率换算积分
- 生成记录和扣费记录
- 代理客户绑定
- 代理领取会员账号
- 代理核销会员账号
- 代理业绩和佣金
- 后台手动结算
- 体验卡基础能力
- 后台管理界面
- 给无限画布开放 API

第一版暂不做：

- 微服务
- Redis
- 消息队列
- 自动打款
- 复杂 RBAC 权限系统
- 无限多级代理
- 多租户
- 复杂 BI 报表
- 用户自建 API Key 中转平台

## 3. 技术架构

### 3.1 技术栈

后台前端：

```text
React
TypeScript
Vite
Ant Design
TanStack Query
```

后端：

```text
Node.js
TypeScript
Express 或 Fastify
Prisma ORM
PostgreSQL
JWT
```

部署：

```text
Ubuntu 22.04
Nginx
PM2
PostgreSQL
Node.js 20+
```

### 3.2 部署结构

```text
云服务器
  ├── Nginx
  │   ├── /admin     后台管理前端
  │   ├── /agent     代理端页面
  │   └── /api       后端 API
  │
  ├── Node API 服务
  │   ├── 用户和登录
  │   ├── 钱包和积分
  │   ├── 模型和上游渠道
  │   ├── 生成扣费
  │   ├── 代理和核销
  │   └── 后台管理
  │
  └── PostgreSQL
      └── 业务数据库
```

最低服务器建议：

```text
2 核 CPU
4GB 内存
40GB 硬盘
Ubuntu 22.04
```

更稳配置：

```text
2-4 核 CPU
8GB 内存
80GB 硬盘
```

## 4. 项目目录

```text
后台管理系统/
  admin-web/
    src/
    package.json

  api-server/
    src/
      modules/
        auth/
        users/
        wallets/
        models/
        usage/
        memberships/
        agents/
        settlements/
        trial-cards/
        admin-logs/
        canvas/
      prisma/
      app.ts
    package.json

  deploy/
    nginx.conf
    ecosystem.config.js
    backup-db.sh

  docs/
    backend-admin-system-final-implementation-plan.md

  README.md
  .env.example
```

## 5. 角色设计

第一版只保留 4 类角色：

| 角色 | 说明 |
|---|---|
| USER | 普通用户，使用无限画布、充值、消费 |
| AGENT | 代理，录入客户、领取账号、核销、查看业绩 |
| ADMIN | 管理员，管理用户、代理、订单、流水、模型 |
| SUPER_ADMIN | 超级管理员，管理系统配置、上游 key、管理员账号 |

第一版不做复杂权限表，直接使用 `users.role` 控制菜单和接口。

## 6. 核心业务流程

### 6.1 用户消费流程

```text
用户登录
  -> 查看余额
  -> 选择模型
  -> 发起生成
  -> 后端检查余额
  -> 后端调用上游中转
  -> 生成成功
  -> 扣除用户积分
  -> 写钱包流水
  -> 写模型调用记录
  -> 如果用户绑定代理，生成代理佣金
```

生成失败：

```text
生成失败
  -> 不扣费
  -> 写失败记录
  -> 前端提示失败原因
```

### 6.6 代理客户归属规则

代理录入客户时，系统以 `users.agent_id` 和 `agent_customers.user_id/customer_phone` 双重校验归属。

规则：

```text
客户未绑定代理
  -> 当前代理可录入
  -> 写入 users.agent_id
  -> 写入 agent_customers

客户已绑定当前代理
  -> 返回已绑定记录
  -> 不重复创建

客户已绑定其他代理
  -> 拒绝录入
  -> 返回 CUSTOMER_BOUND_TO_OTHER_AGENT
  -> 提示当前归属代理
```

这样可以避免“张三拉来的客户被李四抢走”。只要客户是通过代理渠道绑定，后续会员购买和核销都可以追溯到原代理。

### 6.7 代理业绩口径

代理工作台展示：

```text
客户数
核销数
待结佣金
已结佣金
已领账号
已核销账号
下级代理数
下级核销数
```

下级代理列表展示每个下级的：

```text
客户数
核销数
佣金总额
待结佣金
```

佣金记录会展开来源：

```text
客户
会员套餐
会员账号
来源类型
金额
状态
创建时间
```

### 6.2 图片计费

图片模型按张计费。

示例：

```text
gpt-image-2
售价：500 积分/张
成本：后台记录上游成本
```

字段：

```text
unit = IMAGE
sale_price = 500
cost_price = 可选
```

### 6.3 视频计费

视频模型按秒计费。

示例：

```text
基础视频：300 积分/秒
5 秒视频 = 1500 积分
10 秒视频 = 3000 积分
```

可以加质量倍率：

```text
普通质量：1.0
高清：1.5
超清：2.0
```

公式：

```text
用户扣除积分 = 秒数 * 每秒积分价格 * 质量倍率
```

### 6.4 语言模型计费

语言模型按 token 美元成本倍率换算积分。

口径：

```text
一刀 = 1 美元上游 token 成本
```

当前配置：

```text
gpt-5.4：两毛一刀，即 1 美元成本 = 0.2 元人民币
gpt-5.5：八毛一刀，即 1 美元成本 = 0.8 元人民币
```

如果平台积分规则为：

```text
1 积分 = 0.01 元
```

则：

```text
gpt-5.4：1 美元成本 = 20 积分
gpt-5.5：1 美元成本 = 80 积分
```

计费公式：

```text
上游成本美元 =
  input_tokens / 1,000,000 * input_price_usd_per_1m
  + output_tokens / 1,000,000 * output_price_usd_per_1m

用户扣除积分 =
  上游成本美元 * credits_per_usd_cost * markup_rate
```

示例：

```text
模型：gpt-5.5
credits_per_usd_cost = 80
markup_rate = 1.5
input_tokens = 10000
output_tokens = 2000
input_price = 1 美元 / 1M tokens
output_price = 5 美元 / 1M tokens

上游成本 =
10000 / 1000000 * 1 + 2000 / 1000000 * 5
= 0.02 美元

用户扣除积分 =
0.02 * 80 * 1.5
= 2.4 积分
```

实际扣费建议向上取整：

```text
charged_credits = ceil(计算结果)
```

## 7. 代理规则

### 7.1 客户绑定

- 客户只能绑定一个代理。
- 代理张三录入的客户，代理李四不能抢。
- 客户以后续费或再次消费，仍然归属原代理。
- 后台可以人工改绑，但必须写操作日志。

### 7.2 代理取号

- 代理可以领取会员核销账号。
- 每次领取 1-10 个。
- 领取账号不产生成本。
- 领取只是备货。

### 7.3 代理核销

```text
代理提交核销
  -> 校验账号是否归属该代理
  -> 校验客户是否绑定该代理
  -> 核销成功
  -> 开通用户会员
  -> 生成代理业绩
  -> 生成佣金记录
```

核心原则：

```text
不以取号对账，只以核销对账。
```

### 7.4 下级代理

第一版只支持一层下级代理：

```text
一级代理
  └── 下级代理
```

一级代理可以：

- 创建下级代理
- 查看下级代理业绩
- 给自己提前储备账号

平台账务第一版只算到直接代理，不处理代理之间私下分账。

## 8. 功能模块

### 8.1 登录和用户

功能：

- 用户注册
- 用户登录
- 退出登录
- JWT 登录态
- 获取当前用户
- 用户禁用/启用
- 用户详情

后台页面：

- 用户列表
- 用户详情
- 用户余额
- 用户会员
- 用户所属代理

### 8.2 钱包和积分

功能：

- 用户钱包
- 余额查询
- 后台加款
- 后台扣款
- 消费扣费
- 钱包流水

规则：

- 每个用户一个钱包。
- 每次余额变化必须写流水。
- 后台调账必须写备注。

### 8.3 模型和上游渠道

功能：

- 上游渠道配置
- 上游 `baseUrl`
- 上游 `apiKey`
- 模型列表
- 模型类型：图片、视频、语言
- 模型价格
- 模型启用/停用
- 模型调用记录

后台页面：

- 上游渠道
- 模型列表
- 模型价格
- 调用记录

### 8.4 会员和账号池

功能：

- 会员套餐
- 用户会员状态
- 批量生成会员账号
- 会员账号领取
- 会员账号核销
- 账号作废

账号状态：

```text
AVAILABLE     可领取
CLAIMED       已领取
REDEEMED      已核销
VOIDED        已作废
```

### 8.5 代理系统

功能：

- 创建代理
- 设置一级代理/普通代理
- 代理客户绑定
- 代理领取账号
- 代理核销账号
- 下级代理
- 代理业绩
- 佣金记录

### 8.6 结算系统

第一版手动结算。

功能：

- 佣金列表
- 待结算
- 已结算
- 管理员手动标记已结算
- 结算备注

状态：

```text
PENDING      待结算
SETTLED      已结算
CANCELLED    已取消
```

### 8.7 体验卡

当前已落地能力：

- 后台批量生成体验卡，可选择绑定代理，也可生成平台通用卡。
- 代理工作台可自行生成体验卡，设置数量和有效天数，并复制卡码发给潜在客户。
- 用户在账户中心兑换体验卡后，系统会开通对应会员权益。
- 通过代理体验卡兑换的用户会自动绑定该代理，已绑定其他代理的用户不能被抢绑。
- 体验卡支持 AVAILABLE、USED、VOIDED、EXPIRED 四种状态。
- 列表和兑换前会自动把已过期的可用卡标记为 EXPIRED。
- 后台可作废未使用体验卡，并记录后台操作日志。
- 后台和代理端均可查看使用用户、使用时间、过期时间和套餐。

兑换规则：

- 体验卡只能兑换一次。
- 已使用、已作废、已过期的卡不能兑换。
- 如果用户已有未过期会员，体验卡会员从当前会员到期后顺延。
- 代理绑定以首次归属为准，后续通过该代理渠道续费或兑换仍归属原代理。

### 8.8 无限画布接入

后续给画布提供：

- 登录态
- 当前用户
- 钱包余额
- 可用模型列表
- 生成前余额检查
- 生成成功扣费
- 工作流保存
- 工作流读取

## 9. 后台页面菜单

```text
首页
  - 数据概览

用户管理
  - 用户列表
  - 用户详情

账户管理
  - 钱包列表
  - 流水记录
  - 消耗记录
  - 后台调账

模型管理
  - 上游渠道
  - 模型列表
  - 模型价格
  - 调用记录

会员管理
  - 会员套餐
  - 会员账号池
  - 核销记录

代理管理
  - 代理列表
  - 代理客户
  - 下级代理
  - 代理业绩

结算管理
  - 佣金记录
  - 结算记录

体验卡
  - 体验卡列表
  - 使用记录

系统设置
  - 管理员账号
  - 操作日志
```

## 10. 数据库表

第一版共 18 张表。

### 10.1 用户

```text
users
  id
  phone
  email
  password_hash
  nickname
  role
  status
  agent_id
  created_at
  updated_at
```

### 10.2 钱包

```text
wallets
  id
  user_id
  balance
  created_at
  updated_at

wallet_logs
  id
  user_id
  type
  amount
  balance_before
  balance_after
  related_type
  related_id
  remark
  created_at
```

流水类型：

```text
RECHARGE
CONSUME
REFUND
ADMIN_ADD
ADMIN_DEDUCT
COMMISSION
SETTLEMENT
```

### 10.3 模型

```text
upstream_providers
  id
  name
  base_url
  api_key_encrypted
  status
  created_at

ai_models
  id
  provider_id
  name
  display_name
  type
  unit
  sale_price
  cost_price
  price_per_second
  input_price_usd_per_1m
  output_price_usd_per_1m
  cny_per_usd_cost
  credits_per_usd_cost
  markup_rate
  status
  created_at

model_usages
  id
  user_id
  model_id
  model_type
  quantity
  duration_seconds
  sale_amount
  cost_amount
  input_tokens
  output_tokens
  total_tokens
  cost_usd
  charged_credits
  status
  request_id
  upstream_task_id
  error_message
  created_at
```

### 10.4 会员

```text
membership_plans
  id
  name
  price
  duration_days
  status

user_memberships
  id
  user_id
  plan_id
  started_at
  expired_at
  source
```

### 10.5 会员账号池

```text
member_accounts
  id
  code
  plan_id
  status
  claimed_agent_id
  claimed_at
  redeemed_user_id
  redeemed_at
  created_at
```

### 10.6 代理

```text
agents
  id
  user_id
  name
  level
  parent_agent_id
  commission_rate
  settlement_delay_days
  status
  created_at

agent_customers
  id
  agent_id
  user_id
  customer_phone
  customer_name
  created_at

account_claims
  id
  agent_id
  quantity
  created_at

account_redemptions
  id
  account_id
  agent_id
  user_id
  plan_id
  commission_amount
  status
  redeemed_at
```

关键唯一约束：

```text
agent_customers.user_id UNIQUE
agent_customers.customer_phone UNIQUE
member_accounts.code UNIQUE
```

### 10.7 佣金和结算

```text
commission_logs
  id
  agent_id
  user_id
  source_type
  source_id
  amount
  status
  settled_at
  created_at

settlements
  id
  agent_id
  amount
  status
  remark
  created_at
  settled_at
```

### 10.8 体验卡

```text
trial_cards
  id
  code
  agent_id
  plan_id
  status
  expired_at
  used_user_id
  used_at
```

### 10.9 画布工作流

```text
canvas_workflows
  id
  user_id
  name
  data_json
  created_at
  updated_at
```

### 10.10 操作日志

```text
admin_logs
  id
  admin_user_id
  action
  target_type
  target_id
  remark
  created_at
```

## 11. API 规划

### 11.1 登录

```text
POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/me
```

登录接口带轻量失败次数限制：同一 IP + 账号 15 分钟内连续失败 10 次后返回 `LOGIN_RATE_LIMITED`，成功登录会清除失败计数。

### 11.2 用户和钱包

```text
GET   /api/users
POST  /api/users
GET   /api/users/:id
PATCH /api/users/:id/status
PATCH /api/users/:id/password

GET   /api/wallets
GET   /api/wallets/:userId/logs
POST  /api/wallets/:userId/adjust

GET   /api/recharge/orders
POST  /api/recharge/orders
GET   /api/recharge/orders/:orderNo
POST  /api/recharge/orders/:orderNo/mock-pay
POST  /api/recharge/orders/:orderNo/close
```

用户管理规则：

- 后台可创建普通用户和管理员账号。
- 只有超级管理员可以创建或管理 ADMIN / SUPER_ADMIN 账号。
- 管理员可启用、禁用普通用户和代理登录账号。
- 禁用当前登录账号会被拒绝，避免误操作锁死后台。
- 管理员可重置用户密码，系统生成的新密码只在本次操作后展示。

### 11.3 模型

用户侧：

```text
GET /api/models
GET /api/models?type=IMAGE
GET /api/models?type=VIDEO
GET /api/models?type=LLM
GET /api/models/:id
```

后台：

```text
GET   /api/admin/upstream-providers
POST  /api/admin/upstream-providers
PATCH /api/admin/upstream-providers/:id

GET   /api/admin/models
POST  /api/admin/models
PATCH /api/admin/models/:id
GET   /api/admin/model-usages

GET   /api/admin/system-settings
PATCH /api/admin/system-settings
```

### 11.4 生成扣费

```text
POST /api/usage/check
POST /api/usage/consume
```

`/api/usage/check` 用于生成前检查余额。

`/api/usage/consume` 用于生成成功后扣费并写记录。

第一版不做三段式预占，后续并发上来再升级为：

```text
preflight
commit
cancel
```

### 11.4.1 统一生成代理 API

画布前端后续优先调用这一组接口。上游 `baseUrl/apiKey` 只保存在后台，前端用户不可见。

图片生成：

```text
POST /api/generate/image
```

请求：

```json
{
  "modelId": "模型ID",
  "prompt": "生成提示词",
  "size": "1024x1024",
  "quantity": 1,
  "endpointPath": "/images/generations"
}
```

计费：

```text
按张扣积分：quantity * sale_price
```

视频生成：

```text
POST /api/generate/video/start
POST /api/generate/video/status
```

请求：

```json
{
  "modelId": "模型ID",
  "prompt": "视频提示词",
  "durationSeconds": 5,
  "aspectRatio": "9:16",
  "resolution": "720p",
  "endpointPath": "/video/generations"
}
```

计费：

```text
按秒扣积分：durationSeconds * price_per_second
```

`/api/generate/video/status` 用来代理上游任务状态查询，支持 GET 型和 POST 型上游。传 `usageId` 时，任务完成后会回写生成记录的结果地址。

语言模型：

```text
POST /api/generate/llm/chat
```

请求：

```json
{
  "modelId": "模型ID",
  "messages": [
    { "role": "user", "content": "帮我优化这个提示词" }
  ],
  "maxOutputTokens": 4096,
  "endpointPath": "/chat/completions"
}
```

计费：

```text
按上游返回 usage 的 input/output tokens 计算积分。
如果上游没有返回 usage，则用文本长度估算。
```

### 11.5 会员账号和代理

```text
GET   /api/membership/plans
POST  /api/membership/plans
PATCH /api/membership/plans/:id

GET  /api/member-accounts
POST /api/member-accounts/batch-create
POST /api/member-accounts/:id/void

GET   /api/agents
POST  /api/agents
GET   /api/agents/:id
PATCH /api/agents/:id

GET  /api/agent/customers
POST /api/agent/customers
POST /api/agent/accounts/claim
POST /api/agent/accounts/redeem
GET  /api/agent/performance
```

### 11.6 结算

```text
GET  /api/commissions
POST /api/commissions/:id/settle
GET  /api/settlements
POST /api/settlements
POST /api/settlements/agent/:agentId/settle-pending
```

### 11.7 无限画布工作流

```text
GET  /api/account/me
GET  /api/account/wallet

POST /api/canvas/workflows
GET  /api/canvas/workflows
GET  /api/canvas/workflows/:id
PUT  /api/canvas/workflows/:id
DELETE /api/canvas/workflows/:id
```

## 12. 开发计划

### 第 1 周：项目骨架

交付：

- `admin-web`
- `api-server`
- PostgreSQL 连接
- Prisma 初始化
- 登录页面
- 后台基础布局
- JWT 鉴权
- Nginx/PM2 部署脚本

验收：

- 本地能启动。
- 云服务器能部署。
- 管理员能登录。
- API 健康检查正常。

### 第 2 周：用户和钱包

交付：

- 用户表
- 钱包表
- 钱包流水表
- 用户列表
- 用户详情
- 后台加款/扣款

验收：

- 新用户自动创建钱包。
- 后台调账后余额和流水一致。
- 禁用用户不能登录。

### 第 3 周：模型和计费

交付：

- 上游渠道配置
- 模型列表
- 图片模型价格
- 视频按秒价格
- LLM token 汇率配置
- 模型调用记录
- `/api/models`
- `/api/usage/check`
- `/api/usage/consume`

验收：

- 能配置 `gpt-image-2`。
- 能配置视频模型按秒计费。
- 能配置 `gpt-5.4` 两毛一刀。
- 能配置 `gpt-5.5` 八毛一刀。
- 用户看不到上游 key。
- 消耗能写入钱包流水和模型调用记录。

### 第 4 周：会员和账号池

交付：

- 会员套餐
- 用户会员状态
- 会员账号池
- 批量生成账号
- 账号状态管理

验收：

- 可生成会员账号。
- 账号可领取、核销、作废。
- 核销后能开通会员。

### 第 5 周：代理 MVP

交付：

- 代理列表
- 创建代理
- 一级代理/普通代理
- 代理客户绑定
- 代理领取账号
- 代理核销账号
- 代理业绩统计

验收：

- 客户不能重复绑定。
- 代理每次领取 1-10 个账号。
- 领取不计成本。
- 核销才计业绩。

### 第 6 周：佣金、结算和体验卡

交付：

- 核销生成佣金
- 佣金列表
- 手动结算
- 结算记录
- 体验卡生成
- 体验卡兑换

验收：

- 代理能看到自己业绩。
- 管理员能手动结算。
- 体验卡可兑换会员权益。

### 第 7 周：画布接入 API 和上线整理

交付：

- `/api/account/me`
- `/api/account/wallet`
- `/api/canvas/workflows`
- 操作日志
- 部署文档
- 数据库备份脚本
- 初始化管理员账号

验收：

- 无限画布可以接登录、余额、模型列表、扣费、工作流保存。
- 后台能看到用户消耗记录。
- 后台能看到模型调用记录。
- 服务器可稳定运行。

## 13. 上线前检查

安全：

- 上游 key 不出现在前端。
- 上游 key 加密存储。
- 登录接口有密码哈希。
- 后台接口校验角色。
- 调账、作废、结算写操作日志。

财务：

- 每次扣费都有钱包流水。
- 钱包余额不能扣成负数。
- 生成失败不扣费。
- 后台调账必须写备注。

代理：

- 客户绑定唯一。
- 账号核销唯一。
- 领取账号不产生佣金。
- 核销成功才产生佣金。

部署：

- PM2 守护 API 服务。
- Nginx 配置 HTTPS。
- PostgreSQL 每日备份。
- `.env` 不提交代码仓库。

## 14. 交付物

代码：

- 后台管理前端
- 代理端页面
- 后端 API
- Prisma 数据库迁移
- 初始化种子数据
- 部署脚本

文档：

- API 文档
- 部署文档
- 管理员操作说明
- 代理端操作说明
- 计费规则说明

## 15. 最终原则

第一版只追求三个结果：

```text
能收费
能查账
能代理核销
```

只要这三个闭环稳定，后续再扩展 API Key 分发、复杂代理层级、自动结算和更细权限系统。
