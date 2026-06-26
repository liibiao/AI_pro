# 无限画布接入后台：兼容模式

目标画布：

`/Users/billy/Documents/AI_pro/漫剧创作库/tools/workbench-web/image-studio-canvas.html`

当前后台已经提供一组兼容接口，尽量复用画布现有 `WorkbenchEngine`，不要求重写生成逻辑。

## 1. 接入方式

在画布 HTML 的 `</body>` 前加入：

```html
<script>
  window.CANVAS_PLATFORM_API_BASE = 'http://127.0.0.1:4000';
</script>
<script src="http://127.0.0.1:4000/integrations/canvas/canvas-platform-bridge.js"></script>
```

加载后页面右上角会出现基础账户面板，可完成：

- 登录 / 注册
- 查看余额
- 创建充值订单
- mock 支付入账
- 自动给画布生成请求附加 `Authorization`
- 生成、充值等余额变动后自动刷新账户余额

## 2. 已兼容的画布接口

画布原有调用：

```text
GET  /api/workbench/image-studio/models
POST /api/workbench/image-studio/generate
GET  /api/workbench/image-studio/image/status
POST /api/workbench/image-studio/video/start
GET  /api/workbench/image-studio/video/status
GET  /api/workbench/image-studio/video/content
POST /api/workbench/image-studio/upload-reference
POST /v1/files
```

bridge 会把这些请求转发到：

```text
http://127.0.0.1:4000/*
```

后端会执行：

- 登录态校验
- 模型读取
- 余额校验
- 图片按张扣费
- 视频按秒扣费
- 生成记录写入
- 钱包流水写入

## 3. 当前限制

mock 模式下，图片会返回可预览的 SVG data URL；视频会返回 mock 任务地址，主要用于验证扣费和记录链路，不能作为真实视频播放。

参考图上传已经走后台对象存储接口：

- `POST /api/workbench/image-studio/upload-reference` 返回可给上游模型使用的公开 URL。
- `POST /v1/files` 返回 `file-...` 兼容 ID，同时保留对象存储 URL，适配只接受 OpenAI file id 的上游。
- 支持 S3 / R2 / COS 风格对象存储；腾讯 COS 使用原生签名，S3 / R2 使用 AWS SigV4。

本地开发时，如果对象存储配置写在画布项目 `.env` 中，可以让后台只读取其中的 `OBJECT_STORAGE_*` 键：

```bash
OBJECT_STORAGE_ENV_FILE=/Users/billy/Documents/AI_pro/漫剧创作库/.env npm run dev:api
```

使用 `npm run dev:all` 启动时，如果画布项目 `.env` 存在 `OBJECT_STORAGE_*` 配置，脚本会自动传给后台服务。

后台实际需要的键：

```text
OBJECT_STORAGE_PROVIDER=cos
OBJECT_STORAGE_ENDPOINT_URL=
OBJECT_STORAGE_REGION=
OBJECT_STORAGE_BUCKET=
OBJECT_STORAGE_PUBLIC_BASE_URL=
OBJECT_STORAGE_ACCESS_KEY_ID=
OBJECT_STORAGE_SECRET_ACCESS_KEY=
OBJECT_STORAGE_PREFIX=mjb-reference
OBJECT_STORAGE_MAX_BYTES=20971520
OBJECT_STORAGE_FORCE_PATH_STYLE=false
```

## 4. 联调顺序

1. 启动 API：`npm run dev:api`
2. 打开后台：`http://127.0.0.1:5174`
3. 确认 `GENERATION_MOCK_MODE=true`
4. 给测试用户充值或后台加余额
5. 在画布加载 bridge 脚本
6. 登录后刷新模型列表
7. 先测试文生图，再测试视频
8. 到后台“模型使用记录”和“钱包流水”核对扣费

如果直接用静态服务打开画布，可以在本机执行：

```bash
python3 -m http.server 8080 --bind 127.0.0.1 --directory /Users/billy/Documents/AI_pro/漫剧创作库/tools/workbench-web
```

然后访问：

```text
http://127.0.0.1:8080/image-studio-canvas.html
```

本地 `.env` 和 `api-server/.env` 的 `CORS_ORIGIN` 需要包含：

```text
http://127.0.0.1:5173,http://127.0.0.1:5174,http://127.0.0.1:8080,http://localhost:8080
```

已经验证的最小闭环：

- 管理员账号 `13800000000 / admin123456` 可在画布账户面板登录。
- 画布模型下拉能读取后台模型，例如 `GPT Image 2`。
- mock 充值 10 元后余额增加 1000 积分。
- 文生图生成成功后，后台写入使用记录和钱包流水。
- 账户面板余额会在生成扣费后自动刷新。

## 5. 切真实上游

后台 `.env`：

```text
GENERATION_MOCK_MODE=false
```

后台“模型管理 / 上游渠道”配置：

- 上游 New API baseUrl
- 上游 API Key
- `gpt-image-2`
- 视频模型
- LLM 模型

切真实上游前，不需要让终端用户接触上游 key；画布拿到的是后台模型 ID 和占位 baseUrl/key，真实 key 只保存在后台。
