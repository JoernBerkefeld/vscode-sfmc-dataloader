import type * as vscode from 'vscode';

/**
 * Reads `sfmcData.importMode` when set at any scope; otherwise falls back to deprecated `sfmcData.defaultMode`.
 * @param cfg
 */
export function getImportWriteModeFromSettings(
    cfg: vscode.WorkspaceConfiguration
): 'upsert' | 'insert' {
    const inspected = cfg.inspect<string>('importMode');
    const importModeSet =
        inspected?.globalValue !== undefined ||
        inspected?.workspaceValue !== undefined ||
        inspected?.workspaceFolderValue !== undefined;
    if (importModeSet) {
        const v = cfg.get<string>('importMode') ?? 'upsert';
        return v === 'insert' ? 'insert' : 'upsert';
    }
    const legacy = cfg.get<string>('defaultMode') ?? 'upsert';
    return legacy === 'insert' ? 'insert' : 'upsert';
}
