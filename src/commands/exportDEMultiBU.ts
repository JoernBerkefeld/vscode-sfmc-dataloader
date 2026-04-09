import * as vscode from 'vscode';
import { findMcdevProjectRoot, readMcdevrc } from '../config';
import { getCredentials, getBusinessUnits } from '../mcdevrcParser';
import { resolveMcdataShellPrefixForTerminal, spawnMcdataInTerminal } from '../terminal';
import { buildMultiBuExportArgs } from '../argbuilder';

export function registerExportMultiBUCommand(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('sfmc-data.exportDEMultiBU', () => exportDEMultiBU(context))
    );
}

async function exportDEMultiBU(context: vscode.ExtensionContext): Promise<void> {
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
                  title: 'SFMC Data — Export (Multi-BU)',
                  placeHolder: 'Select credential',
              });
    if (!credential) return;

    const businessUnits = getBusinessUnits(mcdevrc, credential);
    if (businessUnits.length === 0) {
        void vscode.window.showErrorMessage(`No business units found for credential "${credential}".`);
        return;
    }

    const selectedBUs = await vscode.window.showQuickPick(
        businessUnits.map((bu) => ({ label: bu, picked: false })),
        {
            title: 'SFMC Data — Export (Multi-BU)',
            placeHolder: 'Select one or more Business Units to export from',
            canPickMany: true,
        }
    );
    if (!selectedBUs || selectedBUs.length === 0) return;

    const deInput = await vscode.window.showInputBox({
        title: 'SFMC Data — Export DE key(s)',
        prompt: 'Enter one or more DE customer keys (comma-separated)',
        placeHolder: 'My_DE_Key, Another_DE_Key',
        validateInput: (v) => (v.trim() ? undefined : 'At least one DE key is required'),
    });
    if (!deInput?.trim()) return;

    const deKeys = deInput
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean);

    const cfg = vscode.workspace.getConfiguration('sfmcData');
    const format = cfg.get<string>('defaultFormat') ?? 'csv';
    const useGit = cfg.get<boolean>('useGitFilenames') === true;

    const fromCredBus = selectedBUs.map(({ label }) => `${credential}/${label}`);
    const prefix = resolveMcdataShellPrefixForTerminal(context, projectRoot);
    if (prefix === undefined) return;
    const args = buildMultiBuExportArgs({ fromCredBus, deKeys, format, useGit });
    spawnMcdataInTerminal(projectRoot, prefix, args);
}
