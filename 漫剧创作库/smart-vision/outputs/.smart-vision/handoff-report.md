# 智能视界换机交接报告

更新时间：2026-05-09 15:27

## 1. 项目边界

- 智能视界是独立平台开发工程，主目录：`smart-vision/`。
- 智能视界最终交付物与运行状态必须归拢到：`smart-vision/outputs/`。
- 工程状态最高权威目录：`smart-vision/outputs/.smart-vision/`。
- 上游漫剧项目仅作为资料源：`projects/无限强化_漫剧_001`。
- 原始根目录 `studio` 与 `tools/` 不应被删除、移动或重构。

## 2. 当前开发状态

当前重点已从业务产物生成转回平台功能开发。已完成到“平台 Runtime 管理层 + 发布前强门禁 + 单个 Release 修复入口 + Release 门禁分组展示 + Runner→Release 自动推进 + 数据包解析 + 任务编排落盘 + taskQueue 执行器 + taskQueue 单项操作 + Release 历史与发布队列单项操作 + 结构化报告 + 发布失败路径自测 + 一键端到端 smoke + 高影响操作 dry-run / 确认保护 + 异常注入 smoke + 本地状态安全写入 + 无限画布 Workflow Adapter + Workflow JSON Preflight + 画布输出自动回写 + Canvas 输出幂等与失败诊断 + Pipeline Run 阶段门禁闭环 + Pipeline Run 阶段级修复入口 + 真实 Pipeline Run 全链路闭环发布 + Runtime 面板 Canvas failed retry + 真实画布导入入口硬化 + Canvas import smoke 固化 + 浏览器级画布导入探针 + 平台节点渲染”：Workflow、Artifact、Review、Runtime Diagnostics、Runtime Repair、Release Registry、数据包解析、任务编排器、任务队列执行器、无限画布工作流编译、画布输出回写、Pipeline Run Ledger、Runtime smoke 脚本与前端面板均已接入，最近一次 `npm run smoke:canvas-import:browser`、`npm run build`、`npm run smoke:runtime:strict`、`npm run smoke:anomaly` 全部通过。

已完成核心能力：

