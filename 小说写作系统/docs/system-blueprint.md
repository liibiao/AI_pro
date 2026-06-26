# 小说写作系统 — 建设蓝图 v1.0

> 对标漫剧创作库的工业化架构，为网文/短篇/长篇创作建立完整的操作系统。
> 编制日期：2026-04-15

---

## 一、系统定位

漫剧创作库解决的是"从剧本到视频"的工业化流水线。
小说写作系统解决的是"从选题到成稿"的工业化流水线。

核心差异：
- 漫剧是**多工种协作**（编剧→导演→美术→分镜→生成→剪辑→质检）
- 小说是**单人深度创作**（选题→设定→结构→正文→改稿→审校→包装）

因此，小说系统的 Agent 不需要像漫剧那样分 16 个工种，而是围绕**写作深度**来分工：谁负责想清楚、谁负责写出来、谁负责改好、谁负责把关。

---

## 二、对标漫剧创作库的架构映射

| 漫剧创作库模块 | 小说写作系统对应 | 说明 |
|---------------|-----------------|------|
| `agents/` (21个工种) | `agents/` (8个角色) | 精简为写作核心角色 |
| `skills/` (31个技能) | `skills/` (16个技能) | 按写作能力域划分 |
| `docs/` (65个方法论) | `docs/` (25+个方法论) | 三大写作引擎 + 平台研究 + 流程规范 |
| `templates/` (项目模板) | `templates/` (短篇/长篇/研究) | 保持一致 |
| `projects/` (实际项目) | `projects/` (实际项目) | 保持一致 |
| `tools/` (12个脚本) | `tools/` (预留) | 后续加字数统计、节奏分析等 |
| `research/` (无) | `research/` (平台研究中台) | 小说系统独有 |

---

## 三、项目生命周期（7 个阶段）

```
Phase 1: POSITIONING（定位与立项）
Phase 2: DESIGN（设定与结构）
Phase 3: DRAFT（正文生产）
Phase 4: EDIT（编辑改稿）
Phase 5: REVIEW（审校终审）
Phase 6: PACKAGE（包装发布）
Phase 7: RETRO（复盘沉淀）
```

对比漫剧的 7 阶段：
| 漫剧阶段 | 小说阶段 | 核心差异 |
|---------|---------|---------|
| STORY | POSITIONING + DESIGN | 小说的"定位"比漫剧更重，需要独立阶段 |
| DIRECTOR | — | 小说无导演阶段 |
| ASSETS | — | 小说无视觉资产阶段 |
| STORYBOARD | — | 小说无分镜阶段 |
| GENERATION | DRAFT | 小说的"生成"就是写正文 |
| EDIT | EDIT + REVIEW | 小说改稿和审校需要更精细 |
| QA → PUBLISH | PACKAGE + RETRO | 小说的包装（标题/简介/标签）是独立工种 |

---

## 四、Agent 体系（8 个核心角色）

| Agent | 职责 | 对标漫剧角色 | 调用 Skill |
|-------|------|-------------|-----------|
| **Producer** | 立项调度、门禁放行、排期、复盘 | Producer | `phase-gate-skill` |
| **Market-Researcher** | 平台研究、榜单分析、精品拆解、选题评分 | — (小说独有) | `market-research-skill`、`topic-scoring-skill` |
| **Story-Architect** | 故事核、结构骨架、大纲、章节规划、钩子布局 | Writer (故事层) | `outline-design-skill`、`hook-design-skill`、`structure-pattern-skill` |
| **Character-Director** | 角色系统、关系网、成长弧线、人设一致性 | Writer (人物层) | `character-arc-skill`、`character-voice-skill` |
| **Draft-Writer** | 场景草稿、对话、动作、信息推进、正文生产 | Writer (执行层) | `scene-writing-skill`、`dialogue-skill`、`description-skill`、`pov-skill` |
| **Editor** | 改稿、节奏收紧、文风统一、开头/结尾打磨 | Reviewer (改稿层) | `line-edit-skill`、`rhythm-tuning-skill` |
| **Reviewer** | 逻辑审校、连续性检查、设定核验、终审 | Reviewer (审校层) | `continuity-check-skill`、`quality-control-skill` |
| **Packager** | 标题、简介、标签、封面文案、平台适配 | Publisher | `title-blurb-skill`、`platform-adapt-skill` |

---

## 五、Skill 体系（16 个可复用技能）

### A. 立项与研究类
| Skill | 用途 | 状态 |
|-------|------|------|
| `market-research-skill` | 平台研究、榜单抓取、趋势分析 | **待建** |
| `topic-scoring-skill` | 选题评分、风险评估、平台匹配 | **待建** |

### B. 结构与设计类
| Skill | 用途 | 状态 |
|-------|------|------|
| `outline-design-skill` | 故事骨架、阶段推进、章节规划 | 占位→**待升级** |
| `hook-design-skill` | 开篇钩子、章节钩子、反转点、付费卡点 | 占位→**待升级** |
| `structure-pattern-skill` | 结构模式库（三幕/五幕/螺旋/多线） | **待建** |
| `character-arc-skill` | 角色弧线、压制链、配角功能 | 占位→**待升级** |
| `character-voice-skill` | 角色语言风格、台词个性化、口头禅 | **待建** |

### C. 正文生产类
| Skill | 用途 | 状态 |
|-------|------|------|
| `scene-writing-skill` | 场景构建、动作/对话/信息推进 | 占位→**待升级** |
| `dialogue-skill` | 对话写作、潜台词、冲突对话、信息对话 | **待建** |
| `description-skill` | 环境描写、动作描写、心理描写、五感写作 | **待建** |
| `pov-skill` | 视角控制、叙述距离、信息管控 | **待建** |

