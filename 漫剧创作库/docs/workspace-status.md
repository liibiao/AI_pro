# workspace-status — 创作库状态总览

## 当前工作区
`/Users/billy/Documents/AI_pro/漫剧创作库`

## 当前重点进度
- 智能视界平台功能主链路已完成真实 Pipeline Run 闭环：`pipeline-run-ep001-1778290049528` 已跑通 `asset_image_generation → storyboard_image_generation → video_generation → edit → qa → release` 并进入 `done`。
- Smart Vision 执行边界已固定为无限画布 Workflow JSON 生成与状态调度；平台不直接调用模型，真实执行由画布工作流承载。
- 自动发布包 `release-ep001-auto-draft-qa-1778303373129` 已完成 `ready_for_review → approved → published`，publish gate blockers 为 0，Runtime Diagnostics ready / 0 issues。
- Runtime 面板已补 Canvas failed 输出 retry 入口，支持 dry-run 预览和确认后真实回写，真实 API 回放通过。
- 真实画布导入入口已完成硬化：legacy workbench 默认端口统一为 `8877`，Bridge / bundled snapshot 动态重算 workflow 导入 URL 的 `bridgeBase`，画布导入时 URL 参数优先覆盖工作流内嵌旧地址；已验证 `8877` 画布入口 200、当前 Bridge artifact read ok、release workflow importCheck ok。
- 真实画布导入入口已固化 smoke：`npm run smoke:canvas-import` 检查静态契约与临时 Bridge 动态 URL；`npm run smoke:canvas-import:live` 要求 `8877` 画布页面在线并返回 200；当前两者均通过。
- 浏览器级画布导入探针已通过：`npm run smoke:canvas-import:browser` 用 Chrome headless 打开真实 `8877` runUrl，验证 release workflow 通过 Bridge fetch 导入后加载 `4` 个节点和 `3` 条连线；legacy 画布已支持 `contextPack / artifactInput / workflowBuilder / phaseGate` 平台节点，Release / QA Workflow 不再空白。
- 当前下一步：用真实浏览器打开阶段 `runUrl`，验证手动 RUN、产物落盘和 `canvas-output` 回写，并检查 Runtime / Pipeline Run / Release 面板在真实数据下的交互一致性。
- 画布已新增 Midjourney 智能提示词模式：用户输入自然语言并选择 MJ-V7/Niji 模型后，程序会把 `skills/midjourney-prompt-skill.md` 和 `wordlists/mj-image/` 候选词库内置传给 GPT-5.5/LLM 网关，生成忠于原意的英文 MJ 提示词与高质量合法参数。

## 顶层模块
- `agents/`：Agent 角色定义（8 个当前精益执行 Agent）
- `docs/`：工作流、规范、指南与方法论（97 个 Markdown 文档；新增创作源输入、影片风格基调、场景类型库、风格母版标准）
- `skills/`：跨项目复用能力模块（39 个 Markdown 技能文档）
- `templates/`：短剧 / 漫剧 / 共享模板（108 个 Markdown 模板）
- `tools/`：CLI 工具
- `projects/`：实际项目目录

## 核心 Agents (8 个精益版)
- **Producer**（制片人）：项目调度、门禁放行、发布。整合了原 master/operations/publisher。
- **Writer**（编剧）：故事大纲、人物设定、剧本正文。整合了原 scriptwriter/script-auditor。
- **Director**（导演）：视觉风格、讲戏、美术指导、视觉连续性。整合了原 director/art-director/continuity，与独立 Storyboard Artist 协作。
- **Storyboard Artist**（分镜师）：分镜拆解、镜头节拍、故事板生产包总装。独立角色。
- **Camera Director**（镜头导演）：单镜任务、景别、视角身份、机位、运镜、起幅落幅和结果兑现。
- **Librarian**（制片库）：资产管理、跨集一致性、故事板资产引用矩阵、项目状态。整合了原 asset-librarian/context-loader。
- **Studio**（工作室）：AI 生成执行、故事板图生成、模型适配实验。整合了原 executor/prompt-lab/technical-dir。
- **Reviewer**（审片员）：剪辑组装、故事板/业务 QA。整合了原 quality-control/editor。

## 已有 Docs（93 个 Markdown 文档）

