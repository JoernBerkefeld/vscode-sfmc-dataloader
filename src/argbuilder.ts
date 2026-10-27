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
    /**
     * true = pass --backup-before-import, false = pass --no-backup-before-import, undefined = omit flag
     */
    backupBeforeImport?: boolean;
    skipEmptyLines?: boolean;
};

export type ExportFileOptions = {
    jsonPretty?: boolean;
    maxRowsPerFile?: number | null;
};

export type MultiBuExportOptions = ExportFileOptions & {
    /**
     * `<credential>/<businessUnit>` tokens — maps to repeated `--from` flags
     */
    fromCredBus: string[];
    deKeys: string[];
    format: string;
    useGit?: boolean;
};

export type FileToMultiBuImportOptions = {
    /**
     * Absolute file paths — maps to repeated `--file` flags
     */
    filePaths: string[];
    /**
     * One or more target `<credential>/<businessUnit>` tokens — maps to repeated `--to` flags
     */
    toCredBus: string[];
    mode: string;
    clearBeforeImport: boolean;
    acceptClearRisk: boolean;
    useGit?: boolean;
    /**
     * true = pass --backup-before-import, false = pass --no-backup-before-import, undefined = omit flag
     */
    backupBeforeImport?: boolean;
    skipEmptyLines?: boolean;
};

export type CrossBuImportOptions = {
    /**
     * Single source `<credential>/<businessUnit>` — maps to `--from`
     */
    fromCredBu: string;
    /**
     * One or more target `<credential>/<businessUnit>` tokens — maps to repeated `--to`
     */
    toCredBus: string[];
    deKeys: string[];
    mode: string;
    clearBeforeImport: boolean;
    acceptClearRisk: boolean;
    useGit?: boolean;
    /**
     * true = pass --backup-before-import, false = pass --no-backup-before-import, undefined = omit flag
     */
    backupBeforeImport?: boolean;
    skipEmptyLines?: boolean;
};

/**
 * Builds the argument list for `mcdata export <credBu> ...`.
 * @param credBu - `<credential>/<businessUnit>` token
 * @param deKeys - one or more DE customer keys
 * @param format - csv | tsv | json
 * @param shouldUseGit - when true, append `--git` for stable `*.mcdata.<ext>` filenames
 * @param options - optional JSON formatting and file splitting settings
 * @returns {string[]} argv tokens for the mcdata subprocess
 */
export function buildExportArguments(
    credBu: string,
    deKeys: string[],
    format: string,
    shouldUseGit?: boolean,
    options: ExportFileOptions = {}
): string[] {
    const arguments_: string[] = ['export', credBu, '--format', format];
    if (shouldUseGit) {
        arguments_.push('--git');
    }
    for (const key of deKeys) {
        arguments_.push('--de', key);
    }
    pushExportFileFlags(arguments_, format, options);
    return arguments_;
}

/**
 * Checks a configured export split size without coercing strings or fractions.
 * @param value - Optional maximum data rows per file.
 * @returns {void}
 * @throws {Error} When a supplied value is not a positive safe integer.
 */
export function validateMaxRowsPerFile(value: unknown): void {
    if (
        value !== undefined &&
        value !== null &&
        (!Number.isSafeInteger(value) || Number(value) <= 0)
    ) {
        throw new Error(
            'sfmcData.maxRowsPerFile must be a positive safe integer or null (no splitting).'
        );
    }
}

/**
 * Appends export-only flags shared by single- and multi-BU builders.
 * @param arguments_ - CLI arguments to extend.
 * @param format - Selected output format.
 * @param options - Formatting and splitting settings.
 * @returns {void}
 */
function pushExportFileFlags(
    arguments_: string[],
    format: string,
    options: ExportFileOptions
): void {
    validateMaxRowsPerFile(options.maxRowsPerFile);
    if (format === 'json' && options.jsonPretty === true) {
        arguments_.push('--json-pretty');
    }
    if (options.maxRowsPerFile !== undefined && options.maxRowsPerFile !== null) {
        arguments_.push('--max-rows-per-file', String(options.maxRowsPerFile));
    }
}

/**
 * Builds the argument list for `mcdata export --from ... --from ... --de ...`.
 * @param options - multi-BU export settings
 * @returns {string[]} argv tokens for the mcdata subprocess
 */
