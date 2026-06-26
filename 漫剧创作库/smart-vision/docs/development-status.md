# 智能视界开发状态

更新时间：2026-05-16 19:08

## 当前定位

智能视界是 `smart-vision/` 下的独立平台工程，目标是把不同创作库数据包的工业化流程产品化为本地优先、可视化、可审核、可恢复的 AIGC 生产 Runtime。当前 active data pack 是 `漫剧创作库`，但系统边界不是单一漫剧项目，后续应支持后台下发并切换广告创意、电商商品图、电影、自媒体商业宣传片等定制创作库。

当前用户要求：先完成平台功能开发，不急于生成最终业务产物。

## 当前完成度

已完成到平台 Runtime 管理层：

- 独立工程目录：`smart-vision/`
- 独立输出边界：`smart-vision/outputs/`
- 工程状态源：`smart-vision/outputs/.smart-vision/`
- Bridge 服务：`smart-vision/app/scripts/bridge-server.mjs`
- 前端主界面：`smart-vision/app/src/App.tsx`
- API 封装：`smart-vision/app/src/data/api.ts`
- 类型定义：`smart-vision/app/src/types.ts`
- Workflow Registry
- Artifact Registry
- Review Center
- Workflow Runtime
- Runtime Diagnostics
- Runtime Repair
- Queue Run
- Retry Failed
- Replay Chain
- Release Registry 代码链路
- Release Diagnostics
- Release Registry Panel
- Release 合法状态流转保护
- 发布包后端状态机
- blocked review 禁止 approved
- published 前 manifest / artifact 文件存在校验
- 发布前强门禁：QA review done + release review done + manifest exists + all artifacts exist + approved status
- Release 面板可发布状态与阻塞原因展示
- Release API 端到端实测
- 单个 Release 诊断修复入口
- Release 面板单项修复按钮与修复结果展示
- Release 面板 QA 审核 / Release 审核 / Manifest 与 Artifact 文件门禁分组展示
- Runner → Release 自动推进：QA review done 自动创建 release draft
- Release approved 自动进入发布队列
- 发布队列运行 API 与 Runtime 面板最小入口
- Published 发布历史 / Archived 归档历史 / Restored 恢复历史记录
- 数据包结构化加载解析：docs / skills / templates 引用解析、标题摘要抽取、缺失引用显式暴露
- Active Data Pack Registry：`outputs/.smart-vision/data-pack-registry.json`
- 数据包 API：`GET /api/smart-vision/data-packs`、`POST /api/smart-vision/data-packs/select`、`POST /api/smart-vision/data-packs/register`
- 任务编排器增强：基于数据包解析结果生成子任务、依赖顺序、验收标准和阻塞状态
- 任务编排器任务落盘：subtasks 写入 progress-ledger
- 任务编排队列写入：taskPlans / taskQueue 写入 workflow-runner-ledger
- 任务队列执行器：按依赖消费 taskQueue，更新 progress 状态，写入 task-runs 执行报告
- taskQueue 单项重新入队 / 单项运行 API
- Runtime 面板 taskQueue 报告查看、单项重入、单项运行入口
- 发布队列失败项重新入队 API 与 Runtime 面板入口
- 发布队列按 releaseId 单项运行 API 与 Runtime 面板入口
- Release 面板发布 / 归档 / 恢复历史查看入口
- taskQueue 执行报告结构化视图
- Release 发布队列失败路径 dry-run smoke API 与 Runtime 面板入口
- Runtime 一键端到端 smoke API：数据包 → 任务计划 → 虚拟 taskQueue → Release dry-run → Diagnostics
- Runtime 面板端到端自测入口
- 命令行端到端 smoke 脚本：`npm run smoke:runtime`
- CI 严格模式 smoke 脚本：`npm run smoke:runtime:strict`
- 输出产物缺失修复：已补齐 `outputs/04-storyboard/ep001-storyboard.md`，并将 `04-storyboard` 纳入 Bridge 产物扫描根
- Runner Ledger 历史归档 API：已支持 taskQueue / releasePublishQueue / runs / events 裁剪归档
- Runtime 面板操作分组：诊断与自测、任务执行、发布队列、维护
- Runner archiveSummary：Runtime 状态已返回归档计数、最近归档任务 / 发布 / Run / event
- Runner archive 诊断与修复：Diagnostics 检查 archives 结构，Repair 可规整损坏 archive bucket
- Runner archive 细项恢复：已支持按 bucket / itemId 从 archives 恢复 taskQueue、releaseQueue、runs、events
- taskQueue 压力自测：已支持批量任务计划 dry-run，验证虚拟依赖调度能力
- Runner archive 批量恢复：已支持 `restoreAll` 批量恢复 archive bucket
- Runtime 面板压力测试参数配置：已支持配置 taskTypes 与 copies
- 高影响操作防误触：pressure / archive / repair / publish 已补确认弹窗或 dry-run preview
- Runtime Repair dry-run：`POST /api/smart-vision/workflows/runtime/repair` 已支持 `{ "dryRun": true }`
- Release 发布队列 dry-run：`POST /api/smart-vision/releases/publish-queue/run` 已支持 `{ "dryRun": true }`
- Runtime 面板 dry-run 预览：已补修复预览、归档预览、发布预览结果卡
- 异常注入 smoke：已支持 release 未批准、manifest 缺失、artifact 缺失、QA review 未完成、Release review 未完成、runner archive 损坏、taskQueue 依赖缺失、context pack 引用缺失、repair dry-run、publish queue dry-run 断言
- 状态安全写入：关键 `.smart-vision/*.json` 已改为 tmp 写入、JSON 校验、原子 rename、`.bak` 备份
- 写入串行锁：Bridge 进程内同一 JSON 文件写入已串行化，避免前端重复点击造成同文件覆盖
- 操作 journal：高影响写入已记录到 `state-operation-journal.json`，包含 running / done / failed
- 中断诊断：Runtime Diagnostics 已能识别超时未完成的 `state_operation_interrupted`
- 真实执行器边界已收敛为无限画布 Workflow Adapter：平台不另建模型执行器服务，只负责编译画布工作流、填充提示词 / 参考图 / 输出路径，并提供编辑与执行入口
- 自动执行器定义已纠偏：底层能力是“自动生成 Workflow JSON + 按流程填入提示词 / 参考图 / 输出路径 + 按策略进入画布工作流”，不是平台侧直接调用模型
- Workflow Draft 已带 `canvasExecution`：包含 `executor=infinite_canvas`、`workflowMode`、`editUrl`、`runUrl`、`promptCount`、`referenceImageCount`、提示词来源和参考图来源
- `canvasExecution.strategy` 已明确 `carrier=workflow_json`、`directModelExecution=false`、`modelInvocation=never_direct_from_smart_vision`
- 无限画布 URL 导入已支持 `bridgeBase`：`runUrl` 打开后只导入并渲染工作流，是否点击 RUN 由用户在画布内手动决定
- legacy workbench 默认端口已统一为 `8877`，与 Bridge / 前端默认 canvasUrl 对齐
- Bridge Snapshot 与 bundled snapshot 已按当前 Bridge 端口动态重算 workflow `importUrl/editUrl/runUrl` 和 `importCheck`
- 画布导入时 URL 参数 `bridgeBase` 已优先于 Workflow JSON 内嵌旧值，避免旧工作流打到过期 Bridge
- 工业主链路已纠偏为 `asset_image_generation → storyboard_image_generation → video_generation → edit → qa → release`
- `asset_image_generation` 会生成 `stylePreset → txt2img/img2imgAll → singleImage`，并把角色 / 场景 / 道具资产 Brief、资产索引、风格约束和资产图输出目录写入节点
- `storyboard_image_generation` 明确依赖资产图 / asset-index，生成故事板图后才允许进入视频 Workflow
- `video_generation` 明确依赖故事板图作为主要视觉参考，再填充 Seedance 长版提示词进入视频生产
- 新增工业流水线计划接口：`POST /api/smart-vision/workflows/pipeline/plan`，返回资产图、故事板、视频、剪辑、QA、Release 的任务计划序列和依赖边
- `video_generation` 会生成 `stylePreset → seedanceVideo → singleVideo → videoEditor`，并把 Seedance 长版提示词和 EP 当前分镜 / 角色参考图写入节点
- `storyboard_image_generation` 会生成 `stylePreset → img2imgAll/txt2img → singleImage`，并把故事板图生成 Brief 与参考图写入节点
- 任务编排器已加入 `compile-canvas-workflow` 子任务，按任务类型显示“生成资产图 Workflow / 基于资产图生成故事板 Workflow / 基于故事板生成视频 Workflow”的阶段化执行顺序
- 无限画布执行结果回写：图片 / 视频节点生成或后台落盘后会调用 `POST /api/smart-vision/workflows/canvas-output`
- Canvas Output Bridge：可自动登记缺失 Workflow、复制本地落盘文件到 `smart-vision/outputs`、写入 Workflow Registry / Artifact Registry / Review Ledger，并创建产物审核
- Canvas 输出防覆盖：当目标 artifact 已存在且来源文件不同，回写会自动生成时间戳版本路径，避免覆盖旧产物
- Canvas 输出幂等：回写已支持 `idempotencyKey`，相同 workflow/node/artifact 的重复回调会返回 `idempotent`，不会重复创建 artifact/review/canvasOutputs
- Canvas 输出失败控制：本地源文件和目标 artifact 都不存在时会记录 `canvas_output_file_missing` 失败，不推进 Workflow output、Review 或 Pipeline stage
- Canvas Output Diagnostics：Runtime Diagnostics 已检查 canvasOutputs 结构、失败记录、文件缺失、workflow/review 丢失和重复 idempotencyKey
- Runtime smoke 已加入 `canvas_output_writeback` dry-run 断言，验证画布输出能回到平台状态层
- Project Snapshot 已暴露 `canvasOutputs`：前端可读取 Artifact Registry 最近画布回写记录
- Pipeline Run Ledger：新增 `outputs/.smart-vision/pipeline-run-ledger.json`，用于记录工业流水线实例、阶段状态、阶段门禁、事件和当前推进位置
- Pipeline Run API：已支持创建流水线实例、推进当前阶段、读取流水线列表和 dry-run smoke
- Pipeline Run 修复 API：已支持 dry-run 预览与真实写入，能规整重复 run、阶段指针、当前阶段、缺失 workflow、review/artifact 关联和阶段门禁
- Pipeline Run 阶段门禁：资产图、故事板、视频、剪辑、QA、Release 按上游阶段完成、产物回写、审核完成和发布门禁逐段解锁
- Pipeline Run Diagnostics：Runtime Diagnostics 已纳入 pipeline-run-ledger 结构、阶段状态、阶段链路、workflow 关联、review 关联和 done 阶段产物 / 审核一致性检查
- Canvas 输出联动 Pipeline Run：画布回写 artifact 后自动把产物路径和 reviewId 绑定到对应阶段，并进入 `waiting_review`
- Review 联动 Pipeline Run：阶段审核 done 后自动标记当前阶段完成，并解锁 / 创建下一阶段 Workflow
- Artifact review side effects：同一 workflow 的产物审核全部 done 后，workflow 自动收敛为 `done` 并同步 progress item
- 真实 Pipeline Run 全链路闭环：`pipeline-run-ep001-1778290049528` 已完成 asset_images、storyboard_images、videos、edit、qa、release 六阶段并进入 `done`
- 真实 Release workflow 联动：QA review done 自动生成 `draft-release-1778304322583`，Release manifest 回写后自动绑定 release package manifest / reviewId / sourceWorkflowIds
- 自动发布包实测：`release-ep001-auto-draft-qa-1778303373129` 已完成 `ready_for_review → approved → published`，publish gate blockers 为 0
- Runtime 面板 Pipeline Run 操作：已加入刷新流水线、创建流水线实例、推进当前阶段、流水线 dry-run、修复预览和修复流水线入口
- Pipeline Run 异常注入 smoke：已覆盖 pipeline-run-ledger 损坏、阶段 done 但产物缺失、阶段 review blocked、下游 workflow 丢失
- Runtime 面板最近画布回写：已展示画布回写总数、回写异常数和最近 6 条 `canvasOutputs`，可直接打开 Artifact Preview
- Runtime 面板画布回写失败提示：已按 `exists=false` 或缺 artifactPath 标出异常计数和最近异常项
- Runtime 面板 Canvas failed retry：最近画布回写异常项已支持重试预览和确认后真实回写，并展示 Canvas retry 结果摘要 / 详情
- Runtime 面板结果摘要密度：已新增紧凑“最近操作摘要”条，汇总端到端自测、Pipeline Run、任务队列、压力自测、发布队列、发布自测、修复和归档结果
- Workflow JSON Preflight：已支持 Schema / Path、Canvas 节点连线、Canvas Execution、Prompt / Reference、Output Writeback Hint 五组契约校验
- Workflow Draft Preflight API：已支持对 taskType 草案、workflowDraft、workflowId 或 workflowPath 做 dry-run 校验
- Runtime smoke 已纳入 `workflow_preflight` 步骤，异常注入 smoke 已覆盖 Workflow JSON 契约违规
- Release Registry 结构诊断：Runtime Diagnostics 已检查 releases / publishHistory / archiveHistory / restoreHistory 结构、重复 release、非法状态、artifactPaths 与 history 类型
- Artifact Registry review 诊断：Runtime Diagnostics 已检查 pendingReviews / completedReviews / reviewHistory 结构、pending/completed 冲突、重复 reviewId、completed review 状态异常
- task-run 报告诊断：Runtime Diagnostics 已检查 done / failed taskQueue 与 taskQueueRuns 的 reportPath 是否存在、是否可解析为安全路径
- 异常注入 smoke 扩展：已覆盖 release registry JSON 结构损坏、artifact registry pending/completed review 冲突、task-run 报告缺失
- Canvas v2 主入口真实写入 smoke 已扩展到完整 Pipeline Run done：资产图回写审核 done → 故事板 Workflow 解锁；故事板图回写审核 done → 视频 Workflow 解锁；视频产物回写审核 done → 剪辑 Workflow 解锁；剪辑产物、QA 报告、Release manifest 回写审核后最终 `Pipeline Run status=done`
- Canvas v2 entry smoke 已校验资产图 / 故事板 / 视频 / 剪辑 Workflow 全部继承当前 `episodeId`，路径落在 `02-工作流/{episodeId}/`
- Canvas 输出联动 Pipeline Run 已收紧：带 `pipelineRunId / pipelineStageId` 的 workflow 只能回写到同一 Pipeline Run / Stage，避免当前 run 的输出污染历史 run
- Pipeline Run Diagnostics 已新增跨 run / 跨 stage 误绑定检查：`pipeline_stage_workflow_run_mismatch`、`pipeline_stage_workflow_stage_mismatch`
- Pipeline Run Repair 已能摘除误绑定 workflow / artifact / review，并在需要时重建当前阶段 Workflow；本轮已实际修复历史 smoke 留下的 2 个跨 run 错配，修复后 Diagnostics ready / 0 issues
- Release publish-gate 诊断已收敛：`ready_for_review` 的正常待审发布包不会再触发 Runtime Diagnostics 的 `release_status_not_approved`，仅在 approved/published 或发布队列已有 active publish intent 时才进入发布门禁诊断
- Canvas v2 输出详情回归已纳入 browser smoke：节点“查看/编辑”输出、交付物保存同步、Workflow 节点“进入无限画布查看/执行”、媒体缩略图 `/read` 只读加载入口均已自动校验

