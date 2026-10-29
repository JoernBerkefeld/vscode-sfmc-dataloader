import * as vscode from 'vscode';
import { selectDeKeys } from '../deKeyPicker';
import {
    selectProjectRoot,
    getProjectConfiguration as getProjectConfig,
    readProjectConfig,
} from '../config';
import { getCredentials, getBusinessUnits } from '../mcdevrcParser';
import { runMcdataWithProgress } from '../runMcdata';
import { buildCrossBuImportArguments } from '../argbuilder';
import { captureImportIntent, promptOptionalClearBeforeImport } from '../importClearPrompts';
import { resolveImportWriteMode } from '../importMode';
import { resolveBackupBeforeImport } from '../importBackupPrompt';

export function registerImportCrossBUCommand(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('sfmc-data.importDECrossBU', () => importDECrossBU(context))
    );
}

async function importDECrossBU(context: vscode.ExtensionContext): Promise<void> {
    const projectRoot = await selectProjectRoot(vscode.workspace.workspaceFolders, 'palette');
    if (!projectRoot) return;

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

    const sourceCredential =
        credentials.length === 1
            ? credentials[0]
            : await vscode.window.showQuickPick(credentials, {
                  title: 'SFMC Data — Import (Cross-BU) — Source credential',
                  placeHolder: 'Select source credential',
              });
    if (!sourceCredential) return;

    const sourceBUs = getBusinessUnits(mcdevrc, sourceCredential);
    if (sourceBUs.length === 0) {
        void vscode.window.showErrorMessage(
            `No business units found for credential "${sourceCredential}".`
        );
        return;
    }

    const sourceBU =
        sourceBUs.length === 1
            ? sourceBUs[0]
            : await vscode.window.showQuickPick(sourceBUs, {
                  title: 'SFMC Data — Import (Cross-BU) — Source BU',
                  placeHolder: 'Select source Business Unit',
              });
    if (!sourceBU) return;

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

    const deKeys = await selectDeKeys(
        projectRoot,
        sourceCredential,
        sourceBU,
        'SFMC Data — Import (Cross-BU) — DE keys',
        `Source BU ${sourceCredential}/${sourceBU} supplies the API copy`
    );
    if (!deKeys) return;

    const config = getProjectConfig(projectRoot);
    const isUseGit = config.get<boolean>('useGitFilenames') === true;

    const mode = await resolveImportWriteMode(config);
    if (mode === undefined) return;

    const backupBeforeImport = await resolveBackupBeforeImport(config);
    if (backupBeforeImport === undefined) return;

    const arguments_ = buildCrossBuImportArguments({
        fromCredBu: `${sourceCredential}/${sourceBU}`,
        toCredBus: selectedTargetBUs.map(({ label }) => `${tgtCredential}/${label}`),
        deKeys,
        mode,
        backupBeforeImport,
        skipEmptyLines: config.get<boolean>('skipEmptyLines') !== false,
        clearBeforeImport: false,
        acceptClearRisk: false,
        useGit: isUseGit,
    });
    const intent = captureImportIntent(projectRoot, arguments_);
    const clearChoice = await promptOptionalClearBeforeImport(config, intent);
    if (!clearChoice) return;
    const submitted = [...intent.arguments];
    if (clearChoice.clearBeforeImport)
        submitted.push('--clear-before-import', '--i-accept-clear-data-risk');
    await runMcdataWithProgress(context, intent.projectRoot, submitted, {
        progressTitle: 'SFMC Data — Import (Cross-BU)',
        telemetryCommand: 'sfmc-data.importDECrossBU',
    });
}
