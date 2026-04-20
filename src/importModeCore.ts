import type * as vscode from 'vscode';

/**
 * Reads `sfmcData.importMode` from VS Code workspace configuration.
 * @param cfg - VS Code workspace configuration (`sfmcData` section)
 * @returns {'upsert' | 'insert'} effective import write mode
 */
export function getImportWriteModeFromSettings(
    cfg: vscode.WorkspaceConfiguration
): 'upsert' | 'insert' {
    const v = cfg.get<string>('importMode') ?? 'upsert';
    return v === 'insert' ? 'insert' : 'upsert';
}
