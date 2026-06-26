# 光影与色彩美学规范 (Lighting & Color Aesthetics Standard)

> 适用范围：导演讲戏、分镜设计、AI 生图与视频提示词（Midjourney / Seedance / 海螺 / 可灵）
> 核心目标：消除 AI 默认生成的“平亮棚拍感”和“塑料网大感”，用光影和色彩的对比（Contrast）来塑造情绪、叙事和电影级质感。

---

## 1. 核心指导思想：光影即情绪

AI 模型在没有明确指令时，倾向于给出“全脸照亮、无阴影”的平光图，这在影视中是大忌。
**原则**：不要为了“看清”而把一切照亮。阴影里藏着故事，高光处才是焦点。

---

## 2. 常用电影级光影系统与提示词

### 2.1 伦勃朗光 / 明暗交界 (Chiaroscuro / Rembrandt Lighting)
- **用途**：表现内心的挣扎、深沉的对话、反派的密谋、复杂的人物性格。
- **视觉特征**：主光源从侧上方打来，脸部一侧亮，另一侧暗，暗部脸颊上有一个“倒三角形”的光斑。
- **提示词映射**：`chiaroscuro, Rembrandt lighting, heavy shadows on one side of the face, dramatic contrast`

### 2.2 轮廓光 / 逆光 (Rim Lighting / Backlighting)
- **用途**：英雄登场、绝境中看到希望、把主体从复杂的背景中“抠”出来，增加史诗感。
- **视觉特征**：光源在人物背后，人物边缘（头发、肩膀）被照亮形成一圈金边/白边，面部较暗或全黑（剪影）。
- **提示词映射**：`strong rim lighting, glowing hair edges, backlighting, cinematic silhouette`

### 2.3 底光 / 顶光 (Underlighting / Top Lighting)
- **用途**：底光用于惊悚、邪恶、走火入魔；顶光用于审讯、神圣降临、孤立无援。
- **视觉特征**：底光从下巴往上打，眼窝鼻下全亮；顶光从头顶往下打，眼窝深陷黑影。
- **提示词映射**：`underlighting, eerie shadows, harsh top lighting, deep eye shadows, interrogation room lighting`

### 2.4 情绪光源与体积光 (Volumetric Lighting)
- **用途**：增加环境的空间感和“空气感”（丁达尔效应）。
- **视觉特征**：光线穿过烟雾、灰尘或树叶，形成可见的光束。
- **提示词映射**：`volumetric lighting, god rays, light rays piercing through dust/smoke, cinematic haze`

---

## 3. 色彩心理学与调色基调 (Color Grading)

禁止使用大红大绿的高饱和度搭配，除非是特定的喜剧或梦境。

- **赛博朋克 / 商业大片 (Teal & Orange)**：
  - **特征**：阴影偏青蓝，高光（肤色）偏橙黄，形成极致的冷暖对比。
  - **提示词**：`teal and orange color grading, cinematic blockbuster colors, cold blue shadows, warm skin tones`
- **末日 / 悲伤 / 回忆 (Desaturated / Muted)**：
  - **特征**：极低饱和度，几乎接近黑白，只保留极少量的冷色。
  - **提示词**：`desaturated colors, bleak atmosphere, muted color palette, faded film look`
- **极度危险 / 暴力 (Monochromatic Red/Neon)**：
  - **特征**：全屏被单一的红色警报光或霓虹光笼罩。
  - **提示词**：`bathed in harsh red emergency light, monochromatic neon red, dangerous atmosphere`

### 2.5 题材专属光影（详见 `genre-visual-playbook.md`）

不同题材有各自的光影签名式效果，完整参数包见题材手册：

- **仙侠**：丁达尔效应/耶稣光（几乎标配）、逆光剪影、灵力自发光、月色冷光、金殿暖光
- **武侠**：正午硬光（沙漠/荒野）、烛光/火光（酒馆/夜晚）、雨天散射光（竹林/江南）
- **赛博朋克**：霓虹灯局部照亮、屏幕冷光反射、烟雾+激光穿透
- **末世**：地平线微光、灰尘散射的苍白光、火焰废墟光

> 原则：通用光影技术（§2.1-2.4）+ 题材专属光影（本节）= 完整光影方案。两者叠加使用，不替代。

---

## 4. 工作流执行门禁

- **Director (导演)**：在讲戏本和分镜表中，**严禁写“画面很亮很清晰”**。必须明确当前场景的“主光源方向”和“色彩基调”。
- **Studio (执行)**：在提示词中，光影词必须紧跟在主体描述之后。例如：`[主体动作] + bathed in cinematic rim lighting, deep shadows on the face + [环境]`。
- **Reviewer (审片)**：如果生成的画面没有“明暗对比”（即最亮和最暗的区域），直接判定为“平光废片”，打回重做。