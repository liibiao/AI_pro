# Agent System Retrospective — Agent 系统流程、规则与自动化流水线复盘

> 复盘日期：2026-06-25  
> 复盘范围：`agents/`、`skills/`、`docs/`、`templates/`、`tools/`、`studio`、`projects/无限强化_漫剧_001/`、`smart-vision/`、`smart-vision/outputs/.smart-vision/`  
> 目标：把当前 Agent 系统从“方法论文档堆 + 脚本工具 + Smart Vision 平台状态机”重新整理为一张可执行、可维护、可交接的系统地图。

---

## 1. 总结论

当前项目已经从早期“AI 漫剧提示词库”演化成三层系统：

1. **方法论内核层**：`docs/`、`agents/`、`skills/`、`templates/` 定义影视工业化生产规则。
2. **创作生产工具层**：根目录 `./studio` 与 `tools/` 负责项目预检查、资产生成、故事板 / shots / fullref 产出、Seedance 多版本提示词生成与校验。
3. **Smart Vision 平台层**：`smart-vision/` 把方法论与画布执行器产品化，形成 Workflow Registry、Artifact Registry、Review Ledger、Pipeline Run、Release Registry、Canvas RUN Session、Diagnostics / Repair / Smoke 等状态机。

系统的核心共识已经很清楚：**中游主交付物不再是单条视频提示词，而是故事板生产包**。提示词只是围绕故事板、资产图、参考图职责矩阵和模型适配包派生的下游执行说明。

当前最大优势：

- 方法论深，覆盖剧本、导演、分镜、镜头、动作、文戏、声音、光影、资产、QA、发布。
- Smart Vision 平台层已经具备真实状态机和多类 smoke，能把画布输出回写到工程账本。
- 文件化记忆体系完整，理论上支持跨工具、换电脑、换 Agent 恢复。

当前最大风险：

- **权威源分裂**：根项目、项目内 `.smart-vision`、`smart-vision/outputs/.smart-vision`、`workspace-status.md` 之间状态不同步。
- **文档与代码不一致**：部分文档写 6/7 个 Agent，当前实际是 8 个精益 Agent；部分脚本执行边界比文档窄。
- **质量门禁存在“看似运行、实际未生效”的风险**：红线校验规则 key 与执行器 gate_order 不匹配；协议校验函数定义后未接入主流程。
- **项目泛化不足**：多个工具脚本仍硬编码《无限强化·灵纹觉醒》、林天、固定风格锚点、固定版本命名和特定目录。

---

## 2. 当前推荐的 8 个 Agent 体系

以 `docs/workspace-status.md` 和 `agents/` 实际目录为准，当前精益体系应统一为 **8 个执行 Agent**。

| Agent | 核心职责 | 当前权威文件 |
|---|---|---|
| Producer | 调度、Phase Gate、成本、发布、Pipeline Sync 签收 | `agents/producer/agent.md` |
| Writer | 创作源、故事、大纲、剧本正文、剧本格式自检 | `agents/writer/agent.md` |
| Director | 讲戏、调度、风格、美术、视觉连续性、故事板上游要求 | `agents/director/agent.md` |
| Storyboard Artist | 分镜拆解、镜头组、Panel、连续性卡、故事板生产包总装 | `agents/storyboard-artist/agent.md` |
| Camera Director | 单镜任务、机位、视角身份、景别、运镜、起幅落幅、结果兑现 | `agents/camera-director/agent.md` |
| Librarian | 资产索引、@引用映射、状态快照、跨集连续性、参考图职责矩阵 | `agents/librarian/agent.md` |
| Studio | AI 生成执行、故事板图生成、模型适配实验、画布 / API 执行 | `agents/studio/agent.md` |
| Reviewer | 故事板 QA、生成 QA、剪辑 QA、发布前质量审核 | `agents/reviewer/agent.md` |

需要统一的旧表述：

