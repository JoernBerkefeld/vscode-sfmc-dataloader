import * as vscode from 'vscode';

/**
 * Resolves whether to request a pre-import backup based on `sfmcData.backupBeforeImport`:
 * - `"always"` → returns `true` without prompting
 * - `"never"` → returns `false` without prompting
 * - `"prompt"` (default) → shows a QuickPick and returns the user's choice,
 *   or `undefined` when the user dismisses the prompt
 * @param cfg - workspace configuration scoped to `sfmcData`
 * @returns {Promise.<boolean|undefined>} `true` to pass `--backup-before-import`, `false` to pass
 *   `--no-backup-before-import`, or `undefined` if the user dismissed
 */
export async function resolveBackupBeforeImport(
    cfg: vscode.WorkspaceConfiguration
): Promise<boolean | undefined> {
    const setting = cfg.get<string>('backupBeforeImport') ?? 'prompt';

    if (setting === 'always') {
        return true;
    }
    if (setting === 'never') {
        return false;
    }

    const pick = await vscode.window.showQuickPick(
        ['Yes — backup before import', 'No — skip backup'],
        {
            title: 'SFMC Data — Backup target DE before import?',
            placeHolder:
                'Export a timestamped snapshot of the current target DE rows before importing',
        }
    );
    if (pick === undefined) {
        return undefined;
    }
    return pick.startsWith('Yes');
}
