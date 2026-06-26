# skill-onboard-skill — 新能力集成检查技能

## 用途
当系统新增/重大更新 Skill、方法论、规范、模板时，执行**轻量级链路闭环检查**，确保新能力被正确接入流水线全链路，避免"能力建了但没人用"的断链问题。

## 触发条件
- 新建 Skill / 方法论 / 规范 / 模板时
- 重大更新现有 Skill（新增整节方法论模块）时
- Chief-Editor 执行 P8 复盘中的"系统改进建议"时

## 输入
- 新增/更新的 Skill 文件路径

## 输出
- 集成检查报告（含需要更新的文件清单）

---

## 设计原则：极致省 Token

> 本技能的核心设计目标：**用最少的 Token 消耗完成最完整的链路闭环。**

| 省Token策略 | 做什么 | 节省 |
|------------|--------|------|
| **Header-only 扫描** | 只读目标 Skill 前20行（触发条件+用途），不读全文 | ~90% |
| **定向 Grep** | 用关键词搜索代替全文阅读（每次 grep ≈ 1行结果） | ~80% |
| **最小更新集** | 只改实际需要变更的文件，不做全局重写 | ~70% |
| **增量检查** | 只检查新 Skill 引用的上下游 Skill，不扫描全部25个 | ~60% |

---

## 集成检查五步法

### Step 1：提取集成元数据（读新 Skill 前20行）

只读取新 Skill 文件的 `用途` + `触发条件` + `与其他Skill的协作关系` 段，提取：

```
触发阶段：P0 / P1 / P2 / ... / P8（哪些阶段应该用这个能力？）
功能归属：这个能力属于哪个引擎？（叙事/角色/文笔/文风/结构/质量/商业/创作）
关联 Skill：上下游 Skill 名称列表
关联 Agent：应该由哪个 Agent 调用？
```

### Step 2：Agent 映射检查（1次 grep）

```
grep "新Skill名" docs/agent-protocol.md
```

| 结果 | 操作 |
|------|------|
| ✅ 已在某个 Agent 的 skill 列表中 | 无需操作 |
| ❌ 未被任何 Agent 引用 | 在 `agent-protocol.md` 对应 Agent 行中添加 |

**Agent归属判断规则**：

| 功能引擎 | 归属 Agent |
|---------|-----------|
| 叙事引擎（outline/hook/structure） | Story-Architect |
| 角色引擎（arc/voice） | Character-Director |
| 文笔引擎（scene/dialogue/description/pov/rhythm） | Draft-Writer + Editor |
| 文风引擎（xiaolangjun/xiaolongbai/baiteman/zhouzi/xiuxian） | Style-Master |
| 结构引擎（plot-loop） | Story-Architect |
| 质量引擎（line-edit/continuity/quality-control/phase-gate） | Editor + Reviewer |
| 商业引擎（market-research/topic-scoring/title-blurb/platform-adapt） | Market-Researcher + Packager |
| 创作引擎（book-dissection） | Market-Researcher |
| 跨Agent / 系统级 | Chief-Editor |

### Step 3：阶段触发检查（1次 grep）

```
grep "新Skill名" docs/workflow.md
```

| 结果 | 操作 |
|------|------|
| ✅ 已在对应阶段的"触发 Skill"列表中 | 无需操作 |
| ❌ 未被任何阶段引用 | 在 Step 1 确定的阶段中添加到"触发 Skill"列表 |

### Step 4：交叉引用检查（定向 N 次 grep）

对 Step 1 提取的每个关联 Skill，执行：

```
grep "新Skill名" skills/关联Skill.md
```

| 结果 | 操作 |
|------|------|
| ✅ 关联 Skill 已引用新 Skill | 无需操作 |
| ❌ 关联 Skill 未引用新 Skill | 在关联 Skill 的"与其他Skill的协作关系"表中补一行 |

**注意**：引用是双向的。A 引用 B ≠ B 引用 A。两端都要检查。

### Step 5：状态追踪更新（1次编辑）

更新 `docs/workspace-status.md`：
- Skills 表格：该 Skill 的描述是否包含新增能力关键词？
- 里程碑：是否记录本次更新？

---

## 输出格式

检查完成后，输出标准化报告：

```markdown
## 集成检查报告：{skill-name}

**变更类型**：新建 / 重大更新
**变更摘要**：一句话描述新增内容

### 检查结果

| # | 检查项 | 状态 | 需要操作 |
|---|--------|------|---------|
| 1 | Agent 映射 | ✅/❌ | —/更新 agent-protocol.md → {Agent} |
| 2 | 阶段触发 | ✅/❌ | —/更新 workflow.md → P{N} |
| 3 | 交叉引用（→ {Skill-A}） | ✅/❌ | —/更新 {Skill-A}.md 协作关系 |
| 4 | 交叉引用（→ {Skill-B}） | ✅/❌ | —/更新 {Skill-B}.md 协作关系 |
| 5 | 状态追踪 | ✅/❌ | —/更新 workspace-status.md |

### 需要执行的更新（按顺序）
1. [ ] ...
2. [ ] ...
```

---

## 集成检查自检

- [ ] 所有 ❌ 项是否已修复？
- [ ] 新 Skill 的触发条件是否精确到具体阶段编号？
- [ ] 交叉引用是否双向？（A→B 且 B→A）
- [ ] Agent 归属是否正确？（参考归属判断规则表）
- [ ] workspace-status.md 是否已更新？

---

## 与其他 Skill 的协作关系

| Skill | 协作方式 |
|-------|---------|
| 所有 Skill | 本技能是"集成守护者"，确保每个 Skill 都被正确接入 |
| `phase-gate-skill` | 如果新 Skill 涉及质量检查维度，需在门禁清单中体现 |
| `quality-control-skill` | 如果新 Skill 改变了质量评估标准，需同步更新 |
| `master-methodology` | 如果新 Skill 是方法论级别的，需在总纲索引中添加 |
