# 项目记忆系统与工作流协作规范

> 用途：把创作库的长期记忆、方法论、工作流协作思想和产出物闭环，以项目文件形式固定保存。  
> 核心原则：**对话记忆不是唯一记忆源；所有可复用方法、规则、协作方式、产出物链路和阶段结论，都必须落到项目文件中，形成可检索、可追溯、可复用的文件化记忆链条。**

---

## 一、记忆系统总原则

### 1. 文件化优先

任何新增或修改以下内容时，不能只停留在聊天、临时总结或外部记忆中：

- 方法论
- 提示词规则
- 分镜 / 镜头 / 动作 / 声音 / 生图 / 视频生成规范
- Agent 职责
- Skill 调用规则
- Workflow 阶段流转方式
- Phase Gate 门禁
- Pipeline Sync 闭环记录
- 项目级产出物状态
- 失败复盘和成功经验

必须至少同步到一个项目内文件；若影响到工作流或产出标准，必须按 Pipeline Sync v2 继续同步到相关上下游文件。

### 2. 对话记忆与项目文件的关系

本项目记忆分为两类：

| 类型 | 作用 | 是否权威 | 说明 |
|---|---|---|---|
| 对话 / 持久记忆 | 让助手跨会话记住用户偏好和长期事实 | 辅助权威 | 便于自动加载，但不应成为唯一来源 |
| 项目文件化记忆 | 让项目本身可继承、可复盘、可交接 | 最高权威 | 必须存放在 `docs/`、`skills/`、`agents/`、`templates/`、`projects/` 等目录 |

结论：**凡是会影响生产流程、方法论、模板、门禁、Agent 协作或项目产出物的知识，都必须写进项目文件。**

---

## 二、文件化记忆分层

### L0：入口与总控层

| 文件 | 记忆职责 |
|---|---|
| `README.md` | 工作区总入口 |
| `docs/workflow.md` | 全流程阶段、Agent × Skill 调用、方法论自动加载、Phase Gate 流转 |
| `docs/agent-protocol.md` | Agent 之间的协作、交接、文件化汇报规范 |
| `docs/workspace-status.md` | 工作区状态总览、已落盘能力索引 |
| `docs/project-memory-system.md` | 本文件，定义记忆系统与文件化保存规范 |

### L1：方法论记忆层

| 目录 / 文件 | 记忆职责 |
|---|---|
| `docs/master-methodology-toolkit.md` | 母版通用方法论工具集 |
| `docs/storyboard-methodology.md` | 分镜总方法论 |
| `docs/camera-shot-methodology.md` | 运镜与镜头专项方法论 |
| `docs/action-*.md` | 动作戏、速度、对抗、提示词、词汇、案例方法论 |
| `docs/prompt-standards.md` | 全局提示词规范 |
| `docs/long-prompt-detail-gate.md` | 长版提示词详细度门禁 |
| `docs/gpt-image-prompt-methodology.md` | GPT 生图专项方法论 |
| `docs/jimeng-anti-collapse-core.md` | 即梦防崩核心规范 |
| `docs/hzw-master-style-system.md` | HZW 子风格工具集 |

### L2：执行能力记忆层

| 目录 / 文件 | 记忆职责 |
|---|---|
| `skills/` | 跨项目复用能力模块，把方法论转成可执行检查表和生成规则 |
| `agents/` | Agent 角色职责、输入输出、协作边界和执行红线 |
| `templates/` | 项目模板、漫剧模板、共享提示词输出模板 |

### L3：产出物记忆层

| 目录 | 记忆职责 |
|---|---|
| `projects/*/01-story/` | 剧本、大纲、分话规划 |
| `projects/*/02-director/` | 导演讲戏、调度、美术方向 |
| `projects/*/03-assets/` | 角色卡、场景卡、道具卡、资产索引 |
| `projects/*/04-storyboard/` | 分镜表、镜头组、漫画分格脚本 |
| `projects/*/05-prompts/` | Seedance / 即梦 / 叙事版提示词、长版母稿与派生稿 |
| `projects/*/06-generated/` | 生成素材 |
| `projects/*/07-edit/` | 剪辑说明 |
| `projects/*/08-qa/` | QA 审核、提示词审核、连续性检查 |
| `projects/*/09-publish/` | 发布物料与复盘 |

### L4：闭环与复盘记忆层

