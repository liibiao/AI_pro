# Autumn Multi-Agent Software Development Pipeline

本目录是 Autumn 项目的多 Agent 软件开发流水线。它负责把产品需求、架构设计、前后端开发、测试验收、项目管理、UI 设计、记忆维护组织成一套可持续运行的协作系统。

## 目录结构

```text
agents/
├── agents/       # 角色 Agent 定义
├── skills/       # 每个 Agent 对应的项目级 Skill
├── docs/         # 方法论、协作协议、运行流程、质量门禁
├── templates/    # 开发过程模板
└── runs/         # 每次流水线运行记录和交付包
```

## Agent 角色

| Agent | 核心职责 |
| --- | --- |
| 总架构师 Agent | 调度所有 Agent，守住系统边界和交付质量 |
| 架构师 Agent | 业务架构、技术架构、模块边界、接口契约 |
| 产品经理 Agent | 需求收集、竞品分析、PRD 和功能优先级 |
| UI/UX Agent | 交互文档、视觉规范、UI 效果图和资源落地 |
| 前端工程师 Agent | React/Vite 前端功能开发、组件库、状态联动 |
| 后端工程师 Agent | 后台服务、管理系统接口、数据库和任务服务 |
| 测试工程师 Agent | 测试计划、用例、自动化、验收与缺陷回归 |
| 项目经理 Agent | 进度跟进、日志、记忆系统、风险和交接管理 |

## 基本运行原则

- 总架构师 Agent 负责调度，不直接替代所有 Agent 做细节工作。
- 产品经理 Agent 先把零散需求整理为可评审需求。
- 架构师 Agent 在开发前定义业务架构、技术架构和模块依赖。
- 前后端工程师 Agent 按架构边界并行开发。
- 测试工程师 Agent 独立验收，不接受“开发自测通过”等同验收。
- 项目经理 Agent 维护进度、日志、记忆和风险。
- UI/UX Agent 产出交互文档、视觉方案和 UI mockup 资源。

## 关键入口

- [整体运行流程](./docs/workflow.md)
- [协作协议](./docs/collaboration-protocol.md)
- [职责矩阵](./docs/responsibility-matrix.md)
- [质量门禁](./docs/quality-gates.md)
- [记忆与知识管理](./docs/memory-knowledge-system.md)
- [模板库](./templates/README.md)
- [Run 001: Docs to MVP Kickoff](./runs/run-001-docs-to-mvp-kickoff/README.md)
