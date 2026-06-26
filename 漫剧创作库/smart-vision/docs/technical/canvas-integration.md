# 智能视界 × 无限画布节点扩展规划

> 目标：在不重做当前无限画布的前提下，把智能视界的工业化任务语义接入现有节点系统。  
> 当前画布文件：`tools/workbench-web/image-studio-canvas.html`。  
> 当前工作流格式：`mjb-workflow-v1`。

---

## 1. 当前画布能力结论

当前无限画布已经具备智能视界执行层的底座能力：

1. 节点定义集中在 `NODE_DEFS`。
2. 节点默认值由 `defaultValues(type, values)` 管理。
3. 节点执行由 `runNode(id)` 分发。
4. 工作流可导出为 `schema: 'mjb-workflow-v1'`。
5. 工作流导入时由 `loadData(wf)` 读取，并会过滤未注册节点。
6. 当前已有文生图、图生图、Seedance 视频、720 全景、视频剪辑、图片 / 视频预览等节点。

关键限制：

```text
loadData(wf) 会执行：filter(nd => NODE_DEFS[nd.type])
```

因此智能视界 Runtime / Workflow JSON Builder 生成的 workflow JSON 中，所有节点 `type` 都必须先注册到 `NODE_DEFS`，否则导入后会丢失。MVP 阶段若不新增节点，应只使用当前已注册节点，并把业务语义写入 `meta` 与节点 `values`。

---

## 2. 现有节点复用映射

| 现有节点 | 当前定位 | 智能视界复用方式 |
|---|---|---|
| `stylePreset` | 风格预设 / 词库配方 | 接入 `visual-style-bible.md`、影片风格基调、子风格方法论 |
| `singleImage` | 图片输入 / 输出 / 预览 | 承载角色图、道具图、场景图、故事板图、参考图 |
| `singleVideo` | 视频输入 / 输出 / 预览 | 承载单故事板视频、镜头素材、单集片段 |
| `videoEditor` | 视频剪辑器 | 单集拼接、字幕、音频、成片导出 |
| `txt2img` | 文生图 | 角色设定稿、道具设定稿、场景设定稿、故事板图生成 |
| `imageToPanorama` | 720 全景生成 | 核心场景 720 度全景场景母图 |
| `panoramaViewer` | 交互式全景查看 | 场景空间审核、机位验证、场景母图查看 |
| `img2imgAll` | 多参考图图生图 | 故事板图、角色一致性图生图、参考图混合生成 |
| `seedanceVideo` | Seedance 视频生成 | 单故事板视频、图生视频、参考图职责矩阵执行 |

结论：现有节点足够支撑“生成动作”，但不足以表达“工业化任务语义”。

---

## 3. 必须新增的智能视界业务节点

## 3.1 `svProjectContext` — 项目上下文节点

用途：绑定当前项目的根目录、风格母版、项目状态和生产模式。

建议端口：

```json
{
  "inputs": [],
  "outputs": [
    {"name": "project", "kind": "any", "label": "项目上下文"},
    {"name": "style", "kind": "prompt", "label": "风格母版"}
  ]
}
```

默认字段：

```json
{
  "projectId": "",
  "projectName": "",
  "projectRoot": "",
  "mode": "storyboard_semi_auto",
  "visualStyleBiblePath": "",
  "currentPhase": ""
}
```

## 3.2 `svEpisodeContext` — 单集上下文节点

用途：绑定当前集的剧本、导演讲戏、资产索引、故事板列表。

端口：

```json
{
  "inputs": [{"name": "project", "kind": "any", "label": "项目上下文"}],
  "outputs": [
    {"name": "episode", "kind": "any", "label": "单集上下文"},
    {"name": "script", "kind": "text", "label": "剧本"},
    {"name": "assetIndex", "kind": "any", "label": "资产索引"}
  ]
}
```

默认字段：

```json
{
  "episodeId": "ep001",
  "scriptPath": "",
  "directorNotesPath": "",
  "assetIndexPath": "",
  "storyboardPath": ""
}
```

## 3.3 `svMethodologyPack` — 方法论包节点

用途：把本任务必须读取的 docs、skills、templates、redlines 打包给大模型或下游节点。

端口：

```json
{
  "inputs": [{"name": "context", "kind": "any", "label": "上下文"}],
  "outputs": [
    {"name": "methodology", "kind": "prompt", "label": "方法论包"},
    {"name": "schema", "kind": "params", "label": "输出结构"}
  ]
}
```

默认字段：

```json
{
  "taskType": "storyboard_package",
  "requiredDocs": [],
  "requiredSkills": [],
  "requiredTemplates": [],
  "redlines": []
}
```

## 3.4 `svAgentTask` — Agent 任务节点

用途：显示和执行 Producer / Writer / Director / Storyboard Artist / Librarian / Studio / Reviewer 的任务。

端口：

