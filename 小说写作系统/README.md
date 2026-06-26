# 小说写作系统 v2.0

> 一套面向网文、番茄短篇、长篇连载的工业化小说创作操作系统。
> 对标漫剧创作库架构，覆盖从选题研究到发布复盘的全生命周期。

---

## 1. 这个系统是什么

这不是一个"写小说的资料夹"，而是一套完整的**创作操作系统**——把选题、立项、设定、结构、正文、改稿、审校、包装、复盘全部纳入规范化、可追踪、可复用的工业化流程。

**核心理念**：
- **流程即质量** — 好作品不是灵感的偶然产物，而是系统化流程的稳定输出
- **文档即真实源** — 所有决策落盘，口头讨论不算完成
- **门禁即底线** — 每个阶段有明确的通过标准，不达标不放行
- **复盘即进化** — 每个项目的经验沉淀为系统的升级

---

## 2. 系统架构

```text
小说写作系统/
├── agents/          # Agent 体系：8个专业角色，各司其职
│   ├── producer.md              # 总制片：全局调度、门禁审批
│   ├── market-researcher.md     # 市场研究员：选题、榜单、拆解
│   ├── story-architect.md       # 故事架构师：结构、大纲、节奏
│   ├── character-director.md    # 角色总监：人设、弧光、关系
│   ├── draft-writer.md          # 写手：正文生产、场景写作
│   ├── editor.md                # 编辑：改稿、润色、连贯性
│   ├── reviewer.md              # 审校官：终审、质量评分
│   └── packager.md              # 包装师：书名、简介、平台适配
│
├── skills/          # Skill 体系：18个可复用能力模块
│   ├── [叙事引擎] outline-design / hook-design / structure-pattern
│   ├── [角色引擎] character-arc / character-voice
│   ├── [文笔引擎] scene-writing / dialogue / description / pov / rhythm-tuning
│   ├── [质量引擎] line-edit / continuity-check / quality-control / phase-gate
│   └── [商业引擎] market-research / topic-scoring / title-blurb / platform-adapt
│
├── docs/            # 方法论与规范：23个核心文档
│   ├── system-blueprint.md      # 系统建设蓝图
│   ├── workflow.md              # 工业化工作流（P0-P8）
│   ├── agent-protocol.md        # Agent 协作协议
│   ├── naming-convention.md     # 命名规范
│   ├── phase-gate-checklist.md  # 门禁清单
│   ├── [叙事类] structure-pattern-library / hook-pattern-library / tension-escalation-standard
│   ├── [角色类] character-design-standard
│   ├── [文笔类] dialogue-standard / description-standard / pov-standard
│   ├── [方法类] premise-design / chapter-rhythm / rewrite-methodology
│   ├── [商业类] bestseller-analysis / topic-scoring / platform-research-workflow
│   └── project-bootstrap / workspace-status
│
├── templates/       # 模板体系：4套模板
│   ├── _shared/                 # 共享模板（角色圣经、场景卡、改稿日志等）
│   ├── _short-novel-template/   # 短篇项目模板（番茄/情感/悬疑短篇）
│   ├── _longform-template/      # 长篇项目模板（连载/签约长篇）
│   └── research/                # 研究模板（精品拆解、榜单快照等）
│
├── projects/        # 实际项目（每个项目从模板复制）
│   └── fanqie_duanpian_001/     # 样板项目
│
├── research/        # 市场研究资料库
│
└── tools/           # 预留：自动化脚本与工具
```

---

## 3. 工作流总览

```text
P0 选题研究 → P1 立项定位 → P2 角色设定 → P3 结构大纲
                                                    ↓
P8 复盘沉淀 ← P7 包装发布 ← P6 审校终审 ← P5 编辑改稿 ← P4 正文生产
```

每个阶段都有：
- **负责 Agent**：谁来做
- **触发 Skill**：用什么能力
- **输入/输出**：进什么料、出什么货
- **门禁标准**：达到什么标准才能过

详见 → `docs/workflow.md`

---

## 4. 快速启动

### 启动一个番茄短篇项目

```bash
# 1. 复制短篇模板
cp -r templates/_short-novel-template projects/my_new_short_novel

# 2. 修改 project.json
# 3. 完成 01-positioning/ 下的 logline + market-positioning
# 4. 通过 P1 门禁后，进入角色→结构→正文
```

### 启动一个长篇连载项目

```bash
# 1. 复制长篇模板
cp -r templates/_longform-template projects/my_new_longform

# 2. 修改 project.json
# 3. 完成定位→角色→结构→世界观四大块
# 4. 建立章节索引，按卷推进
```

详见 → `docs/project-bootstrap.md`

---

## 5. 推荐阅读顺序

| 序号 | 文件 | 了解什么 |
|------|------|----------|
| 1 | `docs/system-blueprint.md` | 系统全景蓝图 |
| 2 | `docs/workflow.md` | 工业化工作流（P0-P8） |
| 3 | `docs/platform-fit-standard.md` | 平台适配规范（番茄 vs 起点） |
| 4 | `docs/genre-methodology.md` | 当前优先题材池与方法论 |
| 5 | `docs/topic-pool-standard.md` | 选题池建设与分层规则 |
| 6 | `docs/agent-protocol.md` | Agent 如何协作 |
| 7 | `docs/phase-gate-checklist.md` | 每个阶段的通过标准 |
| 8 | `docs/project-bootstrap.md` | 如何启动新项目 |
| 9 | `templates/_short-novel-template/README.md` | 短篇模板使用指南 |
| 10 | `docs/workspace-status.md` | 当前系统建设进度 |

---

## 6. 四大引擎

本系统的核心能力由四大引擎驱动：

| 引擎 | 覆盖能力 | 核心 Skill |
|------|----------|-----------|
| **叙事引擎** | 结构、大纲、钩子、节奏 | outline-design / hook-design / structure-pattern |
| **角色引擎** | 人设、弧光、语言、关系 | character-arc / character-voice |
| **文笔引擎** | 场景、对话、描写、视角、节奏 | scene-writing / dialogue / description / pov / rhythm-tuning |
| **质量引擎** | 改稿、连贯性、终审、门禁 | line-edit / continuity-check / quality-control / phase-gate |

外加**商业引擎**（选题、评分、书名、平台适配）保障市场竞争力。

---

## 7. 系统工作原则

1. **不跳过立项直接写正文** — 没有故事核的正文是无根之木
2. **不跳过结构直接扩章** — 没有骨架的肉体是一摊烂泥
3. **不跳过审校直接发布** — 没有质检的产品是赌博
4. **所有阶段都要有落盘文件** — 文档是唯一真实源
5. **出现问题优先局部回流** — 不轻易全盘推翻
6. **每个项目都要复盘** — 复盘是系统进化的燃料

---

## 8. 版本记录

| 版本 | 日期 | 变更 |
|------|------|------|
| v1.0 | — | 骨架初始化：6 Agent + 8 Skill + 10 Docs |
| v2.0 | 2025-04-15 | 工业化升级：8 Agent + 18 Skill + 20 Docs + 4套完整模板 |
| v2.1 | 2025-04-15 | 接入研究中台首批公开样本：双平台榜单快照、热门题材报告、平台适配规范、题材方法论 |
| v2.2 | 2025-04-16 | 扩充至 66 个公开样本，形成双平台稳态题材池、标题模式库与选题池规范 |
