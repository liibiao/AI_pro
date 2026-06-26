---
name: midjourney-prompt-skill
description: Convert user natural-language image descriptions into faithful, high-quality English Midjourney prompts with safe, legal parameters for the currently selected MJ/Niji version. Use when optimizing prompts for Midjourney, MJ, MJ-Niji, RunningHub Midjourney Imagine, or canvas smart Midjourney mode.
---

# midjourney-prompt-skill — Midjourney 智能提示词技能

## 技能定位
把用户输入的自然语言画面描述，转换成适合当前所选 Midjourney / MJ / MJ-Niji 版本的英文复合提示词与合法参数。核心目标是高画质、提示词正确、画面忠于用户原意。

可结合漫剧创作库中的 MJ 提示词库做参考优化，但词库只提供候选表达，不是新的创作指令。所有词库词必须先通过“是否贴合用户自然语言原意”的筛选。

## 不可违背原则
- 用户自然语言提示词是最高优先级的“意图源”。必须先抽取并保留用户明确写下的主体、人物身份、动作、场景、时代、关系、情绪、风格和构图，再做 MJ 优化。
- 不改变用户提示词的大意，不新增会改变主体、人物身份、动作、场景、时代、关系或情绪结果的设定。
- 不为了“更炫”而替换用户指定的风格、物种、性别、年龄、服装、道具、地点或构图。
- 只能补全镜头、光影、材质、画质、构图、色彩和 Midjourney 参数这类执行信息。
- 用户描述含糊时，选择最保守的视觉补全；不确定的信息写成中性表达。
- 参考图、@资源、词库候选词和风格词都低于用户自然语言优先级；如果参考图/资源与用户文字冲突，必须以用户文字为准，并在 `warnings` 中说明已降低冲突参考的权重。
- 词库候选词只允许用于把用户已经表达或强烈暗示的内容翻译成更适合 MJ 的画质、镜头、风格、光影、材质和参数语言；不能凭词库新增用户没写的剧情、角色身份、动作、地点或关键道具。
- 不允许根据参考图自行替换用户文字中的人物、地点、动作或剧情。参考图只能用于保持指定角色/物体/风格/构图，不能重新定义用户想画什么。
- 图生图富文本里的 `参考图1`、`参考图2` 等占位符代表用户通过 @资源 插入的图片位置，必须保留它们在句子中的语义角色。例如“参考图2 骑在 参考图1 的背上”应理解为“参考图2里的主体骑在参考图1里的主体/生物/物体背上”，不能写成 unspecified subject/mount。
- 图生图智能模式必须强参考一致性：参考图中的人物形象、五官样貌、发型、服装、服装颜色、体型比例、轮廓和整体画风都要尽量一模一样保留。除非用户明确要求改造，不得换脸、换发型、换衣服、改变年龄气质、改变物种或重新设计角色。
- 普通图生图 / 单张分镜图必须生成一张完整铺满画布的单幅图：single full-bleed image, edge-to-edge composition, one continuous scene。禁止把多张参考图画成拼贴、分屏、对照页、留白边框、白底说明页、编号面板或参考图展示卡。只有真正的“分镜表/故事板 sheet”任务才允许多格布局。
- 普通图生图 / 单张分镜图的前置图片提示必须按用户选择的 `--ar` 统一比例后再送 MJ：画布程序会对前置 image prompt URL 做中心裁切铺满并重新上传，避免 21:9、16:9 等混用导致画面内部留白。skill 不要在 prompt 中强调参考图原始画幅比例。
- 真实图片 URL 由画布程序按参考图职责拼到最终 MJ prompt：构图/场景/姿势/道具图放在 prompt 最前面；角色图必须按当前所选版本选择官方合法机制；风格图放到 `--sref`；skill 不要伪造 URL，只要在英文 prompt 中保留 reference image N 的角色关系。
- 输出必须是合法 Midjourney 语法；参数只放在末尾，不夹在主体描述中间。
- 用户在画布中已经选择的模型版本、画幅比例和确定参数是硬约束，不能被 skill 改写；例如用户选择 V8.1 时必须使用 `--v 8.1`，不能改回 `--v 7`。
- 图生图的参考图权重 `--iw` 由画布智能模式自动推断，不再让用户手动学习和设置。强角色/关系/动作/场景一致性优先使用当前版本允许的高 `--iw`；Niji 7 上限为 2，MJ V7/V8.1 上限为 3。不要输出与画布自动推断冲突的 `--iw`。
- 智能模式只生成 Imagine 提示词，不支持 Blend、Describe、Action、Modal 等非 Imagine 任务。
- 当前所选版本为 Niji 或最终 prompt 包含 `--niji` 时，画布提交请求必须使用 `botType: NIJI_JOURNEY`；MJ V7/V8.1 等非 Niji 版本使用 `botType: MID_JOURNEY`。不要只在 prompt 中追加 `--niji` 却仍走 MID_JOURNEY bot。
- 避免堆砌互相冲突的画质词，优先清晰、主体明确、光影干净、细节可读。
- 必须主动规避 Midjourney 社区策略高风险表达，同时不改变用户原意：`blood`、`bloody`、`bloodstained`、`gore`、`wound`、`corpse`、`severed` 等血腥词改写为非血腥战损/氛围表达，例如 `battle-worn`、`dust`、`scratches`、`soot`、`scuffed armor`、`crimson rim light`。用户写的是战斗、伤痕、压迫感时，保留“战斗痕迹/紧张氛围”的意思，不输出血液和肢解词。
- 不要把 `teenage`、`minor`、`child` 与武器、士兵、战斗、受伤、血迹组合。成年年轻角色统一写成 `young adult`；如果用户写“18到20岁”，视觉上保留年轻成年气质，但英文 prompt 不强调年龄数字。
- 负向 `--no` 里不要写 `mature old man`、`feminine appearance` 等年龄/性别/身份排除词；改用中性画面稳定项，例如 `different character identity`、`unrelated character`、`costume mismatch`、`blurry face`、`malformed anatomy`、`text`、`watermark`。

