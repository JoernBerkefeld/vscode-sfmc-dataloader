# Changelog

All notable changes to the SFMC Data Loader VS Code extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

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
