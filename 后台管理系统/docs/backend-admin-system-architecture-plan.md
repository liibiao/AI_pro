# 后台管理系统架构设计与开发落地计划书

> 说明：本文件是完整扩展版设计，适合后续业务量变大后参考。当前上线开发以轻量版为准：`docs/backend-admin-system-lightweight-plan.md`。

## 1. 项目目标

本项目要建设一套独立于无限画布前端的业务后台系统，先把用户、账户、代理、会员、核销、财务、结算和后台管理能力完整搭建起来。无限画布前端后续只通过 API 接入，不直接耦合后台管理系统的页面、业务状态和数据库。

系统目标：

- 支持用户注册、登录、登录态维护、会员权益校验。
- 支持账户余额、充值、消耗、记账、财务流水。
- 支持代理体系，包括客户绑定、会员账号领取、核销、下级代理、业绩统计、体验卡。
- 支持平台后台管理，包括用户、代理、账号池、核销、订单、流水、结算、权限和审计。
- 支持后续给无限画布前端提供稳定 API，例如登录、余额查询、生成扣费、工作流保存、会员权限校验。

核心原则：

- 前端无限画布和后台管理系统解耦。
- 业务数据以服务端数据库为准。
- 财务数据以不可随意修改的流水为准。
- 代理对账以核销为准，不以取号为准。
- 客户归属必须唯一，避免代理抢客纠纷。

## 2. 系统边界

### 2.1 后台管理系统负责

- 用户账户体系
- 登录认证和权限控制
- 钱包余额和财务流水
- 充值订单和消耗记录
- 会员产品和会员权益
- 会员账号池生成、领取、核销
- 代理和下级代理管理
- 代理客户绑定
- 代理业绩、佣金、结算
- 体验卡发放和使用
- 平台管理后台界面
- 对外业务 API
- 审计日志和风控规则

### 2.2 无限画布前端负责

- 画布交互
- 节点工作流
- 图片/视频生成操作入口
- 展示当前用户、余额、会员状态
- 调用后台 API 做登录、扣费、保存、权限校验

### 2.3 现有工作台服务负责

- 具体图片/视频生成执行
- 本地文件代理
- 图片/视频落盘
- 模型配置和上传链路

后续可以有两种集成方式：

1. 后台系统只负责业务和扣费，画布继续调用现有工作台生成接口。
2. 后台系统把现有工作台服务封装成内部生成服务，对画布暴露统一业务 API。

第一阶段建议使用第 1 种，改造风险最低。

## 3. 推荐技术架构

### 3.1 前端后台

推荐：

- React
- TypeScript
- Vite
- Ant Design Pro 或 Ant Design
- TanStack Query
- Zustand
- ECharts

原因：

- 后台页面多，Ant Design 适合表格、筛选、弹窗、表单、权限和财务管理。
- TanStack Query 适合处理列表、详情、分页、缓存、刷新。
- Zustand 适合存储登录态、菜单、当前用户、权限点。

### 3.2 后端服务

推荐：

- NestJS
- TypeScript
- PostgreSQL
- Prisma ORM
- Redis
- BullMQ

原因：

- NestJS 适合模块化业务系统。
- Prisma 适合快速定义复杂业务表结构和迁移。
- PostgreSQL 适合财务流水、代理关系、订单、审计。
- Redis 用于登录态、验证码、频率限制、临时预占。
- BullMQ 用于结算任务、异步统计、导出任务、通知任务。

可替代方案：

- Java Spring Boot + PostgreSQL，适合更重的企业后台。
- Python FastAPI + PostgreSQL，适合快速开发，但大型权限/财务系统需要更强约束。

### 3.3 部署架构

```text
Nginx
  ├── admin-web        后台管理前端
  ├── agent-web        代理端，可与 admin-web 同项目不同路由
  └── api-server       NestJS API 服务

api-server
  ├── PostgreSQL       业务数据库
  ├── Redis            缓存、登录态、限流、任务队列
  ├── Object Storage   文件、导出报表、凭证
  └── Workbench API    现有无限画布/生图服务，后续内部调用
```

## 4. 角色和权限模型

### 4.1 角色

