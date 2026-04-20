import * as vscode from 'vscode';
import { fetchDeList } from 'sfmc-dataloader';
import { findProjectRoot, readProjectConfig } from '../config';
import { getBusinessUnits, getCredentials } from '../mcdevrcParser';
import { setDeCacheBu } from '../deCache';

/**
 * Fetch DE list for one credential/BU and store in extension cache.
 * Used by the Refresh command (multi-BU loop) and by Export when cache is missing.
 * @param projectRoot - absolute workspace folder containing `.mcdevrc.json` or `.mcdatarc.json`
 * @param credential - key from project config `credentials`
 * @param bu - business unit name under that credential
 */
export async function fetchAndStoreDeCache(
    projectRoot: string,
    credential: string,
    bu: string
): Promise<void> {
    const items = await fetchDeList(projectRoot, credential, bu);
    setDeCacheBu(credential, bu, items);
}

/**
 * Refresh DE cache for a single credential/BU with progress UI.
 * @param projectRoot - absolute workspace folder containing `.mcdevrc.json` or `.mcdatarc.json`
 * @param credential - key from project config `credentials`
 * @param bu - business unit name under that credential
 */
export async function refreshDeCacheForBu(
    projectRoot: string,
    credential: string,
    bu: string
): Promise<void> {
    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: 'SFMC Data — Refresh DE cache',
            cancellable: false,
        },
        async (progress) => {
            progress.report({ message: `Loading DE list: ${credential}/${bu}…` });
            await fetchAndStoreDeCache(projectRoot, credential, bu);
        }
    );
}

export function registerRefreshDeCacheCommand(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('sfmc-data.refreshDeCache', () => refreshDeCache())
    );
}

async function refreshDeCache(): Promise<void> {
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
                  title: 'SFMC Data — Refresh DE cache',
                  placeHolder: 'Select credential',
              });
    if (!credential) {
        return;
    }

    const businessUnits = getBusinessUnits(mcdevrc, credential);
    if (businessUnits.length === 0) {
        void vscode.window.showErrorMessage(
            `No business units found for credential "${credential}".`
        );
        return;
    }

    const pickedBus = await vscode.window.showQuickPick(
        businessUnits.map((bu) => ({ label: bu, bu })),
        {
            title: 'SFMC Data — Refresh DE cache',
            placeHolder: 'Select one or more Business Units (multi-select)',
            canPickMany: true,
        }
    );
    if (!pickedBus || pickedBus.length === 0) {
        return;
    }

    const errors: string[] = [];

    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: 'SFMC Data — Refresh DE cache',
            cancellable: false,
        },
        async (progress) => {
            const total = pickedBus.length;
            let index = 0;
            for (const pick of pickedBus) {
                const { bu } = pick;
                index += 1;
                progress.report({
                    message: `Loading DE list (${index}/${total}): ${credential}/${bu}…`,
                });
                try {
                    await fetchAndStoreDeCache(projectRoot, credential, bu);
                } catch (ex) {
                    const msg = ex instanceof Error ? ex.message : String(ex);
                    errors.push(`${credential}/${bu}: ${msg}`);
                }
            }
        }
    );

    if (errors.length > 0) {
        void vscode.window.showErrorMessage(
            `DE cache refresh finished with errors: ${errors.join(' | ')}`
        );
    } else {
        void vscode.window.showInformationMessage(
            'DE cache refreshed. You can run Import DE and choose "From DE list" for those Business Units.'
        );
    }
}
