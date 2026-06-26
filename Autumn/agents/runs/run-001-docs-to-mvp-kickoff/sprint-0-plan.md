# Sprint 0 执行计划

Sprint 名称：工程底座与工作台骨架  
建议周期：3-5 天  
状态：IN_PROGRESS

## 1. Sprint 目标

建立 Autumn MVP 的前端开发底座，使项目从当前演示页进入真实工作台开发状态。

## 2. Sprint 范围

### 必做

- 安装生产依赖。
- 配置路径别名。
- 建立源码目录结构。
- 建立深色主题变量。
- 建立公共组件库第一批。
- 建立领域类型。
- 建立 Zustand store 骨架。
- 建立 Mock 数据。
- 实现 EditorShell 三栏 + 时间线骨架。
- 输出 UI mockup prompt。
- 输出后端接口契约草案。

### 不做

- 真实 AI 生成。
- 完整文件上传。
- 真实导出。
- 完整时间线剪辑。
- 团队协作。

## 3. 任务清单

| Task ID | Owner Agent | 任务 | 状态 |
| --- | --- | --- | --- |
| S0-001 | 前端工程师 | 安装生产依赖 | READY |
| S0-002 | 前端工程师 | 配置路径别名和目录结构 | READY |
| S0-003 | 前端工程师 | 建立主题变量 | READY |
| S0-004 | 前端工程师 | 建立公共组件第一批 | READY |
| S0-005 | 前端工程师 | 建立领域类型和 Mock 数据 | READY |
| S0-006 | 前端工程师 | 建立 Zustand store 骨架 | READY |
| S0-007 | 前端工程师 | 实现 EditorShell 骨架 | READY |
| S0-008 | UI/UX | 输出工作台 UI prompt 和 mockup | DONE |
| S0-009 | 后端工程师 | 输出接口契约草案 | READY |
| S0-010 | 测试工程师 | 输出 Sprint 0 验收用例 | READY |
| S0-011 | 项目经理 | 更新进度、日志、记忆 | IN_PROGRESS |
| S0-012 | UI/UX | 输出主页暗 / 亮 4K 效果图 | DONE |
| S0-013 | UI/UX + 前端工程师 | 定义新建项目空态与面板组合状态 | DONE |

## 4. Sprint 0 完成标准

- `npm run lint` 通过。
- `npm run build` 通过。
- 浏览器能打开工作台。
- 三栏 + 底部时间线无重叠。
- Mock 数据可展示。
- 至少有一个分镜选中联动。
- 文档、进度、日志、记忆已更新。