| 角色 | 说明 |
|---|---|
| 普通用户 | 使用无限画布、购买会员、查看余额和消耗 |
| 代理 | 录入客户、取会员账号、核销、查看自己业绩 |
| 一级/初创代理 | 可创建下级代理、查看下级业绩、提前储备账号 |
| 平台管理员 | 管理全部业务数据 |
| 财务管理员 | 管理充值、流水、结算、调账 |
| 运营管理员 | 管理会员产品、体验卡、代理配置 |
| 超级管理员 | 系统配置、权限、管理员账号、审计 |

### 4.2 权限粒度

采用 RBAC + 数据范围控制：

- RBAC 控制能不能访问某个功能。
- 数据范围控制能看到谁的数据。

权限示例：

```text
user.read
user.update
wallet.read
wallet.adjust
ledger.read
agent.read
agent.create
agent.sub.create
agent.performance.read
member_account.create
member_account.claim
member_account.redeem
settlement.read
settlement.pay
audit.read
```

数据范围：

```text
ALL              平台全部数据
SELF             只看自己
AGENT_TREE       看自己和下级代理
DIRECT_AGENT     只看直属代理
FINANCE_ONLY     只看财务相关数据
```

## 5. 功能模块划分

## 5.1 用户系统

### 功能

- 注册
- 登录
- 登出
- Refresh Token
- 密码重置
- 手机/邮箱绑定
- 用户状态管理
- 登录记录
- 角色绑定
- 会员状态查询

### 页面

- 用户列表
- 用户详情
- 用户登录记录
- 用户所属代理
- 用户订单
- 用户余额和流水
- 用户会员状态

### 关键规则

- 用户状态包括正常、禁用、冻结、注销。
- 禁用用户不能登录。
- 冻结用户可以登录但不能消费。
- 所有登录、改密、冻结、解冻要写审计日志。

## 5.2 账户和钱包系统

### 功能

- 钱包账户
- 余额查询
- 充值订单
- 消耗扣费
- 冻结余额
- 退款
- 人工调账
- 财务流水

### 记账原则

余额不是唯一依据，流水才是最终依据。

每一笔资金变化都写入 `ledger_entries`：

```text
RECHARGE          充值
CONSUME           消耗
REFUND            退款
ADJUST_IN         人工加款
ADJUST_OUT        人工扣款
FREEZE            冻结
UNFREEZE          解冻
COMMISSION        佣金入账
SETTLEMENT        结算出账
```

### 消耗流程

```text
生成前
  -> 费用预估
  -> 余额检查
  -> 创建 usage_reservation
  -> 冻结预计费用

生成成功
  -> 创建 usage_record
  -> 写 CONSUME 流水
  -> 扣减冻结金额

生成失败/取消
  -> 释放冻结金额
  -> reservation 标记取消
```

### 页面

- 钱包列表
- 流水列表
- 充值订单
- 消耗记录
- 人工调账
- 异常账务

## 5.3 会员系统

### 功能

- 会员产品管理
- 会员套餐价格
- 会员有效期
- 会员权益配置
- 会员购买
- 会员续费
- 会员到期
- 会员核销

### 会员权益示例

```text
monthly_generate_quota
daily_generate_limit
canvas_workflow_save_limit
max_upload_size
premium_model_access
video_generate_access
commercial_license
```

### 页面

- 会员产品列表
- 会员订单
- 用户会员状态
- 会员权益配置

## 5.4 会员账号池系统

这是代理系统的核心基础。

### 功能

- 批量生成会员账号
- 账号池导入
- 账号分配
- 代理领取
- 账号核销
- 账号作废
- 账号状态追踪

### 状态

```text
AVAILABLE       可领取
CLAIMED         已被代理领取
RESERVED        预留
REDEEMED        已核销
VOIDED          已作废
EXPIRED         已过期
```

### 核心规则

- 代理领取账号不产生成本。
- 核销成功才产生成本、业绩和佣金。
- 代理每次可领取 1-10 个，后台可配置。
- 一级/初创代理可提前储备更多账号，额度由后台配置。

### 页面

- 账号池列表
- 批量生成账号
- 账号领取记录
- 账号核销记录
- 账号异常处理

## 5.5 代理系统

### 功能

- 代理资料
- 代理等级
- 代理状态
- 代理客户绑定
- 代理取号
- 代理核销
- 下级代理
- 下级业绩
- 佣金计算
- 结算
- 体验卡

### 代理等级

```text
NORMAL_AGENT       普通代理
FOUNDER_AGENT      一级/初创代理
SUB_AGENT          下级代理
```

### 客户绑定规则

