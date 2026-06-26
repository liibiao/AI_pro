# 失重与极限运动视觉规范 (Zero-Gravity & Parkour Standard)

> 适用范围：御剑飞行、跑酷追逐、被击飞在半空中、高空坠落
> 核心目标：解决 AI 影视中角色腾空时的“吊威亚感”和“纸片人感”，通过失重滞空时刻、四肢代偿动作和极限视角，还原真实的坠落与飞行体验。

---

## 1. 核心问题与指导思想
**痛点**：AI 生成的人在半空中往往像僵硬的雕塑，要么就是违背物理定律地匀速漂浮，极其像五毛特效的“吊威亚”。
**原则**：失重和飞行的核心不是“漂”，而是**“对重力的对抗与妥协”**。在空中，人的身体会本能地寻找平衡。

---

## 2. 滞空与坠落的物理视觉法则

### 2.1 滞空时刻的悬停 (Hang Time / Apex Moment)
人在跳跃到最高点时，会有一个极其短暂的“重力抵消瞬间”。
- **视觉效果**：这是动作戏中最具张力的爆发前夜。镜头必须在这里稍微“挂”一下（甚至进入极限慢动作），让观众看清角色在空中的姿态和周围的环境。
- **提示词映射**：`frozen at the apex of the jump, a split second of weightlessness in mid-air, extreme slow motion hang time before the plunge`

### 2.2 失去平衡的四肢代偿 (Compensatory Movements)
**最容易犯的错**：人被击飞或坠落时，双手双脚笔直地贴在身侧。
**真实的坠落**：人在空中失去平衡时，手臂会本能地像风车一样挥舞来寻找平衡，双腿会蜷缩或乱蹬。这才是真实的恐慌感和下坠感。
- **提示词映射**：`flailing arms wildly trying to find balance in mid-air, legs kicking desperately during the freefall, body twisting out of control, panicked facial expression`

### 2.3 御风飞行的阻力感 (Wind Resistance & Drag)
仙侠中的御剑飞行或超人的冲刺，不能像在真空里一样平滑。
- **视觉元素**：极速飞行必须有**“破风感”**。脸颊肌肉被狂风吹得轻微变形、衣服紧紧贴在迎风面、披风在身后疯狂撕扯（Fluttering violently）。
- **提示词映射**：`cheeks slightly rippling from extreme wind resistance, clothes pressed tightly against the body, cape fluttering violently behind like a flag in a hurricane, pushing through the sound barrier`

---

## 3. 极限视角的空间眩晕感 (Extreme POV & Vertigo)

表现高空和坠落，镜头调度比人物动作更重要。

### 3.1 荷兰角倾斜 (Dutch Angle / Canted Angle)
- **用途**：表现失控、坠落、方向错乱的绝望感。
- **视觉效果**：地平线严重倾斜，让观众在心理上感到不安和失衡。
- **提示词映射**：`extreme Dutch angle, tilted horizon, disorienting perspective of falling down a skyscraper`

### 3.2 FPV 穿越机主观视角 (First-Person View / Drone Shot)
- **用途**：极限跑酷、穿梭在狭窄峡谷或楼宇之间的追逐。
- **视觉效果**：镜头像鸟一样高速穿梭，边缘带有强烈的速度模糊（Motion Blur）和广角畸变。
- **提示词映射**：`FPV drone shot, extreme high-speed dive, rushing past narrow concrete walls, intense motion blur on the edges of the frame, dizzying sense of speed`

---

## 4. 工作流执行门禁
- **Director (导演)**：在设计高空、坠落或飞行戏份时，必须明确写出角色在空中的**“肢体挣扎状态”**，并指定镜头角度（如：使用仰拍展示滞空，使用 FPV 展示追逐）。
- **Studio (执行)**：严禁生成“双手紧贴身侧”的悬浮僵尸。必须用提示词如 `flailing, twisting, wind resistance` 来打破平滑感。
- **Reviewer (审片)**：
  - 如果飞行没有阻力感（衣服不飘、头发不动），打回重做。
  - 如果最高点没有悬停（Hang Time），直接匀速下坠，打回重做。