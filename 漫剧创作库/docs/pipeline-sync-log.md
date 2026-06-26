## 2026-05-08 智能视界换机交接与项目记忆更新

- **等级**：L2
- **变更**：按用户更换电脑需求，将智能视界当前平台开发进度、工程状态、恢复顺序和下一步任务写入项目文件化记忆系统。
- **摘要**：当前智能视界已完成平台 Runtime 管理层核心开发：Workflow Registry、Artifact Registry、Review Center、Workflow Runtime、Runtime Diagnostics、Runtime Repair、Queue Run、Retry Failed、Replay Chain、Release Registry 代码链路、Release 面板诊断展示、发布包状态机、blocked 审核保护、published 前 manifest / artifact 文件存在校验，最近一次 `smart-vision/app` 的 `npm run build` 已通过。当前重点继续补齐发布前强门禁、Release 单项修复、Bridge API 端到端实测和 Runner→Release 自动推进；不要急于生成业务产物。
- **影响 Phase**：智能视界平台 Runtime 开发期 / 换机恢复 / 工程记忆交接。
- **影响模块**：`smart-vision/outputs/.smart-vision/project-state.json`、`smart-vision/outputs/.smart-vision/recovery-checkpoint.json`、`smart-vision/outputs/.smart-vision/handoff-report.md`、`smart-vision/docs/development-status.md`、`smart-vision/docs/README.md`、`docs/workspace-status.md`、`docs/project-memory-system.md`、`.workbuddy/memory/MEMORY.md`、`docs/pipeline-sync-log.md`。
- **恢复入口**：换电脑后优先读取 `docs/project-memory-system.md`、`docs/workspace-status.md`、`smart-vision/docs/development-status.md`、`smart-vision/outputs/.smart-vision/handoff-report.md` 和 `smart-vision/outputs/.smart-vision/recovery-checkpoint.json`。
- **验证结果**：关键记忆文件已落盘；本条记录用于换机交接签收。
- **签收**：Producer ✅

---

## 2026-05-16 智能视界 Canvas v2 主入口视频回写与跨 Run 防串线

- **等级**：L3
- **变更**：把 `npm run smoke:smart-canvas-v2:entry` 从故事板回写扩展到视频产物回写，并补齐 Pipeline Run 跨 run / 跨 stage workflow 误绑定诊断与修复。
- **摘要**：主入口 smoke 现在覆盖 `creative/import → creative/start → asset Workflow preflight → Canvas RUN Session → 资产图回写 → asset review done → storyboard Workflow → 故事板图回写 → storyboard review done → video Workflow → 视频产物回写 → video review done → edit Workflow 解锁`。同步修复 `attachCanvasOutputToPipelineRuns` 过宽匹配旧 run 的问题：带 `pipelineRunId / pipelineStageId` 的 workflow 只能回写到同一 run/stage；`createNextWorkflowFromReview` 也改为优先按 source workflow 的 `pipelineRunId` 精确定位 source run。新增 Runtime Diagnostics 信号 `pipeline_stage_workflow_run_mismatch` / `pipeline_stage_workflow_stage_mismatch`，Pipeline Run Repair 可摘除错误绑定并重建当前阶段 workflow。
- **影响 Phase**：Smart Canvas v2 主入口真实写入 smoke → Pipeline Run 状态一致性 → Runtime 事故诊断与修复。
- **影响模块**：`smart-vision/app/scripts/bridge-server.mjs`、`smart-vision/app/scripts/smart-canvas-v2-entry-smoke.mjs`、`smart-vision/outputs/.smart-vision/pipeline-run-ledger.json`、`smart-vision/docs/development-status.md`、`smart-vision/outputs/.smart-vision/project-state.json`、`smart-vision/outputs/.smart-vision/recovery-checkpoint.json`、`smart-vision/outputs/.smart-vision/handoff-report.md`。
- **验证结果**：已实际修复历史 smoke 遗留的 2 个跨 run 错配，修复后 Diagnostics ready / 0 issues。`node --check app/scripts/bridge-server.mjs`、`npm run build`、`npm run smoke:smart-canvas-v2`、`npm run smoke:smart-canvas-v2:entry`、`npm run smoke:smart-canvas-v2:browser`、`npm run smoke:runtime:strict`、`npm run smoke:anomaly` 全部通过。
- **下一步**：继续把 entry smoke 扩展到剪辑 / QA / Release 阶段回写，另做浏览器真实交互检查节点输出详情入口、编辑返回和 Workflow 打开状态。
- **签收**：Producer ✅

---

## 2026-05-08 智能视界独立 outputs 边界修正

- **等级**：L3
- **变更**：按用户明确要求，将智能视界状态源、Workflow 与真实视频交付物从漫剧项目目录归拢到 `smart-vision/outputs/`。
- **摘要**：已创建 `smart-vision/outputs/` 标准工程目录，迁移 `.smart-vision/` 状态账本、`draft-video_generation-1778182715841`、`draft-edit-1778210764441`、`ep001-storyboard-image-generation` Workflow 与 Seedance 视频产物。`bridge-server.mjs` 与 `sync-project-snapshot.mjs` 已改为：智能视界运行产物默认读写 `smart-vision/outputs/`，漫剧项目 `projects/无限强化_漫剧_001` 仅作为 `upstream/` 上游资料源。
- **影响 Phase**：智能视界 Phase E / Phase F 目录边界与可迁移恢复前置。
- **影响模块**：`smart-vision/outputs/`、`smart-vision/app/scripts/bridge-server.mjs`、`smart-vision/app/scripts/sync-project-snapshot.mjs`、`smart-vision/README.md`、`smart-vision/docs/product/workspace-standard.md`、`smart-vision/docs/architecture/platform-architecture.md`、`smart-vision/docs/planning/implementation-roadmap.md`、`docs/workspace-status.md`。
- **验证结果**：待本次 `npm run build` 后签收；下一步继续导入 `smart-vision/outputs/05-workflows/ep001/draft-edit-1778210764441.mjb-workflow.json`。
- **签收**：Producer ✅

---

## 2026-05-08 智能视界 video_generation 真实视频闭环验证

- **等级**：L3
- **变更**：完成下游 `video_generation` Workflow 的真实 Seedance 执行、视频归档、产物登记、视频审核通过与下游剪辑 Workflow 创建。
- **摘要**：已在无限画布执行 `draft-video_generation-1778182715841` 的 `seedanceVideo` 节点，任务 `task_rD9O9UwXPNOD81FSNC07sIPgkNQpDlfE` 生成完成，视频已归档为 `smart-vision/outputs/06-generated/videos/ep001-shot01-seedance-task_rD9O9UwXPNOD81FSNC07sIPgkNQpDlfE.mp4`。该产物已登记到 Workflow `outputArtifacts`，创建并通过 `video_review`：`artifact-draft-video_generation-1778182715841-06-generated-videos-ep001-shot01-seedance-task_rD9O9UwXPNOD81FSNC07sIPgkNQpDlfE--review`，Runtime 判定链路 `closed: true`，并自动创建下游 `edit` Workflow：`smart-vision/outputs/05-workflows/ep001/draft-edit-1778210764441.mjb-workflow.json`。
- **影响 Phase**：智能视界 Phase E 下游视频生成验证 → Phase F 剪辑 / 单集多故事板队列前置。
- **影响模块**：`smart-vision/outputs/06-generated/videos/`、`smart-vision/outputs/.smart-vision/workflow-registry.json`、`smart-vision/outputs/.smart-vision/review-ledger.json`、`smart-vision/outputs/05-workflows/ep001/draft-edit-1778210764441.mjb-workflow.json`、`docs/smart-vision-architecture.md`、`docs/workspace-status.md`。
- **验证结果**：Seedance 状态接口返回 `status: completed`、`progress: 100`、`downloadStatus: completed`；归档视频大小约 8.9M；`npm run build` 通过；链路状态为 `outputCount: 1`、`reviewStatus: done`、`nextAction: import_downstream_workflow`、`closed: true`。
- **下一步**：导入下游 `edit` Workflow，验证剪辑 / 拼接 / 单集审核闭环，并补测视频审核打回返工路径。
- **签收**：Producer ✅

---

## 2026-05-08 智能视界 video_generation 真实执行节点升级

- **等级**：L3
- **变更**：将下游 `video_generation` Workflow 从通用草案升级为无限画布真实视频执行链路。
- **摘要**：`draft-video_generation-1778182715841` 已升级为 `stylePreset → seedanceVideo → singleVideo → videoEditor`，全部节点均来自无限画布 `NODE_DEFS`，避免导入时被过滤。`seedanceVideo` 节点自动写入《无限强化·灵纹觉醒》`ep001-shots.md` 的 `Shot 1` Seedance 镜头提示词，作为首个可执行闭环测试输入。注册表已同步指向升级后的 Workflow JSON。
- **影响 Phase**：智能视界 Phase E 下游视频生成验证 → Phase F 单集多故事板队列前置。
- **影响模块**：`smart-vision/app/scripts/bridge-server.mjs`、`smart-vision/canvas/legacy-workbench/workbench-web/image-studio-canvas.html`、`smart-vision/outputs/05-workflows/ep001/draft-video_generation-1778182715841.mjb-workflow.json`、`smart-vision/outputs/.smart-vision/workflow-registry.json`、`docs/smart-vision-architecture.md`。
- **验证结果**：`node --check scripts/bridge-server.mjs` 通过；`npm run build` 通过；lint 0 errors。
- **下一步**：已进入真实视频闭环验证记录。
- **签收**：Producer ✅

---

## 2026-05-08 智能视界 video_generation 下游链路基础能力补齐

- **等级**：L3
- **变更**：补齐下游 `video_generation` Workflow 的产物识别、视频预览、输出路径推断和诊断能力。
- **摘要**：现已支持扫描 `.mp4/.mov/.m4v/.webm` 视频产物，`/api/smart-vision/artifacts/read` 可返回视频 MIME 与 raw 流式内容，前端 Artifact Preview 可直接播放视频，Runtime 诊断可提示已登记但真实文件缺失的视频产物，`video_generation` 标准输出路径修正为 `06-generated/videos/**`，上下文包优先携带上游故事板和 Seedance 提示词关键输入。
- **影响 Phase**：智能视界 Phase E 下游视频生成验证 → Phase F 单集多故事板队列前置。
- **影响模块**：`smart-vision/app/scripts/bridge-server.mjs`、`smart-vision/app/src/types.ts`、`smart-vision/app/src/App.tsx`、`smart-vision/app/src/styles.css`、`docs/smart-vision-architecture.md`。
- **验证结果**：`node --check scripts/bridge-server.mjs` 通过；`npm run build` 通过。
- **签收**：Producer ✅

---

## 2026-05-08 智能视界 Phase E 单故事板真实闭环验证

- **等级**：L3
- **变更**：将智能视界从规划 / 控制台可视化推进到真实单故事板链路闭环验证。
- **摘要**：以《无限强化·灵纹觉醒》`ep001-storyboard-image-generation` 为验证对象，跑通 Workflow 登记、产物登记、Artifact Registry 写回、Review Ledger 创建审核、审核通过、下游 `video_generation` Workflow 创建与 UI 链路卡片恢复展示。修正链路 closed 判断，增强产物登记与审核创建幂等性，并在架构文档中登记 Phase E 当前进度与下一批 Workflow 模板路线。
- **影响 Phase**：智能视界 Phase E（故事板级半自动闭环）→ Phase F（单集半自动）前置验证。
- **影响模块**：`smart-vision/app/scripts/bridge-server.mjs`、`smart-vision/app/src/data/api.ts`、`smart-vision/app/src/types.ts`、`smart-vision/app/src/App.tsx`、`smart-vision/app/src/styles.css`、`.smart-vision/workflow-registry.json`、`.smart-vision/artifact-registry.json`、`.smart-vision/review-ledger.json`、`docs/smart-vision-architecture.md`。
- **下游传播**：
  - [x] `docs/smart-vision-architecture.md` — 登记 Phase E 真实闭环状态与下一批 Workflow 模板路线
  - [x] `docs/pipeline-sync-log.md` — 本条记录完成闭环签收
- **验证结果**：上游 `ep001-storyboard-image-generation` 已 closed；下游 `draft-video_generation-1778182715841` 已创建，下一步进入视频生成 Workflow 导入与执行验证。
- **签收**：Producer ✅

---

## 2026-05-07 智能视界独立平台工程与无限画布迁移

- **等级**：L3
- **变更**：根据用户纠正意见，将智能视界从创作库内部文档规划调整为独立平台开发工程，并将无限画布相关完整代码复制迁移到新工程中。
- **摘要**：新增 `smart-vision/` 独立平台工程目录，按 `docs/`、`app/`、`canvas/legacy-workbench/`、`services/workbench/`、`config/`、`runtime/`、`templates/`、`scripts/` 分层承载平台开发。智能视界平台文档已归档到 `smart-vision/docs/`，包括落地计划、平台分层架构、能力包 Runtime、功能规划、技术选型、工程记忆、画布接入、迁移清单和验收清单。无限画布相关 UI、JS、后台服务、配置和词库依赖已复制到新工程，原始 `tools/` 与根 `studio` 保持不移动、不删除、不重构。
- **影响 Phase**：平台工程规划层 → 无限画布执行器 → 能力包 Runtime 预留 → 工程记忆 → 验收恢复。
- **影响模块**：`smart-vision/`、无限画布、工作台服务、智能视界文档、迁移验证、工作区状态、文件化记忆。
- **下游传播**：
  - [x] `smart-vision/README.md` — 新增独立平台工程入口说明
  - [x] `smart-vision/docs/` — 归档平台计划、架构、功能、技术、Runtime、画布接入和迁移验收文档
  - [x] `smart-vision/canvas/legacy-workbench/workbench-web/` — 复制无限画布 UI、HTML、JS、模型配置和静态资源
  - [x] `smart-vision/services/workbench/` — 复制工作台服务、核心逻辑、图像后端、初始化和对象存储可选链路
  - [x] `smart-vision/config/` — 复制模型 registry 与 `wordlists/mj-image/` 配置依赖
  - [x] `smart-vision/scripts/run-legacy-workbench.sh` — 新增迁移版启动脚本
  - [x] `docs/workspace-status.md` — 登记独立平台工程与迁移状态
  - [x] `.workbuddy/memory/MEMORY.md` — 同步长期记忆
  - [x] `docs/pipeline-sync-log.md` — 本条记录完成闭环签收
