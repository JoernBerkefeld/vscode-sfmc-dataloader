import * as vscode from 'vscode';
import { promptDeKeys } from '../deKeyPicker';
import {
    selectProjectRoot,
    getProjectConfiguration as getProjectConfig,
    readProjectConfig,
    getExportFileOptions,
} from '../config';
import { getCredentials, getBusinessUnits } from '../mcdevrcParser';
import { runMcdataWithProgress } from '../runMcdata';
import { buildMultiBuExportArguments } from '../argbuilder';

export function registerExportMultiBUCommand(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('sfmc-data.exportDEMultiBU', () => exportDEMultiBU(context))
    );
}

async function exportDEMultiBU(context: vscode.ExtensionContext): Promise<void> {
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
                  title: 'SFMC Data — Export (Multi-BU)',
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

    const selectedBUs = await vscode.window.showQuickPick(
        businessUnits.map((bu) => ({ label: bu, picked: false })),
        {
            title: 'SFMC Data — Export (Multi-BU)',
            placeHolder: 'Select one or more Business Units to export from',
            canPickMany: true,
        }
    );
    if (!selectedBUs || selectedBUs.length === 0) return;

    const deKeys = await promptDeKeys('SFMC Data — Export DE key(s)');
    if (!deKeys) return;

    const config = getProjectConfig(projectRoot);
    const format = config.get<string>('defaultFormat') ?? 'csv';
    const isUseGit = config.get<boolean>('useGitFilenames') === true;

    const fromCredBus = selectedBUs.map(({ label }) => `${credential}/${label}`);
    const exportOptions = getExportFileOptions(config);
    if (!exportOptions) return;
    const arguments_ = buildMultiBuExportArguments({
        ...exportOptions,
        fromCredBus,
        deKeys,
        format,
        useGit: isUseGit,
    });
    await runMcdataWithProgress(context, projectRoot, arguments_, {
        progressTitle: 'SFMC Data — Export (Multi-BU)',
        telemetryCommand: 'sfmc-data.exportDEMultiBU',
    });
}