- `docs/workflow.md` 标题写“6 个核心角色”，但表格实际列到 Reviewer，且未纳入 Camera Director。
- `docs/agent-protocol.md` 写“核心角色分工精益版”但未包含 Camera Director。
- `README.md` 的目录说明提到更多历史 Agent 名称，需标注为已整合的旧职能。
- `docs/agent-protocol.md` 的“总控优先：统一由 master 调度”应改为“Producer / master 职责已合并，统一由 Producer 调度”。

---

## 3. Agent 协作方法论

### 3.1 核心生产思想

本项目不是“输入剧本 → 直接生成视频提示词”，而是影视工业化链路：

```text
创作源 / 项目立项
→ Writer 剧本与人物关系
→ Director 讲戏、调度、风格、资产方向
→ Storyboard Artist 分镜总装、故事板生产包
→ Camera Director 单镜专项校准
→ Librarian 资产索引、@引用、版本和连续性
→ Studio 画布 / API 生成执行
→ Reviewer QA、剪辑、发布前审核
→ Producer Phase Gate 放行、返工、复盘和 Pipeline Sync
```

### 3.2 七条硬规则

1. **文件化记忆优先**：影响方法论、规则、模板、流程、产出状态的结论必须写进项目文件。
2. **先方法论，后产出物**：分镜 / 提示词 / 生成前必须按任务类型加载对应方法论。
3. **先风格母版，后批量生成**：资产、故事板图、视频生成前必须有项目级 `visual-style-bible.md` 或等价风格锁定。
4. **先故事板，后提示词**：故事板生产包是中游主交付，提示词是下游模型适配说明。
5. **先真实源，后 @引用**：所有角色、场景、道具、参考图必须来自真实文件或资产索引。
6. **先 QA，后生成 / 发布**：缺字段、缺结果镜头、缺声音、缺资产引用、缺参考图职责矩阵时应打回。
7. **先闭环，后放行**：L3 级流程 / 模板 / Agent / 模型变更必须先 Pipeline Sync，再进入 Phase Gate。

---

## 4. 标准 Phase 流程

当前推荐把流程统一成 8 个 Phase，但要明确自动化覆盖范围分两套。

| Phase | 名称 | 主责 Agent | 核心产物 | 当前自动化状态 |
|---|---|---|---|---|
| 0 | Intake & Style | Producer + Writer + Director | `creative-source-intake.md`、风格初筛、项目级风格母版 | 文档规则完整，工具化仍偏弱 |
| 1 | Story | Writer | logline、人设、大纲、剧本 | 项目已有大量剧本；自动生成能力部分在 Smart Vision creative/start |
| 2 | Director | Director + Camera Director | 导演讲戏、动作链、镜头策略、资产 Brief | 文档规则完整，项目级落地不稳定 |
| 3 | Assets | Director + Studio + Librarian | 角色 / 场景 / 道具卡、资产图、asset-index | 根 `./studio pipeline` 可尝试调用外部资产生成；Smart Vision 有资产图 Workflow |
| 4 | Storyboard | Storyboard Artist | 分镜表、故事板图、Panel 时长、连续性卡、参考图职责矩阵 | 根工具可生成 `storyboard/shots/fullref`；Smart Vision 有故事板图 Workflow |
| 5 | Generation | Studio | 图片 / 视频素材 | 根 pipeline 默认不做视频；Smart Vision 通过画布 workflow 承载 |
| 6 | Edit & QA | Reviewer | 剪辑、QA 报告、审核结论 | 根 pipeline 暂不启用；Smart Vision 已有 edit / qa 阶段 |
| 7 | Publish & Retro | Producer + Reviewer | release manifest、发布包、复盘 | Smart Vision 已有 release registry 和发布门禁 |

关键澄清：

- 根目录 `./studio pipeline` 当前边界是 **Phase 1-3 前置检查 + 资产生产 + 故事板 / shots / fullref + 提示词生成与校验**，不自动完成视频、剪辑、审片。
- Smart Vision 平台层已经可以跑 `asset_image_generation → storyboard_image_generation → video_generation → edit → qa → release`，但它不直接调用模型，而是生成 / 导入 / 调度无限画布 Workflow JSON，并等待画布回写。

