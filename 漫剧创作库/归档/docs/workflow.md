# workflow — Agent × Skill 协作流程标准

> 本文档定义从零到一创建项目和小说改编创建项目的完整流程。
> 所有 Agent 和 Skill 的调用顺序、输入输出、门禁条件在此统一规定。

---

## 一、项目生命周期（8 个阶段）

```
Phase 0: INTAKE & STYLE（创作源输入 / 项目立项 / 风格初筛）
Phase 1: STORY（故事开发 / 小说改编 / 剧本标准化）
Phase 2: DIRECTOR（导演）
Phase 3: ASSETS（资产）
Phase 4: STORYBOARD（分镜）
Phase 5: GENERATION（生成）
Phase 6: EDIT（剪辑）
Phase 7: QA → PUBLISH（质检→发布）
```

> 工作流开端不是固定“剧本输入”，而是统一称为 **创作源输入 / 项目立项输入**。系统必须支持故事梗概、小说原文、已有剧本、角色设定、世界观、一句话创意、从 0 到 1 原创需求、已有分镜 / 资产继续生产等多入口。

> 当前项目自动流水线暂时截止到 **Phase 3.1（故事板生产包输出）**。  
> Phase 4（生成说明与视频生成）及 Phase 5/6（剪辑/审片/质检）暂时保留目录与规范，但不作为中游核心交付；待“即梦/视频平台”具备一键化条件后再恢复自动化执行。
> Phase 1-3 的门禁检查可通过项目级配置 `pipeline.config.json` 进行加严/放宽（用于不同项目的复用与差异化）。

> 每个阶段结束后必须经过 `quality-control` 审核，通过后 `master` 才能放行到下一阶段。

---

## 二、精益 Agent 体系 (6 个核心角色)

为了降低调度复杂度和 Token 成本，项目采用"精益制片"模式，将 16 个职能 Agent 整合为 6 个核心 Agent。

| 核心 Agent | 包含原角色 | 核心使命 | 自动化替代项 |
|-----------|-----------|---------|-------------|
| **制片人 (Producer)** | master / operations / publisher | 调度、门禁、放行、发布、成本控制 | `phase-gate-skill` |
| **编剧 (Writer)** | scriptwriter / script-auditor | 故事、人物、剧本、合规 | `script-standard-skill` |
| **导演 (Director)** | director / art-director / continuity | 风格、美术、讲戏、视觉一致性 | `continuity-check-skill` |
| **分镜师 (Storyboard Artist)** | storyboard / storyboard-artist | 分镜拆解、镜头节拍、故事板生产包总装 | `storyboard-artist-skill` |
| **制片库 (Librarian)** | asset-librarian / context-loader | 资产索引、跨集记忆、状态同步 | `project-doctor-skill` |
| **工作室 (Studio)** | executor / prompt-lab / technical-dir | 生图执行、故事板图生成、模型适配实验 | `prompt-sync-skill` |
| **审片员 (Reviewer)** | quality-control / editor | 剪辑、故事板/生成 QA、最终版本发布 | `qa-automation-skill` |

---

## 三、阶段详细流程 (精益版)

### Phase 0: INTAKE / METHODOLOGY / STYLE — 创作源输入、母版定层与风格初筛

> 所有项目从 **创作源输入 / 项目立项输入** 开始，而不是默认从剧本开始。系统必须先识别输入类型与成熟度，再决定进入故事开发线或制作执行线。所有项目默认继承 `docs/master-methodology-toolkit.md` 作为上层基础指导思想，但母版不决定具体影片视觉风格；整片风格由项目级 `visual-style-bible.md` 锁定。HZW大师风格既可作为主风格，也可作为风格控制方法论叠加到其他主风格上。

