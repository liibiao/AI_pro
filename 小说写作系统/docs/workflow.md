# 小说写作系统 · 工业化工作流

> 版本：v3.5 | 对标漫剧创作库工业化流程，覆盖从选题到发布的全生命周期。
>
> v3.5 变更：P4新增黄金开篇专项流程（`golden-opening-skill`），P7包装发布细化10步流程+输入字段完整化。
>
> v3.4 变更：新增 AI-Detector（AI味检测与修正专员），P5改稿环节增加去AI味流水线，P6审校增加AI味复检。
>
> v3.2 变更：新增系统维护流水线（M1 新能力集成），由 Chief-Editor 负责执行 `skill-onboard-skill` 链路闭环检查。
>
> v3.1 变更：新增 Chief-Editor（总编辑）角色，与 Producer 形成双轨制，贯穿 P1-P8 全程质量把控。
>
> v3.0 变更：全面集成白特慢+小郎君方法论体系，补全 Skill 调用链路，新增 Style-Master 角色，新增开书清单/金手指设计/人设拨出/镜头感/快节奏杀伐等全流程支撑。

---

## 一、总流程概览

```text
P0 选题研究 → P1 立项定位 → P2 角色设定 → P3a 结构大纲 → P3b 细纲与章纲 → P4 正文生产 → P5 编辑改稿 → P6 审校终审 → P7 包装发布 → P8 复盘沉淀
    ↑                                                                                                          |
    └──────────────────────────── 复盘回流 ────────────────────────────────────────────────────────────────────┘
```

**核心原则**：每个阶段有明确的输入→输出→门禁（Phase Gate），未通过门禁不得进入下一阶段。

---

## 二、阶段详解

### P0：选题研究

| 项目 | 内容 |
|------|------|
| **负责 Agent** | Market-Researcher |
| **触发 Skill** | market-research-skill、topic-scoring-skill、book-dissection-skill |
| **输入** | 平台榜单数据、热门题材趋势、个人灵感库 |
| **输出** | `research/` 下的榜单快照、精品拆解、选题评分卡 |
| **门禁** | 选题评分 ≥ 70分（满分100），且通过 Producer 审批 |

**工作流细节**：
1. 抓取目标平台（番茄/起点/七猫）近期榜单数据
2. 精品拆解 3-5 部同类型标杆作品（结构、钩子、节奏、卖点）
3. 提取核心梗（压抑→触发→反转→爽感公式），用换壳四步法迁移（`book-dissection-skill` §3）
4. 填写选题评分卡（题材热度×个人擅长×差异化×商业潜力）
5. Producer 审批选题方向

---

### P1：立项定位

| 项目 | 内容 |
|------|------|
| **负责 Agent** | Producer + Story-Architect |
| **触发 Skill** | structure-pattern-skill、plot-loop-skill（§1 三要素锁定） |
| **输入** | P0 选题评分卡、精品拆解结论 |
| **输出** | `project.json`、`01-positioning/logline.md`、`01-positioning/market-positioning.md`、`01-positioning/quality-baseline.md` |
| **门禁** | Logline 通过"电梯测试"（30秒内说清主角+困境+独特性），市场定位明确，**Chief-Editor 质量基线审核通过** |

**工作流细节**：
1. 从模板复制项目骨架（短篇用 `_short-novel-template`，长篇用 `_longform-template`）
2. 填写 `project.json`（类型、平台、目标字数、风格定位）
3. 撰写 Logline（一句话故事核，参考 `premise-design-standard`）
4. 撰写市场定位（目标读者画像、竞品差异、核心卖点）
5. 三要素锁定：题材×金手指×主角身份，确认交汇点（`plot-loop-skill` §1）
6. **开书准备7步清单**：赛道→主角→金手指→世界观→三章→30章→行文标准（`templates/new-book-checklist.md`）
7. **文风定位**：确定节奏基速/对话风格/描写密度参数（`xiaolangjun-style-skill` §十一）
8. **Chief-Editor 建立质量基线**（`01-positioning/quality-baseline.md`）：爽点密度目标、节奏基速、人设标准、卖点承诺
9. Producer 门禁审批

