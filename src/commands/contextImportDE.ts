import * as vscode from 'vscode';
import { findMcdevProjectRoot } from '../config';
import { resolveMcdataShellPrefixForTerminal, spawnMcdataInTerminal } from '../terminal';
import { buildImportArgs } from '../argbuilder';
import { resolveContextFiles } from './contextUtils';
import { promptOptionalClearBeforeImport } from '../importClearPrompts';

export function registerContextImportCommand(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('sfmc-data.contextImportDE', (uri: vscode.Uri, uris: vscode.Uri[]) =>
            contextImportDE(context, uri, uris)
        )
    );
}

function resolveImportMode(cfg: vscode.WorkspaceConfiguration): 'upsert' | 'insert' {
    const raw = cfg.get<string>('defaultMode') ?? 'upsert';
    return raw === 'insert' ? 'insert' : 'upsert';
}

async function contextImportDE(
    context: vscode.ExtensionContext,
    uri: vscode.Uri,
    uris: vscode.Uri[]
): Promise<void> {
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
    const mode = resolveImportMode(cfg);
    const useGit = cfg.get<boolean>('useGitFilenames') === true;

    const clearChoice = await promptOptionalClearBeforeImport();

    const prefix = resolveMcdataShellPrefixForTerminal(context, projectRoot);
    if (prefix === undefined) return;

    if (parsed[0].type === 'data') {
        const filePaths = parsed.map((f) => f.filePath);
        const args = buildImportArgs(
            credBu,
            {
                filePaths,
                format,
                mode,
                clearBeforeImport: clearChoice.clearBeforeImport,
                acceptClearRisk: clearChoice.acceptClearRisk,
            },
            useGit
        );
        spawnMcdataInTerminal(projectRoot, prefix, args);
    } else {
        const deKeys = parsed.map((f) => f.deKey);
        const args = buildImportArgs(
            credBu,
            {
                deKeys,
                format,
                mode,
                clearBeforeImport: clearChoice.clearBeforeImport,
                acceptClearRisk: clearChoice.acceptClearRisk,
            },
            useGit
        );
        spawnMcdataInTerminal(projectRoot, prefix, args);
    }
}