| 步骤 | 执行 Agent | 调用 Skill | 输入 | 输出 |
|------|-----------|-----------|------|------|
| 0.1 创作源输入识别 | `Producer` + `Writer` | `prompt-experiment-skill` | 一句话创意 / 故事梗概 / 小说原文 / 已有剧本 / 角色设定 / 世界观 / 已有分镜或资产 | `creative-source-intake.md`，标注输入类型、创作成熟度 L0-L5、题材、受众、情绪、场景类型、风险项 |
| 0.2 母版方法论确认 | `Producer` | `phase-gate-skill` | 用户需求 + `master-methodology-toolkit.md` + `creative-source-intake-workflow.md` | 判断当前任务属于母版通用方法论 / 子风格工具集 / 项目级设定 |
| 0.3 影片风格画质基调初筛 | `Director` + `Studio` | `prompt-experiment-skill` + `art-design-skill` | 创作源分析 + `film-style-tone-presets.json` + `style-recommendation-rules.json` | `style-filter-result.md`，输出 Top3 风格推荐、理由、风险和默认建议 |
| 0.4 故事开发线 / 制作执行线判定 | `Producer` + `Writer` | `script-writer-skill` / `shortdrama-adapt` / `shortdrama-format` | 创作成熟度 L0-L5 | L0-L2 进入 A线故事开发；L3-L5 进入 B线制作执行或剧本标准化 |
| 0.5 风格锁定母版 | `Director` | `art-design-skill` + 对应子风格 skill | 用户选择 / 系统默认风格 + `film-style-bible-standard.md` | `projects/<项目名>/03-assets/style/visual-style-bible.md`，作为资产、分镜、故事板图、视频生成的统一风格母版 |

### Phase 1: STORY — 故事阶段

| 步骤 | 执行 Agent | 调用 Skill | 输入 | 输出 |
|------|-----------|-----------|------|------|
| 1.1 立项与定题材 | `Producer` | — | 用户灵感/一句话 | `project.json` + 目录骨架 |
| 1.2 故事设计 (Logline/人设/大纲) | `Writer` | `script-writer-skill` + `shortdrama-character` + `shortdrama-outline` | `project.json` | `01-story/` 核心文档 |
| 1.3 剧本创作与审校 | `Writer` | `script-writer-skill` + `shortdrama-format` + `shortdrama-dialogue` | 大纲 + 人设 | `01-story/scripts/ep*.md` |

### Phase 2: DIRECTOR & ASSETS — 导演与资产阶段

