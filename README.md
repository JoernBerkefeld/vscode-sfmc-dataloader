# SFMC Data Loader — VS Code Extension

A lightweight VS Code extension for **Salesforce Marketing Cloud Engagement** that surfaces the [`sfmc-dataloader`](https://www.npmjs.com/package/sfmc-dataloader) CLI (`mcdata`) as Command Palette commands.

## Requirements

- A project initialised with `mcdata init` (`.mcdatarc.json` + `.mcdata-auth.json`) **or** an existing [`mcdev`](https://www.npmjs.com/package/mcdev) project (`.mcdevrc.json` + `.mcdev-auth.json`) in the workspace root
- For the bundled CLI, [`Node.js`](https://nodejs.org/) **22.22.2 or later in the 22.x line, or 24.15.0 and later** (`^22.22.2 || >=24.15.0`) on the **process `PATH`**. Node 20 and 23 are not supported by the bundled loader in extension 2.0.0. The extension checks `node --version` before bundled execution, including the `auto` fallback. If the runtime is missing or unsupported, upgrade Node.js and restart VS Code/Cursor so it picks up the updated `PATH`.
- Workspace, `PATH`, and custom `mcdata` executables retain their own runtime requirements; the bundled-runtime check does not apply to those overrides. VS Code's extension-host runtime is separate from the external Node.js used for row import/export.
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

You can **multi-select** files within the same project and BU. Imports require either metadata files or data exports, not a mixture; unsupported selections are rejected. Dotted and encoded Data Extension keys are preserved. Dismissing an import confirmation cancels the import; choosing **No** explicitly continues without clearing.

In multi-root workspaces, context commands use the selected file's project. Palette commands offer a project picker when more than one configured project is available. Project settings and cached DE lists remain isolated by project and account/BU identity. Only trusted, on-disk workspace folders are supported.

| Context menu item | retrieve/ files | data/ files |
|---|---|---|
| **Export Data** | `mcdata export <cred/bu> --de <key>...` | same |
| **Export from BUs...** | Multi-select source BUs (pre-selects current BU), runs `mcdata export --from ...` | same |
| **Import Data** | `mcdata import <cred/bu> --de <key>...` (resolves latest export file) | `mcdata import <cred/bu> --file <path>...` |
| **Import to BU...** | Multi-select target BUs, runs `mcdata import --from <src> --to <tgt>... --de <key>...` | Multi-select target BUs, runs `mcdata import --to <tgt>... --file <path>...` |

While `mcdata` runs, the extension shows a **cancellable** notification. **Stdout/stderr** stream to the **SFMC Data Loader** output channel. Success is reported only after successful execution; cancellation and failures do not report success. Choose **More Details** to focus the log.

Launches pass arguments without shell interpretation. Recognized Windows npm `.cmd` shims run directly through Node.js; unsupported shell wrappers are rejected. Node/PATH probes are asynchronous and time-bounded. Command displays mask credential arguments, but credentials passed as arguments may still be visible to local process-inspection tools. Debug files can contain business data and are not automatically safe to share, especially with older or custom CLIs.

Cancellation does not roll back API work already submitted. On Windows, a custom launcher that starts the loader and exits first can leave its descendant running; cancellation of that orphaned process is not guaranteed.

## Settings

All settings are under the **SFMC Data Loader** section in VS Code Settings.

| Setting | Default | Description |
|---|---|---|
| `sfmcData.mcdataSource` | `bundled` | How to resolve `mcdata`: `bundled` (extension CLI only), `auto` (workspace `.bin` → `PATH` → bundled), or `custom` (use `sfmcData.mcdataPath`). |
| `sfmcData.mcdataPath` | `""` | Path to the `mcdata` executable — **only when `mcdataSource` is `custom`**. Ignored for `bundled` and `auto` (you may clear a stale path). |
| `sfmcData.useGitFilenames` | `false` | When `true`, appends `--git` to every `mcdata` invocation so exports use stable `*.mcdata.<ext>` names without a timestamp. |
| `sfmcData.promptClearBeforeImport` | `true` | When `true`, after you finish the import QuickPick flow, prompts whether to clear the target Data Extension before import (two-step confirmation; maps to `mcdata` clear-before-import flags). |
| `sfmcData.promptImportMode` | `true` | When `true`, prompts for upsert vs insert after you choose import inputs and before the optional clear-before-import step. |
| `sfmcData.skipEmptyLines` | `false` | When `true`, passes `--skip-empty-lines` on all import routes to skip empty CSV/TSV records. Off by default; does not affect exports or JSON imports. |
| `sfmcData.importMode` | `upsert` | Default row write mode for imports when not prompting: `upsert` or `insert`. |
| `sfmcData.defaultFormat` | `csv` | Default file format for exports: `csv`, `tsv`, or `json`. Import format is detected automatically from the file extension. |
| `sfmcData.backupBeforeImport` | `prompt` | Whether to export a timestamped backup of each target DE before import: `prompt` (ask each time via QuickPick), `always` (backup without asking), or `never` (skip without asking). Backup filenames always include a timestamp. |
| `sfmcData.createDebugLog` | `false` | When `true`, appends `--debug` to every `mcdata` subprocess so the CLI writes an API trace under `./logs/data/` (useful for [GitHub issues](https://github.com/JoernBerkefeld/vscode-sfmc-dataloader/issues)). Does not affect **Refresh DE cache** (in-process, not `mcdata`). |

### Settings UI after an extension update

Contributed settings come from the extension `package.json` manifest. After the extension **updates**, use **Restart Extensions** when VS Code prompts, or **Developer: Reload Window**, so the Settings editor picks up **new or renamed** keys. If you dismiss the restart prompt, the UI can still show an older manifest until the extension host reloads.

## How it works

The extension reads `.mcdevrc.json` (mcdev projects) or `.mcdatarc.json` (standalone mcdata projects) to populate credential and BU quick-picks. It then constructs a `mcdata export`, `mcdata import`, or `mcdata init` command and runs it as a **subprocess** with the project root as the working directory, logging to the **SFMC Data Loader** output channel.

**DE cache (Refresh DE cache / Export from DE list):** the extension calls the `sfmc-dataloader` library in-process (`fetchDeList`) to retrieve Data Extension names and customer keys via the Marketing Cloud SOAP API. That path does **not** shell out to `mcdata`. All **import and export of row data** still goes through the `mcdata` CLI subprocess.

## Telemetry

This extension collects a small amount of **anonymous** usage telemetry to understand adoption and which commands are used, so development can be prioritised. It is sent to a [PostHog](https://posthog.com/) project hosted in the **EU** and contains **no** personally identifiable information, file contents, credentials, Data Extension keys, or business-unit / tenant identifiers.

What is collected:

- **Activation** — that the extension started, plus which known SFMC-related extensions are installed alongside it (booleans only), whether the workspace looks like an mcdev and/or mcdata project (folder-root flags only), and how `mcdata` is resolved (`bundled`, `auto`, or `custom`).
- **Command outcomes** — whether a Command Palette or context-menu command succeeded or failed (the VS Code command id, duration on success, and a coarse `errorCategory` on failure: `commandFailed`, `spawnError`, or `mcdataPrefixMissing`, plus optional sanitized `errorName` / `errorCode` — never a message, stack, or path). Refresh DE cache is included the same way, with a count of business units processed.
- **mcdata version** — the version string of the resolved `mcdata` used by the extension (omitted when the lookup fails).

Events are keyed by VS Code's anonymous machine id only. The full catalogue ships as [`telemetry.json`](./telemetry.json) in the extension root.

**Opt out:** telemetry is gated **solely** by VS Code's global telemetry setting. Set `telemetry.telemetryLevel` to `off` and nothing is sent — the extension respects `isTelemetryEnabled` and stops immediately when you change it. There is no separate extension setting to configure.

## Release Notes

See [CHANGELOG.md](./CHANGELOG.md).