## Release 生命周期

```text
draft → ready_for_review → approved → published → archived → restored
```

状态机：

```text
draft: ready_for_review
ready_for_review: approved / draft
approved: published / archived
published: archived
archived: restored
restored: ready_for_review
```

## 已接入 Release API

```text
GET  /api/smart-vision/releases
POST /api/smart-vision/releases/create
POST /api/smart-vision/releases/status
POST /api/smart-vision/releases/repair
POST /api/smart-vision/releases/publish-queue/run
POST /api/smart-vision/releases/publish-queue/requeue
POST /api/smart-vision/releases/publish-queue/smoke
POST /api/smart-vision/runtime/smoke
POST /api/smart-vision/runtime/anomaly-smoke
POST /api/smart-vision/workflows/tasks/persist
POST /api/smart-vision/workflows/tasks/compile
POST /api/smart-vision/workflows/canvas-output
POST /api/smart-vision/workflows/tasks/queue/run
POST /api/smart-vision/workflows/tasks/queue/requeue
POST /api/smart-vision/workflows/tasks/queue/stress
POST /api/smart-vision/workflows/runner/compact
POST /api/smart-vision/workflows/runner/archive/restore
POST /api/smart-vision/workflow-draft/preflight
GET  /api/smart-vision/pipeline/runs
POST /api/smart-vision/pipeline/runs/create
POST /api/smart-vision/pipeline/runs/advance
POST /api/smart-vision/pipeline/runs/smoke
POST /api/smart-vision/pipeline/runs/repair
```

