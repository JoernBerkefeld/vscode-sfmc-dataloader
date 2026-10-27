import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import Module from 'node:module';
import { readFileSync } from 'node:fs';
import { captureImportIntent } from '../importClearPrompts';
import path from 'node:path';
import {
    buildImportArguments,
    buildCrossBuImportArguments,
    buildFileToMultiBuImportArguments,
    buildExportArguments,
    buildMultiBuExportArguments,
} from '../argbuilder';

const root = path.resolve(__dirname, '../../..');
const base = { mode: 'upsert', clearBeforeImport: false, acceptClearRisk: false };

describe('skipEmptyLines argument builders', () => {
    for (const skipEmptyLines of [undefined, false, true]) {
        it(`emits the import flag only for true (${String(skipEmptyLines)})`, () => {
            const options = { ...base, skipEmptyLines };
            const results = [
                buildImportArguments('org/bu', { ...options, deKeys: ['key'] }),
                buildImportArguments('org/bu', { ...options, filePaths: ['file.csv'] }),
                buildCrossBuImportArguments({
                    ...options,
                    fromCredBu: 'org/source',
                    toCredBus: ['org/target'],
                    deKeys: ['key'],
                }),
                buildFileToMultiBuImportArguments({
                    ...options,
                    toCredBus: ['org/target'],
                    filePaths: ['file.tsv'],
                }),
            ];
            for (const result of results) {
                assert.equal(result.includes('--skip-empty-lines'), skipEmptyLines === true);
            }
        });
    }
    it('does not add the flag to either export builder', () => {
        assert.equal(
            buildExportArguments('org/bu', ['key'], 'csv').includes('--skip-empty-lines'),
            false
        );
        assert.equal(
            buildMultiBuExportArguments({
                fromCredBus: ['org/bu'],
                deKeys: ['key'],
                format: 'csv',
            }).includes('--skip-empty-lines'),
            false
        );
    });
    it('contributes a boolean setting disabled by default', () => {
        const manifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
        const setting = manifest.contributes.configuration.properties['sfmcData.skipEmptyLines'];
        assert.equal(setting.type, 'boolean');
        assert.equal(setting.default, false);
    });
});

// Load each command with isolated host/config dependencies, retaining real argument builders.
describe('skipEmptyLines import command routes', () => {
    const routes = [
        ['importDE', 'registerImportCommand', 'key'],
        ['importDE', 'registerImportCommand', 'file'],
        ['importDECrossBU', 'registerImportCrossBUCommand', 'metadata'],
        ['contextImportDE', 'registerContextImportCommand', 'data'],
        ['contextImportDE', 'registerContextImportCommand', 'metadata'],
        ['contextImportToBU', 'registerContextImportToBUCommand', 'data'],
        ['contextImportToBU', 'registerContextImportToBUCommand', 'metadata'],
    ];
    for (const [file, registration, route] of routes) {
        for (const enabled of [undefined, false, true]) {
            it(`${file}/${route} forwards ${String(enabled)}`, async () => {
                const loadable = Module as typeof Module & {
                    _load(
                        request: string,
                        parent: NodeModule | undefined,
                        isMain: boolean
                    ): unknown;
                };
                const original = loadable._load;
                let command: ((...arguments_: unknown[]) => Promise<void>) | undefined;
                let actual: string[] | undefined;
                const host = {
                    workspace: {
                        workspaceFolders: [],
                        getConfiguration: () => ({
                            get: (key: string) => (key === 'skipEmptyLines' ? enabled : undefined),
                        }),
                    },
                    commands: {
                        registerCommand: (
                            _id: string,
                            callback: (...arguments_: unknown[]) => Promise<void>
                        ) => {
                            command = callback;
                            return { dispose() {} };
                        },
                    },
                    window: {
                        showQuickPick: async (
                            _items: unknown,
                            options: { canPickMany?: boolean }
                        ) =>
                            options.canPickMany
                                ? [{ label: 'bu' }]
                                : { method: route, source: 'manual' },
                        showInputBox: async () => 'key',
                        showOpenDialog: async () => [{ fsPath: 'file.csv' }],
                        showErrorMessage: (message: string) => assert.fail(message),
                    },
                };
                const dependencies: Record<string, unknown> = {
                    vscode: host,
                    '../config': {
                        selectProjectRoot: async () => root,
                        getProjectConfiguration: host.workspace.getConfiguration,
                        readProjectConfig: () => ({}),
                    },
                    '../mcdevrcParser': {
                        getCredentials: () => ['org'],
                        getBusinessUnits: () => ['bu'],
                        getAllCredBus: () => ['org/bu'],
                    },
                    '../runMcdata': {
                        runMcdataWithProgress: async (
                            _context: unknown,
                            _root: string,
                            arguments_: string[]
                        ) => {
                            actual = arguments_;
                        },
                    },
                    '../importMode': { resolveImportWriteMode: async () => 'upsert' },
                    '../importBackupPrompt': { resolveBackupBeforeImport: async () => false },
                    '../importClearPrompts': {
                        captureImportIntent,
                        promptOptionalClearBeforeImport: async () => base,
                    },
                    './contextUtilities': {
                        resolveContextFiles: () => ({
                            parsed: [{ type: route, filePath: 'file.csv', deKey: 'key' }],
                            credBu: 'org/bu',
                        }),
                    },
                };
                dependencies['./config'] = dependencies['../config'];
                const pickerPath = require.resolve('../deKeyPicker');
                delete require.cache[pickerPath];
                const replacement = mock.method(
                    loadable,
                    '_load',
                    function (request: string, parent: NodeModule | undefined, isMain: boolean) {
                        return Object.hasOwn(dependencies, request)
                            ? dependencies[request]
                            : original.call(Module, request, parent, isMain);
                    }
                );
                const modulePath = require.resolve(`../commands/${file}`);
                delete require.cache[modulePath];
                try {
                    // eslint-disable-next-line @typescript-eslint/no-require-imports -- Reload each CJS command under the isolated dependency mocks.
                    const loaded = require(modulePath);
                    loaded[registration]({ subscriptions: [] });
                    assert.ok(command, 'command registered');
                    await command();
                    assert.ok(actual, 'command executed');
                    assert.equal(actual.includes('--skip-empty-lines'), enabled === true);
                } finally {
                    replacement.mock.restore();
                    delete require.cache[modulePath];
                    delete require.cache[pickerPath];
                }
            });
        }
    }
});
