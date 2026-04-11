import * as vscode from 'vscode';
import { findMcdevProjectRoot } from '../config';
import { runMcdataWithProgress } from '../runMcdata';
import { buildImportArgs } from '../argbuilder';
import { resolveContextFiles } from './contextUtils';
import { promptOptionalClearBeforeImport } from '../importClearPrompts';
import { resolveImportWriteMode } from '../importMode';
import { resolveBackupBeforeImport } from '../importBackupPrompt';

export function registerContextImportCommand(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand(
            'sfmc-data.contextImportDE',
            (uri: vscode.Uri, uris: vscode.Uri[]) => contextImportDE(context, uri, uris)
        )
    );
}

async function contextImportDE(
    context: vscode.ExtensionContext,
    uri: vscode.Uri,
    uris: vscode.Uri[]
): Promise<void> {
    const projectRoot = findMcdevProjectRoot(vscode.workspace.workspaceFolders);
    if (!projectRoot) {
        void vscode.window.showErrorMessage(
            'No mcdev project found. Open a folder containing .mcdevrc.json.'
        );
        return;
    }

    const files = resolveContextFiles(uri, uris, projectRoot);
    if (!files) return;
    const { parsed, credBu } = files;

    const cfg = vscode.workspace.getConfiguration('sfmcData');
    const useGit = cfg.get<boolean>('useGitFilenames') === true;

    const mode = await resolveImportWriteMode(cfg);
    if (mode === undefined) return;

    const backupBeforeImport = await resolveBackupBeforeImport(cfg);
    if (backupBeforeImport === undefined) return;

    const clearChoice = await promptOptionalClearBeforeImport();

    if (parsed[0].type === 'data') {
        const filePaths = parsed.map((f) => f.filePath);
        const args = buildImportArgs(
            credBu,
            {
                filePaths,
                mode,
                backupBeforeImport,
                clearBeforeImport: clearChoice.clearBeforeImport,
                acceptClearRisk: clearChoice.acceptClearRisk,
            },
            useGit
        );
        await runMcdataWithProgress(context, projectRoot, args, {
            progressTitle: 'SFMC Data — Import',
        });
    } else {
        const deKeys = parsed.map((f) => f.deKey);
        const args = buildImportArgs(
            credBu,
            {
                deKeys,
                mode,
                backupBeforeImport,
                clearBeforeImport: clearChoice.clearBeforeImport,
                acceptClearRisk: clearChoice.acceptClearRisk,
            },
            useGit
        );
        await runMcdataWithProgress(context, projectRoot, args, {
            progressTitle: 'SFMC Data — Import',
        });
    }
}
