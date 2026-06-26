---
name: smart-vision-capability-pack-local-first-revision
overview: 重构智能视界落地方案：将 GPT 表述统一升级为 AI/大模型，补充平台交付物工程目录、客户端记忆、工程状态记忆、跨设备迁移恢复与故事板/单集连续性状态承接设计。
todos:
  - id: audit-old-plan
    content: 使用 [subagent:code-explorer] 核对旧 GPT 和重后端残留
    status: completed
  - id: rewrite-ai-terms
    content: 统一将泛称 GPT 改为 AI / 大模型
    status: completed
    dependencies:
      - audit-old-plan
  - id: design-project-memory
    content: 补充工程交付目录和可迁移记忆系统
    status: completed
    dependencies:
      - audit-old-plan
  - id: design-pack-runtime
    content: 补充能力包动态编排、编译执行和 Hybrid 模式
    status: completed
    dependencies:
      - design-project-memory
  - id: update-docs-and-plan
    content: 更新智能视界文档、模板和当前 Plan
    status: completed
    dependencies:
      - rewrite-ai-terms
      - design-pack-runtime
  - id: sync-pipeline-log
    content: 登记 Pipeline Sync 并完成整改验收
    status: completed
    dependencies:
      - update-docs-and-plan
---

## User Requirements

用户要求对当前“智能视界”落地方案继续整改，重点修正两类问题：

1. 将所有泛称“GPT”的表述改为“AI / 大模型”，因为平台大脑不应绑定 GPT，后续也可能接入其他模型；只有在列举可选模型时，才保留 GPT-5.5 作为模型供应商之一。
2. 补充平台创作后输出交付物的工程目录规划，并设计客户端记忆与工程记忆系统，保证客户端退出、会话结束、更换客户端、迁移工程目录到另一台电脑后，仍能恢复创作进度和上下文。

## Product Overview

智能视界应被修正为“AI 大模型驱动的本地优先能力包创作工作台”。它通过能力包承载方法论、模板、Agent、Skill、项目文件和人工审核反馈，由 AI 大模型负责任务创建和编排，并通过工程目录保存所有创作交付物、项目状态、故事板进度、连续性记录和恢复检查点。

## Core Features

- “GPT”泛称统一整改为“AI / 大模型”
- 能力包驱动的动态编排、编译执行和混合运行模式
- 平台输出交付物工程目录标准
- 客户端记忆：记录最近工作区、界面状态、未同步编辑、当前活动任务
- 工程记忆：记录项目阶段、集数进度、故事板状态、审核状态、产物版本和上下文承接
- 跨终端迁移恢复：移动工程目录后仍可恢复项目进度和下一步任务
- 连续性保障：记录每集、每个故事板之间的承接锚点、资产引用、审核结论和返工历史

## Tech Stack Selection

### 已确认现有基础

- 项目根目录：`/Users/billy/Documents/AI_pro/漫剧创作库`
- 当前智能视界规划文件：
- `docs/smart-vision-architecture.md`
- `docs/smart-vision-canvas-node-plan.md`
- `docs/smart-vision-implementation-roadmap.md`
- 当前文件化记忆总规范：
- `docs/project-memory-system.md`
- 当前 Pipeline Sync 记录：
- `docs/pipeline-sync-log.md`
- 当前 Plan 文件：
- `/Users/billy/Library/Application Support/CodeBuddy CN/User/globalStorage/tencent-cloud.coding-copilot/plans/535110b8bee04307afb7802bcc2c0cd9/plan.md`

### 技术方向修正

- 第一版继续采用 Local-first 本地优先架构。
- 大模型表述统一为 AI / 大模型；GPT-5.5 仅作为可选模型供应商之一。
- 不把重型云端后端、Redis、RQ/Celery、PostgreSQL 作为第一版核心依赖。
- 以能力包 Runtime、工程目录记忆、Workflow JSON Builder 和本地桥接层作为第一版核心。
- 状态保存优先使用工程目录内 JSON / Markdown 文件，确保可迁移、可恢复、可审计。
- 客户端本地状态只保存 UI、最近打开项目、临时会话信息；工程状态必须写入工程目录，不依赖单个客户端。

