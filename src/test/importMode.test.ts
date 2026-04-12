import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type * as vscode from 'vscode';
import { getImportWriteModeFromSettings } from '../importModeCore';

function mockWorkspaceConfiguration(options: {
    getImportMode?: string;
}): vscode.WorkspaceConfiguration {
    return {
        get: (section: string) => {
            if (section === 'importMode') {
                return options.getImportMode ?? 'upsert';
            }
            return;
        },
    } as vscode.WorkspaceConfiguration;
}

describe('getImportWriteModeFromSettings', () => {
    it('returns insert when importMode is set to insert', () => {
        const cfg = mockWorkspaceConfiguration({ getImportMode: 'insert' });
        assert.equal(getImportWriteModeFromSettings(cfg), 'insert');
    });

    it('returns upsert when importMode is set to upsert', () => {
        const cfg = mockWorkspaceConfiguration({ getImportMode: 'upsert' });
        assert.equal(getImportWriteModeFromSettings(cfg), 'upsert');
    });

    it('defaults to upsert when importMode is absent', () => {
        const cfg = mockWorkspaceConfiguration({});
        assert.equal(getImportWriteModeFromSettings(cfg), 'upsert');
    });

    it('defaults to upsert when importMode is an unrecognised value', () => {
        const cfg = mockWorkspaceConfiguration({ getImportMode: 'bulk' });
        assert.equal(getImportWriteModeFromSettings(cfg), 'upsert');
    });
});
