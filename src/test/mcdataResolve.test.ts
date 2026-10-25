import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import path from 'node:path';
import * as os from 'node:os';
import {
    bundledMcdataScriptPath,
    buildMcdataLaunch,
    getWorkspaceBinMcdata,
    normalizeMcdataSource,
    isBundledNodeVersionSupported,
    resolveMcdataExecutable,
    type McdataResolveDependencies,
} from '../mcdataResolve';

const options = {
    mcdataSource: 'auto' as const,
    customPath: '',
    projectRoot: '/proj',
    extensionPath: '/ext',
};
const run = (callback: (executable: string, arguments_: readonly string[]) => string) =>
    ((
        executable: string,
        arguments_: string[],
        _options: unknown,
        done: (ex: Error | null, stdout: string) => void
    ) => {
        try {
            done(null, callback(executable, arguments_));
        } catch (ex) {
            done(ex as Error, '');
        }
    }) as unknown as typeof execFile;
// Full template verified against the installed node_modules/.bin/mcdata.cmd.
const npmShim = String.raw`@ECHO off
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

endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  "%dp0%\..\sfmc-dataloader\bin\mcdata.mjs" %*
`;

function shimDependencies(content: string, hasAdjacentNode = false): McdataResolveDependencies {
    return {
        platform: 'win32',
        readFileSync: (() => content) as unknown as typeof fs.readFileSync,
        existsSync: (candidate) => !String(candidate).endsWith('node.exe') || hasAdjacentNode,
    };
}

describe('bundled Node runtime', () => {
    for (const version of ['v22.22.2', '22.23.0', 'v24.15.0', 'v25.0.0', 'v26.0.0']) {
        it(`accepts ${version}`, () => assert.ok(isBundledNodeVersionSupported(version)));
    }
    for (const version of [
        'v20.19.0',
        'v22.22.1',
        'v23.9.0',
        'v24.14.9',
        'unknown',
        '',
        'v24.15.0-rc.1',
    ]) {
        it(`rejects ${version || 'empty output'}`, () =>
            assert.ok(!isBundledNodeVersionSupported(version)));
    }
    it('returns the bundled script separately and checks the external runtime', async () => {
        const result = await buildMcdataLaunch(
            { ...options, mcdataSource: 'bundled' },
            {
                existsSync: () => true,
                execFile: run((executable, arguments_) => {
                    assert.equal(executable, 'node');
                    assert.deepEqual(arguments_, ['--version']);
                    return 'v24.15.0';
                }),
            }
        );
        assert.deepEqual(result, {
            executable: 'node',
            prefixArgs: [bundledMcdataScriptPath('/ext')],
        });
    });
    for (const version of ['v20.19.0', 'unavailable']) {
        it(`reports incompatible runtime ${version}`, async () => {
            const result = await buildMcdataLaunch(
                { ...options, mcdataSource: 'bundled' },
                {
                    existsSync: () => true,
                    execFile: run(() => {
                        if (version === 'unavailable') {
                            throw new Error('ENOENT');
                        }
                        return version;
                    }),
                }
            );
            assert.ok('error' in result);
            assert.match(result.error, /22\.22\.2.*24\.15\.0/);
        });
    }
});

