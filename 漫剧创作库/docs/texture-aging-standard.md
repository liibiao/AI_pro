# 材质做旧与岁月痕迹规范 (Texture & Aging Standard)

> 适用范围：AI 角色设定、道具设计、场景美术、AI 生图（Midjourney/RunningHub）
> 核心目标：消除 AI 默认生成的“崭新塑料感”和“刚出厂感”，用微观纹理和历史磨损来赋予画面“真实的历史重量”。

---

## 1. 核心指导思想：没有磨损，就没有真实

AI 默认倾向于生成光滑、无瑕疵的皮肤、闪亮的铠甲和笔挺的衣服。
**原则**：在任何需要沉浸感的影视剧中，**崭新 = 虚假**。质感来源于岁月、战斗和生活习惯留下的痕迹。

---

## 2. 三大材质做旧系统

### 2.1 服装与布料 (Fabrics & Clothing)
- **错误示范**：刚洗过熨烫过的麻布、毫无起球的毛衣、边缘整齐的披风。
- **做旧要求**：
  - **边缘磨损**：领口、袖口、下摆必须有抽丝、破烂或毛边。
  - **微观纹理**：粗糙的亚麻、皮革的裂纹、丝绸的暗纹。
  - **污渍与汗渍**：领口和腋下的深色汗渍、膝盖处的泥土。
- **提示词映射**：`frayed edges, heavily worn leather jacket with deep cracks, coarse linen texture, sweat-stained collar, mud-splattered hem`

### 2.2 金属与武器 (Metals & Weapons)
- **错误示范**：镜面反光的铠甲、毫无划痕的剑刃。
- **做旧要求**：
  - **氧化与腐蚀**：生锈的铁钉、铜绿、发黑的银饰。
  - **战损与划痕**：刀刃上的细小豁口、盾牌上的凹陷、抛光处的交叉划痕。
  - **污垢残留**：剑格或血槽里干涸发黑的血迹、缝隙里的油垢。
- **提示词映射**：`tarnished and rusted iron armor, battle-damaged shield with deep dents, scratched steel blade with dried blood in the fuller, matte finish with dirt in crevices`

### 2.3 皮肤与面部 (Skin & Faces)
- **错误示范**：剥壳鸡蛋般的 AI 硅胶脸、常年流浪却白净无瑕。
- **做旧要求**：
  - **生理质感**：清晰的毛孔、细微的雀斑或红血丝、干燥起皮的嘴唇。
  - **环境留痕**：脸颊上的油污与汗水混合物、眼角的疲惫黑眼圈、风霜留下的粗糙感。
- **提示词映射**：`highly detailed skin pores, chapped lips, dirt and sweat mixed on the cheeks, rugged and weathered face, exhausted eyes with dark circles`

---

## 3. 工作流执行门禁

- **Librarian (制片库)**：在维护 `03-assets/`（角色与道具设计）时，必须建立**“资产老化记录”**。如果主角经历了 Phase 2 的逃亡，Phase 3 的资产必须更新为“战损版”。
- **Studio (执行)**：
  - 在生成人物特写（CU）和极近景（ECU）时，必须强制加入微观材质词（如 `micro-texture, macro photography, extremely detailed fabric`）。
  - 严禁使用 `smooth skin, perfect face, shiny armor` 等平滑类词汇（除非是神明或刚出厂的机甲）。
- **Reviewer (审片)**：放大画面检查边缘与高光区域。如果盔甲反光像镜子一样干净，或者流浪汉的脸比明星还嫩，直接打回重做。