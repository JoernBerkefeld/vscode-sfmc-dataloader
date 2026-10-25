import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import Module from 'node:module';
import path from 'node:path';
import type * as vscode from 'vscode';
import filesystem from 'node:fs';

const load = Module.createRequire(__filename);

/**
 * Creates a host-style disk URI without requiring the VS Code runtime.
 * @param fsPath - Absolute resource path.
 * @param scheme - URI scheme.
 * @returns {vscode.Uri} Mock resource URI.
 */
function resource(fsPath: string, scheme = 'file'): vscode.Uri {
    return { fsPath, scheme, toString: () => `${scheme}:${fsPath}` } as vscode.Uri;
}

const first = {
    name: 'First',
    index: 0,
    uri: resource(path.resolve('first-project')),
};
const second = {
    name: 'Second',
    index: 1,
    uri: resource(path.resolve('second-project')),
};
const folders = [first, second];
const configured = new Set<string>();
const state = {
    activeUri: undefined as vscode.Uri | undefined,
    picked: undefined as vscode.WorkspaceFolder | undefined,
    pickerCalls: 0,
    diskCalls: [] as string[],
    settingResource: undefined as vscode.Uri | undefined,
};
const host = {
    Uri: { file: resource },
    workspace: {
        getWorkspaceFolder: (uri: vscode.Uri) =>
            folders.find(
                (folder) =>
                    uri.fsPath === folder.uri.fsPath ||
                    uri.fsPath.startsWith(folder.uri.fsPath + path.sep)
            ),
        getConfiguration: (section: string, uri: vscode.Uri) => {
            assert.equal(section, 'sfmcData');
            state.settingResource = uri;
            return { get: () => true };
        },
    },
    window: {
        get activeTextEditor() {
            return state.activeUri ? { document: { uri: state.activeUri } } : undefined;
        },
        showQuickPick: async (items: { folder: vscode.WorkspaceFolder }[]) => {
            state.pickerCalls++;
            return items.find((item) => item.folder === state.picked);
        },
    },
};
const loadable = Module as typeof Module & {
    _load(request: string, parent: NodeModule | undefined, isMain: boolean): unknown;
};
const originalLoad = loadable._load;
loadable._load = function projectSelectionLoad(request, parent, isMain) {
    if (request === 'vscode') return host;
    return originalLoad.call(Module, request, parent, isMain);
};
const configPath = require.resolve('../config');
delete require.cache[configPath];
let config: typeof import('../config');
try {
    config = load('../config') as typeof import('../config');
} finally {
    loadable._load = originalLoad;
    delete require.cache[configPath];
}