describe('launcher source resolution', () => {
    it('normalizes source settings', () => {
        for (const source of [undefined, '', 'invalid']) {
            assert.equal(normalizeMcdataSource(source), 'bundled');
        }
        for (const source of ['auto', 'custom', 'bundled']) {
            assert.equal(normalizeMcdataSource(source), source);
        }
    });
    it('keeps custom POSIX shebang executables literal', async () => {
        assert.deepEqual(
            await buildMcdataLaunch(
                { ...options, mcdataSource: 'custom', customPath: ' /my files/mcdata ' },
                { platform: 'linux' }
            ),
            { executable: '/my files/mcdata', prefixArgs: [] }
        );
    });
    it('requires a custom path', async () => {
        assert.ok('error' in (await buildMcdataLaunch({ ...options, mcdataSource: 'custom' })));
    });
    it('prefers workspace bin without probing PATH', async () => {
        const workspace = path.join('/proj', 'node_modules', '.bin', 'mcdata');
        assert.equal(
            getWorkspaceBinMcdata('/proj', { platform: 'linux', existsSync: () => true }),
            workspace
        );
        assert.deepEqual(
            await buildMcdataLaunch(options, {
                platform: 'linux',
                existsSync: () => true,
                execFile: run(() => {
                    throw new Error('must not probe');
                }),
            }),
            { executable: workspace, prefixArgs: [] }
        );
    });
    it('resolves the actual PATH executable without executing user arguments', async () => {
        const result = await buildMcdataLaunch(options, {
            platform: 'win32',
            existsSync: () => false,
            execFile: run((executable, arguments_) => {
                assert.equal(executable, 'where.exe');
                assert.deepEqual(arguments_, ['mcdata']);
                return 'C:\\Tools\\mcdata.exe\r\nC:\\Other\\mcdata.cmd\r\n';
            }),
        });
        assert.deepEqual(result, { executable: String.raw`C:\Tools\mcdata.exe`, prefixArgs: [] });
    });
    it('resolves custom bare Windows names with literal probe argv', async () => {
        const customPath = 'mcdata&A%!';
        const result = await buildMcdataLaunch(
            { ...options, mcdataSource: 'custom', customPath },
            {
                platform: 'win32',
                execFile: run((executable, arguments_) => {
                    assert.equal(executable, 'where.exe');
                    assert.deepEqual(arguments_, [customPath]);
                    return 'C:\\Tools & More\\mcdata.exe\r\n';
                }),
            }
        );
        assert.deepEqual(result, {
            executable: String.raw`C:\Tools & More\mcdata.exe`,
            prefixArgs: [],
        });
    });
    for (const mcdataSource of ['auto', 'custom'] as const) {
        it(`resolves extensionless-first npm PATH results in ${mcdataSource} mode`, async () => {
            const extensionless = path.resolve('npm bin', 'mcdata');
            const shim = `${extensionless}.cmd`;
            const script = path.resolve(
                path.dirname(shim),
                '..',
                'sfmc-dataloader',
                'bin',
                'mcdata.mjs'
            );
            const reads: string[] = [];
            const probes: string[] = [];
            const result = await buildMcdataLaunch(
                { ...options, mcdataSource, customPath: 'mcdata' },
                {
                    platform: 'win32',
                    existsSync: (candidate) => String(candidate) === script,
                    readFileSync: ((candidate: fs.PathOrFileDescriptor) => {
                        reads.push(String(candidate));
                        assert.equal(candidate, shim);
                        return npmShim;
                    }) as typeof fs.readFileSync,
                    execFile: run((executable, arguments_) => {
                        probes.push(executable);
                        assert.equal(executable, 'where.exe');
                        assert.deepEqual(arguments_, ['mcdata']);
                        return `${extensionless}\r\n${shim}\r\n`;
                    }),
                }
            );
            assert.deepEqual(result, { executable: 'node', prefixArgs: [script] });
            assert.deepEqual(reads, [shim]);
            assert.deepEqual(probes, ['where.exe']);
        });
        for (const lookup of [
            'C:\\First\\mcdata\r\nC:\\Other\\mcdata.cmd\r\n',
            'C:\\First\\mcdata.bat\r\nC:\\First\\mcdata.cmd\r\n',
            'C:\\First\\mcdata\r\nC:\\First\\mcdata.cmd\r\nC:\\Other\\mcdata.exe\r\n',
        ]) {
            it(`rejects unsupported first wrappers without fallback in ${mcdataSource}: ${JSON.stringify(lookup)}`, async () => {
                const result = await buildMcdataLaunch(
                    { ...options, mcdataSource, customPath: 'mcdata' },
                    {
                        ...shimDependencies('unsupported batch'),
                        existsSync: () => false,
                        execFile: run((executable) => {
                            assert.equal(executable, 'where.exe');
                            return lookup;
                        }),
                    }
                );
                assert.ok('error' in result);
                assert.match(result.error, /Compatibility checkpoint/);
            });
        }
    }
    it('reports an empty custom lookup instead of selecting another source', async () => {
        const result = await buildMcdataLaunch(
            { ...options, mcdataSource: 'custom', customPath: 'mcdata' },
            { platform: 'win32', execFile: run(() => '\r\n') }
        );
        assert.ok('error' in result);
        assert.match(result.error, /Could not find the configured mcdata executable: mcdata/);
    });
    it('falls back to bundled only when no external launcher is found', async () => {
        assert.deepEqual(
            await buildMcdataLaunch(options, {
                existsSync: (candidate) => String(candidate) === bundledMcdataScriptPath('/ext'),
                execFile: run((executable) => {
                    if (executable !== 'node') {
                        throw new Error('missing');
                    }
                    return 'v24.15.0';
                }),
            }),
            { executable: 'node', prefixArgs: [bundledMcdataScriptPath('/ext')] }
        );
    });
    it('reports a missing bundle without a probe', async () => {
        assert.ok(
            'error' in
                (await buildMcdataLaunch(
                    { ...options, mcdataSource: 'bundled' },
                    {
                        existsSync: () => false,
                        execFile: run(() => {
                            throw new Error('must not probe');
                        }),
                    }
                ))
        );
    });
});

