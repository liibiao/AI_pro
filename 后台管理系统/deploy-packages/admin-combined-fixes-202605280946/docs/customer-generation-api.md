# 个人生成 API 接入文档（AI 智能体可直接调试版）

> 只覆盖个人 API。企业 API 请看 `enterprise-generation-api.html`。真实依据：`open-api/routes.ts`、`generation/routes.ts`、`schema.prisma`、`production-clean-20260516-105349.sql`。

## 1. Key 创建与鉴权

### 1.1 画布内创建个人 API Key

画布弹窗内点击「创建个人 API Key」，接口使用画布登录 Token：

```http
POST /api/personal-api-tokens
Authorization: Bearer <画布登录 token>
Content-Type: application/json
```

请求体：

```json
{"name":"画布文档快捷创建 API Key"}
```

成功响应：

```json
{
  "ok": true,
  "token": {
    "id": "<PersonalApiToken.id>",
    "name": "画布文档快捷创建 API Key",
    "tokenPrefix": "sk_live_...",
    "status": "ACTIVE",
    "createdAt": "<ISO时间>",
    "plainToken": "sk_live_xxx"
  }
}
```

`plainToken` 只展示一次。生成接口必须使用 `sk_live_xxx`，不要使用画布登录 Token。

### 1.2 生成接口鉴权

```http
Authorization: Bearer sk_live_xxx
Content-Type: application/json
```

## 2. 真实接口列表

| 能力 | 方法 | URL |
|---|---|---|
| 创建生成任务 | `POST` | `/api/open/personal/generation/tasks` |
| 查询任务列表 | `GET` | `/api/open/personal/generation/tasks?limit=100` |
| 查询任务详情 | `GET` | `/api/open/personal/generation/tasks/:id` |
| 主动刷新任务 | `POST` | `/api/open/personal/generation/tasks/:id/query` |

## 3. 生产数据库 ACTIVE 模型示例

服务端按 `channelKey` 查 `upstream_providers.provider_key`，再在该渠道下查 ACTIVE 模型；`modelId` 可匹配 `ai_models.id` / `modelKey` / `name`，推荐传 `ai_models.id`。

| type | channelKey | 推荐 modelId | modelKey | 后台显示名 | adapter | 支持 mode | 真实能力/计费示例 |
|---|---|---|---|---|---|---|---|
| `IMAGE` | `canvas_gpt-image-2-pro` | `canvas-gpt-image-2-pro` | `gpt-image-2` | `GPT-Image-2-pro` | `openai-edits` | `txt2img`, `img2img` | `1K=5积分`, `2K=8积分`, `3K=25积分`, `4K=50积分` |
| `IMAGE` | `canvas_grok-image` | `canvas-grok-image` | `grok-imagine-1.0` | `Grok 文生图` | `grok-image` | `txt2img` | ACTIVE |
| `IMAGE` | `canvas_grok-image-edit` | `canvas-grok-image-edit` | `grok-imagine-1.0-edit` | `Grok 图生图` | `grok-image-edit` | `img2img` | ACTIVE |
| `IMAGE` | `canvas_gemini-image` | `canvas-gemini-image` | `gemini-3-pro-image-preview` | `Gemini 图片` | `gemini-image` | `txt2img`, `img2img` | ACTIVE |
| `IMAGE` | `canvas_gemini-unified-image` | `canvas-gemini-unified-image` | `gemini-3.1-flash-image-preview` | `Gemini 统一文生图` | `gemini-image-generate` | `txt2img` | ACTIVE |
| `IMAGE` | `canvas_gemini-unified-image-edit` | `canvas-gemini-unified-image-edit` | `gemini-3.1-flash-image-preview` | `Gemini 统一图生图` | `gemini-image-edit` | `img2img` | ACTIVE |
| `IMAGE` | `canvas_gemini-pro-image` | `canvas-gemini-pro-image` | `gemini-3-pro-image-preview` | `Gemini Pro 文生图` | `gemini-image-generate` | `txt2img` | ACTIVE |
| `IMAGE` | `canvas_gemini-pro-image-edit` | `canvas-gemini-pro-image-edit` | `gemini-3-pro-image-preview` | `Gemini Pro 图生图` | `gemini-image-edit` | `img2img` | ACTIVE |
| `VIDEO` | `canvas_sora-2` | `canvas-sora-2` | `sora-2` | `sora-2` | `notevideo` | `text2video`, `img2video`, `firstLast`, `smartMultiFrame`, `full` | `36积分/秒`；`duration=4/8/12`；`resolution=720p`；`maxImages.smartMultiFrame=4` |
| `VIDEO` | `canvas_sora-v3-pro` | `canvas-sora-v3-pro` | `sora-v3-pro` | `sora-v3-pro` | `notevideo` | `text2video`, `img2video`, `firstLast`, `smartMultiFrame`, `full` | `36积分/秒`；ACTIVE |
| `VIDEO` | `canvas_sora-v3-vip` | `canvas-sora-v3-vip` | `sora-v3-vip` | `sora-v3-vip` | `notevideo` | `text2video`, `img2video`, `firstLast`, `smartMultiFrame`, `full` | `36积分/秒`；`duration=10/15`；`maxImages.smartMultiFrame=9` |
| `VIDEO` | `canvas_grok-video` | `canvas-grok-video` | `grok-imagine-1.0-video` | `Grok 视频` | `grok-video` | `text2video`, `img2video` | ACTIVE |
| `VIDEO` | `canvas_gemini-veo-video` | `canvas-gemini-veo-video` | `veo-3.1-generate-preview` | `Gemini Veo 视频` | `gemini-video` | `text2video`, `img2video` | ACTIVE |