## Release Diagnostics 覆盖项

```text
release_status_invalid
release_manifest_missing
release_manifest_file_missing
release_manifest_path_invalid
release_artifact_missing
release_artifact_path_invalid
release_approved_at_missing
release_published_without_approval
release_published_at_missing
release_published_without_history
release_archived_at_missing
release_archived_without_history
release_restored_with_archived_at
release_restored_without_history
release_review_missing
release_review_not_done
release_status_not_approved
release_qa_review_missing
release_qa_review_not_done
release_artifacts_empty
```

## 最近验证

```bash
cd smart-vision/app && npm run build
```

结果：通过。

补充验证：

```bash
SMART_VISION_BRIDGE_PORT=5199 npm run bridge
curl /api/smart-vision/releases
curl -X POST /api/smart-vision/releases/create
curl -X POST /api/smart-vision/releases/status
curl -X POST /api/smart-vision/releases/repair
curl -X POST /api/smart-vision/releases/publish-queue/run
curl -X POST /api/smart-vision/workflows/runtime/repair
```

2026-05-16 最新验证：

```bash
node --check app/scripts/bridge-server.mjs
npm run build
npm run smoke:smart-canvas-v2
npm run smoke:smart-canvas-v2:entry
npm run smoke:smart-canvas-v2:browser
npm run smoke:runtime:strict
npm run smoke:anomaly
```

结果：全部通过；`smoke:smart-canvas-v2:entry` 已覆盖到视频产物回写、`video_review done` 与剪辑 Workflow 自动解锁。

结果：通过。已验证 release review 未完成时禁止 approved；release review done、QA review done、manifest 与 artifacts 存在且状态 approved 后允许 published。

补充验证：已验证单个 release 修复 API 返回当前 release、修复项、修复前后 publish gate 与 diagnostics；当前已发布 EP001 release 无需自动修复，publish gate 仍为通过。

前端补充验证：Release 面板已把 publish gate 拆分为 QA 审核、Release 审核、Manifest / Artifacts 三组展示，并保留状态门禁兜底分组；`npm run build` 通过。

Runner → Release 验证：QA review done 重放时不会重复创建已有 release，会写入 runner skipped 事件；runtime repair 已为既有 published release 补齐 `publishHistory`；发布队列运行 API 返回正常，当前无待发布项。

真实 Pipeline Run 最新验证：`pipeline-run-ep001-1778290049528` 已从资产图推进到 Release 发布完成；剪辑产物、QA 报告和 Release manifest 均通过 canvas-output 回写并创建对应 review；QA done 自动生成 Release Workflow；Release manifest 回写自动绑定自动发布包；release review done 后 Pipeline Run 状态为 `done`；自动发布包 `release-ep001-auto-draft-qa-1778303373129` 已 published；Runtime Diagnostics ready / 0 issues。

Canvas retry UI 验证：已制造 `ui-canvas-output-retry-smoke` failed 回写记录，Diagnostics 降级到 `canvas_output_failed / canvas_output_file_missing`；retry dry-run preview 返回 retryable；补齐本地源文件后 retry 返回 `registered / retried=true` 并创建 review；review done 后 Diagnostics ready / 0 issues。

最新命令验证：

```bash
cd smart-vision/app && npm run build
cd smart-vision/app && npm run smoke:runtime:strict
cd smart-vision/app && npm run smoke:anomaly
```

结果：全部通过。

数据包 / 编排器验证：`GET /api/smart-vision/context-pack?taskType=video_generation` 已返回 17 个已解析引用、0 个缺失引用；`POST /api/smart-vision/workflows/tasks/plan` 已生成 5 个可执行子任务；`POST /api/smart-vision/workflows/tasks/compile` 已生成并落盘 `02-工作流/ep001/draft-video_generation-1778242509805.mjb-workflow.json`，import check 通过。

任务编排落盘验证：`POST /api/smart-vision/workflows/tasks/persist` 已用 `video_generation` 实测，写入 5 个 progress-ledger 任务项、5 个 workflow-runner taskQueue 队列项，并在 runner events 写入 `task_plan_persisted`。

任务队列执行验证：`POST /api/smart-vision/workflows/tasks/queue/run` 已连续消费 `video_generation` smoke taskQueue，5 个子任务全部进入 `done`，并写入 `.smart-vision/task-runs/sv-task-video-generation-orchestration-smoke/*.json` 执行报告；空跑时安全返回 0。

任务队列单项验证：`POST /api/smart-vision/workflows/tasks/queue/requeue` 已验证可将单个 `taskQueueId` 重新置为 queued 并保留 `previousReportPath`；`POST /api/smart-vision/workflows/tasks/queue/run` 已验证可用 `taskQueueId` 单项运行；最新报告 `.smart-vision/task-runs/sv-task-video-generation-orchestration-smoke/task-queue-run-1778251448766-load-data-pack.json` 已可通过 artifact preview 读取。

发布失败重入验证：`POST /api/smart-vision/releases/publish-queue/requeue` 已验证无 blocked 发布项时安全返回 0；有 blocked 项时会按 releaseId 重新置为 queued 并递增 retryCount。

Release 历史 / 发布队列单项验证：`GET /api/smart-vision/releases` 已返回 `publishHistory / archiveHistory / restoreHistory` 并在 Release 面板展示；`POST /api/smart-vision/releases/publish-queue/run` 已验证支持 `releaseId` 单项运行，当前无 queued 发布项时安全返回 0；`POST /api/smart-vision/releases/publish-queue/requeue` 已验证支持 `releaseId` 单项重入，当前无 blocked 发布项时安全返回 0。

执行报告 / 发布失败路径 smoke 验证：Artifact Preview 已对 `.smart-vision/task-runs/*.json` 渲染结构化执行报告；`POST /api/smart-vision/releases/publish-queue/smoke` 已验证 dry-run 返回 `force_blocked → requeue_blocked → publish_attempt`，当前 EP001 发布包门禁通过时 publish_attempt 为 `published`，不会写入真实发布包状态。

一键端到端 smoke 验证：`POST /api/smart-vision/runtime/smoke` 已验证工业主链路顺序、数据包解析、任务计划、Canvas Workflow Adapter、Canvas 输出回写 dry-run、虚拟 taskQueue、Release 发布 dry-run 与 Runtime Diagnostics 串联；默认从 `asset_image_generation` 起跑，先断言 `asset_image_generation → storyboard_image_generation → video_generation`，再验证当前阶段 Workflow Draft、画布回写与发布 dry-run。

无限画布执行器验证：`GET /api/smart-vision/workflow-draft?taskType=asset_image_generation` 已生成资产图 Workflow；`GET /api/smart-vision/workflow-draft?taskType=storyboard_image_generation` 已生成基于资产图的故事板 Workflow；`GET /api/smart-vision/workflow-draft?taskType=video_generation` 已生成 `stylePreset → seedanceVideo → singleVideo → videoEditor` 视频 Workflow。`runUrl` 只负责导入并渲染画布工作流，不自动触发模型执行。

画布输出回写验证：`POST /api/smart-vision/workflows/canvas-output` 已接入 Bridge；画布端会在图片 / 视频生成完成与后台落盘完成后回传 workflowId、workflowPath、nodeId、nodeType、outputArtifactHint、localPath 与 saved 信息。Bridge 会在 Workflow 未登记时自动按 Workflow Draft 补登记，然后登记产物、创建 review、写入 artifactRegistry.canvasOutputs 和 runner event。Runtime strict smoke 已覆盖 dry-run 回写路径。

Pipeline Run 验证：已用真实 API 创建 `pipeline-run-ep001-1778290049528`，自动生成首阶段资产图 Workflow `02-工作流/ep001/draft-asset_image_generation-1778290049554.mjb-workflow.json`；推进时正确停在 `asset_images / waiting_output`，阻塞原因为 `stage_artifact_missing` 与 `stage_review_missing`，下游阶段因 `previous_stage_not_done` 保持 blocked。

Pipeline Run smoke 验证：`POST /api/smart-vision/pipeline/runs/smoke` 已纳入严格 Runtime smoke，断言 `pipeline_sequence`、`asset_images_gate`、`storyboard_images_gate`、`video_workflow_ready`、`release_dry_run` 与 `diagnostics`，当前全部通过。

