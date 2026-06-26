# UI 效果图与资源生成流水线

## 1. 目标

UI/UX Agent 使用 Codex 的 GPT Image 2 模型生成 Autumn 工作台 UI 效果图，并把生成资源落地到项目资源目录。

## 2. 资源目录

```text
src/assets/ui-mockups/      # UI 效果图、页面 mockup
src/assets/generated-ui/    # 可用于项目界面的生成视觉资源
agents/templates/           # UI prompt 模板
```

## 3. 生成流程

1. 产品经理 Agent 提供页面目标和功能范围。
2. UI/UX Agent 输出交互说明和视觉方向。
3. 架构师 Agent 确认页面结构不会破坏布局系统。
4. UI/UX Agent 使用 `image-generation-prompt-template.md` 编写 prompt。
5. 使用 GPT Image 2 生成 UI 效果图。
6. 保存到 `src/assets/ui-mockups/`。
7. 前端工程师 Agent 根据效果图实现组件。
8. UI/UX Agent 对前端实现做暗色 / 白天双主题 1:1 视觉验收。
9. UI/UX Agent `PASS` 后，测试工程师 Agent 才能做功能和浏览器验收。

硬性规则：

- 效果图是实现合同，不是氛围参考。
- 前端实现必须还原布局、字体、色调、控件尺寸、线条、圆角、阴影、间距和交互状态。
- UI/UX Agent 未 `PASS` 时，任务状态为 `UI_REDO`，不允许进入测试或下一轮开发。

## 4. 双主题要求

Autumn UI 必须支持两套主题：

- 夜间模式：深色专业创作工作台，适合长时间视频创作。
- 白天模式：白色 / 浅灰 / 柔和蓝绿配色，适合明亮办公环境。

每次 UI mockup 输出时，必须成对生成：

```text
src/assets/ui-mockups/YYYYMMDD-editor-workspace-dark-4k.png
src/assets/ui-mockups/YYYYMMDD-editor-workspace-light-4k.png
```

单主题效果图只允许作为临时探索稿存在，不允许作为最终交付资源进入前端实现。若用户只提供单主题参考，UI/UX Agent 必须主动补齐另一套主题。

当前已生成：

- `src/assets/ui-mockups/20260613-editor-workspace-reference-v02-4k.png`
- `src/assets/ui-mockups/20260613-editor-workspace-reference-v03-light-4k.png`

## 5. 双主题验收清单

每次资源交付前必须检查：

- 是否同时存在 `dark` 和 `light` 两个文件。
- 两个文件是否都为 3840 x 2160。
- 两个文件是否是同一页面 / 状态 / 布局的主题变体，而不是不同功能状态。
- 文件是否写入 `src/assets/ui-mockups/README.md`。
- Prompt、源文件和项目文件是否写入当前 run 的 `ui-asset-generation-log.md`。
- 相关交互文档是否同步引用两套主题。

## 6. 前端 1:1 视觉验收清单

前端实现完成后，UI/UX Agent 必须检查：

- 暗色实现截图是否与暗色效果图一致。
- 白天实现截图是否与白天效果图一致。
- 页面布局、组件比例和面板尺寸是否一致。
- 字体字号、字重、行高和文字颜色是否一致。
- 背景、渐变、透明度、边框、线条、圆角、阴影是否一致。
- hover、selected、disabled、loading、empty、error、generating 状态是否一致。
- 交互逻辑、弹窗位置、输入区高度、滚动区域是否一致。

结论只能是 `PASS` 或 `REDO`。

## 7. Prompt 要求

UI 效果图必须包含：

- 产品名 Autumn / VidFlow AI。
- 深色三栏 + 底部时间线工作台。
- 左侧资产 / 故事板。
- 中间画布预览。
- 右侧对话 / 参数。
- 底部视频时间线。
- 高密度专业创作工具风格。

禁止：

- 营销落地页。
- 纯装饰 hero。
- 与真实产品无关的抽象背景。
- 无法落地的夸张视觉。
