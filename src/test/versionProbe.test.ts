import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import Module from 'node:module';
import type * as vscode from 'vscode';

/**
 * Loads activation with host-free dependencies and a controlled launcher probe.
 * @param isEnabled - Initial VS Code telemetry consent.
 * @returns {object} Captured activation dependencies and teardown.
 */
function setup(isEnabled: boolean) {
    const registered: string[] = [];
    const launches: unknown[] = [];
    const probes: unknown[][] = [];
    const settings: string[] = [];
    const events: { event: string; properties: unknown }[] = [];
    const environment = { isTelemetryEnabled: isEnabled };
    let finishResolution!: (value: unknown) => void;
    let reporter: unknown;
    const root = String.raw`F:\second-project`;
    const context = {
        subscriptions: [],
        extension: { packageJSON: { version: '2.1.0' } },
        extensionPath: String.raw`F:\extension`,
    } as unknown as vscode.ExtensionContext;
    const registration = (name: string) => () => {
        registered.push(name);
    };
    const dependencies: Record<string, unknown> = {
        vscode: {
            env: environment,
            workspace: {
                workspaceFolders: [
                    { uri: { scheme: 'file', fsPath: String.raw`F:\first-project` } },
                ],
                getConfiguration: () => ({ get: () => 'bundled' }),
            },
            commands: {
                registerCommand: (name: string) => {
                    registered.push(name);
                    return { dispose() {} };
                },
            },
        },
        './config': {
            findProjectRoot: () => root,
            getProjectConfiguration: (selected: string) => {
                settings.push(selected);
                return {
                    get: (key: string) =>
                        key === 'mcdataSource'
                            ? 'custom'
                            : String.raw`F:\second-project\mcdata.exe`,
                };
            },
        },
        './mcdataResolve': {
            normalizeMcdataSource: (value: string) => value,
            buildMcdataLaunch: (options: unknown) => {
                launches.push(options);
                // eslint-disable-next-line unicorn/prefer-promise-with-resolvers -- Match the extension's ES2023 TypeScript library target.
                return new Promise((resolve) => {
                    finishResolution = resolve;
                });
            },
        },
        'node:child_process': {
            execFile: (...arguments_: unknown[]) => {
                probes.push(arguments_.slice(0, -1));
                const callback = arguments_.at(-1) as (
                    error: undefined,
                    output: { stdout: string; stderr: string }
                ) => void;
                callback(undefined, { stdout: 'mcdata 3.1.0', stderr: '' });
            },
        },
        './telemetry': {
            TelemetryReporter: class {
                track(event: string, properties: unknown) {
                    events.push({ event, properties });
                }
            },
            setReporter: (value: unknown) => (reporter = value),
            getReporter: () => reporter,
            detectEcosystem: () => ({}),
        },
        './projectFlags': { getProjectFlags: () => ({}) },
        './whatsNew': { checkAndShowWhatsNew() {}, showWhatsNewPanel() {} },
        './sfmcDataOutput': { registerSfmcDataOutput() {} },
        './statusBarMcdata': { registerMcdataStatusBar() {} },
        './mcdataProcessLifecycle': {
            registerMcdataProcessLifecycle: registration('lifecycle'),
            mcdataProcesses: { async shutdown() {} },
        },
    };
    for (const [file, name] of [
        ['initProject', 'registerInitProjectCommand'],
        ['refreshDeCache', 'registerRefreshDeCacheCommand'],
        ['exportDE', 'registerExportCommand'],
        ['importDE', 'registerImportCommand'],
        ['exportDEMultiBU', 'registerExportMultiBUCommand'],
        ['importDECrossBU', 'registerImportCrossBUCommand'],
        ['contextExportDE', 'registerContextExportCommand'],
        ['contextImportDE', 'registerContextImportCommand'],
        ['contextImportToBU', 'registerContextImportToBUCommand'],
        ['contextExportFromBUs', 'registerContextExportFromBUsCommand'],
    ]) {
        dependencies[`./commands/${file}`] = { [name]: registration(name) };
    }
    const loadable = Module as typeof Module & {
        _load(request: string, parent: NodeModule | undefined, isMain: boolean): unknown;
    };
    const original = loadable._load;
    const replacement = mock.method(
        loadable,
        '_load',
        (request: string, parent: NodeModule | undefined, isMain: boolean) =>
            dependencies[request] ?? original.call(loadable, request, parent, isMain)
    );
    const filename = require.resolve('../extension');
    delete require.cache[filename];
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- Reload activation under per-test host-free dependency mocks.
        const extension = require('../extension') as typeof import('../extension');
        return {
            activate: () => extension.activate(context),
            env: environment,
            registered,
            launches,
            probes,
            settings,
            events,
            root,
            settle: () => finishResolution({ executable: 'node', prefixArgs: ['cli.cjs'] }),
            cleanup: () => {
                replacement.mock.restore();
                delete require.cache[filename];
            },
        };
    } catch (ex) {
        replacement.mock.restore();
        delete require.cache[filename];
        throw ex;
    }
}

describe('activation version discovery', () => {
    it('skips telemetry-only resolution and probes when consent is disabled', () => {
        const test = setup(false);
        try {
            test.activate();
            assert.equal(test.registered.length, 12);
            assert.deepEqual(test.settings, []);
            assert.deepEqual(test.launches, []);
            assert.deepEqual(test.probes, []);
        } finally {
            test.cleanup();
        }
    });

    it('registers commands synchronously while launcher resolution is pending', async () => {
        const test = setup(true);
        try {
            assert.equal(test.activate(), undefined);
            assert.equal(test.registered.length, 12);
            assert.equal(test.launches.length, 1);
            assert.deepEqual(test.probes, []);
            await new Promise<void>((resolve) => setImmediate(resolve));
            assert.equal(test.registered.length, 12);
            assert.deepEqual(test.probes, []);
            test.settle();
            await new Promise<void>((resolve) => setImmediate(resolve));
            assert.equal(test.probes.length, 1);
        } finally {
            test.cleanup();
        }
    });

    it('uses the same project scope for launcher source and custom path', async () => {
        const test = setup(true);
        try {
            test.activate();
            assert.deepEqual(test.settings, [test.root]);
            assert.deepEqual(test.launches, [
                {
                    mcdataSource: 'custom',
                    customPath: String.raw`F:\second-project\mcdata.exe`,
                    projectRoot: test.root,
                    extensionPath: String.raw`F:\extension`,
                },
            ]);
            test.settle();
            await new Promise<void>((resolve) => setImmediate(resolve));
            assert.equal(test.probes.length, 1);
            assert.deepEqual(test.events.at(-1), {
                event: 'mcdata.version',
                properties: { mcdataSource: 'custom', mcdataVersion: '3.1.0' },
            });
        } finally {
            test.cleanup();
        }
    });

    it('does not start a version process if consent is revoked during resolution', async () => {
        const test = setup(true);
        try {
            test.activate();
            test.env.isTelemetryEnabled = false;
            test.settle();
            await new Promise<void>((resolve) => setImmediate(resolve));
            assert.deepEqual(test.probes, []);
        } finally {
            test.cleanup();
        }
    });
});
