# 企业生成 API 接入文档

> 本文档只覆盖企业 API。个人账号请使用 `customer-generation-api.html` / `customer-generation-api.md`。

## 1. 创建和复制企业 API Token

入口：

```text
管理后台 → 企业 API 管理 → 创建企业 → 充值 → 创建 Token
```

操作步骤：

1. 超级管理员进入「企业 API 管理」。
2. 点击「创建企业」，填写企业名称、管理员邮箱 / 手机号、管理员昵称。
3. 给企业充值积分。
4. 在企业行点击「创建 Token」。
5. 创建成功弹窗会展示完整明文 Token，格式为 `ent_live_xxx`。
6. 立即点击「复制企业 Token」并交付给企业客户保存。
7. 关闭弹窗后，系统只保留 Token Hash，不能再次查看明文；如遗失请禁用旧 Token 后重新创建。

企业开放 API 只用于 `/api/open/enterprise/*`；费用扣企业结算钱包，默认按企业 API 规则计费。

## 2. 鉴权方式

所有企业开放 API 请求必须携带：

```http
Authorization: Bearer ent_live_xxx
Content-Type: application/json
```

## 3. 接口列表

| 能力 | 方法 | URL |
|---|---|---|
| 创建生成任务 | `POST` | `/api/open/enterprise/generation/tasks` |
| 查询任务列表 | `GET` | `/api/open/enterprise/generation/tasks?limit=100` |
| 查询任务详情 | `GET` | `/api/open/enterprise/generation/tasks/:id` |
| 主动刷新任务 | `POST` | `/api/open/enterprise/generation/tasks/:id/query` |

## 4. 当前可用模型与参数

服务端会在 `channelKey` 对应渠道下，用 `modelId` 匹配模型 `id` / `modelKey` / `name`。以后台「模型管理」实际启用状态为准，当前画布同步模型如下：

| type | channelKey | modelId | 真实模型名 | 支持 mode |
|---|---|---|---|---|
| `IMAGE` | `canvas_gemini-image` | `canvas-gemini-image` | `gemini-3-pro-image-preview` | `txt2img`, `img2img` |
| `IMAGE` | `canvas_gpt-image-2-pro` | `canvas-gpt-image-2-pro` | `gpt-image-2` | `txt2img`, `img2img` |
| `IMAGE` | `canvas_gpt-image-v2` | `canvas-gpt-image-v2` | `gpt-image-2` | `txt2img`, `img2img` |
| `VIDEO` | `canvas_sora-2` | `canvas-sora-2` | `sora-2` | `text2video`, `img2video` |
| `VIDEO` | `canvas_sora-v3-pro` | `canvas-sora-v3-pro` | `sora-v3-pro` | `text2video`, `img2video` |
| `VIDEO` | `canvas_sora-v3-vip` | `canvas-sora-v3-vip` | `sora-v3-vip` | `text2video`, `img2video` |
| `IMAGE` | `seed_default` | `seed-gpt-image-2` | `gpt-image-2` | `txt2img`, `img2img` |
| `VIDEO` | `seed_default` | `seed-video-basic` | `video-generation` | `txt2video`, `text2video`, `img2video` |
| `LLM` | `seed_default` | `seed-gpt-5-4` | `gpt-5.4` | `chat` |
| `LLM` | `seed_default` | `seed-gpt-5-5` | `gpt-5.5` | `chat` |

`mode` 枚举：`txt2img`、`img2img`、`txt2video`、`text2video`、`img2video`、`chat`。

## 5. 创建生成任务

```http
POST /api/open/enterprise/generation/tasks
Authorization: Bearer ent_live_xxx
Content-Type: application/json
```

### 5.1 图片任务完整示例

```json
{
  "channelKey": "canvas_gpt-image-2-pro",
  "modelId": "canvas-gpt-image-2-pro",
  "type": "IMAGE",
  "mode": "txt2img",
  "prompt": "企业宣传海报，现代科技风，蓝紫渐变，中心产品发光",
  "negativePrompt": "低清晰度，错字，水印，畸形元素",
  "inputFiles": [],
  "params": {
    "size": "1024x1024",
    "width": 1024,
    "height": 1024,
    "resolution": "1k",
    "quality": "high",
    "quantity": 1,
    "n": 1,
    "seed": 123456,
    "transparentBackground": false,
    "referenceImages": [],
    "metadata": {
      "enterpriseOrderId": "ent_order_001",
      "department": "marketing"
    }
  },
  "clientRequestId": "ent_client_order_001"
}
```

### 5.2 图生视频完整示例

```json
{
  "channelKey": "canvas_sora-v3-pro",
  "modelId": "canvas-sora-v3-pro",
  "type": "VIDEO",
  "mode": "img2video",
  "prompt": "产品在暗色科技展台上缓慢旋转，镜头环绕推进，边缘高光扫过金属表面",
  "negativePrompt": "画面闪烁，产品变形，文字水印，低清晰度",
  "inputFiles": [
    {
      "url": "https://example.com/product-first-frame.png",
      "role": "firstFrame",
      "mimeType": "image/png"
    }
  ],
  "params": {
    "duration": 5,
    "fps": 24,
    "resolution": "720p",
    "aspectRatio": "16:9",
    "width": 1280,
    "height": 720,
    "generateAudio": true,
    "cameraMotion": "orbit_push_in",
    "motionStrength": 0.65,
    "seed": 123456,
    "referenceImages": ["https://example.com/product-first-frame.png"],
    "metadata": {
      "enterpriseOrderId": "ent_video_001",
      "campaign": "launch"
    }
  },
  "clientRequestId": "ent_client_video_001"
}
```

