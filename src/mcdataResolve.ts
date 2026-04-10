import * as fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

/** Optional overrides for unit tests. */
export type McdataResolveDeps = {
    existsSync?: typeof fs.existsSync;
    execSync?: typeof execSync;
    platform?: NodeJS.Platform;
};

const plat = (deps?: McdataResolveDeps) => deps?.platform ?? process.platform;

/**
 * Quote a single shell token if it contains whitespace or quotes.
 * @param token
 */
export function quoteShellToken(token: string): string {
    if (!/[ \t"]/.test(token)) {
        return token;
    }
    return `"${token.replaceAll('"', String.raw`\"`)}"`;
}

export function getWorkspaceBinMcdata(
    projectRoot: string,
    deps?: McdataResolveDeps
): string | undefined {
    const exists = deps?.existsSync ?? fs.existsSync;
    const binDir = path.join(projectRoot, 'node_modules', '.bin');
    if (plat(deps) === 'win32') {
        const cmd = path.join(binDir, 'mcdata.cmd');
        if (exists(cmd)) {
            return cmd;
        }
        const shim = path.join(binDir, 'mcdata');
        if (exists(shim)) {
            return shim;
        }
    } else {
        const shim = path.join(binDir, 'mcdata');
        if (exists(shim)) {
            return shim;
        }
    }
    return undefined;
}

export function mcdataExistsOnPath(deps?: McdataResolveDeps): boolean {
    const run = deps?.execSync ?? execSync;
    try {
        if (plat(deps) === 'win32') {
            run('where.exe mcdata', { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
        } else {
            run('command -v mcdata', { stdio: ['ignore', 'pipe', 'ignore'], shell: '/bin/sh' });
        }
        return true;
    } catch {
        return false;
    }
}

export function bundledMcdataScriptPath(extensionPath: string): string {
    return path.join(extensionPath, 'out', 'mcdata.bundled.cjs');
}

/** How the extension resolves the `mcdata` executable when spawning the CLI. */
export type McdataSource = 'bundled' | 'auto' | 'custom';

const VALID_MCDATA_SOURCES: readonly McdataSource[] = ['bundled', 'auto', 'custom'];

/**
 * Normalizes a configuration value to {@link McdataSource}. Unknown values default to `bundled`.
 * @param raw
 */
export function normalizeMcdataSource(raw?: string): McdataSource {
    if (raw && (VALID_MCDATA_SOURCES as readonly string[]).includes(raw)) {
        return raw as McdataSource;
    }
    return 'bundled';
}

function bundledPrefixOrError(
    extensionPath: string,
    deps?: McdataResolveDeps
): { prefix: string } | { error: string } {
    const exists = deps?.existsSync ?? fs.existsSync;
    const bundled = bundledMcdataScriptPath(extensionPath);
    if (!exists(bundled)) {
        return {
            error: `Bundled mcdata not found at ${bundled}. Reinstall the extension or set sfmcData.mcdataSource to "auto" or "custom".`,
        };
    }
    return { prefix: `node ${quoteShellToken(bundled)}` };
}

/**
 * Resolution order depends on `mcdataSource`:
 * - **bundled** — only the minified CLI under the extension (`node …/out/mcdata.bundled.cjs`).
 * - **auto** — workspace `node_modules/.bin/mcdata` → `mcdata` on `PATH` → bundled script.
 * - **custom** — `customPath` after trim (quoted); empty path is an error.
 * @param options
 * @param options.mcdataSource
 * @param options.customPath
 * @param options.projectRoot
 * @param options.extensionPath
 * @param deps
 */
export function buildMcdataShellPrefix(
    options: {
        mcdataSource: McdataSource;
        customPath: string | undefined;
        projectRoot: string;
        extensionPath: string;
    },
    deps?: McdataResolveDeps
): { prefix: string } | { error: string } {
    const source = options.mcdataSource;

    if (source === 'custom') {
        const custom = options.customPath?.trim() ?? '';
        if (!custom) {
            return {
                error: 'Set sfmcData.mcdataPath to your mcdata executable when sfmcData.mcdataSource is "custom".',
            };
        }
        return { prefix: quoteShellToken(custom) };
    }

    if (source === 'bundled') {
        return bundledPrefixOrError(options.extensionPath, deps);
    }

    // auto
    const ws = getWorkspaceBinMcdata(options.projectRoot, deps);
    if (ws) {
        return { prefix: quoteShellToken(ws) };
    }

    if (mcdataExistsOnPath(deps)) {
        return { prefix: 'mcdata' };
    }

    return bundledPrefixOrError(options.extensionPath, deps);
}