## 输出结构
每次输出 JSON：
```json
{
  "prompt": "English Midjourney prompt without image URLs",
  "params": "--ar 16:9 --v 8.1 --raw --s 100 --c 6",
  "aspectRatio": "16:9",
  "qualityProfile": "high",
  "fidelityCheck": "one short Chinese sentence explaining why the result preserves the user intent",
  "warnings": []
}
```

## 图生图参考图职责识别
当画布传入参考图、@资源或“参考图N”占位符时，必须先判断每张图的职责，再根据当前所选模型版本决定 `--iw` / 角色引用 / `--sref` 的合法组合。不要把所有参考图都只当垫图。

### 角色一致：按版本使用合法角色引用
触发意图包括但不限于：
- 中文：这个人、这位、同一个人、同一角色、主角、女主、男主、角色、人物、脸不变、长相不变、样貌一致、五官一致、眉眼、眼睛、瞳色、鼻子、嘴唇、脸型、发型、发色、刘海、发饰、头冠、耳环、疤痕、纹身、妆容、肤色、年龄感、气质、身高、体型、身材比例、轮廓、姿态习惯、身份识别点、人物形象、不要换脸、不能变脸、保持原人物、完全一致、一模一样。
- English: same person, same character, character consistency, preserve identity, exact face, facial features, hairstyle, body shape, outfit, costume, silhouette, no face change, identical character.

版本策略：
- `--v 8.1`：官方不支持 `--cref --cw`，也不使用 V7 的 `--oref --ow`；当前智能模式不输出 `--q`，并默认不自动输出 `--hd` 以保持上游提交稳定。角色图由程序转成 prompt 最前面的 image prompt URL，并自动使用高 `--iw` 保持形象；英文 prompt 必须写明 preserve the exact same character identity, facial features, hairstyle, outfit, clothing colors, body proportions and silhouette。
- `--v 7`：使用 Omni Reference：`--oref [角色图URL] --ow 90-100`。使用 `--oref` 时官方不兼容 `--q 4`，必须降为 `--q 2`，不能为了高画质输出非法 `--q 4`。
- `--v 6` / `--v 6.1` / `--niji 6`：使用 Character Reference：`--cref [角色图URL] --cw 90-100`。
- `--niji 7`：官方没有角色引用参数。当前画布 MJ 通道按最小稳定参数集提交：请求体使用 `botType: NIJI_JOURNEY`，prompt 不输出 `--raw --c --chaos --hd --cref --cw --oref --ow`；只保留 `--niji 7`、`--s`、安全 `--q 1`，有参考图时再由程序追加合法 `--iw` / `--sref`。

无论使用哪种机制，英文 prompt 都必须写明 preserve the exact same character identity, facial features, hairstyle, outfit, clothing colors, body proportions and silhouette。

如果用户明确要求换衣服、改服装、换战甲、换校服、换古装、换发型、重新造型：V7 把 `--ow` 降到 `60-80`；V6/Niji6 把 `--cw` 降到 `60-80`；V8.1/Niji7 用文字明确 preserve the same face / identity / body proportions, but change only the requested outfit or styling，并避免把服装也强锁死。

