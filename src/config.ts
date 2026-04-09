import * as vscode from 'vscode';
import * as fs from 'node:fs';
import path from 'node:path';
import type { Mcdevrc } from './mcdevrcParser';

/**
 * Walks the open workspace folders and returns the first folder that contains
 * a `.mcdevrc.json` file, or `undefined` when none is found.
 * @param workspaceFolders - VS Code workspace folders
 */
export function findMcdevProjectRoot(
    workspaceFolders: readonly vscode.WorkspaceFolder[] | undefined
): string | undefined {
    if (!workspaceFolders) return undefined;
    for (const folder of workspaceFolders) {
        const rcPath = path.join(folder.uri.fsPath, '.mcdevrc.json');
        if (fs.existsSync(rcPath)) {
            return folder.uri.fsPath;
        }
    }
    return undefined;
}

/**
 * Reads and parses `.mcdevrc.json` from the given project root.
 * @param projectRoot - absolute path to the mcdev project root
 * @throws if the file is missing or contains invalid JSON
 */
export function readMcdevrc(projectRoot: string): Mcdevrc {
    const rcPath = path.join(projectRoot, '.mcdevrc.json');
    return JSON.parse(fs.readFileSync(rcPath, 'utf8')) as Mcdevrc;
}
