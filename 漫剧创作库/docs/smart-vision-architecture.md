# 智能视界总体架构与功能规划

> 定位：智能视界不是重建一套新流程，而是把当前“漫剧创作库”的工业化自动流水线产品化、可视化、可调度化。  
> 核心公式：**漫剧创作库工业化内核 + AI / 大模型任务编排层 + 能力包 Runtime + 无限画布工作流执行器 + Phase Gate 人工审核门禁 + 项目工程记忆系统**。  
> 边界：本文仅保留漫剧创作库侧的能力包索引说明；智能视界主工程文档、状态源、Workflow 与交付物以 `smart-vision/`，尤其 `smart-vision/outputs/` 为准。

---

## 1. 建设目标

智能视界要解决的问题不是“能不能生成图片或视频”，而是把一整部漫剧 / 短剧的工业化生产链变成用户可见、可控、可审核、可追溯的产品系统。

系统必须支持：

1. 接入 AI / 大模型作为任务编排与流程生成能力，支持用户配置模型、OpenAI-compatible 模型和可选 GPT-5.5，不把平台大脑绑定到单一模型。
2. 依托现有 `docs/`、`templates/`、`agents/`、`skills/`、`wordlists/`、`projects/` 的成熟方法论和产物标准。
3. 自动把创作任务拆成 Agent 任务、Phase 任务、画布工作流任务和人工审核任务。
4. 自动生成当前无限画布可导入的 `mjb-workflow-v1` 工作流 JSON。
5. 用户点击任务节点后进入无限画布，加载对应 JSON，进行人工编辑、确认、执行。
6. 在资产图、故事板图、视频、单集成片等关键节点设置人工审核门禁。
7. 支持故事板级半自动、单集半自动、全剧全自动三种模式。
8. 所有产出物、审核记录、版本、失败返工和最终结果必须写回项目文件与历史记录。

---

## 2. 产品定位

智能视界应被设计为“影视漫剧 AIGC 工业化生产操作系统”，而不是单一生图工具。

### 2.1 它封装什么

- `docs/workflow.md`：Phase 0-7 总流程。
- `docs/agent-protocol.md`：Producer / Writer / Director / Storyboard Artist / Librarian / Studio / Reviewer 协作协议。
- `docs/phase-gate-checklist.md`：阶段放行和返工门禁。
- `docs/project-memory-system.md`：文件化记忆、状态快照、跨工具交接规范。
- `skills/`：把方法论转成可执行任务能力。
- `agents/`：把角色职责转成可调度执行单元。
- `templates/`：把产物格式、提示词格式、项目骨架转成结构化输出。
- `tools/workbench-web/image-studio-canvas.html`：复用当前无限画布节点工作流系统。

### 2.2 它不做什么

- 不重做无限画布。
- 不绕过现有方法论直接让模型自由创作。
- 不把视频提示词当作中游主交付物；当前中游核心仍是故事板生产包。
- 不一次性渲染整部剧总画布，避免内存和交互复杂度失控。

---

## 3. 总体架构

```text
用户 / 项目管理员
  ↓
智能视界产品层
  - 项目看板
  - 集数看板
  - 故事板任务流
  - 审核中心
  - 画布入口
  - 历史记录
  ↓
能力包 Runtime + AI / 大模型任务编排层
  - 用户配置模型 / OpenAI-compatible / 可选 GPT-5.5
  - Capability Pack Loader
  - Dynamic Planner
  - Compiled Recipe Runner
  - 方法论与工程记忆上下文组装器
  - Workflow JSON Builder
  - Phase Gate Runner
  ↓
漫剧创作库工业化内核
  - docs
  - agents
  - skills
  - templates
  - wordlists
  - project memory
  ↓
无限画布执行层
  - 节点 JSON
  - 工作流 JSON 导入导出
  - 生图节点
  - 图生图节点
  - 720 全景节点
  - Seedance 视频节点
  - 视频剪辑节点
  ↓
项目产物层
  - 01-story
  - 02-director
  - 03-assets
  - 04-storyboard
  - 05-prompts
  - 06-generated
  - 07-edit
  - 08-qa
  - 09-publish
```

---

## 4. 核心模块

## 4.1 项目控制台

用于管理整部剧或单个项目。

主要功能：

