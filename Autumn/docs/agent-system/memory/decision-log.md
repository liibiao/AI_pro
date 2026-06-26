# Autumn Decision Log

本文件记录长期有效的技术和架构决策。新增决策时追加记录，不覆盖历史。

## D-001 使用 React 18 + TypeScript 5.x + Vite 6

日期：2026-06-13  
状态：Accepted

决策：
- Autumn 使用 React 18、TypeScript 5.x、Vite 6 作为前端基础栈。

原因：
- React 生态稳定，适合复杂编辑器式界面。
- TypeScript 能约束 seed、iw、cref、sref 等关键参数。
- Vite 适合本地高频调试。

影响：
- 后续开发必须保持类型优先。
- 所有新增模块需要提供明确类型定义。

## D-002 采用三栏 + 底部时间线工作台

日期：2026-06-13  
状态：Accepted

决策：
- 主编辑页采用 TopBar + LeftPanel + CenterCanvas + RightPanel + BottomTimeline。

原因：
- 与 Flova.ai 交互模型一致。
- 能把素材、故事板、预览、对话和剪辑时间线绑定到同一创作流程。

影响：
- 首屏必须是可用工作台，不做营销落地页。
- 后续模块都围绕该布局展开。

## D-003 业务分层采用数据层、逻辑层、交互层、展示层

日期：2026-06-13  
状态：Accepted

决策：
- 所有业务按四层分离，依赖方向为展示层 -> 交互层 -> 逻辑层 -> 数据层。

原因：
- 避免复杂 AI 视频创作业务堆积到单个组件或页面。
- 提升可维护性、可测试性和可替换性。

影响：
- UI 组件禁止直接调用 API。
- 第三方库必须通过 adapter 接入。

## D-004 建立软件工程师 Agent 与 Skill 系统

日期：2026-06-13  
状态：Accepted

决策：
- 在 `docs/agent-system` 建立 Agent 工作流、任务拆解、进度跟进、开发日志、记忆系统、验收体系和 project-local skill。

原因：
- 项目复杂度高，需要多轮持续开发时保持上下文。
- 能让工程 Agent 按统一流程接手任务。

影响：
- 每次开发结束前必须更新进度、日志和必要记忆。

## D-005 建立多 Agent 软件开发流水线

日期：2026-06-13  
状态：Accepted

决策：
- 在项目根目录新增 `agents`，包含 `agents`、`skills`、`docs`、`templates` 四个子目录。
- 建立总架构师、架构师、产品经理、UI/UX、前端工程师、后端工程师、测试工程师、项目经理 Agent。

原因：
- Autumn 涉及产品、UI、前端、后端、数据库、AI 任务、测试验收和项目管理，需要多角色协作。
- 总架构师 Agent 负责统一调度，避免各 Agent 孤立工作。

影响：
- 后续复杂开发任务必须先走 Agent 调度流程。
- 每个角色 Agent 都有对应项目级 Skill 和模板。
- UI 效果图资源统一落地到 `src/assets/ui-mockups` 或 `src/assets/generated-ui`。
