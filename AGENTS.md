# AGENTS.md — Consolidate to PDF

This file defines project-specific guidance for contributors and coding agents.

## Project identity

- Plugin ID: `consolidate-to-pdf`
- Plugin name: `Consolidate to PDF`
- Platform target: Obsidian desktop (`isDesktopOnly: true`)
- Purpose: export the vault as one consolidated PDF source note. Done by consolidating MD files into one, then trigger Obsidian PDF export on that file

## Current behavior (must preserve unless explicitly asked)

- Command ID: `consolidate-vault-to-pdf`
- Ribbon action and command both trigger the same export flow.
- Before export, show modal options
- Generated temporary note path is fixed: `__vault_pdf_export_source.md`
- Delete previous temp export note before starting a new export.
- Keep the current temp export note during PDF export (do not delete immediately after starting export).

## Content generation rules

- Input files: `vault.getMarkdownFiles()`
- Exclusions:
  - `.obsidian/` subtree
  - temp export note itself
- Sort order:
  - folder path segments (collator: numeric + case-insensitive)
  - then basename
- TOC should reflect folder hierarchy and note order.
- TOC links should target generated section anchors.

## Constraints and known limitations

- Do not claim guaranteed clickable TOC links in every PDF viewer.
- Do not add network calls, telemetry, or external services.
- Keep logic local/offline and vault-scoped.

## Code organization expectations

- Source in `src/`; entry point is `src/main.ts`.
- Prefer splitting new complex logic into focused modules under `src/` when making larger changes.
- Keep dependencies minimal and browser/Electron compatible.

## Build and validation

- Install: `npm install`
- Create new build (and watch): `npm run dev`
- Lint: `npm run lint`

When changing code, validate with project scripts when feasible.

## Release artifacts

Top-level plugin files for vault install/release:

- `main.js`
- `manifest.json`
- `styles.css` (if present)

## Editing guidelines for agents

- Make minimal, targeted changes.
- Follow existing TypeScript style and strict null-safety patterns.
- Keep user-facing copy concise and consistent.
- Do not rename stable command IDs or plugin ID.
