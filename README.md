# SFMC Data Loader — VS Code Extension

A lightweight VS Code extension that surfaces the [`sfmc-dataloader`](https://www.npmjs.com/package/sfmc-dataloader) CLI (`mcdata`) as Command Palette commands.

## Requirements

- An mcdev project initialised with [`mcdev`](https://www.npmjs.com/package/mcdev) (`.mcdevrc.json` + `.mcdev-auth.json` in the workspace root)
- [`Node.js`](https://nodejs.org/) on your **integrated terminal** `PATH` (the extension runs `mcdata` or `node …/out/mcdata.bundled.cjs` for the built-in fallback).
- **Optional:** your own [`sfmc-dataloader`](https://www.npmjs.com/package/sfmc-dataloader) install if you want a specific version. The extension **bundles** a compatible `sfmc-dataloader`. Use **`sfmcData.mcdataSource`** to choose how the integrated terminal resolves `mcdata`:
  - **`bundled`** (default) — only the minified CLI shipped with the extension (`node …/out/mcdata.bundled.cjs`).
  - **`auto`** — workspace `node_modules/.bin/mcdata` when present, then `mcdata` on the integrated terminal `PATH`, then the bundled CLI (same discovery order as older releases when no custom path was set).
  - **`custom`** — run the executable at **`sfmcData.mcdataPath`** (path is ignored for `bundled` and `auto`).

```bash
# Optional — global override
npm install -g sfmc-dataloader
# Optional — project-local override
npm install sfmc-dataloader
```

## Commands

### Command Palette

| Command | Description |
|---|---|
| `SFMC Data: Export DE Data` | Export one or more Data Extension rows to CSV/TSV/JSON |
| `SFMC Data: Export DE Data (Multi-BU)` | Export from several BUs in one command |
| `SFMC Data: Import DE Data` | Import rows from a file or by DE key |
| `SFMC Data: Import DE Data (Cross-BU)` | Import rows from one BU into multiple target BUs via the SFMC API |

These commands open a guided QuickPick workflow:

1. **Select credential** (skipped when only one exists)
2. **Select Business Unit** (skipped when only one exists)
3. **Enter DE key(s)** or **select file(s)**

### Explorer Context Menu

Right-click any of the following files in the VS Code Explorer to access the **SFMC Data Loader** submenu:

- `*.dataExtension-meta.json` or `*.dataExtension-doc.md` under `retrieve/<cred>/<bu>/dataExtension/`
- Export files under `data/<cred>/<bu>/` whose names contain `.mcdata.` (matches `mcdata` export naming)

You can **multi-select** files within the same BU and all commands will operate on them together.

| Context menu item | retrieve/ files | data/ files |
|---|---|---|
| **Export Data** | `mcdata export <cred/bu> --de <key>...` | same |
| **Export from BUs...** | Multi-select source BUs (pre-selects current BU), runs `mcdata export --from ...` | same |
| **Import Data** | `mcdata import <cred/bu> --de <key>...` (resolves latest export file) | `mcdata import <cred/bu> --file <path>...` |
| **Import to BU...** | Multi-select target BUs, runs `mcdata import --from <src> --to <tgt>... --de <key>...` | Multi-select target BUs, runs `mcdata import --to <tgt>... --file <path>...` |

The assembled `mcdata` command runs in a dedicated integrated terminal so you can see live output.

## Settings

All settings are under the **SFMC Data Loader** section in VS Code Settings.

| Setting | Default | Description |
|---|---|---|
| `sfmcData.mcdataSource` | `bundled` | How to resolve `mcdata`: `bundled` (extension CLI only), `auto` (workspace `.bin` → `PATH` → bundled), or `custom` (use `sfmcData.mcdataPath`). |
| `sfmcData.mcdataPath` | `""` | Path to the `mcdata` executable — **only when `mcdataSource` is `custom`**. Ignored for `bundled` and `auto` (you may clear a stale path). |
| `sfmcData.useGitFilenames` | `false` | When `true`, appends `--git` to every `mcdata` invocation so exports use stable `*.mcdata.<ext>` names without a timestamp. |
| `sfmcData.promptClearBeforeImport` | `false` | When `true`, after you finish the import QuickPick flow, prompts whether to clear the target Data Extension before import (two-step confirmation; maps to `mcdata` clear-before-import flags). |
| `sfmcData.promptImportMode` | `false` | When `true`, prompts for upsert vs insert after you choose import inputs and before the optional clear-before-import step. |
| `sfmcData.importMode` | `upsert` | Default row write mode for imports when not prompting: `upsert` or `insert`. Replaces deprecated `sfmcData.defaultMode`. |
| `sfmcData.defaultMode` | — | **Deprecated** — use `sfmcData.importMode`. Still read when `importMode` is unset at every scope. |
| `sfmcData.defaultFormat` | `csv` | Default file format for exports and imports: `csv`, `tsv`, or `json`. |

## How it works

The extension reads `.mcdevrc.json` to populate credential and BU quick-picks. It then constructs a `mcdata export` or `mcdata import` command and runs it in VS Code's integrated terminal with the mcdev project root as the working directory.

No SFMC API calls are made by the extension itself — all network activity goes through the `mcdata` CLI.

## Release Notes

See [CHANGELOG.md](./CHANGELOG.md).
