/**
 * Pure argument-builder functions for the mcdata CLI.
 * No VS Code or filesystem imports — safe to unit-test directly.
 */

export type ImportOptions = {
    deKeys?: string[];
    filePaths?: string[];
    mode: string;
    clearBeforeImport: boolean;
    acceptClearRisk: boolean;
    /** true = pass --backup-before-import, false = pass --no-backup-before-import, undefined = omit flag */
    backupBeforeImport?: boolean;
};

export type MultiBuExportOptions = {
    /** `<credential>/<businessUnit>` tokens — maps to repeated `--from` flags */
    fromCredBus: string[];
    deKeys: string[];
    format: string;
    jsonPretty?: boolean;
    useGit?: boolean;
};

export type FileToMultiBuImportOptions = {
    /** Absolute file paths — maps to repeated `--file` flags */
    filePaths: string[];
    /** One or more target `<credential>/<businessUnit>` tokens — maps to repeated `--to` flags */
    toCredBus: string[];
    mode: string;
    clearBeforeImport: boolean;
    acceptClearRisk: boolean;
    useGit?: boolean;
    /** true = pass --backup-before-import, false = pass --no-backup-before-import, undefined = omit flag */
    backupBeforeImport?: boolean;
};

export type CrossBuImportOptions = {
    /** Single source `<credential>/<businessUnit>` — maps to `--from` */
    fromCredBu: string;
    /** One or more target `<credential>/<businessUnit>` tokens — maps to repeated `--to` */
    toCredBus: string[];
    deKeys: string[];
    mode: string;
    clearBeforeImport: boolean;
    acceptClearRisk: boolean;
    useGit?: boolean;
    /** true = pass --backup-before-import, false = pass --no-backup-before-import, undefined = omit flag */
    backupBeforeImport?: boolean;
};

/**
 * Builds the argument list for `mcdata export <credBu> ...`.
 * @param credBu - `<credential>/<businessUnit>` token
 * @param deKeys - one or more DE customer keys
 * @param format - csv | tsv | json
 * @param useGit - when true, append `--git` for stable `*.mcdata.<ext>` filenames
 * @returns {string[]} argv tokens for the mcdata subprocess
 */
export function buildExportArgs(
    credBu: string,
    deKeys: string[],
    format: string,
    useGit?: boolean
): string[] {
    const args: string[] = ['export', credBu, '--format', format];
    if (useGit) {
        args.push('--git');
    }
    for (const key of deKeys) {
        args.push('--de', key);
    }
    return args;
}

/**
 * Builds the argument list for `mcdata export --from ... --from ... --de ...`.
 * @param options - multi-BU export settings
 * @returns {string[]} argv tokens for the mcdata subprocess
 */
export function buildMultiBuExportArgs(options: MultiBuExportOptions): string[] {
    const args: string[] = ['export', '--format', options.format];
    if (options.useGit) {
        args.push('--git');
    }
    for (const credBu of options.fromCredBus) {
        args.push('--from', credBu);
    }
    for (const key of options.deKeys) {
        args.push('--de', key);
    }
    if (options.jsonPretty) {
        args.push('--json-pretty');
    }
    return args;
}

/**
 * Appends `--backup-before-import` or `--no-backup-before-import` when the value is
 * explicitly `true` or `false`. When `undefined`, no flag is added (CLI falls back to
 * its TTY-interactive default).
 * @param args - argument array to mutate
 * @param backupBeforeImport - true/false/undefined
 * @returns {void}
 */
function pushBackupFlag(args: string[], backupBeforeImport: boolean | undefined): void {
    if (backupBeforeImport === true) {
        args.push('--backup-before-import');
    } else if (backupBeforeImport === false) {
        args.push('--no-backup-before-import');
    }
}

/**
 * Builds the argument list for `mcdata import --to <tgt> [--to <tgt>] --file <path> [--file <path>] ...`.
 *
 * Used when the source data is already on disk (data/ export files).
 * No `--from` is emitted — the DE key is derived from each filename by the CLI.
 * Import format is detected automatically by the CLI from each file's extension.
 * @param options - file-to-multi-BU import settings
 * @returns {string[]} argv tokens for the mcdata subprocess
 */
export function buildFileToMultiBuImportArgs(options: FileToMultiBuImportOptions): string[] {
    const args: string[] = ['import', '--mode', options.mode];
    pushBackupFlag(args, options.backupBeforeImport);
    if (options.useGit) {
        args.push('--git');
    }
    for (const credBu of options.toCredBus) {
        args.push('--to', credBu);
    }
    for (const fp of options.filePaths) {
        args.push('--file', fp);
    }
    if (options.clearBeforeImport) {
        args.push('--clear-before-import');
    }
    if (options.acceptClearRisk) {
        args.push('--i-accept-clear-data-risk');
    }
    return args;
}

/**
 * Builds the argument list for `mcdata import --from <src> --to <tgt> [--to <tgt>] ...`.
 * Import format is detected automatically by the CLI from the source data.
 * @param options - cross-BU import settings
 * @returns {string[]} argv tokens for the mcdata subprocess
 */
export function buildCrossBuImportArgs(options: CrossBuImportOptions): string[] {
    const args: string[] = ['import', '--from', options.fromCredBu, '--mode', options.mode];
    pushBackupFlag(args, options.backupBeforeImport);
    if (options.useGit) {
        args.push('--git');
    }
    for (const credBu of options.toCredBus) {
        args.push('--to', credBu);
    }
    for (const key of options.deKeys) {
        args.push('--de', key);
    }
    if (options.clearBeforeImport) {
        args.push('--clear-before-import');
    }
    if (options.acceptClearRisk) {
        args.push('--i-accept-clear-data-risk');
    }
    return args;
}

/**
 * Builds the argument list for `mcdata import <credBu> ...`.
 *
 * Exactly one of `deKeys` or `filePaths` must be supplied (mirrors CLI mutual
 * exclusion between `--de` and `--file`).
 * Import format is detected automatically by the CLI from the file extension.
 * @param credBu - `<credential>/<businessUnit>` token
 * @param options - import settings derived from VS Code settings and user input
 * @param useGit - when true, append `--git` for stable `*.mcdata.<ext>` filenames
 * @returns {string[]} argv tokens for the mcdata subprocess
 */
export function buildImportArgs(
    credBu: string,
    options: ImportOptions,
    useGit?: boolean
): string[] {
    const args: string[] = ['import', credBu, '--mode', options.mode];
    pushBackupFlag(args, options.backupBeforeImport);
    if (useGit) {
        args.push('--git');
    }

    if (options.deKeys) {
        for (const key of options.deKeys) {
            args.push('--de', key);
        }
    }

    if (options.filePaths) {
        for (const fp of options.filePaths) {
            args.push('--file', fp);
        }
    }

    if (options.clearBeforeImport) {
        args.push('--clear-before-import');
    }

    if (options.acceptClearRisk) {
        args.push('--i-accept-clear-data-risk');
    }

    return args;
}
