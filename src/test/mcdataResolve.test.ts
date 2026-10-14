import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execSync as nodeExecSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import path from 'node:path';
import {
    quoteShellToken,
    bundledMcdataScriptPath,
    buildMcdataShellPrefix,
    getWorkspaceBinMcdata,
    normalizeMcdataSource,
    isBundledNodeVersionSupported,
} from '../mcdataResolve';

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
    for (const source of ['bundled', 'auto'] as const) {
        it(`checks the external runtime for ${source} fallback`, () => {
            const result = buildMcdataShellPrefix(
                {
                    mcdataSource: source,
                    customPath: '',
                    projectRoot: '/proj',
                    extensionPath: '/ext',
                },
                {
                    existsSync: (p) => String(p) === bundledMcdataScriptPath('/ext'),
                    execSync: (() => {
                        throw new Error('no mcdata');
                    }) as typeof nodeExecSync,
                    execFileSync: (() =>
                        'v20.19.0') as unknown as typeof import('node:child_process').execFileSync,
                }
            );
            assert.ok('error' in result);
            assert.match(result.error, /22\.22\.2.*24\.15\.0/);
        });
    }
    it('returns actionable guidance when node cannot run', () => {
        const result = buildMcdataShellPrefix(
            {
                mcdataSource: 'bundled',
                customPath: '',
                projectRoot: '/proj',
                extensionPath: '/ext',
            },
            {
                existsSync: () => true,
                execFileSync: (() => {
                    throw new Error('ENOENT');
                }) as typeof import('node:child_process').execFileSync,
            }
        );
        assert.ok('error' in result);
        assert.match(result.error, /Could not determine.*Upgrade Node.js/);
    });
});

describe('normalizeMcdataSource', () => {
    it('returns bundled for unknown values', () => {
        assert.equal(normalizeMcdataSource(), 'bundled');
        assert.equal(normalizeMcdataSource(''), 'bundled');
        assert.equal(normalizeMcdataSource('invalid'), 'bundled');
    });

    it('accepts valid enum strings', () => {
        assert.equal(normalizeMcdataSource('auto'), 'auto');
        assert.equal(normalizeMcdataSource('custom'), 'custom');
        assert.equal(normalizeMcdataSource('bundled'), 'bundled');
    });
});

describe('quoteShellToken', () => {
    it('returns bare token without spaces', () => {
        assert.equal(quoteShellToken('mcdata'), 'mcdata');
    });

    it('wraps tokens with spaces in double quotes', () => {
        assert.equal(
            quoteShellToken(String.raw`C:\Program Files\mcdata.cmd`),
            String.raw`"C:\Program Files\mcdata.cmd"`
        );
    });
});

describe('bundledMcdataScriptPath', () => {
    it('joins extension path to bundled mcdata script', () => {
        const p = bundledMcdataScriptPath('/ext');
        assert.equal(p, path.join('/ext', 'out', 'mcdata.bundled.cjs'));
    });
});

describe('getWorkspaceBinMcdata', () => {
    let temporary: string;
    before(() => {
        temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'sfmc-data-ws-'));
        const binDirectory = path.join(temporary, 'node_modules', '.bin');
        fs.mkdirSync(binDirectory, { recursive: true });
        fs.writeFileSync(path.join(binDirectory, 'mcdata'), '#!/bin/sh\necho', { mode: 0o755 });
    });
    after(() => {
        fs.rmSync(temporary, { recursive: true, force: true });
    });

    it('finds unix-style shim', () => {
        const found = getWorkspaceBinMcdata(temporary, { platform: 'linux' });
        assert.equal(found, path.join(temporary, 'node_modules', '.bin', 'mcdata'));
    });
});

