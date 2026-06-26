# 神词系统能力迁移方案（第一版）

## 目标

在**不拆分主项目架构**的前提下，把 `/Users/billy/Documents/AI_pro/神词系统/` 中真正高价值的能力迁入 `漫剧创作库`，优先吸收：

- **词库层**：17 个 JSON 词库中的高复用部分
- **规则层**：台词锁定、时长估算、链式生成、多版本一致性、否定句修正等可工程化能力
- **输出层**：三版本提示词模板与 HTML 工作台外壳

本方案的原则不是“整包搬家”，而是：

> **词库迁移、规则吸收、模板改挂、系统不分裂。**

---

## 一、结论先行

### 1. 当前不建议做的事

- **不建议**把 `神词系统` 整套 `agents/skills/docs/templates` 原样复制进主项目
- **不建议**保留两套平行 Prompt 母规范
- **不建议**现在就把 `@lingjing` 的独立调用体系并入主工作流
- **不建议**先搬 HTML 再补底层数据结构

### 2. 当前建议做的事

- **优先迁移词库 JSON**，作为主项目的底层资源层
- **优先吸收规则能力**，接入现有 `storyboard / prompt / QA / phase gate`
- **最后迁移三版本模板与 HTML 工作台壳层**，改造成主项目的提示词输出工作台

---

## 二、当前现状判断

### 2.1 神词系统真正高价值资产

#### A. 词库层（17 个 JSON）
- 基础词库：
  - `director-styles.json`
  - `visual-styles.json`
  - `camera-language.json`
  - `lighting-atmosphere.json`
  - `narrative-pace-presets.json`
  - `genre-keywords.json`
- 视觉系统扩展：
  - `perspective-system.json`
  - `camera-psychology.json`
  - `lighting-dynamics.json`
  - `vfx-design.json`
  - `atmosphere-interaction.json`
  - `environmental-destruction.json`
  - `action-speed.json`
  - `composition-geometry.json`
  - `transition-montage.json`
- 听觉系统扩展：
  - `sound-design.json`
  - `dialogue-voice.json`

#### B. 规则层
- `docs/dialogue-lock-rules.md`：台词锁定
- `docs/shot-duration-algorithm.md`：镜头时长分配
- `docs/auto-match-system.md`：题材识别 / 时长估算 / 风格推荐
- `docs/chain-engine-workflow.md`：长剧本链式生成 / 断点恢复
- `skills/lingjing-integrate-skill.md`：三版本派生 / 否定句修正 / 一致性校验

#### C. 输出层
- `templates/seedance-template.md`
- `templates/jimeng-template.md`
- `templates/narrative-template.md`
- `outputs/index.html` + workbench 相关壳层

---

### 2.2 漫剧创作库已经覆盖的能力

主项目在方法论层其实已经覆盖了神词系统中大量“概念层”内容，尤其是：

- `docs/prompt-standards.md`
- `docs/seedance-prompt-engineering.md`
- `docs/dual-format-prompt-methodology.md`
- `docs/storyboard-methodology.md`
- `docs/camera-shot-methodology.md`
- `docs/perspective-system-emotional-mapping.md`
- `docs/camera-psychology-movement-standard.md`
- `docs/lighting-dynamics-prompt-guide.md`
- `docs/transition-montage-standard.md`
- `docs/action-speed-design-standard.md`
- `docs/environmental-destruction-standard.md`
- `docs/vfx-design-standard.md`
- `docs/dialogue-voice-design-standard.md`
- `docs/sound-design-montage-standard.md`

同时已有这些生产节点：

- `skills/storyboard-artist-skill.md`
- `skills/storyboard-generator-skill.md`
- `skills/seedance-action-skill.md`
- `skills/dialogue-voice-director-skill.md`
- `skills/foley-sound-designer-skill.md`
- `skills/prompt-experiment-skill.md`
- `docs/workflow.md`
- `docs/phase-gate-checklist.md`

