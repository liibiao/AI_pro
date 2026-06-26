---
name: smart-vision-software-development-detailed-landing-plan
overview: 基于已落盘的智能视界架构、画布节点规划、实施路线图，以及当前漫剧创作库“故事板图作为视频生成前主交付物”的生产方案，设计一份可用于后续工程开发的整体软件落地详细方案。
design:
  architecture:
    framework: react
    component: shadcn
todos:
  - id: write-landing-doc
    content: 整理智能视界开发落地方案文档
    status: pending
  - id: explore-codebase
    content: 使用 [subagent:code-explorer] 深入确认画布和工具链改造点
    status: pending
    dependencies:
      - write-landing-doc
  - id: build-backend-mvp
    content: 实现项目扫描、任务、审核、工作流后端模块
    status: pending
    dependencies:
      - explore-codebase
  - id: build-frontend-mvp
    content: 实现项目看板、故事板链路、审核中心页面
    status: pending
    dependencies:
      - build-backend-mvp
  - id: build-workflow-builder
    content: 实现 D12/D15 画布工作流 JSON 生成器
    status: pending
    dependencies:
      - build-backend-mvp
  - id: run-storyboard-loop
    content: 跑通故事板图到视频半自动闭环
    status: pending
    dependencies:
      - build-frontend-mvp
      - build-workflow-builder
  - id: e2e-verify
    content: 使用 [skill:playwright-cli] 验证核心页面和流程
    status: pending
    dependencies:
      - run-storyboard-loop
---

## User Requirements

基于已落盘的智能视界规划文档，结合当前漫剧创作库“故事板图创作视频”的生产方案，设计一份可执行、可开发、可验收的整体软件开发落地详细方案。

## Product Overview

智能视界是对现有漫剧创作库工业化流水线的产品化封装，不重建流程、不重做无限画布。它以 GPT-5.5 或用户自配大模型作为任务编排大脑，以现有 docs、agents、skills、templates、wordlists、projects 为方法论和产物标准，以当前无限画布 `mjb-workflow-v1` JSON 为执行载体，将故事板生产包、导演故事板图、视频模型适配包、画布工作流、人工审核、产物入库和历史追溯串成可视化生产系统。

## Core Features

- 项目、集数、故事板三级生产看板
- GPT-5.5 / 用户模型任务编排与 Agent 任务树生成
- 方法论内核索引与任务上下文包生成
- D12-Sora2 / D15-Seedance2 故事板图到视频的生产链路
- 自动生成当前无限画布可导入的 `mjb-workflow-v1` 工作流 JSON
- 资产图、故事板图、视频、单集成片、Phase Gate 人工审核
- 工作流确认后进入画布编辑、执行、回写和历史归档
- 故事板级半自动、单集半自动、全剧队列化全自动三种模式
- 全剧模式按集查看工作流，避免一次性渲染全剧画布导致内存压力

## Tech Stack Selection

### 已确认现有基础

- 当前项目根目录：`/Users/billy/Documents/AI_pro/漫剧创作库`
- 已有智能视界规划文档：
- `docs/smart-vision-architecture.md`
- `docs/smart-vision-canvas-node-plan.md`
- `docs/smart-vision-implementation-roadmap.md`
- 当前无限画布文件：
- `tools/workbench-web/image-studio-canvas.html`
- 当前无限画布工作流格式：
- `schema: "mjb-workflow-v1"`
- 当前画布关键实现点：
- `NODE_DEFS`
- `defaultValues(type, values)`
- `runNode(id)`
- `loadData(wf)`
- 当前画布导入限制：
- `loadData(wf)` 会过滤未注册到 `NODE_DEFS` 的节点类型
- 当前可复用节点：
- `stylePreset`
- `singleImage`
- `singleVideo`
- `videoEditor`
- `txt2img`
- `imageToPanorama`
- `panoramaViewer`
- `img2imgAll`
- `seedanceVideo`

### 推荐技术栈

