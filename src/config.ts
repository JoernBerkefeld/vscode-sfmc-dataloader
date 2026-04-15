import * as vscode from 'vscode';
import * as fs from 'node:fs';
import path from 'node:path';
import type { Mcdevrc } from './mcdevrcParser';

const FILE_MCDEV_RC = '.mcdevrc.json';
const FILE_MCDATA_RC = '.mcdatarc.json';

/**
 * Walks the open workspace folders and returns the first folder that contains
 * either `.mcdevrc.json` (checked first) or `.mcdatarc.json`.
 * Returns `undefined` when neither is found in any workspace folder.
 * @param workspaceFolders - VS Code workspace folders
 */
export function findProjectRoot(
    workspaceFolders: readonly vscode.WorkspaceFolder[] | undefined
): string | undefined {
    if (!workspaceFolders) {
        return undefined;
    }
    for (const folder of workspaceFolders) {
        const fsPath = folder.uri.fsPath;
        if (fs.existsSync(path.join(fsPath, FILE_MCDEV_RC))) {
            return fsPath;
        }
        if (fs.existsSync(path.join(fsPath, FILE_MCDATA_RC))) {
            return fsPath;
        }
    }
    return undefined;
}

/**
 * Reads and parses the project config from `projectRoot`.
 * Prefers `.mcdevrc.json` when present; falls back to `.mcdatarc.json`.
 * Both files share the same `credentials.<name>.businessUnits` shape.
 * @param projectRoot - absolute path to the project root
 * @throws if neither config file exists or contains invalid JSON
 */
export function readProjectConfig(projectRoot: string): Mcdevrc {
    const mcdevRcPath = path.join(projectRoot, FILE_MCDEV_RC);
    if (fs.existsSync(mcdevRcPath)) {
        return JSON.parse(fs.readFileSync(mcdevRcPath, 'utf8')) as Mcdevrc;
    }
    const mcdataRcPath = path.join(projectRoot, FILE_MCDATA_RC);
    return JSON.parse(fs.readFileSync(mcdataRcPath, 'utf8')) as Mcdevrc;
}

/**
 * @param workspaceFolders
 * @deprecated Use `findProjectRoot` instead — supports both `.mcdevrc.json` and `.mcdatarc.json`.
 */
export function findMcdevProjectRoot(
    workspaceFolders: readonly vscode.WorkspaceFolder[] | undefined
): string | undefined {
    return findProjectRoot(workspaceFolders);
}

/**
 * @param projectRoot
 * @deprecated Use `readProjectConfig` instead — supports both `.mcdevrc.json` and `.mcdatarc.json`.
 */
export function readMcdevrc(projectRoot: string): Mcdevrc {
    return readProjectConfig(projectRoot);
}
