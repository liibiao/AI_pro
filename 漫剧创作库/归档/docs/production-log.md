# Production Log — 项目制作日志

> 用途：记录创作库从方法探索到规范沉淀的关键决策、阶段推进、问题处理、版本迭代和复盘结论。本日志用于工作区级长期记录，不只服务单个项目，也用于记录跨项目可复用的方法资产形成过程。

---

## 1. 项目基本信息
- **项目名：** 漫剧创作库方法沉淀
- **项目类型：** 短剧 / 漫剧工作流方法资产
- **项目编号：** workspace-methods-001
- **目标平台：** 内部创作库 / 团队方法库
- **主模型：** Seedance 2.0
- **辅助模型：** 可灵 / 海螺（提示词与执行层兼容参考）
- **主风格：** 动作设计方法论沉淀 / 创作流程规范化
- **项目状态：** developing
- **项目负责人：** master

---

## 2. 项目目标
### 核心目标
- 把“快切 + motion blur”的速度设计，从单纯技法补充升级为完整方法论。
- 将“对抗关系 / 身体受力 / 镜头节奏”沉淀为跨短剧、漫剧、分镜和 Seedance 执行层都可复用的正式方法资产。
- 将新方法接入文档、模板、案例、样板项目、Agents、Skills 与知识地图入口，形成工作区级闭环。

### 阶段目标
- **阶段 1：** 解释快切与 motion blur，并形成团队级动作速度表现规范。
- **阶段 2：** 将规范接入短剧 / 漫剧模板，并补充完整示例。
- **阶段 3：** 基于视频分析提炼“对抗关系 / 身体受力 / 镜头节奏”三要素方法。
- **阶段 4：** 将三要素方法反向接入 demo 项目、知识地图、Agents、Skills 与执行层。

---

## 3. 里程碑记录
| 日期 | 里程碑 | 状态 | 产出文件 | 备注 |
|------|--------|------|---------|------|
| 2026-04-12 | 动作速度表现规范建立 | ✅ 完成 | `docs/action-speed-design-standard.md` | 建立快切与 motion blur 的团队规范 |
| 2026-04-12 | 动作速度模板落地 | ✅ 完成 | `templates/_project-template/04-storyboard/action-speed-design-template.md` `templates/_manga-template/04-storyboard/action-speed-design-template.md` | 短剧 / 漫剧模板同步接入 |
| 2026-04-12 | 动作速度完整示例补齐 | ✅ 完成 | `docs/action-speed-design-example.md` | 建立规范到执行的完整示例 |
| 2026-04-12 | 视频抽帧分析完成 | ✅ 完成 | `projects/demo_shortdrama_001/06-generated/images/video-analysis-new/` | 对外部视频抽帧并进行镜头 / 动作 / 节奏分析 |
| 2026-04-12 | 三要素案例文档建立 | ✅ 完成 | `docs/action-case-opposition-force-camera.md` | 将视频分析提炼为正式方法案例 |
| 2026-04-12 | demo 项目三要素落地 | ✅ 完成 | `projects/demo_shortdrama_001/02-director/` `04-storyboard/` `05-prompts/seedance/` | 把方法写入导演讲戏、动作设计、分镜和提示词 |
| 2026-04-12 | 知识地图接入完成 | ✅ 完成 | `README.md` `docs/workflow.md` `docs/workspace-status.md` | 新方法已进入总入口、流程入口和状态总览 |
| 2026-04-12 | 第三轮外部知识吸收落地 | ✅ 完成 | `projects/demo_shortdrama_001/06-generated/experiments/experiment-index.md` `projects/demo_shortdrama_001/08-qa/generation-review.md` `projects/demo_shortdrama_001/07-edit/edit-plan.md` `templates/_manga-template/03-assets/props/prop-template.md` `templates/_manga-template/03-assets/asset-index.md` `agents/prompt-lab/agent.md` `agents/seedance-technical-director/agent.md` `skills/prompt-experiment-skill.md` | 将学习跌倒规范接入 demo 实战回填链，并补齐漫剧端道具模板与失败知识调用规则 |


---

## 4. 阶段推进日志