- 创建 / 导入项目。
- 选择生产模式：故事板级、单集级、全剧级。
- 显示当前 Phase、当前集、当前故事板、当前阻塞点。
- 显示资产完成率、故事板完成率、视频完成率、审核通过率。
- 进入项目文件、资产索引、故事板生产包、画布工作流和历史记录。

## 4.2 可视化流程任务看板

看板不是通用待办列表，而是映射 `docs/workflow.md` 的 Phase 流程。

推荐列：

1. 创作源 / 风格锁定
2. 故事 / 剧本
3. 导演讲戏
4. 资产生产
5. 故事板生产包
6. 配套生成说明
7. 生图 / 生视频
8. 剪辑 / 拼接
9. QA / 发布

每张任务卡应包含：

- 项目名、集数、故事板编号。
- 当前 Agent 角色。
- 调用 Skill。
- 必读 docs。
- 输入产物。
- 输出产物。
- 是否需要人工审核。
- 是否有关联画布 JSON。
- 当前状态：待开始 / 生成中 / 等待审核 / 已通过 / 已打回 / 已归档。

## 4.3 能力包 Runtime 与 AI / 大模型任务编排层

AI / 大模型不是直接写结果，而是在能力包 Runtime 约束下输出结构化任务。Runtime 负责加载能力包、工程记忆、客户端恢复信息、模板和 Phase Gate；AI / 大模型负责在这些约束内完成任务规划、内容生成或局部修复。

标准任务协议：

```json
{
  "task_id": "sv-ep001-board001-assets",
  "project_id": "project-id",
  "mode": "storyboard_semi_auto",
  "phase": "assets",
  "agent_role": "Studio",
  "required_docs": [],
  "required_skills": [],
  "input_artifacts": [],
  "output_artifacts": [],
  "canvas_workflow_required": true,
  "canvas_schema": "mjb-workflow-v1",
  "human_review_required": true,
  "phase_gate": "assets_to_storyboard",
  "memory_write_policy": "file_first"
}
```

编排层必须执行：

1. 判断用户输入属于哪条生产线。
2. 读取能力包清单、工程记忆、当前项目状态和客户端恢复指针。
3. 按 Phase 生成任务树。
4. 给每个任务绑定 Agent、Skill、docs、模板和输出 Schema。
5. 判断是否需要画布工作流。
6. 生成当前无限画布可导入的工作流 JSON。
7. 生成审核门禁与恢复检查点。
8. 通过后写回项目记录、产物索引、连续性账本和工程状态。

## 4.4 能力包与方法论内核服务

该服务负责把“漫剧创作库”当前文件体系变成可查询、可调度、可下发、可编译的能力包内核。它不只是检索 docs，而是把方法论、Agent、Skill、模板、词库、项目文件、审核反馈和工程记忆组装成任务上下文包。

索引范围：

- `docs/workflow.md`
- `docs/agent-protocol.md`
- `docs/phase-gate-checklist.md`
- `docs/project-memory-system.md`
- `docs/storyboard-methodology.md`
- `docs/camera-shot-methodology.md`
- `docs/gpt-image-prompt-methodology.md`
- `docs/director-storyboard-deliverable-standard.md`
- `docs/storyboard-video-model-adaptation-standard.md`
- `skills/*.md`
- `agents/*/agent.md`
- `templates/**/*.md`
- `wordlists/**/*.json`
- `projects/*` 当前项目产物

输出不是普通检索结果，而是任务上下文包：

```json
{
  "methodology_pack_id": "storyboard_package_d15_seedance",
  "docs": [],
  "skills": [],
  "agents": [],
  "templates": [],
  "redlines": [],
  "output_schema": {},
  "phase_gate_items": []
}
```

## 4.5 Workflow JSON 生成器与链路 Runtime

该模块负责把智能视界任务转换成当前无限画布 JSON，并由本地 Bridge Runtime 维护“生成 Workflow → 画布执行 → 产物登记 → 产物审核 → 下游 Workflow 创建”的可追踪链路。UI 只作为最低可用控制台，核心能力落在 Runtime 接口与 `.smart-vision` 文件化状态源。

当前已落地接口：

