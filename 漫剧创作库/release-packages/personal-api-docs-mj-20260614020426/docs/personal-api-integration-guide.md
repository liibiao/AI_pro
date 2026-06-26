# 个人 API 对接文档

本文档记录个人 / 自建 API 通道接入方式。当前已覆盖：

- MJ 文生图：Midjourney Imagine 异步提交 + 轮询取图

---

## 一、通用配置

### 环境变量

```bash
export IMAGE_STUDIO_API_KEY="你的个人 API Key"
export MIDJOURNEY_IMAGE_MAX_WAIT_SECONDS=600
export MIDJOURNEY_IMAGE_POLL_INTERVAL_SECONDS=4
```

说明：

- `IMAGE_STUDIO_API_KEY`：如果个人代理服务需要鉴权，放在请求头 `Authorization: Bearer ...`。
- `MIDJOURNEY_IMAGE_MAX_WAIT_SECONDS`：画布后台等待 MJ 任务完成的最长时间，默认 `600` 秒。
- `MIDJOURNEY_IMAGE_POLL_INTERVAL_SECONDS`：轮询间隔，默认 `4` 秒，最低按 `2` 秒处理。

### 画布模型配置文件

当前模型配置位于：

```text
smart-vision/canvas/legacy-workbench/workbench-web/models/midjourney-imagine.json
```

关键字段：

```json
{
  "id": "midjourney-imagine",
  "adapter": "midjourney-imagine",
  "baseUrl": "https://your-midjourney-proxy.example.com",
  "endpointPath": "/mj/submit/imagine",
  "statusEndpointPath": "/mj/task/{taskId}/fetch",
  "uploadMode": "object_storage",
  "defaults": {
    "botType": "MID_JOURNEY",
    "speedMode": "FAST"
  }
}
```

接入真实服务时需要修改：

- `baseUrl`：个人 MJ 代理服务根地址。
- `key` 或运行时 API Key：如果服务需要鉴权，填入对应 Key 或通过环境变量注入。
- `statusEndpointPath`：如果上游查询接口不是 `/mj/task/{taskId}/fetch`，在这里改成真实路径。

---

## 二、MJ 文生图 API

### 适用范围

MJ 文生图用于通过 Midjourney Imagine 直接生成图片，适合：

- 角色 / 场景 / 道具概念图
- 封面探索
- 漫剧分镜关键帧
- 带参考图的图生图 / 风格探索

当前画布侧使用 `midjourney-imagine` adapter，对应后端 payload 构建函数：

```text
smart-vision/services/workbench/image_studio_backend.py
```

### 调用流程

1. 前端选择 `Midjourney Imagine` 模型。
2. 后端拼装 `prompt`，将参考图 URL 前缀写入 MJ prompt。
3. 后端向个人代理服务提交 `POST /mj/submit/imagine`。
4. 代理服务返回任务 ID。
5. 后端按 `statusEndpointPath` 轮询任务状态。
6. 轮询结果中出现图片 URL 后，统一返回 `{ "data": [{ "url": "..." }] }` 给画布。

---

## 三、提交接口

### Endpoint

```text
POST {baseUrl}/mj/submit/imagine
```

示例：

```text
POST https://your-midjourney-proxy.example.com/mj/submit/imagine
```

### Headers

```http
Content-Type: application/json
Authorization: Bearer ${IMAGE_STUDIO_API_KEY}
```

如果个人代理服务不需要鉴权，可以省略 `Authorization`。

### 最小请求体

```json
{
  "botType": "MID_JOURNEY",
  "prompt": "cinematic manga key visual, a young swordsman standing in a ruined neon street, dramatic rim light, rain, high detail --ar 9:16 --v 7"
}
```

### 带速度模式

```json
{
  "botType": "MID_JOURNEY",
  "prompt": "ancient fantasy palace at night, moonlight, epic composition, cinematic lighting --ar 16:9 --v 7",
  "accountFilter": {
    "modes": ["FAST"]
  }
}
```

可用速度模式：

- `RELAX`
- `FAST`
- `TURBO`

注意：当前后端会在 `--v 8.1` 时自动去掉 `TURBO`，避免上游不兼容。

### 带公网参考图

MJ 支持把公网图片 URL 放在 prompt 最前面作为 image prompt：

```json
{
  "botType": "MID_JOURNEY",
  "prompt": "https://example.com/ref-character.png full body character design sheet, same identity, cinematic manga style --ar 2:3 --v 7 --iw 2"
}
```

画布里传入的 `reference_images` / `image` / `mjPromptImageUrls` 会被后端整理：

- 公网 URL：自动放到 prompt 前缀。
- `data:image/...` 或内部 file id：转成 `base64Array` 提交。

### 带 base64Array

```json
{
  "botType": "MID_JOURNEY",
  "prompt": "character portrait, preserve identity, dramatic lighting --ar 3:4 --v 7",
  "base64Array": [
    "iVBORw0KGgoAAAANSUhEUg..."
  ]
}
```