| 步骤 | 执行 Agent | 调用 Skill | 输入 | 输出 |
|------|-----------|-----------|------|------|
| 2.1 导演讲戏与视觉风格 | `Director` | `director-skill` + `shot-design-skill` + `fpv-director-skill` + `art-design-skill` + 子风格 skill（如 `hzw-master-style-skill`） | 创作源分析 / 剧本 + `visual-style-bible.md` + `master-methodology-toolkit.md` + `style-guide.md` + `film-style-tone-system.md` + `scene-type-style-library.md` + 子风格系统文档（如 `hzw-master-style-system.md`）+ 动作/文戏/后期美学等规范 + `staging-impact-audiovisual-methodology.md` | `02-director/` 讲戏本 + `03-assets/` 设计表 + 项目级风格锁定母版继承说明 |
| **2.1b 角色设定稿生成** | `Studio` | `character-design-sheet-spec.md` + 生图工具词库 `character-design-sheet.json` + `art-style.json` + `quality-render.json` | 角色资产文档（外貌/服装/配饰）+ 设定稿规范 | `03-assets/characters/角色名_设定稿_vN.png` + `_meta.json`；**硬规则**：纯白/干净浅色背景、gpt-image-2 生成、细黑线分栏多宫格排版、多视图含正面/侧面/背面、服装道具区含纹样 zoom-in、表情库 2×3 网格、右侧全身主立绘；角色随身物归入角色设定稿 B 区，不单独出道具图 |
| **2.1c 独立道具设定稿生成** | `Studio` | `character-design-sheet-spec.md` §8 + `character-design-sheet.json` prop_design_sheet + `art-style.json` | 独立道具资产文档（仅限满足独立出图门禁的道具） | `03-assets/props/道具名_设定稿_vN.png` + `_meta.json`；**硬规则**：纯白背景、gpt-image-2、多视角（正面/侧面/背面/俯视）、细节 callout、使用方式/比例参考、右侧主展示图 |
| **2.1d 场景720度全景图生成** | `Studio` | `scene-design-sheet-spec.md` + `scene-design-sheet.json` + `art-design-skill` + `gpt-image-prompt-methodology.md` | 剧本场景段落 + 导演讲戏 + 场景空间母表（环境、建筑、设施、道具、群众/NPC/怪物/动物、主角站位、入口出口、动作路径） | `03-assets/scenes/场景ID_720-panorama_vN.png` + `_meta.json`；**硬规则**：gpt-image-2 生成，包含完整空间、设施道具、人物/群众/NPC/怪物/动物站位、动作路径、可拍摄机位区，是后续分镜与镜头调度的空间母图 |
| **2.1e 场景12宫格视角图生成** | `Studio` | `scene-design-sheet-spec.md` + `scene-design-sheet.json` + `shot-design-skill` | 已通过检查的 `720度全景场景母图` + 场景空间母表 | `03-assets/scenes/场景ID_12-view-grid_vN.png` + `_meta.json`；**硬规则**：gpt-image-2 生成，3×4 细分栏，固定 12 视角，建筑、设施、道具、人物站位、光线方向必须与720全景图一致 |
| 2.2 资产索引同步 | `Librarian` | `project-doctor-skill` | 全部资产文档（含新增设定稿、场景720全景图、12宫格视角图） | `03-assets/asset-index.md` + `03-assets/scenes/scene-index.md` |

### Phase 3: STORYBOARD — 分镜阶段