- 前端：React + TypeScript + Tailwind CSS
- 前端组件：shadcn/ui
- 后端：Python + FastAPI
- 本地数据库：SQLite
- 后续生产数据库：PostgreSQL
- 队列调度：
- MVP：FastAPI BackgroundTasks + SQLite 状态表
- 正式版：Redis + RQ 或 Celery
- 大模型适配：
- OpenAI-compatible API
- 默认 GPT-5.5
- 支持用户配置 `base_url`、`api_key`、`model`
- 文件系统：
- 继续以 `projects/` 为权威产物目录
- 数据库存索引、状态、任务、审核记录
- 画布集成：
- 第一阶段复用 `tools/workbench-web/image-studio-canvas.html`
- 后续再逐步模块化或包装为 React 页面
- 存储策略：
- 保留本地文件链路
- 保留对象存储上传链路
- 后续支持 `/v1/files` 统一链路与腾讯云对象存储一键切换

## Implementation Approach

### 总体策略

先把智能视界做成“现有漫剧创作库流水线的产品壳 + 任务调度器 + Workflow JSON Builder + 审核中心”，不立即大改无限画布。MVP 先使用当前已有画布节点生成可导入 JSON，跑通“故事板图创作视频”的最小闭环；当闭环稳定后，再新增 `sv*` 业务语义节点，让画布从“能执行”升级为“能表达工业化语义”。

### 核心业务主链路

本方案以故事板图创作视频为主链路：

1. 读取项目、集数、故事板上下文
2. 生成方法论上下文包
3. 确认故事板生产包完整性
4. 生成 D12-Sora2 或 D15-Seedance2 导演故事板图
5. 生成人工审核任务
6. 生成视频模型适配包
7. 生成 `mjb-workflow-v1` 画布 JSON
8. 用户进入无限画布编辑并确认
9. 执行视频生成
10. 审核视频结果
11. 写回 `06-generated/`、`08-qa/`、历史记录与索引文件
12. 推进下一个故事板或下一集

### 故事板图到视频的模型分支

- D12-Sora2：
- 输入：一张 D12-Sora2 导演故事板图 + 简短动态风格叙事提示词
- 总时长：不超过 12 秒
- 用途：信息压缩、镜头节奏明确、视频模型主控能力强的片段
- D15-Seedance2 Stable：
- 输入：4 图 + 1 视频
- 优先级：导演故事板图 > 关键角色图 > 场景图 > 关键道具图
- 用途：常规文戏、单主角动作、双人对峙、稳定性优先
- D15-Seedance2 Extended：
- 输入：9 图 + 1 视频 + 1 音频
- 用途：复杂动作戏、多人群戏、关键道具强叙事、声音节奏影响较大的片段
- 必须说明 Stable 不足的原因

### 关键技术决策

- 不把视频提示词作为中游主交付；中游主交付仍是故事板生产包。
- 不直接让大模型自由生成最终视频说明；大模型必须基于方法论包、Agent 职责、模板和 Phase Gate 输出结构化结果。
- 画布 JSON 生成器第一版只使用已存在节点，避免导入过滤导致节点丢失。
- 新增 `sv*` 业务节点放到第二阶段，降低初期爆炸半径。
- 任务状态和审核状态进数据库，真实产物和项目记忆必须写回项目文件。
- 全剧自动流程只渲染集级工作流，不渲染全剧总画布。

## Architecture Design

### 系统分层

1. 智能视界前端产品层

- 项目控制台
- 单集看板
- 故事板任务流
- 审核中心
- 画布入口
- 历史记录
- 模型配置

2. 后端 API 层

- Project API
- Episode API
- Board API
- Task API
- Review API
- Workflow API
- Artifact API
- Model Provider API

3. 编排服务层

- Task Orchestrator
- Agent Task Builder
- Phase Gate Resolver
- LLM Adapter
- JSON Schema Validator

4. 方法论内核层

- docs 索引
- skills 索引
- agents 索引
- templates 索引
- wordlists 索引
- project artifact index

5. 工作流生成层

- `mjb-workflow-v1` Builder
- D12-Sora2 Workflow Template
- D15-Seedance2 Stable Workflow Template
- D15-Seedance2 Extended Workflow Template
- Episode Editing Workflow Template

6. 无限画布执行层

- 复用 `tools/workbench-web/image-studio-canvas.html`
- 现有节点执行
- 后续 `sv*` 节点扩展

7. 文件化记忆与产物层

- `projects/*/03-assets/`
- `projects/*/04-storyboard/`
- `projects/*/05-prompts/`
- `projects/*/06-generated/`
- `projects/*/07-edit/`
- `projects/*/08-qa/`
- `projects/*/09-publish/`

### 关键数据流

