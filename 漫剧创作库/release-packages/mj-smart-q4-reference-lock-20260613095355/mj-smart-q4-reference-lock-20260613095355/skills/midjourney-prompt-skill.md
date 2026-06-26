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
- 真实图片 URL 由画布程序按 @资源出现顺序拼到最终 MJ prompt 最前面；skill 不要伪造 URL，只要在英文 prompt 中保留 reference image N 的角色关系。
- 输出必须是合法 Midjourney 语法；参数只放在末尾，不夹在主体描述中间。
- 用户在画布中已经选择的模型版本、画幅比例和确定参数是硬约束，不能被 skill 改写；例如用户选择 V8.1 时必须使用 `--v 8.1`，不能改回 `--v 7`。
- 图生图的参考图权重 `--iw` 由画布智能模式控制：智能图生图默认强一致性 `--iw 3`；如果用户手动改了 IW，就以用户当前选择为准。不要输出与当前选择冲突的 `--iw`。
- 避免堆砌互相冲突的画质词，优先清晰、主体明确、光影干净、细节可读。

## 输出结构
每次输出 JSON：
```json
{
  "prompt": "English Midjourney prompt without image URLs",
  "params": "--ar 16:9 --v 8.1 --style raw --s 100 --c 6 --q 4 --hd",
  "aspectRatio": "16:9",
  "qualityProfile": "high",
  "fidelityCheck": "one short Chinese sentence explaining why the result preserves the user intent",
  "warnings": []
}
```

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
- 画质优先：当前所选模型版本支持 Q4 时必须优先 `--q 4`，包括 `--v 7`、`--v 8.1`、`--niji 7` 等；不支持 Q4 的旧版本才回退 `--q 2`。
- 写实、电影、产品、角色、建筑、封面：优先 `--style raw`
- 动漫 / 漫剧 / 二次元明确需求：只有用户或所选模型明确是 Niji 时才使用 `--niji`，否则保持当前所选 MJ 版本。
- 宽幅电影、场景、群像、横版海报：`--ar 16:9`
- 竖版封面、手机海报、全身角色、短视频首图：`--ar 9:16`
- 方形头像、单物件、Logo、图标、社媒方图：`--ar 1:1`
- 人物半身、商品 KV、角色设定：可用 `--ar 3:4` 或 `--ar 4:5`
- 超宽场景、横向环境概念：可用 `--ar 21:9`
- 图生图强参考一致性默认：`--s 0`、`--c 0`、`--iw 3`，并在英文 prompt 中写明 preserve the exact same character identity, facial features, hairstyle, outfit, clothing colors, body proportions, silhouette and overall visual style from the reference image(s)。

## 负向处理
Midjourney 可用 `--no`，但只在必要时添加：
- 文字、Logo、水印会影响画面：`--no text, watermark, logo`
- 用户要求纯净主体：`--no extra people, duplicate limbs`
- 不要写过长负面列表；负面参数必须服务于画面稳定。

## 自检
输出前检查：
- 英文 prompt 是否仍能一眼看出用户原始描述。
- 是否添加了会改变故事或主体身份的新元素。
- 参考图或词库词是否抢走了用户自然语言的主体含义；如果有冲突，删除冲突补充。
- `fidelityCheck` 必须明确说明保留了哪些用户原始要素，例如主体、动作、场景、风格或构图。
- 参数是否只出现一次，是否含用户当前选择的 `--ar` 与模型版本。
- 提示词是否能直接提交给 Midjourney Imagine。