---

### P2：角色设定

| 项目 | 内容 |
|------|------|
| **负责 Agent** | Character-Director |
| **触发 Skill** | character-arc-skill（§一-§七全量）、character-voice-skill |
| **输入** | Logline、市场定位、三要素 |
| **输出** | `02-characters/character-bible.md`、`02-characters/relationship-map.md`、`02-characters/arc-tracker.md` |
| **门禁** | 主角有明确的欲望/恐惧/缺陷三角，对手动机自洽，角色语言可区分，人设能通过剧情"拨出"，**Chief-Editor 质量审核通过** |

**工作流细节**：
1. 设计主角档案（欲望-恐惧-缺陷三角、弧光类型、语言指纹）
2. **核心标签+反差感设计**（`character-arc-skill` §四B）
3. **人设拨出规划**：为每个核心角色设计绝境二选一/冲突升级/代价交换/细节反差的剧情场景（§七）
4. 设计对手/镜像角色（动机自洽、与主角形成对照；反派分级：炮灰→阶段→核心→隐藏）
5. 设计配角（戏剧功能明确：镜像/催化/信息/情感锚/对比/工具）
6. **配角羁绊建立**（§四C）：规划共同经历/救命之恩/秘密共享等羁绊方式
7. 绘制角色关系图
8. 角色语言测试（遮住名字能否区分谁在说话）
9. **Chief-Editor 质量审核**：主角标签鲜明度、反派威胁感、配角阵容是否有冗余
10. Character-Director 门禁审批

---

### P3a：结构大纲（粗纲）

| 项目 | 内容 |
|------|------|
| **负责 Agent** | Story-Architect |
| **触发 Skill** | outline-design-skill（§一-§三）、hook-design-skill、structure-pattern-skill、plot-loop-skill（§二-§六全量） |
| **输入** | 角色圣经、Logline、三要素 |
| **输出** | `03-outline/story-architecture.md`、`03-outline/chapter-plan.md`、`03-outline/volume-plan.md`、`03-outline/hook-map.md`、`03-outline/tension-curve.md` |
| **门禁** | 结构完整（开篇钩子→递进加压→高潮爆发→结尾回响），每章有明确的"进→出状态变化"，三者使绊子闭环，**Chief-Editor 爽点/钩子分布审核通过** |

**工作流细节**：
1. 选择结构模式（三幕式/英雄之旅/序列八段/番茄黄金结构……）
2. 设计故事架构（幕/卷划分、转折点、高潮位置）
3. **地图与势力设计**（`plot-loop-skill` §二）：每地图=一卷，6类势力分布
4. **金手指设计**（`plot-loop-skill` §四）：
   - 三要素锁定（§1）+ 核心功能（§4.1）+ 限制设计（§4.3）
   - 三者使绊子闭环（§4.4）：世界观↔金手指↔主角互相制约
   - 开局五步法（§4.5）：困境→登场→首秀→限制→短期目标
   - **类型专项**：重生回档（§4.6）/ 杀人变强（§4.7）各有黄金30章结构
5. **剧情内在逻辑**（§六）：动机+能力+因果+世界观 4根支柱
6. 填写章节规划表（每章的进入状态→核心事件→退出状态→钩子）
7. 钩子密度检查（开篇3章钩子密度 ≥ 每章2个）
8. 节奏曲线绘制（张力值分布）
9. **修仙文专项**：如适用，检查境界/战斗/宗门/丹药法器细节（`xiuxian-genre-skill`）
10. **Chief-Editor 质量审核**：爽点分布均匀性、钩子密度达标、三者使绊子闭环自洽、卷级情绪起伏规划
11. Story-Architect 门禁审批

---

### P3b：细纲与章纲

| 项目 | 内容 |
|------|------|
| **负责 Agent** | Story-Architect |
| **触发 Skill** | outline-design-skill（§四-§六）、scene-writing-skill（§一五拍微结构）、plot-loop-skill（§六内在逻辑） |
| **输入** | P3a 全部产物（story-architecture、chapter-plan、volume-plan、hook-map、tension-curve）、角色圣经 |
| **输出** | `03-outline/detailed-outline.md`（细纲）、`03-outline/chapter-outline-chXX.md`（章纲×N） |
| **门禁** | 每份细纲通过6项自检，每份章纲通过7项自检，**Chief-Editor 确认细纲→章纲拆分合理** |

