# 仙侠飞行斗法资产生成单

关联视频稿：`projects/无限强化_漫剧_001/05-prompts/seedance/概念测试/seedance2.5/xianxia-flight-duel-60s-4x15s-paste.md`

资产目标：
- 场景图：本轮已按用户要求改为 image2 / gpt-image-2 方向生成 3K 12 宫格多角度全景环境设计图；下方 Midjourney 任务体仅作为备用方案保留。
- 角色图：用 image2 / gpt-image-2 生成，两名角色三视图，必须包含武器设定。
- 统一风格：仙侠，HZW 材质画质风格，国风唯美，电影级动漫质感，高频材质细节。

## 124 后台提交口

本地扫描到 124 生成路由的任务结构为：

```http
POST ${124_API_BASE}/api/generation/tasks
Authorization: Bearer ${124_AUTH_TOKEN}
Content-Type: application/json
```

任务体通用字段：

```json
{
  "channelKey": "<124_CHANNEL_KEY>",
  "modelId": "<124_MODEL_ID>",
  "type": "IMAGE",
  "mode": "txt2img",
  "prompt": "<PROMPT>",
  "negativePrompt": "<NEGATIVE_PROMPT>",
  "inputFiles": [],
  "params": {
    "generationCategory": "asset_design",
    "nodeType": "asset_image",
    "responseType": "124_async_cos"
  },
  "clientRequestId": "<UNIQUE_ID>"
}
```

当前工作区没有可用的 `124_API_BASE / 124_AUTH_TOKEN / 124_MJ_CHANNEL_KEY / 124_MJ_MODEL_ID` 明文配置；MJ 本地模型配置仍是 `your-midjourney-proxy.example.com` 占位。拿到真实值后，下面每个 prompt 可直接塞入该任务体。

## 角色资产 image2

### 角色 A：青霄剑修·陆沉舟

用途：主角/追逐中被截杀者/冷静反杀者。  
模型建议：image2 / gpt-image-2，角色三视图。  
画幅建议：1:1 或 4:3 设定稿。

提示词：

```text
生成一张仙侠动画电影角色三视图设定稿，角色名为“青霄剑修·陆沉舟”。年轻成年男性修士，身形修长，冷静锋利，黑发高束，额前少量碎发，眼神清亮但有压迫感。服装为青白渐变长袍与轻甲结合，内层白色衣襟，外层淡青长袖，袖口和衣摆有银色云纹，腰间青玉带扣，肩背有悬挂剑匣与符箓细绳。武器必须一起展示：一柄青玉飞剑“青霄”，细长剑身，半透明玉质，剑脊有银色符纹，剑鞘和剑穗单独做细节小图。

画面布局为专业角色设定稿：正面、侧面、背面三视图等比例站姿，旁边增加武器正侧视图和局部材质放大框。纯净浅色背景，细边分区线，角色比例一致，不要剧情动作，不要夸张透视。风格为 HZW 材质画质风格 + 国风唯美 + 高级动漫电影设定稿，布料、玉石、银纹、剑刃反光都要清晰。不要文字水印，不要乱码标签，不要多余角色。
```

负面提示词：

```text
低画质, 模糊, 多余人物, 多余肢体, 手指畸形, 五官崩坏, 三视图比例不一致, 服装左右乱变, 武器缺失, 武器变形, 背景复杂抢戏, 文字水印, 乱码, 现代服装, 西幻盔甲
```

124 image2 任务体：

```json
{
  "channelKey": "<124_IMAGE2_CHANNEL_KEY>",
  "modelId": "<124_IMAGE2_MODEL_ID>",
  "type": "IMAGE",
  "mode": "txt2img",
  "prompt": "生成一张仙侠动画电影角色三视图设定稿，角色名为“青霄剑修·陆沉舟”。年轻成年男性修士，身形修长，冷静锋利，黑发高束，额前少量碎发，眼神清亮但有压迫感。服装为青白渐变长袍与轻甲结合，内层白色衣襟，外层淡青长袖，袖口和衣摆有银色云纹，腰间青玉带扣，肩背有悬挂剑匣与符箓细绳。武器必须一起展示：一柄青玉飞剑“青霄”，细长剑身，半透明玉质，剑脊有银色符纹，剑鞘和剑穗单独做细节小图。画面布局为专业角色设定稿：正面、侧面、背面三视图等比例站姿，旁边增加武器正侧视图和局部材质放大框。纯净浅色背景，细边分区线，角色比例一致，不要剧情动作，不要夸张透视。风格为 HZW 材质画质风格 + 国风唯美 + 高级动漫电影设定稿，布料、玉石、银纹、剑刃反光都要清晰。不要文字水印，不要乱码标签，不要多余角色。",
  "negativePrompt": "低画质, 模糊, 多余人物, 多余肢体, 手指畸形, 五官崩坏, 三视图比例不一致, 服装左右乱变, 武器缺失, 武器变形, 背景复杂抢戏, 文字水印, 乱码, 现代服装, 西幻盔甲",
  "inputFiles": [],
  "params": {
    "generationCategory": "character_turnaround",
    "nodeType": "asset_character",
    "size": "2k",
    "response_format": "url",
    "responseType": "124_async_cos"
  },
  "clientRequestId": "xianxia-flight-duel-character-luchenzhou-v1"
}
```