## 4. 创建任务请求体字段表

| 字段 | 必填 | 类型/枚举 | 示例 | 说明 |
|---|---:|---|---|---|
| `channelKey` | 是 | `string` | `canvas_gpt-image-2-pro` / `canvas_sora-v3-pro` | 必须是 `upstream_providers.provider_key`。 |
| `modelId` | 是 | `string` | `canvas-gpt-image-2-pro` / `canvas-sora-v3-pro` | 推荐传 `ai_models.id`。 |
| `type` | 是 | `IMAGE` / `VIDEO` / `LLM` | `IMAGE` | 必须与模型类型一致。 |
| `mode` | 是 | `txt2img` / `img2img` / `text2video` / `txt2video` / `img2video` / `firstLast` / `smartMultiFrame` / `full` / `chat` | `txt2img` | 后端校验非空，适配器决定生效参数。 |
| `prompt` | 是 | `string` | `一张电影感产品海报，黑色背景，主体居中，高级商业摄影灯光` | 正向提示词。 |
| `negativePrompt` | 否 | `string` | `低清晰度，水印，畸形，多余肢体，闪烁` | 反向提示词。 |
| `inputFiles` | 否 | `array` | `[]` 或 `[ {"url":"<你的真实图片URL>","role":"referenceImage","mimeType":"image/png"} ]` | 图生图/图生视频参考图。当前开放 API 直接创建任务只接收公网可访问 URL；如需本地文件，先上传到你自己的对象存储/资产服务器，再把公网 URL 写入这里。 |
| `params` | 否 | `object` | `{"resolution":"1K","size":"1024x1024","n":1}` | 扩展参数，保存到 `paramsJson` 并透传适配器。 |
| `clientRequestId` | 否 | `string(1-160)` | `openapi-img-20260528-0001` | 幂等 ID；也可用 `Idempotency-Key`。 |


## 5. 参考图上传接口

本地参考图先上传到 `/v1/files`，再把返回 URL 写入生成任务的 `inputFiles[].url`、`params.images`、`params.referenceImages`、`firstFrame` 或 `frames`。不要把本地路径、内网地址、`blob:`、`file:`、`data:` 直接传给生成接口。

| 字段 | 必填 | 类型 | 示例 | 说明 |
|---|---:|---|---|---|
| `file` | 是 | multipart file | `@/path/to/reference.png` | 本地参考图文件，建议 png/jpg/webp。 |
| `purpose` | 否 | string | `reference_image` | 文件用途标记。 |
| `role` | 否 | string | `referenceImage` / `firstFrame` / `frame` | 后续写入 `inputFiles[].role`。 |

```bash
curl -X POST "$BASE_URL/v1/files" \
  -H "Authorization: Bearer $PERSONAL_API_KEY" \
  -F "file=@/path/to/reference.png" \
  -F "purpose=reference_image" \
  -F "role=referenceImage"
```

