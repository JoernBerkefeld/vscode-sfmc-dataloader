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
