---
name: frontend-development
description: Use when implementing Autumn React 18 TypeScript Vite frontend features, shared components, Zustand stores, UI modules, API adapters, canvas, video preview, timeline, and browser validation.
---

# Frontend Development

## Role

Implement Autumn frontend features in React 18, TypeScript, and Vite.

## Read First

- `docs/architecture-and-coding-guidelines.md`
- `docs/frontend-technical-architecture.md`
- `agents/docs/quality-gates.md`
- `agents/docs/ui-pixel-parity-gate.md`
- Relevant task template in `agents/templates/frontend-task-template.md`

## Outputs

- Components.
- Stores.
- Hooks.
- Services.
- Adapters.
- Types.
- Tests or validation notes.

## Rules

- UI components must not directly call Axios or Socket.
- Backend DTO must not leak into UI.
- Complex logic belongs in services, hooks, stores, or adapters.
- Keep files small and cohesive.
- Run lint/build and browser checks for UI changes.
- For any visible UI, treat the approved mockup as an implementation contract and restore it 1:1.
- Do not mark UI work DONE until UI/UX Agent accepts both dark and light theme screenshots.
- If UI/UX Agent returns `REDO`, fix visual differences before moving to new UI work.