- 智能视界独立工程：`smart-vision/`。
- 独立 outputs 边界：`smart-vision/outputs/`。
- Bridge 服务：`smart-vision/app/scripts/bridge-server.mjs`。
- 前端主 UI：`smart-vision/app/src/App.tsx`。
- API 封装：`smart-vision/app/src/data/api.ts`。
- 类型定义：`smart-vision/app/src/types.ts`。
- 工业工作流主链路：`asset_image_generation → storyboard_image_generation → video_generation → edit → qa → release`。
- Runtime 能力：Diagnostics、Queue Run、Retry Failed、Replay Chain、State Repair。
- Release 生命周期：`draft → ready_for_review → approved → published → archived → restored`。
- Release API：`GET /api/smart-vision/releases`、`POST /api/smart-vision/releases/create`、`POST /api/smart-vision/releases/status`。
- 单个 Release 修复 API：`POST /api/smart-vision/releases/repair`。
- 发布队列 API：`POST /api/smart-vision/releases/publish-queue/run`。
- 发布失败重入 API：`POST /api/smart-vision/releases/publish-queue/requeue`。
- 发布失败路径自测 API：`POST /api/smart-vision/releases/publish-queue/smoke`。
- Release Diagnostics：已接入发布包状态、manifest、artifact、approval、published、archived、review 等诊断项。
- Release 面板：已展示诊断问题、发布包统计、合法状态按钮保护、可发布状态、阻塞原因、单项修复按钮、修复结果，以及 QA 审核 / Release 审核 / Manifest 与 Artifact 文件门禁分组。
- Runner→Release 自动推进：QA review done 自动确保 release draft，release approved 自动进入发布队列，发布队列运行后通过强门禁才会 published。
- 发布历史：published 写入 `publishHistory`，archived 写入 `archiveHistory`，restored 写入 `restoreHistory`。
- Release 面板：已展示 publishHistory / archiveHistory / restoreHistory，并可从历史项打开 manifest。
- 数据包解析：`context-pack` 会按 taskType alias 匹配 methodology / skill / template，解析 docs / skills / templates 文件，输出 headings、excerpt、jsonKeys、referenceIssues、dataPackSummary。
- 任务编排器：`workflows/tasks/plan` 会基于数据包解析结果生成 subtasks、orchestration、acceptanceCriteria 和阻塞状态。
- 任务编排落盘：`workflows/tasks/persist` 会把 subtasks 写入 `progress-ledger.json`，把 taskPlans / taskQueue 写入 `workflow-runner-ledger.json`。
- 任务队列执行器：`workflows/tasks/queue/run` 会按依赖消费 taskQueue，更新 progress 状态，并写入 `.smart-vision/task-runs/*.json` 执行报告。
- 任务队列单项操作：`workflows/tasks/queue/requeue` 会按 `taskQueueId` 重新入队；`workflows/tasks/queue/run` 支持按 `taskQueueId` 单项运行。
- Runtime 面板：taskQueue 项已支持报告预览、单项重入、单项运行。
- Runtime 面板：发布队列项已支持按 releaseId 单项运行和单项重入。
- Artifact Preview：task-runs 执行报告已从纯 JSON 预览升级为结构化报告视图。
- Runtime 面板：已接入 Release 发布失败路径 dry-run 自测入口。
- Runtime 一键端到端 smoke API：`POST /api/smart-vision/runtime/smoke` 已串联数据包解析、任务计划、虚拟 taskQueue、Release dry-run 与 Diagnostics。
- Runtime 面板：已接入端到端自测入口并展示步骤摘要。
- 命令行端到端 smoke：`cd smart-vision/app && npm run smoke:runtime` 会临时启动 Bridge、调用 runtime smoke、输出摘要并自动关闭服务。
- CI 严格模式 smoke：`cd smart-vision/app && npm run smoke:runtime:strict` 会在 runtime smoke 非 `passed` 时返回失败码。
- 输出产物缺失修复：已把上游 `04-storyboard/ep001-storyboard.md` 镜像到 `smart-vision/outputs/04-storyboard/ep001-storyboard.md`，并将 `04-storyboard` 纳入 Bridge 产物扫描根。
- Runner Ledger 历史归档：`POST /api/smart-vision/workflows/runner/compact` 已支持 taskQueue / releasePublishQueue / runs / events 裁剪归档。
- Runtime 面板：操作入口已按诊断与自测、任务执行、发布队列、维护分组，并新增“归档队列历史”入口与归档结果摘要。
- Runner archiveSummary：`GET /api/smart-vision/workflows/runner/status` 已返回归档计数和最近归档 task / release / run / event。
- Runner archive 诊断与修复：Runtime Diagnostics 会检查 archives 结构；Runtime Repair 会规整损坏 archive bucket，并返回 `repairedRunnerArchiveCount`。
- Runner archive 细项恢复：`POST /api/smart-vision/workflows/runner/archive/restore` 已支持按 bucket / itemId 恢复归档项。
- taskQueue 压力自测：`POST /api/smart-vision/workflows/tasks/queue/stress` 已支持批量任务计划 dry-run。
- Runner archive 批量恢复：`POST /api/smart-vision/workflows/runner/archive/restore` 已支持 `restoreAll` 批量恢复 archive bucket。
- Runtime 面板：任务压力自测已支持配置 taskTypes 与 copies。
- 高影响操作防误触：pressure / archive / repair / publish 已补确认或 dry-run preview；真实写入操作需要确认弹窗。
- Runtime Repair dry-run：`POST /api/smart-vision/workflows/runtime/repair` 支持 `{ "dryRun": true }`。
- Release 发布队列 dry-run：`POST /api/smart-vision/releases/publish-queue/run` 支持 `{ "dryRun": true }`。
- Runtime 面板：已新增修复预览、归档预览、发布预览结果卡。
- 异常注入 smoke：`POST /api/smart-vision/runtime/anomaly-smoke` 与 `npm run smoke:anomaly` 已接入；覆盖 release 门禁异常、runner archive 损坏、taskQueue 依赖缺失、context pack 引用缺失、Pipeline Run 事故、release registry 结构损坏、artifact review 冲突、task-run 报告缺失、dry-run 保护。
- 状态安全写入：关键 `.smart-vision/*.json` 已采用 tmp 写入、JSON 校验、原子 rename、`.bak` 备份和进程内同文件串行锁。
- 操作 journal：高影响写操作已写入 `state-operation-journal.json`，并由 Runtime Diagnostics 检查超时 running 操作。
- 真实执行器边界：已明确收敛为无限画布 Workflow Adapter；平台不另建模型执行器服务，只编译可导入 / 可编辑 / 可执行的无限画布工作流。
- 自动执行器定义：底层能力是自动生成 Workflow JSON，并按流程填入提示词、参考图、输出路径，再按策略进入无限画布工作流；Smart Vision 不直接调用模型。
- Workflow Draft：已写入 `canvasExecution`，包含 `executor=infinite_canvas`、`workflowMode`、`editUrl`、`runUrl`、`promptCount`、`referenceImageCount`、提示词来源、参考图来源和输出路径提示。
- 执行策略元数据：`canvasExecution.strategy` 已明确 `carrier=workflow_json`、`directModelExecution=false`、`modelInvocation=never_direct_from_smart_vision`。
- 工业流水线计划：`POST /api/smart-vision/workflows/pipeline/plan` 已返回资产图、故事板、视频、剪辑、QA、Release 的任务计划序列和依赖边。
- Workflow JSON Preflight：`POST /api/smart-vision/workflow-draft/preflight` 已支持对 taskType 草案、workflowDraft、workflowId 或 workflowPath 做 dry-run 契约校验，覆盖 Schema / Path、Canvas 节点连线、Canvas Execution、Prompt / Reference、Output Writeback Hint。
- 资产图执行链：`asset_image_generation` 已生成 `stylePreset → txt2img/img2imgAll → singleImage`，自动填充角色 / 场景 / 道具资产 Brief、资产索引、风格约束和资产图输出目录。
- 故事板前置约束：`storyboard_image_generation` 明确依赖资产图 / asset-index，生成故事板图后才允许进入视频 Workflow。
- 视频前置约束：`video_generation` 明确依赖故事板图作为主要视觉参考，再填充 Seedance 长版提示词进入视频生产。
- 视频执行链：`video_generation` 已生成 `stylePreset → seedanceVideo → singleVideo → videoEditor`，自动填充 Seedance 长版提示词和 EP 相关参考图。
- 故事板图执行链：`storyboard_image_generation` 已生成 `stylePreset → img2imgAll/txt2img → singleImage`，自动填充故事板生成 Brief 和参考图。
- 无限画布导入：`image-studio-canvas.html` 已支持 `bridgeBase`，`runUrl` 打开后只导入并渲染工作流；是否点击 RUN 由用户在画布内手动决定。本轮已把 legacy workbench 默认端口统一为 `8877`，Bridge / bundled snapshot 会按当前 Bridge 端口动态重算 workflow `importUrl/editUrl/runUrl`，画布导入时 URL 参数 `bridgeBase` 优先覆盖 Workflow JSON 内嵌旧值，避免旧工作流继续打到过期 Bridge。
- 任务编排器：已加入 `compile-canvas-workflow` 子任务，按任务类型显示“生成资产图 Workflow / 基于资产图生成故事板 Workflow / 基于故事板生成视频 Workflow”的阶段化执行顺序。
- 画布输出回写：无限画布图片 / 视频节点生成或后台落盘后会调用 `POST /api/smart-vision/workflows/canvas-output`，自动回写 Workflow Registry / Artifact Registry / Review Ledger。
- 回写物化：Bridge 会根据 `outputArtifactHint` 与 `localPath` 把本地落盘文件复制到 `smart-vision/outputs`；目标已存在时自动生成时间戳版本路径，避免覆盖旧产物。
- 回写审计：回写记录写入 `artifact-registry.json.canvasOutputs / lastCanvasOutput` 和 `workflow-runner-ledger.events` 的 `canvas_output_registered`。
- 回写幂等：画布回写支持 `idempotencyKey`；重复回调返回 `idempotent`，不重复创建 artifact / review / canvasOutputs 记录。
- 回写失败诊断：本地源文件与目标 artifact 都不存在时记录 `canvas_output_file_missing` 失败，Runtime Diagnostics 会识别失败记录、文件缺失、workflow/review 丢失和重复 idempotencyKey。
- 回写可视化：Project Snapshot 已暴露 `canvasOutputs`，Runtime 面板已展示画布回写总数、异常数和最近 6 条回写记录，可直接打开 Artifact Preview；`exists=false` 或缺 artifactPath 会进入回写异常提示。
- Canvas failed retry UI：Runtime 面板最近画布回写记录已支持异常项“重试预览 / 重试回写”，真实写入前有确认保护，结果会进入最近操作摘要和详情卡。
- Runtime 摘要密度：Runtime 面板新增紧凑“最近操作摘要”条，汇总端到端自测、Pipeline Run、任务队列、压力自测、发布队列、发布自测、修复和归档结果。
- Pipeline Run Ledger：新增 `outputs/.smart-vision/pipeline-run-ledger.json`，记录工业流水线实例、阶段状态、阶段门禁、事件和当前推进位置。
- Pipeline Run API：已支持 `GET /api/smart-vision/pipeline/runs`、`POST /api/smart-vision/pipeline/runs/create`、`POST /api/smart-vision/pipeline/runs/advance`、`POST /api/smart-vision/pipeline/runs/smoke`、`POST /api/smart-vision/pipeline/runs/repair`。
- Pipeline Run 阶段闭环：创建流水线会自动生成首阶段 Workflow；画布输出回写会绑定阶段产物与 review；阶段 review done 会标记阶段完成并解锁 / 创建下一阶段 Workflow。
- Pipeline Run Diagnostics：Runtime Diagnostics 已纳入 pipeline-run-ledger 结构、阶段状态、阶段链路、workflow 关联、review 关联和 done 阶段产物 / 审核一致性检查。
- Pipeline Run 前端入口：Runtime 面板已支持刷新流水线、创建流水线实例、推进当前阶段、流水线 dry-run、修复预览和修复流水线，并显示当前阶段、阶段状态和阻塞原因。
- Pipeline Run 修复入口：已支持 dry-run 预览与真实写入，能规整重复 run、阶段 index / previous / next / current 指针、重建缺失阶段 workflow、重挂 review/artifact、重算阶段门禁、降级不一致 done 阶段并解锁下游。
- Pipeline Run 异常注入 smoke：已覆盖 pipeline-run-ledger 损坏、阶段 done 但产物缺失、阶段 review blocked、下游 workflow 丢失。
- 真实 Pipeline Run 全链路闭环：`pipeline-run-ep001-1778290049528` 已完成 asset_images、storyboard_images、videos、edit、qa、release 六阶段。
- 真实剪辑产物：`05-可选输出/审核剪辑发布/edit/ep001/pipeline-edit-output-smoke.mp4`，审核 done 后自动生成 QA Workflow `draft-qa-1778303373129`。
- 真实 QA 报告：`05-可选输出/审核剪辑发布/review/ep001/pipeline-qa-output-smoke.md`，审核 done 后自动生成 Release Workflow `draft-release-1778304322583`。
- 真实 Release manifest：`05-可选输出/审核剪辑发布/release/ep001/pipeline-release-manifest-smoke.json`，release package review done 后 release 阶段完成。
- 自动发布草稿：`release-ep001-auto-draft-qa-1778303373129` 已完成 `ready_for_review → approved → published`，publish gate 阻塞项为 0。
- Workflow 状态收敛：artifact review done 后会在同 workflow 产物审核全部完成时自动把 workflow 状态置为 `done` 并同步 `progress-ledger`。
- Release Registry 结构诊断：Runtime Diagnostics 已检查 releases / publishHistory / archiveHistory / restoreHistory 结构、重复 release、非法状态、artifactPaths 与 history 类型。
- Artifact Registry review 诊断：Runtime Diagnostics 已检查 pendingReviews / completedReviews / reviewHistory 结构、pending/completed 冲突、重复 reviewId、completed review 状态异常。
- task-run 报告诊断：Runtime Diagnostics 已检查 done / failed taskQueue 与 taskQueueRuns 的 reportPath 是否存在、是否可解析为安全路径。
- 后端发布包状态机：已禁止非法状态流转，release review 未完成禁止 approved，published 前强制检查 QA review done、Release review done、manifest exists、all artifacts exist、approved status。

