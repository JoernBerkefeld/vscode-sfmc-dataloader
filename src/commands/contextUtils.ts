/**
 * Shared helpers for explorer-context commands.
 */

import * as vscode from 'vscode';
import { parseContextFilePath, type ParsedContextFile } from '../filePathParser';

export type ResolvedContextFiles = {
    parsed: ParsedContextFile[];
    credBu: string;
};

/**
 * Resolves the selected files from a context menu invocation, parses their
 * paths and validates that all files belong to the same credential/BU.
 *
 * Returns `undefined` (after showing an error message) when:
 * - no recognisable files are found
 * - selected files span more than one credential/BU
 * @param uri   The right-clicked file URI (may be undefined if called from palette).
 * @param uris  All selected file URIs (populated by VS Code on multi-select).
 * @param projectRoot Absolute path to the mcdev project root.
 */
export function resolveContextFiles(
    uri: vscode.Uri | undefined,
    uris: vscode.Uri[] | undefined,
    projectRoot: string
): ResolvedContextFiles | undefined {
    const allUris = uris && uris.length > 0 ? uris : uri ? [uri] : [];

    const parsed: ParsedContextFile[] = [];
    for (const u of allUris) {
        const result = parseContextFilePath(u.fsPath, projectRoot);
        if (result) {
            parsed.push(result);
        }
    }

    if (parsed.length === 0) {
        void vscode.window.showErrorMessage(
            'SFMC Data Loader: selected file(s) are not recognised mcdev dataExtension or data export files.'
        );
        return undefined;
    }

    // All files must be in the same credential/BU
    const credBu = parsed[0].credBu;
    if (parsed.some((f) => f.credBu !== credBu)) {
        void vscode.window.showErrorMessage(
            'SFMC Data Loader: all selected files must belong to the same credential/BU. ' +
                'Please select files from a single BU folder.'
        );
        return undefined;
    }

    return { parsed, credBu };
}
