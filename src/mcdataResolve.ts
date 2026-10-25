import * as fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';

export type McdataLaunch = { executable: string; prefixArgs: string[] };
export type McdataResolution = McdataLaunch | { error: string };

/**
Optional filesystem and runtime overrides for host-free tests.
 */
export type McdataResolveDependencies = {
    existsSync?: typeof fs.existsSync;
    readFileSync?: typeof fs.readFileSync;
    execFile?: typeof execFile;
    platform?: NodeJS.Platform;
};

const plat = (dependencies?: McdataResolveDependencies) =>
    dependencies?.platform ?? process.platform;

// Match the complete npm cmd-shim template, not arbitrary batch syntax.
const NPM_CMD_TEMPLATE = String.raw`@ECHO off
GOTO start
:find_dp0
SET dp0=%~dp0
EXIT /b
:start
SETLOCAL
CALL :find_dp0

IF EXIST "%dp0%\node.exe" (
  SET "_prog=%dp0%\node.exe"
) ELSE (
  SET "_prog=node"
  SET PATHEXT=%PATHEXT:;.JS;=;%
)

endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  "%dp0%\__TARGET__" %*
`;

function compatibilityError(executable: string): { error: string } {
    return {
        error: `Compatibility checkpoint: ${executable} is not a recognized npm Windows launcher or native .exe. Shell launchers cannot safely preserve literal arguments. Select a native executable or a standard npm mcdata.cmd launcher; no bundled fallback was used.`,
    };
}

/**
Resolve an npm shim without invoking cmd.exe or interpreting its argument text.
 * @param executable - Selected executable or npm shim path.
 * @param dependencies - Optional host-free filesystem overrides.
 * @returns {McdataResolution} Shell-free launcher or compatibility error.
 */
