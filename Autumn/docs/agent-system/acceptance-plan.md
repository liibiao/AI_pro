# Autumn 功能测试与验收计划

文档版本：V1.0  
更新日期：2026-06-14

## 1. 验收层级

Autumn 的验收分为六层：

```text
静态检查
  -> 单元测试
  -> 组件测试
  -> 集成测试
  -> UI/UX 1:1 视觉验收
  -> 浏览器 / 端到端验收
```

## 2. 静态检查

每次提交前必须通过：

- TypeScript 类型检查。
- ESLint。
- 构建。

推荐命令：

```bash
npm run lint
npm run build
```

## 3. 单元测试范围

优先覆盖纯逻辑：

- 参数校验：seed、iw、cw、sw。
- 错误码映射。
- DTO adapter。
- prompt 约束拼接。
- 时间线总时长计算。
- 故事板排序同步。
- 任务状态机。

## 4. 组件测试范围

优先覆盖公共组件和关键业务组件：

- `AppButton`
- `IconButton`
- `Panel`
- `StatusBadge`
- `ProgressBar`
- `StoryboardCard`
- `ChatComposer`
- `GenerationParamForm`
- `TimelineClip`
- `AssetThumbnail`

必须覆盖：

- loading。
- disabled。
- empty。
- error。
- success。
- hover / selected。

## 5. 集成测试范围

重点验证 store、service、adapter 的联动：

| 场景 | 验收 |
| --- | --- |
| 选中故事板镜头 | 画布、参数、时间线同步 |
| 故事板排序 | 时间线片段顺序同步 |
| 对话创建生成任务 | 故事板和时间线插入占位 |
| Socket 推送成功 | 镜头状态、缩略图、视频 URL 更新 |
| Socket 推送失败 | 显示友好错误和重试入口 |
| 时间线调整时长 | 分镜时长和总时长更新 |

## 6. E2E 核心用例

### 6.1 创建项目到导出

```text
进入项目列表
  -> 新建项目
  -> 进入编辑器
  -> 输入 AI 指令
  -> 创建生成任务
  -> 等待任务完成
  -> 预览镜头
  -> 调整时间线片段
  -> 保存项目
  -> 发起导出
  -> 导出完成并下载
```

验收标准：

- 所有关键状态有反馈。
- 页面不白屏。
- 控制台无 error。
- 失败场景可重试。

### 6.2 圈选改图

```text
选中镜头
  -> 在画布圈选区域
  -> 输入局部修改指令
  -> 创建改图任务
  -> 进度同步
  -> 结果刷新画布
```

验收标准：

- 选区坐标准确。
- 任务 payload 包含选区和参数。
- 结果同步故事板和资产库。

## 7. 浏览器视觉验收

### 7.1 UI/UX 1:1 视觉验收硬门禁

所有涉及 UI 的任务，必须在测试工程师 Agent 正式验收前通过 UI/UX Agent 的 1:1 视觉验收。

验收要求：

- 暗色和白天两套参考效果图齐全。
- 暗色和白天两套前端实现截图齐全。
- 页面样式、布局、交互逻辑、字体字号、字重、行高、色调、颜色、组件交互、控件尺寸、线条粗细颜色、圆角、阴影和间距与效果图一致。
- 所有页面状态都覆盖：默认、hover、selected、disabled、loading、empty、error、generating、success。
- UI/UX Agent 只能输出 `PASS` 或 `REDO`。

阻塞规则：

- 未通过 UI/UX Agent 验收的 UI，不允许进入测试工程师 Agent 验收。
- 功能可运行但视觉未通过，状态为 `FUNCTIONAL_READY / UI_REDO`。
- UI/UX Agent 给出 `REDO` 时，必须退回前端工程师 Agent 重做。

### 7.2 浏览器视觉验收

桌面端至少检查：

- 1920x1080。
- 1440x900。
- 1280x720。

检查重点：

- 三栏比例正确。
- 底部时间线不遮挡内容。
- 文本不溢出。
- 面板折叠后布局稳定。
- 深色主题对比度可读。
- hover、selected、disabled 状态清晰。

## 8. 功能完成定义

一个功能只有同时满足以下条件才算 DONE：

- 需求对应的 UI、交互、状态和接口逻辑完整。
- 涉及 UI 的任务已经通过 UI/UX Agent 暗色 / 白天双主题 1:1 视觉验收。
- 关键错误和空状态已处理。
- 类型定义完整，无 `any` 绕过核心类型。
- 通过 lint 和 build。
- 必要测试通过。
- 更新了 `progress-tracker.md`。
- 更新了 `development-log.md`。
- 如有长期决策，更新了 `memory/decision-log.md`。
