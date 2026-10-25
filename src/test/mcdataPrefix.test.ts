import { it } from 'node:test';
import assert from 'node:assert/strict';
import Module from 'node:module';
import path from 'node:path';
import type * as vscode from 'vscode';

it('resolves launcher settings from the selected root through real project configuration', async () => {
    const firstRoot = path.resolve('synthetic-first-project');
    const selectedRoot = path.resolve('synthetic-selected-project');
    const selectedPath = path.join(selectedRoot, 'custom-node.exe');
    const reads: string[] = [];
    const launches: unknown[] = [];
    const host = {
        Uri: { file: (fsPath: string) => ({ fsPath, scheme: 'file' }) },
        workspace: {
            workspaceFolders: [firstRoot, selectedRoot].map((fsPath) => ({ uri: { fsPath } })),
            getConfiguration: (section: string, uri?: vscode.Uri) => {
                assert.equal(section, 'sfmcData');
                assert.ok(uri, 'Launcher settings must be resource scoped');
                reads.push(uri.fsPath);
                const settings: Record<string, string> =
                    uri.fsPath === selectedRoot
                        ? { mcdataSource: 'custom', mcdataPath: selectedPath }
                        : { mcdataSource: 'bundled', mcdataPath: '' };
                return { get: (key: string) => settings[key] };
            },
        },
        window: { showErrorMessage: assert.fail },
    };
    const loadable = Module as typeof Module & {
        _load(request: string, parent: NodeModule | undefined, isMain: boolean): unknown;
    };
    const original = loadable._load.bind(Module);
    const modules = ['../mcdataPrefix', '../config'];
    for (const file of modules) delete require.cache[require.resolve(file)];
    loadable._load = function (request, parent, isMain) {
        if (request === 'vscode') return host;
        if (request === './mcdataResolve') {
            return {
                normalizeMcdataSource: (source: string) => source,
                buildMcdataLaunch: async (options: unknown) => {
                    launches.push(options);
                    return { executable: selectedPath, prefixArgs: [] };
                },
            };
        }
        return original(request, parent, isMain);
    };
    try {
        const { resolveMcdataLaunch } =
            // eslint-disable-next-line @typescript-eslint/no-require-imports -- Load real launcher and config under the host boundary mock.
            require('../mcdataPrefix') as typeof import('../mcdataPrefix');
        const extensionPath = path.resolve('synthetic-extension');
        assert.deepEqual(
            await resolveMcdataLaunch({ extensionPath } as vscode.ExtensionContext, selectedRoot),
            { executable: selectedPath, prefixArgs: [] }
        );
        assert.deepEqual(reads, [selectedRoot]);
        assert.deepEqual(launches, [
            {
                mcdataSource: 'custom',
                customPath: selectedPath,
                projectRoot: selectedRoot,
                extensionPath,
            },
        ]);
    } finally {
        loadable._load = original;
        for (const file of modules) delete require.cache[require.resolve(file)];
    }
});
