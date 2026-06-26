# Agent Protocol — Agent 协作协议

> 版本：v3.5 | 与 workflow.md v3.5 同步

## 一、核心角色分工

| Agent | 职责 | 调用 Skill |
|-------|------|-----------|
| **Producer** | 流程调度、门禁放行、排期、复盘 | `phase-gate-skill`、`quality-control-skill` |
| **Chief-Editor** | 全局质量把控、内容方向指导、跨Agent协调、策略调整、卷级回溯、**新能力集成验证** | `quality-control-skill`、`plot-loop-skill`、`character-arc-skill`、`hook-design-skill`、`rhythm-tuning-skill`、`structure-pattern-skill`、`market-research-skill`、`skill-onboard-skill` |
| **Market-Researcher** | 平台研究、榜单分析、精品拆解、选题评分 | `market-research-skill`、`topic-scoring-skill`、`book-dissection-skill` |
| **Story-Architect** | 故事核、结构骨架、大纲、金手指设计、剧情循环 | `outline-design-skill`、`hook-design-skill`、`structure-pattern-skill`、`plot-loop-skill` |
| **Character-Director** | 角色系统、关系网、弧线、人设拨出、羁绊设计 | `character-arc-skill`、`character-voice-skill` |
| **Style-Master** | 文风定调、卷级校准、创作质量指导 | `baiteman-design-skill`、`xiaolangjun-style-skill`、`xiaolongbai-style-skill`、`zhouzi-style-skill`、`xiuxian-genre-skill`、`plot-loop-skill`、`book-dissection-skill`、`rhythm-tuning-skill`、`scene-writing-skill`、`dialogue-skill`、`hook-design-skill` |
| **Draft-Writer** | 场景、对话、动作、**黄金开篇** | `scene-writing-skill`、`dialogue-skill`、`description-skill`、`pov-skill`、`rhythm-tuning-skill`、**`golden-opening-skill`** |
| **Editor** | 改稿、节奏、文风统一、逻辑审查 | `line-edit-skill`、`rhythm-tuning-skill`、`continuity-check-skill`、`plot-loop-skill`（§六内在逻辑）、`de-ai-skill` |
| **AI-Detector** | AI味检测、去AI味修正、平台检测适配 | `de-ai-skill` |
| **Reviewer** | 逻辑审校、连续性、终审 | `continuity-check-skill`、`quality-control-skill` |
| **Packager** | 标题、简介、标签、平台适配 | `title-blurb-skill`、`platform-adapt-skill` |

---

## 二、协作规则

### 1. Producer 与 Chief-Editor 双轨制
Producer 管**流程门禁**（能不能过），Chief-Editor 管**内容质量**（好不好）。所有阶段流转需 Producer 放行，但 Chief-Editor 拥有**质量否决权**——即使流程通过，质量不达标可要求返工。

### 2. Chief-Editor 全程在场
Chief-Editor 从 P1 立项开始介入，每阶段出具质量意见。不等正文写完才来审。

### 3. 产物先落文件，再汇报
每个 Agent 完成工作后，必须先生成对应文档到项目目录，再汇报结果。口头讨论不算完成。

### 4. 上下文最小化原则
每个 Agent 只读取完成当前任务所必需的文件，避免上下文过载。Chief-Editor 例外——有权读取所有阶段产物以行使全局质量把控职责。

### 5. 返工必须说明
- 退回给谁
- 退回原因
- 必改项 / 可不改项
- 修改后是否需要复审

---

## 三、阶段流转与 Agent 调度

```
Phase 1: POSITIONING
  Producer → Market-Researcher → Chief-Editor（质量基线） → Producer（门禁）

Phase 2: DESIGN
  Story-Architect + Character-Director → Chief-Editor（质量审核） → Producer（门禁）

Phase 3a: STRUCTURE (粗纲)
  Story-Architect → Chief-Editor（结构质量审核） → Producer（门禁）

Phase 3b: DETAIL (细纲+章纲)
  Story-Architect → Chief-Editor（细纲→章纲拆分审核） → Producer（门禁）

Phase 4: DRAFT
  Draft-Writer → Chief-Editor（每5章质量快检） → Producer（分批门禁，每5章一次）

Phase 5: EDIT
  Editor → AI-Detector（去AI味检测修正） → Chief-Editor（改稿方向审核） → Producer（门禁）

Phase 6: REVIEW
  AI-Detector（AI味复检） → Reviewer → Chief-Editor（质量否决权） → Producer（门禁）

Phase 7: PACKAGE
  Packager → Chief-Editor（卖点校验） → Producer（门禁）

Phase 8: RETRO
  Chief-Editor（质量趋势汇总） → Producer（复盘沉淀）
```

---

## 四、交接规范

### Market-Researcher → Story-Architect
- 选题评分卡
- 题材参考（结构规律、标题规律）
- 平台适配建议

### Story-Architect → Character-Director
- 故事骨架
- 阶段划分与关键事件
- 角色功能需求

### Story-Architect + Character-Director → Chief-Editor（P3a 质量审核）
- 故事骨架
- 角色圣经（初版）
- 大纲规划
- Chief-Editor 反馈：质量基线校准、爽点/钩子分布审核

### Story-Architect → Story-Architect（P3a→P3b）
- story-architecture.md（粗纲）
- chapter-plan.md（章节简表）
- volume-plan.md / hook-map.md / tension-curve.md

### Story-Architect → Chief-Editor（P3b 细纲审核）
- detailed-outline.md（细纲）
- chapter-outline-chXX.md（章纲×N）
- Chief-Editor 反馈：细纲→章纲拆分合理性、信息释放克制度

