import * as vscode from 'vscode';
import { getImportWriteModeFromSettings } from './importModeCore';

export { getImportWriteModeFromSettings } from './importModeCore';

type ModePick = vscode.QuickPickItem & { mode: 'upsert' | 'insert' };

/**
 * When `sfmcData.promptImportMode` is true, shows a QuickPick; otherwise uses {@link getImportWriteModeFromSettings}.
 * Returns `undefined` if the user dismisses the QuickPick.
 */
export async function resolveImportWriteMode(
    cfg: vscode.WorkspaceConfiguration
): Promise<'upsert' | 'insert' | undefined> {
    if (cfg.get<boolean>('promptImportMode') === true) {
        const items: ModePick[] = [
            {
                label: 'Upsert',
                description: 'Update if primary key exists, else insert (async bulk API)',
                mode: 'upsert',
            },
            {
                label: 'Insert',
                description: 'Insert new rows only (async bulk API)',
                mode: 'insert',
            },
        ];
        const picked = await vscode.window.showQuickPick(items, {
            title: 'SFMC Data — Import row write mode',
            placeHolder: 'Choose how rows are written',
        });
        if (!picked || !('mode' in picked)) {
            return undefined;
        }
        return picked.mode;
    }
    return getImportWriteModeFromSettings(cfg);
}
