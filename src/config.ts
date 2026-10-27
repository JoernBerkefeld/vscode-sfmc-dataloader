import * as vscode from 'vscode';
import * as fs from 'node:fs';
import path from 'node:path';
import type { Mcdevrc } from './mcdevrcParser';
import { validateMaxRowsPerFile, type ExportFileOptions } from './argbuilder';

const FILE_MCDEV_RC = '.mcdevrc.json';
const FILE_MCDATA_RC = '.mcdatarc.json';

/**
 * Walks the open workspace folders and returns the first folder that contains
 * either `.mcdevrc.json` (checked first) or `.mcdatarc.json`.
 * Returns `undefined` when neither is found in any workspace folder.
 * @param workspaceFolders - VS Code workspace folders (or undefined)
 * @returns {string | undefined} absolute path to the project root folder, if found
 */
export function findProjectRoot(
    workspaceFolders: readonly vscode.WorkspaceFolder[] | undefined
): string | undefined {
    if (!workspaceFolders) {
        return undefined;
    }
    for (const folder of workspaceFolders) {
        if (folder.uri.scheme !== 'file') {
            continue;
        }
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
 * Resolves a disk-backed project without allowing context selections to cross projects.
 * Palette invocations ignore the active editor; context invocations use it only
 * when neither an explicit URI nor a nonempty URI selection was supplied.
 * @param workspaceFolders - Open workspace folders.
 * @param mode - Whether this is a context command or a palette invocation.
 * @param uri - Explicit context resource, when supplied.
 * @param uris - Explicit multi-selection, when supplied.
 * @returns {Promise<string | undefined>} Selected project path, or undefined for cancellation or no configured project.
 * @throws {Error} When a resource is virtual, outside the workspace, or crosses projects.
 */
export async function selectProjectRoot(
    workspaceFolders: readonly vscode.WorkspaceFolder[] | undefined,
    mode: 'context' | 'palette',
    uri?: vscode.Uri,
    uris?: readonly vscode.Uri[]
): Promise<string | undefined> {
    const resources = [...(uri ? [uri] : []), ...(uris ?? [])];
    if (mode === 'context' && resources.length === 0) {
        const activeUri = vscode.window.activeTextEditor?.document.uri;
        if (activeUri) resources.push(activeUri);
    }
    if (resources.length > 0) {
        // Validate the entire selection before any filesystem access.
        let owner: vscode.WorkspaceFolder | undefined;
        for (const resource of resources) {
            if (resource.scheme !== 'file') {
                throw new Error('SFMC Data Loader requires file resources on the extension host.');
            }
            const folder = vscode.workspace.getWorkspaceFolder(resource);
            if (
                !folder ||
                !workspaceFolders?.some(
                    (candidate) => candidate.uri.toString() === folder.uri.toString()
                )
            ) {
                throw new Error('Select a resource inside an open workspace folder.');
            }
            if (folder.uri.scheme !== 'file') {
                throw new Error('SFMC Data Loader requires a disk-backed workspace folder.');
            }
            if (owner && owner.uri.toString() !== folder.uri.toString()) {
                throw new Error('Select resources from a single project.');
            }
            owner = folder;
        }
        return findProjectRoot(owner ? [owner] : undefined);
    }
    if (mode === 'context') return undefined;

    const configured = (workspaceFolders ?? []).filter((folder) => findProjectRoot([folder]));
    if (configured.length === 1) return configured[0].uri.fsPath;
    if (configured.length === 0) {
        const action = await vscode.window.showErrorMessage(
            'No SFMC project config found. Open a disk-backed workspace folder containing .mcdevrc.json or .mcdatarc.json, or use SFMC Data: Initialize Project.',
            'Initialize Project'
        );
        if (action === 'Initialize Project') {
            await vscode.commands.executeCommand('sfmc-data.initProject');
        }
        return undefined;
    }
    const selected = await vscode.window.showQuickPick(
        configured.map((folder) => ({
            label: folder.name,
            description: folder.uri.fsPath,
            folder,
        })),
        { placeHolder: 'Select an SFMC Data Loader project' }
    );
    return selected?.folder.uri.fsPath;
}

/**
 * Reads folder-specific extension settings for a selected disk-backed project.
 * @param projectRoot - Selected project path.
 * @returns {vscode.WorkspaceConfiguration} Resource-aware SFMC Data Loader configuration.
 */
// eslint-disable-next-line unicorn/name-replacements -- Matches the VS Code getConfiguration API and consumer integration contract.
export function getProjectConfiguration(projectRoot: string): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration('sfmcData', vscode.Uri.file(projectRoot));
}

/**
 * Reads and validates export file settings before launching a transfer.
 * @param config - Resource-aware extension settings.
 * @returns {ExportFileOptions | undefined} Options, or undefined after reporting invalid settings.
 */
export function getExportFileOptions(
    config: vscode.WorkspaceConfiguration
): ExportFileOptions | undefined {
    const maxRowsPerFile = config.get<number | null>('maxRowsPerFile');
    try {
        validateMaxRowsPerFile(maxRowsPerFile);
    } catch (ex) {
        void vscode.window.showErrorMessage((ex as Error).message);
        return undefined;
    }
    return { jsonPretty: config.get<boolean>('jsonPretty') === true, maxRowsPerFile };
}

/**
 * Reads and parses the project config from `projectRoot`.
 * Prefers `.mcdevrc.json` when present; falls back to `.mcdatarc.json`.
 * Both files share the same `credentials.<name>.businessUnits` shape.
 * @param projectRoot - absolute path to the project root
 * @returns {Mcdevrc} parsed credential / business unit map
 * @throws {Error} if neither config file exists or contains invalid JSON
 */
export function readProjectConfig(projectRoot: string): Mcdevrc {
    const filename = fs.existsSync(path.join(projectRoot, FILE_MCDEV_RC))
        ? FILE_MCDEV_RC
        : FILE_MCDATA_RC;
    const contents = fs.readFileSync(path.join(projectRoot, filename), 'utf8');
    try {
        return JSON.parse(contents) as Mcdevrc;
    } catch {
        throw new Error(`Invalid JSON in ${filename}. Fix the file and try again.`);
    }
}

/**
 * @param workspaceFolders - VS Code workspace folders (or undefined)
 * @returns {string | undefined} absolute path to the project root folder, if found
 * @deprecated Use `findProjectRoot` instead — supports both `.mcdevrc.json` and `.mcdatarc.json`.
 */
export function findMcdevProjectRoot(
    workspaceFolders: readonly vscode.WorkspaceFolder[] | undefined
): string | undefined {
    return findProjectRoot(workspaceFolders);
}

/**
 * @param projectRoot - absolute path to the project root
 * @returns {Mcdevrc} parsed credential / business unit map
 * @deprecated Use `readProjectConfig` instead — supports both `.mcdevrc.json` and `.mcdatarc.json`.
 */
export function readMcdevrc(projectRoot: string): Mcdevrc {
    return readProjectConfig(projectRoot);
}