```text
项目文件
→ 方法论内核索引
→ 大模型任务编排
→ 任务树 / 审核门禁
→ Workflow JSON Builder
→ 无限画布加载与编辑
→ 生图 / 生视频 / 剪辑执行
→ 人工审核
→ Artifact Registry
→ 项目文件写回
→ 历史记录与状态更新
```

## Implementation Notes

### 性能与稳定性

- 全剧模式只生成“集队列”，按需加载单集工作流，避免超大 JSON 和前端画布渲染压力。
- Workflow JSON Builder 生成前必须校验节点类型是否存在于当前 `NODE_DEFS`。
- 方法论索引可采用文件 mtime + hash 缓存，避免每次任务都全量读取 docs。
- 任务队列要支持暂停、继续、失败重试、人工打回和局部返工。
- 大模型输出必须走 JSON Schema 校验，不合格时进入修复或人工确认。
- 资产、故事板图、视频结果必须带版本号，避免覆盖旧产物。

### 日志与审计

- 任务日志存数据库，关键审核和结果写回项目文件。
- 不在日志中记录 API Key、完整密钥、隐私信息。
- 模型调用记录只保留 provider、model、task_id、token 统计、错误摘要。
- 审核打回必须保留原因、时间、操作者、关联产物版本。

### 兼容性与爆炸半径控制

- 第一版不修改当前画布核心交互，只生成现有节点可识别的 JSON。
- 新增 `sv*` 节点必须保持旧 `mjb-workflow-v1` 导入导出兼容。
- 不改变当前漫剧创作库既有 Phase Gate 与故事板生产包标准。
- 对象存储链路保留，不作为废弃路径处理。

## Directory Structure

## Directory Structure Summary

本实施方案建议新增 `tools/smart-vision/` 作为智能视界工程入口，同时有限修改当前画布文件，并新增若干 JSON Schema、工作流模板和测试文件。项目产物仍写入 `projects/`，不迁移当前漫剧创作库主目录结构。

