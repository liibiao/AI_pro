# 企业生成 API 接入文档

> 本文档只覆盖企业 API。企业开放接口使用 `ent_live_xxx`；个人 API 请使用画布内置「个人 API 对接文档」。

## 1. 创建和复制企业 API Token

入口：

```text
管理后台 → 企业 API 管理 → 创建企业 → 充值 → 创建 Token
```

操作步骤：

1. 超级管理员进入「企业 API 管理」。
2. 创建企业账号并给企业充值积分。
3. 在企业行点击「创建 Token」。
4. 创建成功弹窗展示完整明文 Token，格式为 `ent_live_xxx`。
5. 立即复制并交付给企业客户保存；关闭弹窗后不能再次查看明文。
6. Token 泄露或遗失时，禁用旧 Token 后重新创建。

企业开放 API 只用于 `/api/open/enterprise/*`；费用扣企业结算钱包。

## 2. 鉴权方式

所有企业开放 API 请求必须携带：

```http
Authorization: Bearer ent_live_xxx
Content-Type: application/json
```

## 3. 真实调用地址

| 能力 | 方法 | URL |
|---|---|---|
| 创建生成任务 | POST | `/api/open/enterprise/generation/tasks` |
| 查询任务详情 | GET | `/api/open/enterprise/generation/tasks/:id` |
| 主动刷新任务 | POST | `/api/open/enterprise/generation/tasks/:id/query` |
| 查询任务列表 | GET | `/api/open/enterprise/generation/tasks?limit=100` |

## 4. 当前可用生图 / 生视频模型

> 服务端按 `channelKey` 查渠道，并在该渠道下按 `modelId` 匹配模型。以下只保留企业接入最常用的生图 GPT 相关渠道与生视频 Sora 相关渠道，避免混淆。

| type | channelKey | modelId | modelKey | 支持 mode |
|---|---|---|---|---|
| IMAGE | `canvas_gpt-image-2-pro` | `canvas-gpt-image-2-pro` | `gpt-image-2` | `txt2img` / `img2img` |
| IMAGE | `canvas_gpt-image-v2` | `canvas-gpt-image-v2` | `gpt-image-2` | `txt2img` / `img2img` |
| IMAGE | `seed_default` | `seed-gpt-image-2` | `gpt-image-2` | `txt2img` / `img2img` |
| VIDEO | `canvas_sora-2` | `canvas-sora-2` | `sora-2` | `text2video` / `img2video` |
| VIDEO | `canvas_sora-v3-pro` | `canvas-sora-v3-pro` | `sora-v3-pro` | `text2video` / `img2video` |
| VIDEO | `canvas_sora-v3-vip` | `canvas-sora-v3-vip` | `sora-v3-vip` | `text2video` / `img2video` |

## 5. 请求体必要字段

| 字段 | 必填 | 类型/枚举 | 示例 | 说明 |
|---|---:|---|---|---|
| `channelKey` | 是 | 上表 `channelKey` | `canvas_gpt-image-2-pro` | 真实渠道 Key。 |
| `modelId` | 是 | 上表 `modelId` | `canvas-gpt-image-2-pro` | 推荐传数据库模型 ID。 |
| `type` | 是 | `IMAGE` / `VIDEO` | `IMAGE` | 必须与模型类型一致。 |
| `mode` | 是 | `txt2img` / `img2img` / `text2video` / `img2video` | `txt2img` | 按模型支持模式传入。 |
| `prompt` | 是 | `string` | `一只猫` | 正向提示词。 |
| `inputFiles` | 图生图/图生视频必填 | `array` | `[{url,role,mimeType}]` | 参考图数组；企业开放 API 当前直接创建任务只接收公网可访问 URL。客户本地文件需先上传到企业自有对象存储/资产服务器，再把公网 URL 写入这里。 |
| `params` | 是 | `object` | `{resolution,size,n}` | 生图传尺寸/数量；生视频传时长/比例/清晰度。 |


## 5. 参考图上传接口

本地参考图先上传到 `/v1/files`，再把返回 URL 写入生成任务的 `inputFiles[].url`、`params.images`、`params.referenceImages`、`firstFrame` 或 `frames`。不要把本地路径、内网地址、`blob:`、`file:`、`data:` 直接传给生成接口。

| 字段 | 必填 | 类型 | 示例 | 说明 |
|---|---:|---|---|---|
| `file` | 是 | multipart file | `@/path/to/reference.png` | 本地参考图文件，建议 png/jpg/webp。 |
| `purpose` | 否 | string | `reference_image` | 文件用途标记。 |
| `role` | 否 | string | `referenceImage` / `firstFrame` / `frame` | 后续写入 `inputFiles[].role`。 |

