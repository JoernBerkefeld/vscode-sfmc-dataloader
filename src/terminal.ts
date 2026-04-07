import * as vscode from 'vscode';

/**
 * Resolves the `mcdata` binary path.
 * Uses the `sfmcData.mcdataPath` setting when set, falling back to `mcdata`
 * (which resolves via `PATH` or a local `node_modules/.bin`).
 */
export function getMcdataCommand(): string {
    const cfg = vscode.workspace.getConfiguration('sfmcData');
    const customPath = cfg.get<string>('mcdataPath');
    return customPath?.trim() || 'mcdata';
}

/**
 * Opens an integrated terminal, sends the assembled mcdata command, and
 * brings the terminal panel into view.
 *
 * Arguments that contain spaces are quoted so the shell interprets them as
 * single tokens.
 *
 * @param projectRoot - working directory (mcdev project root)
 * @param command - the resolved binary name or path
 * @param args - CLI arguments
 */
export function spawnMcdataInTerminal(projectRoot: string, command: string, args: string[]): void {
    const terminal = vscode.window.createTerminal({
        name: 'SFMC Data',
        cwd: projectRoot,
    });
    const quotedArgs = args.map((a) => (a.includes(' ') ? `"${a}"` : a));
    terminal.sendText(`${command} ${quotedArgs.join(' ')}`);
    terminal.show();
}
