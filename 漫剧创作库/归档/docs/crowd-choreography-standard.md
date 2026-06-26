# 群体调度与走位美学规范 (Crowd Choreography & Blocking Standard)

> 适用范围：AI 视频生成、分镜设计、复杂场景调度
> 核心目标：解决 AI 生成多人场景时的“假人群”、“穿模混乱”和“扁平化”，通过焦点的让渡与空间纵深设计，建立电影级的场面调度（Blocking）。

---

## 1. 核心问题与指导思想
**痛点**：AI 生成的群演往往像贴图，要么所有人一起乱动（导致画面崩溃），要么所有人像木桩一样发呆。
**原则**：群像戏的本质是**“焦点的管理”**。不是人越多越好，而是**“动与静的对比”**以及**“前景、中景、远景的层次”**。

---

## 2. 空间纵深与层次构建

### 2.1 三层空间法则 (Three-Tier Depth)
任何超过 3 人的场景，必须拆分为前景（Foreground）、中景（Midground）和远景（Background）。
- **前景**：可以放模糊的遮挡物（如酒杯、一根柱子、某人的肩膀）。
- **中景（焦点区）**：主要角色发生互动或对话的地方。
- **远景（环境区）**：群演活动的区域。
- **提示词映射**：`shallow depth of field, focused on the main character in the midground, blurred silhouettes of people talking in the background, a wine glass in the extreme foreground`

### 2.2 Z轴运动 (Z-Axis Movement)
不要只让角色左右（X轴）走动，这非常像 2D 街机游戏。必须让角色**向着镜头走来（Push In）**或**背对镜头离去（Pull Away）**。
- **视觉效果**：强烈的 3D 空间感和压迫感。

---

## 3. 焦点的让渡与群演状态 (Focus & Extras State)

### 3.1 动静对比律 (Contrast of Motion)
- **主角动，群演静**：主角穿过拥挤的人群，人群像被按了暂停键（或动作极慢），以凸显主角的目的性（时间凝滞感）。
- **群演动，主角静**：时间流逝的蒙太奇。主角独自坐在酒馆/街头，周围的人群化作高速模糊的残影（Motion Blur）。
- **提示词映射**：`main character sitting perfectly still, surrounded by heavy motion blur of a fast-moving crowd, time-lapse effect`

### 3.2 群体的“流体感”与阵型受力 (Crowd Fluidity)
群体在面对强大的外力（主角登场、爆炸、巨兽）时，不应是零散的个体反应，而应该像“流体”一样被排开。
- **摩西分海**：大人物登场，人群像潮水般向两侧整齐地退避，让出一条通道。
- **溃散如蚁**：巨大的恐惧降临时，人群不是乱跑，而是呈放射状向画外逃散。
- **提示词映射**：`the massive crowd parts like the Red Sea as he walks through, people shrinking back in synchronized fear, forming a clear path`

---

## 4. 工作流执行门禁
- **Director (导演)**：在讲戏本中，凡是群像戏，必须画出或写明**“Z轴运动轨迹”**和**“三层空间”**的分布。
- **Studio (执行)**：严禁在提示词中写 `everyone is moving/fighting`。必须明确指定谁是清晰的焦点（Focus），谁是模糊的背景（Blurred background）。