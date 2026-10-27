import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import Module from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import type * as vscode from 'vscode';
import type { McdataProcessOutcome } from '../mcdataProcessLifecycle';
import {
    buildMcdataRunContext,
    createBatchProgressLineHandler,
    createBoundedProgressParser,
} from '../runMcdata';
import * as runOutput from '../sfmcDataOutput';

/**
 * Runs real init and progress helpers with only host/process boundaries mocked.
 * @param outcome - Process result, or unavailable launcher.
 * @param hasExistingConfig - Whether initialization starts with a config.
 * @param isEqualsForm - Exercises equals-separated credential flags directly.
 * @returns {Promise<object>} Captured notifications, output and literal argv.
 */
async function invoke(
    outcome: McdataProcessOutcome | undefined,
    hasExistingConfig = true,
    isEqualsForm = false
) {
    const root = path.resolve('synthetic-init-project');
    const clientId = 'synthetic-client-id';
    const secret = 'synthetic-secret&A';
    const logs: string[] = [];
    const infos: string[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];
    const settings: string[] = [];
    const runs: string[][] = [];
    const answers = ['org', clientId, secret, 'https://example.invalid/', '123'];
    let command: (() => Promise<void>) | undefined;
    let hasConfig = hasExistingConfig;
    const host = {
        Uri: { file: (fsPath: string) => ({ fsPath, scheme: 'file' }) },
        workspace: {
            workspaceFolders: [
                { uri: { scheme: 'virtual', fsPath: 'never-select' } },
                { uri: { scheme: 'file', fsPath: root } },
            ],
            getConfiguration: (_section: string, uri: vscode.Uri) => {
                settings.push(uri.fsPath);
                return { get: () => false };
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
            showInputBox: async () => answers.shift(),
            showWarningMessage: async (message: string) => {
                warnings.push(message);
                return 'Override';
            },
            showQuickPick: async () => {
                throw new Error('Only one file root; no picker needed');
            },
            showInformationMessage: async (message: string) => {
                infos.push(message);
            },
            showErrorMessage: async (message: string) => {
                errors.push(message);
            },
            withProgress: async (
                _options: unknown,
                task: (progress: unknown, token: unknown) => Promise<unknown>
            ) => task({ report() {} }, {}),
        },
    };
    const dependencies: Record<string, unknown> = {
        vscode: host,
        './mcdataPrefix': {
            resolveMcdataLaunch: async () => outcome && { executable: 'node', prefixArgs: [] },
        },
        './mcdataProcessLifecycle': {
            mcdataProcesses: {
                run: async (options: {
                    arguments: string[];
                    onStdout(chunk: Buffer): void;
                    onStderr(chunk: Buffer): void;
                }) => {
                    runs.push(options.arguments);
                    options.onStdout(Buffer.from(`echo ${clientId} synthetic-sec`));
                    options.onStdout(Buffer.from('ret&A\n'));
                    options.onStderr(Buffer.from(secret));
                    options.onStdout(Buffer.from('z'.repeat(100_000)));
                    hasConfig = true;
                    return outcome?.status === 'spawn_error'
                        ? {
                              ...outcome,
                              message: `failed ${secret} ${clientId}`,
                              error: new Error(secret),
                          }
                        : outcome;
                },
            },
        },
        './sfmcDataOutput': {
            ...runOutput,
            getSfmcDataOutputChannel: () => ({
                append: (text: string) => {
                    logs.push(text);
                },
                appendLine: (text: string) => {
                    logs.push(text);
                },
                show() {},
            }),
        },
        './telemetry': { getReporter() {} },
    };
    const loadable = Module as typeof Module & {
        _load(request: string, parent: NodeModule | undefined, isMain: boolean): unknown;
    };
    const original = loadable._load.bind(Module);
    const modules = ['../runMcdata', '../commands/initProject', '../config'];
    for (const file of modules) delete require.cache[require.resolve(file)];
    mock.method(
        fs,
        'existsSync',
        (file: fs.PathLike) => String(file).endsWith('.mcdatarc.json') && hasConfig
    );
    loadable._load = function (request, parent, isMain) {
        return dependencies[request] ?? original(request, parent, isMain);
    };
    try {
        const registration =
            // eslint-disable-next-line @typescript-eslint/no-require-imports -- Reload the real command under the host boundary mock.
            require('../commands/initProject') as typeof import('../commands/initProject');
        registration.registerInitProjectCommand({
            subscriptions: [],
        } as unknown as vscode.ExtensionContext);
        assert.ok(command);
        if (isEqualsForm) {
            // eslint-disable-next-line @typescript-eslint/no-require-imports -- Exercise the real helper under the same host boundary mock.
            const runner = require('../runMcdata') as typeof import('../runMcdata');
            const result = await runner.runMcdataWithProgress(
                {} as vscode.ExtensionContext,
                root,
                [`--client-id=${clientId}`, `--client-secret=${secret}`],
                { progressTitle: 'test', telemetryCommand: 'sfmc-data.initProject' }
            );
            assert.equal(result.status, 'spawn_error');
            if (result.status === 'spawn_error') {
                assert.ok(!result.message.includes(secret));
                assert.ok(!result.error?.stack?.includes(secret));
            }
        } else await command();
    } finally {
        loadable._load = original;
        mock.restoreAll();
        for (const file of modules) delete require.cache[require.resolve(file)];
    }
    assert.ok(!logs.join('').includes(secret));
    assert.ok(!logs.join('').includes(clientId));
    assert.ok(!errors.join('').includes(secret));
    if (runs.length) {
        if (isEqualsForm) assert.ok(runs[0].includes(`--client-secret=${secret}`));
        else assert.equal(runs[0][runs[0].indexOf('--client-secret') + 1], secret);
        assert.deepEqual(settings, [root]);
        assert.ok(
            logs.join('').includes('z'.repeat(100_000)),
            'Full redacted output is not truncated by progress parsing'
        );
    }
    assert.equal(runOutput.getActiveMcdataRunCount(), 0);
    if (runs.length) {
        assert.match(logs.join('\n'), /\[run \d+\] START .*Project synthetic-init-project/);
        assert.match(logs.join('\n'), /\[run \d+\] END .* — /);
        assert.ok(logs.every((line) => /^\[run \d+\] /.test(line)));
    }
    return { infos, runs, errors, warnings };
}

describe('init composed with the real run helper', () => {
    for (const outcome of [
        { status: 'failed', exitCode: 1 },
        { status: 'cancelled' },
        { status: 'spawn_error', message: 'synthetic' },
    ] as McdataProcessOutcome[]) {
        it(`never reports success for ${outcome.status} with an existing config`, async () => {
            const result = await invoke(outcome);
            assert.deepEqual(result.infos, []);
            if (outcome.status === 'cancelled') {
                assert.match(
                    result.warnings.at(-1) ?? '',
                    /\[run \d+\].*Project synthetic-init-project/
                );
                assert.match(result.warnings.at(-1) ?? '', /local mcdata process cancelled/);
                assert.match(
                    result.warnings.at(-1) ?? '',
                    /Remote work already accepted may continue/
                );
            }
        });
    }
    it('does not report success or launch on resolution failure', async () => {
        const result = await invoke(undefined);
        assert.deepEqual(result.infos, []);
        assert.deepEqual(result.runs, []);
    });
    it('reports exactly one success for an existing configuration', async () => {
        assert.deepEqual((await invoke({ status: 'success' })).infos, [
            'SFMC Data: Project initialized successfully.',
        ]);
    });
    it('initializes a file root without an existing configuration', async () => {
        assert.equal((await invoke({ status: 'success' }, false)).infos.length, 1);
    });
});

it('redacts equals-form sensitive flags in output and failure diagnostics without changing argv', async () => {
    await invoke({ status: 'spawn_error', message: 'synthetic' }, true, true);
});

const redactContext = (value: string) => value.replaceAll('secret', '[REDACTED]');

it('summarizes single and cross-BU context without unbounded or secret labels', () => {
    assert.equal(
        buildMcdataRunContext('/projects/shop', ['export', 'org/BU'], redactContext),
        'Project shop | BU org/BU'
    );
    const label = buildMcdataRunContext(
        '/projects/shop',
        [
            'import',
            '--from',
            'org/source',
            '--to',
            'secret/one',
            '--to',
            'org/two',
            '--to',
            'org/three',
        ],
        redactContext
    );
    assert.equal(label, 'Project shop | from org/source | to [REDACTED]/one, org/two (+1 more)');
    assert.ok(
        buildMcdataRunContext('/projects/' + 'x'.repeat(1000), ['init'], redactContext).length < 140
    );
});

describe('bounded progress parser', () => {
    it('bounds newline-free retained state and preserves split progress', () => {
        const reports: { message?: string }[] = [];
        const parser = createBoundedProgressParser(
            createBatchProgressLineHandler({
                report: (value) => {
                    reports.push(value);
                },
            })
        );
        parser.append('x'.repeat(2_000_000));
        assert.ok(parser.retainedLength <= 1024);
        parser.append('\ninfo: Download');
        parser.append('ing batch 3 of 7\ninfo: Upload');
        parser.append('ing batch 2 of 5');
        parser.flush();
        assert.deepEqual(reports, [
            { message: 'Downloading batch 3 of 7' },
            { message: 'Uploading batch 2 of 5' },
        ]);
        assert.equal(parser.retainedLength, 0);
    });
});