| 文件 | 记忆职责 |
|---|---|
| `docs/pipeline-sync-log.md` | 所有方法论 / Skill / Agent / Workflow 变更的闭环签收记录 |
| `docs/pipeline-sync-protocol.md` | L1/L2/L3 影响等级与闭环执行协议 |
| `docs/production-log.md` | 工作区级长期决策与经验沉淀 |
| `docs/daily-log.md` | 日常推进、卡点和短期决定 |
| `docs/learning-from-failure.md` | 失败案例与修复经验 |
| `docs/prompt-casebook.md` | 提示词案例、实验、失败复盘 |

---

## 三、标准工作流协作思想

本项目不是“单点生成提示词”，而是影视工业化协作链：

```text
灵感 / 设定
→ Writer 剧本与人物关系
→ Director 讲戏、调度、风格和动作意图
→ Storyboard Artist 分镜总装、镜头组、故事板生产包
→ Camera Director 单镜任务、机位、视角、运镜和结果兑现
→ Librarian 资产索引、@引用、故事板引用矩阵、状态快照和跨集连续性
→ Studio 故事板图生成、平台适配、AI 生成、实验与归档
→ Reviewer 剪辑、故事板 QA、连续性 QA、生成结果 QA
→ Producer Phase Gate 放行、返工和 Pipeline Sync 签收
```

### 核心协作原则

1. **先文件，后汇报**：任何 Agent 完成关键工作，必须先落文件，再口头汇报。
2. **先母稿，后派生**：Seedance / 即梦 / 叙事版必须追溯同一长版母稿。
3. **先方法论，后产出物**：产出前必须根据任务类型加载对应方法论文档。
4. **先关系，后爆点**：动作、文戏、对峙、悬疑都必须先建关系，再做风格和冲击。
5. **先闭环，后放行**：任何 L3 变更必须先完成 Pipeline Sync，再进入 Phase Gate。
6. **先真实源，后引用**：所有 `@Image`、资产名、角色卡、场景卡必须来自真实文件或资产索引。
7. **先 QA，后生成 / 发布**：缺字段、缺结果镜头、缺声音、缺负面提示词、缺资产引用时必须打回。

---

## 四、方法论新增 / 吸收的文件化闭环 SOP

用户提供新资料、案例、提示词、课程笔记或生成经验后，必须按以下流程处理：

### Step 1：分类判断

先判断资料属于：

- 母版通用方法论
- 子风格工具集
- 分镜方法论
- 镜头 / 运镜专项
- 动作戏专项
- 文戏对白专项
- 生图专项
- 视频生成专项
- 声音 / 后期专项
- 平台参数专项
- 项目级设定或产出物

### Step 2：提炼而非照抄

必须提炼为：

- 核心公式
- 标准链路
- 可执行字段
- 失败信号
- 打回条件
- 适用场景
- 与现有方法论的关系

### Step 3：写入方法论文档

按归属写入对应 `docs/*.md`。如果是跨模块能力，必须更新多个 docs，而不是只写一个案例文件。

### Step 4：同步 Skill

把方法论转成可执行检查项，写入相关 `skills/*.md`。

### Step 5：同步 Agent

若改变职责、输入输出或协作边界，必须写入相关 `agents/*/agent.md`。

### Step 6：同步 Workflow / Phase Gate

若影响产出流程或放行标准，必须同步：

- `docs/workflow.md`
- `docs/phase-gate-checklist.md`

### Step 7：同步模板

若影响输出格式，必须同步：

- `templates/_shared/prompt-output/`
- `templates/_project-template/`
- `templates/_manga-template/`

### Step 8：登记 Pipeline Sync

所有变更必须登记：

- `docs/pipeline-sync-log.md`

### Step 9：更新文件化记忆

若该知识具有长期复用价值，必须补充到：

- `docs/project-memory-system.md`
- 必要时同步 `docs/workspace-status.md`
- 必要时同步 `.workbuddy/memory/MEMORY.md` 作为本地助手记忆索引

---

## 五、当前已文件化保存的关键记忆链条

### 1. 总工作流记忆

- `docs/workflow.md`
- `docs/phase-gate-checklist.md`
- `docs/pipeline-sync-protocol.md`
- `docs/pipeline-sync-log.md`
- `docs/agent-protocol.md`
- `docs/workspace-status.md`