Pipeline Run 异常注入验证：`npm run smoke:anomaly` 已新增 `pipeline_run_ledger_corruption`、`pipeline_stage_artifact_missing`、`pipeline_stage_review_conflict`、`pipeline_downstream_workflow_missing` 四类场景，全部通过；正常等待画布输出的真实 Pipeline Run 不会触发 Diagnostics 误报。

Pipeline Run 修复验证：`POST /api/smart-vision/pipeline/runs/repair` 已接入 dry-run 与真实写入路径；修复能力覆盖重复 run 清理、阶段 index/previous/next/current 指针规整、缺失阶段 workflow 重建、review/artifact 重挂、阶段门禁重算、done 状态不一致降级和下游解锁。已对真实流水线执行一次修复写入，补齐 5 个下游 blocked 阶段的 `previous_stage_not_done` stageId 细节；随后再次 dry-run 返回 `repairCount: 0`，Diagnostics ready / 0 issues。

前端回写记录验证：Project Snapshot 已新增 `canvasOutputs` 字段；Runtime 面板已展示画布回写总数、异常数和最近回写记录，点击 artifactPath 复用 Artifact Preview；`npm run build`、`npm run smoke:runtime:strict`、`npm run smoke:anomaly` 均通过。

Runtime 摘要密度验证：Runtime 面板已新增最近操作摘要条，把端到端自测、流水线 dry-run、任务队列、压力自测、发布队列、发布自测、修复、归档压缩为可扫摘要；`npm run build` 与 `npm run smoke:runtime:strict` 通过。

真实画布导入入口验证：`scripts/run-legacy-workbench.sh` 默认端口统一为 `8877`；Bridge Snapshot 与 bundled snapshot 会动态注入当前 `bridgeBase` 并重算 workflow 导入 / 编辑 / 运行 URL；Workflow Registry importCheck 使用动态 URL 校验；画布导入时 URL 参数 `bridgeBase` 优先于 Workflow JSON 内嵌旧值。已验证 `8877` 画布入口返回 200，当前 Bridge `5199` 可读取 release workflow artifact，release workflow importCheck ok；随后 `npm run build`、`npm run smoke:runtime:strict`、`npm run smoke:anomaly` 全部通过。

Canvas import smoke 验证：新增 `app/scripts/canvas-import-smoke.mjs`，并在 `app/package.json` 增加 `npm run smoke:canvas-import` 与 `npm run smoke:canvas-import:live`。该脚本会启动临时 Bridge，检查 legacy 默认 `8877`、画布导入 `bridgeBase` 优先级、Snapshot 动态 `bridgeBase`、workflow import/edit/run URL、importCheck、workflow artifact read；live 模式还要求 `8877` 真实画布页面返回 200。当前两条命令均 passed。

浏览器级画布导入验证：画布页面新增 `window.__SMART_VISION_IMPORT_PROBE__`，`npm run smoke:canvas-import:browser` 会启动 Chrome headless 打开真实 `8877` runUrl，验证浏览器 JS、跨端口 Bridge fetch、workflow 导入和画布节点加载。本轮还补齐 `contextPack / artifactInput / workflowBuilder / phaseGate` 四类智能视界平台节点定义与只读渲染，修复 Release / QA 这类非模型阶段 Workflow 在 legacy 画布中被过滤为空白的问题。当前 `draft-release-1778304322583` 浏览器探针结果为 `nodes 4 / conns 3`，命令 passed。

命令行 smoke 验证：`cd smart-vision/app && npm run smoke:runtime` 已验证通过；脚本会临时启动 Bridge、调用 `/api/smart-vision/runtime/smoke`、输出摘要并自动关闭临时服务，最新结果为 `passed`。

严格 smoke 验证：`cd smart-vision/app && npm run smoke:runtime:strict` 已验证通过；该模式会在 runtime smoke 非 `passed` 时返回失败码，当前状态为 `passed`。

Runner 历史归档验证：`POST /api/smart-vision/workflows/runner/compact` 已验证 dry-run 与真实写入；dry-run 可按参数计算待归档 taskQueue / releaseQueue / runs / events，真实写入会保留 queued / blocked / failed 活动项，仅归档超出保留窗口的已完成任务和已发布发布项，并写入 `runner_ledger_compacted` 事件。当前 Diagnostics 仍为 ready（0 issues）。

Runner 归档查看 / 修复验证：`GET /api/smart-vision/workflows/runner/status` 已返回 `archiveSummary`；`POST /api/smart-vision/workflows/runtime/repair` 已返回 `repairedRunnerArchiveCount`；当前 archive 结构无需修复，Diagnostics ready（0 issues）。

Runner 反归档验证：`POST /api/smart-vision/workflows/runner/archive/restore` 已验证可从 `archives.taskQueue` 恢复单个归档任务项，也已验证 `restoreAll` 批量恢复；测试后当前 taskQueue 回到 5 个 done 项，archive task count 为 0，Diagnostics ready（0 issues）。

任务队列压力自测验证：`POST /api/smart-vision/workflows/tasks/queue/stress` 已用 `video_generation / edit / qa / release` 各 2 份 dry-run 测试，共 8 个任务计划、40 个虚拟子任务，结果 `passed`，完成 40/40，阻塞 0。

参数化压力自测验证：`POST /api/smart-vision/workflows/tasks/queue/stress` 已用 `video_generation / qa` 各 3 份 dry-run 测试，共 6 个任务计划、30 个虚拟子任务，结果 `passed`，完成 30/30，阻塞 0。

高影响操作防误触验证：`POST /api/smart-vision/workflows/runtime/repair` 已验证 `{ dryRun: true }` 返回 `dryRun: true` 且 Diagnostics ready；`POST /api/smart-vision/releases/publish-queue/run` 已验证 `{ dryRun: true }` 安全返回，当前待发布项为 0；`POST /api/smart-vision/workflows/runner/compact` 已验证 dry-run 预览；前端 Runtime 面板已加入修复预览、归档预览、发布预览与真实写入确认弹窗；pressure stress 保持 dry-run 并增加执行确认。

Workflow Preflight 验证：`POST /api/smart-vision/workflow-draft/preflight` 已验证 `asset_image_generation` 草案返回 `passed / errors 0 / warnings 0`；异常 workflowDraft 返回 `failed`，并识别 path invalid、schema invalid、direct model execution、connection target missing、prompt missing 等契约违规。`npm run smoke:runtime:strict` 已新增 `workflow_preflight` passed；`npm run smoke:anomaly` 已新增 `workflow_preflight_contract_violation` passed。

异常注入 smoke 验证：`cd smart-vision/app && npm run smoke:anomaly` 已验证通过；场景覆盖 release 未批准、manifest 缺失、artifact 文件缺失、Release review 未完成、QA review 未完成、runner archive bucket 损坏 / lastCompactedAt 非法 / active duplicate、taskQueue 依赖缺失、context pack 引用缺失、Pipeline Run ledger / 阶段 / workflow 异常、release registry JSON 结构损坏、artifact registry review 冲突、task-run 报告缺失、Workflow JSON preflight 契约违规、Canvas 输出失败与重复回写、Runtime repair dry-run、Release publish queue dry-run。最新结果 `passed`，Diagnostics ready（0 issues）。

Canvas 输出幂等验证：已创建独立 smoke workflow `draft-asset_image_generation-1778298423240` 并用同一 `idempotencyKey=canvas-output-idempotency-smoke` 连续回写两次；第一次返回 `registered`，第二次返回 `idempotent`，复用同一个 artifact `01-资产图与提示词/画布回写/idempotency-smoke.png` 和同一个 review。随后 Diagnostics 仍为 ready / 0 issues。

Canvas 输出失败恢复验证：`POST /api/smart-vision/workflows/canvas-output/retry` 已完成真实事故回放。先用缺失本地源文件制造 `canvas-output-retry-smoke` failed 记录，Diagnostics 降级并报告 `canvas_output_failed / canvas_output_file_missing`；随后补齐 `/private/tmp/sv-canvas-retry-source.png` 并 retry，返回 `registered`、复制到 `01-资产图与提示词/画布回写/retry-smoke.png`、创建 review；再次 retry 返回 `idempotent`，Diagnostics ready / 0 issues。

