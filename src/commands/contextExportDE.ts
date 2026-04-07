import * as vscode from 'vscode';
import { findMcdevProjectRoot } from '../config';
import { getMcdataCommand, spawnMcdataInTerminal } from '../terminal';
import { buildExportArgs } from '../argbuilder';
import { parseContextFilePath } from '../filePathParser';
import { resolveContextFiles } from './contextUtils';

export function registerContextExportCommand(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('sfmc-data.contextExportDE', contextExportDE)
    );
}

async function contextExportDE(uri: vscode.Uri, uris: vscode.Uri[]): Promise<void> {
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
    const deKeys = parsed.map((f) => f.deKey);

    const mcdata = getMcdataCommand();
    const args = buildExportArgs(credBu, deKeys, format);
    spawnMcdataInTerminal(projectRoot, mcdata, args);
}
