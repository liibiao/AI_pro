# 题材视觉方法论手册 (Genre Visual Playbook)

> 适用范围：所有项目立项时的视觉基调定调、场景设计、角色设计、提示词执行
> 核心目标：为不同题材提供**可落地的视觉参数包**，避免"什么题材都画成一种味"
> 扩展方式：每接触一个新题材，按本文框架新增一个章节

---

## 1. 规范定位

现有美术体系（`lighting-color-aesthetics-standard.md`、`texture-aging-standard.md`、`post-production-aesthetics-standard.md` 等）解决的是**通用层**问题——无论什么题材都需要的光影、材质、构图原则。

但不同题材对"什么是高级"的定义完全不同：

| 题材 | 高级感的来源 | 最大陷阱 |
|------|------------|---------|
| 仙侠 | 意境通透、留白呼吸、东方气韵 | 堆砌变成游戏海报 |
| 武侠 | 粗粝质感、真实物理、人味儿 | 变成塑料古装剧 |
| 赛博朋克 | 霓虹层次、冷暖对撞、肮脏细节 | 变成纯色霓虹灯 |
| 末世 | 荒凉侵蚀、灰调克制、残骸叙事 | 变成脏到看不清 |

本手册就是**题材适配层**——告诉每一个 Agent：当你接到仙侠项目时，光影该怎么打、色调该怎么调、环境该怎么堆、质感该怎么写。

### 1.1 与现有文档的关系

```
题材视觉手册（本文）  →  "这个题材该是什么味"
        ↓ 引用
光影色彩规范          →  "光怎么打、色怎么调"（通用技术层）
        ↓ 引用
材质做旧规范          →  "东西要有使用痕迹"（通用技术层）
        ↓ 引用
提示词标准            →  "下笔前逐项自检"（执行层）
        ↓ 引用
Studio Agent          →  "写进 Seedance/MJ 提示词"（生成层）
```

---

## 2. 题材参数包模板（每题材一章）

每个题材章节必须包含以下 6 个模块：

### 2.1 视觉基调（Visual DNA）
- 一句话定义该题材的"高级味"
- 3-5 个不可妥协的视觉基因
- 参考影片/游戏（仅限提取方法，不照搬）

### 2.2 环境构建（Environment Stack）
- 场景层次：前景 / 中景 / 远景各放什么
- 必须元素清单：哪些元素出现才"到位"
- 禁止元素：哪些元素出现就"出戏"

### 2.3 光影模式（Lighting Signature）
- 该题材的主光类型
- 特色光影效果（如仙侠的丁达尔、末世的地平线光）
- 光的情绪功能

### 2.4 色调盘（Color Palette）
- 主色 / 辅色 / 点缀色
- 推荐调色方案（冷调/暖调/混合）
- 禁止色搭配

### 2.5 主体刻画（Subject Rendering）
- 角色外观在该题材下的表现重点
- 动态要求（静态/飘逸/爆发）
- 材质关键词包

### 2.6 质感与负面提示（Texture & Negative Prompts）
- 该题材最容易出现的问题
- 必须加入的质感词
- 必须排除的负面词

---

## 3. 仙侠 / 武侠篇

> 核心心法来源：外部创作者分享的仙侠大景生图 5 步法
> 适用项目：《无限强化·灵纹觉醒》及所有东方玄幻题材

### 3.1 视觉基调（Visual DNA）

**一句话**：仙气不是靠堆出来的，是靠"通透 + 留白 + 一束对的光"透出来的。

**不可妥协的视觉基因**：
1. **意境通透**：画面要有"呼吸感"，雾气、云海、散射光制造空气感，拒绝密不透风
2. **东方气韵**：构图偏"留白式"——主体不填满画面，用大面积环境反衬人物渺小或超脱
3. **体积光在场**：丁达尔效应（耶稣光）不是装饰，是仙侠场景的"签名式视觉"
4. **色彩克制**：青蓝冷调或暖金调为主，饱和度控制在 70-85%，拒绝大红大绿高饱和
5. **动态飘逸**：衣袂、发丝、丝带必须有空气动力学感，暗示"气"的存在

**参考提取**（方法，不照搬表面）：
- 《妖猫传》→ 体积光 + 雾气制造空间纵深，金碧辉煌中的局部暗调
- 《诛仙》→ 角色与自然景观的尺度对比，渺小中见宏大
- 《刺客聂隐娘》→ 极简构图，大留白，"空"即叙事

