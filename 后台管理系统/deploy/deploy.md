# 轻量部署说明

## 1. 服务器准备

```bash
apt update
apt install -y nginx postgresql postgresql-client
npm install -g pm2
```

安装 Node.js 20+ 后继续。

如果服务器使用 Docker 部署数据库，也可以直接运行：

```bash
docker compose up -d postgres
```

## 2. 配置环境变量

```bash
cp .env.example .env
cp api-server/.env.example api-server/.env
```

生产环境也可以从模板开始：

```bash
cp deploy/env.production.example .env
cp deploy/env.production.example api-server/.env
```

修改：

```text
DATABASE_URL
JWT_SECRET
ENCRYPTION_SECRET
CORS_ORIGIN
UPSTREAM_TIMEOUT_MS
```

注意：`api-server/.env` 主要给 Prisma CLI 使用，根目录 `.env` 给 PM2 启动的 API 服务使用。两边的 `DATABASE_URL` 应保持一致。

## 3. 安装和构建

```bash
npm install --prefix api-server
npm install --prefix admin-web
npm run prisma:generate
npm run prisma:deploy
npm run seed
npm run build
npm run selfcheck
```

本机健康检查：

```bash
chmod +x deploy/healthcheck.sh
deploy/healthcheck.sh
```

浏览器烟测需要临时启动一个带 DevTools 端口的 Chrome：

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new \
  --remote-debugging-port=9223 \
  --user-data-dir=/tmp/ai-admin-headless-chrome \
  --disable-gpu \
  --no-first-run \
  http://127.0.0.1:5174

npm run browser:smoke
```

## 4. 启动 API

```bash
pm2 start deploy/ecosystem.config.cjs
pm2 save
```

## 5. Nginx

复制 `deploy/nginx.conf` 到站点配置，调整 `root` 路径后重载：

```bash
nginx -t
systemctl reload nginx
```

`/integrations/` 已代理到 API 服务，用于正式域名加载无限画布桥接脚本。

## 6. 数据库备份

```bash
chmod +x deploy/backup-db.sh
DATABASE_URL="postgresql://..." deploy/backup-db.sh
```

建议加入 crontab 每日执行。
