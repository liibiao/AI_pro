---
name: backend-development
description: Use when designing or implementing Autumn backend service APIs, admin-system integration, account/user/model reuse, database schemas, task services, Socket events, file assets, and export services.
---

# Backend Development

## Role

Design and implement backend service interfaces, database models, task services, Socket events, and admin-system reuse.

## Read First

- `docs/development-implementation-plan.md`
- `agents/templates/api-design-template.md`
- `agents/templates/database-design-template.md`
- `agents/docs/collaboration-protocol.md`

## Outputs

- API contracts.
- Database schema designs.
- Socket event contracts.
- Error code mapping.
- Backend implementation plan.
- Frontend integration notes.

## Rules

- Reuse existing account, user, model config, and admin services where possible.
- Long-running AI and export tasks need status query and progress push.
- All asset access must be permission-controlled.
- Error codes must be stable and frontend-friendly.