> **⚠️ 方法论自动加载门禁（强制度）**
> `Storyboard Artist` 在执行 Phase 3 任何步骤之前，必须根据任务内容自动加载对应方法论文档。**不需要 Producer 或用户手动触发，这是分镜阶段的硬性前置依赖。**
>
> **元规则：当 `docs/` 下新增任何方法论文档时，必须自动评估其归属并纳入下方对应任务类型行。完整方法论索引见 `skills/storyboard-artist-skill.md`「强制前置检查」。**
>
> | 任务类型 | 自动加载的方法论文档 |
> |---------|---------------------|
> | 所有提示词任务 | `creative-source-intake-workflow.md` + `film-style-tone-system.md` + `scene-type-style-library.md` + `film-style-bible-standard.md` + `storyboard-methodology.md` + `scene-storyboard-formulas.md` + `camera-shot-methodology.md` + `prompt-standards.md` + `long-prompt-detail-gate.md` + `seedance-prompt-engineering.md` + `seedance-multimodal-guide.md` + `dual-format-prompt-methodology.md` + `jimeng-anti-collapse-core.md` + `camera-language-dictionary.md` + `camera-psychology-movement-standard.md` + `perspective-system-emotional-mapping.md` + `lighting-dynamics-prompt-guide.md` + `lighting-color-aesthetics-standard.md` + `atmosphere-interaction-standard.md` + `blocking-camera-geometry-methodology.md` + `framing-aspect-ratio-standard.md` + `style-guide.md` + `hzw-master-style-system.md` + `transition-montage-standard.md` + `shot-duration-and-density-standard.md` |
> | 所有分镜任务额外自检 | `storyboard-methodology.md` §老白实操 SOP 增量层（7步拆解法 + 单镜标准模板 + 动作/视线/方向匹配剪辑 + 分镜三板斧 + 情绪时长量化表 + 主镜骨架法 + 景别/视高/构图规则 + 定义层/红线层/修复动作 + 视觉焦点/空间感/运镜逻辑/视角系统/蒙太奇） |
> | 双人对话 / 采访 / 对手戏 | 额外优先启用 `storyboard-methodology.md` §经典影视分镜基础层（180°轴线 + 正反打五镜头公式 + 景别量化标准 + 主镜头/OTS/单打/侧机位模板） |
> | 多人 / 多轴互动 | 额外优先启用 `storyboard-methodology.md` §轴向类型补充（I 型 / L 型 / A 型 / A2 型 / U 型 / O 型轴） |
> | 动作戏/打斗/追逐/法术 | 额外加载 `action-methodology.md` + `action-combat-design-standard.md` + `action-enhancement-guidelines.md` + `action-prompt-guidelines.md` + `action-speed-design-standard.md` + `action-vocabulary.md` + `action-case-opposition-force-camera.md` + `staging-impact-audiovisual-methodology.md` + `zero-gravity-parkour-standard.md` + `shot-language-library.md` + `dance-rhythm-aesthetics-standard.md` + `environmental-destruction-standard.md`；若出现瞬移 / 影分身 / 闪现 / 残影瞬杀，必须额外执行 `action-speed-design-standard.md` 的瞬移影杀专项字段与 `action-case-opposition-force-camera.md` 的瞬移影杀逐秒时间轴规范 |
> | 含飞行/坠落/失重 | 额外加载 `zero-gravity-parkour-standard.md`（滞空+四肢代偿+破风阻力） |
> | 含追逐/穿越/穿洞 | 额外加载 `fpv-director-skill.md` + `camera-psychology-movement-standard.md` §2.6（FPV 三段式） |
> | 含多人场面/围攻 | 额外加载 `crowd-choreography-standard.md` + `blocking-camera-geometry-methodology.md` |
> | 含特效/魔法/能量 | 额外加载 `vfx-design-standard.md` + `lighting-dynamics-prompt-guide.md` |
> | 含角色成长/伤痕/换装 | 额外加载 `character-visual-arc-standard.md` + `texture-aging-standard.md` |
> | 纯文戏/对白 | 额外加载 `drama-tension-design-standard.md` + `dialogue-voice-design-standard.md` + `sound-design-montage-standard.md` |
> | 即梦 / 图生视频 / 连续人物片段 | 额外加载 `jimeng-anti-collapse-core.md`，锁定参考强度75、seed、人物描述、单段2-3秒、首尾帧、光线、比例、运动速度6、采样步数40 |
> | 子风格项目 / 风格化模板任务 | 额外加载 `master-methodology-toolkit.md` + 对应子风格系统文档与 skill；例如 HZW 项目加载 `hzw-master-style-system.md` + `hzw-master-style-skill.md`，先继承母版的文戏/动作/分镜/生图/视频/声音/后期规范，再锁定子风格角色锚点、场景锚点、光影锚点、色彩锚点、镜头锚点，保证生图/分镜/场景/视频提示词同源 |
> | 使用参考图 | 额外加载 `reference-image-analysis-standard.md` + `genre-visual-playbook.md` |

| 步骤 | 执行 Agent | 调用 Skill | 输入 | 输出 |
|------|-----------|-----------|------|------|
| 3.1 故事板生产包输出 | `Storyboard Artist` | `storyboard-methodology-skill` + `storyboard-artist-skill` + `storyboard-generator-skill` + `director-storyboard-image-skill` + `shot-design-skill` + `fpv-director-skill` + `dialogue-voice-director-skill` + `foley-sound-designer-skill` | 讲戏本 + 资产索引 + 动作/文戏/后期/转场/光影/运镜心理学规范 + `dialogue-voice-design-standard.md` + **上方方法论自动加载表匹配的文档** | `04-storyboard/` + `04-storyboard/director-boards/`（默认形成分镜表、D12-Sora2 / D15-Seedance2 专业导演故事板图结构、Panel 格数与每格时长、板内/板间连续性卡、资产引用矩阵、参考图职责矩阵、视频模型适配说明；故事板图包含分镜图、剧本、站位空间关系、运镜运动关系、镜头语言、音效、对白、光影、风格、导演批注和资产引用，是当前中游主交付物。`05-prompts/` 仅作为下游配套生成说明归档，不作为中游核心输出。） |

