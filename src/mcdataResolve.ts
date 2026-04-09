import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

/** Optional overrides for unit tests. */
export type McdataResolveDeps = {
    existsSync?: typeof fs.existsSync;
    execSync?: typeof execSync;
    platform?: NodeJS.Platform;
};

const plat = (deps?: McdataResolveDeps) => deps?.platform ?? process.platform;

/**
 * Quote a single shell token if it contains whitespace or quotes.
 */
export function quoteShellToken(token: string): string {
    if (!/[ \t"]/.test(token)) {
        return token;
    }
    return `"${token.replace(/"/g, '\\"')}"`;
}

export function getWorkspaceBinMcdata(projectRoot: string, deps?: McdataResolveDeps): string | undefined {
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

/**
 * Resolution order: custom path → workspace .bin → global PATH → bundled `node …/mcdata.bundled.cjs`.
 */
export function buildMcdataShellPrefix(
    options: {
        customPath: string | undefined;
        projectRoot: string;
        extensionPath: string;
    },
    deps?: McdataResolveDeps
): { prefix: string } | { error: string } {
    const exists = deps?.existsSync ?? fs.existsSync;
    const custom = options.customPath?.trim();
    if (custom) {
        return { prefix: quoteShellToken(custom) };
    }

    const ws = getWorkspaceBinMcdata(options.projectRoot, deps);
    if (ws) {
        return { prefix: quoteShellToken(ws) };
    }

    if (mcdataExistsOnPath(deps)) {
        return { prefix: 'mcdata' };
    }

    const bundled = bundledMcdataScriptPath(options.extensionPath);
    if (!exists(bundled)) {
        return {
            error: `Bundled mcdata not found at ${bundled}. Reinstall the extension or set sfmcData.mcdataPath.`,
        };
    }

    return { prefix: `node ${quoteShellToken(bundled)}` };
}
