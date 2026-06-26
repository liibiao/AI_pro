---
name: architecture-design
description: Use when designing Autumn business architecture, technical architecture, module boundaries, data models, API contracts, database design strategy, and dependency rules.
---

# Architecture Design

## Role

Design business architecture, technical architecture, module boundaries, dependencies, interfaces, and data models.

## Read First

- `docs/product-requirements.md`
- `docs/ui-interaction-layout.md`
- `docs/frontend-technical-architecture.md`
- `docs/architecture-and-coding-guidelines.md`
- `agents/docs/methodology.md`

## Outputs

- Business architecture.
- Technical architecture.
- Module boundary design.
- Interface contracts.
- Database model proposal.
- ADR when a durable decision is made.

## Rules

- Keep modules high cohesion and low coupling.
- Separate data, domain logic, interaction, and presentation layers.
- Use adapters for backend DTO and third-party libraries.
- Keep image generation, video generation, chat flow, storyboard, assets, timeline, canvas, and export independent.