```text
漫剧创作库/
├── tools/
│   ├── smart-vision/
│   │   ├── backend/
│   │   │   ├── main.py                         # [NEW] FastAPI 入口。挂载项目、任务、审核、工作流、模型配置等 API。
│   │   │   ├── config.py                       # [NEW] 智能视界配置。管理项目根路径、数据库路径、模型配置、文件写回策略。
│   │   │   ├── database.py                     # [NEW] SQLite 初始化与连接管理。定义迁移入口与会话生命周期。
│   │   │   ├── models.py                       # [NEW] 数据模型。定义 Project、Episode、Board、Task、Review、WorkflowFile、Artifact、RunRecord。
│   │   │   ├── schemas.py                      # [NEW] API 请求与响应结构。保证前后端和大模型输出结构一致。
│   │   │   ├── project_scanner.py              # [NEW] 扫描 projects 目录，识别项目、集数、资产索引、故事板生产包和历史产物。
│   │   │   ├── methodology_loader.py           # [NEW] 方法论包加载器。按任务类型读取 docs、skills、agents、templates、wordlists。
│   │   │   ├── task_orchestrator.py            # [NEW] 任务编排器。生成故事板级、单集级、全剧级任务树。
│   │   │   ├── llm_provider.py                 # [NEW] OpenAI-compatible 模型适配层。支持 GPT-5.5 和用户自配模型。
│   │   │   ├── workflow_builder.py             # [NEW] 生成 `mjb-workflow-v1` JSON。第一版只使用现有画布节点。
│   │   │   ├── review_gate.py                  # [NEW] 审核门禁服务。处理通过、打回、局部返工和 Phase Gate 映射。
│   │   │   ├── artifact_registry.py            # [NEW] 产物入库服务。写回项目文件、索引、QA 记录和历史记录。
│   │   │   ├── canvas_bridge.py                # [NEW] 画布桥接服务。管理 workflow JSON 文件路径、打开入口和导入校验。
│   │   │   └── routers/
│   │   │       ├── projects.py                 # [NEW] 项目列表、项目详情、项目扫描 API。
│   │   │       ├── episodes.py                 # [NEW] 集数列表、集状态、单集任务树 API。
│   │   │       ├── boards.py                   # [NEW] 故事板详情、故事板生产包状态 API。
│   │   │       ├── tasks.py                    # [NEW] 任务创建、状态推进、重试、暂停、继续 API。
│   │   │       ├── reviews.py                  # [NEW] 审核中心 API。
│   │   │       ├── workflows.py                # [NEW] 工作流 JSON 生成、读取、校验、画布打开 API。
│   │   │       ├── artifacts.py                # [NEW] 产物列表、入库、版本和追溯 API。
│   │   │       └── model_providers.py          # [NEW] 模型配置与连通性测试 API。
│   │   ├── frontend/
│   │   │   ├── package.json                    # [NEW] 前端依赖与脚本。
│   │   │   ├── src/
│   │   │   │   ├── app/
│   │   │   │   │   ├── layout.tsx              # [NEW] 智能视界后台布局。
│   │   │   │   │   ├── page.tsx                # [NEW] 项目总览入口。
│   │   │   │   │   ├── projects/[id]/page.tsx  # [NEW] 项目详情与生产进度。
│   │   │   │   │   ├── episodes/[id]/page.tsx  # [NEW] 单集任务看板。
│   │   │   │   │   ├── boards/[id]/page.tsx    # [NEW] 故事板生产链路详情。
│   │   │   │   │   ├── reviews/page.tsx        # [NEW] 审核中心。
│   │   │   │   │   ├── workflows/[id]/page.tsx # [NEW] 工作流 JSON 预览与画布入口。
│   │   │   │   │   └── settings/models/page.tsx # [NEW] 大模型配置页。
│   │   │   │   ├── components/
│   │   │   │   │   ├── ProjectSidebar.tsx      # [NEW] 项目 / 集数 / 故事板导航。
│   │   │   │   │   ├── TaskBoard.tsx           # [NEW] Phase 映射任务看板。
│   │   │   │   │   ├── BoardPipeline.tsx       # [NEW] 故事板图到视频链路可视化。
│   │   │   │   │   ├── ReviewPanel.tsx         # [NEW] 审核操作面板。
│   │   │   │   │   ├── WorkflowJsonViewer.tsx  # [NEW] 工作流 JSON 预览、校验和下载。
│   │   │   │   │   ├── ArtifactPreview.tsx     # [NEW] 图片、视频、故事板图、参考图预览。
│   │   │   │   │   └── ModelProviderForm.tsx   # [NEW] 用户模型配置表单。
│   │   │   │   ├── lib/
│   │   │   │   │   ├── api.ts                  # [NEW] API 客户端。
│   │   │   │   │   ├── types.ts                # [NEW] 前端共享类型。
│   │   │   │   │   └── status.ts               # [NEW] 任务与审核状态常量。
│   │   │   │   └── stores/
│   │   │   │       └── smartVisionStore.ts     # [NEW] 当前项目、集、故事板、看板筛选状态。
│   │   ├── schemas/
│   │   │   ├── task.schema.json                # [NEW] 大模型任务树输出 Schema。
│   │   │   ├── methodology-pack.schema.json    # [NEW] 方法论包 Schema。
│   │   │   ├── workflow-request.schema.json    # [NEW] 工作流生成请求 Schema。
│   │   │   ├── review.schema.json              # [NEW] 审核记录 Schema。
│   │   │   ├── storyboard-package.schema.json  # [NEW] 故事板生产包索引 Schema。
│   │   │   └── video-adaptation.schema.json    # [NEW] D12/D15 视频适配包 Schema。
│   │   ├── templates/
│   │   │   └── workflows/
│   │   │       ├── asset-image.workflow.json   # [NEW] 资产图画布模板。
│   │   │       ├── storyboard-image.workflow.json # [NEW] 故事板图画布模板。
│   │   │       ├── d12-sora2-video.workflow.json # [NEW] D12 视频工作流模板。
│   │   │       ├── d15-seedance2-stable.workflow.json # [NEW] D15 Stable 工作流模板。
│   │   │       ├── d15-seedance2-extended.workflow.json # [NEW] D15 Extended 工作流模板。
│   │   │       └── episode-edit.workflow.json  # [NEW] 单集拼接工作流模板。
│   │   └── tests/
│   │       ├── test_project_scanner.py         # [NEW] 项目扫描测试。
│   │       ├── test_methodology_loader.py      # [NEW] 方法论包测试。
│   │       ├── test_workflow_builder.py        # [NEW] `mjb-workflow-v1` 生成与节点类型校验测试。
│   │       ├── test_review_gate.py             # [NEW] 审核状态流转测试。
│   │       └── e2e/
│   │           └── storyboard_to_video.spec.ts # [NEW] 故事板图到视频闭环端到端测试。
│   └── workbench-web/
│       └── image-studio-canvas.html           # [MODIFY-LATER] 第二阶段新增 `sv*` 节点；MVP 阶段尽量不改核心逻辑。
├── docs/
│   ├── smart-vision-architecture.md           # [EXISTING] 总体架构依据。
│   ├── smart-vision-canvas-node-plan.md       # [EXISTING] 画布节点扩展依据。
│   ├── smart-vision-implementation-roadmap.md # [EXISTING] 开发路线依据。
│   ├── smart-vision-dev-landing-plan.md       # [NEW] 本次落地详细方案文档，确认后写入。
│   └── pipeline-sync-log.md                   # [MODIFY] 登记智能视界开发落地方案。
└── studio                                      # [MODIFY-LATER] 可新增 `./studio smart-vision` 启动入口。
```