成功后优先取响应里的 `url` / `downloadUrl` / `contentUrl`：

```json
{
  "id": "file_xxx",
  "url": "https://example.com/uploads/reference.png",
  "downloadUrl": "https://example.com/uploads/reference.png",
  "contentUrl": "https://example.com/uploads/reference.png"
}
```

## 6. params 常见字段

| 字段 | 类型/枚举 | 示例 | 适用 |
|---|---|---|---|
| `size` | `string` | `1024x1024` | 图片 |
| `width` / `height` | `number` | `1024` / `1024` | 图片/视频 |
| `resolution` | `720p` / `1080p` / `1K` / `2K` / `3K` / `4K` / `string` | `1K` | 图片/视频 |
| `n` / `quantity` | `number` | `1` | 图片 |
| `duration` | `number` | `10` | 视频 |
| `fps` | `number` | `24` | 视频 |
| `aspectRatio` / `ratio` | `1:1` / `16:9` / `9:16` / `4:3` / `3:4` / `string` | `16:9` | 图片/视频 |
| `images` | `array<string>` | `["<你的真实图片URL>"]` | 图生图/图生视频 |
| `referenceImages` | `array` | `[ {"url":"<你的真实图片URL>","role":"referenceImage"} ]` | 图生图/多参考 |
| `firstFrame` | `string` | `<你的真实首帧URL>` | `firstLast` / `img2video` |
| `lastFrame` | `string` | `<你的真实尾帧URL>` | `firstLast` |
| `frames` | `array` | `[ {"url":"<你的真实第1帧URL>","order":1} ]` | `smartMultiFrame` |
| `generateAudio` | `boolean` | `false` | 视频 |
| `cameraMotion` | `string` | `slow push in` | 视频 |
| `motionStrength` | `number` | `0.65` | 视频 |
| `seed` | `number|string` | `20260528` | 图片/视频 |
| `metadata` | `object` | `{"source":"open-personal-api"}` | 全部 |

## 7. 文生图完整请求代码

```bash
curl -X POST "$BASE_URL/api/open/personal/generation/tasks" \
  -H "Authorization: Bearer $PERSONAL_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: openapi-img-20260528-0001" \
  -d '{
    "channelKey": "canvas_gpt-image-2-pro",
    "modelId": "canvas-gpt-image-2-pro",
    "type": "IMAGE",
    "mode": "txt2img",
    "prompt": "一张电影感产品海报，黑色背景，主体居中，高级商业摄影灯光，清晰锐利",
    "negativePrompt": "低清晰度，水印，畸形，文字错误，多余物体",
    "inputFiles": [],
    "params": {"resolution":"1K","size":"1024x1024","width":1024,"height":1024,"n":1,"seed":20260528},
    "clientRequestId": "openapi-img-20260528-0001"
  }'
```

## 8. 图生图完整请求代码

把 `<你的真实图片URL>` 换成你的资产库、对象存储或自有服务器中可公网访问的图片地址。不要传本地路径、内网地址、浏览器 `blob:`、`file:` 或 `data:`；后端和上游模型必须能直接访问该 URL。图生视频、首尾帧、多帧参考同理。

```bash
curl -X POST "$BASE_URL/api/open/personal/generation/tasks" \
  -H "Authorization: Bearer $PERSONAL_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: openapi-i2i-20260528-0001" \
  -d '{
    "channelKey": "canvas_gpt-image-2-pro",
    "modelId": "canvas-gpt-image-2-pro",
    "type": "IMAGE",
    "mode": "img2img",
    "prompt": "保留参考图主体结构，改成电影级商业海报质感，背景更干净，光影更高级",
    "negativePrompt": "低清晰度，水印，主体变形，额外文字，错误手指",
    "inputFiles": [{"url":"<你的真实图片URL>","role":"referenceImage","mimeType":"image/png"}],
    "params": {"resolution":"1K","size":"1024x1024","n":1,"images":["<你的真实图片URL>"],"referenceImages":[{"url":"<你的真实图片URL>","role":"referenceImage"}],"seed":20260528},
    "clientRequestId": "openapi-i2i-20260528-0001"
  }'
```

## 9. 文生视频完整请求代码

