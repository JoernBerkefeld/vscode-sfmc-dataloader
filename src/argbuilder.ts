/**
 * Pure argument-builder functions for the mcdata CLI.
 * No VS Code or filesystem imports — safe to unit-test directly.
 */

export type ImportOptions = {
    deKeys?: string[];
    filePaths?: string[];
    format: string;
    api: string;
    mode: string;
    clearBeforeImport: boolean;
    acceptClearRisk: boolean;
};

export type MultiBuExportOptions = {
    /** `<credential>/<businessUnit>` tokens — maps to repeated `--from` flags */
    fromCredBus: string[];
    deKeys: string[];
    format: string;
    jsonPretty?: boolean;
};

export type FileToMultiBuImportOptions = {
    /** Absolute file paths — maps to repeated `--file` flags */
    filePaths: string[];
    /** One or more target `<credential>/<businessUnit>` tokens — maps to repeated `--to` flags */
    toCredBus: string[];
    format: string;
    api: string;
    mode: string;
    clearBeforeImport: boolean;
    acceptClearRisk: boolean;
};

export type CrossBuImportOptions = {
    /** Single source `<credential>/<businessUnit>` — maps to `--from` */
    fromCredBu: string;
    /** One or more target `<credential>/<businessUnit>` tokens — maps to repeated `--to` */
    toCredBus: string[];
    deKeys: string[];
    format: string;
    api: string;
    mode: string;
    clearBeforeImport: boolean;
    acceptClearRisk: boolean;
};

/**
 * Builds the argument list for `mcdata export <credBu> ...`.
 *
 * @param credBu - `<credential>/<businessUnit>` token
 * @param deKeys - one or more DE customer keys
 * @param format - csv | tsv | json
 */
export function buildExportArgs(credBu: string, deKeys: string[], format: string): string[] {
    const args: string[] = ['export', credBu, '--format', format];
    for (const key of deKeys) {
        args.push('--de', key);
    }
    return args;
}

/**
 * Builds the argument list for `mcdata export --from ... --from ... --de ...`.
 *
 * @param options - multi-BU export settings
 */
export function buildMultiBuExportArgs(options: MultiBuExportOptions): string[] {
    const args: string[] = ['export', '--format', options.format];
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
 * Builds the argument list for `mcdata import --to <tgt> [--to <tgt>] --file <path> [--file <path>] ...`.
 *
 * Used when the source data is already on disk (data/ export files).
 * No `--from` is emitted — the DE key is derived from each filename by the CLI.
 *
 * @param options - file-to-multi-BU import settings
 */
export function buildFileToMultiBuImportArgs(options: FileToMultiBuImportOptions): string[] {
    const args: string[] = ['import', '--format', options.format, '--api', options.api, '--mode', options.mode];
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
 *
 * @param options - cross-BU import settings
 */
export function buildCrossBuImportArgs(options: CrossBuImportOptions): string[] {
    const args: string[] = [
        'import',
        '--from', options.fromCredBu,
        '--format', options.format,
        '--api', options.api,
        '--mode', options.mode,
    ];
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
 *
 * @param credBu - `<credential>/<businessUnit>` token
 * @param options - import settings derived from VS Code settings and user input
 */
export function buildImportArgs(credBu: string, options: ImportOptions): string[] {
    const args: string[] = ['import', credBu, '--format', options.format, '--api', options.api, '--mode', options.mode];

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
