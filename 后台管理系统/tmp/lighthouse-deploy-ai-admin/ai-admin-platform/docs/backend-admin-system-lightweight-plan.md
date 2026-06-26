# 后台管理系统轻量上线版计划书

## 1. 建设目标

先做一套能上线运营、部署简单、逻辑清晰的后台管理系统。系统独立于无限画布前端，后续通过 API 给画布接入登录、余额、会员、扣费、工作流保存等能力。

当前阶段不做复杂微服务、不做重型权限平台、不做复杂多级分销、不做自动化结算大系统。先把业务闭环跑通：

```text
用户注册登录
  -> 充值/余额
  -> 使用画布调用图片/视频/语言模型并扣费
  -> 代理绑定客户
  -> 代理领取会员账号
  -> 核销会员账号
  -> 后台查看业绩和结算
```

## 2. 轻量技术架构

### 2.1 推荐技术栈

前端后台：

- React
- TypeScript
- Vite
- Ant Design
- TanStack Query

后端：

- Node.js
- Express 或 Fastify
- TypeScript
- Prisma ORM
- PostgreSQL

部署：

- 一台云服务器
- Nginx
- PM2
- PostgreSQL
- 静态前端文件

暂不引入：

- Redis
- BullMQ
- 微服务
- Kubernetes
- 复杂消息队列
- 独立权限中心
- 多租户系统

这些以后业务量上来再补。

### 2.2 部署结构

```text
云服务器
  ├── Nginx
  │   ├── /admin        后台管理前端
  │   ├── /agent        代理端页面
  │   └── /api          后端 API 反向代理
  │
  ├── Node API 服务
  │   ├── 用户/登录
  │   ├── 账户/流水
  │   ├── 会员/核销
  │   ├── 代理/佣金
  │   └── 管理后台 API
  │
  └── PostgreSQL
      └── 全部业务数据
```

### 2.3 项目目录

```text
后台管理系统/
  admin-web/              后台前端
  api-server/             后端 API
  docs/                   文档
  deploy/                 Nginx、PM2、部署脚本
  package.json
  README.md
```

不拆 `apps/packages`，先保持清楚直接。

## 3. 系统角色

先保留 4 类角色：

| 角色 | 用途 |
|---|---|
| 用户 | 使用无限画布、充值、购买会员 |
| 代理 | 录入客户、取账号、核销、看业绩 |
| 管理员 | 管理用户、代理、账号池、订单、流水 |
| 超级管理员 | 管理管理员账号、系统配置、敏感操作 |

暂时不做复杂权限点表。第一版用 `role` 字段控制菜单和接口权限：

```text
USER
AGENT
ADMIN
SUPER_ADMIN
```

如果需要财务专员、运营专员，第二版再拆。

## 4. 核心业务规则

### 4.1 用户规则

- 用户可以注册、登录、退出。
- 用户有一个钱包余额。
- 用户可以有会员状态。
- 用户可以绑定一个代理。
- 用户被禁用后不能登录和消费。

### 4.2 账户规则

- 每个用户一个钱包。
- 余额字段用于快速查询。
- 每次余额变化必须写流水。
- 人工调账必须写原因。
- 生成扣费失败时不能扣钱。

第一版不做复杂冻结余额。生成流程可以简化为：

```text
生成前检查余额
  -> 余额足够，允许生成
  -> 生成成功，扣费并写流水
  -> 生成失败，不扣费
```

如果担心并发扣费，接口里用数据库事务和行锁处理即可。

### 4.3 代理规则

- 客户只能绑定一个代理。
- 张三绑定的客户，李四不能抢。
- 客户下个月再买会员，仍然归属张三。
- 代理可以领取会员账号，每次 1-10 个。
- 领取账号不算成本。
- 核销成功才算业绩、成本和佣金。
- 一级代理可以创建下级代理。
- 第一版只支持一层下级代理，不做无限层级。

### 4.4 结算规则

第一版结算不做自动打款，只做后台记录：

```text
核销成功
  -> 生成佣金记录
  -> 状态为待结算
  -> 管理员手动标记已结算
```

