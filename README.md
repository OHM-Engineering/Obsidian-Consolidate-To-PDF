# Consolidate to PDF

Consolidate to PDF is an Obsidian community plugin that combines markdown notes in your vault into one export note and starts Obsidian's PDF export flow.

## Features

- Consolidate all vault markdown notes into one document
- Adds a button to the ribbon to start the export process
- Provides the command `Consolidate vault to PDF`
- Export options modal before each run:
  - Include cover page
  - Include table of contents
  - Add page break after each note
- Table of contents entries link to exported sections
- Preserves folder hierarchy
- Skips `.obsidian` content and the temporary export note

## Temporary export file

The plugin writes a temporary note named `__vault_pdf_export_source.md`.
The current export note is kept during export to avoid premature deletion.
Any previous export note is deleted before a new export starts.

## Development

- Install dependencies: `npm install`
- Build and enable watch mode: `npm run dev`
- Lint: `npm run lint`

## Manual install
- Download the latest release from the [releases page](https://github.com/OHM-Engineering/Obsidian-Consolidate-To-PDF/releases). 
- Extract to: `<Vault>/.obsidian/plugins/consolidate-to-pdf`

Then enable the plugin in `Settings -> Community plugins`.

## Notes

PDF behavior (including link clickability) depends on Obsidian/Electron and the PDF viewer.