- **验收要点**：原始 `tools/` 和根 `studio` 未被破坏；迁移版以 `smart-vision/scripts/run-legacy-workbench.sh` 启动；验证重点为服务健康检查、页面加载、`workbench-engine.js` 加载、模型 registry、词库、上传缓存、生图 API 和对象存储可选链路。
- **签收**：Producer ✅

---

## 2026-05-07 智能视界架构整改：AI / 大模型泛化、能力包 Runtime、本地工程记忆与可迁移恢复

- **等级**：L3
- **变更**：根据用户整改要求，将智能视界从旧版“GPT 绑定 + 重后端优先”修正为“AI / 大模型泛化 + 本地优先 + 能力包 Runtime + 工程目录记忆 + 可迁移恢复”的产品化 Runtime 方案。
- **摘要**：泛称统一为 AI / 大模型，GPT-5.5 仅作为可选模型之一；第一版不把服务端 API、数据库、队列作为前置依赖，而以能力包 Runtime、Workflow JSON Builder、本地桥接层、`.smart-vision/` 工程状态目录为核心。新增平台交付工程目录规范，区分客户端记忆与工程记忆，要求项目 Phase、集数进度、故事板状态、workflow 状态、产物版本、审核结论、连续性账本、能力包 hash 与恢复检查点全部写入工程目录，支持客户端退出、会话结束、更换客户端和跨电脑迁移恢复。
- **影响 Phase**：产品化规划层 → 工程记忆层 → Workflow JSON Builder → 人工审核 → 迁移恢复。
- **影响模块**：智能视界架构、无限画布接入、能力包 Runtime、工程目录标准、项目文件化记忆、工作区状态、共享模板、Pipeline Sync。
- **下游传播**：
  - [x] `docs/smart-vision-architecture.md` — 修正 AI / 大模型泛化、本地 Runtime、工程记忆、可迁移恢复和技术选型
  - [x] `docs/smart-vision-implementation-roadmap.md` — 第一版改为工程状态文件、本地桥接、能力包 Runtime 和 Recipe 优先
  - [x] `docs/smart-vision-canvas-node-plan.md` — 后端模块改为 Runtime 模块，MVP 优先复用现有节点
  - [x] `docs/smart-vision-project-workspace-standard.md` — 新增工程目录、客户端记忆、工程记忆、连续性账本和迁移恢复规范
  - [x] `docs/smart-vision-capability-pack-runtime.md` — 新增动态编排、编译执行、Hybrid 模式和 hash 失效策略
  - [x] `templates/_shared/smart-vision/` — 新增工程状态、产物索引、连续性账本、恢复检查点模板
  - [x] `docs/project-memory-system.md` — 接入智能视界 Runtime 读取与恢复协议
  - [x] `docs/workspace-status.md` — 登记智能视界本地优先 Runtime 状态
  - [x] `.workbuddy/memory/MEMORY.md` — 同步本地助手长期记忆
  - [x] `docs/pipeline-sync-log.md` — 本条记录完成闭环签收
- **干跑场景**：工程目录迁移到另一台电脑后，智能视界读取 `.smart-vision/project-state.json` 与 `capability-lock.json`，校验能力包 source hash / compiled runtime hash，恢复当前 Phase、活动集数、活动故事板和下一步任务；若产物索引缺失但真实文件存在，则扫描工程目录重建索引并标记 `needs_review`，不直接判定工程损坏。
- **验收**：已搜索智能视界相关文档，旧重后端前置依赖、GPT 编排大脑、默认 GPT、数据库优先、队列优先等绑定表述已清理；`gpt-image-2` 作为具体图像模型方法论文档名和资产模型名保留，不属于平台大脑泛称。
- **签收**：Producer ✅

---

> 注：2026-05-08 换机交接更新时，因当前工作区未启用 Git，只能保留近期关键 Pipeline Sync 记录；更早完整历史以 `docs/project-memory-system.md`、`docs/workspace-status.md`、`.workbuddy/memory/MEMORY.md` 与各专项文档中的已落盘记录为准。

---

## 2026-05-09 智能视界真实执行器收敛为无限画布 Workflow Adapter

- **等级**：L3
- **变更**：根据用户纠偏，明确真实执行器不再扩展为平台侧模型服务，而是直接接入无限画布工作流。
- **摘要**：`smart-vision` 任务编排器已新增 `compile-canvas-workflow` 子任务；Workflow Draft 已写入 `canvasExecution`，包含 `executor=infinite_canvas`、`workflowMode`、`editUrl`、`runUrl`、提示词来源、参考图来源和输出路径提示。`video_generation` 自动生成 `stylePreset → seedanceVideo → singleVideo → videoEditor` 并填充 Seedance 长版提示词与 EP 参考图；`storyboard_image_generation` 自动生成 `stylePreset → img2imgAll/txt2img → singleImage` 并填充故事板 Brief 与参考图。无限画布导入页已支持 `bridgeBase`；`runUrl` 打开后只导入并渲染工作流，是否点击 RUN 由用户在画布内手动决定。
- **影响 Phase**：平台 Runtime 管理层 → 无限画布真实执行适配 → 任务编排闭环。
- **影响模块**：`smart-vision/app/scripts/bridge-server.mjs`、`smart-vision/canvas/legacy-workbench/workbench-web/image-studio-canvas.html`、`smart-vision/app/src/App.tsx`、`smart-vision/app/src/types.ts`、`smart-vision/app/src/styles.css`、`smart-vision/docs/development-status.md`、`smart-vision/outputs/.smart-vision/handoff-report.md`、`smart-vision/outputs/.smart-vision/project-state.json`、`smart-vision/outputs/.smart-vision/recovery-checkpoint.json`。
- **验证结果**：`npm run build` 通过；`npm run smoke:runtime:strict` 通过并新增 `canvas_workflow_adapter` passed（seedance_video_generation / prompts 10 / refs 8）；`npm run smoke:anomaly` 通过；API 验证 `video_generation` 与 `storyboard_image_generation` 均生成可编辑 / 可执行画布工作流。
- **下一步**：补无限画布执行后的输出回写适配，自动写回 Workflow Registry / Artifact Registry / Review Ledger。
- **签收**：Producer ✅

---

## 2026-05-09 智能视界无限画布输出自动回写闭环

- **等级**：L3
- **变更**：补齐无限画布执行后的输出回写适配，把画布生成结果自动写回智能视界状态源。
- **摘要**：新增 `POST /api/smart-vision/workflows/canvas-output`。无限画布图片 / 视频节点在生成完成和后台落盘完成后，会回传 workflowId、workflowPath、nodeId、nodeType、outputArtifactHint、localPath 与 saved 信息；Bridge 可自动补登记 Workflow、复制本地落盘文件到 `smart-vision/outputs`、登记 Workflow output、写入 Artifact Registry、创建 Review Ledger 审核，并记录 `artifactRegistry.canvasOutputs` 与 `workflow-runner-ledger.events`。目标 artifact 已存在且来源不同会自动生成时间戳版本路径，避免覆盖旧产物。
- **影响 Phase**：无限画布真实执行适配 → 画布执行结果回写 → Workflow / Artifact / Review 闭环。
- **影响模块**：`smart-vision/app/scripts/bridge-server.mjs`、`smart-vision/canvas/legacy-workbench/workbench-web/image-studio-canvas.html`、`smart-vision/docs/development-status.md`、`smart-vision/outputs/.smart-vision/handoff-report.md`、`smart-vision/outputs/.smart-vision/project-state.json`、`smart-vision/outputs/.smart-vision/recovery-checkpoint.json`。
- **验证结果**：`node --check app/scripts/bridge-server.mjs` 通过；`npm run build` 通过；`npm run smoke:runtime:strict` 通过并新增 `canvas_output_writeback` passed（03-视频/ep001-shot01.mp4 / workflow auto-register）；`npm run smoke:anomaly` 通过。
- **下一步**：在 Workflow / Runtime 面板展示最近 canvasOutputs 回写记录和失败提示。
- **签收**：Producer ✅

---

## 2026-05-09 智能视界画布导入不自动执行纠偏

- **等级**：L3
- **变更**：根据用户纠偏，移除 Smart Vision 生成 URL 中默认自动 RUN 的语义。
- **摘要**：平台职责收敛为自动生成搭建好的 Workflow JSON，并打开无限画布导入渲染；`runUrl` 不再携带 `mode=run/autoRun=1`，前端文案从“导入并执行”改为“导入画布”。模型生成视频只能由用户在画布里手动点击 RUN 触发，不属于 Workflow JSON 生成阶段。
- **影响模块**：`smart-vision/app/scripts/bridge-server.mjs`、`smart-vision/app/src/App.tsx`、智能视界记忆文件。
- **验证结果**：`node --check app/scripts/bridge-server.mjs` 通过；`npm run build` 通过。
- **签收**：Producer ✅

---

## 2026-05-09 智能视界自动执行器定义收敛为 Workflow 策略调度

- **等级**：L3
- **变更**：根据用户纠偏，明确自动执行器不是模型调用器，而是 Workflow JSON 生成与策略调度器。
- **摘要**：`canvasExecution` 已新增执行策略元数据：`executionCarrier=workflow_json`、`directModelExecution=false`、`modelInvocation=never_direct_from_smart_vision`。Smart Vision 的底层能力是自动搭建无限画布工作流，并按流程填入提示词、参考图、输出路径；执行与否、何时执行，均由工作流策略和画布承载，不由平台直接调用模型。画布导入页即使收到 `autoRun=1` 也只提示用户手动确认 RUN，不再链接级自动执行。
- **影响模块**：`smart-vision/app/scripts/bridge-server.mjs`、`smart-vision/canvas/legacy-workbench/workbench-web/image-studio-canvas.html`、`smart-vision/app/src/App.tsx`、`smart-vision/app/src/types.ts`、智能视界记忆文件。
- **验证结果**：`node --check app/scripts/bridge-server.mjs` 通过；`npm run build` 通过。
- **签收**：Producer ✅

## 2026-05-09 02:25 智能视界工业主链路纠偏

- **等级**：L3
- **变更**：根据用户纠偏，把工业自动流水线主链路从故事板起步改为资产图起步。
- **摘要**：主链路已收敛为 `asset_image_generation → storyboard_image_generation → video_generation → edit → qa → release`。任务编排后先生成资产图 Workflow，资产图审核后生成故事板 Workflow，故事板图审核后生成视频 Workflow。新增 `asset_image_generation` 无限画布 Workflow Adapter，自动填入资产 Brief、资产索引、风格约束和资产图输出目录；新增 `POST /api/smart-vision/workflows/pipeline/plan` 返回工业流水线阶段、任务计划序列和依赖边。
- **执行边界**：Smart Vision 不直接调用模型，只生成 / 调度 Workflow JSON；执行由无限画布工作流承载。
- **影响模块**：`smart-vision/app/scripts/bridge-server.mjs`、`smart-vision/app/src/App.tsx`、`smart-vision/app/src/types.ts`、智能视界状态记忆文件。
- **验证结果**：`npm run build` 通过；`npm run smoke:runtime:strict` 从 `asset_image_generation` 起跑并通过；`npm run smoke:anomaly` 通过；`POST /api/smart-vision/workflows/pipeline/plan` 返回 canonical sequence。
- **签收**：Producer ✅

---

## 2026-05-09 09:36 智能视界 Pipeline Run 阶段门禁闭环

- **等级**：L3
- **变更**：把工业流水线计划从静态 plan 推进为可落盘、可推进、可回写、可审核解锁的 Pipeline Run 实例。
- **摘要**：新增 `outputs/.smart-vision/pipeline-run-ledger.json`，记录流水线实例、阶段状态、阶段门禁和事件；新增 `GET /api/smart-vision/pipeline/runs`、`POST /api/smart-vision/pipeline/runs/create`、`POST /api/smart-vision/pipeline/runs/advance`、`POST /api/smart-vision/pipeline/runs/smoke`。创建 Pipeline Run 会自动生成首阶段资产图 Workflow；画布输出回写会把 artifact 和 review 绑定到对应阶段；阶段 review done 后自动标记完成并解锁 / 创建下一阶段 Workflow。
- **执行边界**：Smart Vision 仍不直接调用模型，只生成和推进无限画布 Workflow JSON；真实执行由无限画布工作流承载，平台负责状态闭环和门禁。
- **影响模块**：`smart-vision/app/scripts/bridge-server.mjs`、`smart-vision/app/src/App.tsx`、`smart-vision/app/src/data/api.ts`、`smart-vision/app/src/types.ts`、`smart-vision/outputs/.smart-vision/pipeline-run-ledger.json`、智能视界状态记忆文件。
- **验证结果**：`node --check app/scripts/bridge-server.mjs` 通过；`node --check app/scripts/runtime-smoke.mjs` 通过；`npm run build` 通过；`npm run smoke:runtime:strict` 通过并新增 `pipeline_run` passed；`npm run smoke:anomaly` 通过。真实 API 已创建 `pipeline-run-ep001-1778290049528`，生成 `02-工作流/ep001/draft-asset_image_generation-1778290049554.mjb-workflow.json`，推进后正确停在 `asset_images / waiting_output`，阻塞原因为 `stage_artifact_missing` 与 `stage_review_missing`。
- **下一步**：继续补 Pipeline Run 异常注入：pipeline-run-ledger 损坏、阶段产物缺失、阶段 review 冲突、下游 workflow 丢失。
- **签收**：Producer ✅

---

## 2026-05-09 09:53 智能视界 Pipeline Run 异常注入与诊断补强