### [2026-04-12] 阶段推进记录
- **当前阶段：** director / storyboard / prompt / methods
- **本次完成：**
  - 将“快切 + motion blur”从单纯技法讨论升级为动作速度表现规范。
  - 基于视频抽帧分析，提炼出“对抗关系 / 身体受力 / 镜头节奏”三要素方法。
  - 将三要素方法沉淀为独立案例文档，并接入短剧 / 漫剧模板。
  - 将方法落入 demo 项目导演讲戏、动作设计稿、分镜表、Seedance 提示词与执行方案。
  - 把新方法接入 README、workflow、workspace-status、关键 Agents 与 Skills。
  - 把三要素方法接入 seedance-technical-director，统一执行层的速度承担逻辑。
  - 完成 SHOT 1-9 / SHOT 1-14 的 baseline / enhanced / fallback 三段法演练回填。
  - 完成 QA 放行、最小拼接验证，并将 baseline / fallback 升级为正式资产候选与保底资产。
  - 明确后续模板治理重点：继续推进多模态执行方案与 QA 模板的共享母版化。

- **本次产出文件：**
  - `docs/action-speed-design-standard.md`
  - `docs/action-speed-design-example.md`
  - `docs/action-case-opposition-force-camera.md`
  - `templates/_project-template/04-storyboard/action-speed-design-template.md`
  - `templates/_manga-template/04-storyboard/action-speed-design-template.md`
  - `projects/demo_shortdrama_001/02-director/ep001-director-notes.md`
  - `projects/demo_shortdrama_001/02-director/action-design/ep001-action-rhythm.md`
  - `projects/demo_shortdrama_001/04-storyboard/ep001-storyboard.md`
  - `projects/demo_shortdrama_001/05-prompts/seedance/ep001-shots.md`
  - `README.md`
  - `docs/workflow.md`
  - `docs/workspace-status.md`
  - `agents/director/agent.md`
  - `agents/storyboard-artist/agent.md`
  - `agents/seedance-technical-director/agent.md`
  - `skills/seedance-action-skill.md`
  - `skills/storyboard-generator-skill.md`
- **当前问题：**
  - 当前三要素方法已完成全链路接入，但后续仍可继续补充更多视频案例与项目实战样本，增强方法的案例密度。
  - 外部视频分析需要先抽帧再观察，不能像文本一样直接读视频内容，流程上仍需额外一步转换。
- **下一步计划：**
  1. 继续在真实项目推进中收集更多“压制 / 反扑 / 失衡 / 再稳住”类型案例。
  2. 把成功镜头与失败镜头都抽回案例库，形成正反案例对照。
  3. 在后续 demo 或真实项目中继续验证三要素方法在武打戏与情绪动作戏中的稳定性。
- **负责人 / Agent：** master

---

## 5. 关键决策记录

| 日期 | 决策主题 | 决策内容 | 原因 | 影响范围 |
|------|---------|---------|------|---------|
| 2026-04-12 | 动作速度方法升级 | 不再只把“快切 + motion blur”当作表现手法，而是上升为完整动作速度表现规范 | 仅讨论速度手法会导致假速度感和动作空心化 | `docs/` `templates/` `projects/` |
| 2026-04-12 | 三要素方法确立 | 将“对抗关系 / 身体受力 / 镜头节奏”确立为动作设计上游判断法 | 视频分析表明，仅靠快切与 blur 无法保证动作重量与可读性 | 全工作区 |
| 2026-04-12 | 知识地图接入 | 新方法必须进入 README、workflow、workspace-status | 若不进入入口层，方法难以被团队长期使用 | 全工作区 |
| 2026-04-12 | 全链路接入策略 | 新方法不仅写文档，还同步进入模板、demo 项目、Agents、Skills 与技术导演执行层 | 防止方法停留在文档层，必须进入实际生产链路 | 全工作区 |
| 2026-04-12 | 执行层统一原则 | Seedance 技术导演必须先判断三要素，再决定速度由动作、运镜、剪辑还是桥接承担 | 执行层若只追求提速，容易削弱关系与受力 | `agents/seedance-technical-director/` |

---

## 6. 问题与阻塞记录

| 日期 | 问题 | 严重级别 | 当前状态 | 处理方案 |
|------|------|---------|---------|---------|
| 2026-04-12 | 无法直接读取 mp4 内容 | P1 | 已解决 | 改用 ffmpeg 抽帧分析，再进行镜头 / 动作 / 节奏观察 |
| 2026-04-12 | 工作区外视频访问需要授权 | P1 | 已解决 | 先征得用户明确同意，再将抽帧结果输出到工作区内 |
| 2026-04-12 | 速度讨论容易停留在“更快 / 更炸”层面 | P1 | 已解决 | 通过三要素方法把速度问题上移为关系、受力和镜头问题 |
| 2026-04-12 | 方法容易停留在文档层，无法真正进入生产链 | P1 | 已解决 | 将方法同步接入模板、样板项目、知识地图、Agents、Skills 和技术导演 |

### 严重级别建议
- **P0**：阻塞项目，必须立即处理
- **P1**：明显影响质量，优先处理
- **P2**：可暂时绕过，但应尽快整理