T+1/T+2/T+3 可以先作为代理配置字段保留，但第一版可以先用后台筛选和人工确认处理。

## 5. 功能模块

## 5.1 登录和用户模块

### 用户端 API

- 注册
- 登录
- 退出
- 获取当前用户
- 修改密码

### 后台页面

- 用户列表
- 用户详情
- 用户余额
- 用户会员状态
- 用户所属代理
- 禁用/启用用户

### 第一版字段

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

## 5.2 钱包和流水模块

### 功能

- 查看余额
- 后台充值
- 后台扣款
- 生成消耗扣费
- 查看流水

### 页面

- 钱包列表
- 流水列表
- 手动加款/扣款
- 消耗记录

### 数据表

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
RECHARGE        充值
CONSUME         消耗
REFUND          退款
ADMIN_ADD       后台加款
ADMIN_DEDUCT    后台扣款
COMMISSION      佣金
SETTLEMENT      结算
```

## 5.3 会员模块

### 功能

- 会员套餐管理
- 用户会员状态
- 会员购买记录
- 会员账号核销后开通会员

### 页面

- 会员套餐
- 会员订单
- 用户会员列表

### 数据表

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

## 5.4 会员账号池模块

### 功能

- 后台批量生成账号
- 代理领取账号
- 代理核销账号
- 后台查看账号状态

### 状态

```text
AVAILABLE     可领取
CLAIMED       已领取
REDEEMED      已核销
VOIDED        已作废
```

### 页面

- 账号池列表
- 批量生成
- 领取记录
- 核销记录

### 数据表

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

## 5.5 模型和上游渠道模块

这是商业平台模式的核心配置模块。用户不接触上游 key，只看到你平台上的模型名称、功能和价格。后台统一保存上游中转站的 key。

### 模型分类

第一版支持 3 类模型：

```text
IMAGE       出图模型，例如 gpt-image-2
VIDEO       视频模型，例如生视频额度对应的模型
LLM         语言大模型，例如 gpt-5.5、deepseek
```

### 功能

- 配置上游渠道，例如合伙人的 New API 中转。
- 配置上游 `baseUrl` 和 `apiKey`。
- 配置模型列表和模型类型。
- 配置你的销售价格。
- 记录上游成本价格，方便算毛利。
- 启用/停用模型。
- 后台查看模型调用记录。

### 定价方式

图片模型：

```text
按张计费
例如：gpt-image-2 每张售价 5 元
```

视频模型：

```text
按秒计费，必要时叠加分辨率/质量倍率
例如：基础价 3 元/秒，5 秒视频 15 元，10 秒视频 30 元
高清视频可设置 1.5 倍，超清可设置 2 倍
```

语言大模型：

采用 token 汇率积分制：

```text
按上游 token 消耗成本换算为平台积分。
每个语言模型单独配置输入 token 价格、输出 token 价格、美元汇率、加价倍率。
```

计费公式：

```text
上游成本美元 =
  input_tokens / 1,000,000 * input_price_usd_per_1m
  + output_tokens / 1,000,000 * output_price_usd_per_1m

用户扣除积分 =
  上游成本美元 * 美元兑积分汇率 * 加价倍率
```

示例：

```text
假设：
1 美元 = 1000 积分
加价倍率 = 1.5
输入价格 = 1 美元 / 1M tokens
输出价格 = 5 美元 / 1M tokens

某次调用：
input_tokens = 10000
output_tokens = 2000

上游成本 =
10000 / 1000000 * 1 + 2000 / 1000000 * 5
= 0.01 + 0.01
= 0.02 美元

用户扣除积分 =
0.02 * 1000 * 1.5
= 30 积分
```

当前语言模型汇率配置：

```text
口径：一刀 = 1 美元上游 token 成本

gpt-5.4：两毛一刀，即 1 美元成本 = 0.2 元人民币
gpt-5.5：八毛一刀，即 1 美元成本 = 0.8 元人民币

如果平台积分按 1 积分 = 0.01 元：
gpt-5.4：1 美元成本 = 20 积分
gpt-5.5：1 美元成本 = 80 积分
```

后台配置建议：

```text
gpt-5.4:
  model_type = LLM
  billing_mode = TOKEN_USD_RATIO
  cny_per_usd_cost = 0.2
  credits_per_usd_cost = 20

