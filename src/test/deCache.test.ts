import assert from 'node:assert/strict';
import { describe, it, beforeEach, mock } from 'node:test';
import Module from 'node:module';
import path from 'node:path';
import {
    clearDeCache,
    createDeCacheIdentity,
    getDeCacheForBu,
    hasDeCacheForBu,
    setDeCacheBu,
    type DeCacheIdentity,
} from '../deCache';

const project = path.resolve('project-a');
const config = { credentials: { org: { eid: 100, businessUnits: { bu: 101 } } } };
const identity = (): DeCacheIdentity => createDeCacheIdentity(project, config, 'org', 'bu');
const items = [{ name: 'A', key: 'k_a' }];

describe('deCache', () => {
    beforeEach(() => {
        clearDeCache();
    });

    it('stores and reads items for one explicit project/account/BU identity', () => {
        assert.equal(hasDeCacheForBu(identity()), false);
        setDeCacheBu(identity(), items);
        assert.equal(hasDeCacheForBu(identity()), true);
        assert.deepEqual(getDeCacheForBu(identity()), items);
    });

    it('isolates identical credential/BU labels in different projects', () => {
        setDeCacheBu(identity(), items);
        const other = { ...identity(), projectRoot: path.resolve('project-b') };
        assert.equal(getDeCacheForBu(other), undefined);
        setDeCacheBu(other, []);
        assert.deepEqual(getDeCacheForBu(identity()), items);
        assert.deepEqual(getDeCacheForBu(other), []);
    });

    it('normalizes project path segments and trailing separators', () => {
        setDeCacheBu(identity(), items);
        assert.deepEqual(
            getDeCacheForBu({ ...identity(), projectRoot: `${project}${path.sep}.${path.sep}` }),
            items
        );
    });

    it('normalizes Windows project path casing without folding credential or BU labels', () => {
        setDeCacheBu(identity(), items);
        if (process.platform === 'win32') {
            assert.deepEqual(
                getDeCacheForBu({ ...identity(), projectRoot: project.toUpperCase() }),
                items
            );
        }
        assert.equal(getDeCacheForBu({ ...identity(), credential: 'ORG' }), undefined);
        assert.equal(getDeCacheForBu({ ...identity(), bu: 'BU' }), undefined);
    });

    it('does not reuse lists for different public account IDs or MIDs', () => {
        setDeCacheBu(identity(), items);
        assert.equal(getDeCacheForBu({ ...identity(), accountId: 200 }), undefined);
        assert.equal(getDeCacheForBu({ ...identity(), mid: 201 }), undefined);
    });

    it('captures a snapshot and invalidates lookup when public configuration changes', () => {
        const changed = structuredClone(config);
        const original = createDeCacheIdentity(project, changed, 'org', 'bu');
        setDeCacheBu(original, items);
        changed.credentials.org.businessUnits.bu = 102;
        assert.equal(
            getDeCacheForBu(createDeCacheIdentity(project, changed, 'org', 'bu')),
            undefined
        );
        changed.credentials.org.businessUnits.bu = 101;
        changed.credentials.org.eid = 200;
        assert.equal(
            getDeCacheForBu(createDeCacheIdentity(project, changed, 'org', 'bu')),
            undefined
        );
        assert.deepEqual(getDeCacheForBu(original), items);
    });

    it('distinguishes successful empty results from missing entries', () => {
        setDeCacheBu(identity(), []);
        assert.equal(hasDeCacheForBu(identity()), true);
        assert.deepEqual(getDeCacheForBu(identity()), []);
    });

    it('clearDeCache removes all entries, including cached empty lists', () => {
        setDeCacheBu(identity(), []);
        clearDeCache();
        assert.equal(hasDeCacheForBu(identity()), false);
        assert.equal(getDeCacheForBu(identity()), undefined);
    });

    it('export fetches an empty list once, then refetches only after public identity changes', async () => {
        const loadable = Module as typeof Module & {
            _load(request: string, parent: NodeModule | undefined, isMain: boolean): unknown;
        };
        const original = loadable._load;
        const currentConfig = structuredClone(config);
        let command: (() => Promise<void>) | undefined;
        let fetches = 0;
        const errors: string[] = [];
        const dependencies: Record<string, unknown> = {
            vscode: {
                workspace: { workspaceFolders: [] },
                commands: {
                    registerCommand: (_id: string, callback: () => Promise<void>) => {
                        command = callback;
                        return { dispose() {} };
                    },
                },
                ProgressLocation: { Notification: 15 },
                window: {
                    showQuickPick: async () => ({ source: 'list' }),
                    showErrorMessage: (message: string) => {
                        errors.push(message);
                    },
                    withProgress: async (
                        _options: unknown,
                        task: (progress: { report: () => void }) => Promise<void>
                    ) => task({ report() {} }),
                },
            },
            '../config': {
                selectProjectRoot: async () => project,
                readProjectConfig: () => currentConfig,
            },
            '../mcdevrcParser': {
                getCredentials: () => ['org'],
                getBusinessUnits: () => ['bu'],
            },
            'sfmc-dataloader': {
                fetchDeList: async (root: string, credential: string, bu: string) => {
                    assert.deepEqual([root, credential, bu], [project, 'org', 'bu']);
                    fetches++;
                    return [];
                },
            },
            '../runMcdata': {},
            '../argbuilder': {},
            '../commandTelemetry': {},
            '../telemetry': {},
        };
        const modules = [
            require.resolve('../commands/exportDE'),
            require.resolve('../commands/refreshDeCache'),
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
            // eslint-disable-next-line @typescript-eslint/no-require-imports -- Compose real export, refresh and cache logic with host and network I/O mocked.
            const loaded = require(modules[0]);
            loaded.registerExportCommand({ subscriptions: [] });
            assert.ok(command);
            await command();
            await command();
            assert.equal(fetches, 1);
            currentConfig.credentials.org.businessUnits.bu = 102;
            await command();
            assert.equal(fetches, 2);
            currentConfig.credentials.org.eid = 200;
            await command();
            assert.equal(fetches, 3);
            assert.deepEqual(
                errors,
                Array.from({ length: 4 }, () => 'No Data Extensions found for this Business Unit.')
            );
        } finally {
            replacement.mock.restore();
            for (const modulePath of modules) delete require.cache[modulePath];
        }
    });
});
