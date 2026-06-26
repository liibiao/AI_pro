---
name: autumn-software-engineer
description: Use when developing the Autumn React/Vite frontend project, especially for turning docs into tasks, enforcing architecture boundaries, implementing modules, updating progress logs, maintaining project memory, and validating features.
---

# Autumn Software Engineer

Use this skill for Autumn project development work.

## Required Context

Before coding, read in this order:

1. `docs/agent-system/memory/project-memory.md`
2. `docs/agent-system/memory/decision-log.md`
3. `docs/agent-system/progress-tracker.md`
4. The relevant source document:
   - PRD: `docs/product-requirements.md`
   - UI layout: `docs/ui-interaction-layout.md`
   - Technical architecture: `docs/frontend-technical-architecture.md`
   - Coding rules: `docs/architecture-and-coding-guidelines.md`
   - Task backlog: `docs/agent-system/task-backlog.md`

## Core Workflow

1. Identify the task ID or create one in `task-backlog.md`.
2. Mark the task `IN_PROGRESS` in `progress-tracker.md`.
3. Classify the work into data layer, domain logic layer, interaction layer, or presentation layer.
4. Implement in the correct module. Keep files small and cohesive.
5. Validate with lint/build/tests/browser checks as applicable.
6. Update `development-log.md`.
7. Update memory if the change creates long-lived knowledge or decisions.
8. Mark the task `DONE`, `REVIEW`, or `BLOCKED`.

## Architecture Rules

- Keep high cohesion and low coupling.
- Do not put all business logic into one component, one class, one store, or one service.
- Keep data layer, domain logic layer, interaction layer, and presentation layer separate.
- UI components must not directly call Axios, Socket, or backend DTOs.
- Third-party libraries must be wrapped by adapters.
- Complex AI flows must be handled by `services/orchestration`.
- Split video generation, image generation, chat flow, storyboard, canvas, timeline, assets, and export into independent modules.

## Module Boundaries

- `api/`: HTTP, Socket, uploads, downloads.
- `services/`: business rules, payload builders, orchestration.
- `store/`: Zustand state and actions.
- `hooks/`: interaction logic.
- `components/`: reusable UI library.
- `business-components/`: feature UI.
- `adapters/`: backend DTO and third-party library adapters.
- `types/`: DTO and domain models.
- `utils/`: pure reusable helpers.

## Completion Checklist

A task is complete only when:

- The implementation matches the relevant docs.
- Module boundaries are respected.
- TypeScript types are explicit.
- Empty, loading, error, and disabled states are covered when relevant.
- Lint/build/tests/browser checks pass where applicable.
- `progress-tracker.md` and `development-log.md` are updated.
- Long-lived decisions are recorded in `memory/decision-log.md`.

## More Detail

For the full workflow, see `references/workflow.md`.