gpt-5.5:
  model_type = LLM
  billing_mode = TOKEN_USD_RATIO
  cny_per_usd_cost = 0.8
  credits_per_usd_cost = 80
```

后台需要保存：

```text
input_tokens
output_tokens
total_tokens
cost_usd
charged_credits
exchange_rate
markup_rate
cny_per_usd_cost
credits_per_usd_cost
```

### 页面

- 上游渠道
- 模型列表
- 模型价格
- 调用记录
- 模型开关

### 数据表

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
  input_price_usd_per_1m
  output_price_usd_per_1m
  cny_per_usd_cost
  exchange_rate_credits_per_usd
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

说明：

- `api_key_encrypted` 必须加密保存，不明文存库。
- `model_usages` 是生成记录和扣费记录的业务来源。
- 钱包扣费仍然写入 `wallet_logs`。

## 5.6 代理模块

### 功能

- 代理列表
- 创建代理
- 设置一级代理/普通代理
- 代理绑定客户
- 代理取号
- 代理核销
- 下级代理
- 业绩统计

### 页面

后台：

- 代理列表
- 代理详情
- 代理客户
- 代理核销记录
- 代理佣金

代理端：

- 我的客户
- 录入客户
- 领取会员账号
- 核销会员账号
- 我的业绩
- 我的下级代理

### 数据表

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

约束：

```text
agent_customers.user_id 唯一
agent_customers.customer_phone 唯一
member_accounts.code 唯一
```

## 5.7 佣金和结算模块

### 功能

- 核销后生成佣金
- 后台查看佣金
- 手动标记结算
- 查看结算历史

### 页面

- 佣金列表
- 待结算
- 已结算
- 代理结算详情

### 数据表

```text
commission_logs
  id
  agent_id
  redemption_id
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

状态：

```text
PENDING      待结算
SETTLED      已结算
CANCELLED    已取消
```

## 5.8 体验卡模块

第一版做简单即可：

- 后台生成体验卡
- 代理领取或发放体验卡
- 用户兑换体验卡
- 后台查看使用记录

数据表：

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

## 5.9 操作日志

第一版只记录关键操作：

- 后台调账
- 禁用用户
- 修改代理
- 作废账号
- 手动结算
- 客户改绑

数据表：

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

不做复杂 before/after JSON，先记录够追责的信息。

## 6. 后台页面菜单

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

## 7. API 规划

### 7.1 登录

```text
POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/me
```

### 7.2 用户和钱包

```text
GET  /api/users
GET  /api/users/:id
PATCH /api/users/:id/status

GET  /api/wallets
GET  /api/wallets/:userId/logs
POST /api/wallets/:userId/adjust
```

### 7.3 画布接入 API

后续给无限画布接入：

```text
GET  /api/account/me
GET  /api/account/wallet
GET  /api/models?type=IMAGE
GET  /api/models?type=VIDEO
GET  /api/models?type=LLM
POST /api/usage/check
POST /api/usage/consume
POST /api/canvas/workflows
GET  /api/canvas/workflows
GET  /api/canvas/workflows/:id
PUT  /api/canvas/workflows/:id
```

第一版扣费可以简化为：

```text
POST /api/usage/check      生成前检查余额
POST /api/usage/consume    生成成功后扣费
```

不做 `preflight/commit/cancel` 三段式，后续并发量上来再升级。

### 7.4 模型和上游渠道

后台管理：

```text
GET  /api/admin/upstream-providers
POST /api/admin/upstream-providers
PATCH /api/admin/upstream-providers/:id

GET  /api/admin/models
POST /api/admin/models
PATCH /api/admin/models/:id
GET  /api/admin/model-usages
```

用户侧：

```text
GET  /api/models
GET  /api/models/:id
```

模型类型参数：

```text
IMAGE       出图模型
VIDEO       视频模型
LLM         语言大模型
```

### 7.5 会员账号和代理