### 2. 分镜 / 镜头 / 动作记忆

- `docs/storyboard-methodology.md`
- `docs/scene-storyboard-formulas.md`
- `docs/camera-shot-methodology.md`
- `docs/shot-language-library.md`
- `docs/action-combat-design-standard.md`
- `docs/action-speed-design-standard.md`
- `docs/action-case-opposition-force-camera.md`
- `docs/staging-impact-audiovisual-methodology.md`

### 3. 提示词 / 视频 / 生图记忆

- `docs/prompt-standards.md`
- `docs/long-prompt-detail-gate.md`
- `docs/dual-format-prompt-methodology.md`
- `docs/seedance-prompt-engineering.md`
- `docs/jimeng-anti-collapse-core.md`
- `docs/gpt-image-prompt-methodology.md`
- `docs/gpt-image-director-storyboard-methodology.md`
- `docs/storyboard-video-model-adaptation-standard.md`

### 4. 子风格记忆

- `docs/hzw-master-style-system.md`
- `skills/hzw-master-style-skill.md`
- `templates/_shared/hzw-master-style-template.md`

### 5. Agent / Skill 协作记忆

- `agents/producer/agent.md`
- `agents/writer/agent.md`
- `agents/director/agent.md`
- `agents/storyboard-artist/agent.md`
- `agents/camera-director/agent.md`
- `agents/librarian/agent.md`
- `agents/studio/agent.md`
- `agents/reviewer/agent.md`
- `skills/README.md`
- 各专项 skill 文件

---

## 六、D12-Sora2 / D15-Seedance2 专业导演故事板图闭环记录

用户要求基于 `gpt-image-2` 图生图建立专业导演故事板图体系，使故事板图成为视频生成前主交付物，替代默认提示词交付；提示词能力保留为内部引擎和模型适配说明，不默认输出。

### 核心定义

```text
D12-Sora2 = 面向 Sora2 12s 单段上限的导演故事板图规格
D15-Seedance2 = 面向 Seedance2 15s 单段上限的导演故事板图规格
```

### 视频模型适配

- Sora2：`一张 D12-Sora2 导演故事板图 + 简短动态风格叙事提示词`。
- Seedance2-Stable：限制为 `4图+1视频`，优先级为故事板图 > 关键角色图 > 场景图 > 道具图。
- Seedance2-Extended：限制为 `9图+1视频+1音频`，同样遵守参考图优先级，并标注每个素材职责。

### 已落盘文件

- `docs/gpt-image-director-storyboard-methodology.md`
- `docs/director-storyboard-deliverable-standard.md`
- `docs/storyboard-continuity-standard.md`
- `docs/storyboard-video-model-adaptation-standard.md`
- `skills/director-storyboard-image-skill.md`
- `templates/_shared/director-storyboard/`
- `agents/director/agent.md`
- `agents/storyboard-artist/agent.md`
- `agents/studio/agent.md`
- `agents/reviewer/agent.md`
- `agents/librarian/agent.md`
- `docs/workflow.md`
- `docs/phase-gate-checklist.md`
- `docs/agent-protocol.md`
- `docs/pipeline-sync-log.md`

### 闭环结论

该体系属于 L3 级工作流变更，已同步方法论、规范、Skill、模板、Agent 职责、Workflow、Phase Gate、Agent Protocol、项目记忆和 Pipeline Sync。后续涉及导演故事板图、Sora2、Seedance2 视频生成前交付物时，必须自动加载上述文件链路。

---

## 七、瞬移影杀 / 残影瞬杀的闭环记录

用户提供的古装武侠顶级 CG“影分身瞬移影杀”提示词，已被吸收为动作打戏专项方法论。

### 核心公式

```text
瞬移影杀 = 空间锚点 + 消失点 + 再出现点 + 目标切换 + 残影层级 + 命中清晰帧 + 结果倒地 + 残影收束
```

### 标准节奏链

```text
围攻建立 → 主体骤静 → 眼神触发 → 瞬移爆发 → 命中慢半拍 → 目标倒飞 / 倒地 → 主体消失 → 甩镜找新目标 → 再出现 → 连续瞬杀 → 残影回收 → 收势留白
```

### 已落盘文件