### 4.1 当前提示词输出版本体系

提示词仍是故事板生产包的下游配套生成说明。当前系统内应统一识别以下版本：

| 版本 | 用途 | 标准模板 / 路径 |
|---|---|---|
| Seedance 长版母稿 / fullref-15s | 母稿、审稿基准、跨平台派生源；默认指 `画面主体【完整】 + @Image 起手 + 逐条时间轴 + 六固定段名` 格式 | `templates/_shared/prompt-output/seedance-long-template.md`、`05-prompts/seedance/ep*-fullref-15s.md` |
| 即梦版 / Omni 版 | 即梦平台直接投喂，强调短硬、角色一致、防崩 | `templates/_shared/prompt-output/jimeng-template.md`、`05-prompts/seedance/第*集/即梦/ep*-omni-paste*.md` |
| Seedance 字段版 | Seedance 2.0 字段化执行与审稿 | `05-prompts/seedance/第*集/seedance/ep*-seedance2-paste*.md` |
| Seedance 叙事版 | 连贯导演口述式投喂，可适配多视频模型 | `templates/_shared/prompt-output/narrative-template.md`、`05-prompts/seedance/第*集/叙事/ep*-seedance2-narrative-paste*.md` |
| Seedance 2.5 15s 版 | Seedance 2.5 的 15s 连续叙事，也兼容 Seedance 2.0 15s 规则 | `templates/_shared/prompt-output/seedance2.5-15s-template.md`、`05-prompts/seedance/第*集/seedance2.5/ep*-seedance2.5-15s-paste*.md` |
| Seedance 2.5 30s 版 | Seedance 2.5 的 30s 连续叙事、一镜到底、电影感短片 | `templates/_shared/prompt-output/seedance2.5-30s-template.md`、`05-prompts/seedance/第*集/seedance2.5/ep*-seedance2.5-30s-paste*.md` |

---

## 5. 根目录自动化流水线

### 5.1 统一入口 `./studio`

`studio` 是根创作库的统一 CLI。

| 命令 | 实际作用 |
|---|---|
| `./studio start` | 启动 `tools/workbench_server.py`，打开 `http://127.0.0.1:8766/workbench.html` |
| `./studio image` | 打开生图工具 |
| `./studio canvas` | 打开新版无限画布 |
| `./studio generate` | 调用 `tools/workbench_cli.py`，从剧本文本生成运行方案 |
| `./studio pipeline <project> --ep N` | 调用 `tools/project_pipeline_run.py` |
| `./studio create img <prompt>` | 通过工作台接口执行一次生图 |
| `./studio all` | 调用外部后台管理系统启动脚本 |

### 5.2 `tools/project_pipeline_run.py`

当前主流程：

```text
读取 project pipeline.config.json
→ Phase 1-3 前置文件检查
→ 可选调用 auto_generate_assets.py 生成 characters/scenes/props
→ auto_generate_panels.py 补齐 storyboard.md
→ auto_generate_panels.py 补齐 shots.md
→ auto_generate_panels.py 补齐 fullref-15s.md
→ 可选补场景新角度
→ seedance_pipeline_run.py 生成多版本提示词并校验
```

当前边界：

- `pipeline.config.json` 明确 `video_generation/edit/review` disabled。
- `--skip-assets` 可跳过资产生成。
- 若未配置 `RUNNINGHUB_API_KEY`，资产生成会中断或跳过。

### 5.3 `tools/auto_generate_assets.py`

职责：

- 从 `05-prompts/runninghub/standard-api` 读取角色 / 场景 / 道具任务卡。
- 调用 RunningHub MJ-Niji7 标准模型接口。
- 下载图片到 `06-generated/images/{characters,scenes,props}`。
- 回填 `03-assets/asset-index.md`。

主要债务：

