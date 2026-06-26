# Autumn Project Memory

更新日期：2026-06-14

## 项目定位

Autumn 是 VidFlow AI / Flova.ai 复刻版前端工程，目标是建设对话式 AI 视频创作平台。

核心产品形态：

- 顶部导航栏。
- 左侧资产库 / 故事板。
- 中间画布预览 / 编辑。
- 右侧 AI 对话 / 参数面板。
- 底部视频时间线。

## 技术基线

- React 18。
- TypeScript 5.x。
- Vite 6。
- Zustand。
- Ant Design 5。
- Axios。
- Socket.io-client。
- Fabric.js。
- Video.js。
- @xzdarcy/react-timeline-editor。
- CSS Modules + 主题变量。

## 架构原则

- 高内聚、低耦合。
- 数据层、逻辑层、交互层、展示层分离。
- 后端 DTO 与前端领域模型分离。
- 第三方库通过 adapter 接入。
- 复杂流程通过 orchestration service 编排。
- UI 组件不得直接调用 API 或 Socket。
- 生视频、生图、对话流、故事板、画布、时间线必须独立分模块设计。
- UI 效果图是前端实现合同，不是风格参考。所有页面必须 1:1 还原效果图，并通过 UI/UX Agent 暗色 / 白天双主题验收后才能进入下一轮。

## 后台复用策略

后台服务继续复用已有后台管理系统：

- 账户系统。
- 用户系统。
- 模型配置系统。
- 素材管理。
- AI 任务服务。
- 导出服务。

前端通过 `api`、`adapters`、`services` 适配现有接口，不在 UI 中耦合后端字段。

## 当前工程状态

- React + TS + Vite 脚手架已创建。
- `docs` 文档体系已建立。
- Agent 系统文档已建立。
- `agents` 多角色软件开发流水线已建立，包含总架构师、架构师、产品、UI/UX、前端、后端、测试、项目经理 Agent。
- Run 001 已启动，输入文档来自 `docs` 目录，当前目标是 Sprint 0 工程底座与工作台骨架。
- UI mockup 已生成夜间 / 白天两套 4K 参考图：
  - 夜间：`src/assets/ui-mockups/20260613-editor-workspace-reference-v02-4k.png`
  - 白天：`src/assets/ui-mockups/20260613-editor-workspace-reference-v03-light-4k.png`
- 主页 / 项目列表已生成夜间 / 白天两套 4K 参考图：
  - 夜间：`src/assets/ui-mockups/20260613-home-projects-dark-4k.png`
  - 白天：`src/assets/ui-mockups/20260613-home-projects-light-4k.png`
- 新建项目后的空白工作台已定义 EWS-00 到 EWS-05 状态，其中已生成：
  - 默认空态：`src/assets/ui-mockups/20260613-empty-project-default-dark-4k.png`
  - 默认空态白天模式：`src/assets/ui-mockups/20260614-empty-project-default-light-4k.png`
  - 四状态对照板：`src/assets/ui-mockups/20260613-empty-project-panel-states-dark-4k.png`
  - 四状态对照板白天模式：`src/assets/ui-mockups/20260614-empty-project-panel-states-light-4k.png`
  - 故事板 + 媒体文件双开：`src/assets/ui-mockups/20260613-empty-project-storyboard-media-dark-4k.png`
  - 故事板 + 媒体文件双开白天模式：`src/assets/ui-mockups/20260614-empty-project-storyboard-media-light-4k.png`
- UI/UX Agent 已升级规则：所有页面级、工作台级、状态级 UI 效果图必须暗色 / 白天成对生成，单主题视为未完成。
- 已完成 Flova 录屏抽帧分析，归档 41 张视频帧和 13 张关键截图：
  - 抽帧目录：`src/assets/ui-references/flova-video-analysis/`
  - 状态图谱：`docs/flova-video-creation-state-map.md`
  - 抽帧分析：`agents/runs/run-001-docs-to-mvp-kickoff/flova-video-frame-analysis.md`
- 已补齐对话流、生产工作台、媒体生成 / 视频预览三组成对 4K 状态板：
  - `src/assets/ui-mockups/20260614-chat-flow-states-dark-4k.png`
  - `src/assets/ui-mockups/20260614-chat-flow-states-light-4k.png`
  - `src/assets/ui-mockups/20260614-production-workspace-states-dark-4k.png`
  - `src/assets/ui-mockups/20260614-production-workspace-states-light-4k.png`
  - `src/assets/ui-mockups/20260614-media-generation-video-states-dark-4k.png`
  - `src/assets/ui-mockups/20260614-media-generation-video-states-light-4k.png`