### 3.2 环境构建（Environment Stack）

#### 场景层次结构

```
┌─────────────────────────────────────┐
│ 远景层（定基调）                       │
│ 云海 / 星空 / 悬浮山 / 仙境全貌 / 远山   │
├─────────────────────────────────────┤
│ 中景层（建空间）                       │
│ 古树 / 亭台 / 瀑布 / 悬崖 / 石阶       │
│ （必须有，但不能喧宾夺主）               │
├─────────────────────────────────────┤
│ 前景层（制造纵深）                     │
│ 飘散的雾气 / 飞舞的落叶 / 水面涟漪     │
│ （用透明/半透明物体制造空气感）          │
├─────────────────────────────────────┤
│ 主体层                                │
│ 角色 + 服装动态 + 光线交互              │
└─────────────────────────────────────┘
```

#### 必须元素清单

| 层次 | 元素 | 作用 |
|------|------|------|
| 远景 | 云海、雾气层 | 空气感 + 仙气氛围 |
| 远景 | 悬浮山/仙岛（如适用） | 世界观暗示 |
| 中景 | 古树/藤蔓/苔藓 | 生命力 + 岁月感 |
| 中景 | 水体（瀑布/溪流/莲池） | 动态 + 反光 |
| 前景 | 花瓣/落叶/飞絮 | 运动暗示 + 空间纵深 |
| 光效 | 丁达尔光束/体积光 | **签名式视觉，几乎必须有** |
| 光效 | 萤火/灵力粒子 | 魔法存在感 |

#### 禁止元素

- 现代建筑轮廓、电线杆、公路
- 西式哥特教堂、维多利亚式建筑（除非有混搭世界观设定）
- 过于密集的城市街道（仙侠场景强调"疏"，不是"密"）

### 3.3 光影模式（Lighting Signature）

#### 仙侠专属光影系统

**主光类型**：自然光 + 超自然光混合

| 光影模式 | 场景 | 提示词 |
|---------|------|--------|
| **丁达尔 / 耶稣光** | 几乎所有仙侠大景 | `god rays, Tyndall effect, volumetric light piercing through morning mist, light shafts through ancient trees` |
| **逆光剪影** | 登场/远眺/离别 | `strong backlighting, character as dark silhouette against luminous sky, rim light on hair edges` |
| **水面反光** | 溪边/莲池/雨天 | `reflections on water surface, shimmering ripples, light dancing on wet stone` |
| **灵力自发光** | 施法/觉醒/战斗 | `glowing spiritual energy casting blue-white light on surroundings, ethereal luminosity, particle emission` |
| **月色冷光** | 夜景/月下对话 | `cold moonlight, silver-blue ambient, soft shadows, night mist` |
| **金殿暖光** | 宗门大殿/仪式 | `golden hour light streaming through pillars, warm amber, dust particles in light beams` |

**仙侠光影铁律**：
- **不要全亮**。仙侠的"仙"来自明暗对比中的那束光，不是整体提亮
- **雾气是最好的光影搭档**。光线必须穿过"什么"才能被看见——雾、烟、尘埃、花瓣
- **灵力发光要有物理感**。发光体必须照亮周围（人物面部反光、地面反光），不能是"飘在空中的光球"

### 3.4 色调盘（Color Palette）

#### 三套经典仙侠调色方案

**方案 A：青蓝冷调（仙境/空灵）**
```
主色：天青 #5B8FA8 / 雾蓝 #8FB4C9
辅色：月白 #D6E6EC / 翠微 #6B8E6B
点缀：灵力金 #E8D282 / 佛光白 #F5F0E8
禁止：大红 #FF0000 / 荧光色 / 纯黑 #000000
提示词：cool blue-green tones, ethereal mist, silver-blue ambient light, desaturated pastel palette
```

**方案 B：暖金调（宗门/庄严）**
```
主色：古金 #C4A265 / 琥珀 #D4A76A
辅色：深褐 #5C3D2E / 暗红 #8B3A3A
点缀：灵光白 #FFF8E7 / 青铜 #8B8B83
禁止：亮黄 / 粉色 / 高饱和橙
提示词：warm golden tones, ancient bronze, amber candlelight, deep earth shadows, sacred atmosphere
```