> **大纲层级**：粗纲（story-architecture）→ 细纲（detailed-outline）→ 章纲（chapter-outline）→ 场景卡（scene-card）→ 正文

**工作流细节**：
1. **编写细纲**（`outline-design-skill` §四）：
   - 情节线梳理（主线推进 + 支线 + 交汇点 + 休眠线）
   - 场景序列排列（全部场景的时间顺序 + 状态变化）
   - 信息释放计划（新释放 + 埋伏笔 + 回收位置）
   - 情绪弧线设计（起伏 + 峰值 + 低谷）
   - 角色弧线追踪（进入状态 → 关键选择 → 退出状态）
   - 爽点与钩子分布（类型 + 位置 + 强度）
2. **细纲自检**（6项：主线推进/信息量/情绪起伏/因果逻辑/角色变化/爽点间隔）
3. **拆分章纲**（`outline-design-skill` §五）：
   - 按拆分规则将细纲拆分为单章章纲（参见 `outline-design-skill` §4.3）
   - 每份章纲包含：章节元信息 + 承接衔接 + 场景拆分 + 信息管控 + 情绪节拍 + 角色状态
4. **章纲自检**（7项：POV一致/字数分配/冲突存在/章尾钩子/信息量/衔接清晰/主角动机）
5. **Chief-Editor 审核细纲质量**：情节线是否有推进、情绪是否有起伏、信息释放是否克制
6. Story-Architect 门禁审批

**长篇特别规则**：
- 短篇/中篇：P3b 一次性产出全部细纲+全部章纲
- 长篇：P3b 分批执行，每卷在正文生产前完成该卷的细纲+章纲
- 已写完的卷可根据实际执行情况回写修正章纲

---

### P4：正文生产

| 项目 | 内容 |
|------|------|
| **负责 Agent** | Draft-Writer + Style-Master（文风指导）+ Chief-Editor（质量监控） |
| **触发 Skill** | scene-writing-skill、dialogue-skill、description-skill、pov-skill、rhythm-tuning-skill、baiteman-design-skill、xiaolangjun-style-skill、xiaolongbai-style-skill、xiuxian-genre-skill、**golden-opening-skill**（第1-3章） |
| **输入** | 章节规划表、角色圣经、结构大纲、文风参数、质量基线、**章纲（chapter-outline-chXX）** |
| **输出** | `04-draft/chapters/ch001.md` … `chNNN.md`、`04-draft/chapter-index.md`、`05-edit/quality-trend.md` |
| **门禁** | 每章完成后自检通过 + **每5章 Chief-Editor 质量快检通过**（场景卡完整、对话有潜台词、描写克制、视角统一、节奏有起伏、爽点密度达标、钩子有效） |

**工作流细节**：
1. 按章纲（chapter-outline-chXX）逐章生产——章纲是写正文前的最后一步规划，Draft-Writer 拿到后应能直接开写
2. 每章按章纲中的场景拆分填写场景卡（POV、时间、地点、在场角色、核心冲突、五拍微结构）
3. **创作设计**（`baiteman-design-skill`）：先设计（定目标→设冲突→选视角）再执行
4. 正文写作遵循"展示优先于告诉"原则
5. **环境描写**用五感落地（`description-skill` §一）+ 开篇环境=人设+世界观+剧情（`xiaolongbai-style-skill`）
6. **镜头感**：关键场景用角度切换+动作拆解+感官搭配（`description-skill` §七）
7. **对话写作**：有潜台词、不超3行、拖沓诊断（`dialogue-skill` §五）
8. **节奏控制**：快写日常+慢写关键+高潮先慢后快（`rhythm-tuning-skill`）
9. **玄幻快节奏**：压→爆→爽三步（`rhythm-tuning-skill` §六，如适用）
10. **修仙文细节**：境界/功法/丹药/宗门真实感（`xiuxian-genre-skill`，如适用）
11. 每写完一章，运行章节自检清单
12. 每5章运行一次连贯性快检
13. **每5章 Chief-Editor 质量快检**：爽点密度/钩子有效性/人设立住度/节奏健康度，发现问题及时给出调整方向
14. **每卷（10-15章）Chief-Editor 卷级质量回溯**：质量趋势分析、问题诊断、下一卷调整方向
15. 更新 `chapter-index.md` 进度