| 接口 | 作用 |
|---|---|
| `GET /api/smart-vision/workflows/chains` | 返回全部 Workflow 链路、运行时统计、当前快照。 |
| `GET /api/smart-vision/workflows/chains?workflowId=...` | 返回单条链路详情、源 Workflow、下游 Workflow、关联审核、导入 URL。 |
| `POST /api/smart-vision/workflows/chains/action` | 执行链路动作，包括导入 URL 生成、标记执行中、送审、审核通过、创建下游、返工、归档和恢复。 |
| `GET /api/smart-vision/workflows/runtime/diagnostics` | 扫描 Workflow、审核、产物索引和链路一致性，返回 Runtime 健康状态、问题列表和下一步修复建议。 |
| `GET /api/smart-vision/workflows/runner/status` | 返回后台 Runner 当前状态、最近 run、最近事件、诊断结果与快照。 |
| `GET /api/smart-vision/workflows/runner/runs?runId=...` | 按 runId 查询单次 Runner 运行记录、关联事件、当前 Runner 状态与快照。 |
| `POST /api/smart-vision/workflows/runner/retry` | 对指定 runId 中失败链路执行重试，并把 retry run 写回同一 ledger。 |
| `POST /api/smart-vision/workflows/chains/replay` | 对单条链路执行一次重放推进，按当前 `nextAction` 或指定动作推进。 |
| `POST /api/smart-vision/workflows/queue/run` | 对未闭环链路执行批量队列推进，并写入 `workflow-runner-ledger.json`。 |
| `POST /api/smart-vision/workflows/self-test` | 执行最小闭环自测：创建草案、登记产物、创建审核、审核通过、生成下游 Workflow。 |

链路动作协议：

```json
{
  "workflowId": "draft-storyboard-xxxx",
  "action": "approve_artifact_review",
  "artifactPath": "06-generated/example.md",
  "status": "done"
}
```

返回结构必须包含：

```json
{
  "action": "approve_artifact_review",
  "result": {},
  "runtime": {},
  "snapshot": {}
}
```

链路 Runtime 的判断顺序：

1. 没有输出产物：`add_output`。
2. 有输出但没有产物审核：`create_artifact_review`。
3. 产物审核等待中：`approve_artifact_review`。
4. 产物审核打回：`fix_artifact_output`。
5. 产物审核通过但没有下游：`create_downstream_workflow`。
6. 已有下游：`import_downstream_workflow`。

Runtime 诊断必须覆盖：

- Workflow 注册项是否存在真实 JSON 文件。
- Workflow 输出产物路径是否安全、可解析。
- 输出产物是否已生成对应审核。
- `lastOutputReviewId` 是否能在 `review-ledger.json` 中找到。
- 审核记录引用的 Workflow 是否仍存在。
- 审核产物是否已进入 Artifact Registry。

链路重放与队列执行原则：

- 单链路重放只推进当前 `nextAction`，不跳过审核门禁。
- 缺少 `artifactPath` 时，`add_output` 不自动伪造产物，只返回 blocked 原因。
- 队列执行只处理未闭环链路，并记录每条链路的成功 / 失败结果。
- Runner 支持按 `runId` 查询单次运行详情，返回该 run、关联 events、当前 Runner 状态和快照。
- 失败链路重试只读取指定 run 的 failed 结果，不重跑成功链路，不跳过审核门禁，不伪造缺失产物。
- retry 会创建新的 retry run，并通过 `retryOfRunId` / `sourceRunId` 追溯原始 run。
- 队列运行和 retry 运行都必须写入 `.smart-vision/workflow-runner-ledger.json`，包括 `runs[]` 与 `events[]`。
- `runs[]` 保存每次队列执行的 runId、状态、起止时间、请求数量和摘要结果。
- `events[]` 保存 queue_started、chain_replayed、chain_failed、queue_completed 等事件，最多保留最近 500 条。
- Runner 状态接口只读取同一 ledger 与 Runtime 诊断，不另建平行状态系统。
- 后续后台 Runner、定时任务或自动恢复器都必须复用同一 Runtime 与同一 ledger。

## 4.5.1 Workflow JSON 生成器

该模块负责把智能视界任务转换成当前无限画布 JSON。

当前无限画布导出格式为：

```json
{
  "schema": "mjb-workflow-v1",
  "version": "1.0.0",
  "meta": {},
  "canvas": {
    "nodes": [],
    "conns": [],
    "view": {},
    "next": 1,
    "muted": []
  }
}
```