### 核心流程
- creative-source-intake-workflow.md — 创作源输入与项目立项工作流（支持梗概、小说、已有剧本、原创、角色设定、世界观、已有分镜/资产多入口）
- film-style-tone-system.md — 影片风格画质基调系统（开剧前 Top3 风格推荐、HZW重定位、全链路风格锁定）
- film-style-bible-standard.md — 项目级 visual-style-bible 风格母版标准
- scene-type-style-library.md — 场景类型库（打戏、文戏、悬疑、赛车、喜剧、黑帮、警匪、灵异、僵尸、赛博、萌宠等）
- workflow.md — 工作流程
- agent-protocol.md — Agent 协作协议
- style-guide.md — 风格指南
- project-bootstrap.md — 项目启动指南
- project-bootstrap-checklist.md — 项目启动清单
- phase-gate-checklist.md — 阶段门禁清单
- publish-workflow.md — 发布流程
- workspace-status.md — 工作区状态总览
- project-memory-system.md — 项目记忆系统与工作流协作规范（文件化保存长期记忆、方法论、Agent/Skill 协作思想、产出物闭环与 Pipeline Sync 规则）

### 模型与提示词
- ai-model-guide.md — AI 模型指南
- prompt-standards.md — 提示词标准
- prompt-casebook.md — 提示词案例库
- seedance-multimodal-guide.md — Seedance 多模态指南
- seedance-prompt-engineering.md — Seedance 提示词工程

### 镜头与运镜 (New)
- shot-language-library.md — 镜头语言库
- shot-rhythm-casebook.md — 镜头节奏案例
- shot-duration-and-density-standard.md — 镜头时长与节拍密度
- camera-language-dictionary.md — 镜头语言字典
- camera-psychology-movement-standard.md — 摄影机运动与观众心理学规范 (New)

### 动作与表现 (New)
- action-speed-design-standard.md — 动作速度表现规范 (含文戏/日常动作扩展)
- action-combat-design-standard.md — 全品类武打动作戏设计规范
- crowd-choreography-standard.md — 群体调度与走位美学规范
- dance-rhythm-aesthetics-standard.md — 舞蹈律动与唯美动作规范
- environmental-destruction-standard.md — 非人物理破坏与崩塌规范
- zero-gravity-parkour-standard.md — 失重与极限运动视觉规范
- action-speed-design-example.md — 动作速度设计示例
- action-case-opposition-force-camera.md — 动作三要素案例
- action-asset-casebook.md — 动作资产案例库
- staging-impact-audiovisual-methodology.md — 视听打击与对峙调度方法论

### 环境与交互 (New)
- atmosphere-interaction-standard.md — 环境氛围与物理互动规范
- reference-image-analysis-standard.md — 参考图八维分析标准
- scene-design-sheet-spec.md — 场景设定稿 / 720度全景图 / 12宫格视角图交付规范

### 文戏与戏剧张力
- drama-tension-design-standard.md — 文戏与戏剧张力表现总规范

### 角色与成长 (New)
- character-visual-arc-standard.md — 角色视觉成长弧线规范 (New)
- global-character-library.md — 全局角色库
- global-scene-library.md — 全局场景库
- cover-promo-casebook.md — 封面宣发案例

### 后期视听与美学包装
- post-production-aesthetics-standard.md — 后期视听与美学包装总规范
- lighting-color-aesthetics-standard.md — 光影与色彩美学规范
- transition-montage-standard.md — 视听转场与蒙太奇规范
- vfx-design-standard.md — VFX 视觉特效表现规范
- sound-design-montage-standard.md — 听觉设计与声音蒙太奇规范
- framing-aspect-ratio-standard.md — 构图与画幅比例美学规范
- typography-ui-standard.md — 字幕、排版与视觉识别规范

### 制片管理
- episode-context.md — 集间上下文
- production-log.md — 制作日志
- daily-log.md — 每日日志
- cost-and-schedule.md — 成本与排期
- learning-from-failure.md — 学习跌倒记录

### 剧本标准
- shortdrama-script-standard.md — 短剧剧本标准

### API 与图像管线
- personal-api-integration-guide.md — 个人 API 对接文档（含 MJ 文生图）
- runninghub-api-minimal-guide.md — RunningHub API 最小指南
- runninghub-banana2-guide.md — Banana2 使用指南
- runninghub-banana2-workflow-map.md — Banana2 工作流映射
- runninghub-client-cli-guide.md — CLI 客户端使用指南
- runninghub-image-agent-integration-notes.md — Agent 集成说明
- runninghub-image-edit-upscale-guide.md — 编辑增强指南
- runninghub-image-edit-upscale-workflow-map.md — 编辑增强工作流映射
- runninghub-image-integration-spec.md — 图像集成规范
- runninghub-image-pipeline-integration-spec.md — 图像管线集成规范
- runninghub-mj-v7-api-guide.md — MJ-V7 API 指南
- runninghub-standard-models-guide.md — 标准模型指南

