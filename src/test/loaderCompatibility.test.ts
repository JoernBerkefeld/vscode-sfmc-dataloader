import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { it } from 'node:test';
import { buildSync } from 'esbuild';

// Opt in with an isolated npm install of a packed, upcoming loader. Never replace the repo dependency.
const fixtureRoot = process.env.SFMC_DATALOADER_COMPAT_FIXTURE;

it(
    'packed upcoming loader preserves DE-cache failures and bundled CLI config safety',
    {
        skip:
            !fixtureRoot &&
            'Set SFMC_DATALOADER_COMPAT_FIXTURE to an isolated packed-loader install',
    },
    async () => {
        const expectedTemporary = path.resolve('F:/Temp').toLowerCase();
        if (process.platform === 'win32') {
            for (const value of [
                process.env.TEMP,
                os.tmpdir(),
                process.env.TMP,
                process.env.TMPDIR,
            ]) {
                if (!value) {
                    continue;
                }

                assert.ok(path.isAbsolute(value));
                assert.equal(
                    path
                        .resolve(value)
                        .replace(/[\\/]+$/u, '')
                        .toLowerCase(),
                    expectedTemporary
                );
            }
            assert.ok(process.env.TEMP);
        }
        assert.ok(fixtureRoot && path.isAbsolute(fixtureRoot));
        const loaderRoot = path.join(fixtureRoot, 'node_modules', 'sfmc-dataloader');
        const manifest = JSON.parse(readFileSync(path.join(loaderRoot, 'package.json'), 'utf8'));
        assert.equal(manifest.name, 'sfmc-dataloader');
        assert.equal(manifest.main, './lib/index.mjs');
        assert.ok(
            readFileSync(path.join(loaderRoot, 'lib', 'index.mjs'), 'utf8').includes(
                'loadPublicProjectConfig'
            ),
            'Fixture must contain the upcoming public-config API, not the published baseline'
        );
        const extensionRoot = path.resolve(__dirname, '../../..');
        const runRoot = mkdtempSync(path.join(os.tmpdir(), 'vscode-loader-compat-'));
        // Retain run evidence; no recursive cleanup of fixtures or installed dependencies.
        writeFileSync(
            path.join(runRoot, 'evidence.json'),
            JSON.stringify({ loaderRoot, version: manifest.version })
        );
        const helper = path.join(runRoot, 'de-cache.cjs');
        buildSync({
            entryPoints: [path.join(extensionRoot, 'src', 'commands', 'refreshDeCache.ts')],
            bundle: true,
            platform: 'node',
            format: 'cjs',
            outfile: helper,
            external: ['vscode'],
            alias: { 'sfmc-dataloader': path.join(loaderRoot, 'lib', 'index.mjs') },
            define: { 'import.meta.url': '""' },
            logLevel: 'silent',
        });
        const checkCache = path.join(runRoot, 'check-cache.cjs');
        writeFileSync(
            checkCache,
            `const assert = require('node:assert/strict');
const { fetchAndStoreDeCache } = require(${JSON.stringify(helper)});
(async () => {
    await assert.rejects(fetchAndStoreDeCache({ projectRoot: process.argv[2], credential: 'org', bu: 'bu' }),
        error => { assert.equal(error.message, process.argv[3]); return true; });
})().catch(error => { console.error(error); process.exitCode = 1; });
`
        );
        // Execute the unchanged production bundler in an isolated build root, resolving only its build tool here.
        const scripts = path.join(fixtureRoot, 'scripts');
        mkdirSync(scripts, { recursive: true });
        const bundler = readFileSync(
            path.join(extensionRoot, 'scripts', 'bundle-mcdata.mjs'),
            'utf8'
        ).replace(
            "from 'esbuild'",
            () => `from '${pathToFileURL(require.resolve('esbuild')).href}'`
        );
        const bundlerPath = path.join(scripts, 'bundle-mcdata.mjs');
        writeFileSync(bundlerPath, bundler);
        const build = spawnSync(process.execPath, [bundlerPath], {
            encoding: 'utf8',
            timeout: 60_000,
        });
        assert.equal(build.status, 0, build.stderr);
        const cli = path.join(fixtureRoot, 'out', 'mcdata.bundled.cjs');
        const version = spawnSync(process.execPath, [cli, '--version'], {
            encoding: 'utf8',
            timeout: 30_000,
        });
        assert.equal(version.status, 0, version.stderr);
        assert.ok(version.stdout.includes(manifest.version));
        for (const prefix of ['mcdev', 'mcdata']) {
            for (const malformed of ['public', 'auth']) {
                const project = path.join(runRoot, `${prefix}-${malformed}`);
                mkdirSync(project);
                const publicName = prefix === 'mcdev' ? '.mcdevrc.json' : '.mcdatarc.json';
                const authName = `.${prefix}-auth.json`;
                const sentinel = 'SECRET_JSON_SENTINEL_DO_NOT_DISCLOSE';
                writeFileSync(
                    path.join(project, publicName),
                    malformed === 'public'
                        ? `{"${sentinel}":}`
                        : JSON.stringify({
                              credentials: { org: { eid: 100, businessUnits: { bu: 101 } } },
                          })
                );
                writeFileSync(
                    path.join(project, authName),
                    malformed === 'auth' ? `{"${sentinel}":}` : '{}'
                );
                const message = `Invalid JSON in ${malformed === 'public' ? publicName : authName}. Fix the file and try again.`;
                const cache = spawnSync(
                    process.execPath,
                    [
                        '--require',
                        path.join(extensionRoot, 'out', 'test', 'test', 'registerVscodeMock.js'),
                        checkCache,
                        project,
                        message,
                    ],
                    { encoding: 'utf8', timeout: 30_000 }
                );
                assert.equal(cache.status, 0, cache.stderr);
                for (const arguments_ of [
                    ['export', 'org/bu', '--de', 'fixture'],
                    ['import', 'org/bu', '--de', 'fixture', '--no-backup-before-import'],
                ]) {
                    const result = spawnSync(process.execPath, [cli, ...arguments_], {
                        cwd: project,
                        encoding: 'utf8',
                        timeout: 30_000,
                    });
                    assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
                    assert.ok(`${result.stdout}\n${result.stderr}`.includes(message));
                    assert.ok(!`${result.stdout}\n${result.stderr}`.includes(sentinel));
                }
            }
        }
    }
);
