# 总架构师调度计划

负责 Agent：总架构师 Agent  
Run：001  
状态：IN_PROGRESS

## 1. 调度目标

将 `docs` 中的需求、交互、技术架构和编码规范输入多 Agent 流水线，启动 MVP Sprint 0，建立可持续开发基线。

## 2. Agent 调度顺序

```text
产品经理 Agent
  -> UI/UX Agent
  -> 架构师 Agent
  -> 前端工程师 Agent
  -> 后端工程师 Agent
  -> 测试工程师 Agent
  -> 项目经理 Agent
```

## 3. 本轮任务分配

| Agent | 本轮任务 | 输出 |
| --- | --- | --- |
| 产品经理 Agent | 把现有 docs 转为 MVP 用户故事和功能切片 | `requirement-ingestion.md` |
| UI/UX Agent | 输出首屏工作台 UI brief 和出图计划 | `ui-ux-brief.md` |
| 架构师 Agent | 明确 Sprint 0 架构边界与模块依赖 | `architecture-brief.md` |
| 前端工程师 Agent | 准备工程化、组件库和 EditorShell 开发 | `frontend-engineer-brief.md` |
| 后端工程师 Agent | 输出首批接口契约和 Mock 适配建议 | `backend-engineer-brief.md` |
| 测试工程师 Agent | 输出 Sprint 0 验收清单 | `qa-engineer-brief.md` |
| 项目经理 Agent | 更新进度、日志、记忆、风险 | `project-manager-brief.md` |

## 4. 首轮交付边界

Sprint 0 只启动工程底座，不开发完整 AI 生成闭环。

必须完成：

- 前端依赖和目录结构。
- 深色主题变量。
- 公共组件库第一批。
- EditorShell 工作台骨架。
- 领域类型和 Zustand store 骨架。
- Mock 数据和 adapter 机制。
- UI 效果图 prompt 和资源目录。
- 后端接口契约草案。
- QA 验收清单。

不在 Sprint 0 完成：

- 真实 AI 生图 / 生视频。
- 完整后台联调。
- 完整时间线剪辑。
- 完整导出转码。

## 5. 技术约束

- 必须遵守 `docs/architecture-and-coding-guidelines.md`。
- 前端 UI 不得直接调用 API。
- 后端 DTO 必须经 adapter 转换。
- 生图、生视频、对话流、故事板、资产、时间线必须独立模块。
- 所有进度和决策必须记录。