状态源结构异常验证：Runtime Diagnostics 已新增 Workflow Registry、Review Ledger、state-operation-journal 诊断；`npm run smoke:anomaly` 新增 `workflow_registry_json_structure_corruption`、`review_ledger_history_corruption`、`state_operation_journal_interrupted` 三个场景，均 passed。修正 state-operation-journal 判断为“按 operation id 的最新状态”识别 active running，避免 running/done 历史记录误报 duplicate running；真实 Diagnostics ready / 0 issues。

Pipeline Run 修复写入验证：异常注入 smoke 新增 `pipeline_run_repair_write_fixture`，会备份当前 `pipeline-run-ledger`，插入损坏 run，执行 dry-run preview，再执行真实 repair 写入，验证 `pipeline_events_array_repaired`、`pipeline_duplicate_run_removed`、`pipeline_run_pointers_normalized`、`pipeline_stage_done_downgraded`、`pipeline_stage_blocked_by_previous`，最后恢复原 ledger。`npm run smoke:anomaly` 通过，cleanup 后 Diagnostics ready / 0 issues。

生产就绪总控面板：前端首页新增 `ProductionReadinessPanel`，第一屏聚合 Bridge 数据源、Pipeline Run 当前阶段、Release 发布门禁、Canvas 回写异常、Workflow importCheck 和 smoke 结果，并提供端到端自测、流水线 dry-run、发布异常自测与打开画布快捷入口。样式上移除装饰性径向背景，转为更克制的工作台背景，提高信息密度。验证：`npm run build`、`npm run smoke:runtime:strict`、`npm run smoke:canvas-import:browser`、`npm run smoke:anomaly`、最终 `npm run build` 全部通过。

生产就绪总控当前画布执行位：总控面板继续补齐当前阶段 Workflow 执行入口，展示当前 Pipeline 阶段、Workflow 名称、导入可用性、节点 / 连线数、workflowPath、回写目标和阶段 blocker，并提供“导入执行 / 编辑画布 / 查看 JSON”三个入口。该改动不改变底层执行策略，仍由无限画布承载真实执行，Smart Vision 只负责生成 / 调度 Workflow JSON 与回写状态。验证：`npm run build`、`npm run smoke:runtime:strict`、`npm run smoke:canvas-import:browser`、`npm run smoke:anomaly`、最终 `npm run build` 全部通过。

生产就绪总控 canvas-output 首次回写：总控面板新增“画布产物回写”表单，支持填写真实画布 RUN 后的本地文件路径、目标 artifactPath / outputArtifactHint 和可选 idempotencyKey；提供“回写预览”和“确认回写”。确认回写调用 `POST /api/smart-vision/workflows/canvas-output`，会物化到 `smart-vision/outputs`、登记 artifact/review，并触发 Pipeline Run 后续推进。已新增前端 API 封装 `registerCanvasWorkflowOutput` 与 `CanvasOutputRegisterResult` 类型。验证：`npm run build` 通过；`canvas-output` dry-run API 返回 `status=preview`、workflow、artifactPath、targetPath、idempotencyKey；`npm run smoke:runtime:strict`、`npm run smoke:canvas-import:browser`、`npm run smoke:anomaly`、最终 `npm run build` 全部通过。

Canvas-output register smoke 固化：新增 `app/scripts/canvas-output-smoke.mjs` 与 `npm run smoke:canvas-output`，脚本会启动临时 Bridge、生成 1x1 PNG 临时文件、执行 canvas-output dry-run 预览、真实 register 写入、Artifact Preview 读取和 Diagnostics 校验。最新结果：写入 `01-资产图与提示词/画布回写/canvas-output-register-smoke-1778317814848.png`，创建 review `artifact-draft-asset_image_generation-1778298423240-01--canvas-output-register-smoke-1778317814848-png-review`，Artifact Preview 返回 image / 68 bytes，Diagnostics ready / 0 issues。

生产就绪总控 Pipeline 操作入口：总控面板新增刷新流水线、创建实例、推进阶段、修复预览四个入口，减少真实生产时在 Runtime 面板和 Workflow 面板之间切换。推进阶段仅在存在未完成 Pipeline Run 时可用；创建实例与真实写入操作仍沿用原有确认保护。验证：`npm run build`、`npm run smoke:canvas-output`、`npm run smoke:runtime:strict`、`npm run smoke:anomaly`、最终 `npm run build` 全部通过。

生产就绪总控 canvas-output 回写防错：总控回写表单新增当前阶段输出目标预设选择，减少手填 artifactPath 错误；新增“复制 JSON”按钮，便于从真实画布 RUN 或外部脚本回传同一份回写载荷；写入结果新增“打开产物”入口，可直接检查 Artifact Preview。验证：`npm run build`、`npm run smoke:canvas-output`、`npm run smoke:runtime:strict` 全部通过，Diagnostics ready / 0 issues。

Canvas RUN Session Ledger：新增 `outputs/.smart-vision/canvas-run-ledger.json`，用于记录真实无限画布 RUN 会话、workflow、Pipeline stage、runUrl、输出目标、artifact、review 和 idempotencyKey。Bridge 新增 `POST /api/smart-vision/workflows/canvas-run-sessions/start` 与 `/status`；`canvas-output` 回写支持 `runSessionId`，会自动把 RUN 会话推进到 `output_registered`，对应 review done 后收敛为 `done`。生产就绪总控新增画布 RUN 会话统计、当前会话展示与“创建 RUN 会话”入口。验证：`node --check app/scripts/bridge-server.mjs`、`node --check app/scripts/canvas-output-smoke.mjs`、`npm run build`、`npm run smoke:canvas-output`、`npm run smoke:runtime:strict`、`npm run smoke:anomaly`、最终 `npm run build` 全部通过。

Canvas RUN Ledger Diagnostics：Runtime Diagnostics 已覆盖 `canvas-run-ledger.json` 的 sessions/events 结构、重复 session、非法状态、workflow 缺失、artifact 文件缺失、review 缺失和 canvasOutput 关联缺失；异常注入 smoke 新增 `canvas_run_ledger_corruption` 场景。验证：`node --check app/scripts/bridge-server.mjs`、`npm run build`、`npm run smoke:anomaly`、`npm run smoke:runtime:strict` 全部通过。

Canvas-next UI 视觉收敛：前端壳层已统一为 canvas-next 暗色工作台风格，左侧导航收窄为图标栏，生产就绪总控、项目信息、任务看板、Release / Runtime / Artifact 面板统一压缩间距、字号、按钮和状态标签；默认 5188 Bridge 已重启为当前 `bridge-server.mjs` 代码，UI 可读取最新 Canvas RUN ledger 会话。验证：`npm run build` 通过，本地 `http://127.0.0.1:5178/?fresh=1` 已显示实时 Bridge、RUN 会话 2 条和最新 open 会话。

生产验证闭环与画布输入可靠性：修复 legacy workbench 与 Smart Vision outputs 的读取断点，`scripts/run-legacy-workbench.sh` 现在向 workbench 注入 `SMART_VISION_ROOT` / `SMART_VISION_OUTPUTS_DIR`，`/read?path=...` 可安全只读访问 `smart-vision/outputs`；workbench 参考图准备与上传前会校验 PNG/JPEG/WebP/GIF 是否能解析尺寸，避免文本伪装 `.png` 卡死上传；画布导入 workflow 时会把历史 `6199` 等旧 Bridge artifact URL 自动重写为当前 URL 参数里的 `bridgeBase`；Bridge 根路径改为基于脚本位置解析，避免从不同 cwd 启动后读错项目。已修复现有 smoke 图片/视频占位物为真实 PNG/MP4。

生产验证闭环结果：独立验证流水线 `pipeline-run-ep001-prod-validate-1778326076394` 已按平台路径完成 `asset_image_generation → storyboard_image_generation → video_generation → edit → qa → release` 全阶段闭环；每阶段均创建 Canvas RUN 会话、回写 canvas-output、生成并完成对应 review，最终所有 gate passed。自动发布包 `release-ep001-auto-draft-qa-1778328720254` 已合法推进 `ready_for_review → approved → published`，publishGate 无 blocker。验证：`python3 -m py_compile services/workbench/workbench_server.py`、`node --check app/scripts/bridge-server.mjs`、`node --check app/scripts/canvas-import-smoke.mjs`、`node --check app/scripts/canvas-output-smoke.mjs`、`npm run build`、`node app/scripts/canvas-import-smoke.mjs --strict --require-canvas --browser-probe --base-url=http://127.0.0.1:5188`、`node app/scripts/canvas-output-smoke.mjs --strict --base-url=http://127.0.0.1:5188`、`POST /api/smart-vision/pipeline/runs/smoke` 全部通过；Runtime Diagnostics ready / 0 issues。