describe('project selection', () => {
    beforeEach(() => {
        configured.clear();
        configured.add(path.join(first.uri.fsPath, '.mcdevrc.json'));
        configured.add(path.join(second.uri.fsPath, '.mcdatarc.json'));
        state.activeUri = undefined;
        state.picked = undefined;
        state.pickerCalls = 0;
        state.diskCalls = [];
        state.settingResource = undefined;
        mock.method(filesystem, 'existsSync', (filename: string) => {
            state.diskCalls.push(filename);
            return configured.has(filename);
        });
    });
    afterEach(() => mock.restoreAll());

    it('retains first-configured legacy selection and config-file precedence', () => {
        assert.equal(config.findProjectRoot(folders), first.uri.fsPath);
        assert.deepEqual(state.diskCalls, [path.join(first.uri.fsPath, '.mcdevrc.json')]);
        configured.delete(path.join(first.uri.fsPath, '.mcdevrc.json'));
        assert.equal(config.findProjectRoot(folders), second.uri.fsPath);
    });

    it('resolves explicit second-root resources rather than the active first root', async () => {
        state.activeUri = resource(path.join(first.uri.fsPath, 'active.csv'));
        assert.equal(
            await config.selectProjectRoot(folders, 'context', second.uri),
            second.uri.fsPath
        );
        assert.equal(state.pickerCalls, 0);
    });

    it('uses the active document only for context invocations without explicit resources', async () => {
        state.activeUri = resource(path.join(second.uri.fsPath, 'active.csv'));
        assert.equal(await config.selectProjectRoot(folders, 'context'), second.uri.fsPath);
        state.activeUri = undefined;
        assert.equal(await config.selectProjectRoot(folders, 'context'), undefined);
    });

    it('offers a palette picker despite an active document and preserves cancellation', async () => {
        state.activeUri = resource(path.join(first.uri.fsPath, 'active.csv'));
        state.picked = second;
        assert.equal(await config.selectProjectRoot(folders, 'palette'), second.uri.fsPath);
        state.picked = undefined;
        assert.equal(await config.selectProjectRoot(folders, 'palette'), undefined);
        assert.equal(state.pickerCalls, 2);
    });

    it('automatically chooses the sole configured project and handles no configured projects', async () => {
        configured.delete(path.join(first.uri.fsPath, '.mcdevrc.json'));
        assert.equal(await config.selectProjectRoot(folders, 'palette'), second.uri.fsPath);
        configured.clear();
        assert.equal(await config.selectProjectRoot(folders, 'palette'), undefined);
        assert.equal(await config.selectProjectRoot(undefined, 'palette'), undefined);
        assert.equal(state.pickerCalls, 0);
    });

    it('accepts a same-root multi-selection supplied without a primary URI', async () => {
        state.activeUri = resource(path.join(first.uri.fsPath, 'active.csv'));
        const selected = ['one.csv', 'two.csv'].map((name) =>
            resource(path.join(second.uri.fsPath, name))
        );
        assert.equal(
            await config.selectProjectRoot(folders, 'context', undefined, selected),
            second.uri.fsPath
        );
    });

    it('rejects cross-project selections before touching disk, including the primary URI', async () => {
        await assert.rejects(
            config.selectProjectRoot(folders, 'context', resource(first.uri.fsPath), [
                resource(second.uri.fsPath),
            ]),
            /single project/
        );
        assert.deepEqual(state.diskCalls, []);
    });

    it('does not fall back from an unconfigured explicit owner to another project', async () => {
        configured.delete(path.join(second.uri.fsPath, '.mcdatarc.json'));
        assert.equal(
            await config.selectProjectRoot(folders, 'context', resource(second.uri.fsPath)),
            undefined
        );
    });

    it('rejects virtual and outside resources without filesystem access or active fallback', async () => {
        state.activeUri = resource(first.uri.fsPath);
        for (const uri of [
            resource(second.uri.fsPath, 'untitled'),
            resource(second.uri.fsPath, 'vscode-vfs'),
            resource(path.resolve('outside-project')),
        ]) {
            await assert.rejects(config.selectProjectRoot(folders, 'context', uri));
        }
        state.activeUri = resource(second.uri.fsPath, 'git');
        await assert.rejects(config.selectProjectRoot(folders, 'context'), /file resources/);
        assert.deepEqual(state.diskCalls, []);
    });

    it('skips virtual folders in legacy and palette discovery before filesystem access', async () => {
        const virtual = { ...first, uri: resource(first.uri.fsPath, 'vscode-vfs') };
        assert.equal(config.findProjectRoot([virtual]), undefined);
        assert.equal(await config.selectProjectRoot([virtual], 'palette'), undefined);
        assert.deepEqual(state.diskCalls, []);
    });

    it('rejects a virtual owning folder even when given a file resource', async () => {
        const original = first.uri;
        first.uri = resource(original.fsPath, 'vscode-vfs');
        try {
            await assert.rejects(
                config.selectProjectRoot(folders, 'context', resource(original.fsPath)),
                /disk-backed/
            );
            assert.deepEqual(state.diskCalls, []);
        } finally {
            first.uri = original;
        }
    });

    it('reads settings using the selected root file URI, including remote-host disk paths', () => {
        assert.equal(
            config.getProjectConfiguration(second.uri.fsPath).get('useGitFilenames'),
            true
        );
        assert.equal(state.settingResource?.scheme, 'file');
        assert.equal(state.settingResource?.fsPath, second.uri.fsPath);
    });
});
