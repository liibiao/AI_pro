# 前端工程师 Agent 首轮任务

## 输入

- `docs/frontend-technical-architecture.md`
- `docs/architecture-and-coding-guidelines.md`
- `agents/runs/run-001-docs-to-mvp-kickoff/architecture-brief.md`

## Sprint 0 前端任务

| Task ID | 任务 | 输出 |
| --- | --- | --- |
| FE-S0-001 | 安装前端依赖 | package.json |
| FE-S0-002 | 建立目录结构 | src 目录 |
| FE-S0-003 | 建立主题变量 | src/assets/styles |
| FE-S0-004 | 建立公共组件第一批 | components |
| FE-S0-005 | 建立领域类型 | types |
| FE-S0-006 | 建立 Zustand store 骨架 | store |
| FE-S0-007 | 建立 Mock 数据 | mocks |
| FE-S0-008 | 实现 EditorShell 骨架 | pages/Editor + business-components |

## 首批组件

- `AppButton`
- `IconButton`
- `Panel`
- `PanelHeader`
- `SegmentedTabs`
- `StatusBadge`
- `ProgressBar`
- `EmptyState`
- `ErrorNotice`

## 开发约束

- 不在 `App.tsx` 堆业务。
- 不让 UI 组件调用 API。
- 所有业务数据先走 Mock + domain types。
- CSS 使用 CSS Modules + 主题变量。
- 完成后必须跑 lint 和 build。

## 验收

- 浏览器打开后是三栏 + 时间线工作台。
- 1920x1080 无重叠。
- Mock 分镜选中状态能显示。
- 代码分层符合架构规范。