## Implementation Approach

本次整改不直接开发完整软件，而是先修正智能视界架构规划、落地路线图和当前 Plan，使后续实施从“重后端任务调度系统”转为“AI 大模型 + 能力包 + 本地工程记忆”的可迁移工作台方案。

核心策略：

1. 统一术语：把“GPT 编排大脑”改为“AI / 大模型编排大脑”。
2. 增补能力包架构：支持动态编排、编译执行、Hybrid 三种模式。
3. 增补工程交付目录：平台输出物、工作流、审核、日志、索引、状态快照全部落到工程目录。
4. 增补记忆系统：区分客户端记忆与工程记忆，工程记忆作为最高恢复依据。
5. 增补恢复机制：打开工程后读取 `.smart-vision/`，校验能力包 hash、编译产物 hash、产物索引和连续性账本，再恢复到下一步可执行任务。

## Implementation Notes

- 现有 `docs/project-memory-system.md` 已明确“项目文件化记忆是最高权威”，整改方案应继承该原则，不另建平行记忆体系。
- `docs/smart-vision-architecture.md` 当前第 4、14、62、63 行附近仍含 GPT 绑定表述，需要改为 AI / 大模型。
- `docs/smart-vision-implementation-roadmap.md` 当前仍含 FastAPI、SQLite、GPT-5.5 等旧路线表述，需要降级为可选增强或后续阶段。
- 新增工程记忆目录必须放在项目工程内，例如 `.smart-vision/`，不能只存客户端缓存。
- 产物索引应使用相对路径，避免迁移到另一台电脑后路径失效。
- 工程恢复时必须允许“索引缺失但文件存在”的情况，通过扫描器重建索引并标记不确定项。
- 能力包变化后必须使旧编译执行器失效，避免用旧流程执行新方法论。
- 不在工程记忆中保存完整 API Key；只保存模型配置引用名和 provider 标识。

## Architecture Design

### 修正后的核心架构

```text
智能视界客户端
→ 客户端记忆层
→ 工程目录记忆层
→ 能力包 Runtime
→ AI / 大模型编排大脑
→ Workflow JSON Builder
→ 无限画布执行器
→ 交付物入库与审核反馈
→ 工程记忆更新
```

### 运行模式

1. Dynamic Planning Mode  
每次按能力包、项目上下文和当前任务动态请求 AI / 大模型规划任务。

2. Compiled Executor Mode  
首次加载能力包时，由 AI / 大模型生成受控流程配置 / JSON DSL / Recipe；能力包未变化时复用编译产物。

3. Hybrid Mode  
默认模式。能力包 hash 未变且任务命中 recipe 时走编译执行；任务超出 recipe 或能力包变化时回到动态编排，并可沉淀为新 recipe。

### 客户端记忆与工程记忆边界

客户端记忆：

- 最近打开的工程目录
- 当前 UI 布局、筛选条件、展开面板
- 当前活动项目、集数、故事板引用
- 未同步编辑提醒
- 模型供应商选择引用
- 临时运行状态

工程记忆：

- 当前项目 Phase
- 每集进度
- 每个故事板状态
- 产物版本与路径
- 工作流 JSON 状态
- 审核通过、打回、返工记录
- 能力包 hash
- 编译 Runtime hash
- 连续性账本
- 恢复检查点
- 迁移交接报告

### 恢复流程

```text
打开工程目录
→ 读取 .smart-vision/project-state.json
→ 校验 capability pack hash
→ 校验 compiled runtime hash
→ 读取 artifact / workflow / review / continuity ledgers
→ 恢复当前 Phase、集数、故事板和下一步任务
→ 扫描缺失或不一致的索引
→ 生成 recovery report
→ 用户确认后继续创作
```

## Directory Structure

## Directory Structure Summary

本次整改主要修改智能视界规划文档、当前计划文件和项目记忆规范，并新增智能视界工程目录与记忆系统规范文档。软件实现阶段再创建实际 Runtime 代码。

