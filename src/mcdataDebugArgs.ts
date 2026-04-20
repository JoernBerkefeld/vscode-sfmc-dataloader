/**
 * When enabled, appends `--debug` to mcdata argv (matches `sfmc-dataloader` CLI).
 * Does not duplicate if `--debug` is already present.
 * @param args - mcdata arguments after the executable (subcommand and flags)
 * @param enabled - from workspace setting `sfmcData.createDebugLog`
 * @returns {string[]} a new array (does not mutate `args`)
 */
export function appendMcdataDebugArg(args: readonly string[], enabled: boolean): string[] {
    if (!enabled) {
        return [...args];
    }
    if (args.includes('--debug')) {
        return [...args];
    }
    return [...args, '--debug'];
}
