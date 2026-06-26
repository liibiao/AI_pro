# 词库资源层（Wordlists）

> **定位**：本项目提示词生成系统的底层查表资源，与方法论文档形成"上层方法论 + 下层词库"的双层结构。
>
> **来源**：全部 17 个词库已从 `神词系统/wordlists/` 迁入完毕（P0×6 + P1×5 + P2×6）。
>
> **规则层吸收**：台词锁定、时长分配算法（jl函数）、智能匹配（题材识别/风格推荐/时长估算）、链式生成策略、三版本一致性校验 + 否定句修正均已融入主项目 skills/docs。详见迁移方案 `docs/prompt-system-migration-plan.md` Phase B。
>
> **模板层迁移**：三版本输出模板（Seedance 长版母稿 / 即梦精简版 / 叙事性提示词）已迁入 `templates/_shared/prompt-output/`，改挂到主项目规范体系。详见迁移方案 Phase C。
>
> **使用原则**：
> - 写提示词时可按需查阅对应词库，选取合适的 `seedancePrompts` / `prompt` / 模板
> - 词库是**参考资源**，不是硬约束模板——允许根据具体场景灵活裁剪与组合
> - 每个词库的 `_meta.source` 指向对应的方法论文档，概念定义以方法论文档为准

---

## 目录结构

```
wordlists/
├── README.md                          ← 你正在读的文件
├── visual/                            ← 视觉系统词库（9个）
│   ├── perspective-system.json        ← P0 八大叙事视角体系
│   ├── camera-psychology.json         ← P0 心理运镜系统
│   ├── lighting-dynamics.json         ← P0 光动态化
│   ├── transition-montage.json        ← P0 转场与蒙太奇
│   ├── action-speed.json              ← P1 动作速度与节奏
│   ├── composition-geometry.json      ← P1 构图几何与群戏调度
│   ├── vfx-design.json                ← P1 视觉特效
│   ├── atmosphere-interaction.json    ← P1 环境介质物理互动
│   └── environmental-destruction.json ← P1 材质破坏物理
├── audio/                             ← 听觉系统词库（2个）
│   ├── sound-design.json              ← P0 声音设计（环境底噪/拟音/特效音/状态音/BGM）
│   └── dialogue-voice.json            ← P0 对白配音
└── style/                             ← 风格参考词库（6个）
    ├── director-styles.json           ← P2 50+ 导演风格特征与代表作品
    ├── visual-styles.json             ← P2 13种视觉风格关键词与负面提示词
    ├── lighting-atmosphere.json       ← P2 布光方案/色温/氛围效果/光比/时段
    ├── genre-keywords.json            ← P2 题材识别正则 + 30条风格关键词映射
    ├── narrative-pace-presets.json    ← P2 5种叙事节奏预设与时长分配
    └── camera-language.json           ← P2 景别/运镜/角度/构图速查表
```

---

## P0 词库索引

| 词库文件 | 所属系统 | 对应方法论文档 | 核心覆盖 |
|---|---|---|---|
| `visual/perspective-system.json` | 视觉 | `docs/perspective-system-emotional-mapping.md` | 8 大叙事视角、视角-权力映射、视角切换情绪杠杆 |
| `visual/camera-psychology.json` | 视觉 | `docs/camera-psychology-movement-standard.md` | 6 类心理运镜、运动模糊分级、变速节奏协议（Hit Stop/升格/降格/子弹时间） |
| `visual/lighting-dynamics.json` | 视觉 | `docs/lighting-dynamics-prompt-guide.md` | 光源运动、遮挡物运动、主体运动光影、光的叙事功能、克制原则 |
| `visual/transition-montage.json` | 视觉 | `docs/transition-montage-standard.md` | 6 类电影级转场、留头留尾规则、审片门禁 |
| `audio/sound-design.json` | 听觉 | `docs/sound-design-montage-standard.md` | 环境底噪、材质拟音、特效音时间轴、状态音、BGM 克制原则、混音指导 |
| `audio/dialogue-voice.json` | 听觉 | `docs/dialogue-voice-design-standard.md` | 对白任务分类、承载方式、配音参数维度、角色绑定、提示词模板 |

## P1 词库索引

| 词库文件 | 所属系统 | 对应方法论文档 | 核心覆盖 |
|---|---|---|---|
| `visual/action-speed.json` | 视觉 | `docs/action-speed-design-standard.md` | 动作六阶段节奏、身体力学反馈、环境联动、镜头反应、高张力构图、动作模板库 |
| `visual/composition-geometry.json` | 视觉 | `docs/blocking-camera-geometry-methodology.md` | 9:16 归一化坐标、三层空间、180°轴线、画面几何门禁、队形模板、群戏分区调度、读点保护 |
| `visual/vfx-design.json` | 视觉 | `docs/vfx-design-standard.md` | 光源绑定法则、热畸变/冲击波、特效余韵生命周期、5 类能量特效、负面提示词 |
| `visual/atmosphere-interaction.json` | 视觉 | `docs/atmosphere-interaction-standard.md` | 风/雨/雾雪/寒冷 4 类介质物理互动、正反示例、绿幕质量测试 |
| `visual/environmental-destruction.json` | 视觉 | `docs/environmental-destruction-standard.md` | 石材/木材/玻璃/金属 4 类材质碎裂物理、巨型崩塌三阶段、负面提示词 |

