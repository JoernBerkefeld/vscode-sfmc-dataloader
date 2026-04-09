import * as vscode from 'vscode';
import { buildMcdataShellPrefix, normalizeMcdataSource } from './mcdataResolve';

/**
 * Resolves the shell command prefix for `mcdata` per `sfmcData.mcdataSource` and `sfmcData.mcdataPath`.
 * Shows an error message if resolution fails (e.g. missing bundled script, empty custom path).
 *
 * @returns The prefix string, or `undefined` if resolution failed.
 */
export function resolveMcdataShellPrefixForTerminal(
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

/**
 * Opens an integrated terminal, sends the assembled mcdata command, and
 * brings the terminal panel into view.
 *
 * `shellPrefix` may be multiple tokens (e.g. `node "…/out/mcdata.bundled.cjs"`).
 * Arguments that contain spaces are quoted so the shell interprets them as
 * single tokens.
 *
 * @param projectRoot - working directory (mcdev project root)
 * @param shellPrefix - resolved command prefix (binary path or `node "…/out/mcdata.bundled.cjs"`)
 * @param args - CLI arguments after the prefix
 */
export function spawnMcdataInTerminal(projectRoot: string, shellPrefix: string, args: string[]): void {
    const terminal = vscode.window.createTerminal({
        name: 'SFMC Data',
        cwd: projectRoot,
    });
    const quotedArgs = args.map((a) => (a.includes(' ') ? `"${a}"` : a));
    terminal.sendText(`${shellPrefix} ${quotedArgs.join(' ')}`);
    terminal.show();
}