- 客户一旦绑定代理，默认永久归属该代理。
- 张三录入的客户，李四不能再次绑定。
- 如果客户下月续费，只要归属关系还在，张三继续拿提成。
- 后台可以人工改绑，但必须有审批原因和审计日志。
- 每次购买、核销、续费都要记录当时的代理归属快照。

### 下级代理规则

- 只有一级/初创代理可创建下级代理。
- 一级/初创代理可查看下级代理业绩。
- 平台只和直接代理结算。
- 代理与下级代理之间如何分配账号和收益，是代理内部关系；平台侧只记录平台对直接代理的账。

### 取号规则

- 默认每次 1-10 个。
- 后台可配置单次上限、每日上限、库存上限。
- 取号只改变账号状态为已领取，不记成本。
- 对账以核销记录为准。

### 核销规则

```text
代理提交核销
  -> 校验账号是否属于该代理或其允许范围
  -> 校验客户是否绑定该代理
  -> 核销成功
  -> 生成 redemption
  -> 生成 commission_entry
  -> 进入 T+1/T+2/T+3 待结算
```

### 页面

- 代理列表
- 代理详情
- 代理客户
- 下级代理
- 代理取号
- 核销记录
- 业绩统计
- 佣金明细
- 结算单

## 5.6 体验卡系统

### 功能

- 后台生成体验卡
- 代理领取体验卡
- 代理发放体验卡
- 用户使用体验卡
- 体验卡到期
- 使用记录

### 规则

- 体验卡默认不产生代理佣金。
- 可配置是否计入业绩。
- 可配置每个代理可发放数量。
- 可配置每个用户可使用次数。
- 可配置体验卡权益和有效期。

### 页面

- 体验卡批次
- 体验卡列表
- 发放记录
- 使用记录

## 5.7 佣金和结算系统

### 功能

- 佣金规则配置
- 核销后生成佣金
- T+1/T+2/T+3 可结算
- 异常冻结
- 结算单
- 打款记录
- 结算导出

### 佣金状态

```text
PENDING        待确认
FROZEN         冻结中
SETTLEABLE     可结算
SETTLED        已结算
CANCELLED      已取消
```

### 对账规则

- 以核销成功时间为准。
- 根据代理配置决定 T+1、T+2、T+3。
- 若发生退款、撤销、异常，则佣金冻结或冲正。

### 页面

- 佣金规则
- 佣金流水
- 待结算列表
- 结算单管理
- 打款确认
- 异常佣金

## 5.8 管理后台系统

### Dashboard

- 今日新增用户
- 今日充值金额
- 今日消耗金额
- 今日核销数量
- 今日代理业绩
- 待结算佣金
- 异常订单
- 账号池库存

### 用户管理

- 用户列表
- 用户详情
- 余额和流水
- 订单
- 会员
- 所属代理

### 财务管理

- 充值订单
- 消耗记录
- 流水
- 调账
- 退款
- 财务导出

### 代理管理

- 代理列表
- 代理审核
- 代理客户
- 下级代理
- 业绩
- 佣金
- 结算

### 会员管理

- 会员产品
- 会员订单
- 账号池
- 核销记录

### 系统管理

- 管理员账号
- 角色权限
- 系统配置
- 审计日志

## 6. 数据库设计

### 6.1 用户和权限

```text
users
  id
  phone
  email
  password_hash
  nickname
  status
  registered_channel
  created_at
  updated_at

user_sessions
  id
  user_id
  refresh_token_hash
  ip
  user_agent
  expires_at
  revoked_at

roles
  id
  code
  name

permissions
  id
  code
  name

user_roles
  user_id
  role_id

role_permissions
  role_id
  permission_id
```

### 6.2 钱包和流水

```text
wallet_accounts
  id
  user_id
  balance
  frozen_balance
  currency
  version

ledger_entries
  id
  wallet_id
  user_id
  type
  direction
  amount
  balance_before
  balance_after
  biz_type
  biz_id
  remark
  created_by
  created_at

recharge_orders
  id
  user_id
  amount
  pay_amount
  status
  payment_channel
  paid_at

usage_reservations
  id
  user_id
  scene
  estimated_cost
  frozen_amount
  status
  expires_at

usage_records
  id
  user_id
  reservation_id
  scene
  model
  quantity
  actual_cost
  workflow_id
  node_id
  provider_task_id
  status
```

### 6.3 会员

