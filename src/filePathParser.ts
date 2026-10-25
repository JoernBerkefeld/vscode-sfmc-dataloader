/**
 * Utilities for parsing mcdev project file paths that appear in the VS Code
 * explorer context menu, extracting the credential/BU pair and the DE customer
 * key from the path structure and filename.
 */

import path from 'node:path';
import { parseExportBasename, reverseFilterIllegalFilenames } from 'sfmc-dataloader';

export type ParsedContextFile = {
    /**
     * Whether the file lives under `retrieve/` (definition) or `data/` (export).
     */
    type: 'retrieve' | 'data';
    cred: string;
    bu: string;
    /**
     * `"<cred>/<bu>"` convenience string for CLI flags.
     */
    credBu: string;
    /**
     * DE customer key extracted from the filename.
     */
    deKey: string;
    /**
     * Absolute path to the file (used for `--file` args in data mode).
     */
    filePath: string;
};

/**
 * Parses a file path from the VS Code explorer into its mcdev project
 * components.  Returns `undefined` when the path does not match a recognised
 * pattern.
 *
 * Recognised patterns (relative to `projectRoot`):
 * - `retrieve/<cred>/<bu>/dataExtension/<key>.dataExtension-meta.json`
 * - `retrieve/<cred>/<bu>/dataExtension/<key>.dataExtension-doc.md`
 * - `data/<cred>/<bu>/<basename>` where basename matches `sfmc-dataloader` export naming (`.mcdata.`)
 * @param filePath   Absolute path of the selected file.
 * @param projectRoot Absolute path of the mcdev project root.
 * @returns {ParsedContextFile | undefined} parsed components, or undefined if the path is not recognised
 */
export function parseContextFilePath(
    filePath: string,
    projectRoot: string
): ParsedContextFile | undefined {
    const relative = path.relative(projectRoot, filePath);
    const parts = relative.split(path.sep);

    // retrieve/<cred>/<bu>/dataExtension/<filename>
    if (parts.length === 5 && parts[0] === 'retrieve' && parts[3] === 'dataExtension') {
        const suffix = ['.dataExtension-meta.json', '.dataExtension-doc.md'].find((ending) =>
            parts[4].endsWith(ending)
        );
        if (!suffix) return undefined;
        let deKey: string;
        try {
            deKey = reverseFilterIllegalFilenames(parts[4].slice(0, -suffix.length));
        } catch {
            return undefined;
        }
        if (!deKey) return undefined;
        return {
            type: 'retrieve',
            cred: parts[1],
            bu: parts[2],
            credBu: `${parts[1]}/${parts[2]}`,
            deKey,
            filePath,
        };
    }

    // data/<cred>/<bu>/<export-basename>
    if (parts.length === 4 && parts[0] === 'data') {
        try {
            const { customerKey: deKey, ext } = parseExportBasename(parts[3]);
            if (!deKey || !['csv', 'tsv', 'json'].includes(ext)) return undefined;
            return {
                type: 'data',
                cred: parts[1],
                bu: parts[2],
                credBu: `${parts[1]}/${parts[2]}`,
                deKey,
                filePath,
            };
        } catch {
            return undefined;
        }
    }

    return undefined;
}