- **等级**：L3
- **变更**：把 Pipeline Run 纳入 Runtime Diagnostics 与异常注入 smoke，验证流水线状态源在真实事故下可诊断、可阻塞、不误报正常等待状态。
- **摘要**：新增 Pipeline Run 结构诊断，覆盖 `pipeline-run-ledger.json` runs/events 结构、run/status、stage/status、previous/next stage 链路、workflow 关联、review 关联、done 阶段产物和 done review 一致性。异常注入 smoke 新增 `pipeline_run_ledger_corruption`、`pipeline_stage_artifact_missing`、`pipeline_stage_review_conflict`、`pipeline_downstream_workflow_missing` 四类场景。
- **执行边界**：正常 `waiting_output` 只表示等待画布产出，不作为 Runtime Diagnostics 故障；只有结构损坏、done 状态不一致、workflow/review 丢失等事故会进入诊断。
- **影响模块**：`smart-vision/app/scripts/bridge-server.mjs`、`smart-vision/docs/development-status.md`、`smart-vision/outputs/.smart-vision/handoff-report.md`、`smart-vision/outputs/.smart-vision/project-state.json`、`smart-vision/outputs/.smart-vision/recovery-checkpoint.json`。
- **验证结果**：`node --check app/scripts/bridge-server.mjs` 通过；`node --check app/scripts/runtime-smoke.mjs` 通过；`npm run build` 通过；`npm run smoke:runtime:strict` 通过且 Diagnostics ready / 0 issues；`npm run smoke:anomaly` 通过并新增四个 Pipeline Run 场景全部 passed。
- **下一步**：在 Workflow / Runtime 面板展示最近 canvasOutputs 回写记录和失败提示，继续整理 Runtime 面板摘要密度。
- **签收**：Producer ✅

---

## 2026-05-09 10:06 智能视界 Runtime 面板画布回写记录展示

- **等级**：L2
- **变更**：把 Artifact Registry 的 `canvasOutputs` 暴露到 Project Snapshot，并在 Runtime 面板展示最近画布回写记录。
- **摘要**：Project Snapshot 新增 `canvasOutputs` 字段；前端类型新增 `CanvasOutputRecord`；Runtime 面板新增画布回写总数、异常数与最近 6 条回写记录，点击 artifactPath 复用现有 Artifact Preview；`exists=false` 或缺 artifactPath 会进入回写异常提示。
- **影响模块**：`smart-vision/app/scripts/bridge-server.mjs`、`smart-vision/app/src/types.ts`、`smart-vision/app/src/data/api.ts`、`smart-vision/app/src/App.tsx`、智能视界状态记忆文件。
- **验证结果**：`npm run build` 通过；`npm run smoke:runtime:strict` 通过；`npm run smoke:anomaly` 通过。
- **下一步**：继续整理 Runtime 面板结果摘要密度，并扩展异常注入 smoke 到 release registry JSON 结构损坏、artifact registry review 冲突、task-run 报告缺失等场景。
- **签收**：Producer ✅

---

## 2026-05-09 10:22 智能视界异常注入扩展到 Release / Artifact / task-run 状态源

- **等级**：L3
- **变更**：继续补强 Runtime Diagnostics 与异常注入 smoke，覆盖更接近真实事故的状态源结构损坏。
- **摘要**：Runtime Diagnostics 新增 Release Registry 结构诊断，检查 releases / publishHistory / archiveHistory / restoreHistory、重复 release、非法状态、artifactPaths 与 history 类型；新增 Artifact Registry review 诊断，检查 pendingReviews / completedReviews / reviewHistory、pending/completed 冲突、重复 reviewId、completed review 状态异常；新增 task-run 报告诊断，检查 done / failed taskQueue 与 taskQueueRuns 的 reportPath 缺失、文件缺失和非法路径。异常注入 smoke 新增 `release_registry_json_structure_corruption`、`artifact_registry_review_conflict`、`task_run_report_missing`。
- **影响模块**：`smart-vision/app/scripts/bridge-server.mjs`、`smart-vision/docs/development-status.md`、`smart-vision/outputs/.smart-vision/handoff-report.md`、`smart-vision/outputs/.smart-vision/project-state.json`、`smart-vision/outputs/.smart-vision/recovery-checkpoint.json`。
- **验证结果**：`node --check app/scripts/bridge-server.mjs` 通过；`node --check app/scripts/runtime-smoke.mjs` 通过；`npm run build` 通过；`npm run smoke:runtime:strict` 通过且 Diagnostics ready / 0 issues；`npm run smoke:anomaly` 通过并新增三个状态源事故场景全部 passed。
- **下一步**：继续整理 Runtime 面板结果摘要密度，后续扩展异常注入到 workflow registry JSON 结构损坏、review-ledger history 异常、state-operation-journal 卡死等场景。
- **签收**：Producer ✅

---

## 2026-05-09 10:25 智能视界 Runtime 面板结果摘要密度收敛

- **等级**：L2
- **变更**：Runtime 面板新增紧凑最近操作摘要条，降低运行结果扫描成本。
- **摘要**：摘要条汇总端到端自测、Pipeline Run、任务队列、压力自测、发布队列、发布自测、修复和归档结果；下方详细卡片保留，用于查看完整 runId、步骤和结果。
- **影响模块**：`smart-vision/app/src/App.tsx`、`smart-vision/app/src/styles.css`、智能视界状态记忆文件。
- **验证结果**：`npm run build` 通过；`npm run smoke:runtime:strict` 通过且 Diagnostics ready / 0 issues。
- **下一步**：继续扩展异常注入到 workflow registry JSON 结构损坏、review-ledger history 异常、state-operation-journal 卡死等场景，并补 Pipeline Run 阶段级修复动作。
- **签收**：Producer ✅

---

## 2026-05-09 10:56 智能视界 Pipeline Run 阶段级修复入口

- **等级**：L3
- **变更**：补齐单个 Pipeline Run 的诊断修复入口，把流水线从“能诊断”推进到“可预览修复、可写入修复”。
- **摘要**：新增 `POST /api/smart-vision/pipeline/runs/repair`，支持 `{ dryRun, runId, stageId, rebuildMissingWorkflow }`；修复能力覆盖重复 run 清理、阶段 index / previous / next / current 指针规整、缺失阶段 workflow 重建、review/artifact 重挂、阶段门禁重算、done 状态不一致降级和下游解锁。Runtime 面板新增 Pipeline Run “修复预览 / 修复流水线”入口，并在最近操作摘要和详情区展示修复结果。
- **执行边界**：正常 `waiting_output` 仍只是等待无限画布产出，不视作故障；真实写入走 `state-operation-journal` 记录。
- **影响模块**：`smart-vision/app/scripts/bridge-server.mjs`、`smart-vision/app/src/App.tsx`、`smart-vision/app/src/data/api.ts`、`smart-vision/app/src/types.ts`、智能视界状态记忆文件。
- **验证结果**：`node --check app/scripts/bridge-server.mjs` 通过；`node --check app/scripts/runtime-smoke.mjs` 通过；`npm run build` 通过；真实流水线 repair 写入 5 项，补齐下游 blocked 阶段的 `previous_stage_not_done` stageId 细节；随后 repair dry-run 返回 `repairCount: 0`；`npm run smoke:runtime:strict` 通过且 Diagnostics ready / 0 issues；`npm run smoke:anomaly` 通过。
- **下一步**：把 Pipeline Run 修复写入模式加入专门异常 fixture，并继续扩展 workflow registry、review-ledger、state-operation-journal 事故注入。
- **签收**：Producer ✅

---

## 2026-05-09 11:25 智能视界 Workflow JSON Preflight 契约校验

- **等级**：L3
- **变更**：补齐无限画布 Workflow JSON 导入前的结构化 preflight，避免不完整或越权工作流进入生产链。
- **摘要**：新增 `POST /api/smart-vision/workflow-draft/preflight`，支持对 taskType 草案、workflowDraft、workflowId 或 workflowPath 做 dry-run 校验；校验分为 Schema / Path、Canvas 节点连线、Canvas Execution、Prompt / Reference、Output Writeback Hint 五组。原 `importCheck` 已内嵌 preflight 结果，编译和保存 Workflow 时会返回同一套结构化契约状态。
- **执行边界**：继续强制 `executionCarrier=workflow_json`、`directModelExecution=false`、`modelInvocation=never_direct_from_smart_vision`；Smart Vision 只生成和调度工作流，不直接执行模型。
- **影响模块**：`smart-vision/app/scripts/bridge-server.mjs`、`smart-vision/app/src/types.ts`、`smart-vision/app/src/data/api.ts`、智能视界状态记忆文件。
- **验证结果**：`POST /api/smart-vision/workflow-draft/preflight` 对 `asset_image_generation` 草案返回 `passed / errors 0 / warnings 0`；异常 workflowDraft 返回 `failed` 并识别 path invalid、schema invalid、direct model execution、connection target missing、prompt missing；`npm run build`、`npm run smoke:runtime:strict`、`npm run smoke:anomaly` 全部通过，strict smoke 新增 `workflow_preflight` passed，anomaly smoke 新增 `workflow_preflight_contract_violation` passed。
- **下一步**：继续补 Canvas 输出回写幂等与失败恢复，再扩展 workflow registry / review-ledger / state-operation-journal 事故注入。
- **签收**：Producer ✅

---

## 2026-05-09 12:01 智能视界 Canvas 输出幂等与失败恢复

- **等级**：L3
- **变更**：补齐无限画布输出回写的幂等、失败诊断和失败重试入口，避免画布回调重复、源文件缺失或中断后进入不可恢复状态。
- **摘要**：`POST /api/smart-vision/workflows/canvas-output` 新增 `idempotencyKey` 去重；本地源文件缺失时登记 failed canvasOutput、写入 `canvas_output_failed` 事件，并由 Runtime Diagnostics 报告 `canvas_output_failed / canvas_output_file_missing`。新增 `POST /api/smart-vision/workflows/canvas-output/retry`，支持按 `idempotencyKey` / `artifactPath` 定位 failed 记录，dry-run 预览后用补齐的本地文件重新物化 artifact；已恢复记录再次 retry 返回 `idempotent`。
- **执行边界**：Smart Vision 仍不直接执行模型；retry 只恢复无限画布已经产出的本地文件回写、登记、审核与 Pipeline Run 联动。
- **影响模块**：`smart-vision/app/scripts/bridge-server.mjs`、`smart-vision/app/src/data/api.ts`、`smart-vision/app/src/types.ts`、`smart-vision/docs/development-status.md`、`smart-vision/outputs/.smart-vision/project-state.json`、`smart-vision/outputs/.smart-vision/recovery-checkpoint.json`、`smart-vision/outputs/.smart-vision/handoff-report.md`。
- **验证结果**：`npm run build` 通过；真实 API 回放先制造 `canvas-output-retry-smoke` failed，Diagnostics 降级到 2 个 Canvas 问题；补齐源文件后 retry 返回 `registered` 并创建 review；重复 retry 返回 `idempotent`；随后 Diagnostics ready / 0 issues；`npm run smoke:runtime:strict` 与 `npm run smoke:anomaly` 均通过。
- **下一步**：继续扩展 workflow registry JSON 结构损坏、review-ledger history 异常、state-operation-journal 卡死等异常注入，并进入真实无限画布联调。
- **签收**：Producer ✅

---

## 2026-05-09 12:22 智能视界状态源结构诊断扩展

- **等级**：L3
- **变更**：继续扩展 Runtime Diagnostics 与异常注入 smoke，覆盖 Workflow Registry、Review Ledger 和 state-operation-journal 这几类核心状态源事故。
- **摘要**：新增 Workflow Registry 结构诊断，检查 workflows / chains 类型、重复 workflow、非法路径、非法状态和 outputArtifacts 类型；新增 Review Ledger 结构诊断，检查 reviews / history、重复 review、非法状态、缺失 workflow 和 orphan history；新增 state-operation-journal 结构诊断，检查 operations 类型、缺失 id、非法状态、卡死 running 和重复 active running。`buildSnapshot()` 已改为对损坏数组字段降级兜底，避免诊断前崩溃。
- **修正**：state-operation-journal 的 duplicate running 判断改为按 operation id 的最新状态判断 active running，避免 running / done 历史记录误报。
- **影响模块**：`smart-vision/app/scripts/bridge-server.mjs`、`smart-vision/docs/development-status.md`、`smart-vision/outputs/.smart-vision/project-state.json`、`smart-vision/outputs/.smart-vision/recovery-checkpoint.json`、`smart-vision/outputs/.smart-vision/handoff-report.md`。
- **验证结果**：`node --check app/scripts/bridge-server.mjs` 通过；`npm run smoke:anomaly` 通过，新增 `workflow_registry_json_structure_corruption`、`review_ledger_history_corruption`、`state_operation_journal_interrupted` 全部 passed，真实 Diagnostics ready / 0 issues；`npm run smoke:runtime:strict` 通过；`npm run build` 通过。
- **下一步**：把 Pipeline Run 修复写入模式加入专门异常 fixture，并进入真实无限画布联调。
- **签收**：Producer ✅

---

## 2026-05-09 12:35 智能视界 Pipeline Run 修复写入 Fixture

- **等级**：L3
- **变更**：把 Pipeline Run repair 从“只测诊断/预览”补强到“损坏样本 → dry-run preview → 真实 repair 写入 → cleanup 恢复”的闭环验证。
- **摘要**：新增 `pipeline_run_repair_write_fixture` 异常注入场景。该场景会备份当前 `pipeline-run-ledger`，插入临时损坏 run，并让真实 `repairPipelineRun` 修复 `events` 结构、重复 run、阶段 index / previous / next / current 指针、done 状态与门禁不一致、下游阶段上游未完成门禁；验证完成后恢复原 ledger。
- **执行边界**：fixture 只在 anomaly smoke 内短暂写入，最后恢复原始 `pipeline-run-ledger`；真实项目 Pipeline Run 不被污染。
- **影响模块**：`smart-vision/app/scripts/bridge-server.mjs`、`smart-vision/docs/development-status.md`、`smart-vision/outputs/.smart-vision/project-state.json`、`smart-vision/outputs/.smart-vision/recovery-checkpoint.json`、`smart-vision/outputs/.smart-vision/handoff-report.md`。
- **验证结果**：`node --check app/scripts/bridge-server.mjs` 通过；`npm run smoke:anomaly` 通过并新增 `pipeline_run_repair_write_fixture` passed；`npm run smoke:runtime:strict` 通过且 Diagnostics ready / 0 issues；`npm run build` 通过。
- **下一步**：进入真实无限画布联调：导入资产图 Workflow、完成画布输出回写、审核通过后观察流水线自动生成故事板 Workflow。
- **签收**：Producer ✅

---

## 2026-05-09 12:40 智能视界真实 Pipeline Run 资产图阶段联调