UI 联调：生产就绪总控新增画布集成状态卡，Bridge 快照会主动探测 8877 workbench health、`SMART_VISION_OUTPUTS_DIR` 挂载、`/read?path=...` 参考图读取和导入页旧 Bridge URL 重写能力；前端 readiness score 已把画布输入可靠性纳入评分。实时验证结果：`canvasStatus.health=online`、`workbench.readEndpointReady=true`、`readProbeStatus=200`、`readProbeContentType=image/png`、`bridgeBaseRewrite=enabled`。验证：`npm run build`、`node app/scripts/canvas-import-smoke.mjs --strict --require-canvas --browser-probe --base-url=http://127.0.0.1:5188`、`node app/scripts/canvas-output-smoke.mjs --strict --base-url=http://127.0.0.1:5188`、`POST /api/smart-vision/pipeline/runs/smoke` 全部通过，Runtime Diagnostics ready / 0 issues。

Canvas RUN 生命周期 UI：生产就绪总控已接入 RUN 会话人工状态操作，当前会话支持标记 `running / done / failed / cancelled`，最近 RUN 会话列表支持快速处理未闭合会话；`failed / cancelled` 保留确认保护。真实 API smoke 已验证创建 RUN 会话 `opened`，随后更新为 `running`，最后更新为 `cancelled`，Runtime Diagnostics 仍为 ready / 0 issues。验证：`npm run build`、`node --check app/scripts/bridge-server.mjs`、Canvas RUN lifecycle API smoke 全部通过。

Canvas-output 回写准备检查：生产就绪总控已在真实回写前展示本地文件、目标 artifactPath、RUN 会话、幂等键和媒体类型五组准备状态；具体目标路径会过滤 `**/*.png` 这类模板路径，确认回写必须填写本地文件和具体文件级 artifactPath，预览 / 复制 JSON 也会在目标无效时禁用。回写表单新增“使用 RUN 目标”和“生成幂等键”，并把默认 `idempotencyKey` 稳定绑定到 Pipeline Run / Stage / Workflow / artifact。Bridge dry-run 预览新增 `materialized.sourceExists`，可区分真实源文件存在与缺失。验证：`npm run build` 通过；`node --check app/scripts/bridge-server.mjs` 通过；`POST /api/smart-vision/workflows/canvas-output` dry-run 用真实 PNG 返回 `sourceExists=true`，用缺失路径返回 `sourceExists=false`；`npm run smoke:canvas-output` passed；`npm run smoke:canvas-import:browser` passed；`POST /api/smart-vision/pipeline/runs/smoke` passed；`npm run smoke:runtime:strict` passed；Runtime Diagnostics ready / 0 issues。

产品主流程 UI 收敛：前端默认入口已从工程控制台改为“导入剧本 / 故事原文 / 参考图片 + 剧本编辑框 + 开始创作”主入口；点击创作后进入新增智能画布页面。智能画布采用暗色链式卡片结构，按 `剧集规划 → 分镜表 → 资产卡 → 资产生成 → 故事板生成 → 视频生成` 展示结果和确认动作，支持半自动 / 全自动切换；用户默认只看到结果、打开画布执行、确认下一步，高级 Runtime / Diagnostics / Repair / Smoke / Artifact 等入口已折叠到“高级维护 / 调试工具”。这次明确把数据包加载解析降级为后台初始化能力，不再作为用户主流程展示。

Canvas-next 迁移：已把根工程 `tools/workbench-web/image-studio-canvas-next.html` 迁移替换到 `smart-vision/canvas/legacy-workbench/workbench-web/image-studio-canvas.html`，并复制 `canvas-next/` 样式资源；当前 8877 runtime workbench 也已同步为新文件。新画布保留 Smart Vision `workflowPath + bridgeBase` 导入能力，新增 `__SMART_VISION_IMPORT_PROBE__` 探针、旧 artifact URL 自动重写、URL `bridgeBase` 优先级以及本地免登录启动。验证：`npm run build` passed；新画布 inline scripts syntax ok；`npm run smoke:canvas-import:browser` passed，浏览器导入 `draft-release-1778304322583` 返回 `nodes 4 / conns 3`；Runtime Diagnostics ready / 0 issues。

真实流水线资产图阶段联调：已对 `pipeline-run-ep001-1778290049528` 的资产图 Workflow `draft-asset_image_generation-1778290049554` 回写 `01-资产图与提示词/资产图/ep001/pipeline-asset-output-smoke.png`，并把自动创建的 asset review `artifact-draft-asset_image_generation-1778290049554-01--ep001-pipeline-asset-output-smoke-png-review` 置为 done。结果：`asset_images` 阶段 done，`currentStageId=storyboard_images`，自动生成并挂载 `draft-storyboard_image_generation-1778301596146`，该故事板 Workflow preflight passed / errors 0，Diagnostics ready / 0 issues。

真实流水线故事板阶段联调：已对 `draft-storyboard_image_generation-1778301596146` 回写 `01-资产图与提示词/故事板/storyboard/ep001/pipeline-storyboard-output-smoke.png`，并把自动创建的 storyboard review `artifact-draft-storyboard_image_generation-1778301596146-01--storyboard-ep001-pipeline-storyboard-output-smoke-png-review` 置为 done。结果：`storyboard_images` 阶段 done，`currentStageId=videos`，自动生成并挂载 `draft-video_generation-1778302161828`，该视频 Workflow preflight passed / errors 0，Diagnostics ready / 0 issues。

Workflow / progress 同步修复：补齐 `syncProgressItemsForWorkflow`，在 `updateWorkflowStatus` 和 `addWorkflowOutput` 后同步对应 `progress-ledger` item，避免 canvas output 让 workflow 进入 `waiting_review` 但 progress item 仍停在 `todo`。已用 runtime repair 修复当前 1 个 mismatch。

真实流水线视频阶段联调：已对 `draft-video_generation-1778302161828` 回写 `03-视频/ep001/pipeline-video-output-smoke.mp4`，并把自动创建的 video review `artifact-draft-video_generation-1778302161828-03--ep001-pipeline-video-output-smoke-mp4-review` 置为 done。结果：`videos` 阶段 done，`currentStageId=edit`，自动生成并挂载 `draft-edit-1778302819995`，该剪辑 Workflow preflight passed / errors 0，Diagnostics ready / 0 issues。

状态安全验证：Bridge 状态写入层已改为原子 JSON 写入；`POST /api/smart-vision/releases/publish-queue/requeue` 用无 blocked 项场景完成轻量真实写入验证，已生成 `state-operation-journal.json` 的 running / done 记录，`workflow-runner-ledger.json.bak` 与 `state-operation-journal.json.bak` 均存在且 JSON 可解析；Diagnostics ready（0 issues）。

剧本驱动创作启动闭环：新增 `POST /api/smart-vision/creative/start`，主入口“开始创作”已调用该接口。接口会根据用户输入剧本 / 导入文件生成 `04-输入资料/{episode}/script-source.md`、`04-storyboard/{episode}-storyboard.md`、`01-资产图与提示词/asset-cards/{episode}-asset-cards.md`、`01-资产图与提示词/asset-index.md`、`05-prompts/seedance/{episode}-shots.md` 和 `05-可选输出/剧本/{episode}-creative-plan.json`，并登记到 Artifact Registry；随后按现有工业流水线创建 Pipeline Run 和第一阶段资产图 Workflow。链式智能画布前置卡片已从真实 creative result 读取分镜表、资产卡、视频段数和资产数量。同步修复 `preparePipelineStageWorkflow` 未把 taskPlan 传入 `saveWorkflowDraft` 的问题，非 `ep001` 的 workflow 现在会正确落入 `02-工作流/{episodeId}/`。

剧本驱动创作验证：`node --check app/scripts/bridge-server.mjs` 通过；`npm run build` 通过；真实 API smoke 使用 `ep-smoke2` 生成 2 个视频段、10 项资产，写入 `04-storyboard/ep-smoke2-storyboard.md` 与 `01-资产图与提示词/asset-cards/ep-smoke2-asset-cards.md`，Pipeline Run 当前阶段为 `asset_images`，Workflow path 为 `02-工作流/ep-smoke2/draft-asset_image_generation-*.mjb-workflow.json`；Artifact Preview 可读取分镜表并包含 `shot-01`；`npm run smoke:runtime:strict` 与 `npm run smoke:canvas-import:browser` 均通过。

