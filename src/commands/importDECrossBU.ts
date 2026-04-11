import * as vscode from 'vscode';
import { findMcdevProjectRoot, readMcdevrc } from '../config';
import { getCredentials, getBusinessUnits } from '../mcdevrcParser';
import { runMcdataWithProgress } from '../runMcdata';
import { buildCrossBuImportArgs } from '../argbuilder';
import { promptOptionalClearBeforeImport } from '../importClearPrompts';
import { resolveImportWriteMode } from '../importMode';
import { resolveBackupBeforeImport } from '../importBackupPrompt';

export function registerImportCrossBUCommand(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('sfmc-data.importDECrossBU', () => importDECrossBU(context))
    );
}

async function importDECrossBU(context: vscode.ExtensionContext): Promise<void> {
    const projectRoot = findMcdevProjectRoot(vscode.workspace.workspaceFolders);
    if (!projectRoot) {
        void vscode.window.showErrorMessage(
            'No mcdev project found. Open a folder containing .mcdevrc.json.'
        );
        return;
    }

    let mcdevrc;
    try {
        mcdevrc = readMcdevrc(projectRoot);
    } catch (ex) {
        void vscode.window.showErrorMessage(`Failed to read .mcdevrc.json: ${String(ex)}`);
        return;
    }

    const credentials = getCredentials(mcdevrc);
    if (credentials.length === 0) {
        void vscode.window.showErrorMessage('No credentials found in .mcdevrc.json.');
        return;
    }

    const srcCredential =
        credentials.length === 1
            ? credentials[0]
            : await vscode.window.showQuickPick(credentials, {
                  title: 'SFMC Data — Import (Cross-BU) — Source credential',
                  placeHolder: 'Select source credential',
              });
    if (!srcCredential) return;

    const srcBUs = getBusinessUnits(mcdevrc, srcCredential);
    if (srcBUs.length === 0) {
        void vscode.window.showErrorMessage(
            `No business units found for credential "${srcCredential}".`
        );
        return;
    }

    const srcBU =
        srcBUs.length === 1
            ? srcBUs[0]
            : await vscode.window.showQuickPick(srcBUs, {
                  title: 'SFMC Data — Import (Cross-BU) — Source BU',
                  placeHolder: 'Select source Business Unit',
              });
    if (!srcBU) return;

    const tgtCredential =
        credentials.length === 1
            ? credentials[0]
            : await vscode.window.showQuickPick(credentials, {
                  title: 'SFMC Data — Import (Cross-BU) — Target credential',
                  placeHolder: 'Select target credential (can be the same as source)',
              });
    if (!tgtCredential) return;

    const tgtBUs = getBusinessUnits(mcdevrc, tgtCredential);
    if (tgtBUs.length === 0) {
        void vscode.window.showErrorMessage(
            `No business units found for credential "${tgtCredential}".`
        );
        return;
    }

    const selectedTargetBUs = await vscode.window.showQuickPick(
        tgtBUs.map((bu) => ({ label: bu, picked: false })),
        {
            title: 'SFMC Data — Import (Cross-BU) — Target BU(s)',
            placeHolder: 'Select one or more target Business Units',
            canPickMany: true,
        }
    );
    if (!selectedTargetBUs || selectedTargetBUs.length === 0) return;

    const deInput = await vscode.window.showInputBox({
        title: 'SFMC Data — Import (Cross-BU) — DE key(s)',
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
    const useGit = cfg.get<boolean>('useGitFilenames') === true;

    const mode = await resolveImportWriteMode(cfg);
    if (mode === undefined) return;

    const backupBeforeImport = await resolveBackupBeforeImport(cfg);
    if (backupBeforeImport === undefined) return;

    const clearChoice = await promptOptionalClearBeforeImport();

    const args = buildCrossBuImportArgs({
        fromCredBu: `${srcCredential}/${srcBU}`,
        toCredBus: selectedTargetBUs.map(({ label }) => `${tgtCredential}/${label}`),
        deKeys,
        mode,
        backupBeforeImport,
        clearBeforeImport: clearChoice.clearBeforeImport,
        acceptClearRisk: clearChoice.acceptClearRisk,
        useGit,
    });
    await runMcdataWithProgress(context, projectRoot, args, {
        progressTitle: 'SFMC Data — Import (Cross-BU)',
    });
}