## 3. 当前状态文件

必须优先恢复以下文件：

```text
smart-vision/outputs/.smart-vision/project-state.json
smart-vision/outputs/.smart-vision/progress-ledger.json
smart-vision/outputs/.smart-vision/workflow-registry.json
smart-vision/outputs/.smart-vision/artifact-registry.json
smart-vision/outputs/.smart-vision/review-ledger.json
smart-vision/outputs/.smart-vision/workflow-runner-ledger.json
smart-vision/outputs/.smart-vision/pipeline-run-ledger.json
smart-vision/outputs/.smart-vision/continuity-ledger.json
smart-vision/outputs/.smart-vision/release-registry.json
smart-vision/outputs/.smart-vision/state-operation-journal.json
smart-vision/outputs/.smart-vision/recovery-checkpoint.json
smart-vision/outputs/.smart-vision/handoff-report.md
```

注意：`release-registry.json` 已由 Release API 实测创建；当前 EP001 发布包已完成 `draft → ready_for_review → approved → published` 状态链路验证。

## 4. 最近验证结论

- `smart-vision/app` 最近一次构建已通过：`npm run build` → `✓ built`。
- 最近补齐 Release 发布前强门禁，并验证 release review 未完成时禁止 approved、全部门禁通过后允许 published。
- 最近补齐单个 Release 诊断修复入口，并验证 `POST /api/smart-vision/releases/repair` 返回 release、修复项、修复前后 publish gate 与 diagnostics。
- 最近补齐 Release 面板门禁分组展示，并通过 `npm run build` 验证。
- 最近补齐 Runner→Release 自动推进、发布队列、发布历史；已验证 QA done 幂等跳过已有 release、runtime repair 补齐旧发布历史、发布队列运行 API 正常返回。
- 最近补齐数据包结构化加载解析与任务编排器子任务生成；已验证 `video_generation` 解析 17 个引用、0 缺失、生成 5 个子任务，并编译落盘 Workflow Draft。
- 最近补齐任务编排落盘与 taskQueue 执行器；已验证 `video_generation` smoke taskPlan 写入 5 个 progress items / 5 个 taskQueue items，`workflows/tasks/queue/run` 连续消费后 5/5 done，并生成 task-runs 执行报告。
- 最近补齐 taskQueue 单项重入、单项运行和报告预览；已验证 `load-data-pack` 子任务按 `taskQueueId` 重新入队、单项运行后恢复 5/5 done，最新 task-runs 报告可通过 Artifact Preview 读取。
- 最近补齐发布失败项重新入队；已验证无 blocked 发布项时 `releases/publish-queue/requeue` 安全返回 0，有 blocked 项时会重新置为 queued。
- 最近补齐 Release 历史前端查看与发布队列单项操作；已验证 `GET /api/smart-vision/releases` 返回 publishHistory / archiveHistory / restoreHistory，`releases/publish-queue/run` 支持 releaseId 单项运行且无 queued 项时安全返回 0，`releases/publish-queue/requeue` 支持 releaseId 单项重入且无 blocked 项时安全返回 0。
- 最近补齐 taskQueue 执行报告结构化视图和 Release 发布失败路径 dry-run smoke；已验证 task-runs 报告仍可读取，`releases/publish-queue/smoke` 返回 `force_blocked → requeue_blocked → publish_attempt` 且不写真实发布包状态。
- 最近纠偏工业主链路；runtime smoke 默认从 `asset_image_generation` 起跑，先断言 `asset_image_generation → storyboard_image_generation → video_generation`，再验证当前阶段 Workflow Draft、画布回写、虚拟 taskQueue、Release dry-run 与 Diagnostics。
- 最近补齐命令行 smoke 脚本；已验证 `npm run smoke:runtime` 可临时启动 Bridge、完成 runtime smoke、输出摘要并自动关闭服务，最新结果为 `passed`。
- 最近补齐严格 smoke 脚本；已验证 `npm run smoke:runtime:strict` 返回 `passed` 且退出码为 0。
- 最近补齐 Runner Ledger 历史归档 API 与 Runtime 面板入口；已验证 compact dry-run 和默认真实写入均返回 ok，Diagnostics ready（0 issues）。
- 最近补齐 Runner 归档查看、诊断与修复反馈；已验证 runner status 返回 archiveSummary，runtime repair 返回 repairedRunnerArchiveCount，当前 Diagnostics ready（0 issues）。
- 最近补齐 Runner 反归档接口和前端恢复按钮；已验证从 `archives.taskQueue` 恢复单个归档任务项和 `restoreAll` 批量恢复，当前 taskQueue 5 个 done 项、archive task count 0、Diagnostics ready。
- 最近补齐任务队列压力自测；已验证 8 个任务计划、40 个虚拟子任务全部完成，结果 passed。
- 最近补齐压力测试参数入口；已验证 `video_generation / qa` 各 3 份，共 6 个任务计划、30 个虚拟子任务全部完成，结果 passed。
- 最近补齐 pressure / archive / repair / publish 高影响操作防误触；已验证 Runtime Repair dry-run、Release publish queue dry-run、Runner compact dry-run 均返回安全预览，前端真实写入操作已加确认。
- 最近补齐异常注入 smoke；已验证 release 未批准、manifest 缺失、artifact 文件缺失、Release review 未完成、QA review 未完成、runner archive bucket 损坏 / lastCompactedAt 非法 / active duplicate、taskQueue 依赖缺失、context pack 引用缺失、Runtime repair dry-run、Release publish queue dry-run 场景全部 passed。
- 最近补齐状态安全写入；已验证 `state-operation-journal.json` running / done 记录、`workflow-runner-ledger.json.bak` 与 `state-operation-journal.json.bak` 存在且 JSON 可解析，Diagnostics ready（0 issues）。
- 最近补齐并纠偏无限画布 Workflow Adapter；已支持 `asset_image_generation` 资产图 Workflow、`storyboard_image_generation` 基于资产图的故事板 Workflow、`video_generation` 基于故事板的 Seedance 视频 Workflow；`runUrl` 只导入并渲染画布工作流，不自动触发模型执行。
- 最近补齐画布输出自动回写；Bridge 新增 `POST /api/smart-vision/workflows/canvas-output`，可自动补登记 Workflow、物化本地文件、登记 artifact、创建 review，并在目标 artifact 已存在时自动版本化路径避免覆盖。
- 最近补齐 Pipeline Run 落盘与阶段门禁闭环；已验证真实创建 `pipeline-run-ep001-1778290049528`，自动生成 `02-工作流/ep001/draft-asset_image_generation-1778290049554.mjb-workflow.json`，推进后正确停在 `asset_images / waiting_output`，阻塞原因为 `stage_artifact_missing` 与 `stage_review_missing`。
- 最近补齐 Pipeline Run smoke；严格 Runtime smoke 已断言工业序列、资产图门禁、故事板门禁、视频工作流准备、Release dry-run 与 Diagnostics，结果通过。
- 最近补齐 Pipeline Run 异常注入；`npm run smoke:anomaly` 已新增并通过 pipeline-run-ledger 损坏、阶段 done 但产物缺失、阶段 review blocked、下游 workflow 丢失四类场景，且正常等待画布输出的真实 Pipeline Run 不触发 Diagnostics 误报。
- 最近补齐 Pipeline Run 阶段级修复入口；`POST /api/smart-vision/pipeline/runs/repair` 支持 dry-run 与真实写入。已对真实流水线执行一次修复写入，补齐 5 个下游 blocked 阶段的 `previous_stage_not_done` stageId 细节；随后再次 dry-run 返回 `repairCount: 0`，Diagnostics ready / 0 issues。
- 最近补齐 Workflow JSON preflight 契约校验；`asset_image_generation` 草案 preflight 返回 `passed / errors 0 / warnings 0`，异常 workflowDraft 能被识别为 `failed`；严格 runtime smoke 已新增 `workflow_preflight` passed，异常注入 smoke 已新增 `workflow_preflight_contract_violation` passed。
- 最近补齐 Canvas 输出幂等与失败诊断；独立 smoke workflow `draft-asset_image_generation-1778298423240` 连续两次相同回写，第一次 `registered`，第二次 `idempotent`，复用同一个 artifact 与 review；异常注入 smoke 已新增 `canvas_output_failure_and_duplicate` passed。
- 最近补齐 Canvas 输出失败恢复入口；`POST /api/smart-vision/workflows/canvas-output/retry` 支持按 `idempotencyKey` / `artifactPath` 定位 failed canvasOutput，先 dry-run 预览，再用补齐后的本地文件重新物化 artifact、复用 workflow/review 链路并恢复 Diagnostics。
- Canvas 输出 retry 已完成真实事故回放：先用缺失本地源文件制造 `canvas_output_failed / canvas_output_file_missing`，Diagnostics 降级；随后补文件 retry 返回 `registered`、复制到 `01-资产图与提示词/画布回写/retry-smoke.png` 并创建 review；再次 retry 返回 `idempotent`，Diagnostics 回到 ready / 0 issues。
- 最近补齐 Runtime 面板最近画布回写展示；Project Snapshot 新增 `canvasOutputs`，前端显示回写总数、异常数与最近 6 条记录，并复用 Artifact Preview 打开 artifactPath。
- 最近扩展异常注入 smoke；`npm run smoke:anomaly` 已新增并通过 release registry JSON 结构损坏、artifact registry pending/completed review 冲突、task-run 报告缺失三类场景，当前真实 Diagnostics 仍为 ready / 0 issues。
- 最近继续扩展状态源结构诊断；Runtime Diagnostics 已新增 Workflow Registry、Review Ledger、state-operation-journal 诊断，覆盖 workflow registry chains / duplicate / path / status / outputArtifacts，review ledger duplicate / status / missing workflow / orphan history，以及 state-operation-journal interrupted / duplicate running / missing id / invalid status。`npm run smoke:anomaly` 已新增 `workflow_registry_json_structure_corruption`、`review_ledger_history_corruption`、`state_operation_journal_interrupted` 并全部 passed，真实 Diagnostics ready / 0 issues。
- 最近补齐 Pipeline Run repair 写入 fixture；异常注入 smoke 新增 `pipeline_run_repair_write_fixture`，会备份当前 `pipeline-run-ledger`，插入损坏 run，执行 dry-run preview，再执行真实 repair 写入，验证 `events` 结构修复、重复 run 清理、阶段指针规整、done 状态降级和上游门禁恢复，最后恢复原 ledger。`npm run smoke:anomaly` 通过，cleanup 后 Diagnostics ready / 0 issues。
- 最近完成真实 Pipeline Run 资产图阶段联调：对 `pipeline-run-ep001-1778290049528` 的 `draft-asset_image_generation-1778290049554` 回写 `01-资产图与提示词/资产图/ep001/pipeline-asset-output-smoke.png`，审核 `artifact-draft-asset_image_generation-1778290049554-01--ep001-pipeline-asset-output-smoke-png-review` 置为 done 后，`asset_images` 阶段变为 done，`currentStageId` 变为 `storyboard_images`，并自动生成 / 挂载 `draft-storyboard_image_generation-1778301596146`。
- 新生成的故事板 Workflow `draft-storyboard_image_generation-1778301596146` 已通过 `POST /api/smart-vision/workflow-draft/preflight` 校验，结果 `passed / errors 0`；真实 Diagnostics ready / 0 issues。
- 最近完成真实 Pipeline Run 故事板阶段联调：对 `draft-storyboard_image_generation-1778301596146` 回写 `01-资产图与提示词/故事板/storyboard/ep001/pipeline-storyboard-output-smoke.png`，审核 `artifact-draft-storyboard_image_generation-1778301596146-01--storyboard-ep001-pipeline-storyboard-output-smoke-png-review` 置为 done 后，`storyboard_images` 阶段变为 done，`currentStageId` 变为 `videos`，并自动生成 / 挂载 `draft-video_generation-1778302161828`。
- 新生成的视频 Workflow `draft-video_generation-1778302161828` 已通过 `POST /api/smart-vision/workflow-draft/preflight` 校验，结果 `passed / errors 0`。本次还补了 workflow 状态同步 progress-ledger 的代码，修复 canvas output 后 workflow waiting_review 但 progress item 仍 todo 的 mismatch；真实 Diagnostics ready / 0 issues。
- 最近完成真实 Pipeline Run 视频阶段联调：对 `draft-video_generation-1778302161828` 回写 `03-视频/ep001/pipeline-video-output-smoke.mp4`，审核 `artifact-draft-video_generation-1778302161828-03--ep001-pipeline-video-output-smoke-mp4-review` 置为 done 后，`videos` 阶段变为 done，`currentStageId` 变为 `edit`，并自动生成 / 挂载 `draft-edit-1778302819995`。
- 新生成的剪辑 Workflow `draft-edit-1778302819995` 已通过 `POST /api/smart-vision/workflow-draft/preflight` 校验，结果 `passed / errors 0`；真实 Diagnostics ready / 0 issues。
- 最近完成真实 Pipeline Run 剪辑阶段联调：对 `draft-edit-1778302819995` 回写 `05-可选输出/审核剪辑发布/edit/ep001/pipeline-edit-output-smoke.mp4`，审核 done 后 `edit` 阶段完成，并自动生成 / 挂载 QA Workflow `draft-qa-1778303373129`。
- 最近完成真实 Pipeline Run QA 阶段联调：QA 输出回写 `05-可选输出/审核剪辑发布/review/ep001/pipeline-qa-output-smoke.md` 后创建 `qa_review`；审核 done 后 `qa` 阶段完成，并自动生成 / 挂载 Release Workflow `draft-release-1778304322583` 与自动发布草稿 `release-ep001-auto-draft-qa-1778303373129`。
- 最近完成真实 Pipeline Run Release 阶段联调：Release workflow preflight `passed / errors 0`；回写 `05-可选输出/审核剪辑发布/release/ep001/pipeline-release-manifest-smoke.json` 后自动绑定 release package 的 manifestPath、reviewId 和 sourceWorkflowIds；release review done 后 Pipeline Run 状态变为 `done`。
- 自动发布包 `release-ep001-auto-draft-qa-1778303373129` 已完成 `ready_for_review → approved → published`，publish gate blockers 为 0；Runtime Diagnostics ready / 0 issues。
- 最近修正 artifact review side effects：产物审核全部 done 后，对应 workflow 会自动收敛为 `done`，并同步 progress item，避免闭环完成后仍残留 `progress_workflow_status_mismatch`。
- 最近补齐 Runtime 面板 Canvas failed 输出 retry 入口：最近画布回写异常项可直接执行 retry dry-run 预览或确认后真实重试回写；真实 API 回放已验证 missing local file failed → preview retryable → 补文件 retry registered → review done → Diagnostics ready。
- 最近收敛 Runtime 面板摘要密度；新增最近操作摘要条，保留下方详细卡片，`npm run build` 与 `npm run smoke:runtime:strict` 通过。
- 最近补齐真实画布导入入口硬化：`scripts/run-legacy-workbench.sh` 默认端口统一为 `8877`；Bridge Snapshot 与 bundled snapshot 会动态注入当前 `bridgeBase` 并重算 workflow 导入 / 编辑 / 运行 URL；Workflow Registry importCheck 使用动态 URL 校验；前端 Canvas 状态展示 Bridge base；画布导入时 URL 参数 `bridgeBase` 优先于 Workflow JSON 内嵌旧值。已验证 `8877` 画布入口返回 200，当前 Bridge `5199` 可读取 release workflow artifact，release workflow importCheck ok。
- 最近补齐 Canvas import smoke 固化：新增 `app/scripts/canvas-import-smoke.mjs`、`npm run smoke:canvas-import` 与 `npm run smoke:canvas-import:live`，自动检查 legacy 默认端口、画布 `bridgeBase` 优先级、动态 Bridge URL、workflow import/edit/run URL、importCheck、artifact read 和 `8877` live 页面。
- 最近补齐浏览器级画布导入探针：画布页面暴露 `window.__SMART_VISION_IMPORT_PROBE__`，`npm run smoke:canvas-import:browser` 会启动 Chrome headless 打开真实 `8877` runUrl，验证浏览器 JS、跨端口 Bridge fetch、workflow 导入和画布节点加载。
- 最近修复平台 workflow 在画布中空白的问题：legacy 画布新增 `contextPack / artifactInput / workflowBuilder / phaseGate` 节点定义与只读渲染，Release / QA 这类非模型阶段 Workflow 可正常显示。已验证 `draft-release-1778304322583` 导入后 `nodes 4 / conns 3`。
- 最近补齐生产就绪总控面板：前端首页新增一屏聚合视图，展示 Bridge 数据源、Pipeline Run 阶段、Release 发布门禁、Canvas 回写异常、Workflow importCheck 与 smoke 结果，并提供端到端自测、流水线 dry-run、发布异常自测和打开画布快捷入口；UI 背景收敛为更克制的工作台风格。
- 最近继续补齐生产就绪总控当前画布执行位：展示当前阶段 Workflow、导入可用性、节点 / 连线数、workflowPath、回写目标和阶段 blocker，并提供“导入执行 / 编辑画布 / 查看 JSON”入口。
- 最近补齐生产就绪总控 canvas-output 首次回写入口：填写真实画布 RUN 后本地文件路径、目标 artifactPath / outputArtifactHint 和可选 idempotencyKey，可先 dry-run 预览，再确认写入；确认写入走 `POST /api/smart-vision/workflows/canvas-output` 并登记 artifact/review、推进 Pipeline Run。
- 最近补齐 canvas-output register smoke：新增 `app/scripts/canvas-output-smoke.mjs` 与 `npm run smoke:canvas-output`，验证真实文件写入、canvas-output register、Artifact Preview 和 Diagnostics ready。
- 最近补齐生产就绪总控 Pipeline 操作入口：刷新流水线、创建实例、推进阶段、修复预览可从总控面板直接触发。
- 最近补齐生产就绪总控 canvas-output 回写防错：回写表单支持当前阶段输出目标预设选择、复制回写 JSON，写入结果可直接打开产物预览。
- 最近补齐 Canvas RUN Session Ledger：新增 `canvas-run-ledger.json`、RUN 会话 start/status API、canvas-output 回写自动绑定 RUN 会话、review done 自动闭合 RUN 会话；生产就绪总控可展示画布 RUN 会话统计、当前会话并创建 RUN 会话。
- 最近补齐 Canvas RUN Ledger Diagnostics：Runtime Diagnostics 覆盖 sessions/events 结构、重复 session、非法状态、workflow 缺失、artifact 文件缺失、review 缺失和 canvasOutput 关联缺失；异常注入 smoke 新增 `canvas_run_ledger_corruption`。
- 最近完成产品主流程收敛：默认 UI 已改为导入剧本 / 参考图片、剧本编辑框、开始创作；点击后进入链式智能画布，按剧集规划、分镜表、资产卡、资产生成、故事板生成、视频生成展示结果和确认动作；工程面板全部折叠到高级维护区。
- 最近完成 canvas-next 迁移：`smart-vision/canvas/legacy-workbench/workbench-web/image-studio-canvas.html` 已替换为根工程新画布，保留 Smart Vision `workflowPath + bridgeBase` 导入、旧 artifact URL 重写和浏览器导入探针。
- 最近完成剧本驱动 creative/start：`POST /api/smart-vision/creative/start` 会生成剧本源、分镜表、资产卡、资产索引、Seedance 视频提示词和 creative-plan，登记 Artifact Registry，并创建 Pipeline Run 第一阶段资产图 Workflow；前端开始创作已调用该接口，链式智能画布前置卡片读取真实分镜表 / 资产卡结果。
- 最近修复 Pipeline stage workflow episodeId 丢失：`preparePipelineStageWorkflow` 现在会把 taskPlan 生成的 workflowDraft 传入 `saveWorkflowDraft`，非 `ep001` 的工作流正确落入 `02-工作流/{episodeId}/`。
- 最近完成智能画布 canvas-next 节点交互收敛：链式智能画布使用 canvas-next 单图节点风格的暗色点阵背景、细边框预览卡、胶囊标签、节点工具浮层和流光连接线；半自动模式运行中只显示取消，完成后显示编辑 / 下一步，点击下一步才展开下一卡；全自动模式隐藏人工按钮并自动展开下一节点。主入口开始创作现在强制创建当前剧本的新 Pipeline Run，避免复用旧 `ep-smoke2` run；摘要区只在当前卡片对应资产图 / 故事板 / 视频 Workflow 时显示“打开画布执行”。
- 最新验证：`node --check app/scripts/bridge-server.mjs`、`npm run build`、`POST /api/smart-vision/creative/start` actual write smoke、`npm run smoke:runtime:strict`、`npm run smoke:canvas-import:browser` 全部通过，Diagnostics ready / 0 issues。
- 最新 UI 验证：`npm run build` 通过；浏览器打开 `http://127.0.0.1:5178/?ui=2` 后，开始创作顶部显示 `ep001`，第一张卡完成后点击下一步才出现第二张卡与流光连接线，非 Workflow 前置卡片不显示画布执行入口。
- 2026-05-15 新增并纠偏智能视界 Canvas v2 独立入口：`smart-vision/canvas/legacy-workbench/workbench-web/smart-vision-canvas-v2.html`。该文件不再使用上一版 `.sv-node` 自定义节点体系，已改为与 canvas-next 无限画布同构的 `.app / .topbar / .toolbar / .stage / .world / .node / .node-label / .ports / .preview-card / .conn-svg / .statusbar` 结构；节点视觉、端口、流光连线、画布拖拽、缩放、适配视图、节点拖拽和 resize 均沿用无限画布操作习惯。智能差异只在节点类型和 `quickDownstream` 数据传导逻辑：半自动完成后点击下一步生成并连接下游节点，自动模式隐藏编辑 / 下一步并自动串行跑完整链路，手动模式保留自定义编排。未修改上游 `tools/workbench-web/image-studio-canvas-next.html`，也未修改封板版 `smart-vision/canvas/legacy-workbench/workbench-web/image-studio-canvas.html`。
- v2 验证：内联脚本语法检查通过；`PORT=8877 scripts/run-legacy-workbench.sh` 重启后 runtime copy 已同步；`http://127.0.0.1:8877/tools/workbench-web/smart-vision-canvas-v2.html` 和原 `/image-studio-canvas.html` 均返回 200；浏览器验证半自动模式可完成第一节点并点击下一步生成/连接风格预设节点，自动模式可从剧本输入跑到发布包共 12 个节点 / 11 条连线；顶部“无限画布”Tab 可加载原无限画布 iframe。
- 2026-05-16 修正智能视界系统边界：智能视界不是漫剧创作库单一专用系统，而是可挂载不同创作库数据包的 SaaS 可视化操作平台。当前 active data pack 是 `漫剧创作库`，所以当前必须按该包 agents / docs / skills / templates / wordlists / tools / data / projects 执行；后续后台下发广告创意、电商商品图、电影、自媒体商业宣传片等创作库时，智能画布必须按被选中数据包自己的 Agent 流水线、Skill、模板、词库和交付物执行。v2 前端与 Bridge plannerContract 已改为 active data pack aware，校验仍禁止 mock / seed / 固定链路兜底，但不再把 Agent 角色硬编码为漫剧包角色。
- 2026-05-16 继续落地 active data pack registry：新增 `outputs/.smart-vision/data-pack-registry.json`，默认 active 为 `manju-creation-library`，并登记 15 个只读根目录；Bridge 新增 `GET /api/smart-vision/data-packs`、`POST /api/smart-vision/data-packs/select`、`POST /api/smart-vision/data-packs/register`，`context-pack` 与 `data-pack/runtime` 支持 `activeDataPackId`；v2 顶栏新增“创作库”选择器并把当前 pack 带入 runtime 请求。严格 smoke 已确认 15 roots / 626 files / 616 references / 0 missing refs。
- 同步修复 active pack 中 `docs/blocking-camera-geometry.schema.json` 非法 JSON 字符串；任务队列 strict smoke 只在引用缺失/不可用时阻断 `load-data-pack`，普通 parse warning 不再误伤正常任务队列。`npm run build`、`npm run smoke:runtime:strict`、`npm run smoke:anomaly` 均通过。
- 2026-05-16 打通后台数据包同步：后台管理系统新增文件型 data pack registry 与 `/api/data-packs`、`/api/admin/data-packs` 系列接口；Smart Vision Bridge 新增 `POST /api/smart-vision/data-packs/sync`，支持用 canvas-next 共用登录 token 从后台同步数据包，并支持 `dryRun` 预览；v2 顶栏“创作库”区域新增 `↻` 同步按钮。当前后台 registry 与 Smart Vision 本地 registry 均为 `manju-creation-library` active。
- v2 输出展示继续收敛：支持 `active_pack_deliverable`、`customerDeliverable`、`readableDeliverable`、`output.items`，节点面板默认展示用户可读交付物；后台 JSON / workflow 参数仅保留在内部数据链路。
- 2026-05-16 继续补齐 Data Pack 管理与交付物契约：后台管理端新增“创作库数据包”页面，可查看、注册、编辑和切换 active pack；后台 data pack API、Smart Vision Bridge runtime 与 v2 prompt schema 已统一补齐 `capabilities / metadata / outputKinds / requiredOrder`。v2 现在按当前 active data pack 生成 `userDeliverable.kind` 约束，不再只使用漫剧固定交付物枚举；新增 `npm run smoke:smart-canvas-v2` 验证 v2 source/runtime copy、plannerContract 和 workflow JSON 内部化规则。
- 2026-05-16 继续接入 Canvas v2 真实执行契约：v2 剧本输入节点会先走 active data pack LLM 动态规划，再调用 `POST /api/smart-vision/creative/start` 创建真实创作输入包、Pipeline Run 和首阶段 Workflow；导入图片 / 文本 / md 时，Bridge 会把原文件物化到 `outputs/04-输入资料/{importId}/imports/` 并回填 artifactPath；工作流类节点保存 Workflow Draft 后自动创建 Canvas RUN Session，点击编辑会进入无限画布。节点用户输出继续展示可读交付物入口，workflow JSON / RUN session / dynamicPlan 保留为内部数据。
- 本轮验证：`node --check app/scripts/bridge-server.mjs`、`npm run build`、`npm run smoke:smart-canvas-v2`、`npm run smoke:runtime:strict`、`npm run smoke:anomaly` 全部通过；8877 v2 页面 HTTP 200。浏览器插件未拿到 Codex browser pane，因此未完成交互级截图验证。
- 2026-05-16 继续补齐 Canvas v2 浏览器级 smoke 与参考图传导：新增 `npm run smoke:smart-canvas-v2:browser`，headless Chrome 打开 8877 v2 页面并通过 `?probe=1` 验证半自动 3 节点 / 2 连线、自动 12 节点 / 11 连线全部 success；探针仅用于 smoke，不影响真实执行路径。Bridge `saveWorkflowDraft` 现在会根据 v2 metadata 的 `inputArtifacts / referenceImages / outputArtifacts / episodeId` 构建 taskPlan，导入图片 artifactPath 会进入资产图 Workflow Draft 的 `canvasExecution.referenceImages`。
- 最新验证：`npm run build`、`npm run smoke:smart-canvas-v2`、`npm run smoke:smart-canvas-v2:browser`、`npm run smoke:runtime:strict`、`npm run smoke:anomaly` 全部通过；`smoke:smart-canvas-v2` 已断言 `04-输入资料/smart-canvas-v2-ref-smoke/imports/01-reference.png` 进入 referenceImages。
- 2026-05-16 继续补齐 Canvas v2 多数据包切换验证：`npm run smoke:smart-canvas-v2` 新增 `smart_canvas_v2_data_pack_switch`，注册 `sv-smoke-ad-creative-pack` 广告创意测试包，切换 active pack 后校验 plannerContract 的 `outputKinds / requiredOrder / userDeliverableRule` 来自广告包，且不泄漏漫剧 `adapted_script` 交付物；验证结束后自动恢复 `manju-creation-library` active。
- 2026-05-16 继续补齐 Canvas v2 主入口真实写入 smoke：新增 `app/scripts/smart-canvas-v2-entry-smoke.mjs` 与 `npm run smoke:smart-canvas-v2:entry`，用长剧本文本和参考图走 `creative/import → creative/start → 首阶段资产图 Workflow → Workflow Preflight → Canvas RUN Session → canvas-output 回写 → asset review done`，并断言 Pipeline Run 自动推进到 `storyboard_images / workflow_ready`。
- 2026-05-16 继续扩展 Canvas v2 主入口 smoke 到故事板阶段：`npm run smoke:smart-canvas-v2:entry` 现在覆盖资产图回写审核和故事板图回写审核，并断言视频 Workflow 自动解锁。同步修复 `createNextWorkflowFromReview` 下游 Workflow 缺少当前 `episodeId` 的问题，故事板 / 视频 Workflow 会落到当前 `02-工作流/{episodeId}/`。
- 2026-05-16 继续扩展 Canvas v2 主入口 smoke 到视频阶段：`npm run smoke:smart-canvas-v2:entry` 现在覆盖视频 Workflow preflight、视频 RUN 会话、真实 mp4 产物 canvas-output 回写、`video_review done`，并断言剪辑 Workflow 自动解锁且路径继承当前 `episodeId`。
- 2026-05-16 修复 Canvas 输出联动 Pipeline Run 的跨 run 误绑定：`attachCanvasOutputToPipelineRuns` 现在会按 `workflow.pipelineRunId / pipelineStageId` 严格限定目标 run/stage；`createNextWorkflowFromReview` 优先按 source workflow 的 `pipelineRunId` 精确定位 source run，避免旧 run 阶段抢占当前 workflow。
- 2026-05-16 新增跨 run / 跨 stage 误绑定诊断与修复：Runtime Diagnostics 已识别 `pipeline_stage_workflow_run_mismatch` / `pipeline_stage_workflow_stage_mismatch`，Pipeline Run Repair 可摘除错误绑定并按当前阶段重建 workflow。本轮已实际修复历史 smoke 留下的 2 个错配，修复后 Diagnostics ready / 0 issues。
- 2026-05-16 继续扩展 Canvas v2 主入口 smoke 到完整 Pipeline Run done：`npm run smoke:smart-canvas-v2:entry` 现在覆盖资产图、故事板、视频、剪辑、QA 和 Release manifest 六段回写审核，并断言最终 Pipeline Run `status=done`。最新验证生成 `ep-v2-entry-1778928166193`，Release manifest 写入 `05-可选输出/审核剪辑发布/release/ep-v2-entry-1778928166193/smart-canvas-v2-entry-release-manifest.json`，自动绑定 release package `release-ep-v2-entry-1778928166193-auto-draft-qa-1778928170769`，Diagnostics ready / 0 issues。
- 2026-05-16 修正 Release publish-gate 诊断噪声：Runtime Diagnostics 现在只在 release 已 approved/published 或发布队列存在 queued/running/blocked 发布意图时报告 publish gate blocker；正常 `ready_for_review` 待审包不再触发 `release_status_not_approved`，避免入口 smoke 完成后 Diagnostics 被误降级。
- 2026-05-16 继续收敛 Canvas v2 输出详情交付物入口：输出详情图片 / 视频 artifactPath 统一走 workbench `/read?path=...&raw=1` 只读入口，避免相对路径直接 404；`npm run smoke:smart-canvas-v2:browser` 新增 output detail probe，覆盖节点“查看/编辑”输出、保存交付物同步、Workflow 节点“进入无限画布查看/执行”和媒体缩略图 `/read` 路径。
- 2026-05-16 继续收敛 Canvas v2 默认交付物结构：在后台真实结果暂不可用、浏览器探针或自定义编排 fallback 时，节点不再把内部 JSON 作为用户主输出；剧集规划、导演讲戏、分镜表、资产卡、资产图、故事板、视频、QA、Release 都会生成面向用户的结构化交付物摘要。未真实渲染的图片 / 视频只显示预期路径，不生成破图缩略图；workflow JSON、RUN session、dynamicPlan 继续留在内部数据链路。
- 2026-05-16 继续把交付物质量纳入浏览器级 smoke：`npm run smoke:smart-canvas-v2:browser` 新增 `runDeliverableQuality`，完整跑 12 节点后检查 9 类核心节点交付物 kind、条目数量、详情页关键词、媒体 src 与内部字段泄漏，防止用户输出区退回 JSON / workflow 参数。
- 2026-05-16 修复 Workflow Draft 参考图排序：`collectCanvasWorkflowSources` 对当前 taskPlan 显式输入的 input/reference artifacts 加权，用户刚导入的参考图会优先进入 `canvasExecution.referenceImages`，不会被历史故事板图挤出前 8 个参考图。
- 最新验证：`node --check app/scripts/bridge-server.mjs`、`node --check app/scripts/smart-canvas-v2-entry-smoke.mjs`、`node --check app/scripts/smart-canvas-v2-smoke.mjs`、v2 inline scripts、`npm run build`、`npm run smoke:smart-canvas-v2`、`npm run smoke:smart-canvas-v2:entry`、`npm run smoke:smart-canvas-v2:browser`、`npm run smoke:runtime:strict`、`npm run smoke:anomaly` 全部通过；最新 entry smoke 生成 `ep-v2-entry-1778932458375`，最终 Pipeline Run `done`，Diagnostics ready / 0 issues；浏览器 smoke summary 为 `assisted 3/2; auto 12/11; output detail ok; deliverables 9`；状态 JSON 解析检查全部通过。
- 当前服务：4000 后台 API、5188 Smart Vision Bridge、8877 静态工作台均已监听；4000 与 5188 是当前 Codex 会话中的前台服务 session。
- 当前不要继续主动生成业务视频或发布包，除非是功能测试需要。

