import * as vscode from 'vscode';
import { findMcdevProjectRoot, readMcdevrc } from '../config';
import { getCredentials, getBusinessUnits } from '../mcdevrcParser';
import { resolveMcdataShellPrefixForTerminal, spawnMcdataInTerminal } from '../terminal';
import { buildImportArgs } from '../argbuilder';
import { promptOptionalClearBeforeImport } from '../importClearPrompts';
import { resolveImportWriteMode } from '../importMode';

export function registerImportCommand(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('sfmc-data.importDE', () => importDE(context))
    );
}

async function importDE(context: vscode.ExtensionContext): Promise<void> {
    const projectRoot = findMcdevProjectRoot(vscode.workspace.workspaceFolders);
    if (!projectRoot) {
        void vscode.window.showErrorMessage('No mcdev project found. Open a folder containing .mcdevrc.json.');
        return;
    }

    let mcdevrc;
    try {
        mcdevrc = readMcdevrc(projectRoot);
    } catch (e) {
        void vscode.window.showErrorMessage(`Failed to read .mcdevrc.json: ${String(e)}`);
        return;
    }

    const credentials = getCredentials(mcdevrc);
    if (credentials.length === 0) {
        void vscode.window.showErrorMessage('No credentials found in .mcdevrc.json.');
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
        void vscode.window.showErrorMessage(`No business units found for credential "${credential}".`);
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
            { label: '$(key) By DE key', description: 'Resolve the latest matching file under ./data/', method: 'key' },
            { label: '$(folder-opened) By file path', description: 'Select one or more data files', method: 'file' },
        ],
        {
            title: 'SFMC Data — Import method',
            placeHolder: 'How do you want to specify the data to import?',
        }
    );
    if (!importMethod) return;

    const cfg = vscode.workspace.getConfiguration('sfmcData');
    const format = cfg.get<string>('defaultFormat') ?? 'csv';
    const useGit = cfg.get<boolean>('useGitFilenames') === true;

    let deKeys: string[] | undefined;
    let filePaths: string[] | undefined;

    if (importMethod.method === 'key') {
        const deInput = await vscode.window.showInputBox({
            title: 'SFMC Data — Import DE key(s)',
            prompt: 'Enter one or more DE customer keys (comma-separated)',
            placeHolder: 'My_DE_Key, Another_DE_Key',
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

    const clearChoice = await promptOptionalClearBeforeImport();

    const prefix = resolveMcdataShellPrefixForTerminal(context, projectRoot);
    if (prefix === undefined) return;
    const credBu = `${credential}/${bu}`;

    if (deKeys) {
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
    } else if (filePaths) {
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
    }
}