**结论**：
主项目缺的不是“再来一套平行方法论”，而是：

- 把已有方法论背后的**词库资源层**补齐
- 把神词系统的**规则工程能力**接入现有主链
- 把神词系统的**模板 / 工作台展示层**改挂为主项目输出壳

---

## 三、迁移总原则

### 原则 1：词库可迁，方法论不平移
- JSON 词库可以迁入主项目
- 神词系统的 `.md` 方法论文档原则上不原样平移
- 如确有新价值，应按主项目现有体系做**提炼后融合**

### 原则 2：单一 Prompt 母规范
主项目继续以以下文件作为唯一 Prompt 母规范：
- `docs/prompt-standards.md`
- `docs/seedance-prompt-engineering.md`
- `docs/dual-format-prompt-methodology.md`

神词系统的模板 / 规则 / 展示层必须挂靠到这三者，不能另起一套标准。

### 原则 3：HTML 是壳，不是新主流程
- HTML 工作台只作为主项目 Prompt 输出与人工校对壳层
- 不把 `@lingjing` 独立调用协议直接并入主工作流
- 不形成“项目内再套一个独立系统”

### 原则 4：先底层，后展示
迁移顺序必须是：
1. 词库层
2. 规则层
3. 模板层
4. HTML 壳层

---

## 四、迁移优先级表

## Phase A：优先迁移（高价值、低冲突）

### A1. 视觉 / 听觉扩展词库（建议原样迁入）
这些词库和主项目方法论高度互补，适合直接进入新的词库目录，例如：`wordlists/visual/`、`wordlists/audio/`。

| 来源文件 | 建议优先级 | 主项目对应挂载点 | 说明 |
|---|---|---|---|
| `perspective-system.json` | P0 | `docs/perspective-system-emotional-mapping.md` / `skills/storyboard-artist-skill.md` | 作为视角系统资源层 |
| `camera-psychology.json` | P0 | `docs/camera-psychology-movement-standard.md` / `skills/shot-design-skill.md` | 作为心理运镜资源层 |
| `lighting-dynamics.json` | P0 | `docs/lighting-dynamics-prompt-guide.md` | 作为光动态化资源层 |
| `transition-montage.json` | P0 | `docs/transition-montage-standard.md` | 作为转场资源层 |
| `sound-design.json` | P0 | `docs/sound-design-montage-standard.md` / `skills/foley-sound-designer-skill.md` | 作为声音设计资源层 |
| `dialogue-voice.json` | P0 | `docs/dialogue-voice-design-standard.md` / `skills/dialogue-voice-director-skill.md` | 作为对白配音资源层 |
| `action-speed.json` | P1 | `docs/action-speed-design-standard.md` / `skills/seedance-action-skill.md` | 作为动作速度资源层 |
| `composition-geometry.json` | P1 | `docs/blocking-camera-geometry-methodology.md` / `docs/framing-aspect-ratio-standard.md` | 作为构图几何资源层 |
| `vfx-design.json` | P1 | `docs/vfx-design-standard.md` | 作为特效资源层 |
| `atmosphere-interaction.json` | P1 | `docs/atmosphere-interaction-standard.md` | 作为环境介质资源层 |
| `environmental-destruction.json` | P1 | `docs/environmental-destruction-standard.md` | 作为破坏物理资源层 |

### A2. 基础辅助词库（选择性迁入）
这些词库价值存在，但冲突和重复风险更高，建议只迁“查表资源”，不把其上升为新母规范：

