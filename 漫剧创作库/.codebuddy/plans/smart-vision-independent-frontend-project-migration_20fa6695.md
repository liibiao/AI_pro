---
name: smart-vision-independent-frontend-project-migration
overview: 规划智能视界作为独立前端平台工程的目录结构，将智能视界平台开发文档归档到新工程，并完整迁移无限画布相关 UI、JS、后台服务与配置代码，同时保持原有无限画布逻辑、UI 和运行能力不被破坏。
todos:
  - id: audit-canvas-scope
    content: 使用 [subagent:code-explorer] 核对无限画布代码边界和依赖
    status: completed
  - id: create-smart-vision-project
    content: 创建 smart-vision 独立平台工程目录和分层 README
    status: completed
    dependencies:
      - audit-canvas-scope
  - id: archive-platform-docs
    content: 归档智能视界平台文档到 smart-vision/docs
    status: completed
    dependencies:
      - create-smart-vision-project
  - id: migrate-canvas-code
    content: 完整复制无限画布 UI、JS、服务和配置代码
    status: completed
    dependencies:
      - audit-canvas-scope
      - create-smart-vision-project
  - id: add-run-and-verify-docs
    content: 补充迁移启动脚本、迁移清单和验收检查表
    status: completed
    dependencies:
      - migrate-canvas-code
  - id: sync-project-memory
    content: 同步 workspace-status、MEMORY 和 Pipeline Sync 记录
    status: completed
    dependencies:
      - archive-platform-docs
      - migrate-canvas-code
  - id: validate-migration
    content: 检查路径、lints、关键词和迁移范围验收
    status: completed
    dependencies:
      - add-run-and-verify-docs
      - sync-project-memory
---

## User Requirements

用户要求重新调整“智能视界”工作方向：它不是继续散落在当前创作库 `docs/` 下的内部说明，而应作为一个独立的平台开发工程来规划和落地。

## Product Overview

智能视界需要形成一个独立、专业、可持续扩展的前端平台工程目录，用于承载平台开发文档、落地方案计划书、平台分层架构设计、功能规划、技术选型、工程记忆规范、能力包 Runtime 规划，以及后续能力对接所需的无限画布代码基础。

## Core Features

- 新建独立智能视界平台工程目录，作为后续前端平台开发主目录。
- 将现有智能视界相关 docs、计划书、架构设计、功能规划、技术选型、工程目录与记忆系统、能力包 Runtime 等文档归档到新工程内。
- 完整迁移无限画布相关代码到新工程，包括 UI 页面、JS 逻辑、后台服务层、配置层、启动入口和必要运行资源。
- 迁移只覆盖无限画布相关代码，不迁移其他无关自动生成、项目生产、提示词处理或 RunningHub 批处理代码。
- 迁移过程以完整复制和最小路径适配为原则，不重写原 UI 和逻辑，不破坏原无限画布能力。
- 迁移后需要保留原目录代码可运行，同时让新工程内的迁移版无限画布也具备可启动、可打开、可继续对接智能视界能力的基础。

## Tech Stack Selection

### 已确认现有基础

- 工作区根目录：`/Users/billy/Documents/AI_pro/漫剧创作库`
- 智能视界现有规划文档：
- `docs/smart-vision-architecture.md`
- `docs/smart-vision-implementation-roadmap.md`
- `docs/smart-vision-canvas-node-plan.md`
- `docs/smart-vision-project-workspace-standard.md`
- `docs/smart-vision-capability-pack-runtime.md`
- 智能视界状态模板：
- `templates/_shared/smart-vision/project-state-template.json`
- `templates/_shared/smart-vision/artifact-registry-template.json`
- `templates/_shared/smart-vision/continuity-ledger-template.json`
- `templates/_shared/smart-vision/recovery-checkpoint-template.json`
- 无限画布候选代码：
- `tools/workbench-web/`
- `tools/workbench_server.py`
- `tools/workbench_core.py`
- `tools/workbench_cli.py`
- `studio`

### 技术选择

- 新独立工程建议放置在仓库根目录：`smart-vision/`
- 第一阶段不重写无限画布，保留现有 HTML / JS / Python 服务形态，完整复制到新工程。
- 新工程按专业前端平台目录规划，预留后续 React + TypeScript 平台壳层，但当前迁移阶段不强制改造原 HTML 画布。
- 后台服务层继续沿用当前 Python 工作台服务代码副本，放入新工程 `services/workbench/`，只做路径适配和启动说明，不改业务逻辑。
- 配置层迁移 `model-registry.json`、`models/` 等无限画布依赖配置，避免运行时缺资源。
- 后续智能视界平台壳层可逐步引入 React / TypeScript / Vite，但本轮重点是独立工程目录、文档归档和无限画布完整迁移，不做 UI 重构。