### 5.3 请求体参数表

| 字段 | 必填 | 类型穷举 | 说明 |
|---|---:|---|---|
| `channelKey` | 是 | 上表 `channelKey` 枚举 | 渠道 Key，必须与 `modelId` 所属渠道匹配。 |
| `modelId` | 是 | 上表 `modelId` 枚举，也可填模型 `modelKey` / `name` | 模型标识。服务端按 `id → modelKey → name` 匹配。 |
| `type` | 是 | `"IMAGE" \| "VIDEO" \| "LLM"` | 生成类型。 |
| `mode` | 是 | `"txt2img" \| "img2img" \| "txt2video" \| "text2video" \| "img2video" \| "chat"` | 生成模式，必须与模型能力匹配。 |
| `prompt` | 是 | `string` | 正向提示词。不能为空。 |
| `negativePrompt` | 否 | `string` | 反向提示词。 |
| `inputFiles` | 否 | `array` | 输入文件数组；图生图 / 图生视频需传参考图或首帧。 |
| `params` | 否 | `object` | 模型扩展参数；支持 `string` / `number` / `boolean` / `array` / `object` / `null`。 |
| `clientRequestId` | 否 | `string` | 企业维度幂等 ID，长度 1-160。 |

### 5.4 params 常见字段

| 字段 | 类型穷举 | 说明 |
|---|---|---|
| `size` | `string` | 图片尺寸，如 `1024x1024`。 |
| `width` / `height` | `number` | 宽高。 |
| `resolution` | `"720p" \| "1080p" \| "1k" \| "2k" \| "3k" \| "4k" \| string` | 分辨率，按模型能力生效。 |
| `quality` | `"standard" \| "high" \| string` | 图片质量。 |
| `quantity` / `n` | `number` | 生成数量。 |
| `seed` | `number \| string` | 随机种子。 |
| `duration` | `number \| string` | 视频时长，常见 5 / 10 / 15 秒。 |
| `fps` | `number` | 视频帧率。 |
| `aspectRatio` | `"1:1" \| "16:9" \| "9:16" \| "4:3" \| "3:4" \| string` | 输出比例。 |
| `generateAudio` | `boolean` | 是否生成音频。 |
| `referenceImages` | `array` | 参考图 URL / 文件对象数组。 |
| `cameraMotion` | `string` | 运镜提示，是否生效取决于模型。 |
| `motionStrength` | `number` | 运动强度，是否生效取决于模型。 |
| `metadata` | `object` | 企业订单号、部门、活动等自定义信息。 |
| 任意扩展字段 | `string \| number \| boolean \| array \| object \| null` | 会透传给对应模型适配器，未知字段是否生效取决于后台适配器。 |

## 6. 查询任务

```http
GET /api/open/enterprise/generation/tasks/:id
Authorization: Bearer ent_live_xxx
```

```http
POST /api/open/enterprise/generation/tasks/:id/query
Authorization: Bearer ent_live_xxx
```

任务状态：`CREATED`、`PENDING`、`RUNNING`、`SUCCESS`、`FAILED`。

## 7. 常见错误码

| code | 含义 | 处理方式 |
|---|---|---|
| `ENTERPRISE_API_TOKEN_REQUIRED` | 缺少企业 API Token | 检查 `Authorization`。 |
| `ENTERPRISE_API_TOKEN_INVALID` | 企业 Token 无效或已禁用 | 重新创建 Token 或检查复制是否完整。 |
| `ENTERPRISE_API_TOKEN_EXPIRED` | 企业 Token 已过期 | 重新创建 Token。 |
| `ENTERPRISE_DISABLED` | 企业账号已禁用 | 联系超级管理员。 |
| `INSUFFICIENT_BALANCE` | 企业余额不足 | 给企业充值后重试。 |
| `PROVIDER_NOT_FOUND` | 渠道不可用 | 检查 `channelKey`。 |
| `PROVIDER_DISABLED` | 渠道已禁用 | 换可用渠道或联系管理员。 |
| `MODEL_NOT_FOUND` | 模型不可用 | 检查 `modelId`、`type`、模型启用状态。 |
| `GENERATION_TASK_NOT_FOUND` | 任务不存在或无权访问 | 确认任务 ID 属于当前企业 Token。 |
| `GENERATION_SUBMIT_FAILED` | 提交上游失败 | 查看 `errorMessage` 后重试或联系管理员。 |

## 8. 安全说明

- 不要把企业 Token 放到公开网页、GitHub、截图或聊天群。
- 企业客户应在自己的服务端保存 `ent_live_xxx`，不要下发到浏览器端。
- 怀疑泄露后，立刻在「企业 API 管理」禁用旧 Token 并创建新 Token。
- 请求体不允许指定 `userId` / `enterpriseId`，任务归属由企业 Token 自动识别。
