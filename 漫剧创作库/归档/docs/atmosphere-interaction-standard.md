# 环境氛围与物理互动规范 (Atmosphere & Interaction Standard)

> 适用范围：AI 短剧 / 漫剧 / 动作分镜 / Seedance 视频生图
> 核心目标：打破 AI 生成的人物“抠图感”和“绿幕感”，强制要求人物与周围的环境介质发生真实的物理与视觉交互。

---

## 1. 核心指导思想：让空气“可见”

AI 生成的人脸通常非常完美，但背景却像一张死板的壁纸。要让画面有“呼吸感”，必须在人物和镜头之间加入**空气介质（Atmospheric Media）**，并让环境对人物产生**物理压迫**。

---

## 2. 四大环境介质与交互法则

### 2.1 风 (Wind)
**错误示范**：狂风中，角色的头发一丝不乱，衣服像铁板一样。
**正确交互**：风不仅要吹动，还要改变人物的姿态。
- **提示词映射**：`hair whipping across the face, clothes billowing violently in the wind, leaning forward against the gale, squinting eyes`
- **视觉检查**：衣服的褶皱必须有拉扯感；必须有飞舞的碎叶或沙尘。

### 2.2 雨 / 水 (Rain / Water)
**错误示范**：背景在下雨，人物身上干爽，没有水渍。
**正确交互**：雨水必须附着在材质上，并影响光线反射。
- **提示词映射**：`heavy downpour, wet hair plastered to the forehead, rain droplets splashing off armor/shoulders, soaked clothes clinging to the skin, reflections on wet pavement`
- **视觉检查**：皮肤和皮革上必须有高光反射（湿润感）；雨滴砸在肩膀上必须碎裂。

### 2.3 雾 / 烟 / 尘 (Fog / Smoke / Dust)
**错误示范**：清晰通透的废墟，背景一览无余。
**正确交互**：用烟尘遮挡远景，降低对比度，增加纵深感。
- **提示词映射**：`thick morning mist obscuring the background, floating dust particles illuminated by light, lingering gun smoke, hazy atmosphere`
- **视觉检查**：距离镜头越远的物体，对比度越低、颜色越灰（空气透视）。

### 2.4 雪 / 寒冷 (Snow / Freezing)
**错误示范**：背景有雪，人物毫无寒冷特征。
**正确交互**：寒冷是生理反应，必须体现在微表情和附着物上。
- **提示词映射**：`visible freezing breath, unmelted snowflakes resting on eyelashes and shoulders, red nose and flushed cheeks, huddled posture`
- **视觉检查**：呼出的白气必须清晰；鼻尖和指关节微红。

---

## 3. 工作流执行门禁

- **Director (导演)**：在设计室外戏或高潮戏时，必须指定一种环境介质（如：这是在一个大雨滂沱的夜晚，还是尘土飞扬的废墟）。
- **Studio (执行)**：
  - **静态生图**：提示词中必须包含介质与皮肤/衣服的交互（如 `wet hair`）。
  - **视频生成 (Seedance)**：必须用提示词指定环境动态，如 `rain falling heavily, fog drifting slowly`。
- **Reviewer (审片)**：进行**“绿幕测试”**——如果把背景换成纯黑，人物的状态是否依然成立？如果人物状态与背景毫无互动，打回重加环境交互词。