### Phase 4: GENERATION — 生成阶段

| 步骤 | 执行 Agent | 调用 Skill | 输入 | 输出 |
|------|-----------|-----------|------|------|
| 4.1 配套生成说明输出（下游 / 可选） | `Director` + `Librarian` | `storyboard-generator-skill` + `fpv-director-skill` + `seedance-multimodal-skill` | 已放行的故事板生产包 + 资产索引 + 参考图职责矩阵 + 动作/文戏/视听/美学/转场/运镜心理规范 | `05-prompts/` 配套生成说明（仅服务最终视频生成，不作为中游主交付；必须可追溯到同一故事板母段） |
| 4.2 模型适配实验与正式生成 | `Studio` | `runninghub-image-skill` + `prompt-sync-skill` + `seedance-multimodal-skill` | 故事板生产包 + 资产图 + 参考图职责矩阵 + 模型适配说明 + 下游配套生成说明；正式生成前必须先确认故事板图、Panel 时长、资产引用、连续性卡、声音标注和参考图优先级已放行；若生成说明缺失主体、动作、景别、镜头、声音、光线、环境联动或与故事板不一致，必须打回故事板/生成说明对齐后再生成。涉及即梦 2.0 / 图生视频 / 连续人物片段时，仍需加载 `jimeng-anti-collapse-core.md` 执行防崩参数；涉及 GPT 生图 / `gpt-image-2` / 图生图精修时，仍需加载 `gpt-image-prompt-methodology.md` 生成结构化视觉设计说明书。 | `06-generated/` 素材 |
| 4.3 连续性检查与归档 | `Director` | `continuity-check-skill` | 生成素材 vs 资产设定 vs 故事板生产包 | `08-qa/` 检查记录 |

### Phase 5: EDIT & QA — 剪辑与质检阶段

| 步骤 | 执行 Agent | 调用 Skill | 输入 | 输出 |
|------|-----------|-----------|------|------|
| 5.1 剪辑说明与初步 QA | `Reviewer` | `quality-control-skill` | 分镜表 + 生成素材 + 转场/后期美学规范 + 最新提示词规范（六固定段、声音双流程、动作镜头绑定规则、`FPV` 路径与结果镜头规则） | `07-edit/` 剪辑说明 + `08-qa/` 审核报告（含 `ep*-prompt-review.md`） |
| 5.2 终审与发布包装 | `Producer` | — | 通过 QA 的内容 | `09-publish/` 发布包 |

---

## 四、流水线链路闭环（Pipeline Sync v2 分层版）

> **详细规范**：`docs/pipeline-sync-protocol.md`

每新增/修改 Skill、方法论、规范、Agent 能力或模型工具时，**必须**执行链路闭环验证。  
验证深度按影响等级（L1/L2/L3）分层，~80% 的变更走轻量级路径。

### 影响等级速判

| 等级 | 判断标准 | 验证深度 | 预估 token |
|------|---------|---------|-----------|
| **L1** | 只改"怎么说"，没改"产出什么"和"谁负责什么" | 登记 + 自评 + 日志（不读文件） | ~300 |
| **L2** | 新增可选能力，不替换已有规范/格式 | 登记 + 上游 + 1-hop 传播 + 日志 | ~800 |
| **L3** | 改了产出格式/Agent职责/门禁/模型/模板 | 完整 6 步（含端到端干跑） | ~3000+ |

### 批量窗口

| 等级 | 处理时机 |
|------|---------|
| **L1** | Phase Gate 切换时统一签收 |
| **L2** | Phase Gate 前 或 积累 ≥ 3 个时 |
| **L3** | 立即执行，不可延迟 |