- **等级**：L3
- **变更**：把真实 Pipeline Run 从等待资产图输出推进到故事板阶段，验证“画布输出回写 → artifact review done → Pipeline Run 阶段完成 → 下游 Workflow 自动生成”闭环。
- **摘要**：对 `pipeline-run-ep001-1778290049528` 的资产图 Workflow `draft-asset_image_generation-1778290049554` 回写 `01-资产图与提示词/资产图/ep001/pipeline-asset-output-smoke.png`，自动创建 asset review `artifact-draft-asset_image_generation-1778290049554-01--ep001-pipeline-asset-output-smoke-png-review`。审核置为 done 后，`asset_images` 阶段变为 done，`currentStageId` 变为 `storyboard_images`，并自动生成 / 挂载故事板 Workflow `draft-storyboard_image_generation-1778301596146`。
- **执行边界**：未直接调用任何模型；本次联调用本地测试文件模拟无限画布产出的资产图文件，验证平台状态闭环。
- **影响模块**：`smart-vision/outputs/.smart-vision/pipeline-run-ledger.json`、`workflow-registry.json`、`artifact-registry.json`、`review-ledger.json`、`progress-ledger.json`、`smart-vision/outputs/02-工作流/ep001/draft-storyboard_image_generation-1778301596146.mjb-workflow.json`、`smart-vision/outputs/01-资产图与提示词/资产图/ep001/pipeline-asset-output-smoke.png`。
- **验证结果**：故事板 Workflow preflight 返回 `passed / errors 0`；Diagnostics ready / 0 issues；`npm run smoke:runtime:strict` 通过；`npm run smoke:anomaly` 通过。
- **下一步**：继续真实流水线联调：导入故事板 Workflow、回写故事板图、审核通过后观察自动生成 video_generation Workflow。
- **签收**：Producer ✅

---

## 2026-05-09 12:52 智能视界真实 Pipeline Run 故事板阶段联调

- **等级**：L3
- **变更**：把真实 Pipeline Run 从故事板阶段推进到视频阶段，验证“故事板图回写 → storyboard review done → video_generation Workflow 自动生成”闭环。
- **摘要**：对 `draft-storyboard_image_generation-1778301596146` 回写 `01-资产图与提示词/故事板/storyboard/ep001/pipeline-storyboard-output-smoke.png`，自动创建 storyboard review `artifact-draft-storyboard_image_generation-1778301596146-01--storyboard-ep001-pipeline-storyboard-output-smoke-png-review`。审核置为 done 后，`storyboard_images` 阶段变为 done，`currentStageId` 变为 `videos`，并自动生成 / 挂载视频 Workflow `draft-video_generation-1778302161828`。
- **修正**：新增 workflow 状态同步 progress-ledger 的逻辑，避免 canvas output 后 workflow 变为 `waiting_review` 而 progress item 仍为 `todo` 的 mismatch；已用 runtime repair 修复当前 1 个不一致。
- **执行边界**：未直接调用任何模型；本次联调用本地测试文件模拟无限画布产出的故事板图文件，验证平台状态闭环。
- **影响模块**：`smart-vision/app/scripts/bridge-server.mjs`、`pipeline-run-ledger.json`、`workflow-registry.json`、`artifact-registry.json`、`review-ledger.json`、`progress-ledger.json`、`smart-vision/outputs/02-工作流/ep001/draft-video_generation-1778302161828.mjb-workflow.json`、`smart-vision/outputs/01-资产图与提示词/故事板/storyboard/ep001/pipeline-storyboard-output-smoke.png`。
- **验证结果**：视频 Workflow preflight 返回 `passed / errors 0`；Diagnostics ready / 0 issues；`npm run smoke:runtime:strict` 通过；`npm run smoke:anomaly` 通过；`npm run build` 通过。
- **下一步**：继续真实流水线联调：导入 video_generation Workflow、回写视频产物、审核通过后观察自动生成 edit Workflow。
- **签收**：Producer ✅

---

## 2026-05-09 13:02 智能视界真实 Pipeline Run 视频阶段联调

- **等级**：L3
- **变更**：把真实 Pipeline Run 从视频阶段推进到剪辑阶段，验证“视频产物回写 → video review done → edit Workflow 自动生成”闭环。
- **摘要**：对 `draft-video_generation-1778302161828` 回写 `03-视频/ep001/pipeline-video-output-smoke.mp4`，自动创建 video review `artifact-draft-video_generation-1778302161828-03--ep001-pipeline-video-output-smoke-mp4-review`。审核置为 done 后，`videos` 阶段变为 done，`currentStageId` 变为 `edit`，并自动生成 / 挂载剪辑 Workflow `draft-edit-1778302819995`。
- **执行边界**：未直接调用任何模型；本次联调用本地测试文件模拟无限画布产出的视频文件，验证平台状态闭环。
- **影响模块**：`smart-vision/outputs/.smart-vision/pipeline-run-ledger.json`、`workflow-registry.json`、`artifact-registry.json`、`review-ledger.json`、`progress-ledger.json`、`smart-vision/outputs/02-工作流/ep001/draft-edit-1778302819995.mjb-workflow.json`、`smart-vision/outputs/03-视频/ep001/pipeline-video-output-smoke.mp4`。
- **验证结果**：剪辑 Workflow preflight 返回 `passed / errors 0`；Diagnostics ready / 0 issues；`npm run smoke:runtime:strict` 通过；`npm run smoke:anomaly` 通过；`npm run build` 通过。
- **下一步**：继续真实流水线联调：导入 edit Workflow、回写剪辑产物、审核通过后观察自动生成 qa Workflow。
- **签收**：Producer ✅

---

## 2026-05-09 13:33 智能视界真实 Pipeline Run 全链路闭环发布

- **等级**：L3
- **变更**：把真实 Pipeline Run 从 `edit` 一次性推进到 `qa → release → published`，完成平台功能主链路闭环。
- **摘要**：对 `draft-edit-1778302819995` 回写剪辑产物 `05-可选输出/审核剪辑发布/edit/ep001/pipeline-edit-output-smoke.mp4`，审核 done 后自动生成 QA Workflow `draft-qa-1778303373129`；QA 报告 `05-可选输出/审核剪辑发布/review/ep001/pipeline-qa-output-smoke.md` 审核 done 后自动生成 Release Workflow `draft-release-1778304322583` 与自动发布草稿 `release-ep001-auto-draft-qa-1778303373129`；Release manifest `05-可选输出/审核剪辑发布/release/ep001/pipeline-release-manifest-smoke.json` 回写后自动绑定 release package 的 manifestPath、reviewId 和 sourceWorkflowIds；release review done 后 Pipeline Run 进入 `done`，自动发布包完成 `ready_for_review → approved → published`。
- **修正**：补齐 QA / Release 输出的审核类型映射，新增 `qa → release` 下游 workflow 映射；收紧 release draft 去重，避免历史 published release 阻止新 QA 生成自动草稿；Release workflow 输出回写会自动绑定对应 release package；artifact review 全部 done 后 workflow 自动收敛为 `done` 并同步 progress item。
- **执行边界**：未直接调用任何模型；本次仍使用本地测试文件模拟无限画布产出的剪辑、QA 报告和 Release manifest，验证 Smart Vision 平台状态闭环。
- **影响模块**：`smart-vision/app/scripts/bridge-server.mjs`、`smart-vision/outputs/.smart-vision/pipeline-run-ledger.json`、`workflow-registry.json`、`artifact-registry.json`、`review-ledger.json`、`release-registry.json`、`progress-ledger.json`、`smart-vision/outputs/02-工作流/ep001/draft-qa-1778303373129.mjb-workflow.json`、`smart-vision/outputs/02-工作流/ep001/draft-release-1778304322583.mjb-workflow.json`。
- **验证结果**：`node --check app/scripts/bridge-server.mjs` 通过；Release workflow preflight `passed / errors 0`；Runtime Diagnostics `ready / 0 issues`；`npm run build` 通过；`npm run smoke:runtime:strict` 通过；`npm run smoke:anomaly` 通过。
- **下一步**：进入真实无限画布手动导入 / 运行联调，验证真实画布产物通过 `canvas-output` 回写；UI 联调前补 Canvas failed 输出 retry 入口和状态筛选。
- **签收**：Producer ✅

---

## 2026-05-09 13:56 智能视界 Canvas failed retry 前端入口

- **等级**：L2
- **变更**：把 Canvas failed 输出恢复能力从后端 API 接入 Runtime 面板最近画布回写记录。
- **摘要**：Runtime 面板最近画布回写异常项现在可直接执行“重试预览”和“重试回写”；预览走 `dryRun`，真实写入前有确认保护；Canvas retry 结果进入最近操作摘要和运行结果详情卡，避免与 Runner 失败重试结果混淆。
- **执行边界**：retry 只恢复无限画布已经产出的本地文件回写，不直接调用模型。
- **影响模块**：`smart-vision/app/src/App.tsx`、`smart-vision/app/src/styles.css`、`smart-vision/app/src/data/project-snapshot.json`、智能视界状态记忆文件。
- **验证结果**：`npm run build` 通过；真实 API 回放制造 `ui-canvas-output-retry-smoke` failed 记录，Diagnostics 降级到 `canvas_output_failed / canvas_output_file_missing`；retry dry-run 返回 `preview / retryable`；补齐本地文件后 retry 返回 `registered / retried=true` 并创建 review；review done 后 Diagnostics ready / 0 issues；`npm run smoke:runtime:strict` 通过；`npm run smoke:anomaly` 通过。
- **下一步**：进入真实无限画布手动导入 / 运行联调，验证真实画布产物通过 `canvas-output` 回写，并检查 Runtime 面板 retry 入口在真实 failed 场景下的交互。
- **签收**：Producer ✅

---

## 2026-05-09 14:35 智能视界真实画布导入入口硬化

- **等级**：L2
- **变更**：收敛真实无限画布导入入口，避免工作流 JSON 内嵌旧 `bridgeBase` 导致导入后回写到过期 Bridge。
- **摘要**：`scripts/run-legacy-workbench.sh` 默认端口统一为 `8877`；Bridge Snapshot 与 bundled snapshot 会按当前 Bridge 端口动态重算 workflow `importUrl/editUrl/runUrl` 和 `importCheck`；前端 Canvas 状态展示当前 Bridge base，Workflow 面板导入动作优先使用动态 `importUrl`；`image-studio-canvas.html` 导入工作流时改为 URL 参数 `bridgeBase` 优先于 Workflow JSON 内嵌旧值。
- **执行边界**：仍不直接调用模型；本轮只修正无限画布 Workflow JSON 的导入、编辑、运行入口与回写目标地址。
- **影响模块**：`smart-vision/scripts/run-legacy-workbench.sh`、`smart-vision/app/scripts/bridge-server.mjs`、`smart-vision/app/scripts/sync-project-snapshot.mjs`、`smart-vision/app/src/App.tsx`、`smart-vision/app/src/data/api.ts`、`smart-vision/app/src/types.ts`、`smart-vision/canvas/legacy-workbench/workbench-web/image-studio-canvas.html`、`smart-vision/.runtime/legacy-workbench-root/smart-vision-workspace/tools/workbench-web/image-studio-canvas.html`、智能视界状态记忆文件。
- **验证结果**：`8877` 画布入口返回 200；当前 Bridge `5199` 快照会动态重算 `canvasStatus.bridgeBase`、`workflowRegistry.bridgeBase` 与 release workflow 导入 / 运行 URL；release workflow `importCheck` ok；Bridge artifact read ok；`npm run build`、`npm run smoke:runtime:strict`、`npm run smoke:anomaly` 全部通过。
- **下一步**：用真实浏览器打开当前快照里的阶段 `runUrl`，验证无限画布导入、编辑、RUN 和 `canvas-output` 回写；如果继续使用默认 `5188` Bridge，需要重启旧 Bridge 进程以加载本轮修正。
- **签收**：Producer ✅

---

## 2026-05-09 14:57 智能视界 Canvas Import Smoke 固化

- **等级**：L2
- **变更**：把真实画布导入入口检查固化为可重复命令，避免只靠手动 curl 验证。
- **摘要**：新增 `smart-vision/app/scripts/canvas-import-smoke.mjs`，并在 `app/package.json` 增加 `npm run smoke:canvas-import` 与 `npm run smoke:canvas-import:live`。脚本会启动临时 Bridge，检查 legacy workbench 默认 `8877`、画布导入 `bridgeBase` 优先级、Snapshot 动态 `bridgeBase`、workflow import/edit/run URL、workflow `importCheck`、workflow artifact read；live 模式额外要求 `8877` 真实画布页面返回 200。
- **执行边界**：仍不直接调用模型；只验证画布 Workflow JSON 的导入入口、Bridge 回写地址和工作流文件可读取性。
- **影响模块**：`smart-vision/app/scripts/canvas-import-smoke.mjs`、`smart-vision/app/package.json`、智能视界状态记忆文件。
- **验证结果**：`node --check app/scripts/canvas-import-smoke.mjs` 通过；`npm run smoke:canvas-import` passed；`npm run smoke:canvas-import:live` passed；随后 `npm run build`、`npm run smoke:runtime:strict`、`npm run smoke:anomaly` 全部通过。
- **下一步**：进入真实浏览器画布操作联调：打开阶段 `runUrl`，验证导入、编辑、RUN、产物落盘和 `canvas-output` 回写。
- **签收**：Producer ✅

---

## 2026-05-09 15:27 智能视界浏览器级画布导入探针

- **等级**：L2
- **变更**：把真实画布导入从 HTTP 入口检查推进到浏览器 JS 执行级检查，并修复平台 Workflow 在 legacy 画布中空白的问题。
- **摘要**：画布页面新增 `window.__SMART_VISION_IMPORT_PROBE__`，导入 URL 带 `probe=1` 时会记录 loading / imported / failed、workflowId、workflowPath、bridgeBase、nodeCount、connCount 和 nodeTypes。`canvas-import-smoke.mjs` 新增 `--browser-probe`，`npm run smoke:canvas-import:browser` 会启动 Chrome headless 打开真实 `8877` runUrl，通过 DevTools Protocol 读取探针结果。
- **修复**：legacy 画布新增 `contextPack / artifactInput / workflowBuilder / phaseGate` 节点定义、端口和只读渲染，修复 Release / QA 这类非模型阶段 Workflow 导入后因未知节点类型被过滤成空白画布的问题。
- **执行边界**：仍不自动点击 RUN，不直接调用模型；只验证浏览器能从 Bridge 读取 Workflow JSON 并在画布中加载节点和连线。
- **影响模块**：`smart-vision/canvas/legacy-workbench/workbench-web/image-studio-canvas.html`、`smart-vision/.runtime/legacy-workbench-root/smart-vision-workspace/tools/workbench-web/image-studio-canvas.html`、`smart-vision/app/scripts/canvas-import-smoke.mjs`、`smart-vision/app/package.json`、智能视界状态记忆文件。
- **验证结果**：首次 browser probe 暴露 release workflow 导入后 `nodeCount=0`；补齐平台节点后复测 `npm run smoke:canvas-import:browser` passed，`draft-release-1778304322583` 导入后 `nodes 4 / conns 3`；随后 `npm run build`、`npm run smoke:runtime:strict`、`npm run smoke:anomaly` 全部通过。
- **下一步**：进入真实人工 RUN 与 `canvas-output` 回写联调。
- **签收**：Producer ✅