```bash
curl -X POST "$BASE_URL/v1/files" \
  -H "Authorization: Bearer $ENTERPRISE_API_KEY" \
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

## 6. 可复制 JSON 请求示例

### 6.1 文生图

```json
{
  "channelKey": "canvas_gpt-image-2-pro",
  "modelId": "canvas-gpt-image-2-pro",
  "type": "IMAGE",
  "mode": "txt2img",
  "prompt": "企业宣传海报，现代科技风，蓝紫渐变，中心产品发光",
  "inputFiles": [],
  "params": {
    "model": "gpt-image-2",
    "resolution": "1K",
    "size": "1024x1024",
    "width": 1024,
    "height": 1024,
    "n": 1
  }
}
```

### 6.2 图生图

参考图必须是公网可访问 URL。不要传本地路径、内网地址、浏览器 `blob:`、`file:` 或 `data:`；如客户只有本地文件，请先上传到企业自有对象存储/资产服务器。

```json
{
  "channelKey": "canvas_gpt-image-2-pro",
  "modelId": "canvas-gpt-image-2-pro",
  "type": "IMAGE",
  "mode": "img2img",
  "prompt": "保留参考图主体结构，改成高级商业海报质感",
  "inputFiles": [
    {"url":"https://example.com/input.png","role":"referenceImage","mimeType":"image/png"}
  ],
  "params": {
    "model": "gpt-image-2",
    "resolution": "1K",
    "size": "1024x1024",
    "n": 1,
    "images": ["https://example.com/input.png"]
  }
}
```

### 6.3 文生视频

```json
{
  "channelKey": "canvas_sora-v3-pro",
  "modelId": "canvas-sora-v3-pro",
  "type": "VIDEO",
  "mode": "text2video",
  "prompt": "雨夜霓虹街道，镜头缓慢推进，企业产品在画面中央被灯光照亮",
  "inputFiles": [],
  "params": {
    "duration": 10,
    "resolution": "720p",
    "aspectRatio": "16:9",
    "fps": 24
  }
}
```

### 6.4 图生视频

```json
{
  "channelKey": "canvas_sora-v3-pro",
  "modelId": "canvas-sora-v3-pro",
  "type": "VIDEO",
  "mode": "img2video",
  "prompt": "根据参考图生成产品展示视频，产品缓慢旋转，镜头轻微推进",
  "inputFiles": [
    {"url":"https://example.com/product.png","role":"firstFrame","mimeType":"image/png"}
  ],
  "params": {
    "duration": 10,
    "resolution": "720p",
    "aspectRatio": "16:9",
    "fps": 24,
    "images": ["https://example.com/product.png"]
  }
}
```

## 7. 响应结构

```json
{
  "ok": true,
  "task": {
    "id": "<GenerationTask.id>",
    "modelId": "canvas-gpt-image-2-pro",
    "channelKey": "canvas_gpt-image-2-pro",
    "type": "IMAGE",
    "mode": "txt2img",
    "status": "RUNNING",
    "inputFilesJson": [],
    "paramsJson": {"resolution":"1K","size":"1024x1024","n":1},
    "resultJson": null,
    "resultUrlsJson": null,
    "chargedCredits": 5,
    "errorCode": null,
    "errorMessage": null,
    "progress": 0,
    "createdAt": "<ISO时间>",
    "updatedAt": "<ISO时间>"
  },
  "balance": 995,
  "chargedCredits": 5
}
```

## 8. 状态枚举

`CREATED` / `PENDING` / `RUNNING` / `SUCCESS` / `FAILED` / `TIMEOUT` / `REFUNDED` / `CANCELLED` / `MANUAL_REVIEW`

## 9. 常见错误码

| code | 含义 | 处理方式 |
|---|---|---|
| `ENTERPRISE_API_TOKEN_REQUIRED` | 缺少企业 API Token | 检查 `Authorization`。 |
| `ENTERPRISE_API_TOKEN_INVALID` | 企业 Token 无效或已禁用 | 重新创建 Token 或检查复制是否完整。 |
| `ENTERPRISE_API_TOKEN_EXPIRED` | 企业 Token 已过期 | 重新创建 Token。 |
| `ENTERPRISE_DISABLED` | 企业账号已禁用 | 联系超级管理员。 |
| `INSUFFICIENT_BALANCE` | 企业余额不足 | 给企业充值后重试。 |
| `PROVIDER_NOT_FOUND` | 渠道不可用 | 检查 `channelKey`。 |
| `MODEL_NOT_FOUND` | 模型不可用 | 检查 `modelId`、`type` 和模型启用状态。 |
| `GENERATION_SUBMIT_FAILED` | 提交上游失败 | 查看 `errorMessage` 后重试或联系管理员。 |

## 10. 安全说明

- 企业 Token 只能保存在企业客户自己的服务端。
- 不要把 `ent_live_xxx` 放到公开网页、GitHub、截图或聊天群。
- 请求体不允许指定 `userId` / `enterpriseId`，任务归属由企业 Token 自动识别。
