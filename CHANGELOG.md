# Changelog

## [1.1.0] — 2026-04-20

### Added

- **Refresh DE cache** — Load Data Extension names and customer keys for a credential and selected BUs into a **session-only** list (cleared when you restart VS Code). Use it before picking DEs from a list on export.
- **Export from a DE list** — After you choose credential and BU, pick **From DE list** (filterable) or **Enter DE keys manually**. If the list is empty, the extension can refresh the cache for that BU first.
- **Status bar shortcut** — A **mcdata** item on the status bar opens the SFMC Data output; the hover tooltip links to **Show Output** and **Settings**.
- **Show Output** — Command Palette entry to open the SFMC Data output channel.
- **Optional debug logging** — Setting **Create debug log** (`sfmcData.createDebugLog`) adds the same **`--debug`** flag the standalone CLI uses, so support-style traces are written under **`./logs/data/`** in your project. (Does not apply to **Refresh DE cache**, which does not shell out to `mcdata`.)
- **Clearer export progress** — The cancellable export notification can show **which batch** of the download you are on when the CLI reports paging.
- **See what ran** — The output channel shows the **`mcdata` command line** (including debug when enabled) so you can copy it for logs or support tickets.
- **Cancellation note** — If you cancel a run, the output channel records that you cancelled it.

### Changed

- **Bundled `mcdata`** — Shipped CLI is now built from **sfmc-dataloader 2.7.x**: large exports and imports stream instead of holding the whole file in memory, uploads use **smaller batches** so long jobs feel steadier and time out less often, and **connection / offline handling** is improved in the underlying SDK (no endless retry loop when there is no network).

## [1.0.0] — 2026-04-15

### Added

- **SFMC Data: Initialize Project** — Command Palette wizard that interactively runs `mcdata init`, creating `.mcdatarc.json` and `.mcdata-auth.json` for standalone use (no mcdev required).
- **mcdev project guard** — when both `.mcdevrc.json` and `.mcdev-auth.json` are present, the Initialize Project command now shows an error message directing users to manage credentials via mcdev instead of overwriting them.
- **mcdata overwrite confirmation** — when `.mcdatarc.json` or `.mcdata-auth.json` already exist, a modal warning asks the user to confirm before proceeding with initialization.
- **`ignoreFocusOut` on all input prompts** — input boxes for DE keys and credential details now stay visible when VS Code loses focus, preventing accidental dismissal while copying keys from another window.

### Changed

- Project discovery and credential reads generalized: the extension now supports both `.mcdevrc.json`/`.mcdev-auth.json` (mcdev projects) and `.mcdatarc.json`/`.mcdata-auth.json` (standalone mcdata projects). The mcdev config pair takes precedence when both are present.
- VSIX packaging uses `--no-dependencies` to prevent workspace `node_modules` from inflating the package (fixes local packaging producing multi-GB artifacts in monorepo setups).

### Fixed

- Export and import log lines now show **absolute paths in double-quotes** (e.g. `"C:\data\MyOrg\DEV\Contact.mcdata.csv"`) making them CTRL+clickable in VS Code's integrated terminal.
- Upsert on a Data Extension without a primary key (HTTP 400) now surfaces the human-readable SFMC `resultMessages` instead of a raw stack trace.
- Error output no longer prints stack traces — only the human-readable error message is shown; exit code 1 is still set for CI.

### Dependencies

- Bump bundled `sfmc-dataloader` from 2.4.2 to 2.5.0 (standalone `mcdata init`, guard checks, absolute path output, readable 400 errors, no-stack-trace error handling).
