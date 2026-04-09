import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type * as vscode from 'vscode';
import { getImportWriteModeFromSettings } from '../importModeCore';

function mockWorkspaceConfiguration(options: {
    importInspect?: {
        globalValue?: string;
        workspaceValue?: string;
        workspaceFolderValue?: string;
    };
    getImportMode?: string;
    getDefaultMode?: string;
}): vscode.WorkspaceConfiguration {
    return {
        inspect: (section: string) => {
            if (section === 'importMode') {
                return options.importInspect ?? {};
            }
            return undefined;
        },
        get: (section: string) => {
            if (section === 'importMode') {
                return options.getImportMode ?? 'upsert';
            }
            if (section === 'defaultMode') {
                return options.getDefaultMode ?? 'upsert';
            }
            return undefined;
        },
    } as vscode.WorkspaceConfiguration;
}

describe('getImportWriteModeFromSettings', () => {
    it('uses importMode when set at workspace scope', () => {
        const cfg = mockWorkspaceConfiguration({
            importInspect: { workspaceValue: 'insert' },
            getImportMode: 'insert',
            getDefaultMode: 'upsert',
        });
        assert.equal(getImportWriteModeFromSettings(cfg), 'insert');
    });

    it('falls back to defaultMode when importMode is unset at all scopes', () => {
        const cfg = mockWorkspaceConfiguration({
            importInspect: {},
            getImportMode: 'upsert',
            getDefaultMode: 'insert',
        });
        assert.equal(getImportWriteModeFromSettings(cfg), 'insert');
    });

    it('uses importMode upsert when explicitly set over legacy insert', () => {
        const cfg = mockWorkspaceConfiguration({
            importInspect: { globalValue: 'upsert' },
            getImportMode: 'upsert',
            getDefaultMode: 'insert',
        });
        assert.equal(getImportWriteModeFromSettings(cfg), 'upsert');
    });

    it('defaults to upsert when both are absent or invalid', () => {
        const cfg = mockWorkspaceConfiguration({
            importInspect: {},
            getImportMode: 'upsert',
            getDefaultMode: 'upsert',
        });
        assert.equal(getImportWriteModeFromSettings(cfg), 'upsert');
    });
});