**黄金开篇专项流程**（第1-3章）：
1. 第1章写作前，执行 `golden-opening-skill` §二（黄金一句设计）+ §三（前300字递进结构）
2. 第1-3章严格按 `golden-opening-skill` §四（三章架构）执行：建立→首秀→限制
3. 第1章困境三层递进设计（`golden-opening-skill` §4.2 + `plot-loop-skill` §4.5）
4. 开篇环境描写遵循"可感知+有职业+带钩子"三原则（`xiaolongbai-style-skill` §1.2）
5. 开篇信息管控：只释放与当前场景直接相关的信息（`scene-writing-skill` §五）
6. 第3章完成后，执行开篇7维度质量检测（`golden-opening-skill` §八），加权总分 ≥ 7.0 放行
7. Chief-Editor 对开篇进行专项审校（与普通章节快检独立）

**长篇特别流程**：
- 每卷（10-15章）完成后进行卷级审查
- 世界观设定实时更新 `07-worldbuilding/`
- 连贯性追踪表实时维护 `05-edit/continuity-tracker.md`
- Style-Master 每卷提供文风校准参数

---

### P5：编辑改稿 + 去AI味

| 项目 | 内容 |
|------|------|
| **负责 Agent** | Editor → AI-Detector → Chief-Editor |
| **触发 Skill** | line-edit-skill、rhythm-tuning-skill（§一-§四+§五-§六）、continuity-check-skill、plot-loop-skill（§六 内在逻辑）、**de-ai-skill**（AI味检测与修正） |
| **输入** | 初稿全文 + Chief-Editor 质量快检记录 |
| **输出** | `05-edit/revision-log.md`、`05-edit/continuity-tracker.md`、`05-edit/rewrite-plan.md`、`05-edit/ai-detect-report.md`、`05-edit/de-ai-revision-log.md`、修改后的章节文件 |
| **门禁** | 所有 P0 级问题已修复，P1 级问题已有方案，**AI味综合分 ≥ 7.0**，**Chief-Editor 确认改稿方向正确** |

**工作流细节**：
1. **第一轮：结构改稿** — 检查情节逻辑、节奏曲线、弧光完整性；剧情内在逻辑4根支柱检验（`plot-loop-skill` §六）
2. **第二轮：场景改稿** — 检查每个场景的进出状态变化、冲突强度；人设是否通过剧情"拨出"（`character-arc-skill` §七）
3. **第三轮：文笔改稿** — 检查对话质量（拖沓诊断 `dialogue-skill` §五）、描写密度（镜头感 `description-skill` §七）、视角一致性、节奏调优（`rhythm-tuning-skill` 全量）
4. **第四轮：连贯性改稿** — 运行 continuity-check-skill 全量扫描
5. 每轮改稿记录到 `revision-log.md`
6. **AI-Detector 接手去AI味**（`de-ai-skill`）：
   - 执行8维度AI味检测，输出检测报告
   - 按优先级修正：P0杀连接词+破均匀 → P1情感生理化+碎片过渡 → P2对话个性+感官密度 → P3结尾+标点
   - 修正后复检，确认综合分 ≥ 7.0
7. **Chief-Editor 改稿方向审核**：确认改稿是否解决了 Chief-Editor 质量快检中指出的问题，去AI味是否影响文学质量

---

### P6：审校终审

| 项目 | 内容 |
|------|------|
| **负责 Agent** | Reviewer |
| **触发 Skill** | quality-control-skill、phase-gate-skill |
| **输入** | 改稿后全文 |
| **输出** | `06-review/final-qa.md` |
| **门禁** | 综合评分 ≥ 3.5/5，无 P0 级问题，连贯性检查全部通过，**Chief-Editor 无质量否决** |