### 与 Phase Gate 的关系
```
L3 → 立即闭环 → Phase Gate 前确认签收
L1/L2 → 积累 → Phase Gate 前批量签收 → Phase Gate 正常门禁 → 放行
```

> Producer 在 Phase Gate 前只需确认：无未完成 L3 + L1/L2 已批量清理。

---

## 五、全局支撑与门禁规则

1. **`Producer` 拥有最高决策权**：负责在每个阶段（Phase）结束时决定"放行"或"返工"。
2. **`Librarian` 负责数据真实性**：每当有资产变动或进度推进，必须由 `Librarian` 更新状态文件。
3. **文件化记忆优先**：任何会影响方法论、工作流、Agent 协作、Skill 调用、模板、门禁或项目产出物状态的知识，必须写入项目文件；对话记忆只能作为辅助索引，不能替代 `docs/project-memory-system.md`、`docs/workflow.md`、`docs/pipeline-sync-log.md`、`docs/workspace-status.md` 等项目内文件化记忆。
4. **门禁条件**：沿用原 Phase Gate 标准，但由核心 Agent 自行通过 Skill 完成自检。
5. **链路闭环**：任何 Skill/规范/Agent/模型变更必须先完成 Pipeline Sync，再进入 Phase Gate（见第四章）。


---

## 四、Agent × Skill 调用关系总表

| Agent | 调用的 Skill |
|-------|-------------|
| `master` | `script-writer-skill`、`shortdrama-outline`、`shortdrama-structure`、`quality-control-skill` |
| `scriptwriter` | `script-writer-skill`、`shortdrama-outline`、`shortdrama-structure`、`shortdrama-character`、`shortdrama-dialogue`、`shortdrama-adapt`、`shortdrama-format` |
| `director` | `director-skill`、`director-storyboard-image-skill`、`shot-design-skill`、`seedance-action-skill` |
| `art-director` | `art-design-skill`、`production-design-skill` |
| `storyboard-artist` | `storyboard-artist-skill`、`storyboard-generator-skill`、`director-storyboard-image-skill`、`shot-design-skill`、`seedance-action-skill` |
| `prompt-lab` | `prompt-experiment-skill`（含智能匹配：题材识别/风格推荐/时长估算） |
| `generation-executor` | `runninghub-image-skill`、`director-storyboard-image-skill` |
| `quality-control` | `quality-control-skill`、`script-review-skill` |
| `seedance-technical-director` | （读取 docs 规范，无独立 Skill） |
| `script-standard-auditor` | （读取 `shortdrama-script-standard.md`） |
| `context-loader` | （无独立 Skill，文档读写驱动） |
| `continuity-supervisor` | （无独立 Skill，检查驱动） |
| `asset-librarian` | （无独立 Skill，索引驱动） |
| `editor` | （无独立 Skill） |
| `operations-analyst` | （无独立 Skill） |
| `publisher` | （无独立 Skill） |

---

## 五、剧本正文格式规范（必须遵守）

剧本正文必须严格遵守 `docs/shortdrama-script-standard.md`：

### 场景标题
```
场景 [集数]-[场景序号] [时间] [内/外] [地点]
```
示例：`场景 1-1 日 外 林家练武场`

### 动作描述符号
- `△`：动作/镜头提示
- `△△`：重要动作
- `()`：情绪/语气
- `...`：台词停顿

### 镜头提示
- `△ 远景`：建立场景/大场面
- `△ 全景`：展示多人/完整空间
- `△ 中景`：对话场景
- `△ 近景`：情绪表达
- `△ 特写`：关键细节
- `△ 慢动作`：高潮时刻
- `△ 快切`：激烈场面

### 人物首次出场
必须带年龄/身份，如：
```
**林天**（17岁，瘦削少年，黑发微乱，旧布衣打补丁）
```