智能画布 canvas-next 节点交互收敛：链式智能画布已进一步对齐 `tools/workbench-web/image-studio-canvas-next.html` 的单图节点视觉，使用同款暗色点阵画布、细边框预览卡、胶囊标签、节点工具浮层与流光连接线。半自动模式下节点运行中只显示取消，完成后显示编辑与下一步；点击下一步才展开下一张卡和连接线。全自动模式隐藏人工按钮并在节点完成后自动展开下一节点。编辑入口已按节点类型进入剧本编辑、分镜表预览编辑、资产卡编辑或 Workflow JSON / 无限画布执行页。修复了新建创作复用旧 `ep-smoke2` Pipeline Run 的问题，现在主入口每次开始创作都会创建当前剧本的新 Pipeline Run；摘要区“打开画布执行”只在当前卡片对应资产图 / 故事板 / 视频 Workflow 时出现。验证：`npm run build` 通过；浏览器验证 `http://127.0.0.1:5178/?ui=2` 下开始创作后顶部为 `ep001`，第一张卡完成后点击下一步才出现第二张卡与流光连线，非 Workflow 卡片不显示画布执行入口。

智能视界 Canvas v2 独立入口：新增 `canvas/legacy-workbench/workbench-web/smart-vision-canvas-v2.html`，作为不影响封板版 `image-studio-canvas.html` 和上游 `image-studio-canvas-next.html` 的 v2 迭代入口。v2 已纠偏为与 canvas-next 无限画布同构的 `.app / .topbar / .toolbar / .stage / .world / .node / .node-label / .ports / .preview-card / .conn-svg / .statusbar` 结构，不再使用上一版 `.sv-node` 自定义节点体系；节点视觉、连线、端口、画布拖拽、缩放、适配视图、节点拖拽和 resize 均沿用无限画布操作习惯。顶部提供 `智能画布 / 无限画布` 双 Tab、`自动流水线 / 自定义编排` 双轨，以及 `手动 / 半自动 / 自动` 三种模式。默认链路为创作输入、视觉风格、音频风格、编剧规划、导演讲戏、分镜表、资产卡、资产图 Workflow、故事板 Workflow、视频 Workflow、QA、发布包。验证：v2 内联脚本语法检查通过；8877 legacy workbench 重启后 runtime copy 已同步；`http://127.0.0.1:8877/tools/workbench-web/smart-vision-canvas-v2.html` 与原 `/image-studio-canvas.html` 均返回 200；浏览器验证半自动模式可完成第一节点并点击下一步生成/连接下游节点，自动模式可跑到发布包共 12 个节点 / 11 条连线；顶部“无限画布”Tab 可加载原无限画布 iframe。

Canvas v2 active data pack 边界修正：智能视界定位已收敛为可挂载不同创作库数据包的 SaaS 可视化操作平台，不是单一漫剧创作库专用系统。当前 active data pack 是 `漫剧创作库`，所以当前执行仍必须按该包的 agents / docs / skills / templates / wordlists / tools / data / projects 推演；未来后台下发广告创意、电商商品图、电影、自媒体商业宣传片等定制创作库时，智能画布必须按被选中数据包自己的 Agent 流水线、Skill、模板、词库和交付物类型执行。v2 前端提示词、schema 与校验已改为 active data pack aware；Bridge plannerContract 已返回 `platformRole / activeDataPackId / activeDataPackTitle / dataPackScope / strictValidationRule`。校验仍然禁止 mock / seed / 固定链路兜底，但不再把 Agent 角色硬编码为漫剧包的 Producer / Writer / Director 等固定角色。验证：v2 source 与 runtime copy 内联脚本语法检查通过；`node --check app/scripts/bridge-server.mjs` 通过；Bridge 5188 已重启并返回 `activeDataPackTitle=漫剧创作库`、`platformRole=Smart Vision SaaS data-pack visual workflow platform`。

Canvas v2 active data pack registry 落地：新增权威状态源 `outputs/.smart-vision/data-pack-registry.json`，默认注册 `manju-creation-library`，包含 15 个只读根：`agents / docs / skills / templates / wordlists / tools / data / projects / AAA / runninghub_outputs / .workbuddy/memory / .codebuddy/plans / .codebuddy/teams / .novel-assistant / .waqu-project/outputs`。Bridge 新增 `GET /api/smart-vision/data-packs`、`POST /api/smart-vision/data-packs/select`、`POST /api/smart-vision/data-packs/register`，并让 `context-pack` / `data-pack/runtime` 接收 `activeDataPackId`。v2 顶栏新增“创作库”选择器，runtime 请求、缓存 key 和本地记忆都会携带当前数据包。任务队列严格 smoke 已修正：只有缺失/不可用引用会阻断 `load-data-pack`，普通 JSON parse warning 不再误判为队列阻断；同时修复了 active pack 中 `docs/blocking-camera-geometry.schema.json` 的非法转义。验证：`node --check app/scripts/bridge-server.mjs`、v2 source/runtime inline script check、`npm run build`、`npm run smoke:runtime:strict`、`npm run smoke:anomaly` 全部通过；API 实测显示 active pack 为 `manju-creation-library`，runtime 编译到 15 roots / 626 files / 0 missing refs。

Backend Data Pack Sync 落地：后台管理系统新增文件型创作库数据包 registry，默认存储在 `/Users/billy/Documents/AI_pro/后台管理系统/data/data-pack-registry.json`，提供 `GET /api/data-packs`、`GET /api/data-packs/active`、`GET /api/data-packs/:id`、`POST /api/admin/data-packs`、`PATCH /api/admin/data-packs/:id`、`POST /api/admin/data-packs/:id/select`。Smart Vision Bridge 新增 `POST /api/smart-vision/data-packs/sync`，可用 canvas-next 共用登录 token 从后台同步数据包，并支持 `dryRun` 预览。v2 顶栏“创作库”区域新增同步按钮 `↻`。当前 4000 后台 registry 与 Smart Vision 本地 registry 均已注册并激活 `manju-creation-library`；4000 / 5188 / 8877 均已监听。验证：后台 `npm run build` 通过；后台 data pack API 临时服务 smoke 通过；Bridge 从 4000 dry-run 同步 passed；`npm run build`、`npm run smoke:runtime:strict`、`npm run smoke:anomaly` 全部通过。

Data Pack 管理与交付物契约闭环：后台管理系统新增“创作库数据包”管理页面，可查看 active pack、目录根、capabilities / metadata，支持注册、编辑和切换 active pack。后台 data pack API 已为不同业务类型补齐默认 `capabilities.outputKinds`、`requiredOrder`、`metadata.workflowJsonVisibility=internal`。Smart Vision Bridge runtime 与 plannerContract 现在返回 active data pack 的 `outputKinds / requiredOrder / capabilities / metadata`；Canvas v2 动态规划和节点执行 schema 会按当前 active pack 生成 `userDeliverable.kind` 约束，不再只沿用漫剧固定交付物枚举。新增 `npm run smoke:smart-canvas-v2`，验证 v2 source/runtime copy 语法、data pack capabilities、plannerContract 禁止固定流水线和 workflow JSON 内部化规则。验证：后台管理系统 `npm run build`、Smart Vision `node --check app/scripts/bridge-server.mjs`、`npm run build`、`npm run smoke:smart-canvas-v2`、`npm run smoke:runtime:strict`、`npm run smoke:anomaly` 全部通过。

Canvas v2 真实执行契约接入：v2 剧本输入节点现在会先走后台 LLM / active data pack 动态规划，再调用 `POST /api/smart-vision/creative/start` 创建真实创作输入包、Pipeline Run 和首阶段 Workflow；节点内部保留 `creativeStartResult`，用户侧只展示剧本源、分镜草案、资产卡、视频提示词等可读交付物入口。导入图片 / 文本 / md 时，Bridge 会把原文件物化到 `outputs/04-输入资料/{importId}/imports/`，并把 artifactPath 回填给 v2，后续 `creative/start` 使用真实导入路径而不是浏览器内存文件。工作流类节点保存 Workflow Draft 后会自动创建 `Canvas RUN Session`，并把 edit/run URL 作为进入无限画布的入口；打开工作流时会规整旧 `/image-studio-canvas.html` URL 到当前 `/tools/workbench-web/image-studio-canvas.html`。`npm run smoke:smart-canvas-v2` 已扩展验证 `creative/import` 物化、`creative/start` dry-run Pipeline Run 预览、`canvas-run-sessions/start` dry-run 会话创建。验证：`node --check app/scripts/bridge-server.mjs`、`npm run build`、`npm run smoke:smart-canvas-v2`、`npm run smoke:runtime:strict`、`npm run smoke:anomaly` 全部通过；8877 v2 页面 HTTP 返回 200。浏览器插件未拿到当前 Codex browser pane，因此本轮未完成交互级截图验证。