```json
{
  "inputs": [
    {"name": "context", "kind": "any", "label": "上下文"},
    {"name": "methodology", "kind": "prompt", "label": "方法论"}
  ],
  "outputs": [
    {"name": "artifact", "kind": "any", "label": "产物"},
    {"name": "prompt", "kind": "prompt", "label": "提示词 / 说明"}
  ]
}
```

默认字段：

```json
{
  "agentRole": "Storyboard Artist",
  "skillIds": [],
  "taskInstruction": "",
  "inputArtifacts": [],
  "outputArtifacts": [],
  "status": "waiting"
}
```

## 3.5 `svAssetSpec` — 资产规格节点

用途：约束角色、道具、场景资产生成规范。

端口：

```json
{
  "inputs": [
    {"name": "episode", "kind": "any", "label": "单集上下文"},
    {"name": "style", "kind": "prompt", "label": "风格母版"}
  ],
  "outputs": [
    {"name": "assetPrompt", "kind": "prompt", "label": "资产提示词"},
    {"name": "assetSpec", "kind": "params", "label": "资产规格"}
  ]
}
```

默认字段：

```json
{
  "assetType": "character_design_sheet",
  "assetId": "",
  "specDocs": [
    "docs/character-design-sheet-spec.md",
    "docs/scene-design-sheet-spec.md",
    "docs/gpt-image-prompt-methodology.md"
  ],
  "model": "gpt-image-2",
  "reviewRequired": true
}
```

## 3.6 `svReferenceMatrix` — 参考图职责矩阵节点

用途：定义故事板图、角色图、场景图、道具图、音频、视频参考的优先级和职责，防止参考图抢权。

端口：

```json
{
  "inputs": [
    {"name": "images", "kind": "image", "label": "参考图"},
    {"name": "context", "kind": "any", "label": "上下文"}
  ],
  "outputs": [
    {"name": "refMatrix", "kind": "params", "label": "参考图职责"},
    {"name": "images", "kind": "image", "label": "排序后参考图"}
  ]
}
```

默认字段：

```json
{
  "priority": ["storyboard", "character", "scene", "prop", "video", "audio"],
  "riskNotes": [],
  "lockedRefs": []
}
```

## 3.7 `svStoryboardPackage` — 故事板生产包节点

用途：承载当前中游主交付物。

必须包含：

- 分镜表。
- D12 / D15 导演故事板图结构。
- Panel 格数与每格时长。
- 板内 / 板间连续性卡。
- 资产引用矩阵。
- 参考图职责矩阵。
- 视频模型适配说明。

端口：

```json
{
  "inputs": [
    {"name": "episode", "kind": "any", "label": "单集上下文"},
    {"name": "assets", "kind": "any", "label": "资产索引"},
    {"name": "methodology", "kind": "prompt", "label": "方法论"}
  ],
  "outputs": [
    {"name": "storyboardPrompt", "kind": "prompt", "label": "故事板图提示词"},
    {"name": "package", "kind": "any", "label": "故事板生产包"}
  ]
}
```

默认字段：

```json
{
  "boardId": "board-001",
  "targetModel": "D15-Seedance2",
  "panelCount": 6,
  "durationLimit": 15,
  "packagePath": "",
  "reviewRequired": true
}
```

## 3.8 `svReviewGate` — 人工审核节点

用途：在用户未审核通过前阻塞下游执行。

端口：

```json
{
  "inputs": [{"name": "artifact", "kind": "any", "label": "待审核产物"}],
  "outputs": [{"name": "approved", "kind": "any", "label": "审核通过产物"}]
}
```

默认字段：

```json
{
  "reviewType": "asset_image",
  "checklist": [],
  "status": "waiting_review",
  "reviewer": "user",
  "comment": ""
}
```

执行规则：

- `waiting_review`：节点停住，不继续下游。
- `approved`：放行输出。
- `rejected`：生成返工任务。

## 3.9 `svPhaseGate` — 阶段门禁节点

用途：映射 `docs/phase-gate-checklist.md` 中的 story → director、assets → storyboard、storyboard → generation 等门禁。

端口：

```json
{
  "inputs": [{"name": "phaseArtifacts", "kind": "any", "label": "阶段产物"}],
  "outputs": [{"name": "released", "kind": "any", "label": "门禁放行"}]
}
```

默认字段：

```json
{
  "gateType": "assets_to_storyboard",
  "checklistSource": "docs/phase-gate-checklist.md",
  "items": [],
  "status": "waiting"
}
```

## 3.10 `svOutputRegistry` — 产物入库节点

用途：把生成结果写回项目文件、资产索引、故事板记录、审核记录和历史记录。

端口：

```json
{
  "inputs": [{"name": "artifact", "kind": "any", "label": "最终产物"}],
  "outputs": [{"name": "record", "kind": "any", "label": "入库记录"}]
}
```

默认字段：

```json
{
  "registryType": "asset_index",
  "targetPath": "",
  "artifactPaths": [],
  "writeMemory": true,
  "writeQaRecord": true
}
```

---

## 4. 端口类型建议

当前已有端口类型：`text`、`prompt`、`image`、`model`、`params`、`any`、`exec`、`video`、`audio`。

