import type { McdataLaunch } from './mcdataResolve';

/**
 * Human-readable display only. Never pass this string to a shell or process API.
 * Shows the logical CLI, omitting internal executable and launcher arguments.
 * JSON quoting keeps empty tokens and tokens with whitespace or shell syntax unambiguous.
 * @param _launch - Resolved launcher retained for interface compatibility.
 * @param arguments_ - CLI arguments to display, never execute as text.
 * @returns {string} Human-readable argument display.
 */
export function buildMcdataCommandDisplay(_launch: McdataLaunch, arguments_: string[]): string {
    return ['⚡', 'mcdata', ...arguments_]
        .map((argument) =>
            !argument || /[\s\p{Cc}"'\\`$&|<>^%!;(){}[\]*?#~]/u.test(argument)
                ? JSON.stringify(argument)
                : argument
        )
        .join(' ');
}