### 角色 B：赤羽魔修·洛绯

用途：追杀者/贴身瞬杀者/终局对拼者。  
模型建议：image2 / gpt-image-2，角色三视图。  
画幅建议：1:1 或 4:3 设定稿。

提示词：

```text
生成一张仙侠动画电影角色三视图设定稿，角色名为“赤羽魔修·洛绯”。年轻成年女性修士，身形轻捷，气质危险而优雅，长发深红偏黑，发尾有赤羽状发饰，眼神锐利。服装为绯红、墨黑、暗金组合的轻甲长裙，短披帛像燃烧的羽翼，腰侧有金属扣带与细小符坠，裙摆适合高速飞行，不能臃肿。武器必须一起展示：一对赤羽环刃，可合并成圆环，也可分裂成月弧形飞刃；刃口有红金火纹，中心有黑曜石核心，另做握持方式和展开形态细节框。

画面布局为专业角色设定稿：正面、侧面、背面三视图等比例站姿，右侧放武器完整形态、分裂形态、局部材质放大框。纯净浅色背景，细边分区线，角色比例一致，不要剧情打斗姿势。风格为 HZW 材质画质风格 + 国风唯美 + 高级动漫电影设定稿，丝绸、黑金轻甲、赤羽火纹、环刃金属反光都要清晰。不要文字水印，不要乱码标签，不要多余角色。
```

负面提示词：

```text
低画质, 模糊, 暴露过度, 多余人物, 多余肢体, 手指畸形, 五官崩坏, 三视图比例不一致, 发型乱变, 武器缺失, 武器变形, 背景复杂抢戏, 文字水印, 乱码, 现代服装, 西幻盔甲
```

124 image2 任务体：

```json
{
  "channelKey": "<124_IMAGE2_CHANNEL_KEY>",
  "modelId": "<124_IMAGE2_MODEL_ID>",
  "type": "IMAGE",
  "mode": "txt2img",
  "prompt": "生成一张仙侠动画电影角色三视图设定稿，角色名为“赤羽魔修·洛绯”。年轻成年女性修士，身形轻捷，气质危险而优雅，长发深红偏黑，发尾有赤羽状发饰，眼神锐利。服装为绯红、墨黑、暗金组合的轻甲长裙，短披帛像燃烧的羽翼，腰侧有金属扣带与细小符坠，裙摆适合高速飞行，不能臃肿。武器必须一起展示：一对赤羽环刃，可合并成圆环，也可分裂成月弧形飞刃；刃口有红金火纹，中心有黑曜石核心，另做握持方式和展开形态细节框。画面布局为专业角色设定稿：正面、侧面、背面三视图等比例站姿，右侧放武器完整形态、分裂形态、局部材质放大框。纯净浅色背景，细边分区线，角色比例一致，不要剧情打斗姿势。风格为 HZW 材质画质风格 + 国风唯美 + 高级动漫电影设定稿，丝绸、黑金轻甲、赤羽火纹、环刃金属反光都要清晰。不要文字水印，不要乱码标签，不要多余角色。",
  "negativePrompt": "低画质, 模糊, 暴露过度, 多余人物, 多余肢体, 手指畸形, 五官崩坏, 三视图比例不一致, 发型乱变, 武器缺失, 武器变形, 背景复杂抢戏, 文字水印, 乱码, 现代服装, 西幻盔甲",
  "inputFiles": [],
  "params": {
    "generationCategory": "character_turnaround",
    "nodeType": "asset_character",
    "size": "2k",
    "response_format": "url",
    "responseType": "124_async_cos"
  },
  "clientRequestId": "xianxia-flight-duel-character-luofei-v1"
}
```

## 场景资产 Midjourney

MJ 场景图统一负面：

