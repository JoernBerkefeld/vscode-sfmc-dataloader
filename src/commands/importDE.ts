import * as vscode from 'vscode';
import { findProjectRoot, readProjectConfig } from '../config';
import { getCredentials, getBusinessUnits } from '../mcdevrcParser';
import { runMcdataWithProgress } from '../runMcdata';
import { buildImportArgs } from '../argbuilder';
import { promptOptionalClearBeforeImport } from '../importClearPrompts';
import { resolveImportWriteMode } from '../importMode';
import { resolveBackupBeforeImport } from '../importBackupPrompt';

export function registerImportCommand(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('sfmc-data.importDE', () => importDE(context))
    );
}

async function importDE(context: vscode.ExtensionContext): Promise<void> {
    const projectRoot = findProjectRoot(vscode.workspace.workspaceFolders);
    if (!projectRoot) {
        void vscode.window.showErrorMessage(
            "No SFMC project config found. Use 'SFMC Data: Initialize Project' or open a folder containing .mcdevrc.json or .mcdatarc.json."
        );
        return;
    }

    let mcdevrc;
    try {
        mcdevrc = readProjectConfig(projectRoot);
    } catch (ex) {
        void vscode.window.showErrorMessage(`Failed to read project config: ${String(ex)}`);
        return;
    }

    const credentials = getCredentials(mcdevrc);
    if (credentials.length === 0) {
        void vscode.window.showErrorMessage('No credentials found in project config.');
        return;
    }

    const credential =
        credentials.length === 1
            ? credentials[0]
            : await vscode.window.showQuickPick(credentials, {
                  title: 'SFMC Data — Import',
                  placeHolder: 'Select credential',
              });
    if (!credential) return;

    const businessUnits = getBusinessUnits(mcdevrc, credential);
    if (businessUnits.length === 0) {
        void vscode.window.showErrorMessage(
            `No business units found for credential "${credential}".`
        );
        return;
    }

    const bu =
        businessUnits.length === 1
            ? businessUnits[0]
            : await vscode.window.showQuickPick(businessUnits, {
                  title: 'SFMC Data — Import',
                  placeHolder: 'Select Business Unit',
              });
    if (!bu) return;

    const importMethod = await vscode.window.showQuickPick(
        [
            {
                label: '$(key) By DE key',
                description: 'Resolve the latest matching file under ./data/',
                method: 'key',
            },
            {
                label: '$(folder-opened) By file path',
                description: 'Select one or more data files',
                method: 'file',
            },
        ],
        {
            title: 'SFMC Data — Import method',
            placeHolder: 'How do you want to specify the data to import?',
        }
    );
    if (!importMethod) return;

    const cfg = vscode.workspace.getConfiguration('sfmcData');
    const useGit = cfg.get<boolean>('useGitFilenames') === true;

    let deKeys: string[] | undefined;
    let filePaths: string[] | undefined;

    if (importMethod.method === 'key') {
        const deInput = await vscode.window.showInputBox({
            title: 'SFMC Data — Import DE key(s)',
            prompt: 'Enter one or more DE customer keys (comma-separated)',
            placeHolder: 'My_DE_Key, Another_DE_Key',
            ignoreFocusOut: true,
            validateInput: (v) => (v.trim() ? undefined : 'At least one DE key is required'),
        });
        if (!deInput?.trim()) return;

        deKeys = deInput
            .split(',')
            .map((k) => k.trim())
            .filter(Boolean);
    } else {
        const uris = await vscode.window.showOpenDialog({
            title: 'SFMC Data — Select file(s) to import',
            canSelectMany: true,
            filters: {
                'Data files': ['csv', 'tsv', 'json'],
                'All files': ['*'],
            },
        });
        if (!uris || uris.length === 0) return;

        filePaths = uris.map((u) => u.fsPath);
    }

    const mode = await resolveImportWriteMode(cfg);
    if (mode === undefined) return;

    const backupBeforeImport = await resolveBackupBeforeImport(cfg);
    if (backupBeforeImport === undefined) return;

    const clearChoice = await promptOptionalClearBeforeImport();

    const credBu = `${credential}/${bu}`;

    if (deKeys) {
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
    } else if (filePaths) {
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
    }
}
