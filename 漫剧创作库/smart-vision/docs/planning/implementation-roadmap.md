# 智能视界落地路线图

> 本路线图用于把“智能视界”从架构方案推进到可开发、可验证、可迭代的产品工程。  
> 原则：先复用现有无限画布与漫剧创作库文件体系，先跑通故事板级闭环，再扩展单集和全剧。

---

## 1. 总体推进原则

1. **功能优先，UI 从简**：UI 只做能跑通流程的最小可用界面，不在视觉打磨、复杂交互和高级动效上消耗主要开发时间；开发资源优先投入底层架构、工程状态读写、Workflow Builder、审核驱动、产物回写、任务编排和端到端闭环。
2. **先封装现状，不重造流程**：所有任务从 `docs/workflow.md`、`docs/agent-protocol.md`、`docs/phase-gate-checklist.md`、`docs/project-memory-system.md` 映射。
3. **先现有节点，后新增节点**：MVP 先用当前 `txt2img`、`img2imgAll`、`seedanceVideo`、`videoEditor` 等节点生成 JSON。
4. **先故事板级，后单集级，再全剧级**。
5. **先人工审核闭环，后全自动队列**。
6. **先本地文件系统和工程记忆，后可选数据库与云存储增强**。
7. **所有关键结果写回项目文件和 `.smart-vision/` 工程状态，不依赖单一客户端或数据库**。
8. **先能力包 Runtime，后重型服务端**：MVP 不把 FastAPI、SQLite、Redis、RQ/Celery、PostgreSQL 作为核心前置依赖。

---

## 2. 阶段划分

## Phase 0：需求冻结与现状基线

目标：确认智能视界第一版只做“漫剧创作库工业化流程产品化”，不偏离当前体系。

交付物：

- `docs/smart-vision-architecture.md`
- `docs/smart-vision-canvas-node-plan.md`
- `docs/smart-vision-implementation-roadmap.md`

验收标准：

- 明确产品定位。
- 明确三种生产模式。
- 明确复用无限画布。
- 明确新增节点规划。
- 明确 MVP 开发顺序。

---

## Phase 1：智能视界产品壳 MVP

目标：先做一个可打开的产品入口，展示项目、集数、任务和审核状态。

功能：

1. 项目列表页。
2. 项目详情页。
3. 单集任务看板。
4. 故事板任务列表。
5. 审核中心。
6. 工作流 JSON 文件入口。
7. 运行日志 / 历史记录入口。

建议技术：

- 前端：`React` / `Next.js` 或现有工作台页面增强。
- 本地桥接层：复用现有 `tools/` 工具链，按需提供文件扫描、工作流打开和产物写回能力。
- 存储：工程目录内 JSON / Markdown 状态文件 + 本地项目文件。
- 可选增强：团队部署或云端协作时再引入服务端 API、数据库或队列。

最小状态对象：

- `.smart-vision/project-state.json`
- `.smart-vision/progress-ledger.json`
- `.smart-vision/continuity-ledger.json`
- `.smart-vision/artifact-registry.json`
- `.smart-vision/workflow-registry.json`
- `.smart-vision/review-ledger.json`
- `.smart-vision/recovery-checkpoint.json`

验收标准：

- 能读取一个 `projects/` 下的项目。
- 能显示 `ep001`。
- 能显示故事板级任务卡。
- 能标记任务为待审核 / 通过 / 打回。

---

## Phase 2：方法论内核索引与任务上下文包

目标：让系统知道每类任务应该加载哪些 docs、skills、agents、templates。

功能：

1. 方法论文档索引。
2. Agent 职责索引。
3. Skill 能力索引。
4. 模板索引。
5. 根据任务类型生成 `methodology_pack`。

任务类型示例：

- `creative_source_intake`
- `visual_style_bible`
- `character_asset_generation`
- `scene_panorama_generation`
- `storyboard_package_generation`
- `storyboard_image_generation`
- `seedance_video_generation`
- `episode_editing`
- `phase_gate_review`

验收标准：

- 输入任务类型，能返回必须读取的 docs / skills / templates。
- 能区分资产、故事板、视频、审核等不同任务。
- 能把 Phase Gate 检查项绑定到任务卡。

---

## Phase 3：能力包 Runtime 与 AI / 大模型任务编排器