### 风格一致：使用 `--sref`
触发意图包括但不限于：
- 中文：画风、风格、视觉风格、色调、调性、质感、笔触、上色、渲染、光影、氛围、电影感、胶片感、国漫、日漫、二次元、赛璐璐、厚涂、水墨、油画、水彩、3D、CG、写实、超写实、概念设计、赛博朋克、仙侠、暗黑、哥特、废土、蒸汽朋克、低饱和、高级灰、霓虹、柔光、硬光、同一套视觉、系列统一、保持画面风格、漫剧风格。
- English: same style, visual style, art style, color grading, tone, texture, rendering style, brushwork, lighting style, cinematic look, anime style, donghua style, concept art style.

默认策略：`--sref [风格图URL] --sw 120-250`。轻度参考用 `--sw 60-120`；用户要求“完全按这个画风”可用 `--sw 250-400`，但不能让风格覆盖用户内容。

### 构图 / 场景 / 姿势 / 道具：URL 前置 + `--iw`
触发意图包括但不限于：
- 中文：参考构图、构图一样、布局、画面结构、站位、位置关系、前景、中景、后景、景别、机位、视角、角度、镜头、近景、特写、远景、俯拍、仰拍、侧面、背面、正面、鸟瞰、广角、超广角、姿势、动作、坐姿、站姿、骑在、趴在、抱着、拿着、背着、站在中间、放在背景里、场景一致、建筑一致、空间一致、房间、街道、广场、森林、宫殿、废墟、道具、武器、坐骑、怪兽、车辆、机甲、宠物、环境结构。
- English: composition, layout, pose, posture, camera angle, shot size, framing, scene structure, environment, background, prop, object, mount, creature, vehicle, architecture, spatial relationship.

默认策略：把对应图片 URL 放在 MJ prompt 最前面，由画布智能模式自动追加合法 `--iw`。只借构图时可用较低权重；强复刻角色、场景、姿势、空间关系时使用当前版本允许的高权重。Niji 7 的 `--iw` 上限是 2，MJ V7/V8.1 的 `--iw` 上限是 3。

### @资源语义关系必须保留
- `参考图A / @图A 骑在 参考图B / @图B 背上` → the character or subject from reference image A riding on the back of the creature, mount, or object from reference image B。A 是动作发起者 / 角色身份参考，按当前版本走角色引用机制；B 是承载物 / 坐骑 / 位置关系参考，B 的 URL 前置 + 自动 `--iw`。
- `参考图A 穿着 参考图B 的衣服` → the same person from reference image A wearing the outfit from reference image B；A 锁身份，B 作为服装参考；如果用户要换衣服，角色权重降到 `60-80`。
- `参考图A 放到 参考图B 场景里` → the same character from reference image A placed inside the environment from reference image B；A 锁身份，B 用 URL 前置 + 自动 `--iw`。
- `参考图A 按 参考图B 的画风生成` → the subject from reference image A rendered in the visual style, color palette and lighting of reference image B；A 按版本锁身份，B 用 `--sref`。
- `参考参考图A 的姿势，让参考图B 做这个动作` → the character from reference image B performing the pose/action shown in reference image A；A 用 URL 前置 + 自动 `--iw`，B 按版本锁身份。

### 组合优先级
多意图同时出现时按顺序处理：
1. 角色身份锁定：V8.1/Niji7 用 image prompt + 高 `--iw`；V7 用 `--oref --ow`；V6/Niji6 用 `--cref --cw`
2. 用户明确关系：英文 prompt 写清参考图之间的语义关系
3. 场景 / 构图 / 姿势锁定：URL 前置 + `--iw`
4. 风格锁定：`--sref`
5. 系列稳定：可保留用户已有 `--seed`
6. 高画质参数：保留画布当前模型和比例；Q、RAW、HD、速度只在当前版本官方兼容时输出
7. 普通图生图单画面输出：必须补充 full-bleed / edge-to-edge / one continuous scene，并排除 border, margin, blank space, contact sheet, collage, split screen, side-by-side panels, numbered panels, reference image labels。

### 默认命令策略
- 普通参考图生图且用户未说明用途：先按构图/场景/姿势参考处理，图片 URL 前置 + 智能推断 `--iw`。
- 文本出现“同一个人 / 角色一致 / 脸发型服装不变 / 形象一致”：按当前版本锁角色；V7 用 `--oref --ow 90-100`，V6/Niji6 用 `--cref --cw 90-100`，V8.1/Niji7 用角色图前置 + 高 `--iw`。
- 文本出现“换衣服 / 换造型 / 改发型”：仍锁身份，但 V7 `--ow 60-80` / V6 `--cw 60-80`，只允许改变用户明确要求变化的部分。
- 文本出现“画风 / 色调 / 质感 / 光影 / 漫剧风格 / 系列统一”：使用 `--sref --sw 120-250`，强风格参考可到 `250-400`。
- 文本出现“参考构图 / 姿势 / 动作 / 场景 / 背景 / 道具 / 坐骑 / 位置关系”：图片 URL 前置 + 智能推断 `--iw`。
- 同一张图默认只承担一个主控制职责，避免同一 URL 同时前置垫图又出现在角色引用或 `--sref` 中造成解析冲突。只有当前版本不支持角色引用，或用户明确要求“同一张角色图也参考姿势/构图/动作”时，角色图才允许前置；否则角色图走角色引用，风格图只进 `--sref`，场景/姿势/道具图才前置。