```text
low quality, blurry, bad perspective, random characters, extra people, modern city, sci-fi elements, western fantasy castle, messy layout, unreadable space, duplicated panels, text, watermark, logo
```

### 场景 1：云海高空追逐 12 宫格

Midjourney prompt：

```text
12-panel environmental design sheet, same xianxia aerial chase space above a sea of clouds, ancient Chinese fantasy city far below, moonlit cloud layers cut by sword trails, floating talisman sparks, high altitude wind, wide aerial view, FPV dive angle, low angle through clouds, side tracking view, top-down map-like angle, close pass beside flying sword trail, cinematic anime film background, HZW material quality style, elegant guofeng aesthetics, jade blue and crimson light accents, detailed clouds, distant rooftops, mountain silhouettes, atmospheric depth, clean panel divisions, no characters dominating the scene --ar 16:9 --v 7 --style raw --s 250 --q 1
```

124 MJ 任务体：

```json
{
  "channelKey": "<124_MJ_CHANNEL_KEY>",
  "modelId": "<124_MJ_MODEL_ID>",
  "type": "IMAGE",
  "mode": "txt2img",
  "prompt": "12-panel environmental design sheet, same xianxia aerial chase space above a sea of clouds, ancient Chinese fantasy city far below, moonlit cloud layers cut by sword trails, floating talisman sparks, high altitude wind, wide aerial view, FPV dive angle, low angle through clouds, side tracking view, top-down map-like angle, close pass beside flying sword trail, cinematic anime film background, HZW material quality style, elegant guofeng aesthetics, jade blue and crimson light accents, detailed clouds, distant rooftops, mountain silhouettes, atmospheric depth, clean panel divisions, no characters dominating the scene --ar 16:9 --v 7 --style raw --s 250 --q 1",
  "negativePrompt": "low quality, blurry, bad perspective, random characters, extra people, modern city, sci-fi elements, western fantasy castle, messy layout, unreadable space, duplicated panels, text, watermark, logo",
  "inputFiles": [],
  "params": {
    "generationCategory": "scene_design",
    "nodeType": "asset_scene",
    "botType": "MID_JOURNEY",
    "speedMode": "FAST",
    "aspectRatio": "16:9",
    "responseType": "124_async_cos"
  },
  "clientRequestId": "xianxia-flight-duel-scene-cloudsea-12grid-v1"
}
```

### 场景 2：古街屋脊追逐 12 宫格

Midjourney prompt：

```text
12-panel environmental design sheet, same ancient Chinese xianxia street and rooftop chase location at night, blue-black tiled rooftops, flying eaves, lantern strings, stone-paved alley, wooden shopfronts, narrow canal reflecting sword light, archway, ridge tiles shattered by wind pressure, cinematic action environment, multiple camera angles: rooftop wide shot, street-level FPV, overhead route view, alley compression, low angle under eaves, high speed tracking lane, HZW material quality style, elegant guofeng aesthetics, refined wood grain, wet stone, silk banners, warm lanterns against cool moonlight, clean panel divisions, no main characters blocking the environment --ar 16:9 --v 7 --style raw --s 250 --q 1
```

124 MJ 任务体：

```json
{
  "channelKey": "<124_MJ_CHANNEL_KEY>",
  "modelId": "<124_MJ_MODEL_ID>",
  "type": "IMAGE",
  "mode": "txt2img",
  "prompt": "12-panel environmental design sheet, same ancient Chinese xianxia street and rooftop chase location at night, blue-black tiled rooftops, flying eaves, lantern strings, stone-paved alley, wooden shopfronts, narrow canal reflecting sword light, archway, ridge tiles shattered by wind pressure, cinematic action environment, multiple camera angles: rooftop wide shot, street-level FPV, overhead route view, alley compression, low angle under eaves, high speed tracking lane, HZW material quality style, elegant guofeng aesthetics, refined wood grain, wet stone, silk banners, warm lanterns against cool moonlight, clean panel divisions, no main characters blocking the environment --ar 16:9 --v 7 --style raw --s 250 --q 1",
  "negativePrompt": "low quality, blurry, bad perspective, random characters, extra people, modern city, sci-fi elements, western fantasy castle, messy layout, unreadable space, duplicated panels, text, watermark, logo",
  "inputFiles": [],
  "params": {
    "generationCategory": "scene_design",
    "nodeType": "asset_scene",
    "botType": "MID_JOURNEY",
    "speedMode": "FAST",
    "aspectRatio": "16:9",
    "responseType": "124_async_cos"
  },
  "clientRequestId": "xianxia-flight-duel-scene-ancient-street-12grid-v1"
}
```

