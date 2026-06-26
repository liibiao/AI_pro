# AI 漫剧工业化工作流优化提案 — "精益制片"模式

> **由：** 资深导演 / 监制 / AI 影视专家  
> **至：** 项目组  
> **目标：** 简化 Agent 调度复杂度、降低 Token 消耗、提升 1-3 人小团队生产效率。

---

## 一、现状诊断 (Diagnosis)

目前工作区拥有 **16 个 Agent** 和 **28 个 Skill**，遵循严格的 **7 阶段 Phase Gate**。  
**导演视角：** 这是一套"大厂级"管线，适合 50 人以上的协作团队。但对于目前 1-3 人的小规模/个人工作室，存在严重的"协调税"：
1. **调度税**：每次切换 Agent 都需要重新读取 5-10 个文档，Token 浪费严重。
2. **交接税**：16 个角色之间的文件交接逻辑过于复杂，容易产生信息漂移。
3. **冗余度**：许多"检查类"和"索引类"角色（如 `script-standard-auditor`, `asset-librarian`, `context-loader`）其实可以被自动化 Skill 替代。

---

## 二、精益 Agent 体系 (Lean Agent Architecture)

建议将 16 个 Agent 压缩至 **7 个核心角色**，将"职能"转为"技能"。

| 核心 Agent | 包含角色 | 核心使命 | 自动化替代项 |
|-----------|---------|---------|-------------|
| **制片人 (Producer)** | master / operations / publisher | 调度、门禁、放行、发布、成本控制 | `phase-gate-skill` |
| **编剧 (Writer)** | scriptwriter / script-auditor | 故事、人物、剧本、合规 | `script-standard-skill` |
| **导演 (Director)** | director / art-director / continuity | 风格、美术、讲戏、视觉一致性 | `continuity-check-skill` |
| **分镜师 (Storyboard Artist)** | storyboard / storyboard-artist | 分镜拆解、镜头节拍、故事板生产包总装 | `storyboard-artist-skill` |
| **制片库 (Librarian)** | asset-librarian / context-loader | 资产索引、跨集记忆、故事板资产引用矩阵、状态同步 | `project-doctor-skill` |
| **生成工作室 (Studio)** | executor / prompt-lab / technical-dir | 生图执行、故事板图生成、模型适配实验 | `prompt-sync-skill` |
| **质检剪辑 (Reviewer)** | quality-control / editor | 剪辑、QA、最终版本发布 | `qa-automation-skill` |

---

## 三、Skill 补强建议 (Skill Reinforcement)

新增 3 个自动化 Skill，释放人力：

1. **`project-doctor-skill` (项目自诊)**: 
   - 自动扫描 `01-09` 目录，检测文件缺失、索引失效或状态冲突。
   - 替代 `asset-librarian` 的基础同步工作。
2. **`prompt-sync-skill` (提示词同步)**:
   - 将 `03-assets` 中的角色/场景参考图自动同步到 `05-prompts` 的 Seedance 脚本中。
   - 辅助 `Storyboard Artist` 完成资产标签的自动挂载，减少手动搬运的重复劳动。
3. **`phase-gate-skill` (门禁自动化)**:
   - 自动检查本阶段入口/出口准则（Checklist），输出通过率。
   - 替代 `quality-control` 对格式、数量的基础检查。

---

## 四、Token 成本控制策略 (Token Economy)

1. **统一状态快照 (State Snapshot)**: 
   - 废除让 Agent 读取 5 个 Log 文件的做法。
   - 建立 `project-status.json` (机器读) 和 `workspace-status.md` (人读) 唯一真实数据源。
2. **上下文裁剪 (Context Pruning)**:
   - 规定每个 Agent 启动时，只允许读取 `project.json` + `current-stage-manifest.md`。
3. **合并汇报**:
   - 鼓励 Agent 在完成任务时，一次性更新相关的所有文档，减少反复调用。

---

## 五、实施步骤 (Implementation)

1. **第一步**：合并 Agent 定义（修改 `agents/` 目录结构）。
2. **第二步**：更新 `docs/workflow.md` 为精益版。
3. **第三步**：开发 `project-doctor-skill`。
4. **第四步**：清理过期的冗余 Log，建立统一状态文件。

> **导演寄语：** 漫剧创作的灵魂在"表达"，而不是"管线"。我们要把 80% 的精力花在镜头和戏上，剩下的 20% 交给这套精简的管线自动跑通。