| 来源文件 | 建议优先级 | 风险 | 建议 |
|---|---|---|---|
| `director-styles.json` | P2 | 和主项目导演方法可能表达冲突 | 作为风格参考库，不作为硬门禁 |
| `visual-styles.json` | P2 | 和 `style-guide.md` / `genre-visual-playbook.md` 可能重叠 | 做风格词补充索引 |
| `camera-language.json` | P2 | 和 `camera-language-dictionary.md` 重复 | 只吸收缺词，不保留双字典 |
| `lighting-atmosphere.json` | P2 | 和光影类文档部分重复 | 只做词库化补充 |
| `genre-keywords.json` | P2 | 可能与题材映射冲突 | 可作为风格推荐实验输入 |
| `narrative-pace-presets.json` | P2 | 需和主项目时长 / 节奏规则对齐 | 先实验，后并入 |

---

## Phase B：规则层吸收（高价值、中冲突）

### B1. 建议优先吸收的规则能力

| 来源 | 目标挂载点 | 建议处理方式 |
|---|---|---|
| `dialogue-lock-rules.md` | `storyboard-generator-skill.md` / `quality-control-skill.md` / `phase-gate-checklist.md` | 融合为主项目“台词锁定”硬门禁 |
| `shot-duration-algorithm.md` | `storyboard-generator-skill.md` / `docs/shot-duration-and-density-standard.md` | 吸收算法，不保留第二套时长母规范 |
| `auto-match-system.md` | `prompt-experiment-skill.md` 或新增轻量 docs | 吸收“题材识别 / 时长估算 / 风格推荐”逻辑 |
| `chain-engine-workflow.md` | 未来可接 `storyboard-generator-skill.md` / `tools/` | 只吸收长剧本链式策略与断点思想 |
| `lingjing-integrate-skill.md` 中的三版本一致性与否定句修正 | `quality-control-skill.md` / Prompt QA 工具 | 拆成规则，不迁整 skill |

### B2. 暂不建议直接并入的规则
- 独立 `@lingjing` 指令协议
- 独立输出目录哲学（`lingjing/outputs/`）
- 灵境 Agent / Skill 完整调度层

原因：这会把“能力迁移”重新推向“系统并存”。

---

## Phase C：模板层迁移（中价值、低风险）

### C1. 建议迁移方式
神词系统的三版本模板不建议原地替代主项目模板，而建议：

- 把其核心结构吸收到主项目模板体系
- 或新增一组 **输出模板**，明确它们是“展示 / 导出模板”，不是母规范源头

建议目录：
- `templates/_shared/prompt-output/seedance-long-template.md`
- `templates/_shared/prompt-output/jimeng-template.md`
- `templates/_shared/prompt-output/narrative-template.md`

### C2. 当前模板关系判断
- 主项目已有：`templates/_manga-template/05-prompts/seedance-prompt-template.md`
- 神词系统已有：`seedance-template.md` / `jimeng-template.md` / `narrative-template.md`

判断：
- `seedance-template.md` 的“六字段 + 文件头 + 文件尾固定段”可吸收为**输出模板增强版**
- `jimeng-template.md` 与 `narrative-template.md` 可以补足主项目当前模板体系中的**平台派生稿模板缺口**

---

## Phase D：HTML 工作台壳层迁移（最后做）

### D1. 建议定位
HTML 工作台只做这些事：
- 展示长版 / 即梦版 / 叙事版三版本结果
- 支持版本切换、复制、折叠、场次导航
- 显示资产引用和 QA 状态
- 作为人工改稿与校对工作台

### D2. 不建议定位
- 不做独立系统入口
- 不做 `@lingjing` 式新工作流前缀
- 不做隔离目录哲学
- 不做主项目外第二套 agent 调度面板

### D3. 建议落点
可新增：
- `tools/prompt-workbench/`
- `templates/_shared/prompt-output/index.html`
- `docs/prompt-workbench-spec.md`

---

## 五、冲突处理策略

### 5.1 明确不保留双份母规范的主题
以下主题主项目已经存在，不保留神词系统平行文档：

- Prompt 基础规范
- Seedance 母格式
- 叙事提示词规范
- 运镜心理学
- 视角系统
- 光动态化
- 动作速度
- 转场蒙太奇
- 声音设计
- 对白配音
- 环境介质 / 材质破坏 / 特效

