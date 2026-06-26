---
name: image-studio-canvas-ui-and-size-transition-fix
overview: 规划修复 `image-studio-canvas.html` 中两类问题：连接生图/生视频节点后比例变化导致下游单图/单视频尺寸突变无动画，以及 UI 提亮范围错误导致画布、顶栏、工具栏、历史栏被误提亮、节点内部提亮不足。
todos:
  - id: verify-targets
    content: 使用 [subagent:code-explorer] 复核样式层级和尺寸同步调用点
    status: pending
  - id: add-media-size-animation
    content: 新增媒体节点尺寸原地动画更新辅助函数
    status: pending
    dependencies:
      - verify-targets
  - id: replace-rerender-paths
    content: 替换图片和视频比例同步中的整节点重渲染路径
    status: pending
    dependencies:
      - add-media-size-animation
  - id: fix-scoped-ui-skin
    content: 添加最终 CSS 收口层恢复外部暗色并提亮节点内部
    status: pending
    dependencies:
      - verify-targets
  - id: add-video-transition
    content: 补充单视频节点宽度和比例过渡样式
    status: pending
    dependencies:
      - fix-scoped-ui-skin
  - id: validate-behavior
    content: 验证比例动画、连线跟随、上传替换动画和 UI 色调
    status: pending
    dependencies:
      - replace-rerender-paths
      - add-video-transition
---

## User Requirements

- 修复单个图片节点、图片预览节点、单个视频节点在连接上游生图/生视频节点后，因上游比例变化导致下游节点渲染尺寸变化时没有动画过渡的问题。
- 保留上传、替换图片后根据图片尺寸自适应并平滑过渡的原有体验。
- 修复 UI 提亮范围错误：节点外部区域，包括画布背景、顶部工具栏、左侧工具栏、生图历史栏，应恢复原来的暗色调。
- 修复节点内部提亮不足：节点本体、节点内部预览区、输入框、按钮、工具条、标签、缩略图、视频区域等应更亮、更清晰，但不能污染节点外部 UI。

## Product Overview

这是对漫剧创作库本地生图工作台画布页面的交互与视觉修正，重点恢复节点尺寸变化的平滑动画，并把亮度增强限定在节点内部。

## Core Features

- 上游生图比例变化时，下游图片类节点平滑缩放。
- 上游生视频比例变化时，下游单视频节点平滑缩放。
- 节点缩放动画期间连接线持续跟随重绘。
- 外部工作台区域恢复暗色皮肤。
- 节点内部 UI 亮度与可读性增强。
- 避免影响无关弹窗、历史面板、顶部按钮和侧栏控件。

## Tech Stack Selection

- 当前项目为本地 HTML/CSS/JavaScript 工作台页面。
- 复用现有单文件实现：`tools/workbench-web/image-studio-canvas.html`。
- 不引入新框架、不拆分新模块、不改动后端服务。

## Implementation Approach

- 采用小范围补丁方式修复，不重写页面结构。
- 尺寸动画问题通过“原地更新 DOM”解决：对纯尺寸/比例变化不再删除并重建节点，而是在已有节点元素上直接更新 `width` 与卡片 `aspect-ratio`，让现有 CSS transition 生效。
- UI 提亮问题通过最终 CSS 收口层解决：在样式末尾恢复节点外工作台暗色，同时只用 `.node ...` 作用域提亮节点内部，避免全局亮色皮肤继续污染画布、顶栏、侧栏和历史栏。
- 对单视频节点补充与图片卡片一致的宽度/比例过渡样式，保证图片和视频体验一致。
- 动画期间使用短时 `requestAnimationFrame` 重绘连接线，避免节点尺寸变化但连线滞后的视觉问题。

## Implementation Notes

- 不改 `rerenderNode` 的全局语义，避免影响大量依赖重渲染的节点逻辑。
- 只在 `syncConnectedImageNodeSizesFromSource` 和 `syncConnectedVideoNodeSizesFromSource` 的纯尺寸同步路径中使用原地更新。
- 原地更新失败时回退到 `rerenderNode`，保证节点缺失或 DOM 异常时功能仍可用。
- CSS 最终收口层应放在 `&lt;/style&gt;` 前，优先级高于现有 `Brighter canvas skin`。
- 节点内部提亮选择器必须尽量以 `.node` 开头，避免影响顶部栏、左侧工具栏、右侧历史栏、弹窗和连接目标面板。
- 保留上传/替换图片路径中的 `attachImageAutoSize` 行为，不做破坏性调整。

## Architecture Design

- 现有页面结构保持不变：
- CSS 层负责视觉皮肤、节点内部提亮、尺寸过渡。
- 节点渲染层继续使用 `renderNode` / `rerenderNode`。
- 尺寸同步层新增轻量辅助函数，用于媒体节点尺寸原地动画更新。
- 连接线层继续复用 `drawConns()`。
- 数据流：
- 上游比例变更 → 计算下游节点 ratio/size → 原地更新 DOM 尺寸 → CSS transition 执行动画 → 动画期间重绘连接线。

## Directory Structure

```text
/Users/billy/Documents/AI_pro/漫剧创作库/
└── tools/
    └── workbench-web/
        └── image-studio-canvas.html  # [MODIFY] 修复画布节点尺寸动画与 UI 提亮作用域。新增媒体节点尺寸原地更新 helper，调整上游比例同步逻辑，补充单视频节点过渡样式，并添加最终 CSS 收口层恢复外部暗色、提亮节点内部。
```

## Key Code Structures

- 新增媒体尺寸原地更新辅助函数：
- 输入：节点 id、媒体类型 image/video。
- 行为：同步节点尺寸数据，更新已有 DOM 的 `width` 与 `.preview-card/.aio-preview` 的 `aspectRatio`，短时间循环重绘连接线。
- 返回：成功原地更新返回 true，失败返回 false。

## Agent Extensions

### SubAgent

- **code-explorer**
- Purpose: 在实施前复核 `image-studio-canvas.html` 中 CSS 层级、节点尺寸同步函数和调用点，避免遗漏后写样式或重复渲染路径。
- Expected outcome: 明确最终修改点，确认不会影响上传替换图片、自定义拖拽尺寸、弹窗和历史栏。