describe('asynchronous bounded probes', () => {
    for (const mcdataSource of ['bundled', 'auto', 'custom'] as const) {
        it(`keeps the event loop responsive during a pending ${mcdataSource} probe`, async () => {
            let complete: (() => void) | undefined;
            let isSettled = false;
            const pending = (async () => {
                const result = await buildMcdataLaunch(
                    { ...options, mcdataSource, customPath: 'mcdata' },
                    {
                        platform: 'win32',
                        existsSync: (candidate) =>
                            String(candidate) === bundledMcdataScriptPath('/ext'),
                        execFile: ((
                            _executable: string,
                            _arguments: string[],
                            probeOptions: {
                                timeout: number;
                                shell: boolean;
                                maxBuffer: number;
                                windowsHide: boolean;
                            },
                            done: (ex: null, stdout: string) => void
                        ) => {
                            assert.equal(probeOptions.timeout, 5000);
                            assert.equal(probeOptions.shell, false);
                            assert.equal(probeOptions.windowsHide, true);
                            assert.equal(probeOptions.maxBuffer, 1024 * 1024);
                            complete = () =>
                                done(
                                    null,
                                    mcdataSource === 'bundled'
                                        ? 'v24.15.0'
                                        : String.raw`C:\Tools\mcdata.exe`
                                );
                        }) as unknown as typeof execFile,
                    }
                );
                isSettled = true;
                return result;
            })();
            await new Promise<void>((resolve) => setTimeout(resolve, 10));
            assert.equal(isSettled, false, 'timer must run while the external probe is pending');
            assert.ok(complete);
            complete();
            assert.ok(!('error' in (await pending)));
        });
    }
    it(
        'settles a real timed-out external probe as a resolution error',
        { timeout: 10000 },
        async () => {
            const result = await buildMcdataLaunch(
                { ...options, mcdataSource: 'bundled' },
                {
                    existsSync: () => true,
                    execFile: ((
                        _executable: string,
                        _arguments: string[],
                        probeOptions: Parameters<typeof execFile>[2],
                        done: never
                    ) =>
                        execFile(
                            process.execPath,
                            ['-e', 'setInterval(() => {}, 1000)'],
                            probeOptions,
                            done
                        )) as typeof execFile,
                }
            );
            assert.ok('error' in result);
            assert.match(result.error, /Could not determine the Node.js version/);
        }
    );
    it('does not cache version results across invocations', async () => {
        let probes = 0;
        const dependencies = {
            existsSync: () => true,
            execFile: run(() => {
                probes++;
                return 'v24.15.0';
            }),
        };
        await buildMcdataLaunch({ ...options, mcdataSource: 'bundled' }, dependencies);
        await buildMcdataLaunch({ ...options, mcdataSource: 'bundled' }, dependencies);
        assert.equal(probes, 2);
    });
});

