# 统一风格参数规范 — 基于 林天觉醒后-V3-3 参考风格

> 定稿时间：2026-04-13
> 参考图：`角色设计图-林天觉醒后-v3-3.png`
> 适用范围：项目《无限强化·灵纹觉醒》全资产

---

## 1. 风格特征提取（V3-3 视觉分析）

### 核心画风定义
**末世暗灰漫画风（Post-Apocalyptic Dark Manhua Style）**

| 维度 | 特征描述 |
|------|----------|
| **线稿** | 细腻黑线（fine black lines），强调轮廓与阴影排线 |
| **上色** | 低饱和度冷调（low saturation cold tones），灰蓝/暗金为主 |
| **比例** | 8头身写实比例（8-head realistic proportion），强调英雄感 |
| **光影** | 强烈侧逆光（strong rim light），冷蓝色灵纹泛光，高反差 |
| **背景** | 灰暗、废墟感、冷光穹顶边缘 |

---

## 2. 通用风格提示词（追加到每个资产 prompt 尾部）

### 英文风格锚点词（必选，追加到每个 prompt 尾部）

```
Style anchor — dark post-apocalyptic manhua aesthetic, high contrast dramatic lighting, 
cold blue rim light, charcoal gray base tones, fine black ink outlines, 
cinematic comic composition, glowing silver spirit patterns, 
grim atmosphere, professional comic book illustration, cel-shaded with subtle gradients, 
metallic gold highlights, hyper-cool character design
```

### 风格负向词（排除项，确保不走偏）

```
photorealistic, realistic skin texture, soft lighting, subtle gradients, delicate features, 
gentle shading, oil painting, watercolor, 3D render, CGI look, anime soft-focus blur, 
overly detailed texture, hyperrealistic, photographic, portrait photography style
```

---

## 3. 统一技术参数

| 参数 | 值 | 说明 |
|------|----|------|
| `--mj-niji7` | Niji7 动漫插画模型 | 基础模型 |
| `--aspect-ratio` | `3:4` | 竖版角色设计图 |
| `--quality` | `1` | 标准质量 |
| `--chaos` | `20` | 适中变体多样性 |
| `--stylize` | `150` | 中等风格化强度（V2-3验证值） |
| 背景 | solid gray (#808080) | 纯灰背景 |
| 排版 | 3行×3列 | 三视图 + 3表情 + 3动作 |

---

## 4. 角色资产清单

| # | 角色 | 文件名 | 版本 | 状态 |
|---|------|--------|------|------|
| 1 | 林天（觉醒前） | 人物设计图-林天觉醒前.md | → v2 | ⬜ 待重写 |
| 2 | 林天（觉醒后） | 人物设计图-林天觉醒后.md | → v2 | ⬜ 待重写 |
| 3 | 林傲天 | 人物设计图-林傲天.md | v2 ✅ 已完成 | ✅ 定稿 |
| 4 | 林婉儿 | 人物设计图-林婉儿.md | → v2 | ⬜ 待重写 |
| 5 | 林啸 | 人物设计图-林啸.md | → v2 | ⬜ 待重写 |
| 6 | 林战 | 人物设计图-林战.md | → v2（新） | ⬜ 新建 |
| 7 | 执事长老 | 人物设计图-执事长老.md | → v2（新） | ⬜ 新建 |

---

## 5. 排版规格（所有角色统一）

### 第一层：人物三视图
| 位置 | 内容 |
|------|------|
| 左 | 正面全身（带角色标志性站姿） |
| 中 | 侧面全身 |
| 右 | 背面全身 |

### 第二层：面部特写 × 3 表情（每角色自定义）
> 各角色的3种核心情绪，详见各角色文件

### 第三层：人物动作 × 3（每角色自定义）
> 各角色的3个代表性动作，详见各角色文件

---

*此文档为全局风格基准，所有角色任务卡必须遵循此规范。*
