import * as vscode from 'vscode';
import { buildMcdataShellPrefix } from './mcdataResolve';

/**
 * Resolves the shell command prefix for `mcdata` (custom path, workspace .bin, PATH, or bundled).
 * Shows an error message if the bundled copy is missing when needed.
 *
 * @returns The prefix string, or `undefined` if resolution failed.
 */
export function resolveMcdataShellPrefixForTerminal(
    context: vscode.ExtensionContext,
    projectRoot: string
): string | undefined {
    const cfg = vscode.workspace.getConfiguration('sfmcData');
    const customPath = cfg.get<string>('mcdataPath');
    const result = buildMcdataShellPrefix({
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