---

## 2026-05-09 15:49 智能视界生产就绪总控面板

- **等级**：L2
- **变更**：在前端首页新增生产就绪总控面板，把稳定性、可用性和关键操作入口集中到第一屏。
- **摘要**：新增 `ProductionReadinessPanel`，聚合 Bridge 数据源、Pipeline Run 当前阶段、Release 发布门禁 blocker、Canvas 回写异常、Workflow importCheck 和 smoke 结果，并提供端到端自测、流水线 dry-run、发布异常自测、打开画布快捷入口。UI 背景移除装饰性径向效果，收敛为更克制的工作台背景。
- **执行边界**：未直接调用模型；本轮只增加前端聚合视图和操作入口，不改变底层状态机、发布门禁或画布执行策略。
- **影响模块**：`smart-vision/app/src/App.tsx`、`smart-vision/app/src/styles.css`、`smart-vision/app/src/data/project-snapshot.json`、智能视界状态记忆文件。
- **验证结果**：`npm run build` 通过；`npm run smoke:runtime:strict` 通过，Runtime smoke `passed` 且 Diagnostics ready / 0 issues；`npm run smoke:canvas-import:browser` 通过，`draft-release-1778304322583` 导入后 `nodes 4 / conns 3`；`npm run smoke:anomaly` 通过；最终 `npm run build` 再次通过。
- **下一步**：进入真实人工 RUN 与 `canvas-output` 回写联调，并继续把 Runtime / Pipeline / Release 高频操作收敛到生产就绪总控的状态引导里。
- **签收**：Producer ✅

---

## 2026-05-09 16:25 智能视界当前画布执行位收敛

- **等级**：L2
- **变更**：把当前 Pipeline 阶段的真实画布执行入口收敛到生产就绪总控面板。
- **摘要**：总控面板新增“当前画布执行位”，展示当前阶段 Workflow、导入可用性、节点 / 连线数、workflowPath、回写目标和阶段 blocker，并提供“导入执行 / 编辑画布 / 查看 JSON”入口，减少生产时在 Runtime、Workflow、Artifact 面板之间切换查找。
- **执行边界**：不直接调用模型，不自动点击 RUN；真实执行仍由无限画布承载，Smart Vision 只负责 Workflow JSON 生成、入口调度和回写状态。
- **影响模块**：`smart-vision/app/src/App.tsx`、`smart-vision/app/src/styles.css`、`smart-vision/app/src/data/project-snapshot.json`、智能视界状态记忆文件。
- **验证结果**：`npm run build` 通过；`npm run smoke:runtime:strict` 通过；`npm run smoke:canvas-import:browser` 通过，`draft-release-1778304322583` 导入后 `nodes 4 / conns 3`；`npm run smoke:anomaly` 通过；最终 `npm run build` 再次通过。
- **下一步**：进入真实人工 RUN 与 `canvas-output` 回写联调，并继续把异常恢复、发布队列、Pipeline 修复等高影响入口纳入总控状态引导。
- **签收**：Producer ✅

---

## 2026-05-09 16:59 智能视界 canvas-output 首次回写入口

- **等级**：L2
- **变更**：把真实画布 RUN 后的产物回写入口接入生产就绪总控。
- **摘要**：总控面板新增“画布产物回写”表单，支持填写本地文件路径、目标 artifactPath / outputArtifactHint 和可选 idempotencyKey；提供“回写预览”和“确认回写”。确认回写调用 `POST /api/smart-vision/workflows/canvas-output`，物化到 `smart-vision/outputs`、登记 artifact/review，并触发 Pipeline Run 后续推进。
- **执行边界**：仍不直接调用模型，不自动点击 RUN；该入口只接收无限画布已经生成的本地文件并回写平台状态。
- **影响模块**：`smart-vision/app/src/App.tsx`、`smart-vision/app/src/data/api.ts`、`smart-vision/app/src/types.ts`、`smart-vision/app/src/styles.css`、`smart-vision/app/src/data/project-snapshot.json`、智能视界状态记忆文件。
- **验证结果**：`npm run build` 通过；`npm run smoke:runtime:strict` 通过；`canvas-output` dry-run API 返回 `status=preview`、workflow、artifactPath、targetPath、idempotencyKey；`npm run smoke:canvas-import:browser` 通过；`npm run smoke:anomaly` 通过；最终 `npm run build` 再次通过。
- **下一步**：用真实浏览器打开当前阶段 `runUrl`，执行一次真实画布 RUN，并用总控回写表单登记真实产物。
- **签收**：Producer ✅

---

## 2026-05-09 17:12 智能视界 canvas-output register smoke 固化

- **等级**：L2
- **变更**：把 canvas-output 首次回写路径固化为可重复命令。
- **摘要**：新增 `smart-vision/app/scripts/canvas-output-smoke.mjs` 和 `npm run smoke:canvas-output`。脚本会启动临时 Bridge，生成 1x1 PNG 临时文件，执行 dry-run 预览、真实 `POST /api/smart-vision/workflows/canvas-output` 写入、Artifact Preview 读取和 Diagnostics 校验。
- **执行边界**：不触发模型执行；使用本地临时 PNG 模拟无限画布已经生成的产物，验证平台回写路径。
- **影响模块**：`smart-vision/app/scripts/canvas-output-smoke.mjs`、`smart-vision/app/package.json`、`smart-vision/outputs/01-资产图与提示词/画布回写/`、智能视界状态记忆文件。
- **验证结果**：`node --check app/scripts/canvas-output-smoke.mjs` 通过；`npm run smoke:canvas-output` passed，写入 `01-资产图与提示词/画布回写/canvas-output-register-smoke-1778317814848.png`，创建 review `artifact-draft-asset_image_generation-1778298423240-01--canvas-output-register-smoke-1778317814848-png-review`，Artifact Preview 返回 image / 68 bytes，Diagnostics ready / 0 issues；随后 `npm run smoke:runtime:strict`、`npm run smoke:anomaly`、`npm run build` 全部通过。
- **下一步**：用真实浏览器打开当前阶段 `runUrl`，执行一次真实画布 RUN，并用总控回写表单登记真实产物。
- **签收**：Producer ✅

---

## 2026-05-09 18:27 智能视界总控 Pipeline 操作入口

- **等级**：L2
- **变更**：把 Pipeline 高频操作从 Runtime 面板继续收敛到生产就绪总控。
- **摘要**：总控面板新增刷新流水线、创建实例、推进阶段、修复预览四个入口；推进阶段仅在存在未完成 Pipeline Run 时可用，创建实例和真实写入仍沿用原有确认保护。
- **执行边界**：未改变 Pipeline Run 后端状态机和修复逻辑；本轮只收敛 UI 操作入口。
- **影响模块**：`smart-vision/app/src/App.tsx`、`smart-vision/app/src/data/project-snapshot.json`、智能视界状态记忆文件。
- **验证结果**：`npm run build` 通过；`npm run smoke:canvas-output` 通过，Diagnostics ready / 0 issues；`npm run smoke:runtime:strict` 通过；`npm run smoke:anomaly` 通过；最终 `npm run build` 再次通过。
- **下一步**：用真实浏览器打开当前阶段 `runUrl`，执行一次真实画布 RUN，并用总控回写表单登记真实产物。
- **签收**：Producer ✅

---

## 2026-05-09 18:42 智能视界 canvas-output 回写防错增强

- **等级**：L2
- **变更**：增强生产就绪总控的真实画布产物回写入口，降低人工回写填错路径和无法复查的风险。
- **摘要**：总控回写表单新增当前阶段输出目标预设选择、复制回写 JSON 按钮；canvas-output 写入结果新增“打开产物”入口，方便直接检查 Artifact Preview。
- **执行边界**：仍不直接调用模型，不自动执行无限画布 RUN；只增强真实 RUN 后产物登记和回写载荷复用能力。
- **影响模块**：`smart-vision/app/src/App.tsx`、`smart-vision/app/src/styles.css`、`smart-vision/app/src/data/project-snapshot.json`、智能视界状态记忆文件。
- **验证结果**：`npm run build` 通过；`npm run smoke:canvas-output` passed，写入 `01-资产图与提示词/画布回写/canvas-output-register-smoke-1778323203499.png`，Artifact Preview image / 68 bytes，Diagnostics ready / 0 issues；`npm run smoke:runtime:strict` passed，Diagnostics ready / 0 issues。
- **下一步**：用真实浏览器打开当前阶段 `runUrl`，执行一次真实画布 RUN，并用总控回写表单登记真实产物。
- **签收**：Producer ✅

---

## 2026-05-09 19:03 智能视界 Canvas RUN 会话状态源

- **等级**：L2
- **变更**：新增真实无限画布 RUN 会话追踪，避免真实执行位只靠人工口头交接。
- **摘要**：新增 `smart-vision/outputs/.smart-vision/canvas-run-ledger.json`；Bridge 新增 `POST /api/smart-vision/workflows/canvas-run-sessions/start` 与 `/status`；`canvas-output` 回写支持 `runSessionId` 并自动更新会话为 `output_registered`，对应 review done 后会话收敛为 `done`。生产就绪总控新增画布 RUN 会话统计、当前会话展示和“创建 RUN 会话”入口。
- **执行边界**：仍不直接调用模型，不自动点击无限画布 RUN；该能力只记录和追踪真实人工或画布侧执行会话。
- **影响模块**：`smart-vision/app/scripts/bridge-server.mjs`、`smart-vision/app/scripts/canvas-output-smoke.mjs`、`smart-vision/app/src/App.tsx`、`smart-vision/app/src/data/api.ts`、`smart-vision/app/src/types.ts`、`smart-vision/app/src/styles.css`、`smart-vision/outputs/.smart-vision/canvas-run-ledger.json`、智能视界状态记忆文件。
- **验证结果**：`node --check app/scripts/bridge-server.mjs` 通过；`node --check app/scripts/canvas-output-smoke.mjs` 通过；`npm run build` 通过；`npm run smoke:canvas-output` passed，创建 RUN 会话并随 canvas-output register 自动推进到 `output_registered`，Artifact Preview image / 68 bytes，Diagnostics ready / 0 issues；`npm run smoke:runtime:strict` passed，Diagnostics ready / 0 issues；`npm run smoke:anomaly` passed；最终 `npm run build` passed。
- **下一步**：用真实浏览器打开当前阶段 `runUrl`，先创建 RUN 会话，再执行一次真实画布 RUN，并用总控回写表单登记真实产物。
- **签收**：Producer ✅

---

## 2026-05-09 19:15 智能视界 Canvas RUN Ledger 诊断

- **等级**：L2
- **变更**：把新增的 Canvas RUN 会话状态源纳入 Runtime Diagnostics 与异常注入 smoke。
- **摘要**：Runtime Diagnostics 已覆盖 `canvas-run-ledger.json` 的 sessions/events 结构、重复 session、非法状态、workflow 缺失、artifact 文件缺失、review 缺失和 canvasOutput 关联缺失；异常注入 smoke 新增 `canvas_run_ledger_corruption` 场景。
- **影响模块**：`smart-vision/app/scripts/bridge-server.mjs`、`smart-vision/app/src/data/project-snapshot.json`、智能视界状态记忆文件。
- **验证结果**：`node --check app/scripts/bridge-server.mjs` 通过；`npm run build` 通过；`npm run smoke:anomaly` passed，`canvas_run_ledger_corruption` 场景通过；`npm run smoke:runtime:strict` passed，Diagnostics ready / 0 issues。
- **下一步**：用真实浏览器打开当前阶段 `runUrl`，先创建 RUN 会话，再执行一次真实画布 RUN，并用总控回写表单登记真实产物。
- **签收**：Producer ✅

---

## 2026-05-09 20:52 智能视界 canvas-output 回写准备检查

- **等级**：L2
- **变更**：把生产就绪总控的真实画布回写从“可提交表单”升级为“提交前可判断”。
- **摘要**：总控回写区新增本地文件、目标 artifactPath、RUN 会话、幂等键、媒体类型五组准备状态；具体目标会过滤通配符模板，确认回写必须具备本地文件和文件级 artifactPath；新增“使用 RUN 目标”和“生成幂等键”，默认 key 绑定 Pipeline Run / Stage / Workflow / artifact。Bridge dry-run 结果新增 `materialized.sourceExists`，能在预览阶段判断源文件是否存在。
- **执行边界**：仍不直接调用模型，不自动执行无限画布；只增强真实 RUN 产物回写前的安全检查和 dry-run 可观察性。
- **影响模块**：`smart-vision/app/src/App.tsx`、`smart-vision/app/src/types.ts`、`smart-vision/app/src/styles.css`、`smart-vision/app/scripts/bridge-server.mjs`、智能视界状态记忆文件。
- **验证结果**：`npm run build` 通过；`node --check app/scripts/bridge-server.mjs` 通过；`POST /api/smart-vision/workflows/canvas-output` dry-run 用真实 PNG 返回 `sourceExists=true`，用缺失路径返回 `sourceExists=false`；`npm run smoke:canvas-output` passed；`npm run smoke:canvas-import:browser` passed；`POST /api/smart-vision/pipeline/runs/smoke` passed；`npm run smoke:runtime:strict` passed；Runtime Diagnostics ready / 0 issues。
- **下一步**：继续做真实浏览器人工验收：创建 RUN 会话、导入画布、执行工作流、用真实输出路径回写，再检查 Pipeline stage / Review / Release 是否继续闭环推进。
- **签收**：Producer ✅

---

## 2026-05-09 22:00 智能视界主流程 UI 收敛与 canvas-next 迁移

