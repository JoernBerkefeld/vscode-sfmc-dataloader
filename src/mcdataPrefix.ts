import * as vscode from 'vscode';
import { buildMcdataShellPrefix, normalizeMcdataSource } from './mcdataResolve';

/**
 * Resolves the shell command prefix for `mcdata` per `sfmcData.mcdataSource` and `sfmcData.mcdataPath`.
 * Shows an error message if resolution fails (e.g. missing bundled script, empty custom path).
 * @param context
 * @param projectRoot
 * @returns The prefix string, or `undefined` if resolution failed.
 */
export function resolveMcdataShellPrefix(
    context: vscode.ExtensionContext,
    projectRoot: string
): string | undefined {
    const cfg = vscode.workspace.getConfiguration('sfmcData');
    const mcdataSource = normalizeMcdataSource(cfg.get<string>('mcdataSource'));
    const customPath = cfg.get<string>('mcdataPath');
    const result = buildMcdataShellPrefix({
        mcdataSource,
        customPath: customPath ?? '',
        projectRoot,
        extensionPath: context.extensionPath,
    });
    if ('error' in result) {
        void vscode.window.showErrorMessage(result.error);
        return undefined;
    }
    return result.prefix;
}