## 提示词结构
英文 prompt 建议按以下顺序组织：
1. 主体与动作：用户明确写了什么，就保留什么。
2. 场景与时间：只补用户暗示的空间、天气、时间、时代。
3. 构图与镜头：cinematic composition / close-up / wide shot / overhead 等，按用户描述匹配。
4. 光影与色彩：soft diffused light / dramatic rim light / golden hour / moody low key 等。
5. 材质与细节：fabric texture, skin detail, environmental detail, clean edges 等。
6. 画质稳定项：high detail, sharp focus, clean image, professional color grading。

## 参数选择
- 模型版本参数必须来自画布当前选择：`--v 8.1` / `--v 7` / `--niji 7` 等，不能自行降级或改写。
- 画质优先但必须合法：当前所选模型版本支持 Q4 且没有使用不兼容参数时优先 `--q 4`；V7 如果使用 `--oref`，不能使用 `--q 4`，必须用 `--q 2`；V8.1 不输出 `--q`；Niji 7 只输出安全 `--q 1`；不支持 Q4 的旧版本回退 `--q 2`。
- 官方版本兼容硬规则：`--v 8.1` 智能模式不输出 `--q --hd --cref --cw --oref --ow`；`--v 7` 角色一致用 `--oref --ow`，不用 `--cref --cw`；`--v 6` / `--v 6.1` / `--niji 6` 才用 `--cref --cw`；`--niji 7` 当前通道请求体使用 `botType: NIJI_JOURNEY`，不自动输出 `--raw --c --chaos --hd` 和角色引用参数，质量固定 `--q 1`。
- 写实、电影、产品、角色、建筑、封面：当前版本支持时优先官方 `--raw`
- 动漫 / 漫剧 / 二次元明确需求：只有用户或所选模型明确是 Niji 时才使用 `--niji`，否则保持当前所选 MJ 版本。
- 宽幅电影、场景、群像、横版海报：`--ar 16:9`
- 竖版封面、手机海报、全身角色、短视频首图：`--ar 9:16`
- 方形头像、单物件、Logo、图标、社媒方图：`--ar 1:1`
- 人物半身、商品 KV、角色设定：可用 `--ar 3:4` 或 `--ar 4:5`
- 超宽场景、横向环境概念：可用 `--ar 21:9`
- 图生图强参考一致性默认：`--s 0`、`--c 0`、智能推断合法 `--iw`，并在英文 prompt 中写明 preserve the exact same character identity, facial features, hairstyle, outfit, clothing colors, body proportions, silhouette and overall visual style from the reference image(s)。
- 普通图生图如果有多张参考图，英文 prompt 必须写成“把这些参考合成为同一个连续场景”，不要写成展示、对比、拼贴、sheet、panel、grid 或 reference layout。负向参数可追加：`--no border, frame, margin, white border, black border, blank space, empty canvas, contact sheet, collage, split screen, side-by-side panels, numbered panels, reference image labels`。

## 负向处理
Midjourney 可用 `--no`，但只在必要时添加：
- 文字、Logo、水印会影响画面：`--no text, watermark, logo`
- 用户要求纯净主体：`--no extra people, duplicate limbs`
- 不要写过长负面列表；负面参数必须服务于画面稳定。
- 不要在 `--no` 中放年龄、性别、族群、身份标签作为排除对象；这些词容易被上游策略误判。要排除“不是这个角色”，写 `different character identity` 或 `unrelated character`。
- 战斗/武器/战争题材的负向词不要写 `blood`、`gore`、`corpse`、`wound`；需要避免血腥时写 `graphic violence` 或直接用非血腥正向描述控制画面。

## 自检
输出前检查：
- 英文 prompt 是否仍能一眼看出用户原始描述。
- 是否添加了会改变故事或主体身份的新元素。
- 参考图或词库词是否抢走了用户自然语言的主体含义；如果有冲突，删除冲突补充。
- `fidelityCheck` 必须明确说明保留了哪些用户原始要素，例如主体、动作、场景、风格或构图。
- 参数是否只出现一次，是否含用户当前选择的 `--ar` 与模型版本。
- 提示词是否能直接提交给 Midjourney Imagine。
- 是否已经把血腥、未成年战斗、年龄/性别排除等容易触发社区策略的词改写成安全等价表达。
