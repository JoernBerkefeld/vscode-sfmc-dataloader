import type * as vscode from 'vscode';

/**
 * Reads `sfmcData.importMode` from VS Code workspace configuration.
 * @param cfg
 */
export function getImportWriteModeFromSettings(
    cfg: vscode.WorkspaceConfiguration
): 'upsert' | 'insert' {
    const v = cfg.get<string>('importMode') ?? 'upsert';
    return v === 'insert' ? 'insert' : 'upsert';
}