### 质量检查清单
每集剧本末尾附：
- [x] 场景标题格式规范
- [x] 人物首次出场带年龄/身份
- [x] 动作描述使用 `△`/`△△`
- [x] 镜头提示准确
- [x] 台词格式正确
- [x] 每集结尾留钩子
- [x] 【文戏】没有纯对白站桩，已标出支点动作/潜台词
- [x] 【武戏】写明了强弱变化与物理受力结果
- [x] 【环境】指定了场景的物理介质（风、雨、雾、雪）及其对人物的生理影响
- [x] 【角色成长】明确标出核心角色当前的视觉阶段（低谷/觉醒/战损等）
- [x] 【运镜动机】特殊运镜（如逼近、后退、手摇）已与角色心理状态绑定

---

## 六、标准文件命名规范

### 剧本文件
- 短剧：`01-story/scripts/ep001.md`、`ep002.md` ...
- 漫剧：`01-story/scripts/chapter001.md` 或中文命名（项目级决定）

### 资产文件
- 角色：`03-assets/characters/角色名.md`
- 场景：`03-assets/scenes/场景名.md`
- 道具：`03-assets/props/道具名.md`

### 生成资产
```
<用途>-<对象>-<版本>-<日期>[-序号].<扩展名>
```
示例：`角色定妆-林天-v1-20260412.png`

---

## 七、返工规则

### 可以小修后放行
- 个别台词不够利落
- 少量镜头措辞需调整
- 单个道具索引缺失但不影响主流程

### 必须打回重做
- 故事主冲突不成立
- 风格严重漂移
- 分镜不可执行
- 资产无法复用
- 合规风险 P0/P1 且影响核心内容

### 返工必须说明
- 退回给谁
- 退回原因
- 必改项 / 可不改项
- 修改后是否需要复审

---

## 八、快速参考：我现在该调谁？

| 你现在要做的事 | 调用 Agent | 它会用的 Skill |
|--------------|-----------|--------------|
| 写一句话剧情 | `scriptwriter` | `script-writer-skill` |
| 从小说提炼主线 | `scriptwriter` | `shortdrama-adapt` |
| 设计人物 | `scriptwriter` | `shortdrama-character` |
| 写总大纲 | `scriptwriter` | `shortdrama-outline` + `shortdrama-structure` |
| 写单集剧本 | `scriptwriter` | `script-writer-skill` + `shortdrama-format` + `shortdrama-dialogue` |
| 审校剧本格式 | `script-standard-auditor` | 读取 `shortdrama-script-standard.md` |
| 导演讲戏 | `director` | `director-skill` |
| 设计动作戏 | `director` | `seedance-action-skill` |
| 只做镜头设计 / 运镜方案 | `director` 或 `storyboard-artist` | `shot-design-skill` |
| 设计人物/场景/道具 | `art-director` | `art-design-skill` + `production-design-skill` |
| 做分镜 | `storyboard-artist` | `storyboard-artist-skill` + `storyboard-generator-skill`（含台词锁定 + 链式生成） |
| 做 D12-Sora2 / D15-Seedance2 导演故事板图 | `storyboard-artist` + `studio` | `director-storyboard-image-skill` + `shot-design-skill` |
| 实验提示词 | `prompt-lab` | `prompt-experiment-skill`（含智能匹配预处理） |
| 执行生成 | `generation-executor` | `runninghub-image-skill` |
| 质检 | `quality-control` | `quality-control-skill` + `script-review-skill` |
| 恢复上次进度 | `context-loader` | — |
| 检查连续性 | `continuity-supervisor` | — |
| 管理资产 | `asset-librarian` | — |
| 发布 | `publisher` | — |
| 分析效率 | `operations-analyst` | — |
| Seedance 技术方案 | `seedance-technical-director` | — |
| 统筹调度 | `master` | 按需调用 |
