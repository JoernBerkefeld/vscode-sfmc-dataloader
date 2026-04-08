import * as vscode from 'vscode';
import { findMcdevProjectRoot, readMcdevrc } from '../config';
import { getAllCredBus } from '../mcdevrcParser';
import { resolveMcdataShellPrefixForTerminal, spawnMcdataInTerminal } from '../terminal';
import { buildCrossBuImportArgs, buildFileToMultiBuImportArgs } from '../argbuilder';
import { resolveContextFiles } from './contextUtils';

export function registerContextImportToBUCommand(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('sfmc-data.contextImportToBU', (uri: vscode.Uri, uris: vscode.Uri[]) =>
            contextImportToBU(context, uri, uris)
        )
    );
}

async function contextImportToBU(
    context: vscode.ExtensionContext,
    uri: vscode.Uri,
    uris: vscode.Uri[]
): Promise<void> {
    const projectRoot = findMcdevProjectRoot(vscode.workspace.workspaceFolders);
    if (!projectRoot) {
        void vscode.window.showErrorMessage('No mcdev project found. Open a folder containing .mcdevrc.json.');
        return;
    }

    const files = resolveContextFiles(uri, uris, projectRoot);
    if (!files) return;
    const { parsed, credBu } = files;

    let mcdevrc;
    try {
        mcdevrc = readMcdevrc(projectRoot);
    } catch (e) {
        void vscode.window.showErrorMessage(`Failed to read .mcdevrc.json: ${String(e)}`);
        return;
    }

    const allCredBus = getAllCredBus(mcdevrc);

    // Show multi-select of all available BUs as targets
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
    const format = cfg.get<string>('defaultFormat') ?? 'csv';
    const api = cfg.get<string>('importApi') ?? 'async';
    const mode = cfg.get<string>('defaultMode') ?? 'upsert';

    const prefix = resolveMcdataShellPrefixForTerminal(context, projectRoot);
    if (prefix === undefined) return;

    if (parsed[0].type === 'data') {
        // File mode: --to + --file (no source BU auth needed)
        const filePaths = parsed.map((f) => f.filePath);
        const args = buildFileToMultiBuImportArgs({
            filePaths,
            toCredBus,
            format,
            api,
            mode,
            clearBeforeImport: false,
            acceptClearRisk: false,
        });
        spawnMcdataInTerminal(projectRoot, prefix, args);
    } else {
        // API mode: --from + --to + --de (source BU fetched live)
        const deKeys = parsed.map((f) => f.deKey);
        const args = buildCrossBuImportArgs({
            fromCredBu: credBu,
            toCredBus,
            deKeys,
            format,
            api,
            mode,
            clearBeforeImport: false,
            acceptClearRisk: false,
        });
        spawnMcdataInTerminal(projectRoot, prefix, args);
    }
}