export function resolveMcdataExecutable(
    executable: string,
    dependencies?: McdataResolveDependencies
): McdataResolution {
    if (plat(dependencies) !== 'win32' || /\.exe$/i.test(executable)) {
        return { executable, prefixArgs: [] };
    }
    if (!/\.cmd$/i.test(executable)) {
        return compatibilityError(executable);
    }
    try {
        const read = dependencies?.readFileSync ?? fs.readFileSync;
        const content = String(read(executable, 'utf8')).replaceAll('\r\n', '\n');
        const [before, after] = NPM_CMD_TEMPLATE.split('__TARGET__', 2);
        if (!content.startsWith(before) || !content.endsWith(after)) {
            return compatibilityError(executable);
        }
        const target = content.slice(before.length, -after.length);
        if (!target || /["%\r\n]/.test(target) || path.win32.isAbsolute(target)) {
            return compatibilityError(executable);
        }
        const directory = path.dirname(executable);
        const script = path.resolve(
            directory,
            target.replaceAll('\\', () => path.sep)
        );
        const exists = dependencies?.existsSync ?? fs.existsSync;
        if (!exists(script)) {
            return { error: `The npm mcdata launcher target does not exist: ${script}` };
        }
        const adjacentNode = path.join(directory, 'node.exe');
        return {
            executable: exists(adjacentNode) ? adjacentNode : 'node',
            prefixArgs: [script],
        };
    } catch {
        return compatibilityError(executable);
    }
}

export function getWorkspaceBinMcdata(
    projectRoot: string,
    dependencies?: McdataResolveDependencies
): string | undefined {
    const exists = dependencies?.existsSync ?? fs.existsSync;
    const binDirectory = path.join(projectRoot, 'node_modules', '.bin');
    const names =
        plat(dependencies) === 'win32'
            ? ['mcdata.cmd', 'mcdata.exe', 'mcdata.bat', 'mcdata']
            : ['mcdata'];
    return names
        .map((name) => path.join(binDirectory, name))
        .find((candidate) => exists(candidate));
}

function probeExecutable(
    executable: string,
    arguments_: string[],
    dependencies?: McdataResolveDependencies
): Promise<string> {
    const run = dependencies?.execFile ?? execFile;
    return new Promise((resolve, reject) => {
        run(
            executable,
            arguments_,
            {
                encoding: 'utf8',
                windowsHide: true,
                timeout: 5000,
                maxBuffer: 1024 * 1024,
                shell: false,
            },
            (ex, stdout) => {
                if (ex) {
                    reject(ex);
                } else {
                    resolve(String(stdout));
                }
            }
        );
    });
}

/**
Keep lookup precedence, allowing only an extensionless result's exact cmd companion.
 * @param output - Executable lookup output, in search order.
 * @param dependencies - Optional host-free runtime overrides.
 * @returns {string | undefined} First launcher or its npm cmd companion candidate.
 */
function selectLookupCandidate(
    output: string,
    dependencies?: McdataResolveDependencies
): string | undefined {
    const candidates = output.trim().split(/\r?\n/).filter(Boolean);
    const first = candidates[0];
    if (first && plat(dependencies) === 'win32' && !path.win32.extname(first)) {
        // Never execute the extensionless shell shim or skip to another PATH directory.
        return (
            candidates.find(
                (candidate) => candidate.toLowerCase() === `${first}.cmd`.toLowerCase()
            ) ?? first
        );
    }
    return first;
}

async function findMcdataOnPath(
    dependencies?: McdataResolveDependencies
): Promise<string | undefined> {
    try {
        const isWindows = plat(dependencies) === 'win32';
        const output = await probeExecutable(
            isWindows ? 'where.exe' : '/bin/sh',
            isWindows ? ['mcdata'] : ['-c', 'command -v mcdata'],
            dependencies
        );
        return selectLookupCandidate(output, dependencies);
    } catch {
        return undefined;
    }
}

export function bundledMcdataScriptPath(extensionPath: string): string {
    return path.join(extensionPath, 'out', 'mcdata.bundled.cjs');
}

export type McdataSource = 'bundled' | 'auto' | 'custom';
const VALID_MCDATA_SOURCES: readonly McdataSource[] = ['bundled', 'auto', 'custom'];

export function normalizeMcdataSource(raw?: string): McdataSource {
    return raw && (VALID_MCDATA_SOURCES as readonly string[]).includes(raw)
        ? (raw as McdataSource)
        : 'bundled';
}

async function bundledLaunchOrError(
    extensionPath: string,
    dependencies?: McdataResolveDependencies
): Promise<McdataResolution> {
    const exists = dependencies?.existsSync ?? fs.existsSync;
    const bundled = bundledMcdataScriptPath(extensionPath);
    if (!exists(bundled)) {
        return {
            error: `Bundled mcdata not found at ${bundled}. Reinstall the extension or set sfmcData.mcdataSource to "auto" or "custom".`,
        };
    }
    const guidance =
        'Bundled mcdata requires Node.js ^22.22.2 || >=24.15.0 on PATH. Upgrade Node.js and restart VS Code/Cursor, or select a compatible executable with sfmcData.mcdataSource "auto" or "custom".';
    try {
        const version = (await probeExecutable('node', ['--version'], dependencies)).trim();
        if (!isBundledNodeVersionSupported(version)) {
            return { error: `${guidance} Detected: ${version}.` };
        }
    } catch {
        return { error: `Could not determine the Node.js version on PATH. ${guidance}` };
    }
    return { executable: 'node', prefixArgs: [bundled] };
}

/**
Whether the external runtime satisfies ^22.22.2 || >=24.15.0.
 * @param version - External Node version output.
 * @returns {boolean} Whether this stable Node release is supported.
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
Preserve custom, bundled, and workspace → PATH → bundled resolution order.
 * @param options - Launcher settings and project locations.
 * @param options.mcdataSource - Selected resolution mode.
 * @param options.customPath - Executable path for custom mode.
 * @param options.projectRoot - Project directory for workspace resolution.
 * @param options.extensionPath - Extension installation directory.
 * @param dependencies - Optional host-free runtime overrides.
 * @returns {Promise<McdataResolution>} Shell-free launcher or actionable resolution error.
 */
export async function buildMcdataLaunch(
    options: {
        mcdataSource: McdataSource;
        customPath: string | undefined;
        projectRoot: string;
        extensionPath: string;
    },
    dependencies?: McdataResolveDependencies
): Promise<McdataResolution> {
    if (options.mcdataSource === 'custom') {
        let custom = options.customPath?.trim() ?? '';
        if (!custom) {
            return {
                error: 'Set sfmcData.mcdataPath to your mcdata executable when sfmcData.mcdataSource is "custom".',
            };
        }
        // Bare Windows command names must be resolved before classifying their launcher.
        if (plat(dependencies) === 'win32' && !/[\\/]/.test(custom)) {
            try {
                const output = await probeExecutable('where.exe', [custom], dependencies);
                const candidate = selectLookupCandidate(output, dependencies);
                if (!candidate) {
                    return { error: `Could not find the configured mcdata executable: ${custom}` };
                }
                custom = candidate;
            } catch {
                return { error: `Could not find the configured mcdata executable: ${custom}` };
            }
        }
        return resolveMcdataExecutable(custom, dependencies);
    }
    if (options.mcdataSource === 'auto') {
        const candidate =
            getWorkspaceBinMcdata(options.projectRoot, dependencies) ??
            (await findMcdataOnPath(dependencies));
        if (candidate) {
            return resolveMcdataExecutable(candidate, dependencies);
        }
    }
    return bundledLaunchOrError(options.extensionPath, dependencies);
}
