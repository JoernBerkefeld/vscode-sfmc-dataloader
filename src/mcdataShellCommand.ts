import type { McdataLaunch } from './mcdataResolve';

/**
 * Human-readable display only. Never pass this string to a shell or process API.
 * JSON quoting keeps newlines, empty tokens, quotes and backslashes unambiguous.
 * @param launch - Resolved executable and leading arguments.
 * @param arguments_ - CLI arguments to display, never execute as text.
 * @returns {string} Human-readable argument display.
 */
export function buildMcdataCommandDisplay(launch: McdataLaunch, arguments_: string[]): string {
    return [launch.executable, ...launch.prefixArgs, ...arguments_]
        .map((argument) => JSON.stringify(argument))
        .join(' ');
}