```text
GET  /api/member-accounts
POST /api/member-accounts/batch-create
POST /api/member-accounts/:id/void

GET  /api/agents
POST /api/agents
GET  /api/agents/:id
PATCH /api/agents/:id

GET  /api/agent/customers
POST /api/agent/customers
POST /api/agent/accounts/claim
POST /api/agent/accounts/redeem
GET  /api/agent/performance
```

### 7.6 结算

```text
GET  /api/commissions
POST /api/commissions/:id/settle
GET  /api/settlements
POST /api/settlements
```

## 8. 开发落地计划

### 第 1 周：项目骨架

交付：

- `admin-web`
- `api-server`
- PostgreSQL 连接
- Prisma 初始化
- 登录页面
- 后台基础布局
- Nginx/PM2 部署脚本

验收：

- 云服务器可部署。
- 管理员可登录后台。
- API 健康检查正常。

### 第 2 周：用户和钱包

交付：

- 用户表
- 钱包表
- 钱包流水
- 用户列表
- 用户详情
- 后台加款/扣款

验收：

- 新用户自动创建钱包。
- 后台调账后余额和流水一致。

### 第 3 周：会员和账号池

交付：

- 会员套餐
- 会员账号池
- 批量生成账号
- 账号状态管理
- 上游渠道配置
- 三类模型配置：图片、视频、语言大模型
- 模型售价配置

验收：

- 可生成会员账号。
- 后台能查看账号状态。
- 后台能配置 `gpt-image-2`、视频模型、`gpt-5.5/deepseek` 等语言模型。
- 用户侧只能看到模型名称和价格，看不到上游 key。

### 第 4 周：代理 MVP

交付：

- 代理列表
- 创建代理
- 代理客户绑定
- 代理领取账号
- 代理核销账号

验收：

- 客户不能被重复绑定。
- 代理每次领取 1-10 个账号。
- 核销成功后开通用户会员。

### 第 5 周：佣金和结算

交付：

- 核销生成佣金
- 代理业绩
- 佣金列表
- 手动结算

验收：

- 代理能看到自己业绩。
- 管理员能标记佣金已结算。

### 第 6 周：画布 API 和上线整理

交付：

- `/api/account/me`
- `/api/account/wallet`
- `/api/models`
- `/api/usage/check`
- `/api/usage/consume`
- `/api/canvas/workflows`
- 操作日志
- 部署文档

验收：

- 无限画布可以接登录、余额、模型列表、扣费、保存工作流。
- 后台能查到消耗记录。

## 9. MVP 数据库表清单

第一版控制在这些表内：

```text
users
wallets
wallet_logs
membership_plans
user_memberships
member_accounts
upstream_providers
ai_models
model_usages
agents
agent_customers
account_claims
account_redemptions
commission_logs
settlements
trial_cards
canvas_workflows
admin_logs
```

共 18 张表，足够上线。

## 10. 第一版不做的功能

暂不做：

- 无限层级代理
- 自动打款
- 支付渠道自动回调
- 复杂 RBAC 权限表
- Redis
- 消息队列
- 多租户
- 数据仓库
- 复杂 BI 报表
- 自动风控模型
- 分布式服务

保留扩展口：

- `users.role`
- `agents.parent_agent_id`
- `wallet_logs.related_type`
- `wallet_logs.related_id`
- `admin_logs`
- `canvas_workflows`

后面需要升级时，不会推翻第一版。

## 11. 上线服务器配置建议

最低配置：

```text
2 核 CPU
4GB 内存
40GB 硬盘
Ubuntu 22.04
PostgreSQL 15+
Node.js 20+
Nginx
PM2
```

更稳配置：

```text
2-4 核 CPU
8GB 内存
80GB 硬盘
```

备份：

- 每天凌晨备份 PostgreSQL。
- 保留最近 7 天。
- 重要版本发布前手动备份。

## 12. 最终交付物

- 后台管理前端
- 代理端页面
- 后端 API
- PostgreSQL 数据库迁移
- 初始化管理员账号
- 部署脚本
- API 文档
- 操作说明

第一版的目标不是功能花哨，而是稳定、能查账、能核销、能绑定客户、能给画布扣费。
