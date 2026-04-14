# Changelog

All notable changes to the SFMC Data Loader VS Code extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.10.0] — 2026-04-14

### Changed

- `sfmcData.promptClearBeforeImport` default changed from `false` to `true` — the "clear before import?" confirmation prompt is now on by default
- `sfmcData.promptImportMode` default changed from `false` to `true` — the upsert vs insert prompt is now shown by default before each import
- Import jobs now wait for the Marketing Cloud async API to confirm completion before reporting row counts. If the job fails, per-row error messages are printed in the output channel and an error notification appears instead of the success toast.

### Dependencies

- Bump sfmc-dataloader from 2.3.0 to 2.4.0 (async import status polling, per-row error reporting, exit code 1 on import error)

## [0.9.1] — 2026-04-12

### Removed

- `sfmcData.defaultMode` setting (was deprecated since 0.7.0 — use `sfmcData.importMode`)

### Dependencies

- Bump sfmc-dataloader from 2.2.0 to 2.3.0 (row count checks and clear-data skip logic for empty DEs)

## [0.9.0] — 2026-04-11

### Added

- New `sfmcData.backupBeforeImport` setting: `prompt` (QuickPick before each import), `always` (backup without asking), or `never` (skip without asking)
- All four import commands show a QuickPick asking whether to export a timestamped backup when the setting is `prompt`
- Backup passes `--backup-before-import` or `--no-backup-before-import` to the CLI automatically

### Changed

- `sfmcData.defaultFormat` now applies to **exports only**; import format is detected automatically from the file extension
- Import commands no longer pass `--format` to the CLI

### Dependencies

- Bump sfmc-dataloader from 2.1.0 to 2.2.0

## [0.8.1] — 2026-04-10

### Fixed

- Fixed imports failing with TSV files that have UTF-8 BOM or quoted fields

### Changed

- Import file format is now auto-detected from file extension (`.csv`, `.tsv`, `.json`)
- TSV exports no longer wrap fields in quotes (standard TSV behavior)

### Dependencies

- Bump sfmc-dataloader from 2.0.2 to 2.1.0

## [0.8.0] — 2026-04-09

### Added

- Output channel for mcdata command output
- Progress indicator during export/import operations
- Editor context menu commands for data files

### Changed

- Improved UI feedback during operations

## [0.7.0] — 2026-04-08

### Added

- `sfmcData.mcdataSource` setting to control CLI resolution
- `sfmcData.importMode` setting (replaces deprecated `defaultMode`)
- `sfmcData.promptImportMode` setting for interactive mode selection

### Deprecated

- `sfmcData.defaultMode` — use `sfmcData.importMode` instead
