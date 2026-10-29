import * as vscode from 'vscode';
import { selectProjectRoot, getProjectConfiguration as getProjectConfig } from '../config';
import { runMcdataWithProgress } from '../runMcdata';
import { buildImportArguments } from '../argbuilder';
import { resolveContextFiles } from './contextUtilities';
import { captureImportIntent, promptOptionalClearBeforeImport } from '../importClearPrompts';
import { resolveImportWriteMode } from '../importMode';
import { resolveBackupBeforeImport } from '../importBackupPrompt';

export function registerContextImportCommand(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand(
            'sfmc-data.contextImportDE',
            (uri: vscode.Uri, uris: vscode.Uri[]) => contextImportDE(context, uri, uris)
        )
    );
}

async function contextImportDE(
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

    const config = getProjectConfig(projectRoot);
    const isUseGit = config.get<boolean>('useGitFilenames') === true;

    const mode = await resolveImportWriteMode(config);
    if (mode === undefined) return;

    const backupBeforeImport = await resolveBackupBeforeImport(config);
    if (backupBeforeImport === undefined) return;

    const clearChoice = { clearBeforeImport: false, acceptClearRisk: false };

    let arguments_: string[];
    if (parsed[0].type === 'data') {
        const filePaths = parsed.map((f) => f.filePath);
        arguments_ = buildImportArguments(
            credBu,
            {
                filePaths,
                mode,
                backupBeforeImport,
                skipEmptyLines: config.get<boolean>('skipEmptyLines') !== false,
                clearBeforeImport: clearChoice.clearBeforeImport,
                acceptClearRisk: clearChoice.acceptClearRisk,
            },
            isUseGit
        );
    } else {
        const deKeys = parsed.map((f) => f.deKey);
        arguments_ = buildImportArguments(
            credBu,
            {
                deKeys,
                mode,
                backupBeforeImport,
                skipEmptyLines: config.get<boolean>('skipEmptyLines') !== false,
                clearBeforeImport: clearChoice.clearBeforeImport,
                acceptClearRisk: clearChoice.acceptClearRisk,
            },
            isUseGit
        );
    }
    const intent = captureImportIntent(projectRoot, arguments_);
    const confirmation = await promptOptionalClearBeforeImport(config, intent);
    if (!confirmation) return;
    const submitted = [...intent.arguments];
    if (confirmation.clearBeforeImport)
        submitted.push('--clear-before-import', '--i-accept-clear-data-risk');
    await runMcdataWithProgress(context, intent.projectRoot, submitted, {
        progressTitle: 'SFMC Data — Import',
        telemetryCommand: 'sfmc-data.contextImportDE',
    });
}
