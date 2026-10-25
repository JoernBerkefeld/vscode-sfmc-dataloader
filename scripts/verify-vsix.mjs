/** Verifies packaged CLI relocation and bundled library paths without contacting Salesforce. */
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const require = createRequire(import.meta.url);
const yauzl = require('yauzl');
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
if (process.platform === 'win32') {
    for (const [name, value] of Object.entries({
        TEMP: process.env.TEMP,
        TMP: process.env.TMP,
        TMPDIR: process.env.TMPDIR,
        node: os.tmpdir(),
    })) {
        if (!value && name !== 'TEMP') continue;
        assert.ok(value && path.isAbsolute(value), `${name} must be absolute`);
        assert.equal(
            path
                .resolve(value)
                .replace(/[\\/]+$/u, '')
                .toLowerCase(),
            'f:\\temp'
        );
    }
}
const temporary = mkdtempSync(path.join(os.tmpdir(), 'sfmc-data-vsix-'));
const archive = path.resolve(process.argv[2] ?? path.join(root, 'sfmc-data-BETA.vsix'));
// Fixtures are retained for diagnosis; no recursive cleanup is performed.
await new Promise((resolve, reject) => {
    yauzl.open(archive, { lazyEntries: true }, (error, zip) => {
        if (error) {
            reject(error);
            return;
        }
        zip.on('error', reject);
        zip.on('end', resolve);
        zip.on('entry', (entry) => {
            if (
                ![
                    'extension/out/extension.js',
                    'extension/out/mcdata.bundled.cjs',
                    'extension/package.json',
                ].includes(entry.fileName)
            ) {
                zip.readEntry();
                return;
            }
            zip.openReadStream(entry, (streamError, stream) => {
                if (streamError) {
                    reject(streamError);
                    return;
                }
                const chunks = [];
                stream.on('error', reject);
                stream.on('data', (chunk) => chunks.push(chunk));
                stream.on('end', () => {
                    const destination = path.join(temporary, entry.fileName);
                    mkdirSync(path.dirname(destination), { recursive: true });
                    writeFileSync(destination, Buffer.concat(chunks));
                    zip.readEntry();
                });
            });
        });
        zip.readEntry();
    });
});
const cli = path.join(temporary, 'extension/out/mcdata.bundled.cjs');
const manifest = JSON.parse(readFileSync(path.join(temporary, 'extension/package.json'), 'utf8'));
const sourceManifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.equal(manifest.version, sourceManifest.version);
assert.equal(manifest.devDependencies['sfmc-dataloader'], '^3.2.0');
assert.equal(manifest.engines.vscode, '^1.101.0');
assert.equal(
    manifest.contributes.configuration.properties['sfmcData.skipEmptyLines'].type,
    'boolean'
);
assert.equal(
    manifest.contributes.configuration.properties['sfmcData.skipEmptyLines'].default,
    false
);
assert.equal(
    execFileSync(process.execPath, [cli, '--version'], { cwd: temporary, encoding: 'utf8' }).trim(),
    '3.2.0'
);
assert.match(
    execFileSync(process.execPath, [cli, '--help'], { cwd: temporary, encoding: 'utf8' }),
    /export/
);
assert.match(
    execFileSync(process.execPath, [cli, 'import', '--help'], { cwd: temporary, encoding: 'utf8' }),
    /--skip-empty-lines/
);
for (const directory of [temporary, path.join(temporary, 'nested project')]) {
    mkdirSync(directory, { recursive: true });
    const result = spawnSync(process.execPath, [cli, 'export', 'missing/bu', '--de', 'fixture'], {
        cwd: directory,
        encoding: 'utf8',
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /config|\.mcdevrc|\.mcdatarc/i);
    assert.doesNotMatch(result.stderr, /MODULE_NOT_FOUND|ENOENT.*node_modules|constraints\.json/);
}
// Verify the extracted production CLI, not a newly built surrogate, masks malformed config.
for (const family of ['mcdev', 'mcdata']) {
    for (const malformed of ['public', 'auth']) {
        const project = path.join(temporary, `${family}-${malformed}`);
        mkdirSync(project);
        const publicName = family === 'mcdev' ? '.mcdevrc.json' : '.mcdatarc.json';
        const authName = `.${family}-auth.json`;
        const sentinel = 'SECRET_JSON_SENTINEL_DO_NOT_DISCLOSE';
        writeFileSync(
            path.join(project, publicName),
            malformed === 'public'
                ? `{"${sentinel}":}`
                : JSON.stringify({ credentials: { org: { eid: 100, businessUnits: { bu: 101 } } } })
        );
        writeFileSync(
            path.join(project, authName),
            malformed === 'auth' ? `{"${sentinel}":}` : '{}'
        );
        for (const args of [
            ['export', 'org/bu', '--de', 'fixture'],
            ['import', 'org/bu', '--de', 'fixture', '--no-backup-before-import'],
        ]) {
            const result = spawnSync(process.execPath, [cli, ...args], {
                cwd: project,
                encoding: 'utf8',
                timeout: 30_000,
            });
            assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
            assert.ok(
                `${result.stdout}\n${result.stderr}`.includes(
                    `Invalid JSON in ${malformed === 'public' ? publicName : authName}. Fix the file and try again.`
                )
            );
            assert.ok(!`${result.stdout}\n${result.stderr}`.includes(sentinel));
        }
    }
}
// Exercise the same loader/SDK graph used by in-process cache refresh in a relocated CJS bundle.
const probe = path.join(temporary, 'library.cjs');
await esbuild.build({
    stdin: {
        contents:
            "export { fetchDeList } from 'sfmc-dataloader'; export { default as SDK } from 'sfmc-sdk';",
        resolveDir: root,
        loader: 'js',
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile: probe,
});
const check = path.join(temporary, 'host-check.cjs');
writeFileSync(
    check,
    `const assert = require('node:assert/strict');
const { SDK, fetchDeList } = require('./library.cjs');
const sdk = new SDK({client_id:'fixture', client_secret:'fixture', account_id:123, auth_url:'https://mcabcdefghijklmnopqrstuvwxyz.auth.marketingcloudapis.com/', scope:['data_extensions_read','future_sfmc_scope_read']});
assert.ok(sdk.auth);
fetchDeList(__dirname, 'missing', 'bu').then(() => { throw new Error('unexpected success'); }, error => {
    assert.match(error.message, /config|\\.mcdevrc|\\.mcdatarc/i);
    console.log('SDK construction, future scopes, and fetchDeList config path passed on ' + process.version);
});
`
);
console.log(execFileSync(process.execPath, [check], { cwd: temporary, encoding: 'utf8' }).trim());
if (process.env.SFMC_TEST_HOST_NODE) {
    console.log(
        execFileSync(process.env.SFMC_TEST_HOST_NODE, [check], {
            cwd: temporary,
            encoding: 'utf8',
        }).trim()
    );
    execFileSync(
        process.env.SFMC_TEST_HOST_NODE,
        [
            '--require',
            path.join(root, 'out/test/test/registerVscodeMock.js'),
            '-e',
            `require(${JSON.stringify(path.join(temporary, 'extension/out/extension.js'))})`,
        ],
        { cwd: temporary }
    );
}
console.log(
    `Relocated VSIX version/help/root+nested config and library smokes passed. Retained fixture: ${temporary}`
);