目标：接入 AI / 大模型，把用户目标在能力包、工程记忆、项目上下文和输出 Schema 约束下拆成结构化任务树；GPT-5.5 仅作为可选模型之一，不作为平台绑定大脑。

功能：

1. 模型配置页。
2. OpenAI-compatible API 适配。
3. 任务树生成。
4. Agent 任务协议生成。
5. 输出结构校验。
6. 失败重试与人工修正。

模型输入必须包含：

- 当前项目状态。
- 当前生产模式。
- 当前 Phase。
- 方法论包。
- 可用模板。
- 当前项目产物路径。
- 输出 JSON Schema。

模型输出必须是结构化 JSON，禁止只输出自然语言。

验收标准：

- 输入“为 ep001 board-001 创建故事板级半自动流程”，能生成任务树。
- 每个任务有 Agent、Skill、输入、输出、审核门禁。
- 任务树可进入看板。

---

## Phase 4：Workflow JSON Builder

目标：自动生成当前无限画布可导入的 `mjb-workflow-v1` JSON。

优先模板：

1. 角色资产图工作流。
2. 场景 720 全景图工作流。
3. 场景 12 宫格视角图工作流。
4. 故事板图工作流。
5. Seedance 视频工作流。
6. 单集视频拼接工作流。

第一版只使用现有节点：

- `stylePreset`
- `singleImage`
- `txt2img`
- `img2imgAll`
- `imageToPanorama`
- `panoramaViewer`
- `seedanceVideo`
- `singleVideo`
- `videoEditor`

验收标准：

- 生成的 JSON 可被当前画布导入。
- 导入后节点不丢失。
- 节点中包含提示词、参考图、参数、输出路径信息。
- 用户能在画布编辑后继续执行。

---

## Phase 5：人工审核闭环

目标：让流程能在关键节点暂停，等待用户审核。

审核类型：

1. `workflow_review`：工作流结构审核。
2. `asset_image_review`：资产图审核。
3. `storyboard_image_review`：故事板图审核。
4. `video_review`：视频审核。
5. `episode_review`：单集成片审核。
6. `phase_gate_review`：阶段门禁审核。

审核动作：

- 通过。
- 打回。
- 局部返工。
- 备注。
- 查看画布。
- 查看历史版本。

验收标准：

- 任务能进入 `waiting_review`。
- 用户通过后自动进入下一任务。
- 用户打回后生成返工任务。
- 审核记录写入 `08-qa/` 或项目历史记录。

---

## Phase 6：故事板级半自动端到端闭环

目标：跑通最小生产闭环。

范围：

- 一个项目。
- 一集。
- 一个故事板。

完整链路：

```text
读取项目上下文
→ 创建资产图工作流 JSON
→ 画布编辑 / 执行
→ 资产图审核
→ 创建故事板图工作流 JSON
→ 画布编辑 / 执行
→ 故事板图审核
→ 创建 Seedance 视频工作流 JSON
→ 画布编辑 / 执行
→ 视频审核
→ 写回故事板历史
```

验收标准：

- 每一步都有任务状态。
- 每一步都有产物路径。
- 每个工作流 JSON 可重新打开。
- 用户审核能驱动下一步。
- 最终历史记录可追溯。

---

## Phase 7：新增智能视界业务节点

目标：增强画布可读性和业务表达力。

优先新增：

1. `svReviewGate`
2. `svOutputRegistry`
3. `svProjectContext`
4. `svEpisodeContext`
5. `svMethodologyPack`
6. `svStoryboardPackage`
7. `svReferenceMatrix`
8. `svPhaseGate`
9. `svAgentTask`
10. `svAssetSpec`

改造范围：

- `NODE_DEFS`
- `defaultValues`
- 节点控件渲染
- `computeNode`
- `runNode`
- 工作流导入导出兼容

验收标准：

- 新节点能被导入导出。
- 新节点能显示业务信息。
- 审核节点能阻塞下游。
- 入库节点能写回项目索引或记录。

---

## Phase 8：单集半自动流程

目标：一集内批量执行多个故事板，并拼接成单集成片。

功能：

1. 生成单集任务树。
2. 为每个故事板生成子工作流。
3. 可生成单集总工作流 JSON。
4. 自动执行多个故事板视频。
5. 自动进入 `videoEditor` 拼接。
6. 生成单集成片。
7. 用户审核单集。
8. 通过后归档并进入下一集。

