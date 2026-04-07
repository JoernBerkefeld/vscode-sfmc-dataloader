import * as vscode from 'vscode';
import { findMcdevProjectRoot } from '../config';
import { getMcdataCommand, spawnMcdataInTerminal } from '../terminal';
import { buildImportArgs } from '../argbuilder';
import { resolveContextFiles } from './contextUtils';

export function registerContextImportCommand(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('sfmc-data.contextImportDE', contextImportDE)
    );
}

async function contextImportDE(uri: vscode.Uri, uris: vscode.Uri[]): Promise<void> {
    const projectRoot = findMcdevProjectRoot(vscode.workspace.workspaceFolders);
    if (!projectRoot) {
        void vscode.window.showErrorMessage('No mcdev project found. Open a folder containing .mcdevrc.json.');
        return;
    }

    const files = resolveContextFiles(uri, uris, projectRoot);
    if (!files) return;
    const { parsed, credBu } = files;

    const cfg = vscode.workspace.getConfiguration('sfmcData');
    const format = cfg.get<string>('defaultFormat') ?? 'csv';
    const api = cfg.get<string>('importApi') ?? 'async';
    const mode = cfg.get<string>('defaultMode') ?? 'upsert';

    const mcdata = getMcdataCommand();

    if (parsed[0].type === 'data') {
        // Use --file so the exact selected export files are imported
        const filePaths = parsed.map((f) => f.filePath);
        const args = buildImportArgs(credBu, {
            filePaths,
            format,
            api,
            mode,
            clearBeforeImport: false,
            acceptClearRisk: false,
        });
        spawnMcdataInTerminal(projectRoot, mcdata, args);
    } else {
        // retrieve files: use --de so the CLI resolves the latest matching export
        const deKeys = parsed.map((f) => f.deKey);
        const args = buildImportArgs(credBu, {
            deKeys,
            format,
            api,
            mode,
            clearBeforeImport: false,
            acceptClearRisk: false,
        });
        spawnMcdataInTerminal(projectRoot, mcdata, args);
    }
}