关键规则：

- 生成的节点 `type` 必须存在于无限画布 `NODE_DEFS`，否则导入时会被过滤。
- 如果新增智能视界业务节点，必须同步补齐 `NODE_DEFS`、`defaultValues`、渲染控件、`computeNode`、`runNode`。
- 画布 JSON 只承载当前故事板或当前集的执行链，不承载全剧总链。

## 4.6 人工审核与 Phase Gate 模块

审核中心应直接映射 `docs/phase-gate-checklist.md`。

关键审核点：

1. 工作流 JSON 审核：用户确认画布结构、节点、连线、参考图、提示词无误。
2. 资产图审核：角色、道具、场景、720 全景、12 宫格视角图。
3. 故事板生产包审核：分镜表、导演故事板图、Panel 时长、连续性卡、资产引用矩阵。
4. 视频生成审核：单故事板视频、镜头连续性、声音、动作结果。
5. 单集成片审核：拼接版、字幕、BGM、SFX、剧情连贯性。
6. 全剧一致性审核：角色、场景、风格、伤痕、道具、世界观连续性。

审核结果：

- 通过：进入下一阶段。
- 打回：生成返工任务，并保留失败原因。
- 跳过：仅管理员可用，并必须记录原因。

## 4.7 项目记忆、工程记忆与历史记录模块

所有关键产物、流程状态和恢复检查点必须文件化保存。客户端缓存只作为辅助入口，工程目录内 `.smart-vision/` 才是跨会话、跨客户端、跨电脑迁移后的最高恢复依据。

写回目标：

- `.smart-vision/project-state.json`：当前项目 Phase、活动集数、活动故事板、下一步任务、阻塞点。
- `.smart-vision/progress-ledger.json`：每集、每个故事板、每条流程的进度与状态。
- `.smart-vision/continuity-ledger.json`：集间 / 板间承接锚点、角色状态、场景状态、道具状态、镜头连续性。
- `.smart-vision/artifact-registry.json`：资产图、故事板图、workflow JSON、视频、剪辑、QA 报告等产物索引。
- `.smart-vision/workflow-registry.json`：画布 workflow、节点版本、执行状态、可重开路径。
- `.smart-vision/workflow-runner-ledger.json`：Workflow Runner 队列执行记录、运行事件、最近状态和可恢复日志。
- `.smart-vision/review-ledger.json`：审核通过、打回、局部返工、备注和责任人。
- `.smart-vision/capability-lock.json`：能力包 id、版本、source hash、compiled runtime hash。
- `.smart-vision/recovery-checkpoint.json`：最近一次可恢复状态、缺失索引扫描结果、迁移报告。
- `.smart-vision/handoff-report.md`：换客户端、换机器或阶段交接时的人工可读交接说明。

工程内所有路径优先使用相对路径。若迁移后发现索引缺失但文件仍存在，恢复器必须先扫描工程目录并重建索引，将不确定项标记为 `needs_review`，不得直接判定工程损坏。

核心原则：先写工程记忆，后写客户端影子状态；先真实源，后引用；先 QA，后放行；先相对路径，后本机绝对路径。

---

## 5. 三种生产模式

## 5.1 故事板级半自动流程

适合精细控制单个故事板。

流程：

```text
选择项目 / 集数 / 故事板
→ 读取资产与故事板上下文
→ 生成资产图工作流 JSON
→ 用户进入画布编辑
→ 用户确认工作流
→ 执行资产生成
→ 人工审核资产图
→ 生成故事板生产包
→ 生成故事板图工作流 JSON
→ 用户进入画布编辑
→ 执行故事板图生成
→ 人工审核故事板图
→ 生成视频工作流 JSON
→ 用户进入画布编辑
→ 执行视频生成
→ 人工审核视频
→ 写入当前故事板历史
→ 进入下一个故事板
```

特点：

- 每个故事板都有独立画布 JSON。
- 每个关键产物都人工审核。
- 适合高质量主线镜头、动作戏、复杂场景。

## 5.2 单集半自动流程

适合一整集批量生产，但仍保留集级审核。

流程：

```text
选择 ep001
→ 生成单集任务图
→ 自动创建整集工作流 JSON
→ 用户进入画布查看 / 编辑
→ 资产图工作流
→ 故事板图工作流
→ 视频生成工作流
→ 8 个故事板视频串联
→ 自动生成全部视频
→ 自动拼接单集成片
→ 用户审核单集
→ 通过后归档
→ 自动进入 ep002
```