### 已废弃（保留参考）
- banana2-agent-integration-notes.md — 已合并入 runninghub-image-agent-integration-notes.md
- banana2-integration-spec.md — 已合并入 runninghub-image-integration-spec.md

## 已落地 Skills（39 个 Markdown 技能文档）

### 编剧类
- script-writer-skill.md — 编剧技能
- script-review-skill.md — 剧本审核技能
- shortdrama-outline.md — 短剧大纲技能
- shortdrama-structure.md — 短剧结构技能
- shortdrama-character.md — 短剧人物技能
- shortdrama-dialogue.md — 短剧台词技能
- shortdrama-adapt.md — 小说改编技能
- shortdrama-format.md — 剧本格式化技能

### 导演与分镜类
- `director-skill.md` — 导演讲戏技能
- `fpv-director-skill.md` — FPV 运镜导演技能
- `storyboard-generator-skill.md` — 分镜生成技能
- `seedance-action-skill.md` — Seedance 动作技能

### 美术与资产类
- art-design-skill.md — 服化道设计技能
- production-design-skill.md — 美术设计技能
- asset-library-skill.md — 资产库技能
- asset-versioning-skill.md — 资产版本技能
- role-archetype-skill.md — 角色原型技能

### 场景与节奏类
- scene-library-skill.md — 场景库技能
- rhythm-design-skill.md — 节奏设计技能
- cover-hook-skill.md — 封面钩子技能

### 生成与技术类
- `seedance-multimodal-skill.md` — Seedance 多模态技能
- `prompt-experiment-skill.md` — 提示词实验技能
- `troubleshooting-skill.md` — 排障技能
- `runninghub-image-skill.md` — RunningHub 图像技能
- `midjourney-prompt-skill.md` — Midjourney 智能提示词技能（画布 Smart MJ 模式内置调用，结合 `wordlists/mj-image/` 筛词）
- `foley-sound-designer-skill.md` — 音效设计技能
- `dialogue-voice-director-skill.md` — 对白配音技能

### 质量与连续性类
- `quality-control-skill.md` — 质检技能（业务审核 + 合规审核，已补入提示词专项门禁）
- `continuity-check-skill.md` — 连续性检查技能

### 发布与运营类
- publishing-ops-skill.md — 发布运营技能
- production-ops-skill.md — 制片运营技能

### 索引
- README.md — 技能总览索引

## 当前模板
### 共享母版
- `_shared/`：新增 `intake/creative-source-intake-template.md` 与 `style/` 风格模板组（style-filter-result、visual-style-bible、scene-type-analysis），并保留 `director-storyboard/` D12-Sora2 / D15-Seedance2 导演故事板图输入包、D12、D15、Panel timing、连续性卡、QC、内部 prompt、视频适配包和交付索引模板

### 短剧模板
- `_project-template/`
- 已补充：资产索引、生成结果索引、提示词案例模板、Seedance 专用提示词模板、多模态执行方案模板、提示词排障模板、审核报告模板、剧本标准审核模板、提示词专项审核模板、成本追踪模板、发布复盘模板、封面案例模板、节奏案例模板、动作速度表现模板、升级后的短剧标准剧本模板、RunningHub 任务卡模板（Banana2 / 图像编辑 / MJ-V7 / MJ-Niji7 / MJ-Niji6）、图片资产四分类目录、场景索引中的720全景图与12宫格视角图字段

### 漫剧模板
- `_manga-template/`
- 已补充：资产索引、提示词案例模板、Seedance 专用提示词模板、审核报告模板、成本追踪模板、发布复盘模板、封面案例模板、节奏案例模板、动作速度表现模板、三要素动作预判与案例化动作速度模板、多模态执行方案模板、提示词排障模板、场景索引中的720全景图与12宫格视角图字段

## 当前工具
- `tools/runninghub_client.py`：RunningHub 统一 CLI 客户端（支持 7 种执行模式）