describe('Windows launcher compatibility', () => {
    it('delivers literal argv through a resolved npm shim target', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sfmc-data-launch-'));
        const script = path.join(root, 'echo.cjs');
        const shim = path.join(root, 'mcdata.cmd');
        const arguments_ = ['', 'A&B', '|<>^%!;', '"quoted"', 'end\\', 'Grüße 世界', 'line\nbreak'];
        try {
            fs.writeFileSync(script, 'process.stdout.write(JSON.stringify(process.argv.slice(2)))');
            fs.writeFileSync(
                shim,
                npmShim.replace(String.raw`..\sfmc-dataloader\bin\mcdata.mjs`, 'echo.cjs')
            );
            const launch = resolveMcdataExecutable(shim, { platform: 'win32' });
            assert.ok(!('error' in launch));
            const output = execFileSync(launch.executable, [...launch.prefixArgs, ...arguments_], {
                encoding: 'utf8',
                shell: false,
            });
            assert.deepEqual(JSON.parse(output), arguments_);
        } finally {
            for (const file of [shim, script]) {
                if (fs.existsSync(file)) {
                    fs.unlinkSync(file);
                }
            }
            fs.rmdirSync(root);
        }
    });
    for (const newline of ['\n', '\r\n']) {
        it(`recognizes the installed full npm template with ${JSON.stringify(newline)}`, () => {
            const content = npmShim.replaceAll('\r\n', '\n').replaceAll('\n', () => newline);
            const shim = path.resolve('some space', 'mcdata.cmd');
            assert.deepEqual(resolveMcdataExecutable(shim, shimDependencies(content)), {
                executable: 'node',
                prefixArgs: [
                    path.resolve(path.dirname(shim), '..', 'sfmc-dataloader', 'bin', 'mcdata.mjs'),
                ],
            });
        });
    }
    it('resolves a variable script target and adjacent node.exe', () => {
        const content = npmShim.replace(
            String.raw`..\sfmc-dataloader\bin\mcdata.mjs`,
            String.raw`..\other package\echo.cjs`
        );
        const shim = path.resolve('bin', 'mcdata.cmd');
        assert.deepEqual(resolveMcdataExecutable(shim, shimDependencies(content, true)), {
            executable: path.join(path.dirname(shim), 'node.exe'),
            prefixArgs: [path.resolve('other package', 'echo.cjs')],
        });
    });
    for (const content of [
        '@echo off\nnode custom.js %*',
        `${npmShim}echo injected\n`,
        npmShim.replace('SETLOCAL', 'echo injected'),
        npmShim.replace(String.raw`..\sfmc-dataloader`, '%CUSTOM%'),
    ]) {
        it('rejects an unknown or modified template rather than interpreting it', () => {
            const result = resolveMcdataExecutable('mcdata.cmd', shimDependencies(content));
            assert.ok('error' in result);
            assert.match(result.error, /Compatibility checkpoint/);
        });
    }
    for (const executable of [String.raw`C:\Tools\mcdata.bat`, String.raw`C:\Tools\mcdata`]) {
        it(`rejects shell launcher ${executable}`, () =>
            assert.ok('error' in resolveMcdataExecutable(executable, { platform: 'win32' })));
    }
    it('does not silently fall back when an auto-selected launcher is incompatible', async () => {
        const result = await buildMcdataLaunch(options, {
            ...shimDependencies('custom batch'),
            existsSync: () => true,
            execFile: run(() => {
                throw new Error('must not probe');
            }),
        });
        assert.ok('error' in result);
        assert.match(result.error, /Compatibility checkpoint/);
    });
    it('reports a missing npm target', () => {
        const result = resolveMcdataExecutable('mcdata.cmd', {
            ...shimDependencies(npmShim),
            existsSync: () => false,
        });
        assert.ok('error' in result);
        assert.match(result.error, /target does not exist/);
    });
    it('keeps native exe paths directly executable', () =>
        assert.deepEqual(
            resolveMcdataExecutable(String.raw`C:\Tools & More\mcdata.exe`, { platform: 'win32' }),
            { executable: String.raw`C:\Tools & More\mcdata.exe`, prefixArgs: [] }
        ));
});