### 场景 3：群山峡谷飞行斗法 12 宫格

Midjourney prompt：

```text
12-panel environmental design sheet, same vast xianxia mountain valley for flying magic combat, steep cliffs, pine forests, waterfall, cloud bridge, suspended mist, moonlit rock platforms, sword trails carving through water spray, red and jade energy scars in the air, multiple camera angles: canyon FPV dive, waterfall side pass, top-down valley map, low angle from water surface, mountain ridge wide shot, behind-pine tracking view, high altitude chase route, cinematic anime film background, HZW material quality style, elegant guofeng aesthetics, detailed stone texture, water mist, pine needles, cloud depth, clean panel divisions, no characters dominating the scene --ar 16:9 --v 7 --style raw --s 250 --q 1
```

124 MJ 任务体：

```json
{
  "channelKey": "<124_MJ_CHANNEL_KEY>",
  "modelId": "<124_MJ_MODEL_ID>",
  "type": "IMAGE",
  "mode": "txt2img",
  "prompt": "12-panel environmental design sheet, same vast xianxia mountain valley for flying magic combat, steep cliffs, pine forests, waterfall, cloud bridge, suspended mist, moonlit rock platforms, sword trails carving through water spray, red and jade energy scars in the air, multiple camera angles: canyon FPV dive, waterfall side pass, top-down valley map, low angle from water surface, mountain ridge wide shot, behind-pine tracking view, high altitude chase route, cinematic anime film background, HZW material quality style, elegant guofeng aesthetics, detailed stone texture, water mist, pine needles, cloud depth, clean panel divisions, no characters dominating the scene --ar 16:9 --v 7 --style raw --s 250 --q 1",
  "negativePrompt": "low quality, blurry, bad perspective, random characters, extra people, modern city, sci-fi elements, western fantasy castle, messy layout, unreadable space, duplicated panels, text, watermark, logo",
  "inputFiles": [],
  "params": {
    "generationCategory": "scene_design",
    "nodeType": "asset_scene",
    "botType": "MID_JOURNEY",
    "speedMode": "FAST",
    "aspectRatio": "16:9",
    "responseType": "124_async_cos"
  },
  "clientRequestId": "xianxia-flight-duel-scene-mountain-valley-12grid-v1"
}
```

### 场景 4：山巅云海终局 12 宫格

Midjourney prompt：

```text
12-panel environmental design sheet, same xianxia final duel summit above a vast cloud sea, moonlit stone platform, old pine branches, traces of snow, floating talisman fragments, distant ancient city lights far below, split cloud ocean from previous energy clash, cinematic final battle location, multiple camera angles: heroic wide, low angle from cracked stone, overhead duel arena layout, FPV rush across platform, side silhouette against moon, close environmental detail of jade-blue and crimson light on rocks, HZW material quality style, elegant guofeng aesthetics, refined stone, snow, pine needles, cloud glow, clean panel divisions, no main characters blocking the environment --ar 16:9 --v 7 --style raw --s 250 --q 1
```

124 MJ 任务体：

```json
{
  "channelKey": "<124_MJ_CHANNEL_KEY>",
  "modelId": "<124_MJ_MODEL_ID>",
  "type": "IMAGE",
  "mode": "txt2img",
  "prompt": "12-panel environmental design sheet, same xianxia final duel summit above a vast cloud sea, moonlit stone platform, old pine branches, traces of snow, floating talisman fragments, distant ancient city lights far below, split cloud ocean from previous energy clash, cinematic final battle location, multiple camera angles: heroic wide, low angle from cracked stone, overhead duel arena layout, FPV rush across platform, side silhouette against moon, close environmental detail of jade-blue and crimson light on rocks, HZW material quality style, elegant guofeng aesthetics, refined stone, snow, pine needles, cloud glow, clean panel divisions, no main characters blocking the environment --ar 16:9 --v 7 --style raw --s 250 --q 1",
  "negativePrompt": "low quality, blurry, bad perspective, random characters, extra people, modern city, sci-fi elements, western fantasy castle, messy layout, unreadable space, duplicated panels, text, watermark, logo",
  "inputFiles": [],
  "params": {
    "generationCategory": "scene_design",
    "nodeType": "asset_scene",
    "botType": "MID_JOURNEY",
    "speedMode": "FAST",
    "aspectRatio": "16:9",
    "responseType": "124_async_cos"
  },
  "clientRequestId": "xianxia-flight-duel-scene-summit-cloudsea-12grid-v1"
}
```
