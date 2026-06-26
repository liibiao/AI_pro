# 母版通用方法论工具集 — 短剧 / 漫剧创作总架构

> 定位：本文件是所有短剧 / 漫剧项目的通用方法论母版。它不是某一种风格，也不决定具体短剧的视觉风格和走向；它只提供文戏、武打戏、动作戏、对白、分镜、镜头、光影、生图、视频、声音、后期与质检的上层基础指导思想和底层专业工具。真正决定整部短剧视觉风格、审美走向、镜头气质、光色材质和最终资产统一性的，是项目选择的子风格工具集（如 HZW大师风格）。后续每新增一套子风格工具集，都必须继承或参考本母版，再形成自己的风格方法论、规范、agent 作业原则、skill 与模板。

---

## 1. 总体架构

```text
母版通用方法论工具集
= 通用方法论文档 + 通用规范文档 + Agent 作业原则 + Skill 执行规则 + 模板与门禁

子风格工具集
= 继承母版通用方法论工具集 + 子风格审美取向 + 子风格锚点 + 子风格模板 + 子风格门禁
```

母版解决“所有剧都应该怎么专业地做”，子风格解决“这一部剧或这一类风格应该长成什么样”。

---

## 2. 母版工具集包含内容

| 模块 | 作用 | 代表文档 / Skill |
|------|------|------------------|
| 编剧与文戏 | 冲突、潜台词、对白节奏、文戏压迫、情绪递进 | `script-writer-skill.md`、`shortdrama-dialogue.md`、`docs/drama-tension-design-standard.md`、`docs/dialogue-voice-design-standard.md` |
| 武打 / 动作戏 | 强弱变化、动作链、受力反馈、速度设计、环境破坏、打击结果 | `docs/action-methodology.md`、`docs/action-combat-design-standard.md`、`docs/action-speed-design-standard.md`、`skills/seedance-action-skill.md` |
| 分镜总装 | 戏核、空间、镜头任务、节拍、平台执行、轴线与组接 | `docs/storyboard-methodology.md`、`docs/scene-storyboard-formulas.md`、`skills/storyboard-methodology-skill.md` |
| 单镜设计 | 景别、视角身份、运镜、起幅落幅、镜头结果兑现 | `docs/camera-shot-methodology.md`、`skills/shot-design-skill.md`、`agents/camera-director/agent.md` |
| 生图与资产 | 角色、场景、道具、封面、静态分镜板、Prompt-as-Code | `docs/gpt-image-prompt-methodology.md`、`docs/prompt-standards.md`、`skills/art-design-skill.md`、`skills/runninghub-image-skill.md` |
| 配套生成说明 | Seedance、即梦、图生视频、视频模型适配说明、下游投喂说明 | `docs/seedance-prompt-engineering.md`、`docs/jimeng-anti-collapse-core.md`、`skills/seedance-multimodal-skill.md` |
| 声音与后期 | 对白配音、环境音、拟音、特效音、剪辑节奏、后期质感 | `skills/dialogue-voice-director-skill.md`、`skills/foley-sound-designer-skill.md`、`docs/sound-design-montage-standard.md`、`docs/post-production-aesthetics-standard.md` |
| 质检与连续性 | 角色一致性、资产继承、台词锁定、故事板连续性、阶段门禁 | `skills/quality-control-skill.md`、`skills/continuity-check-skill.md`、`docs/phase-gate-checklist.md` |

---

## 3. 子风格工具集继承规则

新增任何子风格工具集时，必须遵守以下继承链：

```text
母版通用方法论工具集
→ 子风格核心方法论文档
→ 子风格 skill
→ 子风格模板
→ 相关 agent 作业原则
→ workflow / phase gate / pipeline sync log
```

子风格不得替代母版基础能力，只能在母版之上增加审美取向、风格锚点、镜头偏好、光色偏好、材质偏好、节奏偏好和平台执行模板。

---

## 4. 子风格建立标准流程