## API Route Design

### Project API

- `GET /api/projects`
- 扫描并返回可管理项目
- `GET /api/projects/{project_id}`
- 返回项目详情、当前 Phase、生产模式、进度摘要
- `POST /api/projects/{project_id}/scan`
- 重新扫描项目文件并刷新数据库索引

### Episode API

- `GET /api/projects/{project_id}/episodes`
- `GET /api/episodes/{episode_id}`
- `POST /api/episodes/{episode_id}/build-task-tree`
- 生成单集任务树

### Board API

- `GET /api/boards/{board_id}`
- `POST /api/boards/{board_id}/build-storyboard-pipeline`
- 生成故事板级半自动链路
- `POST /api/boards/{board_id}/build-video-adaptation`
- 生成 D12 / D15 视频模型适配包

### Workflow API

- `POST /api/workflows/build`
- 根据任务生成 `mjb-workflow-v1`
- `GET /api/workflows/{workflow_id}`
- `POST /api/workflows/{workflow_id}/validate`
- 校验节点类型、连线、必填 values、参考图路径
- `POST /api/workflows/{workflow_id}/open-canvas`
- 返回或打开画布入口

### Review API

- `GET /api/reviews`
- `POST /api/reviews/{review_id}/approve`
- `POST /api/reviews/{review_id}/reject`
- `POST /api/reviews/{review_id}/request-revision`

### Artifact API

- `GET /api/artifacts`
- `POST /api/artifacts/register`
- `GET /api/artifacts/{artifact_id}/trace`

### Model Provider API

- `GET /api/model-providers`
- `POST /api/model-providers`
- `POST /api/model-providers/test`
- `POST /api/llm/generate-task-tree`

## Key Code Structures

```python
class SmartVisionTask:
    id: str
    project_id: str
    episode_id: str | None
    board_id: str | None
    mode: str
    phase: str
    task_type: str
    agent_role: str
    required_docs: list[str]
    required_skills: list[str]
    input_artifacts: list[str]
    output_artifacts: list[str]
    workflow_id: str | None
    review_required: bool
    status: str
```

```python
class VideoAdaptationPack:
    id: str
    board_id: str
    target_model: str
    strategy: str
    storyboard_image_path: str
    reference_images: list[dict]
    reference_priority: list[str]
    prompt_text: str
    duration_limit_seconds: int
    rejection_risks: list[str]
```

```python
class WorkflowBuildRequest:
    project_id: str
    episode_id: str
    board_id: str | None
    workflow_type: str
    target_model: str | None
    use_existing_nodes_only: bool
    input_artifacts: list[str]
    output_dir: str
```

## Agent Extensions

### SubAgent

- **code-explorer**
- Purpose: 对 `tools/workbench-web/image-studio-canvas.html`、`tools/`、`docs/`、`skills/`、`agents/` 和项目产物目录做后续深入代码探索。
- Expected outcome: 确认画布节点、工作台服务、项目扫描、文件写回、现有启动脚本和可复用工具链的准确改造点。

### Skill

- **playwright-cli**
- Purpose: 在智能视界前端 MVP 完成后，自动化测试项目看板、故事板链路页、审核中心、工作流 JSON 入口和画布打开流程。
- Expected outcome: 形成可重复执行的端到端测试，验证故事板图到视频的最小闭环页面可用。