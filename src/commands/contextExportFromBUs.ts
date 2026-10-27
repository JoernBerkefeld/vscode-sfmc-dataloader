import * as vscode from 'vscode';
import {
    selectProjectRoot,
    getProjectConfiguration as getProjectConfig,
    readProjectConfig,
    getExportFileOptions,
} from '../config';
import { getAllCredBus } from '../mcdevrcParser';
import { runMcdataWithProgress } from '../runMcdata';
import { buildMultiBuExportArguments } from '../argbuilder';
import { resolveContextFiles } from './contextUtilities';

export function registerContextExportFromBUsCommand(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand(
            'sfmc-data.contextExportFromBUs',
            (uri: vscode.Uri, uris: vscode.Uri[]) => contextExportFromBUs(context, uri, uris)
        )
    );
}

async function contextExportFromBUs(
    context: vscode.ExtensionContext,
    uri: vscode.Uri,
    uris: vscode.Uri[]
): Promise<void> {
    let projectRoot: string | undefined;
    try {
        projectRoot = await selectProjectRoot(
            vscode.workspace.workspaceFolders,
            'context',
            uri,
            uris
        );
    } catch (ex) {
        void vscode.window.showErrorMessage(String(ex));
        return;
    }
    if (!projectRoot) {
        void vscode.window.showErrorMessage(
            "No SFMC project config found. Use 'SFMC Data: Initialize Project' or open a folder containing .mcdevrc.json or .mcdatarc.json."
        );
        return;
    }

    const files = resolveContextFiles(uri, uris, projectRoot);
    if (!files) return;
    const { parsed, credBu } = files;

    let mcdevrc;
    try {
        mcdevrc = readProjectConfig(projectRoot);
    } catch (ex) {
        void vscode.window.showErrorMessage(`Failed to read project config: ${String(ex)}`);
        return;
    }

    const allCredBus = getAllCredBus(mcdevrc);

    const selectedSources = await vscode.window.showQuickPick(
        allCredBus.map((callback) => ({ label: callback, picked: callback === credBu })),
        {
            title: 'SFMC Data Loader — Export from BUs...',
            placeHolder: 'Select one or more source Business Units to export from',
            canPickMany: true,
        }
    );
    if (!selectedSources || selectedSources.length === 0) return;

    const fromCredBus = selectedSources.map(({ label }) => label);
    const deKeys = parsed.map((f) => f.deKey);

    const config = getProjectConfig(projectRoot);
    const format = config.get<string>('defaultFormat') ?? 'csv';
    const isUseGit = config.get<boolean>('useGitFilenames') === true;

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
        progressTitle: 'SFMC Data — Export from BUs',
        telemetryCommand: 'sfmc-data.contextExportFromBUs',
    });
}
