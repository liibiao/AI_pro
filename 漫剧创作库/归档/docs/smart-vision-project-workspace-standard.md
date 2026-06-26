# 智能视界工程目录与可迁移记忆系统规范

> 本规范定义智能视界平台创作后的工程交付目录、客户端记忆与工程记忆边界、跨会话恢复、跨客户端恢复和跨电脑迁移恢复规则。工程目录内文件是最高恢复依据，客户端缓存只作辅助入口。

---

## 1. 核心原则

1. **Local-first**：第一版优先写入本地工程目录，不依赖单一客户端、数据库或云端服务。
2. **工程记忆优先**：项目进度、产物索引、审核状态、连续性账本和恢复检查点必须保存在工程目录内。
3. **客户端记忆只做影子状态**：客户端只保存最近工程、界面布局、临时选择和未同步提醒，不承担项目真实状态。
4. **相对路径优先**：所有工程内索引必须优先使用相对路径，保证工程移动到另一台电脑后仍可恢复。
5. **可扫描重建**：索引缺失但文件存在时，恢复器必须扫描工程目录重建索引，并将不确定项标记为 `needs_review`。
6. **能力包可追溯**：工程必须记录能力包 source hash 与 compiled runtime hash，能力包变化后旧执行器必须失效。
7. **不保存完整密钥**：工程记忆只保存 provider 标识、模型配置引用名和运行摘要，不保存完整 API Key。

---

## 2. 标准工程目录

```text
Smart Vision Project Workspace/
├── .smart-vision/
│   ├── project-state.json
│   ├── client-session-shadow.json
│   ├── progress-ledger.json
│   ├── continuity-ledger.json
│   ├── artifact-registry.json
│   ├── workflow-registry.json
│   ├── review-ledger.json
│   ├── capability-lock.json
│   ├── recovery-checkpoint.json
│   └── handoff-report.md
├── 00-intake/
├── 01-capability-context/
├── 02-planning/
├── 03-assets/
│   ├── characters/
│   ├── scenes/
│   ├── props/
│   └── references/
├── 04-storyboards/
│   ├── ep001/
│   │   ├── boards/
│   │   ├── director-boards/
│   │   ├── continuity-cards/
│   │   └── reference-matrix/
├── 05-workflows/
│   ├── ep001/
│   └── templates/
├── 06-generated/
│   ├── images/
│   ├── videos/
│   └── audio/
├── 07-review/
│   ├── qa-reports/
│   └── revision-notes/
├── 08-edit/
├── 09-publish/
└── 10-history/
```

---

## 3. `.smart-vision/` 状态文件职责

| 文件 | 职责 | 恢复优先级 |
|---|---|---|
| `project-state.json` | 当前 Phase、活动集数、活动故事板、下一步任务、阻塞点 | P0 |
| `progress-ledger.json` | 每集、每个故事板、每条流程的状态流水 | P0 |
| `continuity-ledger.json` | 集间 / 板间承接锚点、角色 / 场景 / 道具 / 镜头连续性 | P0 |
| `artifact-registry.json` | 所有交付物相对路径、版本、来源任务、审核状态 | P0 |
| `workflow-registry.json` | 画布 JSON、节点版本、执行状态、可重开路径 | P1 |
| `review-ledger.json` | 审核、打回、局部返工、备注、责任人 | P1 |
| `capability-lock.json` | 能力包 id、版本、source hash、compiled runtime hash | P0 |
| `recovery-checkpoint.json` | 最近可恢复点、扫描报告、迁移状态 | P0 |
| `client-session-shadow.json` | 最近打开视图、筛选条件、临时任务指针 | P2 |
| `handoff-report.md` | 人工可读交接报告 | P1 |

---

## 4. 客户端记忆边界

客户端可保存：

- 最近打开的工程目录。
- UI 布局、筛选条件、展开面板。
- 当前活动项目、集数、故事板引用。
- 未同步编辑提醒。
- 模型供应商选择引用。
- 临时运行状态。

客户端不得作为唯一真实源保存：

- 项目 Phase。
- 每集 / 每板进度。
- 审核结论。
- 产物版本。
- 连续性锚点。
- 能力包 hash。
- 恢复检查点。

若客户端状态与工程记忆冲突，以工程记忆为准，并提示用户是否丢弃客户端影子状态。

---

## 5. 工程记忆最小字段

### 5.1 `project-state.json`

```json
{
  "project_id": "string",
  "project_name": "string",
  "current_phase": "intake | planning | assets | storyboard | workflow | generation | review | edit | publish | finished",
  "active_episode_id": "ep001",
  "active_storyboard_id": "board-001",
  "next_action": "string",
  "blocked_by": [],
  "capability_pack": {
    "pack_id": "string",
    "version": "string",
    "source_hash": "string",
    "compiled_runtime_hash": "string"
  },
  "updated_at": "ISO-8601"
}
```

### 5.2 `artifact-registry.json`

```json
{
  "artifacts": [
    {
      "artifact_id": "string",
      "artifact_type": "asset_image | director_storyboard | workflow_json | video | edit | qa_report",
      "relative_path": "string",
      "source_episode_id": "ep001",
      "source_storyboard_id": "board-001",
      "workflow_id": "string",
      "model_provider": "string",
      "model_name": "string",
      "version": "v001",
      "review_status": "pending | approved | rejected | revision_required | needs_review",
      "created_at": "ISO-8601"
    }
  ]
}
```

### 5.3 `continuity-ledger.json`

```json
{
  "entries": [
    {
      "episode_id": "ep001",
      "storyboard_id": "board-001",
      "carryover_from": "string",
      "carryover_to": "string",
      "character_state": [],
      "asset_state": [],
      "location_state": [],
      "plot_state": [],
      "camera_continuity": [],
      "review_notes": []
    }
  ]
}
```

---

## 6. 恢复流程

```text
打开工程目录
→ 读取 .smart-vision/project-state.json
→ 校验 capability-lock.json
→ 校验 compiled runtime hash
→ 读取 artifact / workflow / review / continuity ledgers
→ 恢复当前 Phase、集数、故事板和下一步任务
→ 扫描缺失或不一致的索引
→ 生成 recovery-checkpoint.json 与 handoff-report.md
→ 用户确认后继续创作
```

恢复器必须处理三种情况：

1. **完整恢复**：状态文件、产物索引和真实文件一致，直接恢复。
2. **索引重建**：真实文件存在但索引缺失，扫描目录重建并标记 `needs_review`。
3. **能力包变更**：source hash 或 compiled runtime hash 不一致，旧 recipe 失效，回到 AI / 大模型动态规划或重新编译。

---

## 7. 连续性保障

工程记忆必须记录：

- 每集结尾状态与下一集开场承接。
- 每个故事板的起始状态、结束状态、承接对象。
- 角色伤痕、服装、武器、能量状态、表情状态。
- 场景破坏、道具位置、群众状态、天气光线。
- 镜头方向、轴线关系、上一板落幅与下一板起幅。
- 审核打回原因与修复结论。

能力包方法论负责“如何保持创作一致性”，工程记忆负责“当前一致性已经确认到哪里”。

---

## 8. 迁移交接规则

工程目录迁移到另一台电脑前，建议生成 `handoff-report.md`，至少包含：

- 当前项目 Phase。
- 当前活动集数与故事板。
- 最近通过审核的产物。
- 当前阻塞点。
- 能力包版本与 hash。
- 缺失文件或待确认项。
- 下一步推荐任务。

迁移后首次打开工程必须运行恢复检查，不得直接按客户端旧缓存继续执行。