Canvas v2 浏览器级 smoke 与参考图传导：新增 `npm run smoke:smart-canvas-v2:browser`，会启动 headless Chrome 打开 8877 v2 页面并使用 `?probe=1` 的测试探针验证半自动 / 自动交互状态机。半自动模式已验证 `剧本输入 → 下一步 → 音频风格`，结果 3 个节点 / 2 条连线全部 success；自动模式已验证从全片风格母版到发布包的 12 个节点 / 11 条连线全部 success。探针仅用于浏览器 smoke，不改变真实执行路径，真实用户执行仍要求后台 LLM 和 active data pack。Bridge `saveWorkflowDraft` 现在会根据 v2 metadata 的 `inputArtifacts / referenceImages / outputArtifacts / episodeId` 构建 taskPlan，因此导入图片 artifactPath 会进入资产图 Workflow Draft 的 `canvasExecution.referenceImages`；`npm run smoke:smart-canvas-v2` 已用 `04-输入资料/smart-canvas-v2-ref-smoke/imports/01-reference.png` 断言 referenceImages 写入成功。验证：`npm run smoke:smart-canvas-v2:browser` passed；`npm run smoke:runtime:strict` 单独重跑 passed；`npm run smoke:anomaly` passed。

Canvas v2 输出详情交付物入口：输出详情中的图片 / 视频 artifactPath 已统一走 workbench `/read?path=...&raw=1` 只读入口，避免相对路径直接 404。`npm run smoke:smart-canvas-v2:browser` 已扩展 output detail probe，验证分镜表节点可打开“查看/编辑”、保存交付物后同步到节点数据，Workflow 节点输出详情展示交付区并提供“进入无限画布查看/执行”，打开后 iframe 进入 `/tools/workbench-web/image-studio-canvas.html`，同时缩略图 src 为 `/read?path=...`。

Canvas v2 默认交付物结构化收敛：v2 节点在后台真实结果暂不可用或浏览器探针 / 自定义编排 fallback 时，不再把内部 JSON 作为用户主输出，而是按节点类型生成可读交付物。剧集规划输出按剧本节拍拆分的视频段；导演讲戏输出镜头、动作、视觉约束；分镜表输出 shotNo / timeRange / scene / visual / action / dialogue / camera；资产卡输出角色、场景、道具卡；资产图 / 故事板 / 视频节点输出计划中的交付槽位和预期路径；QA 与 Release 节点输出门禁检查、manifest、视频清单和历史项。未真实渲染的媒体只显示预期路径，不生成破图缩略图。

Canvas v2 交付物质量 smoke 与参考图优先级修复：浏览器级 `npm run smoke:smart-canvas-v2:browser` 新增 `runDeliverableQuality` 探针，自动跑完整 12 节点链路后检查 9 类核心节点：剧集规划、导演讲戏、分镜表、资产卡、资产图、故事板、视频、QA、Release。每类都会断言交付物 kind、条目数量、详情页关键词、媒体 src 安全入口和内部字段泄漏，防止 UI 退回 JSON / workflow 参数展示。同步修复 Workflow Draft 参考图排序：`collectCanvasWorkflowSources` 现在对当前 taskPlan 显式输入的 input/reference artifacts 加权，保证用户导入的参考图优先进入 `canvasExecution.referenceImages`，不会被历史故事板图片挤出前 8 个参考图。

Canvas v2 非漫剧 data pack 切换验证：`npm run smoke:smart-canvas-v2` 已新增 `smart_canvas_v2_data_pack_switch` 步骤，会注册 `sv-smoke-ad-creative-pack` 广告创意测试包，调用 `POST /api/smart-vision/data-packs/select` 切换 active pack，再调用 `/api/smart-vision/data-pack/runtime` 校验 plannerContract。已断言 `outputKinds` 包含 `creative_brief / audience_strategy / ad_script`，`requiredOrder` 使用广告包顺序，`userDeliverableRule` 跟随广告包交付物，且不泄漏漫剧包的 `adapted_script`。验证结束后自动恢复原 active pack `manju-creation-library`，当前 registry 保持漫剧包 active。

Canvas v2 主入口真实写入 smoke：新增并持续扩展 `app/scripts/smart-canvas-v2-entry-smoke.mjs` 与 `npm run smoke:smart-canvas-v2:entry`。当前已覆盖 `creative/import → creative/start → asset workflow preflight/run session/canvas-output/review done → storyboard workflow preflight/run session/canvas-output/review done → video workflow preflight/run session/canvas-output/review done → edit workflow/canvas-output/review done → QA report output/review done → Release manifest output/release review done`，并断言最终 Pipeline Run `status=done`。最新验证生成 `ep-v2-entry-1778928166193`，所有下游 Workflow 路径均落在当前 `02-工作流/{episodeId}/`，Release manifest 路径为 `05-可选输出/审核剪辑发布/release/{episodeId}/smart-canvas-v2-entry-release-manifest.json`，Diagnostics ready / 0 issues。

最新完整验证：

```bash
cd smart-vision/app && npm run build
cd smart-vision/app && npm run smoke:smart-canvas-v2
cd smart-vision/app && npm run smoke:smart-canvas-v2:entry
cd smart-vision/app && npm run smoke:smart-canvas-v2:browser
cd smart-vision/app && npm run smoke:runtime:strict
cd smart-vision/app && npm run smoke:anomaly
```

结果：全部通过。

最新补充验证：本轮收敛默认交付物 fallback 后，`node --check app/scripts/bridge-server.mjs`、`node --check app/scripts/smart-canvas-v2-entry-smoke.mjs`、`node --check app/scripts/smart-canvas-v2-smoke.mjs`、v2 inline scripts、`npm run build`、`npm run smoke:smart-canvas-v2`、`npm run smoke:smart-canvas-v2:entry`、`npm run smoke:smart-canvas-v2:browser`、`npm run smoke:runtime:strict`、`npm run smoke:anomaly` 全部通过；最新 entry smoke 生成 `ep-v2-entry-1778932458375`，最终 Pipeline Run `done`，Diagnostics ready / 0 issues。浏览器 smoke summary 为 `assisted 3/2; auto 12/11; output detail ok; deliverables 9`。

## 当前权威状态文件

```text
smart-vision/outputs/.smart-vision/project-state.json
smart-vision/outputs/.smart-vision/recovery-checkpoint.json
smart-vision/outputs/.smart-vision/handoff-report.md
smart-vision/outputs/.smart-vision/workflow-registry.json
smart-vision/outputs/.smart-vision/artifact-registry.json
smart-vision/outputs/.smart-vision/review-ledger.json
smart-vision/outputs/.smart-vision/continuity-ledger.json
smart-vision/outputs/.smart-vision/workflow-runner-ledger.json
smart-vision/outputs/.smart-vision/pipeline-run-ledger.json
smart-vision/outputs/.smart-vision/canvas-run-ledger.json
smart-vision/outputs/.smart-vision/state-operation-journal.json
smart-vision/outputs/.smart-vision/data-pack-registry.json
```

## 注意事项

- `release-registry.json` 已由 Release API 实测创建，当前 `EP001 发布包` 已完成 `draft → ready_for_review → approved → published` 状态链路验证。
- 不要把智能视界产物散落到根目录或 `projects/`；最终输出必须归拢到 `smart-vision/outputs/`。
- 不要删除 `.codebuddy/`。
- 不要破坏根 `studio` 与 `tools/` 原链路。

## 下一步优先级

1. 用浏览器真实交互再跑一次智能画布主入口，重点检查节点输出详情入口、编辑返回、当前阶段 Workflow 打开与回写按钮状态。
2. 把智能画布节点输出详情继续收敛成用户交付物视图，确保 JSON / workflow 参数只留在内部调试入口。
3. 继续 UI 联调：检查 Runtime 面板 retry、Pipeline Run、Release、生产就绪总控 RUN 会话、回写目标预设和复制 JSON 在真实数据下的交互一致性。
