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

| Command                                | Description                                                                                                                          |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `SFMC Data: Initialize Project`        | Create `.mcdatarc.json` + `.mcdata-auth.json` (standalone setup, no mcdev needed)                                                    |
| `SFMC Data: Refresh DE Cache`          | Load Data Extension names and keys for one credential and selected BUs into a **session-only** cache (cleared when VS Code restarts) |
| `SFMC Data: Export DE Data`            | Export one or more Data Extension rows to CSV/TSV/JSON (manual DE keys or pick from a **session DE cache**)                          |
| `SFMC Data: Export DE Data (Multi-BU)` | Export from several BUs in one command                                                                                               |
| `SFMC Data: Import DE Data`            | Import rows from a file or by DE key                                                                                                 |
| `SFMC Data: Import DE Data (Cross-BU)` | Import rows from one BU into multiple target BUs via the SFMC API                                                                    |

These commands open a guided QuickPick workflow:

- **Export DE Data:** **Select credential** → **Business Unit** → **From DE list** (search by name/key, select multiple) or **Enter DE keys manually**. A missing session cache is fetched automatically; **Refresh DE Cache** explicitly reloads it. Multi-BU palette exports retain manual key entry. Format and file-splitting options follow the selected project's settings.
- **Import DE Data:** **Select credential** → **Business Unit** → **By DE key** (searchable DE list or manual keys) or **By file path** (one or more data files). The DE list describes the target BU; matching local exports must already exist. Cross-BU API imports offer the source BU's DE list, not a validation of every target. Then choose mode, backup, and optional clear behavior as configured.

Every import route shows a native **Import Confirmation** dialog with
**Commence import into BU:** followed by one bullet per distinct destination
credential/BU, in selected order. Choose **Continue** to proceed or **Cancel** to
abort. Execution uses the captured project and import arguments, not later
changes to the selection. Choosing to clear rows additionally requires typing
**`CLEAR`** exactly in a separate irreversible-deletion acknowledgement after
the confirmation. Dismissing any safety prompt cancels the import;
choosing **No (keep existing rows)** continues without clearing.
Explicit files of **1 GiB or larger** show a separate informational notice with
**OK**; closing it continues to the ordinary confirmation and optional clear safeguards,
which remain cancellable. Unreadable selected files prevent submission. File names determine target DE keys
under the loader's filename-validation rules, not the file contents.

### CSV import behavior

Skipping is selected by default when no setting exists. Existing explicit user or workspace `sfmcData.skipEmptyLines: false` values are respected without migration or reset. To retain interior empty records, disable this setting. Automatic safe file-edge cleanup is independent: exactly empty unnamed right-padding columns and the final run of empty records across a logical multipart file set are removed even when skipping is disabled. Named columns and interior unnamed columns remain; any populated discarded-column cell (including whitespace) is rejected before backup, clear or upload. Original source files are never modified. Cleanup is reported once per logical source set; JSON imports are unchanged.

For **By file path** and context imports, `Customer.List.csv` targets literal `Customer.List`, `Customers.part1.csv` targets literal `Customers.part1`, and `Customers.CSV` targets `Customers`. Plain names are not URI-decoded. Legacy `.mcdata` naming takes precedence: `Customers.mcdata.csv` targets `Customers`, and existing timestamps/multipart naming keep their original meaning. Keys colliding with the reserved `.mcdata` convention must be re-keyed; there is no filename override. Selecting both `Customers.csv` and `Customers.mcdata.csv` is ambiguous and rejected by the loader before side effects. Plain TSV/JSON names are not supported. Automatic **By DE key** discovery and export naming still use `.mcdata` conventions; selecting a plain CSV does not add it to automatic discovery.