1. **判断风格定位**：确认子风格用于整剧、单项目、单题材，还是某类镜头 / 场景 / 资产。
2. **继承母版模块**：明确需要继承哪些母版能力，例如文戏、动作戏、分镜、镜头、生图、视频、声音、后期。
3. **提炼风格差异**：只提炼能改变画面、节奏、镜头、光色、材质或提示词结构的规则。
4. **建立子风格文档**：新增或更新 `docs/<style>-style-system.md`，写清公式、锚点、模板、禁止项。
5. **建立子风格 skill**：新增或更新 `skills/<style>-style-skill.md`，作为调用入口。
6. **建立共享模板**：新增或更新 `templates/_shared/<style>-style-template.md`，用于项目复制。
7. **回填 agent 作业原则**：必要时更新 `agents/director/agent.md`、`agents/storyboard-artist/agent.md`、`agents/studio/agent.md`、`agents/reviewer/agent.md`；除非职责边界发生重大变化，否则不新增 agent。
8. **接入流程门禁**：同步 `docs/workflow.md`、`docs/phase-gate-checklist.md`、`skills/README.md`、`docs/pipeline-sync-log.md`。

---

## 5. Agent 作业原则

| Agent | 母版职责 | 子风格职责 |
|-------|----------|------------|
| `Producer` | 判断是否需要新增 / 修改方法论、skill、agent、门禁，并执行 Pipeline Sync | 决定子风格影响等级，确认是否放行到项目生产 |
| `Writer` | 按母版完成故事、人物、文戏、对白、爽点和钩子 | 将子风格中的编剧气质转为故事节奏、台词密度和情绪底色 |
| `Director` | 按母版完成导演讲戏、美术方向、调度、镜头意图和视听策略 | 将子风格转为整剧视觉风格、导演风格、光色、材质和调度偏好 |
| `Storyboard Artist` | 按母版完成分镜五层模型、场景公式、轴线、镜头组和故事板生产包 | 将子风格锚点继承到每镜的景别、视角、运镜、读点和结果镜头 |
| `Studio` | 按母版执行生图、故事板图生成、视频、模型适配说明和实验排障 | 确保资产图片、分镜图、首尾帧、配套生成说明服从子风格母版 |
| `Reviewer` | 按母版执行连续性、台词、故事板、视频稳定性和发布前 QA | 检查子风格是否跨资产、跨镜头、跨平台一致 |

---

## 6. 当前已登记的子风格工具集

| 子风格 | 核心文档 | Skill | 模板 | 继承关系 |
|--------|----------|-------|------|----------|
| HZW大师风格 | `docs/hzw-master-style-system.md` | `skills/hzw-master-style-skill.md` | `templates/_shared/hzw-master-style-template.md` | 继承本母版的文戏、动作戏、分镜、镜头、生图、视频、声音、后期与 QA 规范，再叠加电影专业质感视觉风格总控 |

---

## 7. 新增资料吸收规则

当用户提供新资料时，先判断它属于：

- 母版通用方法论：适用于所有项目、所有风格，例如文戏、武打戏、动作戏、分镜、镜头、视频稳定性。
- 子风格方法论：只强化某个风格，例如 HZW大师风格的光影、材质、构图、镜头偏好。
- 项目级设定：只属于某一部剧，不进入通用 docs / skills。

判断后再决定更新位置，禁止把项目设定、案例堆词或单次提示词直接写入母版。

---

## 8. 母版自检清单

- [ ] 是否先判断资料属于母版、子风格还是项目级设定。
- [ ] 若是子风格，是否明确继承了母版方法论，而不是另起一套孤立规范。
- [ ] 是否同步更新核心文档、skill、模板、agent 作业原则、workflow、phase gate 和 pipeline sync log。
- [ ] 是否避免原样堆叠案例，已提炼为可复用方法论。
- [ ] 是否保持文戏、武打戏、动作戏、生图、分镜、视频、声音、后期与 QA 的链路闭环。