**工作流细节**：
1. 五维度评审（叙事结构、角色塑造、文笔质量、连贯性、商业性）
2. 逐项打分并记录问题
3. 输出终审结论（通过/有条件通过/不通过）
4. **Chief-Editor 质量否决权**：基于全书质量趋势，即使流程通过，质量不达标可要求返工
5. 不通过则回流至 P5 改稿

---

### P7：包装发布

| 项目 | 内容 |
|------|------|
| **负责 Agent** | Packager |
| **触发 Skill** | title-blurb-skill、platform-adapt-skill |
| **输入** | 终审通过的全文 + story-core.md + characters.md + 正文前3章 + Market-Researcher 平台规律 |
| **输出** | `08-publish/title-options.md`、`08-publish/blurb.md`、`08-publish/tag-strategy.md`、平台适配版本 |
| **门禁** | 书名评分 ≥ 12/15（`title-blurb-skill` §1.6），简介通过"折叠线检查+3秒钩子测试"（`title-blurb-skill` §2.8），**Chief-Editor 确认卖点传达准确** |

**工作流细节**：
1. 从上游产物提取素材（故事核/金手指/主角人设/正文前3章最抓人的情节）
2. 按 `title-blurb-skill` §1.3 选择适合的书名模式（长篇12种/短篇4种）
3. 设计 5 个候选书名，按 §1.6 评分表打分（满分15分，≥12分放行）
4. 按平台选择简介模板（番茄80-150字/起点150-300字/短篇60-100字）
5. 撰写 3 版简介（悬念型/卖点型/情绪型），执行折叠线检查（前60-80字必须有钩子）
6. 设计标签组合（核心1-2 + 情绪1-2 + 流量1-2）
7. 跨平台适配（如需）：番茄版/起点版/七猫版分别输出
8. **Chief-Editor 卖点校验**：书名/简介是否准确传达核心卖点，是否会误导读者预期
9. 3秒钩子测试 + 竞品并排对比
10. 最终定稿

---

### P8：复盘沉淀

| 项目 | 内容 |
|------|------|
| **负责 Agent** | Producer + Chief-Editor |
| **触发 Skill** | 无（复盘为总结性工作） |
| **输入** | 全流程产物、发布数据（如有）、团队反馈、全书质量趋势档案 |
| **输出** | `09-retro/release-retro.md`、`09-retro/what-to-reuse.md`、`09-retro/closure-audit.md`（样板项目）、`05-edit/quality-trend.md`（完结版） |
| **门禁** | 复盘文档完成，可复用资产已回写到 `docs/`、`skills/`、`templates/`，**Chief-Editor 质量趋势汇总完成** |

**工作流细节**：
1. 回顾全流程，记录顺畅点与卡点
2. 提取可复用的结构模式、角色模板、钩子设计
3. 将经验回写到系统文档
4. 更新选题池（成功题材加权，失败题材降权）
5. **Chief-Editor 全书质量趋势汇总**：各阶段/卷级质量变化轨迹、Skill 实战有效性评估、系统改进建议
6. 归档项目

**样板项目闭环验收方法**：
- 对于用于验证系统流程的样板项目，需额外产出 `closure-audit.md`
- 验收维度：结构闭环（文档-模板-项目目录一致性）、执行闭环（每阶段有落盘位置与验收载体）、内容闭环（真实内容已补齐）
- 发现的缺口需立即回写到 `docs/workspace-status.md` 和对应模板
- 样板项目的复盘重点不是作品成绩，而是系统流程是否顺畅

---

## 三、跨阶段规则

### 3.1 回流机制

| 发现阶段 | 问题类型 | 回流目标 |
|----------|----------|----------|
| P4 正文 | 结构性问题（情节不通） | 回流 P3a 结构大纲 |
| P4 正文 | 角色行为不自洽 | 回流 P2 角色 |
| P4 正文 | 场景节奏/信息释放有问题 | 回流 P3b 细纲/章纲 |
| P5 改稿 | 节奏严重失衡 | 回流 P3a 结构大纲 |
| P6 审校 | 连贯性硬伤 | 回流 P5 改稿 |
| P6 审校 | 商业性不足 | 回流 P1 定位 |