### 5.2 允许保留的“双层结构”
以下结构可以同时存在：

- **上层**：主项目方法论文档（解释为什么）
- **下层**：迁移进来的 JSON 词库（提供查表和调用资源）

即：

- `docs/*.md` 负责方法论
- `wordlists/*.json` 负责资源化表达

这不是重复，而是“方法论层 + 词库层”的合理分工。

---

## 六、建议目录设计（迁移后）

建议在主项目新增：

```text
wordlists/
├── visual/
│   ├── perspective-system.json
│   ├── camera-psychology.json
│   ├── lighting-dynamics.json
│   ├── composition-geometry.json
│   ├── transition-montage.json
│   ├── vfx-design.json
│   ├── atmosphere-interaction.json
│   └── environmental-destruction.json
├── motion/
│   └── action-speed.json
├── audio/
│   ├── sound-design.json
│   └── dialogue-voice.json
└── style/
    ├── director-styles.json
    ├── visual-styles.json
    ├── genre-keywords.json
    ├── lighting-atmosphere.json
    └── narrative-pace-presets.json
```

模板建议：

```text
templates/_shared/prompt-output/
├── seedance-long-template.md
├── jimeng-template.md
├── narrative-template.md
└── index.html
```

---

## 七、推荐执行顺序（可直接照做）

### 第 1 步：词库落盘
- 先迁 P0 / P1 的 11 个词库 JSON
- 建立主项目 `wordlists/` 目录
- 先不改主流程，只完成资源入库

### 第 2 步：写一份词库索引文档
建议新增：
- `docs/prompt-wordlist-migration-map.md`

内容包括：
- 每个词库对应哪个方法论文档
- 哪些 skill / agent 应读取它
- 哪些是实验性词库，哪些是正式词库

### 第 3 步：吸收台词锁定规则
优先把 `dialogue-lock-rules.md` 的能力接到：
- `storyboard-generator-skill.md`
- `quality-control-skill.md`
- `docs/phase-gate-checklist.md`

### 第 4 步：吸收时长 / 三版本校验规则
- 把 `shot-duration-algorithm.md` 的算法吸收到 `docs/shot-duration-and-density-standard.md`
- 把三版本一致性 / 否定句修正规则接入 Prompt QA 或现有 `quality-control-skill.md`

### 第 5 步：迁移模板
- 新增主项目三版本输出模板
- 保持主项目 Prompt 母规范不变

### 第 6 步：最后上 HTML 工作台
- 用主项目数据结构驱动
- 不直接照搬灵境独立调用壳

---

## 八、最小可行迁移包（MVP）

如果只做一轮最小但有效的迁移，我建议先做这 6 件：

1. 迁入 `perspective-system.json`
2. 迁入 `camera-psychology.json`
3. 迁入 `lighting-dynamics.json`
4. 迁入 `transition-montage.json`
5. 迁入 `sound-design.json`
6. 迁入 `dialogue-voice.json`

并同步补一份主项目文档：
- `docs/prompt-wordlist-migration-map.md`

这是最稳、最不容易冲突、又能立刻提升 Prompt 系统表达密度的一步。

---

## 九、最终建议

当前阶段最合理的路线不是“把神词系统独立出来”，而是：

> **把神词系统沉淀为主项目的词库层、规则层和输出层增强包。**

这样做有 4 个好处：
- 不破坏现有上下文连续性
- 不引入拆分失真
- 快速提升 Prompt 产能
- 未来仍然保留独立成系统的可能

如果后续出现以下信号，再考虑独立：
- 多个项目共用同一套 Prompt 词库与工作台
- Prompt 工作台开始服务多个上游系统
- 主项目中的 Prompt 层明显膨胀成独立产品形态

在那之前，**能力迁移优先，系统独立暂缓**。
