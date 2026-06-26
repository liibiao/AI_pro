# 仙侠飞行斗法资产索引

> 来源：`seedance2.5-15s` 四段连续 60 秒仙侠飞行斗法提示词。  
> 角色图生成方式：Codex 内置 image generation，按 image2 / gpt-image-2 角色三视图用途组织提示词。  
> 场景图生成方式：Codex 内置 image generation，按 image2 / gpt-image-2 场景 12 宫格用途组织提示词；项目内已归档 3K 版本。

## 已生成角色图

| 资产 | 文件 | 用途 | 质量备注 |
|---|---|---|---|
| 青霄剑修·陆沉舟三视图含武器 | `characters/青霄剑修-陆沉舟-三视图含武器-v1.png` | 主角外观锁定、I2V 角色参考、青玉飞剑与服装材质参考 | 前/侧/背三视图清楚，青白衣袍、银纹、玉剑和剑鞘细节可用 |
| 赤羽魔修·洛绯三视图含武器 | `characters/赤羽魔修-洛绯-三视图含武器-v1.png` | 对手外观锁定、I2V 角色参考、赤羽环刃与黑金轻甲参考 | 前/侧/背三视图清楚，红黑金造型、赤羽火纹和环刃拆分设定可用 |

## 已生成场景图

| 资产 | 文件 | 生成模型 | 状态 |
|---|---|---|---|
| 云海高空追逐 12 宫格 | `scenes/云海高空追逐-12宫格多角度全景-image2-3K-v1.png` | image2 / gpt-image-2 方向 | 已生成，3072×2048 |
| 古街屋脊追逐 12 宫格 | `scenes/古街屋脊追逐-12宫格多角度全景-image2-3K-v1.png` | image2 / gpt-image-2 方向 | 已生成，3072×2048 |
| 群山峡谷飞行斗法 12 宫格 | `scenes/群山峡谷飞行斗法-12宫格多角度全景-image2-3K-v1.png` | image2 / gpt-image-2 方向 | 已生成，3072×2048 |
| 山巅云海终局 12 宫格 | `scenes/山巅云海终局-12宫格多角度全景-image2-3K-v1.png` | image2 / gpt-image-2 方向 | 已生成，3072×2048 |

## 关联文件

- 视频提示词：`projects/无限强化_漫剧_001/05-prompts/seedance/概念测试/seedance2.5/xianxia-flight-duel-60s-4x15s-paste.md`
- 修正后的 15s 正式结构稿：`projects/无限强化_漫剧_001/05-prompts/seedance/概念测试/seedance2.5/xianxia-cloud-chase-15s-structured-v2.md`
- 资产提示词与 124 提交体：`projects/无限强化_漫剧_001/05-prompts/assets/xianxia-flight-duel-asset-prompts.md`

## 接入建议

- 角色图可先作为 Seedance 首帧/参考图中的人物一致性锁定素材。
- 场景图建议按四个空间各生成一张 12 宫格，导演/分镜只从 12 宫格里挑机位，避免视频段落空间跳变。
- 进入正式流水线时，给两名角色绑定 `@青霄剑修陆沉舟`、`@赤羽魔修洛绯`，给四张场景图绑定 `@云海追逐场景`、`@古街追逐场景`、`@群山峡谷场景`、`@山巅云海场景`。