特点：

- 单集画布中可以串联资产、故事板图、视频、剪辑节点。
- 适合稳定项目的批量生产。
- 单集审核通过后再进入下一集。

## 5.3 全剧全自动流程

适合稳定风格、资产充分、门禁规则已验证的项目。

流程：

```text
选择全剧生产
→ 系统按集建立队列
→ ep001 自动执行
→ ep001 审核 / 自动 QA
→ ep002 自动执行
→ ...
→ 全剧完成
```

关键限制：

- 全剧模式只展示全剧进度队列。
- 用户只能进入某一集的画布查看，不允许一次性渲染全剧画布。
- 每集拥有独立 workflow JSON、状态、审核记录和历史归档。

---

## 6. 当前无限画布能力审查

## 6.1 已有节点

当前无限画布已有底层生产节点，可支撑智能视界执行层：

| 节点 | 用途 |
|---|---|
| `stylePreset` | 风格预设、词库配方、后续可接 `visual-style-bible` |
| `singleImage` | 资产图、故事板图、参考图输入输出 |
| `singleVideo` | 视频输入输出与预览 |
| `videoEditor` | 视频剪辑、拼接、音频、字幕、导出 |
| `txt2img` | 文生图，适合角色 / 道具 / 场景 / 故事板图 |
| `imageToPanorama` | 720 全景图生成 |
| `panoramaViewer` | 720 全景审核与空间查看 |
| `img2imgAll` | 多参考图图生图、故事板图生成 |
| `seedanceVideo` | Seedance 图 / 文生视频 |

## 6.2 当前不足

现有节点偏“生成工具层”，缺少智能视界所需的“业务语义层”。

缺口包括：

1. 没有项目上下文节点。
2. 没有集数上下文节点。
3. 没有故事板生产包节点。
4. 没有 Agent 任务节点。
5. 没有方法论包节点。
6. 没有资产引用矩阵节点。
7. 没有参考图职责矩阵节点。
8. 没有人工审核节点。
9. 没有产物入库节点。
10. 没有 Phase Gate 节点。

## 6.3 建议新增节点

第一批最小业务节点：

| 节点类型 | 名称 | 作用 |
|---|---|---|
| `svProjectContext` | 项目上下文 | 绑定项目、风格母版、项目状态、根目录 |
| `svEpisodeContext` | 单集上下文 | 绑定 ep、剧本、导演讲戏、资产索引 |
| `svAgentTask` | Agent 任务 | 显示当前由哪个 Agent / Skill 执行 |
| `svMethodologyPack` | 方法论包 | 注入 docs / skills / templates 约束 |
| `svAssetSpec` | 资产规格 | 角色 / 道具 / 场景设定稿生成规范 |
| `svReferenceMatrix` | 参考图职责矩阵 | 约束参考图优先级与抢权风险 |
| `svStoryboardPackage` | 故事板生产包 | 承载分镜表、Panel、连续性卡、模型适配说明 |
| `svPhaseGate` | 阶段门禁 | 映射 Phase Gate Checklist |
| `svReviewGate` | 人工审核 | 等待用户通过 / 打回 / 备注 |
| `svOutputRegistry` | 产物入库 | 回写资产索引、生成记录和历史状态 |

---

## 7. 页面布局与交互

## 7.1 总体布局

推荐使用四区布局：

```text
左侧：项目 / 集数 / 故事板导航
中间：流程任务看板 / 队列视图
右侧：当前任务详情 / 审核详情 / 产物预览
底部：运行日志 / 大模型决策记录 / 文件写回记录
```

## 7.2 项目首页

显示：

- 项目封面和基础信息。
- 当前生产模式。
- 总集数、已完成集数、当前集。
- 资产完成率。
- 故事板生产包完成率。
- 视频完成率。
- 当前阻塞点。
- 最近审核任务。

## 7.3 单集页面

显示：

- ep 编号。
- 本集剧本状态。
- 本集资产列表。
- 本集故事板列表。
- 每个故事板的视频状态。
- 本集工作流 JSON 入口。
- 本集审核记录。
- 本集成片入口。

## 7.4 故事板页面

