# 当前上游接入记录

## 已接入 LLM 上游

后台渠道：

```text
名称：本地 CLI Proxy LLM
Base URL：http://localhost:8317/v1
状态：ACTIVE
```

后台模型：

```text
展示名：GPT 5.5
真实模型名：gpt-5.5
类型：LLM
计费单位：token_usd_ratio
一刀积分：80
```

验证结果：

```text
GET  /models             已通过
POST /chat/completions   已通过
```

`/chat/completions` 测试返回了文本 `OK`，并返回了 `usage` token 数据，可以用于后续业务计费。

## 已同步画布模型配置

已从画布目录同步：

```text
/Users/billy/Documents/AI_pro/漫剧创作库/tools/workbench-web/models
```

同步结果：

| 后台模型 ID | 类型 | 真实模型名 | Base URL | 提交路径 | 状态路径/上传 |
| --- | --- | --- | --- | --- | --- |
| `canvas-gemini-image` | IMAGE | `gemini-3-pro-image-preview` | `https://notevideo.asia` | `/v1beta/models/{model}:generateContent` | `object_storage` |
| `canvas-gpt-image-2-pro` | IMAGE | `gpt-image-2` | `http://localhost:8317/v1` | `/images/edits` | `files` |
| `canvas-gpt-image-v2` | IMAGE | `gpt-image-2` | `https://socdabat.it.com/v1` | `/images/generations` | `object_storage` |
| `canvas-sora-2` | VIDEO | `sora-2` | `https://notevideo.asia/v1` | `/videos` | `/videos/{taskId}` |
| `canvas-sora-v3-pro` | VIDEO | `sora-v3-pro` | `https://notevideo.asia/v1` | `/videos` | `/videos/{taskId}` |
| `canvas-sora-v3-vip` | VIDEO | `sora-v3-vip` | `https://notevideo.asia/v1` | `/videos` | `/videos/{taskId}` |

后台模型表现在保存 `adapter`、`endpointPath`、`statusEndpointPath`、`uploadMode`、`protocol`、`supports`、`defaults`、`capabilities`、`modelAssembly`、`ui`，画布兼容接口会直接返回这些字段。

重新同步命令：

```bash
npm run sync:canvas-models
```

同步脚本会保留已有模型价格，不会覆盖后续在后台手动调整的售卖价。

## 密钥处理

上游 API Key 已写入 `upstream_providers.api_key_encrypted`，不会返回给前端，也不会写入本文档。

生产环境如果使用新数据库，需要在后台“模型管理 -> 上游渠道”重新填写该 key，或通过后台 API 重新写入。

## 使用真实生成

当前后台支持两种状态：

- `生成 Mock 模式 = 开启`：不打真实上游，只模拟生成和扣费流程。
- `生成 Mock 模式 = 关闭`：图片、视频、LLM 都会按模型配置调用真实上游。

如果只先测试 GPT 5.5，可以在“系统设置”关闭 Mock 后，只在“生成联调 -> 语言模型”里选择 `GPT 5.5` 测试。