### 可选字段

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `botType` | string | 默认 `MID_JOURNEY`。 |
| `prompt` | string | 必填，完整 MJ 提示词，参数放末尾。 |
| `base64Array` | string[] | 可选，本地参考图转 base64 后提交。 |
| `state` | string | 可选，业务自定义透传状态。 |
| `notifyHook` | string | 可选，上游任务完成回调地址。 |
| `accountFilter.instanceId` | string | 可选，指定账号实例。 |
| `accountFilter.modes` | string[] | 可选，`RELAX` / `FAST` / `TURBO`。 |
| `accountFilter.remix` | boolean | 可选，是否使用 remix。 |
| `accountFilter.nijiRemix` | boolean | 可选，是否使用 niji remix。 |
| `accountFilter.remark` | string | 可选，账号备注筛选。 |

---

## 四、查询接口

### Endpoint

默认：

```text
GET {baseUrl}/mj/task/{taskId}/fetch
```

示例：

```text
GET https://your-midjourney-proxy.example.com/mj/task/123456789/fetch
```

如果你的个人代理服务使用查询参数形式，也可以把模型配置改成：

```json
{
  "statusEndpointPath": "/mj/task/fetch"
}
```

后端会自动追加：

```text
?taskId={taskId}&task_id={taskId}&id={taskId}
```

### 提交成功响应示例

后端能识别以下常见任务 ID 结构：

```json
{
  "code": 1,
  "description": "提交成功",
  "result": "123456789"
}
```

或：

```json
{
  "code": 200,
  "data": {
    "taskId": "123456789"
  }
}
```

### 查询中响应示例

```json
{
  "status": "IN_PROGRESS",
  "progress": "45%"
}
```

后端会识别这些状态字段：

- 顶层：`status` / `state` / `action`
- `data.status` / `data.state`
- `result.status` / `result.state`

### 完成响应示例

```json
{
  "status": "SUCCESS",
  "progress": "100%",
  "imageUrl": "https://example.com/mj-result.png"
}
```

图片 URL 可以出现在常见字段里，只要字段名包含：

- `url`
- `uri`
- `image`
- `output`
- `result`

后端会递归提取图片 URL，并标准化为：

```json
{
  "data": [
    {
      "url": "https://example.com/mj-result.png"
    }
  ],
  "taskId": "123456789"
}
```

失败状态会被识别为：

- `failed`
- `failure`
- `fail`
- `error`
- `cancelled`
- `canceled`

---

## 五、curl 测试

### 提交任务

```bash
curl -X POST "https://your-midjourney-proxy.example.com/mj/submit/imagine" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${IMAGE_STUDIO_API_KEY}" \
  -d '{
    "botType": "MID_JOURNEY",
    "prompt": "cinematic manga storyboard frame, a heroine looking back in heavy rain, neon alley, dramatic rim light, high detail --ar 9:16 --v 7",
    "accountFilter": {
      "modes": ["FAST"]
    }
  }'
```

### 查询任务

```bash
curl -X GET "https://your-midjourney-proxy.example.com/mj/task/123456789/fetch" \
  -H "Authorization: Bearer ${IMAGE_STUDIO_API_KEY}"
```

---

## 六、画布字段映射

画布 / 后端会把以下字段合并到 MJ 请求：

| 画布字段 | MJ 请求影响 |
| --- | --- |
| `prompt` | 主提示词。 |
| `aspectRatio` / `aspect_ratio` / `requestedRatio` | 若 prompt 未写 `--ar`，自动追加 `--ar`。 |
| `mjParams` / `midjourneyParams` | 若 prompt 未写版本参数，作为 MJ 参数后缀追加。 |
| `reference_images` / `image` | 参考图，公网 URL 放到 prompt 前，本地图转 `base64Array`。 |
| `mjPromptImageUrls` | 明确作为 image prompt 的参考图 URL。 |
| `botType` | 默认 `MID_JOURNEY`。 |
| `speedMode` / `mjSpeedMode` / `modes` | 写入 `accountFilter.modes`。 |
| `state` | 原样透传给上游。 |
| `notifyHook` | 原样透传给上游。 |

### MJ 参数兼容处理

后端会做少量安全清洗：

- `--style raw` 会规范为 `--raw`。
- MJ V7：`--cref` 会转换为 `--oref ... --ow 100`。
- MJ V8.1：会移除 `--cref` / `--oref` / `--cw` / `--ow` / `--q`。
- Niji 7：会移除 `--cref` / `--oref` / `--cw` / `--ow`，并把非法 `--q` 限制为 `--q 1`。

---

## 七、排障

### 提交后没有 taskId

检查提交响应里是否包含以下任一字段：

- `result`
- `data.result`
- `taskId`
- `task_id`
- `id`
- `data.taskId`
- `data.task_id`
- `data.id`

### 任务完成但画布拿不到图片

确保查询响应里的图片 URL 字段名包含 `url` / `uri` / `image` / `output` / `result` 之一。

推荐返回：

```json
{
  "status": "SUCCESS",
  "imageUrl": "https://example.com/output.png"
}
```

### 轮询超时

增大：

```bash
export MIDJOURNEY_IMAGE_MAX_WAIT_SECONDS=900
```

### 参考图失败

优先使用公网 HTTPS 图片 URL。若传本地文件，画布需要先上传到对象存储，或让后端转换为 `base64Array` 后提交。

### 鉴权失败

确认个人代理服务是否要求：

```http
Authorization: Bearer <key>
```

如果服务使用其他鉴权头，需要在后端请求头构造逻辑中同步适配。
