import * as vscode from 'vscode';
import { findProjectRoot, readProjectConfig } from '../config';
import { getAllCredBus } from '../mcdevrcParser';
import { runMcdataWithProgress } from '../runMcdata';
import { buildCrossBuImportArgs, buildFileToMultiBuImportArgs } from '../argbuilder';
import { resolveContextFiles } from './contextUtils';
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
    const projectRoot = findProjectRoot(vscode.workspace.workspaceFolders);
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

    const selectedTargets = await vscode.window.showQuickPick(
        allCredBus.map((cb) => ({ label: cb, picked: false })),
        {
            title: 'SFMC Data Loader — Import to BU...',
            placeHolder: 'Select one or more target Business Units',
            canPickMany: true,
        }
    );
    if (!selectedTargets || selectedTargets.length === 0) return;

    const toCredBus = selectedTargets.map(({ label }) => label);

    const cfg = vscode.workspace.getConfiguration('sfmcData');
    const useGit = cfg.get<boolean>('useGitFilenames') === true;

    const mode = await resolveImportWriteMode(cfg);
    if (mode === undefined) return;

    const backupBeforeImport = await resolveBackupBeforeImport(cfg);
    if (backupBeforeImport === undefined) return;

    const clearChoice = await promptOptionalClearBeforeImport();

    if (parsed[0].type === 'data') {
        const filePaths = parsed.map((f) => f.filePath);
        const args = buildFileToMultiBuImportArgs({
            filePaths,
            toCredBus,
            mode,
            backupBeforeImport,
            clearBeforeImport: clearChoice.clearBeforeImport,
            acceptClearRisk: clearChoice.acceptClearRisk,
            useGit,
        });
        await runMcdataWithProgress(context, projectRoot, args, {
            progressTitle: 'SFMC Data — Import to BU',
        });
    } else {
        const deKeys = parsed.map((f) => f.deKey);
        const args = buildCrossBuImportArgs({
            fromCredBu: credBu,
            toCredBus,
            deKeys,
            mode,
            backupBeforeImport,
            clearBeforeImport: clearChoice.clearBeforeImport,
            acceptClearRisk: clearChoice.acceptClearRisk,
            useGit,
        });
        await runMcdataWithProgress(context, projectRoot, args, {
            progressTitle: 'SFMC Data — Import to BU',
        });
    }
}