**方案 C：末法时代灰调（破败/战损）**
```
主色：灰青 #6B7B8D / 苍白 #C9C9BE
辅色：锈褐 #7D5A3C / 枯草黄 #A89B6E
点缀：余烬橙 #CC7722 / 血红暗 #6B2020
禁止：亮色 / 高饱和 / 仙气飘飘的青蓝
提示词：desaturated grey-blue, faded spiritual energy, crumbling ancient structures, ash and dust in the air, bleak atmosphere
```

### 3.5 主体刻画（Subject Rendering）

#### 角色外观重点

| 部位 | 仙侠表现重点 | 提示词 |
|------|------------|--------|
| 发型 | 飘逸长发、发丝有风感、高马尾/半束发 | `flowing long hair caught in wind, wisps of hair drifting, elegant half-updo with loose strands` |
| 服装 | 古风袍服、宽袖、丝带、衣摆飘逸 | `flowing ancient Chinese robes with wide sleeves, silk ribbons trailing in the wind, layered fabric` |
| 配饰 | 发簪、玉佩、灵纹印记、剑穗 | `jade hairpin, glowing spirit sigil on forearm, tassel hanging from sword hilt` |
| 体态 | 挺拔中带飘逸、站姿有"气感" | `graceful upright posture with effortless poise, standing with weightless ease` |

#### 动态要求（仙侠的关键差异化）

仙侠角色的**动态**是区分"古装剧"和"仙侠"的核心标志：

| 动态类型 | 使用场景 | 提示词 |
|---------|---------|--------|
| 衣袂飘飘 | 几乎所有中远景 | `robes billowing in the wind, silk ribbons fluttering, fabric flowing dramatically` |
| 踏剑飞行 | 移动/战斗 | `standing on flying sword, wind rushing through hair and robes, sword trail of light behind` |
| 凌空起舞 | 战斗/施展法术 | `levitating above ground, swirling motion, robes spiraling around body, spiritual energy trailing` |
| 落叶围绕 | 静立/冥想 | `fallen leaves swirling around the figure, petals drifting in slow motion` |
| 灵力涌动 | 觉醒/突破 | `spiritual energy radiating outward, blue-white aura pulsing, cracks of light spreading across body` |

#### 材质关键词包

```
服装材质：silk with subtle shimmer, sheer chiffon layers, coarse hemp inner robes
武器材质：ancient bronze with patina, dark iron with spiritual inscriptions, jade-like translucent blade
环境材质：weathered stone with moss, ancient wood grain, cracked marble, mist-covered tiles
```

### 3.6 质感与负面提示（Texture & Negative Prompts）

#### 仙侠最容易出现的 AI 翻车问题

| 问题 | 原因 | 解决 |
|------|------|------|
| 游戏海报感 | 元素堆太满，每寸画面都有东西 | 强制留白，环境元素不超过 3 层 |
| 塑料古装感 | 布料太光滑，没有材质纹理 | 加入 `coarse silk texture, aged fabric, subtle wrinkles` |
| 棚拍平光感 | 没有方向性光源 | 强制指定主光方向，加阴影 |
| 西方奇幻混入 | AI 把仙侠混成 D&D 风格 | 明确写 `East Asian fantasy, Chinese xianxia, Taoist aesthetics`，禁止 `Western fantasy, European castle` |
| 面部崩坏 | 古风发型+复杂头饰导致 AI 翻车 | 头饰简化，先保脸再保头饰 |

#### 必须加入的质感词

```
volumetric lighting, Tyndall effect, cinematic depth of field,
ethereal atmosphere, ancient Chinese aesthetics, East Asian fantasy,
fine fabric texture, atmospheric haze, spiritual energy particles
```

#### 必须排除的负面词

```
low quality, blurry, noise, deformed fingers, multiple arms, multiple legs,
ugly face, water monster, distorted face, Western fantasy elements,
European architecture, modern buildings, oversaturated colors,
flat lighting, studio lighting, plastic texture, smooth skin without pores,
overcrowded composition, fractal art, bad composition
```

### 3.7 提示词结构模板

#### 仙侠大景（Establishing Shot）

```text
[叙事视角], [景别] shot of [主体描述],
[主体动作/状态],
[前景元素] in foreground,
[中景环境] with [材质],
[远景] in background,
[光影模式], [色调方案],
[质感词],
[负面排除]
```

**示例**：
```text
behavioral observer, extreme wide shot of a lone swordsman in flowing white robes,
standing on the edge of a floating mountain peak, robes billowing dramatically in the wind,
mist and floating petals drifting in the foreground,
ancient pine trees with moss-covered rocks,
endless sea of clouds and distant mountain peaks fading into mist,
god rays piercing through clouds, Tyndall effect, volumetric lighting,
cool blue-green tones, ethereal atmosphere, cinematic depth of field, 8K, HDR,
--no low quality, blurry, oversaturated, Western fantasy, flat lighting
```

