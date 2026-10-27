import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import Module from 'node:module';
import path from 'node:path';
import { captureImportIntent } from '../importClearPrompts';

const root = path.resolve(__dirname, '../../..');
const metadata = path.join(
    root,
    'retrieve',
    'org',
    'bu',
    'dataExtension',
    'Orders.v2%2FItem_STAR_.dataExtension-meta.json'
);
const data = path.join(root, 'data', 'org', 'bu', 'Orders.v2%2FItem_STAR_.mcdata.csv');
const routes = [
    ['importDE', 'registerImportCommand', 'key'],
    ['importDE', 'registerImportCommand', 'file'],
    ['importDECrossBU', 'registerImportCrossBUCommand', 'key'],
    ['contextImportDE', 'registerContextImportCommand', 'metadata'],
    ['contextImportDE', 'registerContextImportCommand', 'data'],
    ['contextImportToBU', 'registerContextImportToBUCommand', 'metadata'],
    ['contextImportToBU', 'registerContextImportToBUCommand', 'data'],
] as const;
type Route = (typeof routes)[number];
type Decision =
    | 'dismiss'
    | 'no'
    | 'cancel'
    | 'modal-dismiss'
    | 'typed-dismiss'
    | 'typed-wrong'
    | 'mode-dismiss'
    | 'backup-dismiss'
    | 'confirm'
    | 'disabled';

/**
 * Compose registered commands with the real clear prompt, context resolver,
 * filename parser and argument builders, replacing only host/project/run I/O.
 * @param route Command registration and import branch.
 * @param decision User response at the clear prompt.
 * @param selected Optional explicit Explorer selection.
 * @param size Synthetic file size in bytes.
 * @param shouldCancelLarge Whether to dismiss the large-file warning.
 * @returns {Promise<{ runs: string[][]; errors: string[]; clearPrompts: number }>} Captured execution arguments, errors and prompt count.
 */
async function invoke(
    route: Route,
    decision: Decision,
    selected?: string[],
    size = 0,
    shouldCancelLarge = false
) {
    const [file, registration, branch] = route;
    const loadable = Module as typeof Module & {
        _load(request: string, parent: NodeModule | undefined, isMain: boolean): unknown;
    };
    const original = loadable._load;
    let command: ((...arguments_: unknown[]) => Promise<void>) | undefined;
    const runs: string[][] = [];
    const errors: string[] = [];
    let clearPrompts = 0;
    const details: string[] = [];
    let largeWarnings = 0;
    const host = {
        workspace: {
            workspaceFolders: [],
            getConfiguration: () => ({
                get: (key: string) => key === 'promptClearBeforeImport' && decision !== 'disabled',
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
                options: { title?: string; canPickMany?: boolean }
            ) => {
                if (options.title === 'Clear target Data Extension rows first?') {
                    clearPrompts++;
                    return decision === 'dismiss' ? undefined : { clear: decision !== 'no' };
                }
                return options.canPickMany
                    ? [{ label: file === 'contextImportToBU' ? 'org/bu' : 'bu' }]
                    : { method: branch, source: 'manual' };
            },
            showWarningMessage: async (message: string, options: { detail: string }) => {
                details.push(options.detail);
                if (message.includes('1 GiB')) {
                    largeWarnings++;
                    return shouldCancelLarge ? undefined : 'Continue';
                }
                if (decision === 'modal-dismiss') return;
                return decision === 'cancel' ? 'Cancel' : 'Continue';
            },
            showInputBox: async (options: { title?: string }) =>
                options.title === 'Acknowledge target row deletion'
                    ? decision === 'typed-dismiss'
                        ? undefined
                        : decision === 'typed-wrong'
                          ? 'clear'
                          : 'CLEAR'
                    : 'Orders.v2/Item*',
            showOpenDialog: async () => [{ fsPath: data }],
            showErrorMessage: (message: string) => {
                errors.push(message);
            },
        },
    };
    const dependencies: Record<string, unknown> = {
        vscode: host,
        'node:fs': { statSync: () => ({ size }) },
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
                runs.push(arguments_);
            },
        },
        '../importMode': {
            resolveImportWriteMode: async () =>
                decision === 'mode-dismiss' ? undefined : 'upsert',
        },
        '../importBackupPrompt': {
            resolveBackupBeforeImport: async () =>
                decision === 'backup-dismiss' ? undefined : false,
        },
    };
    dependencies['./config'] = dependencies['../config'];
    const modules = [
        require.resolve('../deKeyPicker'),
        require.resolve(`../commands/${file}`),
        require.resolve('../commands/contextUtilities'),
        require.resolve('../importClearPrompts'),
    ];
    for (const modulePath of modules) delete require.cache[modulePath];
    const replacement = mock.method(
        loadable,
        '_load',
        function (request: string, parent: NodeModule | undefined, isMain: boolean) {
            return Object.hasOwn(dependencies, request)
                ? dependencies[request]
                : original.call(Module, request, parent, isMain);
        }
    );
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- Load commands and real helpers under isolated host I/O mocks.
        const loaded = require(modules[1]);
        loaded[registration]({ subscriptions: [] });
        assert.ok(command, 'command registered');
        const uris = (selected ?? [branch === 'data' ? data : metadata]).map((fsPath) => ({
            fsPath,
        }));
        await command(uris[0], uris);
        return { runs, errors, clearPrompts, details, largeWarnings };
    } finally {
        replacement.mock.restore();
        for (const modulePath of modules) delete require.cache[modulePath];
    }
}