## 当前项目
- `projects/demo_shortdrama_001`：首个样板短剧项目，已完成 Seedance 终版级 demo 闭环（实验、QA、拼接、正式资产候选、保底资产、失败案例）；已完成 RunningHub 四模型测试闭环（Banana2 + MJ-V7 + MJ-Niji7 + MJ-Niji6），全部任务卡已回填、资产索引已登记

## 当前状态判断
- 工作区结构：已成型，从创作库升级为具备全局资产库、案例库、运营复盘、真实样板项目、短剧工业标准、Seedance 多模态方法论、RunningHub 图像管线和 D12/D15 导演故事板图体系的工作室框架
- Agent 文档：8 个当前精益执行 Agent，覆盖创作中枢、编剧、导演、分镜、镜头、资产管理、生成执行和质检复盘
- Docs 规范：92 个 Markdown 文档，覆盖流程、镜头语言、动作速度、提示词工程、RunningHub 全管线、参考图分析、项目记忆、导演故事板图和视频模型适配
- Skills：39 个 Markdown 技能文档，覆盖编剧、导演、美术、资产、分镜、镜头设计、生成、质检、发布运营、RunningHub 图像和导演故事板图
- Templates：108 个 Markdown 模板，已具备从立项到发布复盘的标准产物骨架；共享模板已新增 D12-Sora2 / D15-Seedance2 导演故事板图模板组；短剧与漫剧模板已挂载 `04-storyboard/director-boards/` 项目级骨架
- Tools：统一 CLI 客户端支持 7 种 RunningHub 执行模式
- Projects：首个真实样板项目已完成 Seedance + RunningHub 双通道验证闭环；主线项目《无限强化·灵纹觉醒》尚待实例化首个 D12/D15 导演故事板图样板包
- 方法链入口：已形成“外部视频吸收 → baseline 提示词 → 强化版迭代 → 回退策略 → QA → 拼接验证 → 正式资产候选 → 全局案例库 → 学习跌倒”的兼容导航，并新增“剧本 / 分镜 / 资产图 → D12/D15 导演故事板图 → Sora2/Seedance2 适配包 → 视频生成”的主交付链路

## 资产文件命名规范
所有生成的图片资产统一使用中文命名，格式：
```
<用途>-<对象>-<版本>-<日期>[-序号].<扩展名>
```
示例：`角色定妆-男主-v1-20260412.png`、`封面探索-第1集-v1-20260412-1.png`

## D12-Sora2 / D15-Seedance2 导演故事板图体系（2026-05-06 新增）
- 已建立 `gpt-image-2` 图生图专业导演故事板图体系，故事板图成为视频生成前主交付物，默认替代长版提示词交付；提示词能力保留为内部引擎与模型适配说明。
- D12-Sora2：面向 Sora2 单段 12s 上限，使用“一张 D12 导演故事板图 + 简短动态风格叙事提示词”。
- D15-Seedance2：面向 Seedance2 单段 15s 上限，输出 Stable `4图+1视频` 与 Extended `9图+1视频+1音频` 两套适配包。
- 已落盘核心文件：`docs/gpt-image-director-storyboard-methodology.md`、`docs/director-storyboard-deliverable-standard.md`、`docs/storyboard-continuity-standard.md`、`docs/storyboard-video-model-adaptation-standard.md`、`skills/director-storyboard-image-skill.md`、`templates/_shared/director-storyboard/`。
- 已同步 Agent / Workflow / Phase Gate / Agent Protocol / 项目记忆 / Pipeline Sync，后续涉及故事板图、Sora2、Seedance2 视频生成前交付物时必须自动加载该链路。

## 智能视界产品化 Runtime 状态（2026-05-07 新增）
- 智能视界定位为“AI 大模型驱动的本地优先能力包创作工作台”，不把平台大脑绑定为 GPT；GPT-5.5 仅作为可选模型之一。
- 第一版以能力包 Runtime、工程目录记忆、Workflow JSON Builder、本地桥接层和无限画布执行器为核心，不把重型服务端、数据库或队列作为前置依赖。
- 平台交付物工程目录以 `.smart-vision/` 作为状态核心，记录项目 Phase、集数进度、故事板状态、产物版本、workflow 状态、审核结论、连续性账本、能力包 hash 和恢复检查点。
- 客户端记忆只保存最近工程、UI 状态、临时会话和未同步提醒；工程记忆是客户端退出、会话结束、更换客户端和跨电脑迁移后的最高恢复依据。
- 已落盘核心文件：`docs/smart-vision-architecture.md`、`docs/smart-vision-canvas-node-plan.md`、`docs/smart-vision-implementation-roadmap.md`、`docs/smart-vision-project-workspace-standard.md`、`docs/smart-vision-capability-pack-runtime.md`、`templates/_shared/smart-vision/`。