Extension 3.0.0 bundles [loader 4.0.0](https://github.com/JoernBerkefeld/sfmc-dataloader/releases/tag/v4.0.0) and [parser 5.0.0](https://github.com/JoernBerkefeld/csv-parser/releases/tag/v5.0.0), upgraded from loader 3.2.0/parser 4.3.0 in extension 2.2.0. There are no intermediate released versions in either interval. Workspace/PATH/custom overrides are independently managed and must support the new negative flag and input rules; the extension does not upgrade them.

Automatic cleanup does not repair malformed CSV: original physical widths and strict quote checks still apply, including delimiter-only/quoted-empty records at EOF. Quoted whitespace remains data. With skipping disabled, only trailing unquoted blank records can defer a width failure and be trimmed; malformed interior blanks fail. Empty-only inputs are rejected before side effects. Keep selected sources unchanged through the import: preflight is not a file lock, transaction or rollback. Counts, snapshots and uploads reuse the validated cleanup policy; API-to-API copies and exports gain no cleanup behavior.

### Explorer, editor tab, and editor context menus

Right-click any of the following files in the **Explorer**, on an **editor tab**, or in the **editor** background menu to open the **SFMC Data Loader** submenu:

- `*.dataExtension-meta.json` or `*.dataExtension-doc.md` under `retrieve/<cred>/<bu>/dataExtension/`
- Export files under `data/<cred>/<bu>/` whose names contain `.mcdata.` (matches `mcdata` export naming), or explicitly selected plain `<key>.csv` files (case-insensitive CSV extension)

You can **multi-select** files within the same project and BU. Imports require either metadata files or data exports, not a mixture; unsupported selections are rejected. Dotted and encoded Data Extension keys are preserved. Dismissing an import confirmation cancels the import; choosing **No** explicitly continues without clearing.

In multi-root workspaces, context commands use the selected file's project. Palette commands offer a project picker when more than one configured project is available. Project settings and cached DE lists remain isolated by project and account/BU identity. Only trusted, on-disk workspace folders are supported.

| Context menu item      | retrieve/ files                                                                        | data/ files                                                                  |
| ---------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **Export Data**        | `mcdata export <cred/bu> --de <key>...`                                                | same                                                                         |
| **Export from BUs...** | Multi-select source BUs (pre-selects current BU), runs `mcdata export --from ...`      | same                                                                         |
| **Import Data**        | `mcdata import <cred/bu> --de <key>...` (resolves latest export file)                  | `mcdata import <cred/bu> --file <path>...`                                   |
| **Import to BU...**    | Multi-select target BUs, runs `mcdata import --from <src> --to <tgt>... --de <key>...` | Multi-select target BUs, runs `mcdata import --to <tgt>... --file <path>...` |

Concurrent `mcdata` runs are supported. Each has its own **cancellable** progress
notification, a session-local **`[run N]`** tag, and bounded project/source/target
context. **Stdout/stderr** stream to the shared **SFMC Data Loader** output channel
with the run tag on each fragment and exactly one run tag on each START/END entry. The **mcdata**
status bar item shows the active-run count and opens output. Cancelling a
notification targets that run, not its siblings. Success is reported only after
successful execution; cancellation and failures do not report success. Choose
**More Details** to focus the log. Tags/context are local UI/output aids, not
additional telemetry fields.

Command previews show `[run N] ⚡ mcdata export ...` (or the selected subcommand), hiding internal executable paths and quoting special arguments for readability. This display is informational only; execution still uses separate arguments without a shell.

Launches pass arguments without shell interpretation. Recognized Windows npm `.cmd` shims run directly through Node.js; unsupported shell wrappers are rejected. Node/PATH probes are asynchronous and time-bounded. Command displays mask credential arguments, but credentials passed as arguments may still be visible to local process-inspection tools. Debug files can contain business data and are not automatically safe to share, especially with older or custom CLIs.

Cancellation does not roll back API work already submitted. On Windows, a custom launcher that starts the loader and exits first can leave its descendant running; cancellation of that orphaned process is not guaranteed.

## Settings

All settings are under the **SFMC Data Loader** section in VS Code Settings.

| Setting                            | Default   | Description                                                                                                                                                                                                                                                                     |
| ---------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sfmcData.mcdataSource`            | `bundled` | How to resolve `mcdata`: `bundled` (extension CLI only), `auto` (workspace `.bin` → `PATH` → bundled), or `custom` (use `sfmcData.mcdataPath`).                                                                                                                                 |
| `sfmcData.mcdataPath`              | `""`      | Path to the `mcdata` executable — **only when `mcdataSource` is `custom`**. Ignored for `bundled` and `auto` (you may clear a stale path).                                                                                                                                      |
| `sfmcData.useGitFilenames`         | `false`   | When `true`, appends `--git` to every `mcdata` invocation so exports use stable `*.mcdata.<ext>` names without a timestamp.                                                                                                                                                     |
| `sfmcData.promptClearBeforeImport` | `true`    | When `true`, after you finish the import QuickPick flow, prompts whether to clear the target Data Extension before import (two-step confirmation; maps to `mcdata` clear-before-import flags).                                                                                  |
| `sfmcData.promptImportMode`        | `true`    | When `true`, prompts for upsert vs insert after you choose import inputs and before the optional clear-before-import step.                                                                                                                                                      |
| `sfmcData.skipEmptyLines`          | `true`    | Skip blank/whitespace-only, delimiter-only and quoted-empty CSV/TSV records on all import routes. Saved user/workspace `false` is preserved and sends `--no-skip-empty-lines`; enabled sends `--skip-empty-lines`. Does not affect exports or JSON imports.                                                                                                                           |
| `sfmcData.importMode`              | `upsert`  | Default row write mode for imports when not prompting: `upsert` or `insert`.                                                                                                                                                                                                    |
| `sfmcData.defaultFormat`           | `csv`     | Default file format for exports: `csv`, `tsv`, or `json`. Import format is detected automatically from the file extension.                                                                                                                                                      |
| `sfmcData.jsonPretty`              | `false`   | Pretty-print JSON exports (`--json-pretty`); ignored for CSV/TSV. Applies to palette and context exports, including multi-BU routes.                                                                                                                                            |
| `sfmcData.maxRowsPerFile`          | `null`    | Split exports with `--max-rows-per-file`; use a positive safe integer, or `null` for unsplit output. Invalid values block export. Applies to all export routes and uses the selected project's resource settings.                                                               |
| `sfmcData.backupBeforeImport`      | `prompt`  | Whether to export a timestamped backup of each target DE before import: `prompt` (ask each time via QuickPick), `always` (backup without asking), or `never` (skip without asking). Backup filenames always include a timestamp.                                                |
| `sfmcData.createDebugLog`          | `false`   | When `true`, appends `--debug` to every `mcdata` subprocess so the CLI writes an API trace under `./logs/data/` (useful for [GitHub issues](https://github.com/JoernBerkefeld/vscode-sfmc-dataloader/issues)). Does not affect **Refresh DE cache** (in-process, not `mcdata`). |

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

The bundled loader is **4.0.0** with parser **5.0.0**. Malformed project/authentication JSON produces a filename-only error such as `Invalid JSON in .mcdata-auth.json. Fix the file and try again.` rather than including JSON excerpts. Public project discovery reads public configuration without parsing authentication contents; DE-cache refresh and row operations still validate authentication when needed. Older workspace/PATH/custom CLIs are independently managed and may have different error behavior.

## Loader compatibility regression

Before adopting a new loader release, compile the extension and run its normal test suite. To additionally exercise an unreleased loader, pack that loader with `npm pack --ignore-scripts --no-workspaces` into a fresh OS-temp directory and install the tarball into a separate fixture directory using `npm install --prefix <fixture> <tarball> --ignore-scripts --omit=optional --no-workspaces`. Verify the packed package is `sfmc-dataloader` from the intended source revision. Do not replace the extension's installed dependency or commit local tarball dependency specs.

The normal suite always checks the actual registry-installed loader 4.0.0, lockfile range/resolution, public-config API, DE-cache helpers, registered command errors, and the CLI produced by `npm run compile`. It checks filename-only malformed public/auth JSON errors for both config families, unsuccessful import/export exit codes, and absence of a secret sentinel without contacting an org.

Set `SFMC_DATALOADER_COMPAT_FIXTURE` to the absolute fixture directory before `npm test --no-workspaces` to additionally check a packed candidate using the production bundler. It requires the `loadPublicProjectConfig` export; it does not replace evidence from the installed dependency. Temporary evidence is retained for inspection, without recursive cleanup. Without the environment variable, only the additional candidate check is omitted.

Build a production test archive with `npm run package:test --no-workspaces`, then run `npm run verify:vsix --no-workspaces -- "F:\\path\\to\\sfmc-data-BETA.vsix"` (the optional positional argument defaults to `sfmc-data-BETA.vsix` in this repository). The verifier extracts the archive into OS temp and checks the manifest, bundled CLI version/help, relocated execution, and malformed public/auth JSON redaction. It also executes real synthetic imports through the extracted fallback, replacing only SDK construction in memory and denying network access: default/negative-flag row counts, safe edge cleanup, literal dotted plain filenames, and late padding rejection before backup/CLEAR/upload. Its supplemental library probe is built from installed dependencies, not extracted from the archive; neither probe substitutes for an Extension Development Host or packaged-user acceptance. On Windows, TEMP, actual Node tmpdir, and nonempty TMP/TMPDIR must resolve to `F:\\Temp`.

This fixture check does not upgrade the shipped loader. Registry dependency adoption and production bundle rebuild must follow loader publication; VSIX verification, Extension Development Host checks, and user acceptance of the packaged extension remain separate release gates. Workspace/PATH/custom CLI installations remain user-managed.

## Release Notes

See [CHANGELOG.md](./CHANGELOG.md).