智能视界可以先复用这些类型，不必立即扩展底层端口系统。

建议映射：

| 业务数据 | 端口 kind |
|---|---|
| 项目上下文 | `any` |
| 单集上下文 | `any` |
| Agent 任务 | `any` |
| 方法论包 | `prompt` + `params` |
| 资产规格 | `params` |
| 故事板生产包 | `any` |
| 审核状态 | `any` |
| 参考图矩阵 | `params` |
| 图片产物 | `image` |
| 视频产物 | `video` |
| 音频参考 | `audio` |

---

## 5. 智能视界典型工作流模板

## 5.1 资产图工作流

```text
svProjectContext
→ svEpisodeContext
→ svMethodologyPack
→ svAssetSpec
→ txt2img / img2imgAll / imageToPanorama
→ singleImage / panoramaViewer
→ svReviewGate
→ svOutputRegistry
```

## 5.2 故事板图工作流

```text
svProjectContext
→ svEpisodeContext
→ svMethodologyPack
→ svReferenceMatrix
→ svStoryboardPackage
→ img2imgAll / txt2img
→ singleImage
→ svReviewGate
→ svOutputRegistry
```

## 5.3 视频生成工作流

```text
svProjectContext
→ svEpisodeContext
→ svStoryboardPackage
→ svReferenceMatrix
→ seedanceVideo
→ singleVideo
→ svReviewGate
→ svOutputRegistry
```

## 5.4 单集成片工作流

```text
board-001 video
board-002 video
...
board-008 video
→ videoEditor
→ singleVideo
→ svReviewGate
→ svOutputRegistry
```

---

## 6. 代码改造清单

## 6.1 必改位置

文件：`tools/workbench-web/image-studio-canvas.html`

需要修改：

1. `NODE_DEFS`：注册 `sv*` 节点。
2. `defaultValues(type, values)`：补齐每类 `sv*` 节点默认值。
3. 节点控件渲染逻辑：新增 `sv*` 节点 UI。
4. `computeNode(id)`：让上下文、方法论、矩阵类节点能向下游传值。
5. `runNode(id)`：让审核节点、入库节点、Agent 任务节点具备状态行为。
6. `loadData(wf)`：保持兼容，但要确保新增类型不会被过滤。
7. 导入导出：保留 `mjb-workflow-v1`，不要破坏旧工作流。

## 6.2 Runtime 新增模块

建议新增：

```text
tools/smart_vision/
  capability_loader.py
  context_builder.py
  recipe_runner.py
  workflow_builder.py
  methodology_loader.py
  task_planner.py
  review_gate.py
  project_scanner.py
  recovery_scanner.py
```

这些模块优先作为本地 Runtime / 桥接层实现；若后续需要多人协作或云端部署，再外包一层服务端 API。

## 6.3 工作流 JSON Builder 责任

`workflow_builder.py` 应负责：

- 根据故事板 / 单集 / 全剧模式生成节点和连线。
- 自动填入提示词、资产图路径、参考图职责、输出路径。
- 生成 `mjb-workflow-v1`。
- 校验节点类型是否在当前画布 `NODE_DEFS` 支持范围内。
- 如果包含未支持节点，应返回“需要升级画布节点定义”。

---

## 7. MVP 优先级

## P0：不改画布节点，先生成现有节点工作流

先用现有节点跑通：

- `stylePreset`
- `singleImage`
- `txt2img`
- `img2imgAll`
- `imageToPanorama`
- `panoramaViewer`
- `seedanceVideo`
- `singleVideo`
- `videoEditor`

业务语义暂时放在 `meta` 和节点 `values` 中。

适合快速验证：

- 故事板级资产图工作流。
- 故事板图工作流。
- 单故事板视频工作流。

## P1：新增审核与入库节点

优先新增：

- `svReviewGate`
- `svOutputRegistry`

原因：这两个节点直接决定半自动流程能否闭环。

## P2：新增上下文与方法论节点

新增：

- `svProjectContext`
- `svEpisodeContext`
- `svMethodologyPack`
- `svStoryboardPackage`
- `svReferenceMatrix`

原因：提升画布可读性，让用户能看懂每条生产链的业务来源。

## P3：新增 Agent 任务节点

新增：

- `svAgentTask`
- `svPhaseGate`

原因：用于更完整地展示智能视界的 Agent 协作与 Phase Gate 流程。

---

## 8. 最小闭环建议

第一版不要追求一次性完成全剧自动化，建议先跑通：

```text
ep001 / board-001
→ 自动生成资产图工作流 JSON
→ 进入画布编辑
→ 生成图片
→ 人工审核
→ 入库
→ 自动生成故事板图工作流 JSON
→ 进入画布编辑
→ 生成故事板图
→ 人工审核
→ 自动生成 Seedance 视频工作流 JSON
→ 进入画布编辑
→ 生成视频
→ 人工审核
→ 写回 board-001 历史
```

该闭环跑通后，再复制扩展到单集 8 个故事板和全剧队列。
