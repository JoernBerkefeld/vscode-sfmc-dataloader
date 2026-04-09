import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execSync as nodeExecSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    quoteShellToken,
    bundledMcdataScriptPath,
    buildMcdataShellPrefix,
    getWorkspaceBinMcdata,
} from '../mcdataResolve';

describe('quoteShellToken', () => {
    it('returns bare token without spaces', () => {
        assert.equal(quoteShellToken('mcdata'), 'mcdata');
    });

    it('wraps tokens with spaces in double quotes', () => {
        assert.equal(quoteShellToken('C:\\Program Files\\mcdata.cmd'), '"C:\\Program Files\\mcdata.cmd"');
    });
});

describe('bundledMcdataScriptPath', () => {
    it('joins extension path to bundled mcdata script', () => {
        const p = bundledMcdataScriptPath('/ext');
        assert.equal(p, path.join('/ext', 'out', 'mcdata.bundled.cjs'));
    });
});

describe('getWorkspaceBinMcdata', () => {
    let tmp: string;
    before(() => {
        tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sfmc-data-ws-'));
        const binDir = path.join(tmp, 'node_modules', '.bin');
        fs.mkdirSync(binDir, { recursive: true });
        fs.writeFileSync(path.join(binDir, 'mcdata'), '#!/bin/sh\necho', { mode: 0o755 });
    });
    after(() => {
        fs.rmSync(tmp, { recursive: true, force: true });
    });

    it('finds unix-style shim', () => {
        const found = getWorkspaceBinMcdata(tmp, { platform: 'linux' });
        assert.equal(found, path.join(tmp, 'node_modules', '.bin', 'mcdata'));
    });
});

describe('buildMcdataShellPrefix', () => {
    it('uses custom path first', () => {
        const r = buildMcdataShellPrefix({
            customPath: 'C:\\Tools\\mcdata.cmd',
            projectRoot: '/proj',
            extensionPath: '/ext',
        });
        assert.ok('prefix' in r);
        if ('prefix' in r) {
            assert.equal(r.prefix, 'C:\\Tools\\mcdata.cmd');
        }
    });

    it('uses workspace bin when present', () => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sfmc-data-bm-'));
        const shim = path.join(tmp, 'node_modules', '.bin', 'mcdata');
        fs.mkdirSync(path.dirname(shim), { recursive: true });
        fs.writeFileSync(shim, '');
        try {
            const r = buildMcdataShellPrefix(
                {
                    customPath: '',
                    projectRoot: tmp,
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
            fs.rmSync(tmp, { recursive: true, force: true });
        }
    });

    it('uses mcdata on PATH when workspace bin missing', () => {
        let probed = false;
        const r = buildMcdataShellPrefix(
            {
                customPath: '',
                projectRoot: '/nonexistent-workspace',
                extensionPath: '/ext',
            },
            {
                platform: 'linux',
                existsSync: () => false,
                execSync: ((() => {
                    probed = true;
                    return '';
                }) as unknown as typeof nodeExecSync),
            }
        );
        assert.ok(probed);
        assert.ok('prefix' in r);
        if ('prefix' in r) {
            assert.equal(r.prefix, 'mcdata');
        }
    });

    it('falls back to bundled node script when PATH has no mcdata', () => {
        const ext = fs.mkdtempSync(path.join(os.tmpdir(), 'sfmc-data-ext-'));
        const script = path.join(ext, 'out', 'mcdata.bundled.cjs');
        fs.mkdirSync(path.dirname(script), { recursive: true });
        fs.writeFileSync(script, '');
        try {
            const r = buildMcdataShellPrefix(
                {
                    customPath: '',
                    projectRoot: '/nonexistent-workspace',
                    extensionPath: ext,
                },
                {
                    platform: 'linux',
                    existsSync: (p: fs.PathLike) => String(p) === script,
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
            fs.rmSync(ext, { recursive: true, force: true });
        }
    });

    it('returns error when bundled script is missing', () => {
        const r = buildMcdataShellPrefix(
            {
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