### Chief-Editor → Draft-Writer
- 质量基线参数
- 创作方向备忘

### Story-Architect + Character-Director → Draft-Writer
- 章节计划
- 角色圣经
- 钩子分布图

### Draft-Writer → Chief-Editor（每5章质量快检）
- 最新5章正文
- 章节索引
- Chief-Editor 反馈：爽点密度/钩子有效性/人设立住度/节奏健康度

### Draft-Writer → Editor
- 初稿章节
- 章节索引
- Chief-Editor 质量快检记录

### Editor → AI-Detector（P5 去AI味）
- 改稿后章节
- 改稿日志
- 目标平台（检测严格度适配）

### AI-Detector → Chief-Editor（P5 去AI味审核）
- 去AI味后章节
- AI味检测报告
- 去AI味修正日志
- Chief-Editor 反馈：修正是否影响文学质量

### AI-Detector → Reviewer
- 改稿后章节
- 改稿日志
- Chief-Editor 质量意见

### Reviewer → Chief-Editor（质量否决）
- 终审报告
- Chief-Editor 质量否决意见（如有）

### Reviewer → Packager
- 终审通过的版本
- 终审报告

### Chief-Editor → Packager（卖点校验）
- 质量趋势总结
- 核心卖点兑现度评估

### Market-Researcher → Packager
- 平台标题规律
- 标签策略建议

### Chief-Editor → Producer（P8 复盘）
- 全书质量趋势档案
- Skill 实战有效性评估
- 系统改进建议

---

## 五、消息类型

| 消息类型 | 用途 |
|---------|------|
| `task_request` | 下发任务 |
| `task_complete` | 完成通知 |
| `review_request` | 请求审核 |
| `revision_request` | 请求修改 |
| `gate_pass` | 门禁放行 |
| `gate_reject` | 门禁打回（回流目标：P2角色 / P3a粗纲 / P3b细纲章纲 / P5改稿） |
| `continuity_alert` | 一致性告警 |

---

## 六、快速参考：我现在该调谁？

| 你要做的事 | 调用 Agent | 它会用的 Skill |
|-----------|-----------|--------------|
| 分析平台和题材 | Market-Researcher | `market-research-skill` |
| 评估选题 | Market-Researcher | `topic-scoring-skill` |
| 拆书/模仿核心梗 | Market-Researcher | `book-dissection-skill` |
| 设计故事核和粗纲 | Story-Architect | `outline-design-skill` §一-§三、`hook-design-skill`、`plot-loop-skill` |
| 编写细纲（弧线层） | Story-Architect | `outline-design-skill` §四 |
| 编写章纲（单章蓝图） | Story-Architect | `outline-design-skill` §五、`scene-writing-skill` §一 |
| 选择结构模式 | Story-Architect | `structure-pattern-skill` |
| 设计金手指 | Story-Architect | `plot-loop-skill` §四（含重生回档/杀人变强专项） |
| 设计剧情循环/三者使绊子 | Story-Architect | `plot-loop-skill` §二-§四 |
| 设计角色系统 | Character-Director | `character-arc-skill` |
| 人设拨出/标签反差 | Character-Director | `character-arc-skill` §四B、§七 |
| 定义角色语言风格 | Character-Director | `character-voice-skill` |
| 文风定调/卷级校准 | Style-Master | `baiteman-design-skill`、`xiaolangjun-style-skill`、`xiaolongbai-style-skill`、`zhouzi-style-skill` |
| **黄金一句开篇** | **Style-Master** | **`zhouzi-style-skill` §一（第一句认知落差→300字亮冲突→800字亮看点）** |
| **小众切口+大众情绪选题** | **Market-Researcher + Chief-Editor** | **`zhouzi-style-skill` §二** |
| 修仙文细节 | Style-Master | `xiuxian-genre-skill` |
| 写章节正文 | Draft-Writer | `scene-writing-skill`、`dialogue-skill`、`description-skill`、`rhythm-tuning-skill` |
| **黄金开篇（第1-3章）** | **Draft-Writer** | **`golden-opening-skill`（黄金一句/黄金三段/三章架构/7维度检测）** |
| 确定叙述视角 | Draft-Writer | `pov-skill` |
| 改稿打磨 | Editor | `line-edit-skill`、`rhythm-tuning-skill`、`plot-loop-skill` §六 |
| **AI味检测与去AI味** | **AI-Detector** | **`de-ai-skill`（8维度检测+8步修正法）** |
| **AI味抽检** | **Chief-Editor → AI-Detector** | **`de-ai-skill` §四检测评分卡** |
| 逻辑和连续性审查 | Reviewer | `continuity-check-skill` |
| 终审放行 | Reviewer + Producer | `quality-control-skill`、`phase-gate-skill` |
| 标题和简介 | Packager | `title-blurb-skill` |
| 平台适配 | Packager | `platform-adapt-skill` |
| 阶段调度 | Producer | `phase-gate-skill` |
| **全局质量把控** | **Chief-Editor** | **`quality-control-skill`、`plot-loop-skill`、`character-arc-skill`、`hook-design-skill`、`rhythm-tuning-skill`** |
| **跨 Agent 创意冲突裁决** | **Chief-Editor** | **基于读者体验视角综合判断** |
| **中途策略调整** | **Chief-Editor + Producer** | **`market-research-skill`（数据支撑）、`structure-pattern-skill`** |
| **创作方向指导** | **Chief-Editor** | **`hook-design-skill`、`rhythm-tuning-skill`、`character-arc-skill`** |
| **卷级质量回溯** | **Chief-Editor** | **`quality-control-skill` + 全书质量趋势档案** |
