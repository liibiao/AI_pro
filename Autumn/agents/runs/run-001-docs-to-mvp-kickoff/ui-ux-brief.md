# UI/UX Agent 首轮任务

## 输入

- `docs/ui-interaction-layout.md`
- `agents/docs/ui-asset-pipeline.md`
- `agents/templates/image-generation-prompt-template.md`

## 视觉方向

- 深色专业创作工具风格。
- 不是营销页。
- 布局采用 TopBar + 三栏 + 底部时间线。
- UI 密度偏高，但信息组织清晰。
- 强调色使用霓虹蓝和浅紫，状态色清晰。

## 本轮任务

1. 产出 Editor 工作台首屏 UI mockup prompt。
2. 使用 GPT Image 2 生成首屏效果图。
3. 将图片保存到 `src/assets/ui-mockups/`。
4. 输出前端实现标注：面板比例、状态样式、组件优先级。

## 首屏 Mockup 必须包含

- 左侧故事板卡片，带缩略图、状态、时长、进度。
- 中间画布，显示选中镜头预览和工具栏。
- 右侧对话流，包含用户指令和 AI 进度回复。
- 右侧参数区域，包含 seed、iw、cref、sref。
- 底部时间线，包含视频、音频、字幕三轨。
- 顶部项目名、保存状态、导出按钮、用户入口。

## 输出路径

- 暗色模式 4K：`src/assets/ui-mockups/20260613-editor-workspace-reference-v02-4k.png`
- 亮色模式 4K：`src/assets/ui-mockups/20260613-editor-workspace-reference-v03-light-4k.png`
- 主页夜间模式 4K：`src/assets/ui-mockups/20260613-home-projects-dark-4k.png`
- 主页白天模式 4K：`src/assets/ui-mockups/20260613-home-projects-light-4k.png`
- 新建项目默认空态 4K：`src/assets/ui-mockups/20260613-empty-project-default-dark-4k.png`
- 新建项目默认空态白天模式 4K：`src/assets/ui-mockups/20260614-empty-project-default-light-4k.png`
- 新建项目四面板状态对照板 4K：`src/assets/ui-mockups/20260613-empty-project-panel-states-dark-4k.png`
- 新建项目四面板状态对照板白天模式 4K：`src/assets/ui-mockups/20260614-empty-project-panel-states-light-4k.png`
- 故事板 + 媒体文件双开空态 4K：`src/assets/ui-mockups/20260613-empty-project-storyboard-media-dark-4k.png`
- 故事板 + 媒体文件双开空态白天模式 4K：`src/assets/ui-mockups/20260614-empty-project-storyboard-media-light-4k.png`
- Prompt 记录到后续 UI 资源生成日志。

## 面板状态补充

新建项目后的空白工作台采用同一个 `EditorShell`，通过 `openPanels` 管理故事板、媒体文件、时间线、文档面板。

详细状态清单见：`agents/runs/run-001-docs-to-mvp-kickoff/empty-project-interaction-states.md`
