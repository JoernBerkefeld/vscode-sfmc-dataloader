import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import path from 'node:path';
import { getProjectFlags } from '../projectFlags';
import { resetVscodeStub, workspace } from './vscodeStub';

function folder(fsPath: string): { uri: { fsPath: string } } {
    return { uri: { fsPath } };
}

describe('getProjectFlags', () => {
    let root: string;
    let mcdevOnly: string;
    let mcdataOnly: string;
    let both: string;
    let empty: string;

    before(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'sfmc-data-flags-'));
        mcdevOnly = path.join(root, 'mcdev');
        mcdataOnly = path.join(root, 'mcdata');
        both = path.join(root, 'both');
        empty = path.join(root, 'empty');
        for (const directory of [mcdevOnly, mcdataOnly, both, empty]) {
            fs.mkdirSync(directory);
        }
        fs.writeFileSync(path.join(mcdevOnly, '.mcdevrc.json'), '{}');
        fs.writeFileSync(path.join(mcdataOnly, '.mcdatarc.json'), '{}');
        fs.writeFileSync(path.join(both, '.mcdevrc.json'), '{}');
        fs.writeFileSync(path.join(both, '.mcdatarc.json'), '{}');
    });

    after(() => {
        fs.unlinkSync(path.join(mcdevOnly, '.mcdevrc.json'));
        fs.unlinkSync(path.join(mcdataOnly, '.mcdatarc.json'));
        fs.unlinkSync(path.join(both, '.mcdevrc.json'));
        fs.unlinkSync(path.join(both, '.mcdatarc.json'));
        for (const directory of [mcdevOnly, mcdataOnly, both, empty]) {
            fs.rmdirSync(directory);
        }
        fs.rmdirSync(root);
        assert.ok(!fs.existsSync(root), 'fixture root is removed nonrecursively');
        resetVscodeStub();
    });

    it('returns both false when there are no folders', () => {
        assert.deepEqual(getProjectFlags([]), {
            isMcdevProject: false,
            isMcdataProject: false,
        });
        assert.deepEqual(getProjectFlags(undefined), {
            isMcdevProject: false,
            isMcdataProject: false,
        });
    });

    it('detects .mcdevrc.json and .mcdatarc.json independently on one folder', () => {
        assert.deepEqual(getProjectFlags([folder(mcdevOnly)]), {
            isMcdevProject: true,
            isMcdataProject: false,
        });
        assert.deepEqual(getProjectFlags([folder(mcdataOnly)]), {
            isMcdevProject: false,
            isMcdataProject: true,
        });
        assert.deepEqual(getProjectFlags([folder(both)]), {
            isMcdevProject: true,
            isMcdataProject: true,
        });
        assert.deepEqual(getProjectFlags([folder(empty)]), {
            isMcdevProject: false,
            isMcdataProject: false,
        });
    });

    it('scans every folder root instead of stopping at the first config file', () => {
        assert.deepEqual(getProjectFlags([folder(mcdevOnly), folder(mcdataOnly)]), {
            isMcdevProject: true,
            isMcdataProject: true,
        });
    });

    it('reads vscode.workspace.workspaceFolders when no argument is passed', () => {
        workspace.workspaceFolders = [folder(mcdataOnly)];
        try {
            assert.deepEqual(getProjectFlags(), { isMcdevProject: false, isMcdataProject: true });
        } finally {
            workspace.workspaceFolders = undefined;
        }
    });
});
