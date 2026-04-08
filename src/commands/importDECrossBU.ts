import * as vscode from 'vscode';
import { findMcdevProjectRoot, readMcdevrc } from '../config';
import { getCredentials, getBusinessUnits } from '../mcdevrcParser';
import { resolveMcdataShellPrefixForTerminal, spawnMcdataInTerminal } from '../terminal';
import { buildCrossBuImportArgs } from '../argbuilder';

export function registerImportCrossBUCommand(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('sfmc-data.importDECrossBU', () => importDECrossBU(context))
    );
}

async function importDECrossBU(context: vscode.ExtensionContext): Promise<void> {
    const projectRoot = findMcdevProjectRoot(vscode.workspace.workspaceFolders);
    if (!projectRoot) {
        void vscode.window.showErrorMessage('No mcdev project found. Open a folder containing .mcdevrc.json.');
        return;
    }

    let mcdevrc;
    try {
        mcdevrc = readMcdevrc(projectRoot);
    } catch (e) {
        void vscode.window.showErrorMessage(`Failed to read .mcdevrc.json: ${String(e)}`);
        return;
    }

    const credentials = getCredentials(mcdevrc);
    if (credentials.length === 0) {
        void vscode.window.showErrorMessage('No credentials found in .mcdevrc.json.');
        return;
    }

    // ── Select source ──────────────────────────────────────────────────────

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
        void vscode.window.showErrorMessage(`No business units found for credential "${srcCredential}".`);
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

    // ── Select targets ─────────────────────────────────────────────────────
    // Targets are chosen from the same credential for simplicity; users who
    // need cross-credential targets can run the CLI directly.

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
        void vscode.window.showErrorMessage(`No business units found for credential "${tgtCredential}".`);
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

    // ── DE keys ────────────────────────────────────────────────────────────

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

    // ── Build and run ──────────────────────────────────────────────────────

    const cfg = vscode.workspace.getConfiguration('sfmcData');
    const format = cfg.get<string>('defaultFormat') ?? 'csv';
    const api = cfg.get<string>('importApi') ?? 'async';
    const mode = cfg.get<string>('defaultMode') ?? 'upsert';

    const prefix = resolveMcdataShellPrefixForTerminal(context, projectRoot);
    if (prefix === undefined) return;
    const args = buildCrossBuImportArgs({
        fromCredBu: `${srcCredential}/${srcBU}`,
        toCredBus: selectedTargetBUs.map(({ label }) => `${tgtCredential}/${label}`),
        deKeys,
        format,
        api,
        mode,
        clearBeforeImport: false,
        acceptClearRisk: false,
    });
    spawnMcdataInTerminal(projectRoot, prefix, args);
}
