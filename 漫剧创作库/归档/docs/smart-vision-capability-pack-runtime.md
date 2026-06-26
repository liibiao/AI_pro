# 智能视界能力包 Runtime 规范

> 本规范定义智能视界如何把 `docs/`、`agents/`、`skills/`、`templates/`、`wordlists/`、项目文件与工程记忆封装为可加载、可编译、可恢复的能力包 Runtime。AI / 大模型负责在 Runtime 约束下规划和生成，不作为固定 GPT 绑定大脑。

---

## 1. Runtime 定位

智能视界 Runtime 是连接方法论资产与无限画布执行器的中间层：

```text
工程目录记忆
→ Capability Pack Loader
→ Context Builder
→ AI / 大模型 Planner
→ Recipe / JSON DSL Runner
→ Workflow JSON Builder
→ Phase Gate Runner
→ Artifact Registry Writer
→ 工程记忆更新
```

Runtime 不直接替代创作方法论，而是把方法论、模板、Agent、Skill、词库、项目状态和审核反馈组装为可执行上下文。

---

## 2. 能力包内容

能力包至少包含：

```text
capability-pack/
├── pack.json
├── docs.manifest.json
├── agents.manifest.json
├── skills.manifest.json
├── templates.manifest.json
├── wordlists.manifest.json
├── phase-gates.json
├── output-schemas/
├── recipes/
└── compile-report.md
```

`pack.json` 基础字段：

```json
{
  "pack_id": "manga-drama-production",
  "name": "漫剧工业化生产能力包",
  "version": "0.1.0",
  "source_hash": "string",
  "entrypoints": ["storyboard_semi_auto", "episode_semi_auto", "full_series_queue"],
  "required_docs": [],
  "required_skills": [],
  "required_agents": [],
  "template_roots": [],
  "wordlist_roots": []
}
```

---

## 3. 三种运行模式

### 3.1 Dynamic Planning Mode

适用场景：

- 新任务未命中已有 Recipe。
- 用户修改了能力包方法论。
- 工程状态异常，需要 AI / 大模型重新规划。
- 创作任务需要高自由度判断。

流程：

```text
读取工程记忆
→ 组装能力包上下文
→ AI / 大模型生成任务树
→ Schema 校验
→ 用户 / Phase Gate 审核
→ 可选沉淀为 Recipe
```

### 3.2 Compiled Executor Mode

适用场景：

- 能力包 hash 未变。
- 任务类型稳定。
- 已有 Recipe 命中当前输入。

流程：

```text
读取 Recipe
→ 校验输入 Schema
→ 执行固定任务链
→ 生成 Workflow JSON
→ 写回工程记忆
```

### 3.3 Hybrid Mode

默认模式：

```text
能力包 hash 未变 + 任务命中 Recipe
→ Compiled Executor Mode

任务超出 Recipe / 能力包变化 / 用户要求创造性改写
→ Dynamic Planning Mode
→ 通过审核后沉淀新 Recipe
```

---

## 4. Hash 与失效策略

必须记录：

- `source_hash`：能力包源文件 hash。
- `compiled_runtime_hash`：编译产物 hash。
- `recipe_hash`：单个 Recipe hash。
- `schema_hash`：输出结构 hash。

失效规则：

1. 任一必读 `docs/skills/agents/templates/wordlists` 变化，`source_hash` 改变。
2. `source_hash` 改变后，旧 `compiled_runtime_hash` 失效。
3. `compiled_runtime_hash` 失效后，旧 Recipe 不得直接执行，只能作为参考进入重新编译或动态规划。
4. 工程迁移后若 hash 文件缺失，先进入恢复扫描，再标记 `capability_status: needs_relock`。

---

## 5. Recipe 结构

Recipe 是受控 JSON DSL，不是任意脚本。

```json
{
  "recipe_id": "storyboard-semi-auto-v1",
  "task_type": "storyboard_package_generation",
  "input_schema": "schema-id",
  "output_schema": "schema-id",
  "required_context": {
    "project_state": true,
    "episode_context": true,
    "storyboard_context": true,
    "artifact_registry": true,
    "continuity_ledger": true
  },
  "steps": [
    {
      "step_id": "load_context",
      "runner": "context_builder",
      "inputs": [],
      "outputs": ["context_pack"]
    },
    {
      "step_id": "build_workflow",
      "runner": "workflow_builder",
      "inputs": ["context_pack"],
      "outputs": ["workflow_json"]
    },
    {
      "step_id": "review_gate",
      "runner": "phase_gate",
      "inputs": ["workflow_json"],
      "outputs": ["review_result"]
    }
  ]
}
```

安全边界：

- Recipe 不允许直接写任意绝对路径。
- Recipe 写文件必须经 Artifact Registry Writer。
- Recipe 只能调用白名单 runner。
- Recipe 不保存完整 API Key。

---

## 6. Context Builder 输入

AI / 大模型 Planner 输入必须包含：

- 当前 `project-state.json`。
- 当前生产模式。
- 当前 Phase。
- 活动集数与故事板。
- 能力包 manifest。
- 必读方法论文档摘要。
- 可用模板与输出 Schema。
- 产物索引与相对路径。
- 连续性账本。
- 审核打回记录。
- 目标平台限制。

输出必须是结构化 JSON，禁止只输出自然语言。

---

## 7. Workflow JSON Builder

Builder 输出当前无限画布可导入的 `mjb-workflow-v1`：

```json
{
  "schema": "mjb-workflow-v1",
  "version": "1.0.0",
  "meta": {},
  "canvas": {
    "nodes": [],
    "conns": [],
    "view": {},
    "next": 1,
    "muted": []
  }
}
```

约束：

- 节点 `type` 必须存在于当前 `NODE_DEFS`。
- MVP 若未新增 `sv*` 节点，应使用现有节点，并把业务语义写入 `meta` 与节点 `values`。
- 每个 workflow 必须登记到 `.smart-vision/workflow-registry.json`。
- 每个产物必须登记到 `.smart-vision/artifact-registry.json`。

---

## 8. 与工程记忆的写回关系

Runtime 每完成一个关键步骤，必须写回：

1. `progress-ledger.json`：任务状态。
2. `artifact-registry.json`：产物路径和版本。
3. `workflow-registry.json`：workflow 路径和执行状态。
4. `review-ledger.json`：审核结果。
5. `continuity-ledger.json`：承接锚点。
6. `recovery-checkpoint.json`：可恢复检查点。

写回失败时，任务不得标记完成。