- 固定使用 `林天觉醒后-v3-3.png` 和硬编码云端 sref URL。
- 固定输出 `*-v8-1.png`，项目泛化不足。
- 找不到任务卡时引用未定义变量 `search_pattern`，会触发运行错误。

### 5.4 `tools/auto_generate_panels.py`

职责：

- 从剧本提取场景节拍，生成 `04-storyboard/ep*-storyboard.md`。
- 从分镜表生成 `05-prompts/seedance/ep*-shots.md`。
- 生成 `05-prompts/seedance/ep*-fullref-15s.md`。
- 在不使用 `--emit-*` 时，可调用 RunningHub Banana2 生成 comic panels。

主要债务：

- 仍硬编码项目名“无限强化·灵纹觉醒”。
- 默认风格锚点、角色别名、场景别名与当前项目强绑定。
- 自动生成的故事板是规则提取版，不能替代完整 Storyboard Artist 人工 / LLM 分镜质量。

### 5.5 `tools/seedance_pipeline_run.py`

职责：

```text
fullref @引用校验
→ seedance_emit_omni_paste.py 生成即梦版 / Seedance 字段版 / Seedance 叙事版
→ prompt_redline_validate.py 红线校验
```

主要债务：

- 文件中定义了 `_protocol_validate()`，但主流程没有调用它；几何 / 站位 / 读点协议校验未真正进入强制门禁。
- 红线校验当前存在规则 key 不匹配风险，详见第 8 节。

---

## 6. Smart Vision 自动化流水线

Smart Vision 是平台化 Runtime，不是新模型执行器。

核心边界：

```text
Smart Vision 负责编译 Workflow JSON、填入提示词 / 参考图 / 输出路径、维护状态机和审核门禁。
无限画布负责真实节点执行。
Canvas Output 负责把画布产物回写 Smart Vision 状态账本。
```

### 6.1 当前工业主链路

以 `smart-vision/outputs/.smart-vision/pipeline-run-ledger.json` 为准：

```text
asset_image_generation
→ storyboard_image_generation
→ video_generation
→ edit
→ qa
→ release
```

每一阶段的标准门禁：

```text
Workflow 已生成
→ 画布执行并回写 artifact
→ 创建 review
→ review done
→ 当前 stage done
→ 解锁 / 创建下一阶段 Workflow
```

### 6.2 已落地的状态机

| 状态源 | 职责 |
|---|---|
| `project-state.json` | 当前开发焦点、当前集、当前阶段、恢复摘要 |
| `workflow-registry.json` | Workflow JSON、状态、导入 URL、节点数、阶段绑定 |
| `artifact-registry.json` | Canvas outputs、artifact 回写、幂等记录 |
| `review-ledger.json` | 审核记录、等待 / 通过 / 打回状态 |
| `pipeline-run-ledger.json` | 工业流水线 run、stage、gate、events |
| `canvas-run-ledger.json` | 真实画布 RUN 会话、输出、review 绑定 |
| `release-registry.json` | 发布包状态、manifest、发布历史 |
| `workflow-runner-ledger.json` | 队列执行、重试、归档和事件 |
| `state-operation-journal.json` | 高影响写入操作日志 |

### 6.3 当前统计快照

从本地状态文件读取到的统计：

| 指标 | 数量 |
|---|---:|
| Pipeline Run | 17 |
| Pipeline Run done | 6 |
| Pipeline Run running | 11 |
| Workflow | 92 |
| Workflow done | 53 |
| Workflow todo | 36 |
| Workflow waiting_review | 3 |
| Review | 75 |
| Review done | 58 |
| Review waiting_review | 16 |
| Canvas outputs | 61 registered / 0 failed |
| Canvas RUN sessions | 53 |
| Release | 7 |
| Release published | 3 |
| Release ready_for_review | 4 |

判断：

- 平台 Runtime 能跑通，但测试 / smoke / entry 数据已经大量混入生产状态源。
- `running` 的 Pipeline Run 有 11 条，需判断哪些是正常等待用户画布操作，哪些是历史测试残留。
- `ready_for_review` release 有 4 个，说明发布审核积压需要可视化清理。

