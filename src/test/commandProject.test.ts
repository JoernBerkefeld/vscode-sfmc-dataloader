import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import Module from 'node:module';
import path from 'node:path';
import filesystem from 'node:fs';
import type * as vscode from 'vscode';
import { parseExportBasename, reverseFilterIllegalFilenames } from 'sfmc-dataloader';

/**
 * Builds a disk URI for host-free command composition.
 * @param fsPath - Absolute path.
 * @param scheme - Resource scheme.
 * @returns {vscode.Uri} Resource URI.
 */
function resource(fsPath: string, scheme = 'file'): vscode.Uri {
    return { fsPath, scheme, toString: () => `${scheme}:${fsPath}` } as vscode.Uri;
}

const folders = ['first-project', 'second-project'].map((name, index) => ({
    name,
    index,
    uri: resource(path.resolve(name)),
}));
const routes = [
    ['contextExportDE', 'registerContextExportCommand', true],
    ['contextExportFromBUs', 'registerContextExportFromBUsCommand', true],
    ['contextImportDE', 'registerContextImportCommand', true],
    ['contextImportToBU', 'registerContextImportToBUCommand', true],
    ['exportDE', 'registerExportCommand', false],
    ['exportDEMultiBU', 'registerExportMultiBUCommand', false],
    ['importDE', 'registerImportCommand', false],
    ['importDECrossBU', 'registerImportCrossBUCommand', false],
    ['refreshDeCache', 'registerRefreshDeCacheCommand', false],
] as const;
type Route = (typeof routes)[number];

/**
 * Composes real project/settings helpers and command logic with host/network I/O mocked.
 * @param route - Command module and registration.
 * @param scenario - Resource/picker invocation to simulate.
 * @param malformedConfig - Public config filename to populate with invalid, sensitive JSON.
 * @param exportSettings - Folder-scoped export settings overrides.
 * @param selection - Key picker scenario.
 * @param selection.input - Manual key input.
 * @param selection.list - Select the cached list.
 * @param selection.empty - Return an empty cache.
 * @param selection.fail - Fail cache lookup.
 * @param selection.cancel - Dismiss key-source selection.
 * @returns {Promise<object>} Captured project, settings, executions and errors.
 */
