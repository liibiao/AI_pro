# 项目经理 Agent 首轮任务

## 输入

- `docs/agent-system/progress-tracker.md`
- `docs/agent-system/development-log.md`
- `docs/agent-system/memory/project-memory.md`
- `agents/runs/run-001-docs-to-mvp-kickoff/*`

## 本轮管理任务

1. 将 Run 001 记录为已启动。
2. 将 E00、E01、E02、E03 标记为 Sprint 0 范围。
3. 维护阻塞事项：后台接口未确认、UI mockup 未生成。
4. 每次开发完成后更新日志。
5. 将长期决策写入 decision log。

## Sprint 0 看板

| Epic | 状态 | 说明 |
| --- | --- | --- |
| E00 工程化基线 | IN_PROGRESS | 本轮启动 |
| E01 内部组件库与主题 | READY | 等 E00 基线 |
| E02 编辑器工作台布局 | READY | 等组件库基础 |
| E03 状态模型与联动底座 | READY | 可与 E02 并行 |

## 风险

| 风险 | 影响 | 处理 |
| --- | --- | --- |
| 后端真实 API 未确认 | 影响联调 | Sprint 0 使用 Mock + adapter |
| UI mockup 未生成 | 影响视觉细节 | UI/UX Agent 先产出 prompt |
| 依赖安装可能受网络影响 | 影响开发启动 | 使用可用镜像源或临时 npm 方案 |

