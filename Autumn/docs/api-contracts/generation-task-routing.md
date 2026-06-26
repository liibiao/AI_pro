# Generation Task Routing API Contract

更新日期：2026-06-19

本文档定义 Autumn 前端与共享 Canvas/Admin 后台在生成任务创建、查询、失败和故事板回写上的字段合同。

## 1. 创建任务

前端调用：

- `POST /api/generation/tasks`
- Header：复用后台管理系统 Bearer token，优先读取 `ai_admin_token`，其次兼容 `canvas_platform_token`。
- Body：`CreateGenerationTaskRequestDto`

关键字段：

| 字段 | 类型 | 要求 |
| --- | --- | --- |
| `channelKey` | string | 后台模型 provider key，例如 `seedance`、`openai`。 |
| `clientRequestId` | string | 前端生成的幂等请求 id。重试时必须生成新的 id。 |
| `mode` | string | Composer 图片任务为 `txt2img`，视频任务为 `text-to-video`，大语言模型任务为 `chat`；故事板重生成暂保留 `autumn-storyboard-regeneration`。 |
| `modelId` | string | 后台模型 id。 |
| `type` | `IMAGE` / `VIDEO` / `LLM` | 当前按后台管理系统已启用模型接入图片模型、视频模型和大语言模型。 |
| `prompt` | string | 包含卡片名称、类型、描述和参考素材名称。 |
| `inputFiles` | array | 当前故事板卡片已绑定资产，至少包含 `id/name/type`。 |
| `params` | object | 见下方路由字段。 |

`params` 必须保留的路由字段：

| 字段 | 类型 | 要求 |
| --- | --- | --- |
| `source` | string | 固定为 `autumn`。 |
| `sourceElementId` | string | Autumn 故事板卡片 id。后台创建、查询和列表接口需要原样回传到 `paramsJson`。 |
| `sourceElementName` | string | 故事板卡片名称，用于后台排查和任务列表展示。 |
| `storyboardElementType` | `role` / `scene` / `prop` / `audio` / `shot` | Autumn 故事板元素类型。 |
| `targetAssetSlot` | `shotVideo` / `elementReference` / `audioReference` | 前端回写目标资产槽位。后台必须原样回传。 |
| `seed` | number / null | 随机种子，`null` 表示不锁种子。 |
| `imageWeight` | number | IW，前端已归一化。 |
| `contentWeight` | number | CW，前端已归一化。 |
| `styleWeight` | number | SW，前端已归一化。 |
| `crefAssetIds` | string[] | 角色参考资产 id。 |
| `srefAssetIds` | string[] | 风格参考资产 id。 |
| `durationSeconds` | number | 视频秒数。 |
| `aspectRatio` | string | 画幅比例。 |
| `agentPackageId` | string / null | 当前 Composer 选中的后台 Agent/Data Pack id，例如 `manju-creation-library`。 |
| `agentPackageName` | string / null | 当前 Composer 选中的后台 Agent/Data Pack 名称，例如 `漫剧创作库`。 |
| `agentIds` | string[] | 当前 Agent/Data Pack 内参与调度的 Agent id 列表。 |
| `enabledSkillIds` | string[] | 当前 Composer 启用的 Skill id 列表。 |
| `skillNames` | string[] | 当前 Composer 启用的 Skill 名称，用于后台排查和任务展示。 |

Composer 不再注入本地假模型。模型来源为：

- `GET /api/models?type=IMAGE`
- `GET /api/models?type=VIDEO`
- `GET /api/models?type=LLM`
- 当上述分类接口为空时，回退 `GET /api/admin/models`，并按 `status !== DISABLED`、`provider.status !== DISABLED` 过滤。

`targetAssetSlot` 语义：

| targetAssetSlot | 用途 | 前端回写规则 |
| --- | --- | --- |
| `shotVideo` | 分镜视频结果 | 替换同一故事板卡片内旧视频资产，并更新同一 `sourceElementId` 的视频时间线 clip。 |
| `elementReference` | 角色 / 场景 / 道具参考图 | 替换同一故事板卡片内旧图片资产。 |
| `audioReference` | 旁白 / 音乐参考音频 | 替换同一故事板卡片内旧音频资产。 |