- **等级**：L2
- **变更**：把默认 UI 从工程控制台收敛为剧本驱动的创作入口和链式智能画布。
- **摘要**：主入口现在只保留导入剧本 / 故事原文 / 参考图片、剧本编辑框和“开始创作”；点击创作进入链式智能画布，按 `剧集规划 → 分镜表 → 资产卡 → 资产生成 → 故事板生成 → 视频生成` 展示结果和确认动作。半自动模式显示编辑 / 下一步 / 取消，全自动模式隐藏这些人工按钮。原 Runtime、Diagnostics、Repair、Smoke、Artifact 等工程入口全部折叠进“高级维护 / 调试工具”。
- **画布迁移**：已用根工程 `tools/workbench-web/image-studio-canvas-next.html` 替换 `smart-vision/canvas/legacy-workbench/workbench-web/image-studio-canvas.html`，并复制 `canvas-next/` 资源；当前 8877 runtime copy 已同步。新画布保留 Smart Vision URL 导入、`bridgeBase` 优先、artifact URL 自动重写和 `__SMART_VISION_IMPORT_PROBE__`。
- **影响模块**：`smart-vision/app/src/App.tsx`、`smart-vision/app/src/styles.css`、`smart-vision/canvas/legacy-workbench/workbench-web/image-studio-canvas.html`、`smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/`、智能视界状态记忆文件。
- **验证结果**：`npm run build` passed；新画布 inline scripts syntax ok；`npm run smoke:canvas-import:browser` passed，浏览器导入 `draft-release-1778304322583` 返回 `nodes 4 / conns 3`；Runtime Diagnostics ready / 0 issues。
- **下一步**：把“剧本输入 → 分镜表 → 资产卡”的真实后端生成 API 接到新主流程按钮上，而不是再暴露 Context Pack / Task Plan 调试面板。
- **签收**：Producer ✅

---

## 2026-05-09 22:20 智能视界剧本驱动 creative/start 落地

- **等级**：L2
- **变更**：把主入口“开始创作”从前端跳转 / 创建 Pipeline Run，升级为真实剧本解析、分镜表、资产卡、提示词和 Pipeline Run 创建闭环。
- **摘要**：Bridge 新增 `POST /api/smart-vision/creative/start`；根据用户剧本文本与导入文件生成剧本源、分镜表、资产卡、资产索引、Seedance 视频提示词和 creative-plan，并登记到 Artifact Registry。前端开始创作按钮已调用该接口，链式智能画布前置卡片读取真实生成结果。同步修复 Pipeline stage workflow 生成时 episodeId 丢失的问题，非 `ep001` 的 Workflow 会落入 `02-工作流/{episodeId}/`。
- **执行边界**：仍不直接调用模型；真实媒体执行继续由无限画布 Workflow JSON 承载，Smart Vision 只负责生成任务文件、Workflow JSON、参考路径和状态推进。
- **影响模块**：`smart-vision/app/scripts/bridge-server.mjs`、`smart-vision/app/src/App.tsx`、`smart-vision/app/src/data/api.ts`、`smart-vision/app/src/types.ts`、`smart-vision/docs/development-status.md`、`smart-vision/outputs/.smart-vision/project-state.json`。
- **验证结果**：`node --check app/scripts/bridge-server.mjs` passed；`npm run build` passed；`POST /api/smart-vision/creative/start` actual write 使用 `ep-smoke2` 生成 2 个视频段、10 项资产，Workflow path 为 `02-工作流/ep-smoke2/draft-asset_image_generation-*.mjb-workflow.json`；Artifact Preview 可读取 `04-storyboard/ep-smoke2-storyboard.md`；`npm run smoke:runtime:strict` passed；`npm run smoke:canvas-import:browser` passed。
- **下一步**：把导入图片内容物化到 `outputs/04-输入资料`，并在资产图 Workflow 的 referenceImages 中显式填入这些参考图；随后用用户真实长剧本跑一次主入口到画布回写闭环。
- **签收**：Producer ✅

---

## 2026-05-09 23:43 智能视界智能画布节点交互收敛

- **等级**：L2
- **变更**：把智能画布从红色流程草图继续收敛为 canvas-next 单图节点风格的链式节点画布。
- **摘要**：链式智能画布已使用 canvas-next 同款暗色点阵背景、细边框预览卡、胶囊节点标签、节点工具浮层与流光连接线。半自动模式下运行中只显示取消，完成后显示编辑 / 下一步；点击下一步才出现下一张卡和连接线。全自动模式隐藏人工按钮，节点完成后自动展开下一节点。编辑入口按节点类型进入剧本编辑、分镜表预览编辑、资产卡编辑或 Workflow JSON / 无限画布执行。
- **修复**：主入口开始创作不再复用旧 Pipeline Run，避免顶部 `ep-smoke2` 与当前 `ep001` 产物混用；摘要区“打开画布执行”只绑定当前卡片对应的资产图 / 故事板 / 视频 Workflow，非 Workflow 前置卡片不再误显示。
- **影响模块**：`smart-vision/app/src/App.tsx`、`smart-vision/app/src/styles.css`、智能视界状态记忆文件。
- **验证结果**：`npm run build` passed；浏览器验证 `http://127.0.0.1:5178/?ui=2` 下开始创作后顶部为 `ep001`，第一张卡完成后点击下一步才出现第二张卡与流光连接线，非 Workflow 卡片不显示画布执行入口。
- **下一步**：继续补导入图片物化到 `outputs/04-输入资料`，并把参考图显式填入 creative/start 创建的资产图 Workflow `referenceImages`。
- **签收**：Producer ✅

---

## 2026-05-15 15:55 智能视界 Canvas v2 独立入口

- **等级**：L2
- **变更**：新增独立 v2 智能画布入口，避免影响准备封板上线的原无限画布文件。
- **摘要**：新增 `smart-vision/canvas/legacy-workbench/workbench-web/smart-vision-canvas-v2.html`，复用 canvas-next 暗色点阵、节点卡、胶囊标签、节点工具浮层和流光连接线的视觉习惯；顶部提供 `智能画布 / 无限画布` 双 Tab，`自动流水线 / 自定义编排` 双轨，以及 `手动 / 半自动 / 自动` 三种模式。默认自动流水线按 `创作输入 → 视觉风格 → 音频风格 → 编剧规划 → 导演讲戏 → 分镜表 → 资产卡 → 资产图 Workflow → 故事板 Workflow → 视频 Workflow → QA → 发布包` 展示链式执行；高级自定义编排保留为可选模式，不作为普通用户主流程。
- **边界**：未修改 `/Users/billy/Documents/AI_pro/漫剧创作库/tools/workbench-web/image-studio-canvas-next.html`，也未改 `smart-vision/canvas/legacy-workbench/workbench-web/image-studio-canvas.html` 封板文件。v2 通过独立静态路径访问，后续可单独迭代。
- **验证结果**：v2 内联脚本语法检查通过；`scripts/run-legacy-workbench.sh` 重启后 runtime copy 已同步；`http://127.0.0.1:8877/tools/workbench-web/smart-vision-canvas-v2.html` 返回 `200 text/html`；原 `/image-studio-canvas.html` 返回 `200 text/html`；浏览器首屏已显示 v2 顶栏、双 Tab、模式切换、节点卡片与状态栏。后续 16:30 记录已把节点实现纠偏为与 canvas-next 同构的原生画布结构。
- **下一步**：把 v2 节点动作接入现有 `creative/start`、Workflow draft、Canvas RUN session 与 canvas-output 回写 API；随后补 v2 的真实半自动/全自动端到端浏览器 smoke。
- **签收**：Producer ✅

---

## 2026-05-15 16:30 智能视界 Canvas v2 同构无限画布交互修正

- **等级**：L2
- **变更**：纠正 v2 节点实现，改为与 canvas-next 无限画布同构的 stage / world / node / ports / conn-svg / grid / minimap / pan / zoom 交互模型。
- **摘要**：`smart-vision-canvas-v2.html` 已移除上一版 `.sv-node` 自定义节点体系，改用 canvas-next 原生 `.app`、`.topbar`、`.toolbar`、`.stage`、`.world`、`.node`、`.node-label`、`.ports`、`.preview-card`、`.conn-svg`、`.float.corner`、`.statusbar` 等结构；节点视觉、胶囊标签、工具浮层、端口、流光连线、画布拖拽、缩放、适配视图、节点拖拽和 resize 均沿用同一套交互习惯。智能画布只在节点类型与 `quickDownstream` 数据传导层扩展：半自动完成后点击下一步自动生成并连接下游节点，自动模式隐藏编辑 / 下一步并自动串行跑完整链路，手动模式保留双击 / 添加节点的自定义编排能力。
- **边界**：仍未修改上游 `tools/workbench-web/image-studio-canvas-next.html`，也未修改封板版 `smart-vision/canvas/legacy-workbench/workbench-web/image-studio-canvas.html`。
- **验证结果**：内联脚本语法检查通过；8877 runtime copy 已重新同步；v2 与原 `/image-studio-canvas.html` 均返回 `200 text/html`；浏览器验证半自动模式中“开始创作 → 完成后显示编辑/下一步 → 下一步生成并连接风格预设节点”；自动模式会从剧本输入自动跑到发布包，共 12 个节点、11 条连线；顶部“无限画布”Tab 已能加载原无限画布 iframe。
- **下一步**：把 v2 的智能节点动作接入真实 `creative/start`、Workflow draft、Canvas RUN session 与 canvas-output 回写 API，并补可重复浏览器 smoke。
- **签收**：Producer ✅

---

## 2026-05-16 12:50 智能视界 active data pack SaaS 边界修正

- **等级**：L3
- **变更**：纠正智能视界的系统边界，避免把当前漫剧创作库数据包误写成唯一绑定。
- **摘要**：智能视界定位为可挂载多种创作库数据包的 SaaS 可视化操作平台。当前 active data pack 是 `漫剧创作库`，所以当前执行必须按该包的 agents / docs / skills / templates / wordlists / tools / data / projects 执行；后续后台可下发广告创意、电商商品图、电影、自媒体商业宣传片等定制创作库，智能画布应按被选中数据包自己的 Agent 流水线、Skill、模板、词库和交付物类型推演执行。
- **实现**：v2 前端 `agentPipelineContractText`、动态规划 schema、节点执行 schema、分段压缩 prompt 和严格校验均改为 active data pack aware；Bridge `plannerContract` 新增 `platformRole / activeDataPackId / activeDataPackTitle / dataPackScope / strictValidationRule`，并把只读索引策略从“漫剧创作库唯一数据包”改为“当前 active data pack”。校验仍禁止 mock / seed / 固定链路兜底，但不再把 `agentRole` 硬编码为漫剧包角色。
- **影响模块**：`smart-vision/canvas/legacy-workbench/workbench-web/smart-vision-canvas-v2.html`、`smart-vision/app/scripts/bridge-server.mjs`、`smart-vision/docs/development-status.md`、Codex 记忆补充。
- **验证结果**：v2 source 内联脚本语法检查通过；runtime copy 内联脚本语法检查通过；`node --check app/scripts/bridge-server.mjs` 通过；Bridge 5188 已重启，`/api/smart-vision/data-pack/runtime?taskType=storyboard` 返回 `activeDataPackTitle=漫剧创作库`、`platformRole=Smart Vision SaaS data-pack visual workflow platform`，并显示 626 个 workspaceDataPackFiles / 616 个 parsedReferences。
- **下一步**：继续把 v2 节点真实执行接入 active data pack 选择、后台数据包下发/切换、`creative/start`、Workflow draft、Canvas RUN session 与 canvas-output 回写。
- **签收**：待 Producer 复核

---

## 2026-05-16 13:32 智能视界 active data pack registry 与切换 API

- **等级**：L3
- **变更**：把 active data pack 从提示词边界升级为可落盘、可查询、可切换、可扩展的状态源和 API。
- **摘要**：新增 `smart-vision/outputs/.smart-vision/data-pack-registry.json`，默认注册 `manju-creation-library`，包含 15 个只读扫描根；Bridge 读取 registry 后按 `activeDataPackId` 构建 context pack、runtime bundle 和 plannerContract。v2 顶栏新增“创作库”选择器，选择结果会写入后台 registry 与本地存储，后续运行请求携带 `activeDataPackId`，避免继续把漫剧数据包写死在智能画布里。
- **API**：新增 `GET /api/smart-vision/data-packs`、`POST /api/smart-vision/data-packs/select`、`POST /api/smart-vision/data-packs/register`；`GET /api/smart-vision/context-pack` 与 `/api/smart-vision/data-pack/runtime` 已支持 `activeDataPackId` / `dataPackId`。
- **修复**：任务队列严格 smoke 现在只在引用缺失或不可用时阻断 `load-data-pack`，JSON parse warning 不再误判为任务队列阻断；修复 active pack 文档 `docs/blocking-camera-geometry.schema.json` 的非法 JSON 字符串。
- **影响模块**：`smart-vision/app/scripts/bridge-server.mjs`、`smart-vision/canvas/legacy-workbench/workbench-web/smart-vision-canvas-v2.html`、`smart-vision/.runtime/legacy-workbench-root/smart-vision-workspace/tools/workbench-web/smart-vision-canvas-v2.html`、`smart-vision/outputs/.smart-vision/data-pack-registry.json`、`docs/blocking-camera-geometry.schema.json`、`smart-vision/docs/development-status.md`。
- **验证结果**：`node --check app/scripts/bridge-server.mjs` passed；v2 source/runtime inline script check passed；`npm run build` passed；`npm run smoke:runtime:strict` passed，context pack 为 616 references / 0 missing，workspace data pack 为 15 roots / 626 files；`npm run smoke:anomaly` passed；临时 Bridge API 实测 `/data-packs`、`/data-packs/select`、`/data-pack/runtime` 均返回 active `manju-creation-library`。
- **下一步**：把 `data-packs/register` 对接后台管理系统的数据包下发；补 v2 针对不同 pack 的交付物展示 schema；再把节点执行结果统一收敛为用户可读交付物，而不是 JSON 参数。
- **签收**：待 Producer 复核

---

## 2026-05-16 13:57 智能视界后台数据包同步闭环