## 智能视界独立平台工程与无限画布迁移状态（2026-05-07 新增）
- 已新增 `smart-vision/` 作为智能视界独立前端平台工程主目录，不再只把平台开发方案散落在根 `docs/` 下。
- `smart-vision/docs/` 已按计划书、架构设计、功能规划、技术选型、工程记忆、Runtime、画布接入和迁移验收重新归档智能视界平台文档。
- 已将无限画布相关代码以复制方式迁移到 `smart-vision/canvas/legacy-workbench/` 与 `smart-vision/services/workbench/`，覆盖 UI 页面、`workbench-engine.js`、模型配置、Python 服务层、核心逻辑、图像后端、输出初始化和对象存储可选链路。
- 原始 `tools/` 与根 `studio` 未移动、未删除、未重构，`#image` / `./studio image` 原能力不应被本次迁移破坏。
- 迁移版启动入口为 `smart-vision/scripts/run-legacy-workbench.sh`，通过临时兼容运行目录启动 legacy 副本，避免直接改写无限画布业务逻辑。

## 智能视界平台 Runtime 开发状态（2026-05-09 全链路闭环更新）
- 当前开发重心已从业务产物生成切回平台功能开发；用户明确要求先完成智能视界所有平台能力，不急于生成最终业务产出。
- 已完成平台 Runtime 管理层核心链路：`Workflow Registry`、`Artifact Registry`、`Review Center`、`Workflow Runtime`、`Runtime Diagnostics`、`Runtime Repair`、`Queue Run`、`Retry Failed`、`Replay Chain`、`Pipeline Run`、`Workflow JSON Preflight`、`Canvas Output`、`Release Registry`。
- 已完成 Release Registry 代码链路与前端面板：`GET /api/smart-vision/releases`、`POST /api/smart-vision/releases/create`、`POST /api/smart-vision/releases/status`，并在 `ReleaseRegistryPanel` 展示诊断问题、发布包统计、合法状态按钮保护、门禁分组与历史记录。
- 发布包生命周期为 `draft → ready_for_review → approved → published → archived → restored`；后端已加入状态机校验、blocked review 禁止 approved、published 前 QA review / release review / manifest / artifact / approved status 强门禁。
- 真实 Pipeline Run `pipeline-run-ep001-1778290049528` 已完成六阶段闭环并发布自动包；最新验证：`npm run build`、`npm run smoke:runtime:strict`、`npm run smoke:anomaly` 全部通过。
- 当前核心代码入口：`smart-vision/app/scripts/bridge-server.mjs`、`smart-vision/app/src/App.tsx`、`smart-vision/app/src/data/api.ts`、`smart-vision/app/src/types.ts`、`smart-vision/app/src/styles.css`。
- 当前工程记忆权威源：`smart-vision/outputs/.smart-vision/project-state.json`、`recovery-checkpoint.json`、`handoff-report.md`；换电脑后必须先读取这些文件恢复上下文。
- 最近补齐生产就绪总控面板：前端首页聚合 Bridge 数据源、Pipeline Run 阶段、Release 发布门禁、Canvas 回写异常、Workflow importCheck 与 smoke 结果，并提供端到端自测、流水线 dry-run、发布异常自测和打开画布快捷入口。
- 最近一次验证：`cd smart-vision/app && npm run build && npm run smoke:runtime:strict && npm run smoke:canvas-import:browser && npm run smoke:anomaly && npm run build` 已通过。下一步进入真实人工 RUN 与 `canvas-output` 回写联调，并继续收敛 UI 关键操作入口。

## 下一步建议
1. 在主线项目 `projects/无限强化_漫剧_001` 中创建第 1 个 D12-Sora2 / D15-Seedance2 故事板样板包，验证项目级端到端闭环
2. 后续按需为 `./studio` 增加导演故事板图一键生成命令，提高生产效率
3. 持续把真实生成中的失败版、保底版、观察型镜头抽回案例库、`learning-from-failure.md` 和 Pipeline Sync
4. 当新模型或新平台出现明显方法差异时，再开启下一轮外部知识吸收升级
5. 新项目资产文件命名统一使用中文命名规范