- Sprint 0 前端工作台骨架已开始落地：
  - `src/pages/Home/HomePage.tsx` 已实现主页项目列表和新建项目入口。
  - `src/store/appStore.ts` 已实现 Home / Editor 视图切换和当前项目选择。
  - `src/api/pipeline/` 定义后台流水线 REST 与事件订阅合同。
  - `src/adapters/pipeline/` 将后台 DTO 映射为前端领域模型。
  - `src/services/pipeline/` 提供 Pipeline 事件回放与阶段推进服务。
  - `src/store/workspaceStore.ts` 用 React reducer 暂代 Zustand，维护主题、阶段、面板组合、对话状态、工作台状态、选中元素和积分。
  - `src/pages/Editor/EditorPage.tsx` 已实现三栏工作台、媒体条、时间线、文档状态和流水线调试抽屉。
  - `src/business-components/ChatPanel/ChatPanel.tsx` 的卡片主动作已可推进 Pipeline mock 事件。
  - `src/store/agentPackageStore.ts` 已支持 Agent 数据包切换、后台导入候选、本地 JSON 导入和本设备作用域。
  - `src/store/skillLibraryStore.ts` 已支持 Skill 库、启用/停用、后台 Skill、本地 Skill 和数据包内置 Skill。
  - `src/business-components/AgentPackageSwitcher/AgentPackageSwitcher.tsx` 已提供顶部 Agent 数据包切换 UI。
  - `src/business-components/SkillLibrary/SkillLibrarySwitcher.tsx` 已提供顶部 Skill 库管理 UI。
  - 真实视频生成内核不在前端实现，必须调用后台管理系统中已接入的漫剧创作库工业化 Agent 流水线。
- Agent 数据包约束：
  - 后台导入：`source=backend`，`storageScope=account`，可账号同步。
  - 本地导入：`source=local`，`storageScope=device`，`syncStatus=localOnly`，只能当前设备使用，不默认上传后台。
- Skill 库约束：
  - 数据包内置 Skill：`source=agentPackage`，跟随当前 Agent 数据包。
  - 后台导入 Skill：`source=backend`，`storageScope=account`，可账号同步。
  - 本地导入 Skill：`source=local`，`storageScope=device`，`syncStatus=localOnly`，只能当前设备使用。
- 验证记录：
  - TypeScript build 通过。
  - ESLint 通过。
  - Vite 生产构建通过。
  - Chrome + Playwright 冒烟通过，截图保存于 `src/assets/generated-ui/`。
  - 主页 -> 创建项目 -> 编辑器 -> 对话推进 -> 返回项目页闭环通过。
- 当前 UI 状态修正：
  - 已开发界面只能视为功能原型已跑通。
  - 视觉样式、布局、字体、色调、控件尺寸、线条和交互细节尚未通过 UI/UX Agent 1:1 视觉验收。
  - 后续所有 UI 任务必须先通过 `agents/docs/ui-pixel-parity-gate.md`，否则不得标记 DONE。

## 下一步推荐

从以下任务开始：

1. 新增项目 API 合同与 adapter：`listProjects`、`createProject`、`openProject`。
2. 接入真实后台 Agent 数据包接口：`listBackendAgentPackages`、`importBackendAgentPackage`、`switchProjectAgentPackage`。
3. 接入真实后台 Skill 库接口：`listBackendSkills`、`importBackendSkill`、`toggleProjectSkill`。
4. 接入真实后台 `startCreativePipeline`、`answerPipelineQuestion`、`confirmPipelineScript`。
5. 将启用 Skill 集合传入 Pipeline 任务配置。
6. 将 Mock Pipeline 切换为后台 EventSource / Socket 事件源。
7. 拆分 ChatPanel 内部卡片组件，形成可复用对话组件库。

后续复杂任务先由总架构师 Agent 调度，再按产品、UI/UX、架构、前端、后端、测试、项目管理角色协作推进。

## 当前运行上下文

- 当前 Run：`agents/runs/run-001-docs-to-mvp-kickoff/`
- 当前 Sprint：Sprint 0 工程底座与工作台骨架。
- 当前优先任务：E00 工程化基线、E01 组件库与主题、E02 编辑器工作台布局、E03 状态模型与联动底座。
- 新建项目工作台状态文档：`agents/runs/run-001-docs-to-mvp-kickoff/empty-project-interaction-states.md`
- 视频创作状态图谱：`docs/flova-video-creation-state-map.md`