```text
membership_products
  id
  name
  duration_days
  price
  benefits_json
  status

membership_orders
  id
  user_id
  product_id
  amount
  agent_id
  status
  paid_at

user_memberships
  id
  user_id
  product_id
  starts_at
  expires_at
  source
```

### 6.4 会员账号池和核销

```text
membership_accounts
  id
  code
  product_id
  status
  created_batch_id
  claimed_by_agent_id
  claimed_at
  redeemed_by_user_id
  redeemed_at
  expires_at

membership_account_batches
  id
  product_id
  quantity
  created_by
  created_at

membership_account_claims
  id
  agent_id
  quantity
  account_ids_json
  status
  created_at

membership_redemptions
  id
  account_id
  account_code
  agent_id
  customer_user_id
  product_id
  cost_amount
  commission_amount
  status
  redeemed_at
```

### 6.5 代理

```text
agents
  id
  user_id
  code
  name
  level
  status
  parent_agent_id
  claim_limit_per_time
  claim_limit_daily
  settlement_delay_days
  commission_rule_id

agent_relations
  id
  ancestor_agent_id
  descendant_agent_id
  depth

agent_customer_bindings
  id
  agent_id
  customer_user_id
  customer_account
  source
  status
  bound_at
  UNIQUE(customer_user_id)
  UNIQUE(customer_account)

agent_commission_rules
  id
  name
  type
  rate
  fixed_amount
  status

agent_commission_entries
  id
  agent_id
  customer_user_id
  redemption_id
  order_id
  amount
  status
  settleable_at

agent_settlements
  id
  agent_id
  amount
  status
  period_start
  period_end
  paid_at
```

### 6.6 体验卡和审计

```text
trial_cards
  id
  code
  batch_id
  agent_id
  benefits_json
  status
  expires_at

trial_card_uses
  id
  card_id
  user_id
  agent_id
  used_at

audit_logs
  id
  actor_user_id
  actor_role
  action
  resource_type
  resource_id
  before_json
  after_json
  ip
  user_agent
  created_at
```

## 7. API 模块规划

第一阶段只设计，不要求无限画布立即接入。

```text
/api/auth
/api/account
/api/users
/api/wallet
/api/billing
/api/membership
/api/member-accounts
/api/agents
/api/agent-console
/api/trial-cards
/api/settlements
/api/admin
/api/audit-logs
/api/canvas
```

### 关键 API

```text
POST /api/auth/register
POST /api/auth/login
POST /api/auth/refresh
POST /api/auth/logout
GET  /api/account/me

GET  /api/wallet/me
GET  /api/wallet/ledger
POST /api/billing/usage/preflight
POST /api/billing/usage/commit
POST /api/billing/usage/cancel

POST /api/agents/customers
GET  /api/agents/customers
POST /api/agents/member-accounts/claim
POST /api/agents/member-accounts/redeem
GET  /api/agents/performance
POST /api/agents/sub-agents
GET  /api/agents/sub-agents

GET  /api/admin/dashboard
GET  /api/admin/users
GET  /api/admin/agents
GET  /api/admin/ledger
GET  /api/admin/redemptions
GET  /api/admin/settlements
```

## 8. 前端后台页面结构

```text
/login

/dashboard

/users
/users/:id

/wallets
/billing/recharges
/billing/usages
/billing/ledger
/billing/adjustments

/membership/products
/membership/orders
/membership/accounts
/membership/redemptions

/agents
/agents/:id
/agents/customers
/agents/claims
/agents/redemptions
/agents/commissions
/agents/settlements

/trial-cards

/system/admin-users
/system/roles
/system/permissions
/system/config
/system/audit-logs
```

代理端页面：

```text
/agent/dashboard
/agent/customers
/agent/accounts/claim
/agent/accounts/redeem
/agent/sub-agents
/agent/performance
/agent/commissions
/agent/trial-cards
```

## 9. 开发落地计划

### 阶段 0：项目初始化

交付：

- 前端后台项目
- 后端 API 项目
- PostgreSQL 和 Redis 配置
- Prisma schema
- Docker Compose
- 环境变量模板
- 基础 CI 检查

验收：

- 本地可启动前后端。
- 数据库迁移可执行。
- 健康检查接口可访问。

### 阶段 1：认证和权限

交付：

- 登录
- 注册
- Refresh Token
- 管理员登录
- RBAC 权限
- 菜单权限
- 审计日志基础能力

验收：

