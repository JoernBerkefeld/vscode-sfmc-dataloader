import * as vscode from 'vscode';
import { findMcdevProjectRoot, readMcdevrc } from '../config';
import { getAllCredBus } from '../mcdevrcParser';
import { runMcdataWithProgress } from '../runMcdata';
import { buildMultiBuExportArgs } from '../argbuilder';
import { resolveContextFiles } from './contextUtils';

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
    const projectRoot = findMcdevProjectRoot(vscode.workspace.workspaceFolders);
    if (!projectRoot) {
        void vscode.window.showErrorMessage(
            'No mcdev project found. Open a folder containing .mcdevrc.json.'
        );
        return;
    }

    const files = resolveContextFiles(uri, uris, projectRoot);
    if (!files) return;
    const { parsed, credBu } = files;

    let mcdevrc;
    try {
        mcdevrc = readMcdevrc(projectRoot);
    } catch (ex) {
        void vscode.window.showErrorMessage(`Failed to read .mcdevrc.json: ${String(ex)}`);
        return;
    }

    const allCredBus = getAllCredBus(mcdevrc);

    const selectedSources = await vscode.window.showQuickPick(
        allCredBus.map((cb) => ({ label: cb, picked: cb === credBu })),
        {
            title: 'SFMC Data Loader — Export from BUs...',
            placeHolder: 'Select one or more source Business Units to export from',
            canPickMany: true,
        }
    );
    if (!selectedSources || selectedSources.length === 0) return;

    const fromCredBus = selectedSources.map(({ label }) => label);
    const deKeys = parsed.map((f) => f.deKey);

    const cfg = vscode.workspace.getConfiguration('sfmcData');
    const format = cfg.get<string>('defaultFormat') ?? 'csv';
    const useGit = cfg.get<boolean>('useGitFilenames') === true;

    const args = buildMultiBuExportArgs({ fromCredBus, deKeys, format, useGit });
    await runMcdataWithProgress(context, projectRoot, args, {
        progressTitle: 'SFMC Data — Export from BUs',
    });
}
