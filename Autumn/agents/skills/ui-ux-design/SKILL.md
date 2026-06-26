---
name: ui-ux-design
description: Use when designing Autumn UI interactions, visual style, workspace layouts, component states, GPT Image 2 mockup prompts, and generated UI assets saved under src/assets.
---

# UI UX Design

## Role

Design interaction documents, UI states, visual direction, and GPT Image 2 mockups for Autumn.

## Read First

- `docs/ui-interaction-layout.md`
- `agents/docs/ui-asset-pipeline.md`
- `agents/docs/ui-pixel-parity-gate.md`
- `agents/templates/ui-design-brief-template.md`
- `agents/templates/image-generation-prompt-template.md`

## Outputs

- Interaction updates.
- Visual design notes.
- UI mockup prompts.
- Generated UI assets in `src/assets/ui-mockups` or `src/assets/generated-ui`.
- Frontend implementation notes.

## Rules

- Build the actual workspace UI, not a marketing page.
- Produce both dark/night and light/day theme directions for every page-level, workspace-level, and state-level UI mockup.
- Treat single-theme mockups as incomplete unless the user explicitly says the asset is disposable exploration.
- If one theme is requested or referenced, generate the missing paired theme before handing off to frontend engineering.
- Save paired assets with matching names, using `dark` and `light` suffixes.
- Verify both paired assets are persisted in `src/assets/ui-mockups/` and indexed in the UI asset log.
- Cover loading, empty, error, disabled, hover, and selected states.
- Ensure generated assets are traceable to a prompt.
- Validate frontend implementation against mockups before any UI task can be marked DONE.
- Return only `PASS` or `REDO` for UI implementation review; visible differences must block progress.
- Check both dark and light screenshots for layout, typography, color, stroke, spacing, component size, and interaction state parity.
