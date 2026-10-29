/** Verifies packaged CLI relocation and bundled library paths without contacting Salesforce. */
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
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
writeFileSync(path.join(temporary, 'ownership.json'), JSON.stringify({ marker: randomUUID(), retained: true }));
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
assert.equal(manifest.devDependencies['sfmc-dataloader'], '^4.0.0');
assert.equal(manifest.engines.vscode, '^1.101.0');
assert.equal(
    manifest.contributes.configuration.properties['sfmcData.skipEmptyLines'].type,
    'boolean'
);
assert.equal(
    manifest.contributes.configuration.properties['sfmcData.skipEmptyLines'].default,
    true
);
assert.equal(
    execFileSync(process.execPath, [cli, '--version'], { cwd: temporary, encoding: 'utf8' }).trim(),
    '4.0.0'
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
// Run the extracted fallback itself with only the SDK construction replaced in memory.
// No loader/parser rebuild or invalid-config shortcut qualifies these real import checks.
const importCheck = path.join(temporary, 'import-check.cjs');
writeFileSync(
    importCheck,
    `const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const net = require('node:net');
net.Socket.prototype.connect = () => { throw Error('Network forbidden in VSIX verification'); };
globalThis.fetch = () => { throw Error('Network forbidden in VSIX verification'); };
const effects = [];
globalThis.__vsixMockSdk = {
 rest: {
  get: async route => { effects.push({ type: 'get', route }); return route.endsWith('/status') ? {status:{requestStatus:'Complete'}} : {count:10}; },
  put: async (route, body) => { effects.push({type:'upload',route,body}); return {requestId:'synthetic'}; },
  post: async () => { throw Error('Unexpected POST'); },
  getBulkPages: async function* () { effects.push({type:'backup'}); yield {pageItems:[]}; }
 },
 soap: {perform: async () => { effects.push({type:'clear'}); }}
};
const project = process.argv[2];
const cli = process.argv[3];
const mode = process.argv[4];
const expected = [{id:'1',value:'first'},{id:'2',value:'last'}];
const file = path.join(project, 'Customer.List.csv');
fs.writeFileSync(path.join(project,'.mcdatarc.json'),JSON.stringify({credentials:{C:{businessUnits:{B:123}}}}));
fs.writeFileSync(path.join(project,'.mcdata-auth.json'),JSON.stringify({C:{client_id:'synthetic',client_secret:'synthetic',auth_url:'https://example.invalid/'}}));
fs.writeFileSync(file,'id,value,,\\n1,first,,\\n,,,\\n2,last,,\\n,,,\\n');
const args = ['import','C/B','--project',project,'--file',file];
if (mode === 'optout') args.push('--no-skip-empty-lines');
if (mode === 'invalid') {
 const late = path.join(project,'Z.csv');
 fs.writeFileSync(late,'id,value,,\\n3,third,hidden,\\n');
 args.push('--file',late,'--backup-before-import','--clear-before-import','--i-accept-clear-data-risk');
}
const originalExit = process.exit;
process.exit = code => {
 try {
  assert.equal(code,mode === 'invalid' ? 1 : 0);
  if(mode === 'invalid') assert.deepEqual(effects,[]);
  else {
   const uploads = effects.filter(e=>e.type==='upload');
   assert.deepEqual(uploads.flatMap(e=>e.body.items),mode === 'optout' ? [expected[0],{id:'',value:''},expected[1]] : expected);
   assert.ok(uploads.every(e=>e.route.includes('Customer.List')));
   assert.ok(effects.some(e=>e.type==='get' && e.route.endsWith('/status')));
  }
  console.log('Extracted fallback actual import passed: '+mode);
  originalExit(0);
 } catch(error) { console.error(error); originalExit(1); }
};
const source = fs.readFileSync(cli,'utf8');
const seam = /this\\.auth=new [\\w$]+\\([^)]*\\),this\\.rest=new [\\w$]+\\([^)]*\\),this\\.soap=new [\\w$]+\\([^)]*\\)/g;
assert.equal([...source.matchAll(seam)].length,1,'Exactly one SDK construction seam required');
const executable = new Module(cli,module);
executable.filename=cli;
executable.paths=Module._nodeModulePaths(path.dirname(cli));
process.argv=[process.execPath,cli,...args];
executable._compile(source.replace(seam,'Object.assign(this,globalThis.__vsixMockSdk)'),cli);
`
);
for (const mode of ['default', 'optout', 'invalid']) {
    const project = path.join(temporary, `actual-import-${mode}`);
    mkdirSync(project);
    const result = spawnSync(process.execPath, [importCheck, project, cli, mode], {
        cwd: temporary,
        encoding: 'utf8',
        timeout: 30_000,
    });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /Extracted fallback actual import passed/);
    if (mode !== 'invalid') assert.match(result.stdout, /cleanup|removed|padding/i);
    console.log(result.stdout.trim());
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
