# Changelog

All notable changes to this extension will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [0.6.0] — 2026-04-09

### Added

- Settings `sfmcData.useGitFilenames` (append `--git` to every `mcdata` spawn) and `sfmcData.promptClearBeforeImport` (optional two-step prompt for `--clear-before-import` + `--i-accept-clear-data-risk`).
- What's New webview: Markdown links `[label](https://...)` render as external links (`openExternal`).

### Changed

- Requires `sfmc-dataloader` **v2** (breaking CLI: `.mcdata.` export filenames, async-only insert/upsert, `--git`). Explorer context menu matches `data/` files whose names contain `.mcdata.`.
- Removed `sfmcData.importApi`; imports always use the async bulk REST API. `sfmcData.defaultMode` is `upsert` or `insert` only.

## [0.5.0] — 2026-04-08

### Changed

- The extension bundles [sfmc-dataloader](https://www.npmjs.com/package/sfmc-dataloader) in the VSIX. When no override is configured, the `mcdata` command is resolved in order: optional `sfmcData.mcdataPath` → workspace `node_modules/.bin/mcdata` → `mcdata` on the integrated terminal `PATH` → bundled `node …/mcdata.mjs` (Node.js must remain on `PATH` in that terminal).

## [0.4.0] — 2026-04-08

### Added

- **What's New**: after an update, a notification offers to open release notes in a webview, parsed from this changelog for the current version. Use command **SFMC Data: Show What's New** anytime.

## [0.3.0] — 2026-04-08

### Added

- **Explorer context menu** — right-click any `*.dataExtension-meta.json`, `*.dataExtension-doc.md` (under `retrieve/.../dataExtension/`), or export files whose names contain `.mcdata.` (under `data/.../`) to access an **SFMC Data Loader** submenu with four commands:
  - **Export Data** — runs `mcdata export <cred/bu> --de <key>...` for the selected file(s)
  - **Export from BUs...** — opens a multi-select BU picker (pre-selects the current file's BU) and runs `mcdata export --from ...` across the chosen BUs
  - **Import Data** — for `retrieve/` files: `mcdata import <cred/bu> --de <key>...`; for `data/` files: `mcdata import <cred/bu> --file <path>...`
  - **Import to BU...** — opens a multi-select BU picker for target BUs; for `retrieve/` files: `mcdata import --from <src> --to <tgt>... --de <key>...`; for `data/` files: `mcdata import --to <tgt>... --file <path>...` (new file-to-multi-BU mode in `sfmc-dataloader` ≥ 1.2.0)
- Multi-select support: select multiple DE files within the same BU and all commands operate on all of them at once

### Dependencies

- Requires `sfmc-dataloader` ≥ 1.2.0 for the **Import to BU...** command on `data/` export files

## [0.1.0] — 2026-04-07

### Added

- `SFMC Data: Export DE Data` command — QuickPick credential/BU/DE-key workflow spawning `mcdata export`
- `SFMC Data: Import DE Data` command — QuickPick credential/BU workflow supporting both by-key and by-file import via `mcdata import`
- Settings: `sfmcData.mcdataPath`, `sfmcData.importApi`, `sfmcData.defaultMode`, `sfmcData.defaultFormat`