---

## 7. 版本迭代记录
### 版本信息
- **当前版本：** v1.1
- **版本目标：** 建立动作速度表现方法的全链路工作区资产，完成 demo 终版闭环、外部 HTML 高价值知识吸收、学习跌倒规范化与资产/执行层全面接入
- **版本状态：** 已归档

### 版本变更说明
| 版本 | 日期 | 变更内容 | 负责人 |
|------|------|---------|------|
| v0.1 | 2026-04-12 | 建立动作速度表现规范与模板 | master |
| v0.2 | 2026-04-12 | 补齐完整示例并落地 demo 项目 | master |
| v0.3 | 2026-04-12 | 基于视频分析提炼三要素案例文档并接入知识地图 | master |
| v0.4 | 2026-04-12 | 将三要素方法接入 Agents、Skills 与 Seedance 技术导演执行层 | master |
| v0.5 | 2026-04-12 | 补齐外部视频吸收、baseline / 强化版 / 回退策略，并完成入口、demo、SOP 与 agent 封板归档 | master |
| v0.6 | 2026-04-12 | 完成 v1-v3 查漏补缺实施：补齐 demo 后半链、漫剧执行链、共享动作母版与真实样例回填演练 | master |
| v0.7 | 2026-04-12 | 完成 v4-v5 查漏补缺实施：补齐正式资产候选闭环、更新工作区状态，并明确模板共享化下一步治理重点 | master |
| v0.8 | 2026-04-12 | 完成 v6 查漏补缺实施：建立生成审核共享母版、扩展正式资产案例库入口 | master |
| v0.9 | 2026-04-12 | 完成 demo 新一批关键镜头候选扩展与全局案例抽回 | master |
| v1.0 | 2026-04-12 | 完成终版收口：demo 主线镜头终版闭环、共享模板母版化、正式资产案例库与学习跌倒入口 | master |



---

## 8. QA 与反馈摘要
| 日期 | 审核对象 | 结果 | 核心问题 | 后续动作 |
|------|---------|------|---------|---------|
| 2026-04-12 | 动作速度规范与模板 | ✅ 通过 | 无结构错误，方法逻辑清晰 | 继续在真实项目中验证 |
| 2026-04-12 | 三要素案例文档 | ✅ 通过 | 已具备培训材料价值 | 后续补充更多案例样本 |
| 2026-04-12 | Agents / Skills 接入 | ✅ 通过 | 输出规则与方法已统一 | 后续观察真实调用是否稳定 |
| 2026-04-12 | demo 后半链正式资产候选闭环 | ✅ 通过 | enhanced 版本收益低于失控风险，baseline / fallback 更稳定 | 继续扩展更多镜头的正式资产候选验证 |
| 2026-04-12 | demo 终版主线闭环 | ✅ 通过 | 仅剩个别观察型镜头需要作为学习样本保留 | 进入下一轮“学习跌倒”，优先总结失败版与减负触发条件 |

---

## 9. 经验沉淀 / 复盘
### 做对了什么
- 没有把视频分析停留在“好像有点用”，而是抽取出可复用的方法结构。
- 没有只做规范，而是同步做模板、案例、demo 项目和 Agent / Skill 接入，形成全链路闭环。
- 把“速度感”问题上移到“关系 + 受力 + 镜头”判断层，显著提高了方法的稳定性与可迁移性。

### 做错了什么
- 一开始动作速度讨论还偏向技法层，没有立刻上升到关系与受力层。
- 视频分析需要额外抽帧步骤，说明现有素材分析流程仍有操作成本。

### 下次应怎么优化
- 后续遇到类似视频分析时，尽量直接按“对抗关系 / 身体受力 / 镜头节奏”三栏做观察记录。
- 在每次方法沉淀后，尽快同步到入口层、模板层和执行层，避免只停留在单点文档。

### 可沉淀为规范的内容
- 三要素动作设计上游判断法：对抗关系 / 身体受力 / 镜头节奏。
- “被持续压制后的强行反击”作为团队标准示范案例。
- 速度承担方式的执行层统一原则：动作、运镜、剪辑、桥接各自承担不同速度功能。

---

## 10. 小白使用建议
- 当你觉得一个动作“还不够快”时，先别急着加快切或 blur，先问谁压谁、身体哪里在吃力、镜头该停还是该推。
- 当你觉得一场情绪戏“不够狠”时，也可以用三要素方法，不一定非得是武打戏。
- 当你做完一个有效案例，不要只存在项目里，尽量同步进 docs、模板和 Agent / Skill 规则里。
- 真正有价值的方法，不是“知道一个词”，而是能进入团队流程、重复使用并稳定产出。