## Implementation Approach

本次实施采用“新工程并行承载 + 原代码完整复制 + 最小适配 + 验证不破坏”的策略。

1. 先建立 `smart-vision/` 独立工程骨架，明确 `docs/`、`app/`、`canvas/`、`services/`、`runtime/`、`config/`、`scripts/`、`templates/` 等分层。
2. 将智能视界平台文档从当前根 `docs/` 复制或归档到 `smart-vision/docs/`，并按“计划书、架构、功能、技术、工程记忆、Runtime、画布接入”重新分组。
3. 将无限画布相关代码完整复制到 `smart-vision/canvas/legacy-workbench/` 与 `smart-vision/services/workbench/`，保持原文件结构和运行语义。
4. 只对新工程内必要路径、启动脚本、README 进行适配，避免改动原 `tools/` 和根 `studio` 的运行能力。
5. 通过文件清单、关键词扫描、导入路径检查和启动说明确认迁移范围准确。

### 关键决策

- **不直接移动原文件**：使用复制方式迁移，避免破坏现有工作台和 `#image` / `./studio image` 能力。
- **不重写无限画布**：用户要求保持原 UI、逻辑和能力，因此先完整迁移，后续再做接口化。
- **只迁移无限画布相关代码**：不迁移 `auto_generate_*`、`seedance_*`、`runninghub_client.py`、`prompt_*` 等非画布主链代码，除非探索确认它们被无限画布服务直接依赖。
- **新工程文档归档优先**：智能视界是平台开发工程，相关平台文档应进入 `smart-vision/docs/`，根 `docs/` 可保留索引或同步说明。

## Implementation Notes

- 迁移前必须用 `[subagent:code-explorer]` 深入核对无限画布依赖链，尤其是 `workbench_server.py` 是否引用其他 `tools/*.py` 文件。
- 原始路径中的文件不得删除、移动或重构。
- 若迁移后的 Python 服务存在相对路径依赖，应在新工程内补齐启动脚本或路径 shim，而不是修改原始业务逻辑。
- `gpt-image-2` 等具体模型名属于画布配置或生成模型配置，不能因“GPT 泛称整改”误删。
- 对象存储上传链路如被 `workbench_server.py` 直接依赖，应作为可选保留能力复制或标注，不应视为废弃。
- 验证重点是“能打开、资源能加载、节点定义不丢、workflow JSON 导入仍遵循 `NODE_DEFS` 过滤规则”。

## Architecture Design

```text
smart-vision/
→ docs/                  平台文档与落地方案
→ app/                   后续智能视界前端平台壳层预留
→ canvas/
  → legacy-workbench/    完整迁移的无限画布 UI 和 JS 逻辑
→ services/
  → workbench/           无限画布相关后台服务副本
→ config/                模型、节点、环境与运行配置
→ runtime/               能力包 Runtime、Workflow Builder 预留
→ templates/             .smart-vision 工程状态模板
→ scripts/               启动、验证、路径检查脚本
```

数据与调用关系：

```text
智能视界平台壳层
→ canvas/legacy-workbench 无限画布 UI
→ services/workbench 后台服务
→ config 模型与节点配置
→ runtime Workflow JSON Builder 预留接口
→ docs / templates 平台规范与工程状态模板
```

## Directory Structure

## Directory Structure Summary

本次实施新增一个独立智能视界平台工程目录 `smart-vision/`，并把平台文档与无限画布相关代码放入该工程。原始 `tools/` 和根 `studio` 保持不动。

