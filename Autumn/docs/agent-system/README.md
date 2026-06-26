# Autumn Software Engineer Agent System

本文档目录是 Autumn 项目的工程 Agent 执行系统，用于把现有 PRD、交互文档、技术架构和编码规范转换成可持续执行的开发机制。

## 文档结构

- [软件工程师 Agent 总控方案](./software-engineer-agent-system.md)
- [项目架构整体设计](./architecture-blueprint.md)
- [需求拆解与任务 Backlog](./task-backlog.md)
- [进度跟进看板](./progress-tracker.md)
- [开发日志](./development-log.md)
- [记忆系统设计](./memory-system.md)
- [功能测试与验收计划](./acceptance-plan.md)
- [Skill 系统目录](./skills/README.md)

## Agent 执行顺序

1. 读取 `docs/README.md` 和本目录索引。
2. 读取 `memory/project-memory.md` 和 `memory/decision-log.md`。
3. 根据任务读取相关产品、交互、架构、编码规范文档。
4. 从 `task-backlog.md` 选择任务。
5. 在 `progress-tracker.md` 标记任务状态。
6. 按架构分层实现代码。
7. 运行验证并更新 `development-log.md`。
8. 更新项目记忆和验收结果。

## 状态约定

- `TODO`：尚未开始。
- `READY`：需求清楚，可进入开发。
- `IN_PROGRESS`：正在开发。
- `BLOCKED`：被接口、设计、依赖或权限阻塞。
- `REVIEW`：开发完成，等待检查。
- `DONE`：验收通过。

