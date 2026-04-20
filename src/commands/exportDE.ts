import * as vscode from 'vscode';
import type { DeItem } from 'sfmc-dataloader';
import { findProjectRoot, readProjectConfig } from '../config';
import { getCredentials, getBusinessUnits } from '../mcdevrcParser';
import { getDeCacheForBu, hasDeCacheForBu } from '../deCache';
import { runMcdataWithProgress } from '../runMcdata';
import { buildExportArgs } from '../argbuilder';
import { refreshDeCacheForBu } from './refreshDeCache';

export function registerExportCommand(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('sfmc-data.exportDE', () => exportDE(context))
    );
}

type DePickItem = vscode.QuickPickItem & { deKey: string };

function buildDePickItems(items: DeItem[]): DePickItem[] {
    const sorted = [...items].toSorted((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    );
    return sorted.map((item) => {
        const same = item.name === item.key;
        const label = same ? item.name : `${item.name} (${item.key})`;
        return {
            label,
            deKey: item.key,
        };
    });
}

async function exportDE(context: vscode.ExtensionContext): Promise<void> {
    const projectRoot = findProjectRoot(vscode.workspace.workspaceFolders);
    if (!projectRoot) {
        void vscode.window.showErrorMessage(
            "No SFMC project config found. Use 'SFMC Data: Initialize Project' or open a folder containing .mcdevrc.json or .mcdatarc.json."
        );
        return;
    }

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

    const keySource = await vscode.window.showQuickPick(
        [
            {
                label: '$(list-unordered) From DE list',
                description: 'Pick from cached names (run Refresh DE cache first)',
                source: 'list',
            },
            {
                label: '$(edit) Enter DE keys manually',
                description: 'Comma-separated customer keys (advanced)',
                source: 'manual',
            },
        ],
        {
            title: 'SFMC Data — Export DE keys',
            placeHolder: 'How do you want to provide DE customer keys?',
        }
    );
    if (!keySource) return;

    let deKeys: string[];

    if (keySource.source === 'manual') {
        const deInput = await vscode.window.showInputBox({
            title: 'SFMC Data — Export DE key(s)',
            prompt: 'Enter one or more DE customer keys (comma-separated)',
            placeHolder: 'My_DE_Key, Another_DE_Key',
            ignoreFocusOut: true,
            validateInput: (v) => (v.trim() ? undefined : 'At least one DE key is required'),
        });
        if (!deInput?.trim()) return;

        deKeys = deInput
            .split(',')
            .map((k) => k.trim())
            .filter(Boolean);
    } else {
        let cached = getDeCacheForBu(credential, bu);
        if (!hasDeCacheForBu(credential, bu) || !cached?.length) {
            try {
                await refreshDeCacheForBu(projectRoot, credential, bu);
            } catch (ex) {
                const msg = ex instanceof Error ? ex.message : String(ex);
                void vscode.window.showErrorMessage(`Failed to refresh DE cache: ${msg}`);
                return;
            }
            cached = getDeCacheForBu(credential, bu);
        }
        if (!cached?.length) {
            void vscode.window.showErrorMessage('No Data Extensions found for this Business Unit.');
            return;
        }

        const pickItems = buildDePickItems(cached);
        const selected = await vscode.window.showQuickPick(pickItems, {
            title: 'SFMC Data — Select Data Extensions to export',
            placeHolder: 'Filter by typing part of the name or key, then select one or more',
            canPickMany: true,
        });
        if (!selected || selected.length === 0) return;

        deKeys = selected.map((s) => s.deKey);
    }

    const cfg = vscode.workspace.getConfiguration('sfmcData');
    const format = cfg.get<string>('defaultFormat') ?? 'csv';
    const useGit = cfg.get<boolean>('useGitFilenames') === true;

    const args = buildExportArgs(`${credential}/${bu}`, deKeys, format, useGit);
    await runMcdataWithProgress(context, projectRoot, args, {
        progressTitle: 'SFMC Data — Export',
    });
}