---

## 7. 项目状态源复盘

当前存在三类状态源：

1. **工作区级状态**：`docs/workspace-status.md`
2. **业务项目级状态**：`projects/无限强化_漫剧_001/.smart-vision/`
3. **平台工程级状态**：`smart-vision/outputs/.smart-vision/`

建议权威层级：

```text
smart-vision/outputs/.smart-vision/       # Smart Vision 平台运行权威源
projects/<项目>/.smart-vision/            # 业务项目生产权威源
docs/workspace-status.md                  # 人读摘要，不应作为机器状态源
projects/project-index.json               # 项目发现索引，必须自动维护
```

当前问题：

- `projects/project-index.json` 中 `projects` 为空，但实际存在多个项目。
- `projects/无限强化_漫剧_001/.smart-vision/project-state.json` 停留在 2026-05-07/08 的早期状态。
- `smart-vision/outputs/.smart-vision/project-state.json` 已到 2026-05-16，并包含完整平台进度。
- `docs/workspace-status.md` 中统计数字有多处历史口径：Docs 92/93/97 等表述不一致。

建议：

- 增加一个 `project-doctor` / `state-doctor` 命令，自动对比项目索引、项目内状态、平台状态、workspace-status。
- 明确 `docs/workspace-status.md` 只做人工摘要，不由业务逻辑读取。
- 将 smoke 产物与真实生产产物隔离到不同 namespace，例如 `test-runs/` 或 `smoke/`。

---

## 8. 关键问题清单

### P0：红线校验疑似未生效

文件：`tools/prompt_redline_validate.py`、`docs/prompt-redline-rules.json`

现象：

- JSON 规则顶层 key 是 `camera_action_fusion`、`six_fixed_sections` 等。
- `gate_order` 写的是 `R001`、`R002` 等。
- 执行器逻辑是 `if rule_id not in all_rules: continue`。

结果：

- 大概率所有红线规则被跳过，校验会误报通过。

建议：

- 让 `rules` 顶层改为 `R001` 这类 id key，或让执行器按 `rule["id"]` 建索引。
- 加一个最小失败用例，确认缺少六固定段名时必失败。

### P0：协议校验未接入主流程

文件：`tools/seedance_pipeline_run.py`

现象：

- `_protocol_validate()` 已定义，但 `main()` 中未调用。
- 当前主流程只做 fullref 校验和红线校验。

建议：

- 在 `_generate_prompts()` 之后、`_redline_validate()` 之前调用 `_protocol_validate()`。
- 若先担心历史文件不兼容，可加 `--skip-protocol-validate`，但默认应开启。

### P1：Agent 数量和职责文档漂移

现象：

- `workspace-status.md` 写 8 个精益 Agent。
- `workflow.md` 仍写“6 个核心角色”，表格列 7 个，缺 Camera Director。
- `agent-protocol.md` 缺 Camera Director，并保留 `master` 总控表述。

建议：

- 统一为 8 Agent。
- 明确历史 `master`、`quality-control`、`editor` 等已整合到 Producer / Reviewer。

### P1：工具脚本项目泛化不足

涉及文件：

- `tools/auto_generate_assets.py`
- `tools/auto_generate_panels.py`
- `tools/seedance_emit_omni_paste.py`

问题：

- 硬编码项目名、角色名、风格锚点、版本号、sref URL。
- 新项目复用会出现隐性污染。

建议：

- 把项目名、风格锚点、主角别名、输出版本命名写入 `pipeline.config.json` 或项目 `.smart-vision/project-state.json`。
- 所有 fallback alias 从 `03-assets/asset-index.md` 和项目配置生成。

### P1：测试数据和生产数据未充分隔离

现象：

- Smart Vision 状态源里有大量 smoke / entry / prod-validate run。
- Pipeline Run 17 条，其中 11 条 running。
- Release 7 个，其中 4 个 ready_for_review。