```text
漫剧创作库/
├── docs/
│   ├── smart-vision-architecture.md
│   │   # [MODIFY] 修正 GPT 绑定表述为 AI / 大模型；加入能力包驱动、本地优先、工程记忆、迁移恢复和三运行模式。
│   ├── smart-vision-implementation-roadmap.md
│   │   # [MODIFY] 移除第一版重后端路线；改为能力包 Runtime、工程记忆、Workflow Builder、恢复机制优先。
│   ├── smart-vision-project-workspace-standard.md
│   │   # [NEW] 定义智能视界平台输出交付物工程目录、.smart-vision 状态目录、产物索引、审核账本和恢复检查点。
│   ├── smart-vision-capability-pack-runtime.md
│   │   # [NEW] 定义能力包源码、编译产物、动态编排、编译执行、Hybrid 模式和 hash 失效策略。
│   ├── project-memory-system.md
│   │   # [MODIFY] 补充智能视界工程记忆与客户端记忆边界，强调工程目录迁移后的恢复规则。
│   └── pipeline-sync-log.md
│       # [MODIFY] 登记本次智能视界架构整改、术语修正、工程记忆和能力包运行模式变更。
├── templates/
│   └── _shared/
│       └── smart-vision/
│           ├── project-state-template.json
│           │   # [NEW] 工程状态模板，记录 Phase、集数、故事板、下一步任务和阻塞点。
│           ├── artifact-registry-template.json
│           │   # [NEW] 产物索引模板，记录源任务、版本、模型、工作流、审核状态和相对路径。
│           ├── continuity-ledger-template.json
│           │   # [NEW] 连续性账本模板，记录集间、板间承接锚点、资产引用和剧情状态。
│           └── recovery-checkpoint-template.json
│               # [NEW] 恢复检查点模板，支持客户端退出、迁移工程、索引重建和恢复报告。
├── capability-packs/
│   └── manga-drama-production/
│       └── pack.json
│           # [NEW-LATER] 第一版能力包入口示例，后续将 docs、agents、skills、templates、wordlists 包装为可加载能力包。
├── .capability-cache/
│   └── <pack-id>/<version_hash>/
│       # [NEW-LATER] 能力包编译缓存目录，保存 compiled-pack、recipes、gate rules、template map 和 compile report。
└── /Users/billy/Library/Application Support/CodeBuddy CN/User/globalStorage/tencent-cloud.coding-copilot/plans/535110b8bee04307afb7802bcc2c0cd9/plan.md
    # [MODIFY] 将当前旧 Plan 改写为 AI / 大模型、能力包、本地优先、工程记忆和可迁移恢复方案。
```

### 建议工程交付目录标准

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
├── 04-storyboards/
├── 05-workflows/
├── 06-generated/
├── 07-review/
├── 08-edit/
├── 09-publish/
└── 10-history/
```

## Key Code Structures

```
{
  "project_id": "string",
  "project_name": "string",
  "current_phase": "string",
  "active_episode_id": "string",
  "active_storyboard_id": "string",
  "next_action": "string",
  "blocked_by": [],
  "capability_pack": {
    "pack_id": "string",
    "version": "string",
    "source_hash": "string",
    "compiled_runtime_hash": "string"
  },
  "updated_at": "string"
}
```

```
{
  "artifact_id": "string",
  "artifact_type": "asset_image | director_storyboard | workflow_json | video | edit | qa_report",
  "relative_path": "string",
  "source_episode_id": "string",
  "source_storyboard_id": "string",
  "workflow_id": "string",
  "model_provider": "string",
  "model_name": "string",
  "version": "string",
  "review_status": "pending | approved | rejected | revision_required"
}
```

```
{
  "episode_id": "string",
  "storyboard_id": "string",
  "carryover_from": "string",
  "carryover_to": "string",
  "character_state": [],
  "asset_state": [],
  "location_state": [],
  "plot_state": [],
  "camera_continuity": [],
  "review_notes": []
}
```

## Agent Extensions

### SubAgent

- **code-explorer**
- Purpose: 深入核对智能视界相关文档、当前无限画布、项目记忆规范、模板目录和现有计划文件中的旧表述与可复用结构。
- Expected outcome: 确认所有需要整改的文件路径、旧 GPT 表述、重后端残留、工程记忆接入点和 Pipeline Sync 闭环范围。