/**
 * Utilities for parsing mcdev project file paths that appear in the VS Code
 * explorer context menu, extracting the credential/BU pair and the DE customer
 * key from the path structure and filename.
 */

import * as path from 'node:path';

export type ParsedContextFile = {
    /** Whether the file lives under `retrieve/` (definition) or `data/` (export). */
    type: 'retrieve' | 'data';
    cred: string;
    bu: string;
    /** `"<cred>/<bu>"` convenience string for CLI flags. */
    credBu: string;
    /** DE customer key extracted from the filename. */
    deKey: string;
    /** Absolute path to the file (used for `--file` args in data mode). */
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
 * - `data/<cred>/<bu>/<key>+MCDATA+<timestamp>.<ext>`
 *
 * @param filePath   Absolute path of the selected file.
 * @param projectRoot Absolute path of the mcdev project root.
 */
export function parseContextFilePath(
    filePath: string,
    projectRoot: string
): ParsedContextFile | undefined {
    const rel = path.relative(projectRoot, filePath);
    const parts = rel.split(path.sep);

    // retrieve/<cred>/<bu>/dataExtension/<filename>
    if (
        parts.length === 5 &&
        parts[0] === 'retrieve' &&
        parts[3] === 'dataExtension'
    ) {
        const deKey = parts[4].split('.')[0];
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

    // data/<cred>/<bu>/<key>+MCDATA+<timestamp>.<ext>
    if (parts.length === 4 && parts[0] === 'data') {
        const mcdataIdx = parts[3].indexOf('+MCDATA+');
        if (mcdataIdx === -1) return undefined;
        const deKey = parts[3].substring(0, mcdataIdx);
        if (!deKey) return undefined;
        return {
            type: 'data',
            cred: parts[1],
            bu: parts[2],
            credBu: `${parts[1]}/${parts[2]}`,
            deKey,
            filePath,
        };
    }

    return undefined;
}