- 不同角色看到不同菜单。
- 未登录不能访问后台接口。
- 禁用用户不能登录。

### 阶段 2：用户和账户

交付：

- 用户管理
- 钱包账户
- 充值订单
- 流水
- 人工调账
- 消耗预占/确认/取消

验收：

- 每次余额变化都有流水。
- 调账必须写审计日志。
- 生成扣费可走预占、确认、取消。

### 阶段 3：会员和账号池

交付：

- 会员产品
- 会员订单
- 用户会员状态
- 账号池批量生成
- 账号状态流转

验收：

- 可以生成一批会员账号。
- 账号状态从可领取到已领取再到已核销完整流转。

### 阶段 4：代理 MVP

交付：

- 代理资料
- 代理客户绑定
- 代理取号 1-10 个
- 代理核销
- 核销生成业绩和佣金

验收：

- 客户只能绑定一个代理。
- 领取账号不记成本。
- 核销成功才记业绩和佣金。

### 阶段 5：代理子系统

交付：

- 一级/初创代理创建下级代理
- 下级代理列表
- 下级代理业绩
- 代理账号储备额度
- 体验卡发放

验收：

- 普通代理不能创建下级代理。
- 一级代理能看到下级业绩。
- 平台账只算到直接代理。

### 阶段 6：佣金和结算

交付：

- 佣金规则
- T+1/T+2/T+3 结算
- 结算单
- 异常冻结
- 打款确认
- 财务导出

验收：

- 核销后佣金进入待确认。
- 到期后变为可结算。
- 结算后生成结算记录和流水。

### 阶段 7：后台完善和风控

交付：

- Dashboard
- 高级筛选
- 导出
- 审计日志
- 风控规则
- 异常订单处理
- 数据备份策略

验收：

- 管理员可追踪关键业务数据。
- 财务敏感操作可审计。
- 异常核销可冻结处理。

### 阶段 8：对无限画布开放 API

交付：

- `GET /api/account/me`
- `GET /api/wallet/me`
- `POST /api/billing/usage/preflight`
- `POST /api/billing/usage/commit`
- `POST /api/billing/usage/cancel`
- `GET/POST/PUT /api/canvas/workflows`

验收：

- 无限画布能登录。
- 生成前能校验余额。
- 生成成功能扣费。
- 工作流能保存到账号。

## 10. 项目目录建议

```text
后台管理系统/
  apps/
    admin-web/
    api-server/
  packages/
    shared/
    database/
  docs/
    backend-admin-system-architecture-plan.md
    api/
  infra/
    docker-compose.yml
    nginx/
  scripts/
  .env.example
  package.json
```

## 11. 风险和处理策略

### 财务数据不一致

处理：

- 余额字段加版本号。
- 所有资金变化必须事务内写流水。
- 定期做余额与流水对账。

### 代理抢客

处理：

- 客户绑定表加唯一约束。
- 后台改绑必须审计。
- 订单和核销记录保留当时代理快照。

### 取号和核销纠纷

处理：

- 领取不算账。
- 核销才算账。
- 领取、核销、作废都留记录。

### 佣金结算争议

处理：

- 设置 T+1/T+2/T+3。
- 异常订单可冻结。
- 结算单生成后不可直接删除，只能冲正。

### 前后端耦合

处理：

- 后台先独立完成。
- 通过 API 给无限画布接入。
- 画布不直接访问后台数据库。

## 12. 第一版 MVP 范围

建议第一版不要一次做太大，先做可运营闭环：

必须有：

- 登录注册
- 用户管理
- 钱包和流水
- 消耗预占/确认/取消
- 会员产品
- 账号池
- 代理客户绑定
- 代理取号
- 代理核销
- 佣金记录
- 管理后台基础页面

暂缓：

- 复杂多级分销
- 自动打款
- 多支付渠道
- 复杂风控模型
- 多租户
- 大规模 BI 报表

第一版只做一级/初创代理和直属下级代理，避免代理层级过深导致结算复杂。

## 13. 交付物清单

### 架构交付

- 系统架构图
- 数据库 ERD
- API 文档
- 权限矩阵
- 财务流水规则
- 代理业务规则

### 代码交付

- 后台前端
- 后端 API
- 数据库迁移
- 初始化种子数据
- Docker 本地环境
- 单元测试和核心集成测试

### 运营交付

- 管理员操作手册
- 代理端操作手册
- 财务对账说明
- 异常处理流程
