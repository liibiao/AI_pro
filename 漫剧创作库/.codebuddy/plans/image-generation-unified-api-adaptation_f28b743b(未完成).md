---
name: image-generation-unified-api-adaptation
overview: 根据统一生图 API 接入文档，重新适配工作台文生图/图生图的 Fast/VIP 模式切换、参考图上传策略、后端统一调用逻辑和生成结果预览策略。
todos:
  - id: verify-api-call-chain
    content: 使用 [subagent:code-explorer] 复核生图 UI、上传、后端调用链
    status: pending
  - id: add-protocol-ui
    content: 为文生图和图生图节点新增 fast/vip 切换入口
    status: pending
    dependencies:
      - verify-api-call-chain
  - id: split-reference-upload
    content: 实现 fast 本地 base64 与 vip 云端 URL 上传分流
    status: pending
    dependencies:
      - add-protocol-ui
  - id: build-unified-payload
    content: 扩展前端 payload，输出 protocol、official_api、reference_images 和数量字段
    status: pending
    dependencies:
      - split-reference-upload
  - id: adapt-backend-api
    content: 改造后端统一 /images/generations 调用与协议强校验
    status: pending
    dependencies:
      - build-unified-payload
  - id: improve-preview-flow
    content: 完善生成结果即时预览与后台落盘替换逻辑
    status: pending
    dependencies:
      - adapt-backend-api
  - id: validate-end-to-end
    content: 验证 fast/vip、上传进度、协议错误和结果预览全链路
    status: pending
    dependencies:
      - improve-preview-flow
---

## User Requirements

- 根据 `/Users/billy/Documents/image-generation-unified-api-implementation-plan.md` 的统一生图 API 文档，重新适配漫剧创作库生图工作台的 UI 交互与 API 调用逻辑。
- 文生图、图生图节点都新增 `fast` / `vip` 出图模式切换入口。
- 图生图参考图按模式强校验：
- `fast` 模式只能使用本地图片 base64 参考图。
- `vip` 模式只能使用公网 URL 参考图。
- 用户先选 `fast` 时，选择磁盘参考图后只做本地预览，不上传腾讯云；生成时传本地 base64。
- 用户从 `fast` 切换到 `vip` 时，已选择的本地参考图需要统一补上传到腾讯云，UI 显示上传进度，并提示“VIP 模式需要上传云端，出图质量更高”。
- 用户先选 `vip` 时，选择磁盘参考图后先本地预览，再按现有逻辑上传腾讯云，并显示上传进度。
- 文生图和图生图成功后，应优先展示返回的 URL 或 base64 图片，实现快速预览，再继续后台在线加载和本地落盘。
- 已确认 OpenAI 官方 Images API 不提供独立 `thumbnail_url`、`thumb_url`、`preview_url` 缩略图字段；缩略图体验需要通过前端卡片尺寸预览或项目后端自行生成，不能依赖官方缩略图 URL。

## Product Overview

这是对本地生图工作台的统一生图 API 接入升级，重点完成 `fast` / `vip` 模式切换、参考图上传策略分流、统一 `/images/generations` 调用、结果快速预览和后台落盘衔接。

## Core Features

- 文生图、图生图模式切换入口。
- `fast` 本地 base64 参考图链路。
- `vip` 云端公网 URL 参考图链路。
- `fast` 切 `vip` 自动补上传和进度提示。
- 前后端双层协议校验。
- 统一 `reference_images` 请求字段。
- 生成结果即时预览与后台本地化下载。

## Tech Stack Selection

- 前端：沿用现有原生 HTML、CSS、JavaScript 单页工作台。
- 后端：沿用现有 Python HTTP 服务与 `image_studio_backend.py` 生图封装。
- API 封装：继续复用 `workbench-engine.js`，只增强上传进度能力和请求字段传递。
- 不引入新框架、不改项目整体架构、不拆分大模块，优先小范围兼容式改造。

## Implementation Approach

本次采用“前端交互分流 + 后端统一校验 + 统一 API 请求体”的方式落地。前端根据节点 `protocol` 决定参考图是否上传对象存储，并在构造 payload 时输出 `protocol`、`official_api`、`reference_images`、`n/image_count`；后端兜底校验 `fast=base64`、`vip=http(s) URL`，并将图生图从旧 `/images/edits` 迁移到统一 `/images/generations`。

关键决策：

- `fast` 模式保留本地 base64，避免无意义云上传，提升交互速度。
- `vip` 模式强制公网 URL，确保符合新 API 高级协议和多参考图输入约束。
- `vip -> fast` 不删除已上传 URL，只在请求时选择 `dataUrl`，避免破坏用户素材状态。
- `fast -> vip` 对已有本地参考图补上传，减少用户重复选择成本。
- 生成结果不承诺官方缩略图 URL；首屏用返回 URL 或 `b64_json` 直接渲染，后台落盘完成后替换为本地 URL。
- 上传进度使用 `XMLHttpRequest.upload.onprogress`，比当前 `fetch` 伪进度更准确。