显示：

- 分镜表。
- Panel 列表。
- 资产引用矩阵。
- 参考图职责矩阵。
- 故事板图。
- 视频生成任务。
- 当前画布 JSON。
- 审核门禁。

## 7.5 审核中心

审核中心按优先级显示：

1. 阻塞下一阶段的审核。
2. 当前集待审核。
3. 全剧一致性风险。
4. 已打回未返工。
5. 已通过归档。

审核动作：

- 通过。
- 打回并填写原因。
- 局部返工。
- 进入画布编辑。
- 查看历史版本。

---

## 8. 技术选型建议

## 8.1 前端

推荐：

- `React` / `Next.js`：产品后台、看板、审核中心。
- `Zustand` 或 `Redux Toolkit`：任务状态与画布入口状态。
- `TanStack Query`：任务、项目、审核记录数据请求。
- `React Flow` 可用于高层流程图；但底层生成工作流继续复用现有无限画布。
- 当前 `image-studio-canvas.html` 可先作为独立画布页面嵌入，再逐步模块化。

## 8.2 本地 Runtime 与桥接层

推荐：

- `tools/smart-vision/runtime/`：能力包加载、上下文组装、Recipe 执行、Workflow JSON 生成、恢复扫描。
- 工程目录内 JSON / Markdown：MVP 阶段存任务、审核、工作流索引和恢复检查点。
- 现有 `tools/` 工具链：复用文件扫描、工作台启动、生成任务归档等本地能力。
- 服务端 API、数据库与队列只作为多人协作或云端部署增强，不作为第一版前置依赖。

## 8.3 AI / 大模型层

支持：

- 用户自配 OpenAI-compatible API。
- 可选 GPT-5.5、Claude、Gemini、DeepSeek、Qwen 等模型供应商。
- 本地或私有化模型接入，只要能满足结构化 JSON 输出和上下文长度要求。

配置字段：

- `provider`
- `base_url`
- `api_key_ref`
- `model`
- `temperature`
- `max_tokens`
- `task_policy`

工程记忆不得保存完整 API Key，只保存 `api_key_ref`、provider 和模型名。

## 8.4 本地任务与调度

MVP：

- 本地任务状态文件 + Runtime Runner。
- `.smart-vision/progress-ledger.json` 记录暂停、继续、取消、重试和失败恢复。
- `.smart-vision/recovery-checkpoint.json` 记录最近可恢复点。

增强版：

- 多人协作或云端部署时，可选接入服务端任务队列。
- 队列层不得替代工程目录记忆，所有关键状态仍必须写回 `.smart-vision/`。

## 8.5 文件与对象存储

MVP：

- 本地 `projects/` 文件系统。

正式版：

- 本地文件 + 对象存储双链路。
- 保留当前对象存储上传能力，支持与 `/v1/files` 统一链路一键切换。

---

## 9. 数据模型草案

## 9.1 Project

```json
{
  "id": "project-id",
  "name": "无限强化·灵纹觉醒",
  "root_path": "projects/无限强化_漫剧_001",
  "mode": "episode_semi_auto",
  "current_phase": "storyboard",
  "current_episode": "ep001",
  "visual_style_bible": "03-assets/style/visual-style-bible.md",
  "status": "running"
}
```

## 9.2 Episode

```json
{
  "id": "ep001",
  "project_id": "project-id",
  "script_path": "01-story/scripts/ep001.md",
  "asset_index_path": "03-assets/asset-index.md",
  "storyboard_path": "04-storyboard/ep001.md",
  "workflow_json_path": "workflows/ep001.workflow.json",
  "status": "waiting_review"
}
```

## 9.3 Task

```json
{
  "id": "task-id",
  "project_id": "project-id",
  "episode_id": "ep001",
  "board_id": "board-001",
  "phase": "generation",
  "agent_role": "Studio",
  "skill_ids": [],
  "input_artifacts": [],
  "output_artifacts": [],
  "workflow_json_path": "",
  "review_required": true,
  "status": "pending"
}
```

## 9.4 Review

```json
{
  "id": "review-id",
  "task_id": "task-id",
  "review_type": "asset_image",
  "status": "approved",
  "comment": "",
  "reviewer": "user",
  "created_at": ""
}
```

---

## 10. MVP 开发路线

