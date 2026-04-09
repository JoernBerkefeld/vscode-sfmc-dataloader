# SFMC Data Loader — VS Code Extension

A lightweight VS Code extension that surfaces the [`sfmc-dataloader`](https://www.npmjs.com/package/sfmc-dataloader) CLI (`mcdata`) as Command Palette commands.

## Requirements

- An mcdev project initialised with [`mcdev`](https://www.npmjs.com/package/mcdev) (`.mcdevrc.json` + `.mcdev-auth.json` in the workspace root)
- [`Node.js`](https://nodejs.org/) on your **integrated terminal** `PATH` (the extension runs `mcdata` or `node …/out/mcdata.bundled.cjs` for the built-in fallback).
- **Optional:** your own [`sfmc-dataloader`](https://www.npmjs.com/package/sfmc-dataloader) install if you want a specific version. The extension **bundles** a compatible `sfmc-dataloader` and uses it when no other `mcdata` is chosen. Precedence when `sfmcData.mcdataPath` is empty:
  1. Workspace `node_modules/.bin/mcdata` (project-local install)
  2. `mcdata` on your `PATH` (e.g. global `npm install -g sfmc-dataloader`)
  3. Bundled CLI shipped with the extension

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

Both commands open a guided QuickPick workflow:

1. **Select credential** (skipped when only one exists)
2. **Select Business Unit** (skipped when only one exists)
3. **Enter DE key(s)** or **select file(s)**

### Explorer Context Menu

Right-click any of the following files in the VS Code Explorer to access the **SFMC Data Loader** submenu:

- `*.dataExtension-meta.json` or `*.dataExtension-doc.md` under `retrieve/<cred>/<bu>/dataExtension/`
- `*+MCDATA+*` export files under `data/<cred>/<bu>/`

You can **multi-select** files within the same BU and all commands will operate on them together.

| Context menu item | retrieve/ files | data/ files |
|---|---|---|
| **Export Data** | `mcdata export <cred/bu> --de <key>...` | same |
| **Export from BUs...** | Multi-select source BUs (pre-selects current BU), runs `mcdata export --from ...` | same |
| **Import Data** | `mcdata import <cred/bu> --de <key>...` (resolves latest export file) | `mcdata import <cred/bu> --file <path>...` |
| **Import to BU...** | Multi-select target BUs, runs `mcdata import --from <src> --to <tgt>... --de <key>...` | Multi-select target BUs, runs `mcdata import --to <tgt>... --file <path>...` |

The assembled `mcdata` command runs in a dedicated integrated terminal so you can see live output.

## Settings

| Setting | Default | Description |
|---|---|---|
| `sfmcData.mcdataPath` | `""` | Optional path to the `mcdata` binary (highest priority). If empty: workspace `node_modules/.bin`, then `mcdata` on `PATH`, then the version bundled with the extension. |
| `sfmcData.importApi` | `async` | REST API family used for imports (`async` \| `sync`). |
| `sfmcData.defaultMode` | `upsert` | Default row write mode (`upsert` \| `insert` \| `update`). `insert` and `update` require `--api sync`. |
| `sfmcData.defaultFormat` | `csv` | Default file format for exports and imports (`csv` \| `tsv` \| `json`). |

## How it works

The extension reads `.mcdevrc.json` to populate credential and BU quick-picks. It then constructs a `mcdata export` or `mcdata import` command and runs it in VS Code's integrated terminal with the mcdev project root as the working directory.

No SFMC API calls are made by the extension itself — all network activity goes through the `mcdata` CLI.

## Release Notes

See [CHANGELOG.md](./CHANGELOG.md).