```bash
curl -X POST "$BASE_URL/api/open/personal/generation/tasks" \
  -H "Authorization: Bearer $PERSONAL_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: openapi-t2v-20260528-0001" \
  -d '{
    "channelKey": "canvas_sora-v3-pro",
    "modelId": "canvas-sora-v3-pro",
    "type": "VIDEO",
    "mode": "text2video",
    "prompt": "雨夜霓虹街道，一名角色从画面左侧走入，镜头缓慢推进，地面积水反射霓虹灯，电影感，高细节",
    "negativePrompt": "画面闪烁，人物崩坏，肢体断裂，低清晰度，水印",
    "inputFiles": [],
    "params": {"duration":10,"resolution":"720p","aspectRatio":"16:9","fps":24,"generateAudio":false,"cameraMotion":"slow push in","motionStrength":0.65},
    "clientRequestId": "openapi-t2v-20260528-0001"
  }'
```

## 10. 图生视频/首尾帧/智能多帧请求代码

```bash
curl -X POST "$BASE_URL/api/open/personal/generation/tasks" \
  -H "Authorization: Bearer $PERSONAL_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: openapi-i2v-20260528-0001" \
  -d '{
    "channelKey": "canvas_sora-v3-pro",
    "modelId": "canvas-sora-v3-pro",
    "type": "VIDEO",
    "mode": "smartMultiFrame",
    "prompt": "根据多张参考帧生成连续镜头：角色从站立到转身再向前走，动作连贯，镜头保持电影感推进",
    "negativePrompt": "画面闪烁，人物漂移，脸部变形，肢体断裂，参考帧错乱",
    "inputFiles": [
      {"url":"<你的真实第1帧URL>","role":"frame","order":1,"mimeType":"image/png"},
      {"url":"<你的真实第2帧URL>","role":"frame","order":2,"mimeType":"image/png"}
    ],
    "params": {
      "duration": 10,
      "resolution": "720p",
      "aspectRatio": "16:9",
      "fps": 24,
      "images": ["<你的真实第1帧URL>","<你的真实第2帧URL>"],
      "firstFrame": "<你的真实第1帧URL>",
      "lastFrame": "<你的真实第2帧URL>",
      "frames": [{"url":"<你的真实第1帧URL>","order":1},{"url":"<你的真实第2帧URL>","order":2}]
    },
    "clientRequestId": "openapi-i2v-20260528-0001"
  }'
```

`mode` 可换：`img2video` 单图生视频；`firstLast` 首尾帧；`smartMultiFrame` 多帧；`full` 全能参考。

## 11. 创建成功响应字段

```json
{
  "ok": true,
  "task": {
    "id": "<GenerationTask.id>",
    "userId": "<当前APIKey所属用户>",
    "clientRequestId": "openapi-img-20260528-0001",
    "providerId": "canvas-provider-gpt-image-2-pro",
    "modelId": "canvas-gpt-image-2-pro",
    "channelKey": "canvas_gpt-image-2-pro",
    "type": "IMAGE",
    "mode": "txt2img",
    "status": "RUNNING",
    "prompt": "...",
    "negativePrompt": "...",
    "inputFilesJson": [],
    "paramsJson": {"resolution":"1K","size":"1024x1024","n":1},
    "upstreamTaskId": "<上游任务ID或null>",
    "upstreamRequestId": "<上游请求ID或null>",
    "resultJson": null,
    "resultUrlsJson": null,
    "chargedCredits": 5,
    "costAmount": 0,
    "costUsd": "0",
    "refundCredits": 0,
    "refundStatus": null,
    "refundReason": null,
    "errorCode": null,
    "errorMessage": null,
    "retryCount": 0,
    "progress": 0,
    "startedAt": "<ISO时间>",
    "completedAt": null,
    "failedAt": null,
    "refundedAt": null,
    "createdAt": "<ISO时间>",
    "updatedAt": "<ISO时间>"
  },
  "balance": 995,
  "chargedCredits": 5
}
```