## Implementation Notes

- 修改前先用 [subagent:code-explorer] 复核四个核心文件的当前调用链，避免遗漏同名函数或备用页面。
- `image-studio-canvas.html` 是主改动点，需控制变更范围，避免影响 Seedance 视频参考图上传逻辑。
- `readFilesToNode` 需要区分 `singleImage`、`img2imgAll fast`、`img2imgAll vip`、其它节点，避免破坏全景图和视频节点原逻辑。
- `uploadReferenceImageForProvider` 保持现有 `img.status/progress/progressLabel` 数据结构，继续复用缩略图遮罩。
- 后端日志不得输出完整 base64、完整 prompt 或敏感素材 URL；沿用现有 `_shorten_debug_value` 规则。
- `official_api=responses` 作为默认值；保留 `legacy` 兼容校验，避免破坏旧客户端。
- 多参考图支持应通过 `reference_images` 透传；如果 legacy 模式多图，返回明确错误。
- 不依赖 OpenAI 官方缩略图字段；如后续需要真缩略图，可另做后端 `thumbUrl` 生成增强，不纳入本轮必要实现。

## Architecture Design

```mermaid
flowchart TD
    A[用户选择文生图或图生图节点] --> B[选择 fast 或 vip]
    B --> C{是否图生图}
    C -- 否 --> D[构造文生图 payload]
    C -- 是 --> E{protocol}
    E -- fast --> F[本地读取图片并保留 dataUrl]
    E -- vip --> G[本地预览并上传腾讯云获取公网 URL]
    F --> H[reference_images 使用 base64 data URL]
    G --> I[reference_images 使用 http(s) URL]
    H --> J[POST /images/generations]
    I --> J
    D --> J
    J --> K[后端校验 protocol 与 reference_images]
    K --> L[调用统一生图 API]
    L --> M[返回 url 或 b64_json]
    M --> N[前端立即预览]
    N --> O[后台异步下载落盘后替换本地 URL]
```

## Directory Structure

```text
/Users/billy/Documents/AI_pro/漫剧创作库/
├── tools/
│   ├── workbench-web/
│   │   ├── image-studio-canvas.html
│   │   │   # [MODIFY] 主前端交互文件。新增文生图和图生图 fast/vip 入口；
│   │   │   # 调整图生图本地图片读取、VIP 补上传、上传进度显示、payload 构造、
│   │   │   # reference_images 分流、生成结果即时预览逻辑。
│   │   └── workbench-engine.js
│   │       # [MODIFY] 前端 API 封装。将 uploadReferenceImage 从 fetch 上传改为
│   │       # 支持 XMLHttpRequest 上传进度回调，并保持现有返回结构兼容。
│   ├── image_studio_backend.py
│   │   # [MODIFY] 生图 API 后端封装。新增 protocol、official_api、n/image_count、
│   │   # reference_images 归一化与校验；文生图和图生图统一走 /images/generations；
│   │   # 保留 response_format fallback 和 size fallback。
│   └── workbench_server.py
│       # [MODIFY] 工作台 HTTP 服务入口。调整 run_image_generation 图生图输入解析：
│       # fast 取 base64，vip 取公网 URL；传递统一字段给 image_studio_backend；
│       # 保留异步下载落盘与状态查询。
```

## Key Code Structures

```text
前端节点协议字段：
- n.values.protocol: "fast" | "vip"
- 默认值："fast"

统一请求字段：
- protocol: "fast" | "vip"
- official_api: "responses" | "legacy"
- reference_images: string[]
- n: number
- image_count: number

参考图选择规则：
- fast: img.dataUrl
- vip: providerImageUrl(img) 或补上传后的 img.remoteUrl
```

## Validation Strategy

- 前端静态检查：读取相关文件 lints，确认无明显语法错误。
- 手工路径验证：
- 文生图 fast 生成。
- 文生图 vip 生成。
- 图生图 fast 选本地图，不触发 `/upload-reference`，请求含 base64。
- 图生图 vip 选本地图，触发上传进度，请求含公网 URL。
- fast 已选图后切 vip，自动补上传并提示。
- vip 切回 fast，请求改用 base64，不删除已上传 URL。
- 生成后立即显示返回图，后台下载完成后替换本地 URL。
- 后端协议验证：
- fast + URL 参考图应报错。
- vip + base64 参考图应报错。
- legacy + 多参考图应报错或明确提示使用 responses。

## Agent Extensions

### SubAgent

- **code-explorer**
- Purpose: 复核生图工作台前端、上传封装、后端生图调用和服务入口的真实调用链，确认修改点与现有约定。
- Expected outcome: 明确 `image-studio-canvas.html`、`workbench-engine.js`、`image_studio_backend.py`、`workbench_server.py` 的最终落地点，避免破坏视频节点、全景节点、历史记录和后台落盘机制。