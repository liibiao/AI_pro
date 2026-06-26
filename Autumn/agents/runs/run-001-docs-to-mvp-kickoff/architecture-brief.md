# 架构师 Agent 首轮任务

## 输入

- `docs/frontend-technical-architecture.md`
- `docs/architecture-and-coding-guidelines.md`
- `docs/development-implementation-plan.md`
- `agents/docs/methodology.md`

## 架构结论

Sprint 0 架构目标是建立可演进骨架，而不是一次性实现全部业务。

## 前端目标目录

```text
src/
├── api/
├── adapters/
├── assets/
├── business-components/
├── components/
├── constants/
├── hooks/
├── mocks/
├── pages/
├── router/
├── services/
├── store/
├── types/
└── utils/
```

## 分层边界

- `api`：请求、Socket、上传下载。
- `adapters`：DTO 和第三方库适配。
- `services`：业务逻辑和 orchestration。
- `store`：Zustand 状态与 action。
- `hooks`：交互层。
- `components`：通用组件。
- `business-components`：业务展示组件。
- `pages`：页面装配。

## Sprint 0 必建模块

- `types/project.ts`
- `types/storyboard.ts`
- `types/asset.ts`
- `types/chat.ts`
- `types/timeline.ts`
- `types/params.ts`
- `store/projectStore.ts`
- `store/storyboardStore.ts`
- `store/timelineStore.ts`
- `store/chatStore.ts`
- `store/paramStore.ts`
- `mocks/editorMockData.ts`

## 首批编排服务

- `services/orchestration/selectShotAcrossWorkspace.ts`
- `services/orchestration/syncShotToTimeline.ts`

## 架构风险

- 如果 Sprint 0 直接上真实 API，容易被后台字段阻塞。建议先 Mock + adapter。
- 如果 UI 组件直接读写多个 store，后续会变成强耦合。建议容器组件收口。

