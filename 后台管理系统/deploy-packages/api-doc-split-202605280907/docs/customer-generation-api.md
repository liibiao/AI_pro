# 个人生成 API 接入文档

> 本文档只覆盖个人 API。企业客户请使用 `enterprise-generation-api.html` / `enterprise-generation-api.md`。

## 1. 创建和复制个人 API Key

入口：

```text
管理后台 → 账户中心 → API 接入 → 创建 API Key
画布 / 工作台 → 账户设置 → 个人 API 接入 → 创建 API Key
```

操作步骤：

1. 点击「创建 API Key」。
2. 输入 Key 名称，例如 `本地测试 Key` 或 `生产环境 Key`。
3. 创建成功弹窗会展示完整明文 Key，格式为 `sk_live_xxx`。
4. 立即点击「复制 API Key」并保存到自己的后端环境变量。
5. 关闭弹窗后，系统只保留 Key Hash，不能再次查看明文；如遗失请禁用旧 Key 后重新创建。

个人 API Key 只用于 `/api/open/personal/*`，不使用网页登录 Token；费用扣当前个人账号余额，会员 / 体验卡折扣实时生效。

## 2. 鉴权方式

所有个人开放 API 请求必须携带：

```http
Authorization: Bearer sk_live_xxx
Content-Type: application/json
```

## 3. 接口列表

| 能力 | 方法 | URL |
|---|---|---|
| 创建生成任务 | `POST` | `/api/open/personal/generation/tasks` |
| 查询任务列表 | `GET` | `/api/open/personal/generation/tasks?limit=100` |
| 查询任务详情 | `GET` | `/api/open/personal/generation/tasks/:id` |
| 主动刷新任务 | `POST` | `/api/open/personal/generation/tasks/:id/query` |

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

`mode` 枚举：

| mode | type | 说明 |
|---|---|---|
| `txt2img` | `IMAGE` | 文生图 |
| `img2img` | `IMAGE` | 图生图 / 图片编辑，通常需要 `inputFiles` |
| `txt2video` | `VIDEO` | 文生视频，兼容旧写法 |
| `text2video` | `VIDEO` | 文生视频，推荐写法 |
| `img2video` | `VIDEO` | 图生视频，通常需要首帧 / 参考图 `inputFiles` |
| `chat` | `LLM` | 文本 / 对话模型 |

## 5. 创建生成任务

```http
POST /api/open/personal/generation/tasks
Authorization: Bearer sk_live_xxx
Content-Type: application/json
```

### 5.1 图片任务完整示例

```json
{
  "channelKey": "canvas_gpt-image-2-pro",
  "modelId": "canvas-gpt-image-2-pro",
  "type": "IMAGE",
  "mode": "txt2img",
  "prompt": "一只赛博朋克风格的猫，霓虹灯，电影感构图",
  "negativePrompt": "低清晰度，畸形，多余肢体，文字水印",
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
      "source": "open-personal-api",
      "sceneId": "scene_001"
    }
  },
  "clientRequestId": "client_order_001"
}
```

### 5.2 图生视频完整示例

```json
{
  "channelKey": "canvas_sora-v3-pro",
  "modelId": "canvas-sora-v3-pro",
  "type": "VIDEO",
  "mode": "img2video",
  "prompt": "角色从雨夜街道缓慢转身，镜头轻微推进，霓虹反光在地面积水中流动",
  "negativePrompt": "画面闪烁，脸部漂移，肢体断裂，低清晰度",
  "inputFiles": [
    {
      "url": "https://example.com/first-frame.png",
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
    "cameraMotion": "slow_push_in",
    "motionStrength": 0.65,
    "seed": 123456,
    "referenceImages": ["https://example.com/first-frame.png"],
    "metadata": {
      "source": "open-personal-api",
      "shotId": "shot_001"
    }
  },
  "clientRequestId": "client_video_001"
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
| `clientRequestId` | 否 | `string` | 客户端幂等 ID，长度 1-160；同账号重复提交会返回已存在任务。 |

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
| `metadata` | `object` | 客户自定义附加信息。 |
| 任意扩展字段 | `string \| number \| boolean \| array \| object \| null` | 会透传给对应模型适配器，未知字段是否生效取决于后台适配器。 |

## 6. 查询任务

```http
GET /api/open/personal/generation/tasks/:id
Authorization: Bearer sk_live_xxx
```

```http
POST /api/open/personal/generation/tasks/:id/query
Authorization: Bearer sk_live_xxx
```

任务状态：`CREATED`、`PENDING`、`RUNNING`、`SUCCESS`、`FAILED`。

## 7. 常见错误码

| code | 含义 | 处理方式 |
|---|---|---|
| `OPEN_API_TOKEN_REQUIRED` | 缺少个人 API Key | 检查 `Authorization`。 |
| `OPEN_API_TOKEN_INVALID` | API Key 无效或已禁用 | 重新创建 Key 或检查复制是否完整。 |
| `USER_DISABLED` | 个人账号已禁用 | 联系管理员。 |
| `INSUFFICIENT_BALANCE` | 余额不足 | 充值后重试。 |
| `PROVIDER_NOT_FOUND` | 渠道不可用 | 检查 `channelKey`。 |
| `PROVIDER_DISABLED` | 渠道已禁用 | 换可用渠道或联系管理员。 |
| `MODEL_NOT_FOUND` | 模型不可用 | 检查 `modelId`、`type`、模型启用状态。 |
| `GENERATION_TASK_NOT_FOUND` | 任务不存在或无权访问 | 确认任务 ID 属于当前 API Key 对应账号。 |
| `GENERATION_SUBMIT_FAILED` | 提交上游失败 | 查看 `errorMessage` 后重试或联系管理员。 |

## 8. 安全说明

- 不要把 API Key 放到公开网页、GitHub、截图或聊天群。
- 前端页面不要直连开放 API，建议由客户自己的后端转发。
- 怀疑泄露后，立刻在账户中心禁用旧 Key 并创建新 Key。
- 请求体不允许指定 `userId`，任务归属由 API Key 自动识别。