async function invoke(
    route: Route,
    scenario: 'explicit' | 'active' | 'cross' | 'virtual' | 'cancel' | 'sole',
    malformedConfig?: '.mcdevrc.json' | '.mcdatarc.json',
    exportSettings: Record<string, unknown> = {},
    selection: {
        input?: string;
        list?: boolean;
        empty?: boolean;
        fail?: boolean;
        cancel?: boolean;
    } = {}
) {
    const [file, registration, isContext] = route;
    const root = folders[1].uri.fsPath;
    const metadata = (folder: string) =>
        resource(
            path.join(
                folder,
                'retrieve',
                'org',
                'bu',
                'dataExtension',
                'Orders.dataExtension-meta.json'
            )
        );
    const runs: { root: string; arguments: string[] }[] = [];
    const errors: string[] = [];
    const settings: string[] = [];
    const reads: string[] = [];
    const fetches: string[] = [];
    const lists: string[] = [];
    const prompts: string[] = [];
    let pickerCalls = 0;
    let command: ((...arguments_: unknown[]) => Promise<void>) | undefined;
    const host = {
        Uri: { file: resource },
        workspace: {
            workspaceFolders: folders,
            getWorkspaceFolder: (uri: vscode.Uri) =>
                folders.find(
                    (folder) =>
                        uri.fsPath === folder.uri.fsPath ||
                        uri.fsPath.startsWith(folder.uri.fsPath + path.sep)
                ),
            getConfiguration: (_section: string, uri: vscode.Uri) => {
                settings.push(uri.fsPath);
                assert.equal(uri.fsPath, root);
                return {
                    get: (key: string) =>
                        ({
                            defaultFormat: 'tsv',
                            useGitFilenames: true,
                            skipEmptyLines: true,
                            promptClearBeforeImport: false,
                            promptImportMode: false,
                            importMode: 'insert',
                            backupBeforeImport: 'never',
                            ...exportSettings,
                        })[key as 'defaultFormat'],
                };
            },
        },
        commands: {
            registerCommand: (_id: string, callback: typeof command) => {
                command = callback;
                return { dispose() {} };
            },
        },
        ProgressLocation: { Notification: 15 },
        window: {
            activeTextEditor: {
                document: { uri: metadata(scenario === 'active' ? root : folders[0].uri.fsPath) },
            },
            showQuickPick: async (
                items: { folder?: unknown; label: string }[],
                options: { canPickMany?: boolean; placeHolder?: string; title?: string }
            ) => {
                prompts.push(options.placeHolder ?? '');
                if (items[0]?.folder) {
                    pickerCalls++;
                    return scenario === 'cancel' ? undefined : items[1];
                }
                if (options.canPickMany)
                    return [options.title?.includes('Target BU') ? items.at(-1) : items[0]];
                if (typeof items[0] === 'string') return items[0];
                if (selection.cancel) return;
                return { source: selection.list ? 'list' : 'manual', method: 'key' };
            },
            showInputBox: async (options: { validateInput: (value: string) => unknown }) => {
                const input = selection.input ?? 'Orders';
                assert.equal(
                    Boolean(options.validateInput(input)),
                    input.split(',').every((key) => !key.trim())
                );
                return input;
            },
            showErrorMessage: (message: string) => {
                errors.push(message);
            },
            showInformationMessage: () => {},
            showWarningMessage: async () => 'Continue',
            withProgress: async (
                _options: unknown,
                task: (progress: { report: () => void }) => Promise<void>
            ) => task({ report() {} }),
        },
    };
    const businessUnits =
        file === 'importDECrossBU' && selection.list ? { bu: 201, target: 202 } : { bu: 201 };
    const config = { credentials: { org: { eid: 200, businessUnits } } };
    const dependencies: Record<string, unknown> = {
        vscode: host,
        '../runMcdata': {
            runMcdataWithProgress: async (
                _context: unknown,
                selectedRoot: string,
                arguments_: string[]
            ) => {
                runs.push({ root: selectedRoot, arguments: arguments_ });
            },
        },
        'sfmc-dataloader': {
            parseExportBasename,
            reverseFilterIllegalFilenames,
            fetchDeList: async (selectedRoot: string) => {
                fetches.push(selectedRoot);
                return [];
            },
        },
        '../deCache': {
            createDeCacheIdentity: (
                selectedRoot: string,
                _config: unknown,
                credential: string,
                bu: string
            ) => {
                assert.equal(selectedRoot, root);
                lists.push(`${credential}/${bu}`);
                return { projectRoot: selectedRoot, credential, bu };
            },
            setDeCacheBu() {},
            getDeCacheForBu: () => {
                if (selection.fail) throw new Error('List unavailable');
                return selection.empty ? [] : [{ name: 'Order records', key: 'Orders' }];
            },
        },
        '../commandTelemetry': { trackCommandOutcome() {} },
        '../telemetry': { getReporter() {} },
    };
    dependencies['./deCache'] = dependencies['../deCache'];
    const loadable = Module as typeof Module & {
        _load(request: string, parent: NodeModule | undefined, isMain: boolean): unknown;
    };
    const original = loadable._load;
    const modules = [
        '../config',
        `../commands/${file}`,
        '../deKeyPicker',
        '../commands/contextUtilities',
        '../commands/refreshDeCache',
        '../importClearPrompts',
        '../importMode',
        '../importBackupPrompt',
    ];
    const paths = modules.map((name) => require.resolve(name));
    for (const modulePath of paths) delete require.cache[modulePath];
    const originalRead = filesystem.readFileSync;
    const publicFilename = malformedConfig ?? '.mcdevrc.json';
    const sentinel = 'SECRET_JSON_SENTINEL_DO_NOT_DISCLOSE';
    const replacements = [
        mock.method(
            filesystem,
            'existsSync',
            (filename: string) =>
                filename === path.join(root, publicFilename) ||
                (scenario !== 'sole' &&
                    filename === path.join(folders[0].uri.fsPath, publicFilename))
        ),
        mock.method(filesystem, 'readFileSync', (filename: string, ...arguments_: unknown[]) => {
            if (!filename.endsWith(publicFilename)) {
                return Reflect.apply(originalRead, filesystem, [filename, ...arguments_]);
            }
            reads.push(filename);
            assert.equal(filename, path.join(root, publicFilename));
            return malformedConfig ? `{"${sentinel}":}` : JSON.stringify(config);
        }),
        mock.method(
            loadable,
            '_load',
            function (request: string, parent: NodeModule | undefined, isMain: boolean) {
                return Object.hasOwn(dependencies, request)
                    ? dependencies[request]
                    : original.call(Module, request, parent, isMain);
            }
        ),
    ];
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- Compose command modules with isolated host I/O.
        const loaded = require(paths[1]);
        loaded[registration]({ subscriptions: [] });
        assert.ok(command);
        if (!isContext || scenario === 'active') await command();
        else if (scenario === 'cross')
            await command(metadata(root), [metadata(folders[0].uri.fsPath)]);
        else if (scenario === 'virtual') await command(resource(root, 'vscode-vfs'));
        else await command(metadata(root), [metadata(root)]);
        return { runs, errors, settings, reads, fetches, pickerCalls, root, lists, prompts };
    } finally {
        for (const replacement of replacements) replacement.mock.restore();
        for (const modulePath of paths) delete require.cache[modulePath];
    }
}

