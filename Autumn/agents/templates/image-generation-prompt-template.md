# GPT Image 2 UI 效果图 Prompt 模板

## Prompt

```text
Create a high-fidelity desktop UI mockup for Autumn / VidFlow AI, a conversational AI video creation platform.

The screen is a professional creative workspace, not a marketing landing page.

Layout:
- top navigation bar with product name, project status, export button, user menu
- left panel with Assets and Storyboard tabs
- center canvas with selected video shot preview and canvas toolbar
- right panel with AI chat assistant and advanced generation parameters
- bottom timeline with video, audio, and subtitle tracks

Visual style:
- choose one theme per prompt: dark/night mode or light/day mode
- dark mode: deep charcoal and navy panels with neon blue, teal, and soft purple accents
- light mode: warm white and soft blue-gray panels with teal, sky blue, amber, and violet accents
- dense but readable SaaS/editor interface
- 8px radius cards and panels
- clear selected, loading, progress, and error states

Content details:
- storyboard cards show thumbnails, duration, model tags, progress
- chat panel shows user prompt and AI progress response
- parameter panel includes seed, iw, cref, sref
- timeline clips align with storyboard shots

Output:
- high-fidelity product UI mockup
- 16:9 desktop viewport
- no stock-photo hero section
- no marketing copy
```

## 双主题成对输出规则

每个页面级、工作台级、状态级 UI prompt 必须配套生成两条 prompt：

```text
Prompt A: dark/night mode
Prompt B: light/day mode
```

两条 prompt 只能改变主题颜色、光影和可读性 token，不应改变信息架构、面板布局、核心文案和交互状态。

## 保存路径

```text
src/assets/ui-mockups/YYYYMMDD-editor-workspace-dark-4k.png
src/assets/ui-mockups/YYYYMMDD-editor-workspace-light-4k.png
```
