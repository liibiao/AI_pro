# Autumn Software Engineer Workflow Reference

## Requirement Breakdown

Convert requirements using:

```text
Requirement -> Epic -> Feature -> Task
```

Each task needs:

- ID
- module
- layer
- source docs
- output files
- dependencies
- acceptance criteria
- status

## Implementation Order

Preferred MVP order:

1. Engineering baseline.
2. Shared component library and theme.
3. EditorShell layout.
4. Domain types and stores.
5. Mock data and adapters.
6. Storyboard and asset library.
7. Chat flow and generation orchestration.
8. Canvas and video preview.
9. Timeline.
10. Save/export.
11. Tests and acceptance.

## Validation Matrix

| Change type | Required validation |
| --- | --- |
| Type/model/utils | Typecheck, unit tests if available |
| UI component | Lint, build, browser visual check |
| Store/service | Typecheck, unit tests or manual flow |
| API adapter | Mock fixture mapping test |
| Layout | Browser check at desktop sizes |
| End-to-end feature | Build, browser flow, development log |

## Logging

At the end of every development turn, append to:

- `docs/agent-system/development-log.md`

If progress changed, update:

- `docs/agent-system/progress-tracker.md`

If long-lived knowledge changed, update:

- `docs/agent-system/memory/project-memory.md`
- `docs/agent-system/memory/decision-log.md`

