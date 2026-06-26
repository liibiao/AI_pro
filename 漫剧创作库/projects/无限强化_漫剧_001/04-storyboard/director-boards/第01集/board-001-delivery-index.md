# Board 001 交付索引

- 项目：无限强化·灵纹觉醒
- 集数：第 1 话《废物》
- 日期：2026-05-06
- 负责人：Producer / Storyboard Artist / Camera Director / Studio / Reviewer

## 1. 故事板交付清单

| Board | 版本 | 文件 | 总时长 | 场景类型 | QC | 连续性卡 | 视频适配包 |
|---|---|---|---:|---|---|---|---|
| board-001 | 输入包 | `board-001-input-pack.md` | - | 世界观建立 + 文戏压迫 | 已完成 | 已承接 | 已承接 |
| board-001 | Panel Timing | `board-001-panel-timing.md` | D12 12s / D15 15s | 双版本时长规划 | 已通过 | 已承接 | 已承接 |
| board-001 | D12-Sora2 | `board-001-d12-sora2.md` | 12s | Sora2 导演故事板规格 | 已通过 | `board-001-continuity.md` | `board-001-video-adaptation-pack.md` |
| board-001 | D15-Seedance2 | `board-001-d15-seedance2.md` | 15s | Seedance2 导演故事板规格 | 已通过 | `board-001-continuity.md` | `board-001-video-adaptation-pack.md` |
| board-001 | 连续性卡 | `board-001-continuity.md` | - | 首板首尾锚点 | 已通过 | 本文件 | 已承接 |
| board-001 | QC | `board-001-qc.md` | - | 门禁检查 | 已完成 | 已检查 | 已检查 |
| board-001 | 视频适配包 | `board-001-video-adaptation-pack.md` | 12s / 15s | Sora2 + Seedance2 | 已通过 | 已承接 | 本文件 |
| board-001 | 生成日志 | `board-001-generation-log.md` | - | 生产记录 | 已创建 | 已记录 | 已记录 |
| board-001 | GPT-image-2 图生图执行包 | `board-001-gpt-image2-i2i-pack.md` | 12s / 15s | 资产图生图重生成包 | 已创建 | 已承接 | 待 Studio 执行 |

## 2. D12-Sora2 清单

| Board | 故事板图 | 简短提示词 | 是否可生成 |
|---|---|---|---|
| board-001 | `board-001-d12-sora2.png`（待 GPT-image-2 图生图生成） | 已写入 `board-001-d12-sora2.md` 与 `board-001-video-adaptation-pack.md`；需结合资产图执行图生图 | 不可进入 PNG 人工视觉复核；不可进入视频生成 |

## 3. D15-Seedance2 清单

| Board | 故事板图 | Stable 包 | Extended 包 | 是否可生成 |
|---|---|---|---|---|
| board-001 | `board-001-d15-seedance2.png`（待 GPT-image-2 图生图生成） | Stable 包结构已完成，但图4必须生成合规 D15 故事板图 | Extended 包结构已完成，默认不启用 | 不可进入 PNG 人工视觉复核；不可进入 Seedance2-Stable |

## 4. 连续性链路

```text
第1话开场 / 无上一板 → Board 001 P01 联邦屏障与练武场建立 → Board 001 P02 角落双人相依 → Board 001 P03/P04 林天隐忍结果 → Board 002 First Panel（建议 S4 闪回父亲背影 / 禁忌遗物银光）
```

## 5. 缺失项

- 缺角色图：无；林天觉醒前、林婉儿均有落盘路径。
- 缺场景图：无；林家练武场、联邦全景均有落盘路径。
- 缺道具图：无；灵纹碑石有落盘路径。
- 缺连续性锚点：无；本板为开场，下一板预期已写。
- 缺 QC：Markdown 样板包 QC 已完成；PNG 图生图合规 QC 未通过，需基于资产图用 GPT-image-2 重生成后再复核文字与箭头。

## 6. 放行结论

- 是否允许进入 Sora2：不允许。当前 D12 PNG 不是 GPT-image-2 图生图产物，需基于资产图重生成并复核通过后再进入 Sora2。
- 是否允许进入 Seedance2-Stable：不允许。当前 D15 PNG 不是 GPT-image-2 图生图产物，需替换为合规故事板图后再进入 Seedance2-Stable。
- 是否允许进入 Seedance2-Extended：默认不启用；若后续启用，也必须先使用合规 GPT-image-2 图生图故事板图。
- Producer 签收：Markdown 样板包完成；PNG 产物合规性不通过，当前两张 PNG 仅作为非合规临时图保留，正式视频生成阶段暂停。