describe('real clear prompt composed with every import route', () => {
    for (const route of routes) {
        for (const decision of [
            'dismiss',
            'cancel',
            'modal-dismiss',
            'typed-dismiss',
            'typed-wrong',
        ] as const) {
            it(`${route[0]}/${route[2]} aborts on ${decision}`, async () => {
                const result = await invoke(route, decision);
                assert.deepEqual(result.runs, []);
                assert.deepEqual(result.errors, []);
                assert.equal(result.clearPrompts, 1);
            });
        }
        for (const decision of ['no', 'confirm', 'disabled'] as const) {
            it(`${route[0]}/${route[2]} imports on ${decision} with exact intent`, async () => {
                const result = await invoke(route, decision);
                assert.deepEqual(result.errors, []);
                assert.equal(result.runs.length, 1);
                const arguments_ = result.runs[0];
                assert.equal(arguments_.includes('--clear-before-import'), decision === 'confirm');
                assert.equal(
                    arguments_.includes('--i-accept-clear-data-risk'),
                    decision === 'confirm'
                );
                assert.equal(result.clearPrompts, decision === 'disabled' ? 0 : 1);
                const isFileInput = route[2] === 'file' || route[2] === 'data';
                assert.ok(arguments_.includes(isFileInput ? data : 'Orders.v2/Item*'));
                assert.equal(arguments_.includes('--file'), isFileInput);
            });
        }
    }
});

describe('submitted import safety', () => {
    it('copies and freezes submitted argv before confirmation', () => {
        const arguments_ = ['import', 'org/bu', '--de', 'original'];
        const intent = captureImportIntent(root, arguments_);
        arguments_[3] = 'changed';
        assert.equal(intent.arguments[3], 'original');
        assert.ok(Object.isFrozen(intent));
        assert.ok(Object.isFrozen(intent.arguments));
    });
    for (const route of routes) {
        for (const decision of ['mode-dismiss', 'backup-dismiss'] as const) {
            it(`${route[0]}/${route[2]} aborts on ${decision}`, async () => {
                const result = await invoke(route, decision);
                assert.equal(result.runs.length, 0);
                assert.equal(result.details.length, 0);
            });
        }
        it(`${route[0]}/${route[2]} shows submitted project, targets and input`, async () => {
            const result = await invoke(route, 'no');
            assert.match(result.details[0], /Project 1:/);
            assert.ok(result.details[0].includes(root));
            assert.match(result.details[0], /Target BU\(s\) 1: org\/bu/);
            assert.match(result.details[0], /Orders/);
            if (route[2] === 'file' || route[2] === 'data') {
                assert.match(result.details[0], /derives each target DE key from its filename/);
            }
        });
        it(`${route[0]}/${route[2]} continues after accepting a large-file warning`, async () => {
            const result = await invoke(route, 'no', undefined, 1024 ** 3);
            assert.equal(result.runs.length, 1);
        });
        for (const size of [1024 ** 3 - 1, 1024 ** 3]) {
            it(`${route[0]}/${route[2]} applies per-file threshold ${size}`, async () => {
                const result = await invoke(route, 'no', undefined, size, true);
                const isWarn = (route[2] === 'file' || route[2] === 'data') && size >= 1024 ** 3;
                assert.equal(result.largeWarnings, isWarn ? 1 : 0);
                assert.equal(result.runs.length, isWarn ? 0 : 1);
            });
        }
    }
});

describe('real context selection validation composed with import commands', () => {
    const contextRoutes = routes.filter(([file]) => file.startsWith('context'));
    const unsupported = path.join(root, 'retrieve', 'org', 'bu', 'dataExtension', 'Orders.json');
    const malformed = metadata.replace('Orders.v2%2FItem_STAR_', 'Bad%ZZ');
    const otherBu = metadata.replace(
        `${path.sep}bu${path.sep}`,
        () => `${path.sep}other${path.sep}`
    );
    for (const route of contextRoutes) {
        for (const selected of [
            [metadata, data],
            [data, metadata],
            [metadata, unsupported],
            [unsupported, metadata],
            [data, malformed],
            [metadata, otherBu],
        ]) {
            it(`${route[0]} rejects the complete invalid selection ${selected.join(', ')}`, async () => {
                const result = await invoke(route, 'no', selected);
                assert.deepEqual(result.runs, []);
                assert.equal(result.errors.length, 1);
                assert.equal(result.clearPrompts, 0);
            });
        }
        it(`${route[0]}/${route[2]} retains homogeneous multi-select`, async () => {
            const first = route[2] === 'data' ? data : metadata;
            const second = first.replace('Orders.v2%2FItem_STAR_', 'Another.v3');
            const result = await invoke(route, 'no', [first, second]);
            assert.deepEqual(result.errors, []);
            assert.equal(result.runs.length, 1);
            const arguments_ = result.runs[0];
            assert.ok(arguments_.includes(route[2] === 'data' ? first : 'Orders.v2/Item*'));
            assert.ok(arguments_.includes(route[2] === 'data' ? second : 'Another.v3'));
        });
    }
});