### D. 编辑与审校类
| Skill | 用途 | 状态 |
|-------|------|------|
| `line-edit-skill` | 句级打磨、冗余删除、措辞升级 | 占位→**待升级** |
| `rhythm-tuning-skill` | 章节节奏调整、段落密度、快慢切换 | **待建** |
| `continuity-check-skill` | 逻辑/时间线/设定一致性检查 | 占位→**待升级** |
| `quality-control-skill` | 门禁自查、评分、审校报告 | 占位→**待升级** |

### E. 包装与发布类
| Skill | 用途 | 状态 |
|-------|------|------|
| `title-blurb-skill` | 标题生成、简介写作、标签组合 | **待建** |
| `platform-adapt-skill` | 平台规则适配、字数调整、风格微调 | **待建** |

---

## 六、Docs 方法论体系（三大写作引擎 + 流程规范 + 平台研究）

对标漫剧创作库的"武戏引擎/文戏引擎/视听引擎"，小说系统建立三大写作引擎：

### 引擎 A：叙事引擎（结构与节奏）
| 文档 | 用途 | 状态 |
|------|------|------|
| `premise-design-standard.md` | 故事核设计规范 | ✅ 已有 |
| `chapter-rhythm-standard.md` | 章节节奏规范 | ✅ 已有 |
| `structure-pattern-library.md` | 结构模式库（三幕/五幕/螺旋/多线/碎片） | **待建** |
| `hook-pattern-library.md` | 钩子模式库（开篇/章尾/反转/悬念/付费卡点） | **待建** |
| `tension-escalation-standard.md` | 张力升级规范（压制→爆发→再压制循环） | **待建** |
| `pacing-density-standard.md` | 节奏密度规范（快节奏/慢节奏/混合节奏的字数与段落标准） | **待建** |

### 引擎 B：角色引擎（人物与关系）
| 文档 | 用途 | 状态 |
|------|------|------|
| `character-design-standard.md` | 角色设计规范（欲望/缺口/弧线/标签） | **待建** |
| `character-voice-standard.md` | 角色语言规范（台词风格/口头禅/语气词） | **待建** |
| `relationship-dynamics-standard.md` | 人物关系动力学（对立/同盟/暗线/反转关系） | **待建** |
| `archetype-library.md` | 角色原型库（男频/女频/反派/配角常见原型） | **待建** |

### 引擎 C：文笔引擎（语言与风格）
| 文档 | 用途 | 状态 |
|------|------|------|
| `rewrite-methodology.md` | 改稿方法论 | ✅ 已有 |
| `prose-style-standard.md` | 文风规范（句长/段长/修辞密度/叙述距离） | **待建** |
| `dialogue-standard.md` | 对话写作规范（潜台词/冲突对话/信息对话/独白） | **待建** |
| `description-standard.md` | 描写规范（五感/环境/动作/心理/留白） | **待建** |
| `pov-standard.md` | 视角规范（第一人称/第三人称/全知/限制/切换规则） | **待建** |
| `genre-style-library.md` | 题材风格库（玄幻/都市/悬疑/言情/末世等各题材文风参考） | **待建** |

### 流程规范
| 文档 | 用途 | 状态 |
|------|------|------|
| `workflow.md` | 总工作流 | ✅ 已有→**待升级** |
| `agent-protocol.md` | Agent 协作协议 | **待建** |
| `phase-gate-checklist.md` | 阶段门禁 | ✅ 已有 |
| `project-bootstrap.md` | 项目初始化 | ✅ 已有 |
| `naming-convention.md` | 命名规范 | **待建** |

### 平台研究
| 文档 | 用途 | 状态 |
|------|------|------|
| `platform-research-workflow.md` | 平台研究流程 | ✅ 已有 |
| `bestseller-analysis-standard.md` | 精品拆解规范 | ✅ 已有 |
| `topic-scoring-standard.md` | 选题评分标准 | ✅ 已有 |

---

## 七、模板体系

### 共享模板 `_shared/`
| 模板 | 用途 | 状态 |
|------|------|------|
| `chapter-beat-template.md` | 章节节拍模板 | ✅ 已有 |
| `review-report-template.md` | 审校报告模板 | ✅ 已有 |
| `character-bible-template.md` | 角色圣经模板 | **待建** |
| `scene-card-template.md` | 场景卡片模板 | **待建** |
| `revision-log-template.md` | 改稿日志模板 | **待建** |

### 短篇模板 `_short-novel-template/`
已有基本骨架，需补齐内部文件内容。

### 长篇模板 `_longform-template/`
仅有 README，需要完整建设。

### 研究模板 `research/`
已有 5 个模板，基本完整。

---

## 八、建设优先级（本轮执行计划）

### P0 — 立即执行（本轮）
1. ✅ 系统总规划文档（本文件）
2. 补齐 8 个 Agent 定义（从骨架升级为完整专业定义）
3. 补齐 16 个 Skill（从占位升级为完整方法论）
4. 新建核心 Docs（agent-protocol + 三大引擎首批文档）
5. 升级 workflow.md / workspace-status.md / README.md

### P1 — 下一轮
6. 完善长篇模板 `_longform-template/`
7. 补齐共享模板
8. 跑通番茄短篇样板项目验证

### P2 — 后续
9. 建立 tools/ 自动化脚本（字数统计、节奏分析、一致性检查）
10. 建立题材库与标题库
11. 建立起点/番茄双平台适配规范