## 2. 查询与列表回传

前端会调用：

- `GET /api/generation/tasks`
- `GET /api/generation/tasks/:id`
- `POST /api/generation/tasks/:id/query`

后台响应中的 `task` 或 `items[]` 应包含：

| 字段 | 类型 | 要求 |
| --- | --- | --- |
| `id` | string | 后台任务 id。 |
| `clientRequestId` | string | 创建时的幂等请求 id。 |
| `status` | string | `PENDING/RUNNING/SUCCESS/FAILED`，前端也兼容 `SUBMITTED/PROCESSING/COMPLETED/ERROR/CANCELED`。 |
| `progress` | number | 0-100；缺省时前端会按状态兜底。 |
| `type` | string | `IMAGE/VIDEO/AUDIO/DOCUMENT/LLM`，前端据此创建资产类型。 |
| `modelId` / `model.id` | string | 任务使用的模型 id。 |
| `channelKey` / `provider.providerKey` | string | provider key。 |
| `paramsJson` | object / JSON string | 必须包含创建时的 `sourceElementId` 与 `targetAssetSlot`。 |
| `resultUrlsJson` | array / JSON string | 推荐直接返回结果 URL 数组。 |
| `resultJson` | object / JSON string | 可返回 `outputs/url/resultUrl/resultUrls/imageUrl/videoUrl/audioUrl/data` 等字段，前端会递归提取 URL。 |
| `errorMessage` | string | 失败时面向用户或可映射的错误信息。 |
| `errorCode` | string | 可选，后续用于更精细错误映射。 |
| `updatedAt` / `completedAt` / `failedAt` / `createdAt` | string | 至少返回一个时间字段。 |

前端结果 URL 识别规则：

- 支持 `https://`、`http://`、`data:image/`、`data:video/`、`data:audio/`、`/api/`、`/generated/` 开头的 URL。
- `resultUrlsJson` 与 `resultJson` 中重复 URL 会去重。
- 任务完成且有 URL 时，前端创建 `AssetItem`，并继承 `task.targetAssetSlot`。

## 3. 失败态

失败任务合同：

- `status` 返回 `FAILED`、`FAILURE`、`ERROR`、`CANCELED` 或 `CANCELLED`。
- `errorMessage` 应尽量包含用户可行动的信息，例如参考图不可访问、余额不足、模型队列超时。
- 如果后台只返回上游英文错误，前端会做基础映射：
  - 包含 `Lingdong`、`video task failed` 或 `视频生成`：展示“视频生成任务失败，请检查参考图链接是否可访问，或调整生成参数后重试。”
  - 创建接口请求失败：展示“生成任务提交失败，请检查后台连接后重试。”
  - 其他错误：展示后台 `errorMessage`。

前端行为：

- 有 `sourceElementId` 的 failed 任务会把对应故事板卡片标记为 `failed`。
- 卡片进度归零，并展示 `errorMessage`。
- 对应视频时间线 clip 同步为 `failed`。
- failed 卡片上的操作按钮显示为“重试”。

## 4. 重试语义

用户点击“重试”时：

- 前端重新创建一个 generation task。
- `sourceElementId` 和 `targetAssetSlot` 保持不变。
- `clientRequestId` 使用新的时间戳生成，避免与上一次失败任务幂等冲突。
- 创建成功后，卡片进入 `running`，旧 `errorMessage` 会清除。
- 任务完成后，结果按 `targetAssetSlot` 替换旧资产。

后台建议：

- 将 `params` 原样保存为 `paramsJson`，并在 create/query/list 响应中返回。
- 失败任务不要清空 `paramsJson`，否则前端无法把失败准确回写到故事板卡片。
- 对重试任务保持独立 task id，并可通过 `retryCount` 或 `upstreamTaskId` 辅助排查，但前端不依赖这些字段完成回写。
