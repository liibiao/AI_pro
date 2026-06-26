# 测试工程师 Agent 首轮任务

## 输入

- `docs/agent-system/acceptance-plan.md`
- `agents/docs/quality-gates.md`
- `agents/runs/run-001-docs-to-mvp-kickoff/sprint-0-plan.md`

## Sprint 0 验收范围

| 范围 | 验收点 |
| --- | --- |
| 工程化 | lint/build 通过 |
| 布局 | 三栏 + 底部时间线稳定显示 |
| 主题 | 深色主题变量生效 |
| 组件 | 公共组件基础状态可用 |
| Mock 数据 | 分镜、对话、时间线占位数据正常展示 |
| 状态联动 | 选中分镜时预览/参数/时间线同步 |
| 视觉 | 1280x720、1440x900、1920x1080 无明显重叠 |

## 首批测试用例

1. 打开首页或编辑器，确认显示工作台。
2. 点击故事板镜头，确认中间画布标题和时间线高亮变化。
3. 切换左侧 Assets / Storyboard Tab。
4. 切换右侧 Chat / Params Tab。
5. 折叠和展开底部时间线。
6. 校验 seed 输入非法值提示。

## 验收结论标准

- 无 P0/P1 缺陷。
- 构建成功。
- 页面无白屏。
- 控制台无 error。
- 核心布局无遮挡。