---

## P2 词库索引（风格参考）

| 词库文件 | 核心覆盖 |
|---|---|
| `style/director-styles.json` | 50+ 导演的风格特征、技法、光影、代表作品，按 category 分类 |
| `style/visual-styles.json` | 13 种视觉风格（电影写实/动画/仙侠/赛博朋克等）的正向+负面关键词 |
| `style/lighting-atmosphere.json` | 15 种布光方案、4 种色温、5 种氛围效果、4 档光比、7 个时段 |
| `style/genre-keywords.json` | 4 类节奏正则 + 30 条题材关键词→导演+视觉风格的自动匹配映射 |
| `style/narrative-pace-presets.json` | 5 种叙事节奏预设（动作/悬疑/对话/抒情/均衡）+ 镜头时长分配算法参数 |
| `style/camera-language.json` | 7 级景别、12 种运镜、6 种机位角度、6 种构图法则、3 层空间分层 |

---

## MJ 生图词库（image-studio 专用）

> **定位**：面向生图工具（`tools/workbench-web/image-studio.html`）的 MJ 提示词速查词库，按 **11 大维度**组织，用户可在前端面板中点击词条快速插入提示词。
>
> **路径**：`wordlists/mj-image/`

| 词库文件 | 维度 | 优先级 | 核心覆盖 |
|---|---|---|---|
| `index.json` | 索引 | — | 11 大维度入口，前端按此加载 |
| `subject-action.json` | 核心主体与动作 | 1（必选） | 角色身份、外观特征、核心动作、互动关系、核心道具 |
| `character-design-sheet.json` | **角色设定稿模板（三视图）** | 1.5（可选） | 版面布局/A区三视图/B区服装道具/C区表情库/D区全身立绘 |
| `art-style.json` | 艺术风格与调性 | 2（必选） | 写实/动漫/3D/概念设计/艺术流派/艺术家参考/质感调性（130+条） |
| `camera-composition.json` | 镜头构图与视角 | 3（必选） | 景别(13)/视角(20)/镜头语言(14)/构图规则(20)/镜头特效(10)（90+条） |
| `color-palette.json` | **色彩调色** | 4.1（可选） | 暖色系(14)/冷色系(17)/中性色(9)/特殊配色(15)/色彩理论(10)（70+条） |
| `lighting-atmosphere.json` | 光影色彩与环境氛围 | 4.5（必选） | 自然光(13)/人造光源(14)/戏剧性光效(20)/特效发光(12)/色彩基调(18)/环境场景(19)/氛围情绪(14)（140+条） |
| `material-texture.json` | **材质纹理** | 4.7（可选） | 金属(8)/石质矿物(8)/织物皮革(10)/木质纸张(8)/玻璃透明(6)/特殊材质(14)（60+条） |
| `quality-render.json` | 画质细节与渲染 | 5（必选） | 分辨率(7)/渲染引擎(16)/细节精度(14)/画幅(6)/品质描述(9)/预设组合(6)（60+条） |
| `weight-control.json` | 权重强化控制 | 6（可选） | 强化/弱化示例 |
| `mj-params.json` | MJ 专属参数 | 7（可选） | `--ar`/`--v`/`--niji`/`--s`/`--c`/`--no`/`--q`/`--stop` |
| `negative-prompts.json` | 负面提示词 | 8（可选） | 画面瑕疵、风格偏离、动作构图问题、多余元素、一键预设 |

> **v2.0 更新日志（2026-04-22）**：
> - 新增 `character-design-sheet.json`（角色设定稿三视图版面模板，含4种布局变体+各区域提示词框架+质量红线）
> - 新增 `color-palette.json`（色彩调色词库，5类70+条）
> - 新增 `material-texture.json`（材质纹理词库，7类60+条）
> - 扩展 `art-style.json`（3类→7类130+条）、`lighting-atmosphere.json`（4类→7类140+条）、`quality-render.json`（5类→6类60+条）、`camera-composition.json`（4类→5类90+条）
> - 总维度从 8 → 11，总词条从 ~200 → **550+**

---

## 接入点参考

以下 skills / agents 在生成提示词时可直接查阅本词库层：

- `skills/storyboard-artist-skill.md` → 分镜总装时查阅视角、运镜、光影、转场
- `skills/shot-design-skill.md` → 单镜设计时查阅心理运镜、运动模糊、变速节奏
- `skills/seedance-action-skill.md` → 动作戏提示词时查阅运镜、光动态、声音时间轴
- `skills/dialogue-voice-director-skill.md` → 对白配音段查阅配音参数与模板
- `skills/foley-sound-designer-skill.md` → 声音设计段查阅底噪、拟音、特效音
- `skills/prompt-experiment-skill.md` → 实验生成时查阅 `style/` 词库做风格推荐
- `agents/director/agent.md` → 讲戏时查阅视角权力映射、转场规则
- `agents/storyboard-artist/agent.md` → 分镜输出时查阅转场门禁
