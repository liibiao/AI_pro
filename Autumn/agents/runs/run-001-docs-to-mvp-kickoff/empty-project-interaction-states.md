# Empty Project Interaction States

日期：2026-06-13  
负责 Agent：UI/UX Agent + 前端工程师 Agent  
状态：READY_FOR_IMPLEMENTATION

## 1. 设计目标

新建项目进入编辑器后，需要先呈现低干扰的空白创作状态，引导用户从右侧对话框输入创作需求。同时顶部功能按钮允许打开故事板、媒体文件、时间线和文档面板。

这些状态不是孤立页面，而是同一个 `EditorShell` 下的可组合面板状态。

## 2. 状态模型建议

```ts
type WorkspacePanel = 'storyboard' | 'media' | 'timeline' | 'document';

interface EditorWorkspaceState {
  projectTitle: string;
  openPanels: WorkspacePanel[];
  activePreviewMode: 'empty' | 'asset' | 'shot' | 'video';
  chatState: 'empty' | 'active' | 'generating' | 'error';
}
```

## 3. 空白状态清单

| State ID | 触发方式 | `openPanels` | 主区域布局 | 右侧对话 |
| --- | --- | --- | --- | --- |
| EWS-00 | 点击创建项目后进入 | `[]` | 大预览空态，中央显示 Create/开始引导 | 空消息 |
| EWS-01 | 点击故事板 | `['storyboard']` | 左侧故事板空态 + 右侧对话 | 空消息 |
| EWS-02 | 点击媒体文件 | `['media']` | 左侧媒体文件空态 + 中间预览空态 + 右侧对话 | 空消息 |
| EWS-03 | 点击时间线 | `['timeline']` | 上方预览空态 + 底部时间线空轨道 + 右侧对话 | 空消息 |
| EWS-04 | 点击文档 | `['document']` | 左侧文档导航 + 中间文档空态 + 右侧对话 | 空消息 |
| EWS-05 | 同时点击故事板与媒体文件 | `['storyboard', 'media']` | 左故事板 + 中间预览/媒体上下堆叠 + 右侧对话 | 空消息 |

## 4. 已生成 4K 参考图

- EWS-00 默认空白工作台：`src/assets/ui-mockups/20260613-empty-project-default-dark-4k.png`
- EWS-00 默认空白工作台白天模式：`src/assets/ui-mockups/20260614-empty-project-default-light-4k.png`
- EWS-01 到 EWS-04 四状态对照板：`src/assets/ui-mockups/20260613-empty-project-panel-states-dark-4k.png`
- EWS-01 到 EWS-04 四状态对照板白天模式：`src/assets/ui-mockups/20260614-empty-project-panel-states-light-4k.png`
- EWS-05 故事板 + 媒体文件双开：`src/assets/ui-mockups/20260613-empty-project-storyboard-media-dark-4k.png`
- EWS-05 故事板 + 媒体文件双开白天模式：`src/assets/ui-mockups/20260614-empty-project-storyboard-media-light-4k.png`

## 5. 前端实现规则

- 顶部故事板、媒体文件、时间线、文档按钮使用同一套 `ToolbarToggleButton`。
- 故事板和媒体文件允许同时打开。
- 时间线打开时占用主区域底部轨道区，不强制关闭故事板 / 媒体文件，但 MVP 可先限制为单独状态。
- 文档打开时使用文档工作区布局，MVP 可作为互斥主模式。
- 右侧对话面板在所有状态下保持固定存在，避免用户失去对话驱动创作入口。
- 空态组件统一下沉为 `EmptyState`，通过 `icon`、`title`、`description`、`action` 参数配置。

## 6. 待补齐资源

- EWS-01 故事板单开 4K 效果图。
- EWS-02 媒体文件单开 4K 效果图。
- EWS-03 时间线单开 4K 效果图。
- EWS-04 文档单开 4K 效果图。
- EWS-01 到 EWS-04 已有四状态对照板，后续如需切图到独立页面，再逐张生成。
- 后续所有新增状态仍必须按暗色 / 白天成对生成。