- **等级**：L3
- **变更**：把后台管理系统的数据包下发接口与 Smart Vision active data pack registry 打通。
- **后台实现**：后台管理系统新增 `api-server/src/modules/data-packs/routes.ts`，采用文件型 registry，默认存储 `后台管理系统/data/data-pack-registry.json`；新增 `GET /api/data-packs`、`GET /api/data-packs/active`、`GET /api/data-packs/:id`、`POST /api/admin/data-packs`、`PATCH /api/admin/data-packs/:id`、`POST /api/admin/data-packs/:id/select`。已把 `manju-creation-library` 注册到后台 registry。
- **Smart Vision 实现**：Bridge 新增 `POST /api/smart-vision/data-packs/sync`，支持用后台登录 token 从 `http://127.0.0.1:4000/api/data-packs` 同步 pack，支持 `dryRun` 预览；v2 顶栏“创作库”区域新增 `↻` 同步按钮，使用 canvas-next 共用 token 调用 Bridge sync。Bridge CORS 允许 `authorization` header。
- **输出收敛**：v2 增强用户交付物解析，支持 `active_pack_deliverable`、`customerDeliverable`、`readableDeliverable` 和 `output.items`，继续把后台 JSON / workflow 参数留在内部字段，不作为主展示。
- **影响模块**：`后台管理系统/api-server/src/modules/data-packs/routes.ts`、`后台管理系统/api-server/src/app.ts`、`后台管理系统/docs/canvas-api-integration.md`、`后台管理系统/README.md`、`smart-vision/app/scripts/bridge-server.mjs`、`smart-vision/canvas/legacy-workbench/workbench-web/smart-vision-canvas-v2.html`、`smart-vision/.runtime/legacy-workbench-root/smart-vision-workspace/tools/workbench-web/smart-vision-canvas-v2.html`。
- **验证结果**：后台 `npm run build` passed；后台临时 API smoke 可注册并读取 `smoke-pack`；Bridge 临时端到端 sync 可从后台同步 `smoke-admin-pack` 并编译 runtime；真实 4000 已注册 `manju-creation-library`，5188 Bridge 对 4000 的 `dryRun` sync 返回 `syncedCount=1 / active=manju-creation-library`；`npm run build` passed；`npm run smoke:runtime:strict` passed；`npm run smoke:anomaly` passed。
- **服务状态**：`http://127.0.0.1:4000` 后台 API、`http://127.0.0.1:5188` Smart Vision Bridge、`http://127.0.0.1:8877` v2 工作台均在当前会话中监听。
- **下一步**：为后台管理系统补数据包管理页面；在 v2 里按不同 pack 的 `type / capabilities / metadata` 动态调整节点交付物 schema；补 v2 半自动/自动浏览器 smoke。
- **签收**：待 Producer 复核

---

## 2026-05-16 14:25 智能视界 Data Pack 管理与交付物契约闭环

- **等级**：L3
- **变更**：把后台 data pack registry 从 API 能力补齐为可操作管理页面，并把 pack capabilities / metadata 真正传入智能画布执行契约。
- **后台实现**：后台管理系统新增“创作库数据包”页面，支持查看 active pack、目录根、能力声明、元数据、注册、编辑和设为当前；`/api/data-packs` 会按业务类型补齐默认 `capabilities.outputKinds`、`requiredOrder` 和 `metadata.workflowJsonVisibility=internal`。
- **Smart Vision 实现**：Bridge runtime / plannerContract 现在返回 active data pack 的 `outputKinds / requiredOrder / capabilities / metadata`；Canvas v2 的动态规划 schema、节点执行 schema、prompt profile 和 agentPipelineContract 会按当前 pack 生成 `userDeliverable.kind` 约束，不再只沿用漫剧固定交付物枚举。
- **Smoke**：新增 `app/scripts/smart-canvas-v2-smoke.mjs` 与 `npm run smoke:smart-canvas-v2`，验证 v2 source/runtime copy、data pack capabilities、plannerContract `fixedPipelineAllowed=false` 和 workflow JSON 内部化规则。
- **影响模块**：`后台管理系统/admin-web/src/main.tsx`、`后台管理系统/admin-web/src/styles.css`、`后台管理系统/api-server/src/modules/data-packs/routes.ts`、`smart-vision/app/scripts/bridge-server.mjs`、`smart-vision/app/scripts/smart-canvas-v2-smoke.mjs`、`smart-vision/app/package.json`、`smart-vision/canvas/legacy-workbench/workbench-web/smart-vision-canvas-v2.html`。
- **验证结果**：后台管理系统 `npm run build` passed；Smart Vision `node --check app/scripts/bridge-server.mjs` passed；Smart Vision `npm run build` passed；`npm run smoke:smart-canvas-v2` passed；`npm run smoke:runtime:strict` passed；`npm run smoke:anomaly` passed。
- **下一步**：把 v2 节点真实动作接入 `creative/start`、Workflow draft、Canvas RUN session 与 canvas-output 回写；随后注册一个非漫剧测试 pack，验证 v2 outputKinds / requiredOrder 随 active pack 切换。
- **签收**：待 Producer 复核

---

## 2026-05-16 14:50 智能视界 Canvas v2 真实执行契约接入

- **等级**：L3
- **变更**：把 v2 节点动作从前端模拟结果推进到 Bridge 真实创作输入包、Pipeline Run、Workflow Draft 和 Canvas RUN 会话契约。
- **实现**：v2 剧本输入节点仍先按 active data pack 调用后台 LLM 生成动态规划，随后调用 `POST /api/smart-vision/creative/start` 创建真实创作包和 Pipeline Run；导入图片 / 文本 / md 时，Bridge 会把原文件物化到 `outputs/04-输入资料/{importId}/imports/` 并回填 artifactPath；工作流类节点保存 Workflow Draft 后自动调用 `POST /api/smart-vision/workflows/canvas-run-sessions/start`，节点输出保留 edit/run URL，用户点击编辑时进入无限画布。
- **输出边界**：前端仍只展示用户可读交付物入口，例如剧本源、分镜草案、资产卡、视频提示词、资产图 / 故事板 / 视频结果入口；workflow JSON、RUN session、plannerResult、dynamicPlan 等保留在节点内部数据，不作为用户主结果展示。
- **影响模块**：`smart-vision/app/scripts/bridge-server.mjs`、`smart-vision/app/scripts/smart-canvas-v2-smoke.mjs`、`smart-vision/canvas/legacy-workbench/workbench-web/smart-vision-canvas-v2.html`、`smart-vision/.runtime/legacy-workbench-root/smart-vision-workspace/tools/workbench-web/smart-vision-canvas-v2.html`。
- **验证结果**：`node --check app/scripts/bridge-server.mjs` passed；`npm run build` passed；`npm run smoke:smart-canvas-v2` passed，并验证 `creative/import` artifact 物化、`creative/start` dry-run Pipeline Run preview、Canvas RUN session dry-run 创建；`npm run smoke:runtime:strict` passed；`npm run smoke:anomaly` passed；8877 v2 页面 HTTP 200。
- **未完成**：浏览器插件当前未能获取 Codex browser pane，本轮未完成交互级截图验证；下一步补 v2 半自动 / 全自动浏览器 smoke，并把导入图片 artifactPath 进一步写入资产图 Workflow Draft 的 `referenceImages`。
- **签收**：待 Producer 复核

---

## 2026-05-16 15:12 智能视界 Canvas v2 浏览器 Smoke 与参考图传导

- **等级**：L3
- **变更**：补齐 v2 半自动 / 自动浏览器级 smoke，并把导入图片 artifactPath 接入资产图 Workflow Draft 的 `referenceImages`。
- **实现**：v2 页面新增只在 `?probe=1` 下启用的 `window.__SMART_CANVAS_V2_PROBE__`，用于 headless Chrome 验证 UI 状态机，不改变真实用户执行路径；新增 `npm run smoke:smart-canvas-v2:browser`，打开 8877 v2 页面后验证半自动模式 `剧本输入 → 音频风格` 和自动模式完整 12 节点 / 11 连线链路。Bridge `saveWorkflowDraft` 会根据 metadata 中的 `inputArtifacts / referenceImages / outputArtifacts / episodeId` 生成 taskPlan，v2 工作流节点会把上游 artifact、导入文件和图片参考传入 metadata。
- **验证结果**：`npm run smoke:smart-canvas-v2:browser` passed，半自动结果 3 nodes / 2 conns，自动结果 12 nodes / 11 conns，全部 success；`npm run smoke:smart-canvas-v2` passed，并断言 `04-输入资料/smart-canvas-v2-ref-smoke/imports/01-reference.png` 进入 `workflowDraft.canvasExecution.referenceImages`；`npm run build` passed；`npm run smoke:runtime:strict` 单独重跑 passed；`npm run smoke:anomaly` passed。
- **边界**：浏览器探针只用于 smoke，不作为生产 mock；真实 v2 节点执行仍必须通过后台 LLM、active data pack 和 Bridge API。
- **下一步**：注册一个非漫剧测试 pack，验证 v2 outputKinds / requiredOrder 随 active pack 切换；随后用用户真实长剧本跑一次主入口到资产图 Workflow 的人工回写链路。
- **签收**：待 Producer 复核

---

## 2026-05-16 15:26 智能视界 Canvas v2 多数据包切换验证

- **等级**：L3
- **变更**：把“智能视界不是漫剧创作库单一专用系统”的边界变成可重复 smoke 验证。
- **实现**：`npm run smoke:smart-canvas-v2` 新增 `smart_canvas_v2_data_pack_switch`。脚本会通过 `POST /api/smart-vision/data-packs/register` 注册 `sv-smoke-ad-creative-pack` 广告创意测试包，再通过 `POST /api/smart-vision/data-packs/select` 切换 active pack，随后调用 `/api/smart-vision/data-pack/runtime` 校验 plannerContract 的 `outputKinds / requiredOrder / userDeliverableRule` 均来自广告包，且不泄漏漫剧 `adapted_script` 交付物。验证完成后自动恢复原 active pack `manju-creation-library`。
- **影响模块**：`smart-vision/app/scripts/smart-canvas-v2-smoke.mjs`、`smart-vision/outputs/.smart-vision/data-pack-registry.json`、`smart-vision/docs/development-status.md`、`smart-vision/outputs/.smart-vision/project-state.json`、`smart-vision/outputs/.smart-vision/recovery-checkpoint.json`、`smart-vision/outputs/.smart-vision/handoff-report.md`。
- **验证结果**：`node --check app/scripts/bridge-server.mjs` passed；`node --check app/scripts/smart-canvas-v2-smoke.mjs` passed；`npm run build` passed；`npm run smoke:smart-canvas-v2` passed，dataPackSwitch selected/restored 均正确；`npm run smoke:smart-canvas-v2:browser` passed，半自动 3/2、自动 12/11；`npm run smoke:runtime:strict` passed；`npm run smoke:anomaly` passed。
- **下一步**：用用户真实长剧本跑一次主入口：输入 / 导入 → active pack runtime → creative/start → canvas-next 打开资产图 Workflow → 回写真实产物。
- **签收**：待 Producer 复核

---

## 2026-05-16 15:38 智能视界 Canvas v2 主入口真实写入 Smoke

- **等级**：L3
- **变更**：把“输入剧本后走真实主入口到首阶段资产图回写”的路径固化为可重复 smoke。
- **实现**：新增 `app/scripts/smart-canvas-v2-entry-smoke.mjs` 与 `npm run smoke:smart-canvas-v2:entry`。脚本会启动 Bridge，导入长剧本文本和参考图，调用 `creative/start` 真实写入创作输入包和 Pipeline Run，获取首阶段资产图 Workflow，执行 Workflow Preflight，创建 Canvas RUN Session，用真实 PNG 走 `canvas-output` dry-run 与真实回写，再把 asset review 置为 done，最后断言 Pipeline Run 推进到 `storyboard_images / workflow_ready` 且 Runtime Diagnostics ready。
- **修复**：首次运行发现 smoke 读取 preflight 响应层级错误，实际 Bridge 返回 `data.preflight.status`；已修正脚本解析，避免误判已通过的 workflow。
- **验证结果**：`npm run smoke:smart-canvas-v2:entry` passed，生成 `ep-v2-entry-1778917004765`，导入 2 个文件，生成 2 个视频段、9 项资产，资产图 Workflow `draft-asset_image_generation-1778917005559` preflight passed，回写 `01-资产图与提示词/资产图/ep-v2-entry-1778917004765/smart-canvas-v2-entry-asset.png` 后 review done，自动解锁故事板 Workflow `draft-storyboard_image_generation-1778917005899`；随后 `npm run build`、`npm run smoke:smart-canvas-v2`、`npm run smoke:runtime:strict`、`npm run smoke:anomaly` 全部 passed。
- **下一步**：继续把入口 smoke 扩到故事板阶段回写，并用浏览器真实交互检查节点输出详情、编辑返回和回写按钮状态。
- **签收**：待 Producer 复核

---

## 2026-05-16 15:56 智能视界 Canvas v2 入口 Smoke 覆盖到故事板回写

- **等级**：L3
- **变更**：把 `npm run smoke:smart-canvas-v2:entry` 从首阶段资产图回写扩展到故事板阶段回写，并修复下游 Workflow episode 路径归属。
- **修复**：`createNextWorkflowFromReview` 之前在产物审核通过后创建下游 Workflow 时未携带当前 Pipeline Run 的 `episodeId`，导致故事板 Workflow 可能落到 `02-工作流/ep001/`。现在会根据 `sourceWorkflow.pipelineRunId` 找到 Pipeline Run 和下游 stage，向 `saveWorkflowDraft` 传入 `episodeId / pipelineRunId / pipelineStageId / inputArtifacts / outputArtifacts`；`preparePipelineStageWorkflow` 也补充同样 metadata。
- **Smoke 增强**：入口 smoke 现在断言故事板 Workflow 和视频 Workflow 路径都必须包含当前 `episodeId`；完整验证链路为 `creative/import → creative/start → asset workflow preflight → asset canvas-output → asset review done → storyboard workflow preflight → storyboard canvas-output → storyboard review done → video workflow ready`。
- **验证结果**：`npm run smoke:smart-canvas-v2:entry` passed，生成 `ep-v2-entry-1778918114394`，资产图与故事板图均回写并审核 done，Pipeline Run 当前阶段推进到 `videos`，视频 Workflow `draft-video_generation-1778918115987` 路径为 `02-工作流/ep-v2-entry-1778918114394/draft-video_generation-1778918115987.mjb-workflow.json`；`node --check scripts/bridge-server.mjs`、`node --check scripts/smart-canvas-v2-entry-smoke.mjs`、`npm run build`、`npm run smoke:smart-canvas-v2`、`npm run smoke:smart-canvas-v2:browser`、`npm run smoke:runtime:strict`、`npm run smoke:anomaly` 全部 passed。
- **下一步**：继续把入口 smoke 扩到视频阶段回写，并用浏览器真实交互检查节点输出详情、编辑返回和回写按钮状态。
- **签收**：待 Producer 复核

