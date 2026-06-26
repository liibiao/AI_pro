# AI 后台管理系统

轻量上线版后台系统，负责用户、钱包、模型计费、代理、会员账号核销、佣金结算和无限画布 API 接入。

## 目录

- `admin-web`：后台管理前端
- `api-server`：后端 API
- `deploy`：Nginx、PM2、备份脚本
- `docs`：方案文档
- `integrations/canvas`：无限画布接入脚本

## 本地启动

```bash
cp .env.example .env
cp api-server/.env.example api-server/.env
npm install --prefix api-server
npm install --prefix admin-web
npm run db:up
npm run prisma:generate
npm run prisma:migrate
npm run seed
npm run dev:api
npm run dev:web
```

说明：API 服务会读取根目录 `.env`，Prisma CLI 默认读取 `api-server/.env`。本地开发建议两个文件都复制，数据库连接保持一致。

默认后台管理员由 seed 创建：

```text
手机号：13800000000
密码：admin123456
```

## 充值模式

默认 `PAYMENT_MODE=voucher`，即兑换码线下支付模式：超级管理员线下收款后在“线下充值码”给指定用户生成兑换码；代理可用管理员配给的额度给自己的绑定客户生成兑换码，也可以先向管理员提交配额申请。用户在账户中心或画布前端输入兑换码完成充值入账。

本地调试如需二维码或模拟支付，可在后台“系统设置”切换为 `alipay` 或 `mock`。接支付宝二维码支付时，需要填写支付宝参数；也可以通过 `.env` 作为默认值：

```text
ALIPAY_APP_ID
ALIPAY_PRIVATE_KEY
ALIPAY_PUBLIC_KEY
ALIPAY_NOTIFY_URL
```

## 生成联调

默认 `GENERATION_MOCK_MODE=true`，后台“生成联调”可在没有上游 key 的情况下测试图片、视频、语言模型调用。Mock 模式仍会执行鉴权、余额校验、扣费和生成记录写入。

接真实上游时，可在后台“系统设置”关闭生成 Mock 模式，再到“模型管理 / 上游渠道”配置真实 `baseUrl` 和 API Key。

当前本机已接入的上游记录见 [当前上游接入记录](docs/current-upstream-config.md)。

当前积分比例和模型扣费见 [积分消费比例方案](docs/pricing-plan.md)。

## 无限画布接入

API 服务会托管画布接入脚本：

```text
http://127.0.0.1:4000/integrations/canvas/canvas-platform-bridge.js
```

接入步骤见 [无限画布兼容接入文档](docs/canvas-workbench-compat.md)。

如果画布项目已经配置了 COS/S3/R2，可以让后台只读取其中的对象存储配置：

```bash
OBJECT_STORAGE_ENV_FILE=/Users/billy/Documents/AI_pro/漫剧创作库/.env npm run dev:api
```

## 当前主方案

见 [最终开发落地方案](docs/backend-admin-system-final-implementation-plan.md)。

## 部署

轻量部署文件在 `deploy/`：

- `deploy/env.production.example`：生产环境变量模板
- `deploy/ecosystem.config.cjs`：PM2 API 进程配置
- `deploy/nginx.conf`：后台静态站点和 API 反向代理
- `deploy/backup-db.sh`：PostgreSQL 备份脚本
- `deploy/healthcheck.sh`：API 健康检查脚本

详细步骤见 [部署说明](deploy/deploy.md)。

## 前端烟测

启动 API、后台前端和一个带 DevTools 端口的临时 Chrome 后，可执行：

```bash
npm run browser:smoke
```

脚本会登录后台并检查主要菜单、表格和关键弹窗。

## 业务烟测

启动 API 后可执行：

```bash
npm run business:smoke
```

脚本会创建临时测试代理和客户，验证代理客户绑定、会员账号领取/并发核销、代理额度凭证并发兑换等账务关键链路。该脚本会写入测试数据，只用于本地或测试库。

## 创作库数据包

API 已提供文件型创作库数据包 registry：

- 用户读取：`GET /api/data-packs`、`GET /api/data-packs/active`
- 管理员写入：`POST /api/admin/data-packs`
- 默认存储：`data/data-pack-registry.json`

智能视界通过 `POST /api/smart-vision/data-packs/sync` 同步这里的配置。当前已注册 `manju-creation-library`，后续广告、电商、电影、自媒体宣传片等定制创作库也走同一接口。