## 11. task 字段说明

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | `string` | 任务 ID。 |
| `clientRequestId` | `string|null` | 客户端幂等 ID。 |
| `providerId` | `string` | 数据库渠道 ID。 |
| `modelId` | `string` | 数据库模型 ID。 |
| `channelKey` | `string` | 渠道 Key。 |
| `type` | `IMAGE|VIDEO|LLM` | 任务类型。 |
| `mode` | `string` | 生成模式。 |
| `status` | `CREATED|PENDING|RUNNING|SUCCESS|FAILED|TIMEOUT|REFUNDED|CANCELLED|MANUAL_REVIEW` | 任务状态。 |
| `inputFilesJson` | `array` | 请求传入的 `inputFiles`。 |
| `paramsJson` | `object` | 请求传入的 `params`。 |
| `resultJson` | `object|null` | 上游结果原始结构。 |
| `resultUrlsJson` | `array|null` | 结果 URL 列表。 |
| `chargedCredits` | `number` | 扣费积分。 |
| `errorCode/errorMessage` | `string|null` | 失败原因。 |
| `progress` | `number` | 进度。 |
| `model/provider` | `object|undefined` | 列表/详情接口会带摘要。 |

## 12. 查询与轮询

```bash
curl -X GET "$BASE_URL/api/open/personal/generation/tasks/$TASK_ID" -H "Authorization: Bearer $PERSONAL_API_KEY"
curl -X POST "$BASE_URL/api/open/personal/generation/tasks/$TASK_ID/query" -H "Authorization: Bearer $PERSONAL_API_KEY"
curl -X GET "$BASE_URL/api/open/personal/generation/tasks?limit=100" -H "Authorization: Bearer $PERSONAL_API_KEY"
```

```js
const BASE_URL = 'http://124.156.137.236';
const PERSONAL_API_KEY = process.env.PERSONAL_API_KEY;
async function api(path, options = {}) {
  const res = await fetch(BASE_URL + path, {
    ...options,
    headers: { Authorization: `Bearer ${PERSONAL_API_KEY}`, 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const data = await res.json();
  if (!res.ok || data.ok === false) throw new Error(data.error || data.message || data.code || 'API_ERROR');
  return data;
}
async function waitTask(taskId) {
  for (let i = 0; i < 120; i++) {
    const { task } = await api(`/api/open/personal/generation/tasks/${taskId}/query`, { method: 'POST' });
    if (task.status === 'SUCCESS') return task.resultUrlsJson || task.resultJson;
    if (['FAILED','TIMEOUT','REFUNDED','CANCELLED'].includes(task.status)) throw new Error(`${task.status}: ${task.errorCode || ''} ${task.errorMessage || ''}`);
    await new Promise(r => setTimeout(r, 5000));
  }
  throw new Error('WAIT_TIMEOUT');
}
```

## 13. 常见错误码

| code | 含义 |
|---|---|
| `OPEN_API_TOKEN_REQUIRED` | 缺少个人 API Key。 |
| `OPEN_API_TOKEN_INVALID` | Key 无效或禁用。 |
| `USER_DISABLED` | 账号禁用。 |
| `INSUFFICIENT_BALANCE` | 余额不足。 |
| `PROVIDER_NOT_FOUND` | `channelKey` 找不到。 |
| `PROVIDER_DISABLED` | 渠道禁用。 |
| `MODEL_NOT_FOUND` | 模型不可用或 `type/channelKey/modelId` 不匹配。 |
| `GENERATION_TASK_NOT_FOUND` | 任务不存在或不属于当前用户。 |
| `GENERATION_SUBMIT_FAILED` | 提交上游失败。 |
| `UPSTREAM_TASK_ID_MISSING` | 上游未返回任务 ID 或结果。 |

## 14. 给智能体的最小接入信息

```text
BASE_URL=http://124.156.137.236
PERSONAL_API_KEY=sk_live_xxx
创建任务：POST /api/open/personal/generation/tasks
查询任务：GET /api/open/personal/generation/tasks/:id
刷新任务：POST /api/open/personal/generation/tasks/:id/query
文生图：channelKey=canvas_gpt-image-2-pro, modelId=canvas-gpt-image-2-pro, type=IMAGE, mode=txt2img
图生图：channelKey=canvas_gpt-image-2-pro, modelId=canvas-gpt-image-2-pro, type=IMAGE, mode=img2img
生视频：channelKey=canvas_sora-v3-pro, modelId=canvas-sora-v3-pro, type=VIDEO, mode=text2video/img2video/firstLast/smartMultiFrame/full
```