## Phase A：只做产品壳与流程看板

目标：先把项目、集数、故事板、任务、审核状态可视化。

交付：

- 项目列表。
- 单项目首页。
- 单集任务看板。
- 审核中心。
- 工作流 JSON 文件索引。

## Phase B：接入能力包 Runtime 与 AI / 大模型任务生成

目标：让 AI / 大模型在能力包、工程记忆、docs、agents、skills 和输出 Schema 约束下生成任务树；GPT-5.5 仅作为可选模型之一。

交付：

- 模型配置页。
- 方法论上下文包生成。
- Agent 任务协议。
- 任务树生成。
- Phase Gate 自动生成。

当前实现进度：

- 已新增 Runtime Task Compiler 最小版。
- 已支持 `createWorkflowTaskPlan()`：根据 `taskType / projectId / episodeId / phase` 生成标准 Smart Vision 任务计划。
- 已支持 `resolveRequiredMethodologyPack()`：复用能力包索引解析 docs、skills、templates、phase gate、redlines。
- 已支持 `resolvePhaseGateForTask()`：按资产、故事板、视频、审核任务推断阶段门禁。
- 已新增 API：`POST /api/smart-vision/workflows/tasks/plan`。
- 已新增前端类型：`SmartVisionWorkflowTask`、`SmartVisionTaskPlan`。

## Phase C：自动生成画布 Workflow JSON

目标：把资产图、故事板图、视频生成任务转换成当前无限画布 JSON。

交付：

- `mjb-workflow-v1` JSON Builder。
- 故事板级工作流 JSON。
- 单集级工作流 JSON。
- 画布入口跳转。
- 画布导入验证。

当前实现进度：

- 已新增 `compileTaskToWorkflowDraft()` 最小版。
- 已支持把 `SmartVisionTaskPlan` 编译为 `mjb-workflow-v1` 草案。
- Workflow 草案的 `contextPack` 节点已携带 `taskPlan`，保证任务协议、能力包、输入产物、门禁与画布 JSON 可追溯。
- `compileTaskToWorkflowDraft()` 现在会同步把草案写入项目 `07-workflows/`，确保导入 URL 指向真实可读取文件。
- 已新增 `validateWorkflowDraftImport()`：校验 Workflow JSON 文件存在、Schema 为 `mjb-workflow-v1`、导入 URL 存在、画布节点和连线结构有效。
- 已新增 `validateWorkflowRegistryItem()`：快照构建时为注册表 Workflow 读取真实 JSON，自动补齐 `importUrl` 与 `importCheck`。
- `saveWorkflowDraft()` 已支持复用已有 `workflowDraft`，可把已编译草案直接登记进 `.smart-vision/workflow-registry.json`，避免保存时重复生成第二份草案。
- 已新增 API：`POST /api/smart-vision/workflows/tasks/compile`。
- `POST /api/smart-vision/workflow-draft/save` 已支持接收 `workflowDraft` 并登记为项目 Workflow。
- 已新增前端类型与请求封装：`CompiledWorkflowDraft`、`WorkflowImportCheck`、`createWorkflowTaskPlan()`、`compileWorkflowTask()`；`saveWorkflowDraft()` 已支持传入已编译草案。
- 前端控制台已接入“生成任务计划 / 编译 Workflow Draft / 保存为项目 Workflow / 打开导入 URL”最低可用入口，并展示编译结果是否已落盘、导入校验是否可用。
- Workflow 注册表列表已展示导入 URL、导入健康状态、真实 JSON 节点/连线数量，并在导入按钮中优先使用后端补齐的 `importUrl`。

## Phase D：新增智能视界业务节点

目标：补齐无限画布业务语义层。

交付：

- `svProjectContext`
- `svEpisodeContext`
- `svMethodologyPack`
- `svStoryboardPackage`
- `svReviewGate`
- `svOutputRegistry`

同时修改：

- `NODE_DEFS`
- `defaultValues`
- 控件渲染
- `computeNode`
- `runNode`
- 导入导出兼容

## Phase E：跑通故事板级半自动闭环

目标：完成最小生产闭环。

交付：

```text
故事板任务
→ 生成画布 JSON
→ 用户编辑画布
→ 执行生图 / 生视频
→ 用户审核
→ 写回项目历史
```

当前实现进度：

