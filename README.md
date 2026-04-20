# SFMC Data Loader — VS Code Extension

A lightweight VS Code extension for **Salesforce Marketing Cloud Engagement** that surfaces the [`sfmc-dataloader`](https://www.npmjs.com/package/sfmc-dataloader) CLI (`mcdata`) as Command Palette commands.

## Requirements

- A project initialised with `mcdata init` (`.mcdatarc.json` + `.mcdata-auth.json`) **or** an existing [`mcdev`](https://www.npmjs.com/package/mcdev) project (`.mcdevrc.json` + `.mcdev-auth.json`) in the workspace root
- [`Node.js`](https://nodejs.org/) on the **process `PATH`** when using the bundled CLI (`node …/out/mcdata.bundled.cjs`) or when `sfmcData.mcdataSource` is `auto` and `mcdata` is resolved from the environment.
- **Optional:** your own [`sfmc-dataloader`](https://www.npmjs.com/package/sfmc-dataloader) install if you want a specific version. The extension **bundles** a compatible `sfmc-dataloader`. Use **`sfmcData.mcdataSource`** to choose how the extension resolves `mcdata`:
  - **`bundled`** (default) — only the minified CLI shipped with the extension (`node …/out/mcdata.bundled.cjs`).
  - **`auto`** — workspace `node_modules/.bin/mcdata` when present, then `mcdata` on the process `PATH`, then the bundled CLI (same discovery order as older releases when no custom path was set).
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
| `SFMC Data: Initialize Project` | Create `.mcdatarc.json` + `.mcdata-auth.json` (standalone setup, no mcdev needed) |
| `SFMC Data: Refresh DE Cache` | Load Data Extension names and keys for one credential and selected BUs into a **session-only** cache (cleared when VS Code restarts) |
| `SFMC Data: Export DE Data` | Export one or more Data Extension rows to CSV/TSV/JSON (manual DE keys or pick from a **session DE cache**) |
| `SFMC Data: Export DE Data (Multi-BU)` | Export from several BUs in one command |
| `SFMC Data: Import DE Data` | Import rows from a file or by DE key |
| `SFMC Data: Import DE Data (Cross-BU)` | Import rows from one BU into multiple target BUs via the SFMC API |

These commands open a guided QuickPick workflow:

- **Export DE Data:** **Select credential** → **Business Unit** → **Enter DE keys manually** or **From DE list** (requires **Refresh DE cache** for that credential/BU first when using the list). Then format follows your settings.
- **Import DE Data:** **Select credential** → **Business Unit** → **By DE key** (comma-separated keys) or **By file path** (one or more data files). Then mode, backup, and optional clear prompts as configured.

### Explorer, editor tab, and editor context menus

Right-click any of the following files in the **Explorer**, on an **editor tab**, or in the **editor** background menu to open the **SFMC Data Loader** submenu:

- `*.dataExtension-meta.json` or `*.dataExtension-doc.md` under `retrieve/<cred>/<bu>/dataExtension/`
- Export files under `data/<cred>/<bu>/` whose names contain `.mcdata.` (matches `mcdata` export naming)

You can **multi-select** files within the same BU and all commands will operate on them together.

| Context menu item | retrieve/ files | data/ files |
|---|---|---|
| **Export Data** | `mcdata export <cred/bu> --de <key>...` | same |
| **Export from BUs...** | Multi-select source BUs (pre-selects current BU), runs `mcdata export --from ...` | same |
| **Import Data** | `mcdata import <cred/bu> --de <key>...` (resolves latest export file) | `mcdata import <cred/bu> --file <path>...` |
| **Import to BU...** | Multi-select target BUs, runs `mcdata import --from <src> --to <tgt>... --de <key>...` | Multi-select target BUs, runs `mcdata import --to <tgt>... --file <path>...` |

While `mcdata` runs, the extension shows a **cancellable** notification. **Stdout/stderr** stream to the **SFMC Data Loader** output channel. When the run finishes, a short **success or error** toast appears; choose **More Details** to focus that log (same pattern as SFMC DevTools).

## Settings

All settings are under the **SFMC Data Loader** section in VS Code Settings.

| Setting | Default | Description |
|---|---|---|
| `sfmcData.mcdataSource` | `bundled` | How to resolve `mcdata`: `bundled` (extension CLI only), `auto` (workspace `.bin` → `PATH` → bundled), or `custom` (use `sfmcData.mcdataPath`). |
| `sfmcData.mcdataPath` | `""` | Path to the `mcdata` executable — **only when `mcdataSource` is `custom`**. Ignored for `bundled` and `auto` (you may clear a stale path). |
| `sfmcData.useGitFilenames` | `false` | When `true`, appends `--git` to every `mcdata` invocation so exports use stable `*.mcdata.<ext>` names without a timestamp. |
| `sfmcData.promptClearBeforeImport` | `true` | When `true`, after you finish the import QuickPick flow, prompts whether to clear the target Data Extension before import (two-step confirmation; maps to `mcdata` clear-before-import flags). |
| `sfmcData.promptImportMode` | `true` | When `true`, prompts for upsert vs insert after you choose import inputs and before the optional clear-before-import step. |
| `sfmcData.importMode` | `upsert` | Default row write mode for imports when not prompting: `upsert` or `insert`. |
| `sfmcData.defaultFormat` | `csv` | Default file format for exports: `csv`, `tsv`, or `json`. Import format is detected automatically from the file extension. |
| `sfmcData.backupBeforeImport` | `prompt` | Whether to export a timestamped backup of each target DE before import: `prompt` (ask each time via QuickPick), `always` (backup without asking), or `never` (skip without asking). Backup filenames always include a timestamp. |
| `sfmcData.createDebugLog` | `false` | When `true`, appends `--debug` to every `mcdata` subprocess so the CLI writes an API trace under `./logs/data/` (useful for [GitHub issues](https://github.com/JoernBerkefeld/vscode-sfmc-dataloader/issues)). Does not affect **Refresh DE cache** (in-process, not `mcdata`). |

### Settings UI after an extension update

Contributed settings come from the extension `package.json` manifest. After the extension **updates**, use **Restart Extensions** when VS Code prompts, or **Developer: Reload Window**, so the Settings editor picks up **new or renamed** keys. If you dismiss the restart prompt, the UI can still show an older manifest until the extension host reloads.

## How it works

The extension reads `.mcdevrc.json` (mcdev projects) or `.mcdatarc.json` (standalone mcdata projects) to populate credential and BU quick-picks. It then constructs a `mcdata export`, `mcdata import`, or `mcdata init` command and runs it as a **subprocess** with the project root as the working directory, logging to the **SFMC Data Loader** output channel.

**DE cache (Refresh DE cache / Export from DE list):** the extension calls the `sfmc-dataloader` library in-process (`fetchDeList`) to retrieve Data Extension names and customer keys via the Marketing Cloud SOAP API. That path does **not** shell out to `mcdata`. All **import and export of row data** still goes through the `mcdata` CLI subprocess.

## Release Notes

See [CHANGELOG.md](./CHANGELOG.md).
