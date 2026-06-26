# VFX 视觉特效表现规范 (Visual Effects Standard)

> 适用范围：AI 视频生成 (Seedance)、生图 (Midjourney)、后期特效合成
> 所属方法论：**《后期视听总规范》- 1.1 物理克制（Physical Restraint）**
> 核心目标：解决 AI 影视中“光污染、塑料感、像劣质页游贴图”的问题，强制特效遵循物理反馈规律。

---

## 1. 光源绑定法则 (Interactive Lighting)
**痛点**：法术发光，但周围环境和人物脸部却是暗的，特效像硬贴上去的。
**执行标准**：任何发光的特效，必须对周围环境产生真实的光照反射。
- **面部反馈**：手搓火球，火光必须照亮角色的脸部轮廓，且在瞳孔中形成高光反射。
- **材质反馈**：蓝色魔法阵亮起，金属盔甲的迎光面必须泛出冷蓝色的金属光泽。
- **提示词映射**：`a glowing blue energy sphere, casting harsh blue light on the character's face and reflecting off the metallic armor, interactive lighting`

## 2. 热畸变与介质扭曲 (Heat Distortion & Media)
**痛点**：特效只有颜色，没有温度和能量感。
**执行标准**：高级的爆炸或高温法术，核心不是火球多大，而是周围空气的物理形变。
- **空气折射**：大招释放前，周围的空气必须像夏天马路上的热浪一样扭曲背景。
- **冲击波**：无形的能量对撞，必须通过激起的尘土圈（Dust Ring）或水面涟漪来侧面表现。
- **提示词映射**：`intense heat distortion blurring the background, shimmering air around the fire magic, shockwave kicking up a ring of dust`

## 3. 生命周期的余韵 (Lingering Aftermath)
**痛点**：法术撞击后瞬间消失，毫无痕迹。
**执行标准**：特效必须有“始、中、终”，严禁瞬间抹除。
- **残留物**：爆炸后必须有飞舞的火星（Embers）、持续飘散的硝烟（Lingering smoke）。
- **环境疤痕**：能量消散后，地面必须留下焦黑的痕迹或仍在发热的暗红色裂纹。
- **提示词映射**：`drifting glowing embers, lingering thick smoke, magical particles fading slowly into the air, scorched earth with glowing red cracks`

---
**Reviewer 门禁测试**：
- 如果特效没有照亮角色的脸（光源脱节），打回。
- 如果特效消散后环境干干净净（无余韵），打回。