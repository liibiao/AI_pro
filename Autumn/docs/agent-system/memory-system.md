# Autumn 记忆系统设计

文档版本：V1.0  
更新日期：2026-06-13  
目的：让软件工程师 Agent 在多次会话、多次开发、多人协作中保留关键上下文，避免重复决策和遗忘架构约束。

## 1. 记忆分层

```text
长期记忆 Long-term Memory
  项目定位、架构原则、模块边界、固定技术选型

决策记忆 Decision Memory
  已确认的技术决策、原因、影响、替代方案

任务记忆 Task Memory
  当前任务状态、阻塞、验证结果、下一步

模块记忆 Module Memory
  每个业务模块的文件结构、约束、注意事项

接口记忆 API Memory
  后台接口字段、鉴权、错误码、联调问题
```

## 2. 文件结构

```text
docs/agent-system/memory/
├── project-memory.md      # 长期项目上下文
├── decision-log.md        # 技术决策记录
└── module-notes.md        # 模块级注意事项，后续按需新增
```

## 3. 更新规则

每次开发结束前，Agent 必须判断是否需要更新记忆：

- 如果新增了架构决策，更新 `decision-log.md`。
- 如果发现新的模块边界或约束，更新 `project-memory.md` 或 `module-notes.md`。
- 如果只是短期任务进度，更新 `progress-tracker.md` 和 `development-log.md`。
- 如果发现接口字段、错误码、鉴权规则，更新 API 相关记忆。

## 4. 记忆写入标准

只记录长期有用的信息，避免把过程噪音写入记忆。

应该写入：

- 已确认技术选型。
- 模块边界。
- 后台接口约定。
- 不可违反的架构原则。
- 常见错误与解决方式。
- 用户明确偏好。

不应该写入：

- 临时命令输出。
- 一次性调试细节。
- 未确认猜测。
- 重复的任务描述。

## 5. Agent 读取顺序

每次开始开发前：

1. 读取 `docs/agent-system/memory/project-memory.md`。
2. 读取 `docs/agent-system/memory/decision-log.md`。
3. 读取 `docs/agent-system/progress-tracker.md`。
4. 按任务需要读取相关模块文档。