建议：

- 增加 `source: smoke | entry-smoke | prod-validate | production`。
- Runtime 面板默认隐藏 smoke run。
- 提供归档 / 清理命令，不删除产物，只把测试 run 标记 archived。

### P2：项目发现索引未维护

现象：

- `projects/project-index.json` 为空。
- 实际存在 `无限强化_漫剧_001`、`荒原血誓_漫剧_001` 等项目。

建议：

- `./studio start` 或 Smart Vision snapshot 时自动重建项目索引。
- 项目索引不要手写，改由 `project.json` 扫描生成。

### P2：无 Git 审计

现象：

- 当前根目录不是 git repository。
- 变更审计主要依赖 `pipeline-sync-log.md` 和状态账本。

建议：

- 若该目录继续承担平台开发，建议初始化 git 或至少建立 release snapshot / patch log。
- 大体量 `release-packages/` 可单独归档，不一定全部进入主版本控制。

---

## 9. 下一步重构路线

### 第 1 步：先修真实门禁

目标：避免“校验通过但其实没校验”的假安全。

任务：

1. 修复 `prompt_redline_validate.py` 规则索引。
2. 把 `_protocol_validate()` 接入 `seedance_pipeline_run.py`。
3. 修复 `auto_generate_assets.py` 的 `search_pattern` 未定义问题。
4. 给上述三项各补一个最小 smoke。

验收：

- 缺六固定段名必失败。
- 缺几何 / 位置关系 / 读点保护必失败。
- 找不到资产任务卡时脚本给出清晰错误，不抛未定义变量。

### 第 2 步：统一 Agent 与流程文档

目标：让新 Agent 接手时不会被 6/7/8 套说法困住。

任务：

1. `docs/workflow.md` 统一为 8 Agent。
2. `docs/agent-protocol.md` 补 Camera Director，修正 master 表述。
3. `README.md` 标注旧 Agent 是历史职能，当前执行角色以 8 Agent 为准。
4. `docs/workspace-status.md` 自动或半自动刷新统计口径。

### 第 3 步：项目配置去硬编码

目标：让流水线能服务《荒原血誓》或新项目，而不是只服务《无限强化》。

任务：

1. 扩展 `pipeline.config.json`：
   - project display name
   - style anchor path / URL
   - main characters
   - alias map
   - output version strategy
   - external API model defaults
2. `auto_generate_assets.py` 从 config / asset-index 读取 sref。
3. `auto_generate_panels.py` 从 config / script / asset-index 读取项目名和 alias。
4. `seedance_emit_omni_paste.py` 移除项目专属角色 fallback。

### 第 4 步：状态源治理

目标：把“能恢复”升级为“不会恢复错”。

任务：

1. 明确平台状态源与业务项目状态源的同步方向。
2. 自动重建 `projects/project-index.json`。
3. Smart Vision run / release / workflow 增加 source 分类。
4. 建立状态健康报告：
   - stale project state
   - empty project index
   - running run older than N days
   - waiting review older than N days
   - smoke data mixed with production

### 第 5 步：产品化验收

目标：从“能跑通 smoke”进入“业务交付质量稳定”。

任务：

1. 用真实长剧本做人工验收：分话规划、导演讲戏、分镜表、资产卡、QA、Release。
2. 检查节点交付物是否像业务文件，而不是只像占位 JSON。
3. 继续多数据包 schema 渲染：广告创意、电商商品图、电影、自媒体宣传片。
4. 把关键通过 / 失败样本写入 `learning-from-failure.md` 和 `prompt-casebook.md`。

---

## 10. 建议的系统口号

后续所有 Agent、脚本和平台功能都应围绕这句话收敛：

> **用文件化记忆保存方法，用故事板生产包承接创作，用画布 Workflow 承载执行，用 Phase Gate 和状态账本保证可追溯。**

这句话能同时约束创作侧、工程侧和平台侧，避免系统再次滑回“各写各的提示词，各跑各的脚本，各记各的状态”。