---

## 2026-05-16 18:50 智能视界 Canvas v2 主入口完整闭环 Smoke

- **等级**：L3
- **变更**：把 `npm run smoke:smart-canvas-v2:entry` 从视频回写扩展到完整 Pipeline Run done，并收敛 Release publish-gate 诊断噪声。
- **实现**：入口 smoke 现在覆盖 `creative/import → creative/start → asset workflow/canvas-output/review done → storyboard workflow/canvas-output/review done → video workflow/canvas-output/review done → edit output/review done → QA report/review done → Release manifest/release review done`，并断言最终 Pipeline Run `status=done`。`inferEpisodeIdFromValue` 已支持 `ep-v2-entry-*` 这类动态 episode id；Canvas 输出绑定 Pipeline Run 时继续按 `workflow.pipelineRunId / pipelineStageId` 精确匹配。
- **修复**：Runtime Diagnostics 的 release publish-gate blocker 只在 release 已处于 `approved / published` 或发布队列存在 active publish intent 时报告；普通 `ready_for_review` 待审包不再导致 `release_status_not_approved`，避免正常审核等待状态污染平台健康度。
- **影响模块**：`smart-vision/app/scripts/bridge-server.mjs`、`smart-vision/app/scripts/smart-canvas-v2-entry-smoke.mjs`、`smart-vision/docs/development-status.md`、`smart-vision/outputs/.smart-vision/project-state.json`、`smart-vision/outputs/.smart-vision/recovery-checkpoint.json`、`smart-vision/outputs/.smart-vision/handoff-report.md`。
- **验证结果**：`node --check app/scripts/bridge-server.mjs` passed；`node --check app/scripts/smart-canvas-v2-entry-smoke.mjs` passed；`npm run build` passed；`npm run smoke:smart-canvas-v2` passed；`npm run smoke:smart-canvas-v2:entry` passed，最新 episode `ep-v2-entry-1778928166193` 六阶段全部 done；`npm run smoke:smart-canvas-v2:browser` passed，半自动 3/2、自动 12/11；`npm run smoke:runtime:strict` passed；`npm run smoke:anomaly` passed；关键 `.smart-vision/*.json` 均可解析。
- **下一步**：做真实浏览器人工验收，重点检查节点输出详情、编辑返回、Workflow 打开与回写按钮状态；继续把节点输出详情收敛成用户交付物视图。
- **签收**：待 Producer 复核

---

## 2026-05-16 19:08 智能视界 Canvas v2 输出详情交付物入口回归

- **等级**：L2
- **变更**：把节点输出详情从“只看链路是否成功”继续收敛到用户交付物查看 / 编辑 / 工作流进入的可回归交互。
- **实现**：Canvas v2 输出详情中的图片 / 视频 artifactPath 现在统一通过 workbench `/read?path=...&raw=1` 只读入口加载，避免 `01-资产图与提示词/...` 这类相对路径直接 404。`window.__SMART_CANVAS_V2_PROBE__` 新增 `runOutputDetail()`，会在真实浏览器页面中打开分镜表节点“查看/编辑”、保存交付物并断言同步到节点数据；再打开 Workflow 节点输出详情，验证交付区、媒体缩略图 `/read` src 和“进入无限画布查看/执行”入口。
- **影响模块**：`smart-vision/canvas/legacy-workbench/workbench-web/smart-vision-canvas-v2.html`、`smart-vision/app/scripts/smart-canvas-v2-smoke.mjs`、`smart-vision/docs/development-status.md`、`smart-vision/outputs/.smart-vision/project-state.json`、`smart-vision/outputs/.smart-vision/recovery-checkpoint.json`、`smart-vision/outputs/.smart-vision/handoff-report.md`。
- **验证结果**：`node --check app/scripts/bridge-server.mjs` passed；`node --check app/scripts/smart-canvas-v2-entry-smoke.mjs` passed；`node --check app/scripts/smart-canvas-v2-smoke.mjs` passed；v2 inline scripts passed；`npm run build` passed；`npm run smoke:smart-canvas-v2` passed；`npm run smoke:smart-canvas-v2:browser` passed，summary 为 `assisted 3/2; auto 12/11; output detail ok`；`npm run smoke:runtime:strict` passed；`npm run smoke:anomaly` passed。
- **下一步**：继续真实人工验收 v2 节点输出在用户长剧本、真实回写产物和多数据包切换下的交付物文本质量；保留 JSON / workflow 参数在内部调试入口。
- **签收**：待 Producer 复核

---

## 2026-05-16 19:24 智能视界 Canvas v2 默认交付物结构化收敛

- **等级**：L2
- **变更**：把 v2 节点 fallback 输出从内部状态摘要继续收敛为用户可读的业务交付物。
- **实现**：`smart-vision-canvas-v2.html` 新增剧本场景 / 角色 / 节拍抽取与节点交付物生成逻辑。剧集规划输出视频段，导演讲戏输出镜头 / 动作 / 视觉约束，分镜表输出结构化镜头表，资产卡输出角色 / 场景 / 道具卡，资产图 / 故事板 / 视频输出计划中的交付槽位与预期路径，QA 与 Release 输出门禁项、manifest、视频清单和发布历史。未真实渲染的媒体只展示预期路径，不创建破图或破视频缩略图；workflow JSON、RUN session、plannerResult、dynamicPlan 仍只作为内部数据。
- **影响模块**：`smart-vision/canvas/legacy-workbench/workbench-web/smart-vision-canvas-v2.html`、`smart-vision/docs/development-status.md`、`smart-vision/outputs/.smart-vision/project-state.json`、`smart-vision/outputs/.smart-vision/recovery-checkpoint.json`、`smart-vision/outputs/.smart-vision/handoff-report.md`。
- **验证结果**：`node --check app/scripts/bridge-server.mjs` passed；`node --check app/scripts/smart-canvas-v2-entry-smoke.mjs` passed；`node --check app/scripts/smart-canvas-v2-smoke.mjs` passed；v2 inline scripts passed；`npm run build` passed；`npm run smoke:smart-canvas-v2` passed；`npm run smoke:smart-canvas-v2:entry` passed，最新 episode `ep-v2-entry-1778930487733` 最终 Pipeline Run `done`；`npm run smoke:smart-canvas-v2:browser` passed，summary 为 `assisted 3/2; auto 12/11; output detail ok`；`npm run smoke:runtime:strict` passed；`npm run smoke:anomaly` passed。
- **下一步**：真实浏览器人工验收用户长剧本下各节点交付物文本质量，并继续做多数据包交付物 schema 渲染。
- **签收**：待 Producer 复核

---

## 2026-05-16 19:55 智能视界 Canvas v2 交付物质量 Smoke 与参考图优先级

- **等级**：L2
- **变更**：把“节点输出必须是用户可读交付物，不能退回内部 JSON”固化为浏览器级回归，并修复导入参考图被历史产物挤出的问题。
- **实现**：`smart-vision-canvas-v2.html` 新增 `runDeliverableQuality` 探针，自动链路完成后检查 9 类核心节点：剧集规划、导演讲戏、分镜表、资产卡、资产图、故事板、视频、QA、Release。每类断言交付物 kind、条目数量、详情页关键词、媒体 src 安全入口和内部字段泄漏。`smart-canvas-v2-smoke.mjs` 已把该探针纳入 `npm run smoke:smart-canvas-v2:browser`。Bridge `collectCanvasWorkflowSources` 对当前 taskPlan 显式输入的 input/reference artifacts 增加排序权重，确保用户刚导入的参考图优先进入 `canvasExecution.referenceImages`。
- **影响模块**：`smart-vision/canvas/legacy-workbench/workbench-web/smart-vision-canvas-v2.html`、`smart-vision/app/scripts/smart-canvas-v2-smoke.mjs`、`smart-vision/app/scripts/bridge-server.mjs`、`smart-vision/docs/development-status.md`、`smart-vision/outputs/.smart-vision/project-state.json`、`smart-vision/outputs/.smart-vision/recovery-checkpoint.json`、`smart-vision/outputs/.smart-vision/handoff-report.md`。
- **验证结果**：`node --check app/scripts/bridge-server.mjs` passed；`node --check app/scripts/smart-canvas-v2-entry-smoke.mjs` passed；`node --check app/scripts/smart-canvas-v2-smoke.mjs` passed；v2 inline scripts passed；`npm run build` passed；`npm run smoke:smart-canvas-v2` passed，导入参考图位于 `workflowReferenceImages.artifactPaths[0]`；`npm run smoke:smart-canvas-v2:browser` passed，summary 为 `assisted 3/2; auto 12/11; output detail ok; deliverables 9`；`npm run smoke:smart-canvas-v2:entry` passed，最新 episode `ep-v2-entry-1778932458375` 最终 Pipeline Run `done`；`npm run smoke:runtime:strict` passed；`npm run smoke:anomaly` passed。
- **下一步**：继续真实人工验收用户长剧本下的交付物文本质量，之后补多数据包交付物 schema 渲染与后台配置联动。
- **签收**：待 Producer 复核

---

## 2026-06-25 Agent 系统总复盘文档新增

- **等级**：L2
- **变更**：新增 `docs/agent-system-retrospective.md`，把当前 Agent 系统、方法论、规则、根目录自动化流水线、Smart Vision 平台流水线、状态源、风险债务和下一步改造路线整理成统一复盘入口。
- **摘要**：复盘确认当前系统应统一为 8 个精益 Agent；中游主交付物是故事板生产包；根 `./studio pipeline` 与 Smart Vision 平台流水线边界不同；Smart Vision 不直接调用模型，只生成和调度无限画布 Workflow JSON；发现红线校验规则 key 与执行器 gate_order 不匹配、协议校验函数未接入主流程、Agent 数量文档漂移、项目脚本硬编码、测试数据与生产状态混杂、项目索引为空等问题。
- **影响 Phase**：工作区级方法论复盘 / Agent 职责统一 / 自动化流水线治理。
- **影响模块**：`docs/agent-system-retrospective.md`、`docs/pipeline-sync-log.md`。本次为复盘文档新增，不直接改变现有生产输出格式、Agent 执行规则或 Phase Gate 条目。
- **后续传播建议**：按复盘文档第 9 节分批同步 `docs/workflow.md`、`docs/agent-protocol.md`、`README.md`、校验脚本和项目配置。
- **验证结果**：文档已落盘；未执行代码测试。
- **签收**：Producer 待复核

---

## 2026-06-25 Seedance 2.5 提示词输出版本接入

- **等级**：L2
- **变更**：基于用户提供的《Seedance 2.5 专业视频提示词创作方法论 教学课件.pdf》，新增 `seedance2.5` 连续叙事提示词子方法论，并拆分为 `seedance2.5-15s` 与 `seedance2.5-30s` 两套输出模板。
- **方法论摘要**：新版本采用 `生成任务 + 主要主体 + 场景与环境状态 + 情绪目标 + 视觉风格 + 分段脚本` 六大模块；15s 版本兼容 Seedance 2.0 的 15s 规则，30s 版本面向 Seedance 2.5，最大时长 30s；分段脚本必须执行跟随对象、运动路线、镜头解释空间、主体关系变化、停顿点、收尾信息变化六步法。
- **影响模块**：`docs/seedance2.5-prompt-methodology.md`、`templates/_shared/prompt-output/seedance2.5-15s-template.md`、`templates/_shared/prompt-output/seedance2.5-30s-template.md`、`docs/prompt-standards.md`、`docs/dual-format-prompt-methodology.md`、`docs/seedance-prompt-engineering.md`、`docs/prompt-redline-rules.json`、`templates/_project-template/08-qa/prompt-review-template.md`、`templates/_manga-template/pipeline.config.json`、`projects/无限强化_漫剧_001/pipeline.config.json`、`agents/director/agent.md`、`agents/storyboard-artist/agent.md`、`agents/studio/agent.md`、`agents/reviewer/agent.md`。
- **新增输出路径**：`05-prompts/seedance/第XX集/seedance2.5/epXXX-seedance2.5-15s-paste.md`、`05-prompts/seedance/第XX集/seedance2.5/epXXX-seedance2.5-30s-paste.md`。
- **验证结果**：`docs/prompt-redline-rules.json`、`templates/_manga-template/pipeline.config.json`、`projects/无限强化_漫剧_001/pipeline.config.json` 均通过 JSON 解析；已用 `rg` 确认 `seedance2.5` 入口在 docs / templates / agents / project config 中可检索。
- **签收**：Producer 待复核

---

## 2026-06-25 Seedance 2.5 去模板腔修正

- **等级**：L2
- **变更**：把 `seedance2.5` 的六大模块和分段六步法从“最终提示词外观”改为“后台构思与 QA 骨架”，明确最终平台投喂稿应为导演口述式自然长提示词，不再默认输出表格化的 `跟随对象 / 运动路线 / 镜头解释空间 / 关系变化 / 停顿点 / 收尾信息变化`。
- **影响模块**：`docs/seedance2.5-prompt-methodology.md`、`templates/_shared/prompt-output/seedance2.5-15s-template.md`、`templates/_shared/prompt-output/seedance2.5-30s-template.md`、`docs/prompt-standards.md`、`docs/dual-format-prompt-methodology.md`、`docs/prompt-redline-rules.json`。
- **执行口径**：工作底稿可以用表格和字段；最终投喂稿必须自然化，把六步法融入画面句。项目归档或 Reviewer 审核可以保留六固定段；平台直接投喂可合并为“全片环境、光线与声音 / 人声 / 画质与负面约束”。
- **新增红线**：`R018 Seedance 2.5 去模板腔`，用于提醒最终投喂稿不得像表格填空；六步法标签只允许出现在工作底稿、QA、自检或审核附录。
- **验证结果**：`docs/prompt-redline-rules.json` 通过 JSON 解析；已用 `rg` 确认去模板腔规则在 docs / templates / redline 中可检索。
- **签收**：Producer 待复核