- `docs/action-speed-design-standard.md`
- `docs/action-combat-design-standard.md`
- `docs/action-case-opposition-force-camera.md`
- `skills/seedance-action-skill.md`
- `skills/storyboard-artist-skill.md`
- `skills/storyboard-generator-skill.md`
- `skills/shot-design-skill.md`
- `skills/quality-control-skill.md`
- `docs/phase-gate-checklist.md`
- `docs/workflow.md`
- `docs/pipeline-sync-log.md`

### 闭环结论

该能力已完成方法论层、Skill 层、Workflow 层、Phase Gate 层、QA 层、Pipeline Sync 层、持久记忆层的闭环。后续若某个镜头涉及瞬移 / 影分身 / 闪现 / 残影瞬杀，必须自动加载上述规则。

---

## 八、记忆链条硬门禁

以下情况必须打回，不允许视为闭环完成：

- 方法论只写在聊天里，没有项目文件。
- 只写入 `docs/`，没有同步到相关 `skills/`。
- 改了生成规则，但没有同步 `workflow.md` 和 `phase-gate-checklist.md`。
- 改了 Agent 职责，但没有同步 `agents/*/agent.md`。
- 改了输出格式，但没有同步 `templates/`。
- 改了项目产出物状态，但没有同步项目内状态文件或索引。
- 完成了方法论吸收，但没有登记 `pipeline-sync-log.md`。
- 只创建外部持久记忆，没有在项目内建立文件化记忆。

---

## 九、工具无关迁移与接手协议

本项目的记忆系统必须保证：即使更换 AI 工具、IDE、Agent 框架或执行环境，只要读取项目文件，也能恢复同一套高质量工作流。

### 1. 新工具接手时的强制读取顺序

任何新工具 / 新助手 / 新 Agent 接手项目时，必须按以下顺序读取文件，禁止只读最近打开文件：

```text
1. README.md
2. docs/project-memory-system.md
3. docs/workflow.md
4. docs/agent-protocol.md
5. docs/phase-gate-checklist.md
6. docs/pipeline-sync-protocol.md
7. docs/pipeline-sync-log.md 最近 10 条
8. docs/workspace-status.md
9. docs/master-methodology-toolkit.md
10. 当前任务相关 docs 方法论文档
11. 当前任务相关 skills/*.md
12. 当前任务相关 agents/*/agent.md
13. 当前项目 projects/*/project.json、资产索引、分镜、提示词、QA 文件
```

### 2. 新工具接手后的第一轮自检

接手后必须先回答以下问题，才能开始产出：

- 当前任务属于哪个 Phase？
- 当前任务影响哪些产出物？
- 当前任务需要加载哪些方法论文档？
- 当前任务涉及哪些 Agent 与 Skill？
- 当前任务是否改变工作流、门禁、模板或 Agent 职责？
- 若改变，Pipeline Sync 等级是 L1、L2 还是 L3？
- 是否需要更新 `docs/project-memory-system.md` 或 `docs/workspace-status.md`？
- 是否存在未签收 L3 记录？
- 是否已有项目真实源文件可引用？

### 3. 工具无关执行底线

不论使用什么工具，必须遵守：

- 不以模型记忆替代项目文件。
- 不以聊天总结替代 `docs/`、`skills/`、`agents/`、`templates/`、`projects/` 文件。
- 不在未读取任务相关方法论时直接生成提示词、分镜、资产或视频稿。
- 不绕过 Phase Gate。
- 不绕过 Pipeline Sync。
- 不创建无法追溯来源的 `@Image`、资产名、角色名或提示词版本。
- 不把简版投喂稿当长版母稿。
- 不让平台派生稿脱离同一长版母稿。

### 4. 智能视界 Runtime 读取与恢复协议

智能视界是本项目工业化流程的产品化 Runtime。它不绑定某一个 GPT 模型，而是在能力包 Runtime 约束下调用 AI / 大模型完成任务规划、结构化生成和局部修复。

智能视界打开工程时，必须按以下顺序恢复：

```text
打开工程目录
→ 读取 smart-vision/outputs/.smart-vision/project-state.json
→ 读取 smart-vision/outputs/.smart-vision/recovery-checkpoint.json
→ 读取 smart-vision/outputs/.smart-vision/handoff-report.md
→ 读取 smart-vision/outputs/.smart-vision/capability-lock.json（若存在）
→ 校验能力包 source hash 与 compiled runtime hash（若存在）
→ 读取 artifact-registry / workflow-registry / review-ledger / continuity-ledger / release-registry（若存在）
→ 恢复当前 Phase、活动集数、活动故事板、下一步任务和阻塞点
→ 扫描索引缺失或路径不一致项
→ 更新 recovery-checkpoint.json 与 handoff-report.md
```

