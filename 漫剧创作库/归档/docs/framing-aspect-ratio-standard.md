# 构图与画幅比例美学规范 (Framing & Aspect Ratio Standard)

> 适用范围：导演分镜、AI 生图 (Midjourney)、视频生成构图
> 所属方法论：**《后期视听总规范》- 1.3 视觉引导（Visual Guidance）**
> 核心目标：解决 AI 极易生成的“千篇一律的居中大头照”、“画面死板拥挤”的问题，用构图的隐喻来建立电影级的格局和情绪。

---

## 1. 负空间与黄金分割 (Negative Space & Rule of Thirds)
**痛点**：把人塞满画面中心，没有呼吸感和情绪留白。
**执行标准**：构图即视角，留白即危险。
- **三分线法则**：禁止无脑居中。将主角放在画面左侧/右侧的三分线上。
- **负空间（Negative Space）的隐喻**：
  - *视线前方的大片留白*：表示前路的未知、期待或危险的逼近。
  - *背后的巨大阴影留白*：强烈的被监视感、压抑感、或“深渊在凝视”。
- **提示词映射**：`rule of thirds composition, character placed on the far left, massive empty dark space on the right, wide negative space, cinematic framing`

## 2. 框中框与遮挡前景 (Frame within a Frame & Foreground Blocking)
**痛点**：镜头永远直愣愣地怼在角色脸上，没有层次感和第三视角的偷窥感。
**执行标准**：利用环境结构来“框”住角色，建立心理牢笼或层次感。
- **物理门框/窗棂**：通过半掩的门缝、布满灰尘的窗户拍主角，营造一种疏离感、防备感或囚禁感。
- **前景遮挡（Foreground Obscuration）**：镜头贴近桌面边缘、柱子侧面，让画面有 1/3 被失焦（Bokeh）的物体遮挡，增强景深（Depth of Field）。
- **提示词映射**：`shot through a slightly open door, frame within a frame composition, out-of-focus pillar in the extreme foreground, strong depth of field`

## 3. 画幅比例的叙事切换 (Aspect Ratio Shifts)
**痛点**：从头到尾一个长宽比，无法体现场景格局的落差。
**执行标准**：画幅比例本身就是一种蒙太奇。
- **2.35:1 / 2.39:1 (宽银幕 / Widescreen)**：适合展现史诗战场、废土世界、双人对峙的横向拉扯。横向展开的视野能带来强烈的电影大片感。
- **4:3 或 1:1 (方画幅 / Boxed)**：适合表现主角被困密室、极度压抑的心理戏、或者过去的回忆。画面的逼仄感能直接传递心理压力。
- **动态切换**：当主角从压抑的密室（4:3）走到广阔的雪山之巅时，画幅缓缓上下拉开（变成 2.35:1），视觉震撼力倍增。

---
**Reviewer 门禁测试**：
- 如果连续 5 个镜头全是“居中平视大头照”，打回要求修改构图。
- 画面是否给字幕和后续的 UI 包装留出了安全区？如果没有，打回。