export function buildMultiBuExportArguments(options: MultiBuExportOptions): string[] {
    const arguments_: string[] = ['export', '--format', options.format];
    if (options.useGit) {
        arguments_.push('--git');
    }
    for (const credBu of options.fromCredBus) {
        arguments_.push('--from', credBu);
    }
    for (const key of options.deKeys) {
        arguments_.push('--de', key);
    }
    pushExportFileFlags(arguments_, options.format, options);
    return arguments_;
}

/**
 * Appends `--backup-before-import` or `--no-backup-before-import` when the value is
 * explicitly `true` or `false`. When `undefined`, no flag is added (CLI falls back to
 * its TTY-interactive default).
 * @param arguments_ - argument array to mutate
 * @param backupBeforeImport - true/false/undefined
 * @returns {void}
 */
function pushBackupFlag(arguments_: string[], backupBeforeImport: boolean | undefined): void {
    if (backupBeforeImport === true) {
        arguments_.push('--backup-before-import');
    } else if (backupBeforeImport === false) {
        arguments_.push('--no-backup-before-import');
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
export function buildFileToMultiBuImportArguments(options: FileToMultiBuImportOptions): string[] {
    const arguments_: string[] = ['import', '--mode', options.mode];
    pushBackupFlag(arguments_, options.backupBeforeImport);
    if (options.skipEmptyLines === true) {
        arguments_.push('--skip-empty-lines');
    }
    if (options.useGit) {
        arguments_.push('--git');
    }
    for (const credBu of options.toCredBus) {
        arguments_.push('--to', credBu);
    }
    for (const fp of options.filePaths) {
        arguments_.push('--file', fp);
    }
    if (options.clearBeforeImport) {
        arguments_.push('--clear-before-import');
    }
    if (options.acceptClearRisk) {
        arguments_.push('--i-accept-clear-data-risk');
    }
    return arguments_;
}

/**
 * Builds the argument list for `mcdata import --from <src> --to <tgt> [--to <tgt>] ...`.
 * Import format is detected automatically by the CLI from the source data.
 * @param options - cross-BU import settings
 * @returns {string[]} argv tokens for the mcdata subprocess
 */
export function buildCrossBuImportArguments(options: CrossBuImportOptions): string[] {
    const arguments_: string[] = ['import', '--from', options.fromCredBu, '--mode', options.mode];
    pushBackupFlag(arguments_, options.backupBeforeImport);
    if (options.skipEmptyLines === true) {
        arguments_.push('--skip-empty-lines');
    }
    if (options.useGit) {
        arguments_.push('--git');
    }
    for (const credBu of options.toCredBus) {
        arguments_.push('--to', credBu);
    }
    for (const key of options.deKeys) {
        arguments_.push('--de', key);
    }
    if (options.clearBeforeImport) {
        arguments_.push('--clear-before-import');
    }
    if (options.acceptClearRisk) {
        arguments_.push('--i-accept-clear-data-risk');
    }
    return arguments_;
}

/**
 * Builds the argument list for `mcdata import <credBu> ...`.
 *
 * Exactly one of `deKeys` or `filePaths` must be supplied (mirrors CLI mutual
 * exclusion between `--de` and `--file`).
 * Import format is detected automatically by the CLI from the file extension.
 * @param credBu - `<credential>/<businessUnit>` token
 * @param options - import settings derived from VS Code settings and user input
 * @param shouldUseGit - when true, append `--git` for stable `*.mcdata.<ext>` filenames
 * @returns {string[]} argv tokens for the mcdata subprocess
 */
export function buildImportArguments(
    credBu: string,
    options: ImportOptions,
    shouldUseGit?: boolean
): string[] {
    const arguments_: string[] = ['import', credBu, '--mode', options.mode];
    pushBackupFlag(arguments_, options.backupBeforeImport);
    if (options.skipEmptyLines === true) {
        arguments_.push('--skip-empty-lines');
    }
    if (shouldUseGit) {
        arguments_.push('--git');
    }

    if (options.deKeys) {
        for (const key of options.deKeys) {
            arguments_.push('--de', key);
        }
    }

    if (options.filePaths) {
        for (const fp of options.filePaths) {
            arguments_.push('--file', fp);
        }
    }

    if (options.clearBeforeImport) {
        arguments_.push('--clear-before-import');
    }

    if (options.acceptClearRisk) {
        arguments_.push('--i-accept-clear-data-risk');
    }

    return arguments_;
}