2026-05-08 换机交接补充：智能视界当前处于平台 Runtime 功能开发期，已完成 Workflow / Artifact / Review / Diagnostics / Repair / Release Registry 代码链路与 Release 面板；换机后应先读取 `smart-vision/outputs/.smart-vision/handoff-report.md`，再继续开发发布前强门禁、Release 单项修复、API 端到端实测和 Runner→Release 自动推进。

客户端记忆与工程记忆边界：

- 客户端记忆只保存最近工程、UI 布局、筛选条件、临时会话、活动任务指针和未同步提醒。
- 工程记忆保存项目 Phase、集数进度、故事板状态、workflow 状态、产物版本、审核结论、连续性账本、能力包 hash 和恢复检查点。
- 若客户端状态与工程记忆冲突，以工程目录内 `.smart-vision/` 为准。
- 工程记忆中的路径必须优先使用相对路径，保证工程移动到另一台电脑后仍可恢复。
- 若索引缺失但文件存在，恢复器必须扫描目录重建索引，并将不确定项标记为 `needs_review`，不得直接判定工程损坏。
- 工程记忆不得保存完整 API Key，只能保存模型 provider、模型名和配置引用。

---

## 十、文件化记忆最小完备包

为了保证项目可迁移、可交接、可恢复，以下文件构成“最小完备记忆包”。缺任一类，都不能视为完整闭环。

### 1. 工作流包

- `docs/project-memory-system.md`
- `docs/workflow.md`
- `docs/agent-protocol.md`
- `docs/phase-gate-checklist.md`
- `docs/pipeline-sync-protocol.md`
- `docs/pipeline-sync-log.md`
- `docs/workspace-status.md`

### 2. 方法论包

- `docs/master-methodology-toolkit.md`
- `docs/prompt-standards.md`
- `docs/long-prompt-detail-gate.md`
- `docs/storyboard-methodology.md`
- `docs/scene-storyboard-formulas.md`
- `docs/camera-shot-methodology.md`
- `docs/action-combat-design-standard.md`
- `docs/action-speed-design-standard.md`
- `docs/action-case-opposition-force-camera.md`
- `docs/staging-impact-audiovisual-methodology.md`
- `docs/jimeng-anti-collapse-core.md`
- `docs/gpt-image-prompt-methodology.md`
- `docs/hzw-master-style-system.md`

### 3. 执行包

- `skills/README.md`
- 当前任务相关 `skills/*.md`
- 当前任务相关 `agents/*/agent.md`
- `templates/_shared/prompt-output/`
- `templates/_project-template/`
- `templates/_manga-template/`

### 4. 项目产出包

每个项目必须至少具备：

```text
project.json
01-story/         剧本、大纲、分话规划
02-director/      导演讲戏、调度、风格方向
03-assets/        角色卡、场景卡、道具卡、资产索引
04-storyboard/    分镜表、镜头组、导演故事板图、连续性卡、资产引用矩阵、参考图职责矩阵、视频模型适配说明
05-prompts/       下游配套生成说明、平台投喂说明和实验记录（不作为中游主交付）
06-generated/     生成素材或素材索引
07-edit/          剪辑说明
08-qa/            QA 审核、连续性检查、故事板/生成结果审核
09-publish/       发布物料、发布复盘
```

若项目由智能视界管理，还必须具备：

```text
.smart-vision/
  project-state.json
  progress-ledger.json
  continuity-ledger.json
  artifact-registry.json
  workflow-registry.json
  review-ledger.json
  capability-lock.json
  recovery-checkpoint.json
  handoff-report.md
```

上述 `.smart-vision/` 文件是客户端退出、会话结束、更换客户端或工程目录迁移后的最高恢复依据。

---

## 十、记忆条目写入标准

任何长期记忆写入项目文件时，必须尽量满足以下字段，保证信息紧密、逻辑严谨、可执行。

