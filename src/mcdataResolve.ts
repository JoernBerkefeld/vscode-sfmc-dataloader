import * as fs from 'node:fs';
import path from 'node:path';
import { execFileSync, execSync } from 'node:child_process';

/**
 * Optional overrides for unit tests.
 */
export type McdataResolveDependencies = {
    existsSync?: typeof fs.existsSync;
    execFileSync?: typeof execFileSync;
    execSync?: typeof execSync;
    platform?: NodeJS.Platform;
};

const plat = (dependencies?: McdataResolveDependencies) =>
    dependencies?.platform ?? process.platform;

/**
 * Quote a single shell token if it contains whitespace or quotes.
 * @param token - raw argv token
 * @returns {string} same token, or double-quoted when needed
 */
export function quoteShellToken(token: string): string {
    if (!/[ \t"]/.test(token)) {
        return token;
    }
    return `"${token.replaceAll('"', String.raw`\"`)}"`;
}

export function getWorkspaceBinMcdata(
    projectRoot: string,
    dependencies?: McdataResolveDependencies
): string | undefined {
    const exists = dependencies?.existsSync ?? fs.existsSync;
    const binDirectory = path.join(projectRoot, 'node_modules', '.bin');
    if (plat(dependencies) === 'win32') {
        const command = path.join(binDirectory, 'mcdata.cmd');
        if (exists(command)) {
            return command;
        }
        const shim = path.join(binDirectory, 'mcdata');
        if (exists(shim)) {
            return shim;
        }
    } else {
        const shim = path.join(binDirectory, 'mcdata');
        if (exists(shim)) {
            return shim;
        }
    }
    return undefined;
}

export function isMcdataOnPath(dependencies?: McdataResolveDependencies): boolean {
    const run = dependencies?.execSync ?? execSync;
    try {
        if (plat(dependencies) === 'win32') {
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

/**
 * How the extension resolves the `mcdata` executable when spawning the CLI.
 */
export type McdataSource = 'bundled' | 'auto' | 'custom';

const VALID_MCDATA_SOURCES: readonly McdataSource[] = ['bundled', 'auto', 'custom'];

/**
 * Normalizes a configuration value to {@link McdataSource}. Unknown values default to `bundled`.
 * @param raw - value of `sfmcData.mcdataSource` (or undefined)
 * @returns {McdataSource} normalized enum value
 */
export function normalizeMcdataSource(raw?: string): McdataSource {
    if (raw && (VALID_MCDATA_SOURCES as readonly string[]).includes(raw)) {
        return raw as McdataSource;
    }
    return 'bundled';
}

function bundledPrefixOrError(
    extensionPath: string,
    dependencies?: McdataResolveDependencies
): { prefix: string } | { error: string } {
    const exists = dependencies?.existsSync ?? fs.existsSync;
    const bundled = bundledMcdataScriptPath(extensionPath);
    if (!exists(bundled)) {
        return {
            error: `Bundled mcdata not found at ${bundled}. Reinstall the extension or set sfmcData.mcdataSource to "auto" or "custom".`,
        };
    }
    const run = dependencies?.execFileSync ?? execFileSync;
    const guidance =
        'Bundled mcdata requires Node.js ^22.22.2 || >=24.15.0 on PATH. Upgrade Node.js and restart VS Code/Cursor, or select a compatible executable with sfmcData.mcdataSource "auto" or "custom".';
    try {
        const version = String(
            run('node', ['--version'], {
                encoding: 'utf8',
                windowsHide: true,
                timeout: 5000,
                stdio: ['ignore', 'pipe', 'ignore'],
            })
        ).trim();
        if (!isBundledNodeVersionSupported(version)) {
            return { error: `${guidance} Detected: ${version}.` };
        }
    } catch {
        return { error: `Could not determine the Node.js version on PATH. ${guidance}` };
    }
    return { prefix: `node ${quoteShellToken(bundled)}` };
}

/**
 * Tests the external runtime against the bundled loader's supported Node releases.
 * @param version - output of node --version
 * @returns {boolean} whether the stable release satisfies ^22.22.2 || >=24.15.0
 */
export function isBundledNodeVersionSupported(version: string): boolean {
    const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(version.trim());
    if (!match) {
        return false;
    }
    const [, major, minor, patch] = match.map(Number);
    return (
        (major === 22 && (minor > 22 || (minor === 22 && patch >= 2))) ||
        major > 24 ||
        (major === 24 && minor >= 15)
    );
}

/**
 * Resolution order depends on `mcdataSource`:
 * - **bundled** — only the minified CLI under the extension (`node …/out/mcdata.bundled.cjs`).
 * - **auto** — workspace `node_modules/.bin/mcdata` → `mcdata` on `PATH` → bundled script.
 * - **custom** — `customPath` after trim (quoted); empty path is an error.
 * @param options - resolution inputs from `sfmcData` settings and extension paths
 * @param options.mcdataSource - `bundled`, `auto`, or `custom`
 * @param options.customPath - executable path when `mcdataSource` is `custom` (may be empty)
 * @param options.projectRoot - workspace folder used to resolve `node_modules/.bin/mcdata`
 * @param options.extensionPath - extension install dir (bundled `mcdata.bundled.cjs`)
 * @param dependencies - optional overrides for `existsSync`, `execSync`, or `platform` (unit tests)
 * @returns {{ prefix: string } | { error: string }} shell prefix or user-facing error message
 */
export function buildMcdataShellPrefix(
    options: {
        mcdataSource: McdataSource;
        customPath: string | undefined;
        projectRoot: string;
        extensionPath: string;
    },
    dependencies?: McdataResolveDependencies
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
        return bundledPrefixOrError(options.extensionPath, dependencies);
    }

    // auto
    const ws = getWorkspaceBinMcdata(options.projectRoot, dependencies);
    if (ws) {
        return { prefix: quoteShellToken(ws) };
    }

    if (isMcdataOnPath(dependencies)) {
        return { prefix: 'mcdata' };
    }

    return bundledPrefixOrError(options.extensionPath, dependencies);
}