#### 仙侠角色特写（Character Close-up）

```text
[叙事视角], [景别] of [角色名] with [发型/服装描述],
[表情/眼神],
[环境光影交互], [灵力效果（如有）],
[背景虚化],
[色调 + 质感]
```

**示例**：
```text
over-the-shoulder perspective, medium close-up of a young cultivator with flowing black hair and jade hairpin,
eyes glowing with determination, faint blue spiritual sigil pulsing on his forearm,
cold moonlight casting silver-blue rim light on his hair, soft mist in the background,
cool blue-green tones, fine silk texture, highly detailed skin pores, cinematic portrait, 8K,
--no blurry, deformed face, flat lighting, plastic skin, Western elements
```

---

## 4. 武侠篇（简版）

> 与仙侠的核心区别：武侠是"人的故事"，仙侠是"超越人的故事"

### 4.1 视觉基调

**一句话**：质感 > 意境。武侠的高级来自粗粝、真实、物理可信。

**核心差异**：

| 维度 | 仙侠 | 武侠 |
|------|------|------|
| 光影 | 通透、空气感、丁达尔 | 硬光、方向明确、高反差 |
| 环境 | 云海、仙境、悬浮山 | 竹林、酒馆、沙漠、古城 |
| 人物动态 | 飘逸、飞行、灵力 | 爆发、闪避、拳拳到肉 |
| 色调 | 冷调通透 / 暖金庄严 | 土黄褐调 / 青灰冷调 |
| 材质重点 | 丝绸光泽、玉质感 | 粗布麻衣、锈铁、汗渍 |

### 4.2 必须元素

```
竹林/古城/荒漠/酒馆（场景）
粗布/麻衣/斗笠/蓑衣（服装）
锈铁刀/木剑/血渍/绷带（道具）
汗水/泥土/伤痕/老茧（质感）
```

### 4.3 光影模式

| 模式 | 场景 | 提示词 |
|------|------|--------|
| 正午硬光 | 沙漠/荒野决斗 | `harsh midday sunlight, deep black shadows, high contrast, dust particles in light` |
| 烛光/火光 | 酒馆/夜晚 | `warm candlelight, flickering shadows, smoke-filled interior, amber glow` |
| 雨天散射光 | 竹林/江南 | `overcast diffused light, rain drops, wet surfaces reflecting grey sky, melancholic` |

### 4.4 质感词包

```
coarse linen texture, worn leather, rusted iron, sweat stains,
battle scars, calloused hands, weathered face, dust-covered,
cracked mud, faded tattoos, blood-stained fabric
```

---

## 5. Agent 调度逻辑

### 5.1 Director（导演）

- **立项时**：确认项目题材 → 查阅本手册对应章节 → 将视觉基因写入导演基调
- **讲戏时**：场景描述必须符合题材的环境构建规则（仙侠不能写成赛博朋克）
- **分镜时**：光影模式必须选用题材对应方案，不能混用

### 5.2 Studio（生成执行）

- **生图前**：根据题材加载对应色调盘和质感词包
- **提示词中**：必须包含题材的环境必须元素 + 光影模式词 + 材质词
- **负面提示**：必须包含题材对应的禁止项

### 5.3 Librarian（资产库）

- **新建项目时**：创建题材专属参数包引用，从本手册复制对应章节的"速查卡"版本
- **资产标签**：新增 `@genre` 标签，标识资产适用题材

### 5.4 Reviewer（质检）

- **风格一致性**：检查同一项目中是否混用了不同题材的视觉语言
- **题材纯度**：仙侠场景出现西式建筑 → 直接打回

---

## 6. 扩展指南

当需要新增题材章节时，按第 2 节的 6 模块模板填写，并执行 L2 链路闭环。

推荐优先级（按本工作区项目需求）：
1. ✅ 仙侠 / 武侠篇（已完成）
2. ⬜ 都市现言篇
3. ⬜ 赛博朋克篇
4. ⬜ 末世废土篇
5. ⬜ 悬疑惊悚篇

---

## 7. 总口诀

> **"先定题材味，再搭环境层；光影对色调，质感去塑料；禁止元素别手软，留白透气才是仙。"**