```yaml
记忆标题: 一句话说明该规则或结论
来源: 用户输入 / 项目复盘 / 失败案例 / 外部资料 / 生成结果
归属层级: 母版方法论 / 子风格 / 分镜 / 镜头 / 动作 / 生图 / 视频 / 声音 / 项目设定 / 工作流
核心结论: 可复用判断
执行规则: 以后遇到什么情况必须怎么做
影响文件: 需要同步的 docs / skills / agents / templates / projects 文件
影响阶段: Phase 1 / 2 / 3 / 4 / 5 / 6 / publish
影响角色: Producer / Writer / Director / Storyboard Artist / Camera Director / Librarian / Studio / Reviewer
门禁条件: 什么情况通过，什么情况打回
追溯关系: 上游来自哪里，下游影响哪里
Pipeline Sync 等级: L1 / L2 / L3
签收状态: 未签收 / 已签收
```

### 写入质量要求

- 必须写成规则，而不是散文感总结。
- 必须能指导下一次实际生产。
- 必须能被别的工具读懂并执行。
- 必须说明适用范围和不适用范围。
- 必须说明与现有方法论的继承关系。
- 必须说明缺失时如何打回。

---

## 十一、产出物追溯矩阵

项目中的每个关键产出物都必须能追溯到上游方法论和下游 QA。

| 产出物 | 上游必须读取 | 下游必须检查 |
|---|---|---|
| 剧本 / 分话 | `shortdrama-script-standard.md`、编剧类 skills | 剧本审核、人物关系、爽点、节奏 |
| 导演讲戏 | 剧本、`master-methodology-toolkit.md`、风格系统 | 是否能被分镜拆解 |
| 角色卡 / 场景卡 / 道具卡 | 美术与资产 skills、HZW 或项目风格 | 资产索引、@引用、版本一致性 |
| 分镜表 | `storyboard-methodology.md`、`scene-storyboard-formulas.md`、`camera-shot-methodology.md` | 轴线、景别、镜头任务、结果镜头 |
| 动作分镜 | `action-*`、`staging-impact-audiovisual-methodology.md` | 站位、受力、速度链、命中清晰帧、结果兑现 |
| 故事板生产包 | `storyboard-methodology.md`、`director-storyboard-deliverable-standard.md`、`storyboard-continuity-standard.md`、`storyboard-video-model-adaptation-standard.md` | Panel 时长、连续性卡、资产引用矩阵、参考图职责、模型适配说明 |
| 配套生成说明 | 故事板生产包、`prompt-standards.md`、目标模型专项 docs | 是否忠实继承故事板、资产图、参考图职责、声音与负面风险 |
| 生图提示词 | `gpt-image-prompt-methodology.md`、美术资产规则 | 产品类型、结构约束、文字可读性、一致性 |
| 生成素材 | 资产索引、故事板生产包、模型适配说明 | 角色一致性、镜头兑现、动作结果、画质 |
| 剪辑 / 发布 | 分镜、生成素材、声音后期规范 | 节奏、连贯、声音、字幕、安全区、复盘 |

---

## 十二、状态快照与交接包规范

### 1. 每次阶段推进后必须更新

- `docs/workspace-status.md`：工作区级状态。
- 项目内状态文件 / 资产索引 / QA 文件：项目级状态。
- `docs/pipeline-sync-log.md`：方法论或流程变更状态。
- 必要时 `.workbuddy/memory/MEMORY.md`：本地助手索引。

### 2. 换工具前必须形成交接包

若要切换工具或让新 Agent 接手，应优先准备：

```text
1. 当前任务目标
2. 当前 Phase
3. 已完成产出物
4. 未完成产出物
5. 当前阻塞点
6. 必读文件清单
7. 最近 Pipeline Sync 记录
8. 当前项目资产索引
9. 当前分镜 / 提示词 / QA 文件
10. 不可违反的门禁规则
```

### 3. 新工具不得自行猜测项目状态

若状态文件与实际文件冲突，必须以真实文件为准，并更新状态文件；不得根据聊天印象或模型记忆直接覆盖项目文件。

---

## 十三、当前结论

截至 2026-04-30，本项目已形成以下完整逻辑：

```text
母版方法论
→ 子风格工具集
→ Workflow / Phase Gate
→ Agent / Skill
→ Templates
→ Project 产出物
→ QA / Pipeline Sync Log
→ 文件化记忆系统
→ 持久记忆辅助索引
```

后续所有新资料、新规则、新提示词案例、新项目经验，都必须沿这条链路沉淀，不能只保存在对话中。
