import * as vscode from 'vscode';
import { selectDeKeys } from '../deKeyPicker';
import {
    selectProjectRoot,
    getProjectConfiguration as getProjectConfig,
    readProjectConfig,
    getExportFileOptions,
} from '../config';
import { getCredentials, getBusinessUnits } from '../mcdevrcParser';
import { runMcdataWithProgress } from '../runMcdata';
import { buildExportArguments } from '../argbuilder';

export function registerExportCommand(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('sfmc-data.exportDE', () => exportDE(context))
    );
}

async function exportDE(context: vscode.ExtensionContext): Promise<void> {
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

    const credential =
        credentials.length === 1
            ? credentials[0]
            : await vscode.window.showQuickPick(credentials, {
                  title: 'SFMC Data — Export',
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
                  title: 'SFMC Data — Export',
                  placeHolder: 'Select Business Unit',
              });
    if (!bu) return;

    const deKeys = await selectDeKeys(
        projectRoot,
        credential,
        bu,
        'SFMC Data — Export DE keys',
        `Data Extensions in ${credential}/${bu}`
    );
    if (!deKeys) return;

    const config = getProjectConfig(projectRoot);
    const format = config.get<string>('defaultFormat') ?? 'csv';
    const isUseGit = config.get<boolean>('useGitFilenames') === true;
    const exportOptions = getExportFileOptions(config);
    if (!exportOptions) return;
    const arguments_ = buildExportArguments(
        `${credential}/${bu}`,
        deKeys,
        format,
        isUseGit,
        exportOptions
    );
    await runMcdataWithProgress(context, projectRoot, arguments_, {
        progressTitle: 'SFMC Data — Export',
        telemetryCommand: 'sfmc-data.exportDE',
    });
}