describe('buildMcdataShellPrefix', () => {
    for (const source of ['custom', 'workspace', 'path'] as const) {
        it(`does not probe external node for ${source} executable`, () => {
            const result = buildMcdataShellPrefix(
                {
                    mcdataSource: source === 'custom' ? 'custom' : 'auto',
                    customPath: 'custom-mcdata',
                    projectRoot: '/proj',
                    extensionPath: '/ext',
                },
                {
                    existsSync: () => source === 'workspace',
                    execSync: (() => '') as unknown as typeof nodeExecSync,
                    execFileSync: (() => {
                        throw new Error('must not probe node');
                    }) as typeof import('node:child_process').execFileSync,
                }
            );
            assert.ok('prefix' in result);
        });
    }

    it('custom source uses trimmed path', () => {
        const r = buildMcdataShellPrefix({
            mcdataSource: 'custom',
            customPath: String.raw`C:\Tools\mcdata.cmd`,
            projectRoot: '/proj',
            extensionPath: '/ext',
        });
        assert.ok('prefix' in r);
        if ('prefix' in r) {
            assert.equal(r.prefix, String.raw`C:\Tools\mcdata.cmd`);
        }
    });

    it('custom source returns error when path is empty', () => {
        const r = buildMcdataShellPrefix({
            mcdataSource: 'custom',
            customPath: ' '.repeat(3),
            projectRoot: '/proj',
            extensionPath: '/ext',
        });
        assert.ok('error' in r);
        if ('error' in r) {
            assert.match(r.error, /mcdataPath/);
        }
    });

    it('bundled source ignores a non-empty customPath and uses bundled script only', () => {
        const extension = fs.mkdtempSync(path.join(os.tmpdir(), 'sfmc-data-ext-'));
        const script = path.join(extension, 'out', 'mcdata.bundled.cjs');
        fs.mkdirSync(path.dirname(script), { recursive: true });
        fs.writeFileSync(script, '');
        try {
            const r = buildMcdataShellPrefix(
                {
                    mcdataSource: 'bundled',
                    customPath: String.raw`C:\Should\Not\Matter\mcdata.cmd`,
                    projectRoot: '/nonexistent-workspace',
                    extensionPath: extension,
                },
                {
                    platform: 'linux',
                    existsSync: (p: fs.PathLike) => String(p) === script,
                    execFileSync: (() =>
                        'v24.15.0') as unknown as typeof import('node:child_process').execFileSync,
                    execSync: (() => {
                        throw new Error('should not probe PATH');
                    }) as typeof nodeExecSync,
                }
            );
            assert.ok('prefix' in r);
            if ('prefix' in r) {
                assert.equal(r.prefix, `node ${quoteShellToken(script)}`);
            }
        } finally {
            fs.rmSync(extension, { recursive: true, force: true });
        }
    });

    it('auto uses workspace bin when present and ignores customPath', () => {
        const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'sfmc-data-bm-'));
        const shim = path.join(temporary, 'node_modules', '.bin', 'mcdata');
        fs.mkdirSync(path.dirname(shim), { recursive: true });
        fs.writeFileSync(shim, '');
        try {
            const r = buildMcdataShellPrefix(
                {
                    mcdataSource: 'auto',
                    customPath: String.raw`C:\Ignored\mcdata.cmd`,
                    projectRoot: temporary,
                    extensionPath: '/ext',
                },
                {
                    platform: 'linux',
                    execSync: (() => {
                        throw new Error('should not probe PATH');
                    }) as typeof nodeExecSync,
                }
            );
            assert.ok('prefix' in r);
            if ('prefix' in r) {
                assert.equal(r.prefix, quoteShellToken(shim));
            }
        } finally {
            fs.rmSync(temporary, { recursive: true, force: true });
        }
    });

    it('auto uses mcdata on PATH when workspace bin missing', () => {
        let isProbed = false;
        const r = buildMcdataShellPrefix(
            {
                mcdataSource: 'auto',
                customPath: '',
                projectRoot: '/nonexistent-workspace',
                extensionPath: '/ext',
            },
            {
                platform: 'linux',
                existsSync: () => false,
                execSync: (() => {
                    isProbed = true;
                    return '';
                }) as unknown as typeof nodeExecSync,
            }
        );
        assert.ok(isProbed);
        assert.ok('prefix' in r);
        if ('prefix' in r) {
            assert.equal(r.prefix, 'mcdata');
        }
    });

    it('auto falls back to bundled node script when PATH has no mcdata', () => {
        const extension = fs.mkdtempSync(path.join(os.tmpdir(), 'sfmc-data-ext-'));
        const script = path.join(extension, 'out', 'mcdata.bundled.cjs');
        fs.mkdirSync(path.dirname(script), { recursive: true });
        fs.writeFileSync(script, '');
        try {
            const r = buildMcdataShellPrefix(
                {
                    mcdataSource: 'auto',
                    customPath: '',
                    projectRoot: '/nonexistent-workspace',
                    extensionPath: extension,
                },
                {
                    platform: 'linux',
                    existsSync: (p: fs.PathLike) => String(p) === script,
                    execFileSync: (() =>
                        'v24.15.0') as unknown as typeof import('node:child_process').execFileSync,
                    execSync: (() => {
                        throw new Error('not on path');
                    }) as typeof nodeExecSync,
                }
            );
            assert.ok('prefix' in r);
            if ('prefix' in r) {
                assert.equal(r.prefix, `node ${quoteShellToken(script)}`);
            }
        } finally {
            fs.rmSync(extension, { recursive: true, force: true });
        }
    });

    it('returns error when bundled script is missing (bundled source)', () => {
        const r = buildMcdataShellPrefix(
            {
                mcdataSource: 'bundled',
                customPath: '',
                projectRoot: '/nonexistent-workspace',
                extensionPath: '/no-bundle',
            },
            {
                existsSync: () => false,
                execSync: (() => {
                    throw new Error('not on path');
                }) as typeof nodeExecSync,
            }
        );
        assert.ok('error' in r);
        if ('error' in r) {
            assert.match(r.error, /Bundled mcdata not found/);
        }
    });
});
