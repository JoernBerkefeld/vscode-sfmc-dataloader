# SFMC Data Loader — VS Code Extension

A lightweight VS Code extension that surfaces the [`sfmc-dataloader`](https://www.npmjs.com/package/sfmc-dataloader) CLI (`mcdata`) as Command Palette commands.

## Requirements

- An mcdev project initialised with [`mcdev`](https://www.npmjs.com/package/mcdev) (`.mcdevrc.json` + `.mcdev-auth.json` in the workspace root)
- `sfmc-dataloader` installed globally or available as a local binary:

```bash
npm install -g sfmc-dataloader
# or inside the project
npm install sfmc-dataloader
```

## Commands

| Command | Description |
|---|---|
| `SFMC Data: Export DE Data` | Export one or more Data Extension rows to CSV/TSV/JSON |
| `SFMC Data: Import DE Data` | Import rows from a file or by DE key |

Both commands open a guided QuickPick workflow:

1. **Select credential** (skipped when only one exists)
2. **Select Business Unit** (skipped when only one exists)
3. **Enter DE key(s)** or **select file(s)**

The assembled `mcdata` command runs in a dedicated integrated terminal so you can see live output.

## Settings

| Setting | Default | Description |
|---|---|---|
| `sfmcData.mcdataPath` | `""` | Custom path to the `mcdata` binary. Leave blank to use `mcdata` from `PATH`. |
| `sfmcData.importApi` | `async` | REST API family used for imports (`async` \| `sync`). |
| `sfmcData.defaultMode` | `upsert` | Default row write mode (`upsert` \| `insert` \| `update`). `insert` and `update` require `--api sync`. |
| `sfmcData.defaultFormat` | `csv` | Default file format for exports and imports (`csv` \| `tsv` \| `json`). |

## How it works

The extension reads `.mcdevrc.json` to populate credential and BU quick-picks. It then constructs a `mcdata export` or `mcdata import` command and runs it in VS Code's integrated terminal with the mcdev project root as the working directory.

No SFMC API calls are made by the extension itself — all network activity goes through the `mcdata` CLI.

## Release Notes

See [CHANGELOG.md](./CHANGELOG.md).