验收标准：

- ep001 可包含多个 board 任务。
- board 视频全部完成后自动拼接。
- 单集审核通过后状态变为完成。
- 自动创建 ep002 待执行任务。

---

## Phase 9：全剧全自动队列

目标：按集推进整部剧，但不一次性渲染全剧画布。

功能：

1. 全剧队列页。
2. 每集独立任务树。
3. 每集独立 workflow JSON。
4. 跨集一致性检查。
5. 自动进入下一集。
6. 全剧完成报告。

限制：

- 全剧页只显示队列和进度。
- 用户点击某一集，才加载该集画布。
- 禁止生成一个包含全剧所有节点的超大画布。

验收标准：

- 能自动从 ep001 推进到 ep002。
- 用户可查看任意一集的工作流。
- 全剧状态可汇总。
- 内存和前端渲染稳定。

---

## 3. 推荐目录结构

第一版优先采用本地优先 Runtime 结构，不强制拆成前后端工程：

```text
tools/smart-vision/
  runtime/
    capability_loader.py
    context_builder.py
    task_planner.py
    recipe_runner.py
    workflow_builder.py
    review_gate.py
    project_scanner.py
    recovery_scanner.py
  ui/
    app/
    components/
    pages/
    stores/
  schemas/
    task.schema.json
    workflow-request.schema.json
    review.schema.json
    project-state.schema.json
    artifact-registry.schema.json
  templates/
    workflows/
      asset-image.workflow.json
      storyboard-image.workflow.json
      seedance-video.workflow.json
      episode-edit.workflow.json
```

工程交付物与状态必须保存在用户项目目录中，参考 `docs/smart-vision-project-workspace-standard.md`。服务端 API、数据库和队列只作为多人协作或云端部署的后续增强层。

---

## 4. 第一轮开发任务拆解

## 任务 1：建立智能视界项目入口

输出：

- `/smart-vision` 页面。
- 项目列表。
- 项目详情。

## 任务 2：建立工程记忆状态结构

输出：

- Project / Episode / Task / Review / WorkflowFile / Artifact 状态对象。
- `.smart-vision/` 状态目录初始化。
- `project-state.json`、`progress-ledger.json`、`artifact-registry.json`、`continuity-ledger.json`、`review-ledger.json` 模板写入。

## 任务 3：读取当前项目文件

输出：

- 项目扫描器。
- 读取 `projects/*`。
- 识别 `ep001`、资产索引、故事板、生成记录。

## 任务 4：生成故事板级任务树

输出：

- 固定 Recipe 版任务树。
- 能力包 Runtime 读取工程记忆、方法论包和输出 Schema 后生成任务树。
- 任务超出 Recipe 时再交给 AI / 大模型动态规划。

## 任务 5：生成现有画布 JSON

输出：

- 资产图 workflow JSON。
- 故事板图 workflow JSON。
- 视频 workflow JSON。

## 任务 6：接入画布入口

输出：

- 点击任务卡进入画布。
- 自动加载对应 workflow JSON。

## 任务 7：审核状态驱动流程

输出：

- 审核通过进入下一任务。
- 打回生成返工任务。
- 审核记录写文件。

---

## 5. 首个验证场景

建议以当前主线项目为首个上游验证对象，智能视界自身产物统一落到 `smart-vision/outputs/`：

```text
上游资料源：projects/无限强化_漫剧_001
智能视界交付区：smart-vision/outputs
```

首个验证目标：

```text
ep001 / board-001 / 故事板级半自动闭环
```

最小成功标准：

1. 系统能读取项目。
2. 系统能生成 board-001 的资产 / 故事板图 / 视频三个任务。
3. 系统能为每个任务生成画布 JSON。
4. 用户能打开画布看到工作流。
5. 用户审核通过后流程能推进。
6. 最终形成 board-001 历史记录。

---

## 6. 开发优先级结论

第一优先级不是新增大量节点，而是：

```text
项目读取 → 任务看板 → 现有节点 workflow JSON 生成 → 画布入口 → 人工审核 → 文件写回
```

等这个闭环跑通后，再新增 `sv*` 业务节点，让画布从“能执行”升级为“能表达工业化语义”。