## 5. 下一步开发优先级

1. 用真实浏览器人工验收智能画布主入口，重点检查用户长剧本下的节点输出文本质量、编辑返回、Workflow 打开与回写按钮状态。
2. 继续 UI 联调：检查 Runtime 面板 retry、Pipeline Run、Release、生产就绪总控 RUN 会话、回写目标预设和复制 JSON 在真实数据下的交互一致性。
3. 后续按业务数据包扩展交付物渲染 schema，保证广告创意、电商商品图、电影等数据包能展示各自的用户交付物，而不是平台内部参数。

## 6. 换机恢复步骤

```text
1. 打开工作区根目录：漫剧创作库
2. 读取 docs/project-memory-system.md
3. 读取 docs/workspace-status.md
4. 读取 docs/pipeline-sync-log.md 最近智能视界记录
5. 读取 smart-vision/README.md
6. 读取 smart-vision/docs/README.md
7. 读取 smart-vision/docs/planning/implementation-roadmap.md
8. 读取 smart-vision/docs/architecture/platform-architecture.md
9. 读取 smart-vision/outputs/.smart-vision/project-state.json
10. 读取 smart-vision/outputs/.smart-vision/recovery-checkpoint.json
11. 读取 smart-vision/outputs/.smart-vision/canvas-run-ledger.json
12. 读取 smart-vision/outputs/.smart-vision/data-pack-registry.json
13. 读取本文件 handoff-report.md
14. 进入 smart-vision/app 后安装依赖并运行 npm run build 验证
```