describe('commands composed with real project selection and folder settings', () => {
    for (const route of routes) {
        if (route[2] || route[0] === 'refreshDeCache') continue;
        for (const input of [', ,', '  ', ' ,,, ']) {
            it(`${route[0]} rejects parsed-empty manual keys ${JSON.stringify(input)}`, async () => {
                const result = await invoke(route, 'sole', undefined, {}, { input });
                assert.deepEqual(result.runs, []);
            });
        }
        it(`${route[0]} trims and retains valid manual keys`, async () => {
            const result = await invoke(
                route,
                'sole',
                undefined,
                {},
                { input: ' Orders, , Customers ' }
            );
            assert.equal(result.runs.length, 1);
            assert.ok(result.runs[0].arguments.includes('Orders'));
            assert.ok(result.runs[0].arguments.includes('Customers'));
        });
        if (route[0] === 'exportDEMultiBU') continue;
        it(`${route[0]} reuses searchable cached selection`, async () => {
            const result = await invoke(route, 'sole', undefined, {}, { list: true });
            assert.equal(result.runs.length, 1);
            assert.deepEqual(result.lists, ['org/bu']);
            assert.ok(result.prompts.some((prompt) => /Filter by name or key/.test(prompt)));
            if (route[0] === 'importDE') {
                assert.ok(
                    result.prompts.some((prompt) =>
                        /Target BU.*local exports must exist/.test(prompt)
                    )
                );
            } else if (route[0] === 'importDECrossBU') {
                assert.ok(result.runs[0].arguments.includes('org/target'));
                assert.ok(result.prompts.some((prompt) => /Source BU.*API copy/.test(prompt)));
            }
        });
        for (const selection of [{ empty: true }, { fail: true }]) {
            it(`${route[0]} gives explicit list recovery for ${JSON.stringify(selection)}`, async () => {
                const result = await invoke(
                    route,
                    'sole',
                    undefined,
                    {},
                    { list: true, ...selection }
                );
                assert.deepEqual(result.runs, []);
                assert.match(result.errors[0], /Refresh DE Cache.*enter DE keys manually/);
            });
        }
        it(`${route[0]} stops silently when key-source selection is cancelled`, async () => {
            const result = await invoke(route, 'sole', undefined, {}, { cancel: true });
            assert.deepEqual(result.runs, []);
            assert.deepEqual(result.errors, []);
            assert.deepEqual(result.lists, []);
        });
    }
    for (const route of routes) {
        if (!route[0].toLowerCase().includes('export')) continue;
        for (const format of ['csv', 'tsv', 'json']) {
            it(`${route[0]} applies folder export options for ${format}`, async () => {
                const result = await invoke(route, 'explicit', undefined, {
                    defaultFormat: format,
                    jsonPretty: true,
                    maxRowsPerFile: 42,
                });
                assert.deepEqual(result.errors, []);
                assert.equal(result.runs.length, 1);
                const flags = result.runs[0].arguments;
                assert.equal(flags.includes('--json-pretty'), format === 'json');
                assert.equal(flags[flags.indexOf('--max-rows-per-file') + 1], '42');
            });
        }
        it(`${route[0]} preserves unsplit compact defaults`, async () => {
            const result = await invoke(route, 'explicit', undefined, { defaultFormat: 'json' });
            assert.deepEqual(result.errors, []);
            assert.equal(result.runs.length, 1);
            assert.ok(!result.runs[0].arguments.includes('--json-pretty'));
            assert.ok(!result.runs[0].arguments.includes('--max-rows-per-file'));
        });
        for (const invalid of [0, -1, 1.2, Number.MAX_SAFE_INTEGER + 1, '42']) {
            it(`${route[0]} blocks invalid split size ${invalid} before execution`, async () => {
                const result = await invoke(route, 'explicit', undefined, {
                    maxRowsPerFile: invalid,
                });
                assert.deepEqual(result.runs, []);
                assert.equal(result.errors.length, 1);
                assert.match(result.errors[0], /sfmcData.maxRowsPerFile.*positive safe integer/);
            });
        }
    }
    for (const route of routes) {
        if (route[0] === 'exportDE' || route[0] === 'refreshDeCache') {
            for (const filename of ['.mcdevrc.json', '.mcdatarc.json'] as const) {
                it(`${route[0]} reports filename-only errors for malformed ${filename}`, async () => {
                    const result = await invoke(route, 'sole', filename);
                    assert.deepEqual(result.errors, [
                        `Failed to read project config: Error: Invalid JSON in ${filename}. Fix the file and try again.`,
                    ]);
                    assert.ok(
                        !result.errors.join('\n').includes('SECRET_JSON_SENTINEL_DO_NOT_DISCLOSE')
                    );
                    assert.deepEqual(result.reads, [path.join(result.root, filename)]);
                    assert.deepEqual(result.runs, []);
                    assert.deepEqual(result.fetches, []);
                    assert.deepEqual(result.settings, []);
                });
            }
        }
        const successfulScenarios = route[2]
            ? (['explicit', 'active'] as const)
            : (['explicit', 'sole'] as const);
        for (const scenario of successfulScenarios) {
            it(`${route[0]} preserves the second project on ${scenario}`, async () => {
                const result = await invoke(route, scenario);
                assert.deepEqual(result.errors, []);
                assert.equal(result.pickerCalls, scenario !== 'sole' && !route[2] ? 1 : 0);
                if (route[0] === 'refreshDeCache') {
                    assert.deepEqual(result.fetches, [result.root]);
                } else {
                    assert.equal(result.runs.length, 1);
                    assert.equal(result.runs[0].root, result.root);
                    assert.ok(result.runs[0].arguments.includes('--git'));
                    if (route[0].includes('Export') || route[0].startsWith('export')) {
                        assert.ok(result.runs[0].arguments.includes('tsv'));
                    } else {
                        assert.ok(result.runs[0].arguments.includes('--skip-empty-lines'));
                        assert.ok(result.runs[0].arguments.includes('insert'));
                    }
                    assert.ok(result.settings.length > 0);
                }
            });
        }
        const stoppedScenarios = route[2] ? (['cross', 'virtual'] as const) : (['cancel'] as const);
        for (const scenario of stoppedScenarios) {
            it(`${route[0]} safely stops on ${scenario}`, async () => {
                const result = await invoke(route, scenario);
                assert.deepEqual(result.runs, []);
                assert.deepEqual(result.reads, []);
                assert.deepEqual(result.settings, []);
                assert.deepEqual(result.fetches, []);
                assert.equal(result.errors.length, route[2] ? 1 : 0);
            });
        }
    }
});