```text
漫剧创作库/
├── smart-vision/
│   ├── README.md
│   │   # [NEW] 智能视界独立平台工程入口说明。说明工程定位、目录分层、无限画布迁移范围、启动方式和后续开发原则。
│   ├── docs/
│   │   ├── README.md
│   │   │   # [NEW] 平台文档索引。按计划书、架构、功能、技术、工程记忆、Runtime、画布接入分组链接文档。
│   │   ├── planning/
│   │   │   └── implementation-roadmap.md
│   │   │       # [NEW/COPY] 从 `docs/smart-vision-implementation-roadmap.md` 归档。作为智能视界项目落地方案计划书。
│   │   ├── architecture/
│   │   │   ├── platform-architecture.md
│   │   │   │   # [NEW/COPY] 从 `docs/smart-vision-architecture.md` 归档。作为平台分层架构设计文档。
│   │   │   └── capability-pack-runtime.md
│   │   │       # [NEW/COPY] 从 `docs/smart-vision-capability-pack-runtime.md` 归档。定义能力包 Runtime 和 Hybrid 运行模式。
│   │   ├── product/
│   │   │   ├── feature-plan.md
│   │   │   │   # [NEW] 功能规划文档。梳理项目看板、任务流、审核中心、画布入口、工程记忆等平台功能。
│   │   │   └── workspace-standard.md
│   │   │       # [NEW/COPY] 从 `docs/smart-vision-project-workspace-standard.md` 归档。定义平台工程目录和记忆系统。
│   │   ├── technical/
│   │   │   ├── tech-stack.md
│   │   │   │   # [NEW] 技术选型文档。说明第一阶段保留 HTML/JS/Python 画布，后续平台壳层可演进 React/TypeScript。
│   │   │   └── canvas-integration.md
│   │   │       # [NEW/COPY] 从 `docs/smart-vision-canvas-node-plan.md` 归档。记录无限画布节点、Workflow JSON 和接入规则。
│   │   └── migration/
│   │       ├── infinite-canvas-migration-map.md
│   │       │   # [NEW] 无限画布迁移清单。记录源路径、目标路径、迁移原因、依赖关系和验证状态。
│   │       └── verification-checklist.md
│   │           # [NEW] 迁移验收清单。验证 UI、JS、服务、配置、模型 registry、workflow 导入导出。
│   ├── app/
│   │   └── README.md
│   │       # [NEW] 后续智能视界前端平台壳层预留说明。当前不重写无限画布。
│   ├── canvas/
│   │   └── legacy-workbench/
│   │       ├── workbench-web/
│   │       │   # [NEW/COPY] 从 `tools/workbench-web/` 完整复制。包含无限画布 UI 页面、JS 引擎、模型配置和静态资源。
│   │       └── README.md
│   │           # [NEW] 说明该目录是原无限画布完整迁移副本，禁止在迁移阶段重写 UI 和逻辑。
│   ├── services/
│   │   └── workbench/
│   │       ├── workbench_server.py
│   │       │   # [NEW/COPY] 从 `tools/workbench_server.py` 复制。无限画布相关后台服务层。
│   │       ├── workbench_core.py
│   │       │   # [NEW/COPY] 从 `tools/workbench_core.py` 复制。工作台核心逻辑层。
│   │       ├── workbench_cli.py
│   │       │   # [NEW/COPY] 从 `tools/workbench_cli.py` 复制。工作台 CLI/启动入口。
│   │       └── README.md
│   │           # [NEW] 说明服务层来源、运行方式、依赖边界和禁止迁移无关生产脚本的规则。
│   ├── config/
│   │   ├── model-registry.json
│   │   │   # [NEW/COPY] 从 `tools/workbench-web/model-registry.json` 复制或引用。保证画布模型配置可加载。
│   │   └── README.md
│   │       # [NEW] 配置层说明，后续承接节点、模型、环境变量和 provider 引用。
│   ├── runtime/
│   │   └── README.md
│   │       # [NEW] 能力包 Runtime、Workflow JSON Builder、工程记忆读写接口预留说明。
│   ├── templates/
│   │   └── smart-vision/
│   │       # [NEW/COPY] 从 `templates/_shared/smart-vision/` 复制工程状态模板。
│   └── scripts/
│       ├── README.md
│       │   # [NEW] 迁移版启动、检查和验证脚本说明。
│       └── run-legacy-workbench.sh
│           # [NEW] 新工程内启动迁移版无限画布的便捷脚本，需保持最小适配。
├── docs/
│   ├── smart-vision-architecture.md
│   │   # [MODIFY-LIGHT] 保留为创作库侧索引或同步说明，指向 `smart-vision/docs/architecture/platform-architecture.md`。
│   ├── smart-vision-implementation-roadmap.md
│   │   # [MODIFY-LIGHT] 保留为创作库侧索引或同步说明，指向新工程计划书。
│   ├── smart-vision-canvas-node-plan.md
│   │   # [MODIFY-LIGHT] 保留为创作库侧索引或同步说明，指向新工程画布接入文档。
│   ├── workspace-status.md
│   │   # [MODIFY] 更新智能视界独立工程目录和迁移状态。
│   └── pipeline-sync-log.md
│       # [MODIFY] 登记本次智能视界独立工程与无限画布迁移 L3 闭环。
└── .workbuddy/memory/MEMORY.md
    # [MODIFY] 同步长期记忆：智能视界平台开发工程位于 `smart-vision/`，无限画布迁移副本不破坏原代码。
```

## Key Code Structures

本计划默认不新增复杂接口实现，只新增迁移清单、目录说明和启动脚本。若实施时发现需要路径适配，应优先使用启动脚本或环境变量，不直接改动原无限画布业务逻辑。

## Agent Extensions

### SubAgent

- **code-explorer**
- Purpose: 系统核对无限画布相关代码边界，包括 UI、JS、后台服务、配置、启动入口和直接依赖，避免误迁移无关工具。
- Expected outcome: 输出准确迁移清单、源路径到目标路径映射、必须复制文件、可选文件、禁止迁移文件和验证点。