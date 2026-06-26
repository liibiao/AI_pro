---
name: midjourney-prompt-skill
description: Convert user natural-language image descriptions into faithful, high-quality English Midjourney prompts with safe, legal MJ-V7/Niji parameters. Use when optimizing prompts for Midjourney, MJ-V7, MJ-Niji, RunningHub Midjourney Imagine, or canvas smart Midjourney mode.
---

# midjourney-prompt-skill — Midjourney 智能提示词技能

## 技能定位
把用户输入的自然语言画面描述，转换成适合 Midjourney / MJ-V7 / MJ-Niji 的英文复合提示词与合法参数。核心目标是高画质、提示词正确、画面忠于用户原意。

## 不可违背原则
- 不改变用户提示词的大意，不新增会改变主体、人物身份、动作、场景、时代、关系或情绪结果的设定。
- 不为了“更炫”而替换用户指定的风格、物种、性别、年龄、服装、道具、地点或构图。
- 只能补全镜头、光影、材质、画质、构图、色彩和 Midjourney 参数这类执行信息。
- 用户描述含糊时，选择最保守的视觉补全；不确定的信息写成中性表达。
- 输出必须是合法 Midjourney 语法；参数只放在末尾，不夹在主体描述中间。
- 避免堆砌互相冲突的画质词，优先清晰、主体明确、光影干净、细节可读。

## 输出结构
每次输出 JSON：
```json
{
  "prompt": "English Midjourney prompt without image URLs",
  "params": "--v 7 --ar 16:9 --style raw --q 2",
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
- 默认模型参数：`--v 7`
- 高质量默认：`--q 2`
- 写实、电影、产品、角色、建筑、封面：优先 `--style raw`
- 动漫 / 漫剧 / 二次元明确需求：可使用 `--niji 7` 替代 `--v 7`，但只有用户或所选模型明确是 Niji 时才使用。
- 宽幅电影、场景、群像、横版海报：`--ar 16:9`
- 竖版封面、手机海报、全身角色、短视频首图：`--ar 9:16`
- 方形头像、单物件、Logo、图标、社媒方图：`--ar 1:1`
- 人物半身、商品 KV、角色设定：可用 `--ar 3:4` 或 `--ar 4:5`
- 超宽场景、横向环境概念：可用 `--ar 21:9`

## 负向处理
Midjourney 可用 `--no`，但只在必要时添加：
- 文字、Logo、水印会影响画面：`--no text, watermark, logo`
- 用户要求纯净主体：`--no extra people, duplicate limbs`
- 不要写过长负面列表；负面参数必须服务于画面稳定。

## 自检
输出前检查：
- 英文 prompt 是否仍能一眼看出用户原始描述。
- 是否添加了会改变故事或主体身份的新元素。
- 参数是否只出现一次，是否含 `--ar` 与模型版本。
- 提示词是否能直接提交给 Midjourney Imagine。
