# Flova Video Frame Analysis

日期：2026-06-14  
负责 Agent：UI/UX Agent + 产品经理 Agent  
状态：DONE

## 1. 输入

- 录屏：`/Users/billy/Documents/录屏2026-06-14 上午12.59.02.mov`
- 用户截图：13 张 Flova 交互截图。

## 2. 抽帧方法

视频信息：

- 尺寸：3024 x 1964。
- 帧率：60fps。
- 时长：约 829.8 秒。

抽帧策略：

```text
每 20 秒抽 1 帧，缩放到 1920 宽度用于分析。
```

归档路径：

- `src/assets/ui-references/flova-video-analysis/frames/`
- `src/assets/ui-references/flova-video-analysis/screenshots/`
- `src/assets/ui-references/flova-video-analysis/contact-sheets/video-frames-contact.jpg`
- `src/assets/ui-references/flova-video-analysis/contact-sheets/user-screenshots-contact.jpg`

## 3. 状态归纳

### 对话流状态

- CF-01 Skill 匹配。
- CF-02 风格确认 1/2。
- CF-03 时长确认 2/2。
- CF-04 剧本草稿。
- CF-05 脚本确认。
- CF-06 媒体资产生成。

### 生产工作台状态

- PW-01 Skill 已完成 / 空工作台。
- PW-02 文档 / 视频规格。
- PW-03 故事板概览。
- PW-04 角色图生成 / 音色选择。
- PW-05 媒体资产完成 / 音频预览。

### 媒体生成与视频状态

- MG-01 素材生成中 80%。
- MG-02 角色 / 场景图预览。
- MG-03 音频预览。
- MG-04 分镜脚本卡片。
- MG-05 镜头视频生成。
- MG-06 成片预览 / 时间线。

## 4. 已生成效果图

- `src/assets/ui-mockups/20260614-chat-flow-states-dark-4k.png`
- `src/assets/ui-mockups/20260614-chat-flow-states-light-4k.png`
- `src/assets/ui-mockups/20260614-production-workspace-states-dark-4k.png`
- `src/assets/ui-mockups/20260614-production-workspace-states-light-4k.png`
- `src/assets/ui-mockups/20260614-media-generation-video-states-dark-4k.png`
- `src/assets/ui-mockups/20260614-media-generation-video-states-light-4k.png`

## 5. 产品 / 前端实现结论

- Autumn 的核心不是单纯聊天窗口，而是“对话状态驱动工作台布局变化”。
- 右侧对话必须成为任务编排面板，承担问题确认、结果卡、进度卡、反馈评分、停止生成等能力。
- 左侧故事板不只是镜头列表，还承载关键元素、分镜、旁白与音乐的分区。
- 中间预览区需要统一预览图片、音频、视频和生成进度。
- 底部媒体条和时间线应根据当前阶段切换：素材阶段显示媒体条，成片阶段显示多轨时间线。