- 已以《无限强化·灵纹觉醒》`ep001-storyboard-image-generation` 跑通真实单故事板链路。
- 已完成：Workflow 登记 → 产物登记 → `artifact-registry.json` 写回 → `review-ledger.json` 创建审核 → 审核通过 → 下游 `video_generation` Workflow 创建 → UI 链路卡片可恢复展示。
- 已修正链路闭环判断：只有同时满足“存在输出产物、产物审核通过、存在下游 Workflow”才视为 closed。
- 已增强产物登记与审核创建幂等性，重复执行不重复生成无效记录，不覆盖已通过审核状态。
- 已在控制台展示链路状态、下一步动作、审核状态、源产物、下游 Workflow 与返工后重新送审入口。
- 当前验证样例：上游 `ep001-storyboard-image-generation` 已闭环；下游 `draft-video_generation-1778182715841` 已完成真实视频生成、产物登记、视频审核通过与下游 `edit` Workflow 自动创建。
- 已补齐 `video_generation` 下游链路基础能力：项目扫描支持 `.mp4/.mov/.m4v/.webm`，产物读取接口支持视频 MIME 与 raw 流式返回，前端 Artifact Preview 支持视频播放，Runtime 诊断可发现已登记但真实文件缺失的视频产物，`video_generation` 标准输出路径修正为 `06-generated/videos/**`。
- 已将下游 `draft-video_generation-1778182715841` 从通用草案升级为真实无限画布视频执行链路：`stylePreset → seedanceVideo → singleVideo → videoEditor`。该链路只使用 `NODE_DEFS` 已登记节点，`seedanceVideo` 自动携带 `ep001-shots.md` 中 `Shot 1` 的 Seedance 提示词，已生成并归档真实视频 `smart-vision/outputs/06-generated/videos/ep001-shot01-seedance-task_rD9O9UwXPNOD81FSNC07sIPgkNQpDlfE.mp4`，视频审核 `video_review` 已通过，自动创建下游 `smart-vision/outputs/05-workflows/ep001/draft-edit-1778210764441.mjb-workflow.json`。

下一批 Workflow 模板路线：

1. **故事板图 → 视频生成模板**：优先补齐 `video_generation` 的真实导入、执行、产物登记、审核与返工闭环。
2. **资产图 → 故事板图模板**：把角色 / 场景 / 道具资产产物接入故事板图 Workflow 输入，验证资产引用矩阵与参考图职责矩阵。
3. **单集多故事板队列模板**：以 `ep001` 为单位串联多个故事板链路，验证 Runner 批量推进、失败重试和不跳过审核门禁。
4. **单集剪辑归档模板**：把多个故事板视频汇入剪辑 / 拼接 / 单集审核 / 归档链路。

## Phase F：跑通单集半自动

目标：一集内多个故事板串联生产，自动拼接成片。

交付：

- 单集工作流 JSON。
- 8 个故事板视频串联。
- 自动拼接。
- 单集审核。
- 单集归档。

## Phase G：全剧全自动队列

目标：按集排队执行全剧生产。

交付：

- 全剧队列。
- 每集独立 workflow。
- 全剧进度页。
- 跨集一致性检查。
- 全剧历史归档。

---

## 11. 关键风险与约束

1. **不能绕过项目文件化记忆**：所有重要结果必须写回项目文件。
2. **不能让大模型自由发挥流程**：必须按 docs、agents、skills、templates 约束输出。
3. **不能一次性渲染全剧画布**：全剧只显示队列，每集独立画布。
4. **新增节点必须注册到 `NODE_DEFS`**：否则导入工作流会被过滤。
5. **故事板生产包是中游主交付**：视频提示词和平台稿只能作为下游派生。
6. **审核门禁必须可打回**：不能只做“通过 / 下一步”。
7. **对象存储链路要保留**：后续支持与 `/v1/files` 统一链路切换。
8. **全自动不是无审核**：全剧全自动也要支持按项目策略设置自动 QA、抽检或关键节点人工审核。

---

## 12. 一句话结论

智能视界应优先做成“漫剧创作库工业化生产流程的可视化调度与执行平台”：大模型负责任务拆解和工作流 JSON 生成，现有无限画布负责节点级执行，Phase Gate 负责人工审核与质量放行，项目文件化记忆负责长期可追溯与跨工具交接。