### 3.2 文档即真实源

- 所有决策必须落盘到对应文档
- 口头讨论不算完成
- 文档版本通过 Git 追踪

### 3.3 并行规则

- P0 和 P1 可以部分并行（边研究边构思）
- P2 和 P3 可以迭代并行（角色设定和结构互相影响）
- P4 内部各章可以并行生产（前提是大纲稳定）
- P5 和 P6 严格串行（先改完再审）

---

## 四、Agent 协作矩阵

```text
Producer ──────────────────────────────────────────────────────────
    │                                                              │
    ├─→ Market-Researcher (P0)                                     │
    │                                                              │
    ├─→ Story-Architect (P1, P3a粗纲, P3b细纲章纲) ←→ Character-Director (P2)     │
    │                                                              │
    ├─→ Style-Master (P1文风定调, P4卷级校准)                       │
    │                                                              │
    ├─→ Draft-Writer (P4)                                          │
    │                                                              │
    ├─→ Editor (P5) → AI-Detector (P5去AI味)                       │
    │                                                              │
    ├─→ AI-Detector (P6 AI味复检) → Reviewer (P6)                  │
    │                                                              │
    ├─→ Packager (P7)                                              │
    │                                                              │
    │   Chief-Editor ──────────────────────────────────────────     │
    │       │                                                      │
    │       ├─ P1 质量基线 → P2 人设审核 → P3a 结构审核            │
    │       ├─ P3b 细纲→章纲拆分审核                               │
    │       ├─ P4 每5章质量快检 + 每卷质量回溯                     │
    │       ├─ P5 改稿方向审核 → P6 质量否决权                      │
    │       ├─ P7 卖点校验 → P8 全书质量趋势汇总                   │
    │       └─ 跨 Agent 创意冲突裁决 + 中途策略调整                 │
    │                                                              │
    └─→ Producer (P8 复盘) ────────────────────────────────────────┘
```

---

## 五、快速参考：每阶段一句话

| 阶段 | 核心问题 | 通过标准 |
|------|----------|----------|
| P0 | 写什么题材？ | 选题评分 ≥ 70 |
| P1 | 故事核是什么？ | Logline 通过电梯测试 |
| P2 | 谁在经历这个故事？ | 角色三角完整+语言可区分 |
| P3a | 故事怎么讲？（骨架层） | 结构完整+钩子密度达标 |
| P3b | 每章具体怎么写？（执行层） | 细纲6项+章纲7项自检通过 |
| P4 | 写出来 | 每章自检通过 |
| P5 | 改好它 | P0问题清零 |
| P6 | 能发吗？ | 综合 ≥ 3.5/5 |
| P7 | 怎么卖？ | 书名+简介测试通过 |
| P8 | 学到什么？ | 复盘文档完成 |

---

## 六、系统维护流水线

> 以下为系统级维护流程，独立于小说创作流水线（P0-P8），由 Chief-Editor 负责执行。

### M1：新能力集成

| 项目 | 内容 |
|------|------|
| **负责 Agent** | Chief-Editor |
| **触发 Skill** | `skill-onboard-skill` |
| **触发条件** | 新建/重大更新 Skill、方法论、规范、模板时 |
| **检查范围** | Agent映射 → 阶段触发 → 交叉引用 → 状态追踪 |
| **成本策略** | Header-only 扫描 + 定向 Grep，不读全文 |

**执行流程**：
1. 提取新 Skill 的集成元数据（触发阶段/功能引擎/关联Skill/归属Agent）
2. Grep `agent-protocol.md` 检查 Agent 映射
3. Grep `workflow.md` 检查阶段触发
4. 定向 Grep 关联 Skill 文件检查交叉引用
5. 更新 `workspace-status.md` 状态追踪
6. 输出集成检查报告，修复所有 ❌ 项

> 详见 `skill-onboard-skill` 完整方法论。
