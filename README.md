# Consolidate to PDF

Consolidate to PDF is an Obsidian community plugin that combines markdown notes in your vault into one export note and starts Obsidian's PDF export flow.

## Features

- Consolidate all vault markdown notes into one document
- Export options modal before each run:
  - Include cover page
  - Include table of contents
  - Add page break after each note
- Table of contents entries link to exported sections
- Preserves folder hierarchy
- Skips .obsidian content and the temporary export note

## Command

- Consolidate vault to PDF

## Temporary export file

The plugin writes a temporary note named __vault_pdf_export_source.md.
The current export note is kept during export to avoid premature deletion.
Any previous export note is deleted before a new export starts.

## Development

- Install: npm install
- Build: npm run dev

## Manual install

Unzip release into:
<Vault>/.obsidian/plugins/

Then enable the plugin in Settings -> Community plugins.

## Notes

PDF behavior (including link clickability) depends on Obsidian/Electron and the PDF viewer.
