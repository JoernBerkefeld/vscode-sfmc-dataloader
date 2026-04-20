/**
 * Builds a single shell command line for `mcdata`, matching the quoting used when
 * the CLI was invoked via the integrated terminal (`sendText`).
 * @param shellPrefix - Resolved prefix (e.g. `node "…/mcdata.bundled.cjs"` or `mcdata`)
 * @param args - Arguments after the prefix
 * @returns {string} full command line string for `spawn(..., { shell: true })`
 */
export function buildMcdataShellCommandLine(shellPrefix: string, args: string[]): string {
    const quotedArgs = args.map((a) => (a.includes(' ') ? `"${a}"` : a));
    return `${shellPrefix} ${quotedArgs.join(' ')}`.trim();
}
