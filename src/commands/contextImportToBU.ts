import * as vscode from 'vscode';
import {
    selectProjectRoot,
    getProjectConfiguration as getProjectConfig,
    readProjectConfig,
} from '../config';
import { getAllCredBus } from '../mcdevrcParser';
import { runMcdataWithProgress } from '../runMcdata';
import { buildCrossBuImportArguments, buildFileToMultiBuImportArguments } from '../argbuilder';
import { resolveContextFiles } from './contextUtilities';
import { promptOptionalClearBeforeImport } from '../importClearPrompts';
import { resolveImportWriteMode } from '../importMode';
import { resolveBackupBeforeImport } from '../importBackupPrompt';

export function registerContextImportToBUCommand(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand(
            'sfmc-data.contextImportToBU',
            (uri: vscode.Uri, uris: vscode.Uri[]) => contextImportToBU(context, uri, uris)
        )
    );
}

async function contextImportToBU(
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

    const files = resolveContextFiles(uri, uris, projectRoot, true);
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

    const selectedTargets = await vscode.window.showQuickPick(
        allCredBus.map((callback) => ({ label: callback, picked: false })),
        {
            title: 'SFMC Data Loader — Import to BU...',
            placeHolder: 'Select one or more target Business Units',
            canPickMany: true,
        }
    );
    if (!selectedTargets || selectedTargets.length === 0) return;

    const toCredBus = selectedTargets.map(({ label }) => label);

    const config = getProjectConfig(projectRoot);
    const isUseGit = config.get<boolean>('useGitFilenames') === true;

    const mode = await resolveImportWriteMode(config);
    if (mode === undefined) return;

    const backupBeforeImport = await resolveBackupBeforeImport(config);
    if (backupBeforeImport === undefined) return;

    const clearChoice = await promptOptionalClearBeforeImport(config);
    if (clearChoice === undefined) return;

    let arguments_: string[];
    if (parsed[0].type === 'data') {
        const filePaths = parsed.map((f) => f.filePath);
        arguments_ = buildFileToMultiBuImportArguments({
            filePaths,
            toCredBus,
            mode,
            backupBeforeImport,
            skipEmptyLines: config.get<boolean>('skipEmptyLines') === true,
            clearBeforeImport: clearChoice.clearBeforeImport,
            acceptClearRisk: clearChoice.acceptClearRisk,
            useGit: isUseGit,
        });
    } else {
        const deKeys = parsed.map((f) => f.deKey);
        arguments_ = buildCrossBuImportArguments({
            fromCredBu: credBu,
            toCredBus,
            deKeys,
            mode,
            backupBeforeImport,
            skipEmptyLines: config.get<boolean>('skipEmptyLines') === true,
            clearBeforeImport: clearChoice.clearBeforeImport,
            acceptClearRisk: clearChoice.acceptClearRisk,
            useGit: isUseGit,
        });
    }
    await runMcdataWithProgress(context, projectRoot, arguments_, {
        progressTitle: 'SFMC Data — Import to BU',
        telemetryCommand: 'sfmc-data.contextImportToBU',
    });
}
