import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const root = path.resolve(__dirname, '../../..');
const manifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const properties = manifest.contributes.configuration.properties;

describe('workspace capability manifest', () => {
    it('declares virtual workspaces unsupported with an on-disk process requirement', () => {
        const capability = manifest.capabilities.virtualWorkspaces;
        assert.equal(capability.supported, false);
        assert.match(capability.description, /on-disk/i);
        assert.match(capability.description, /CLI processes/i);
    });

    it('requires trust before running processes with project credentials', () => {
        const capability = manifest.capabilities.untrustedWorkspaces;
        assert.equal(capability.supported, false);
        assert.match(capability.description, /trust/i);
        assert.match(capability.description, /CLI processes/i);
        assert.match(capability.description, /credentials/i);
    });

    it('allows project-specific source selection and operation settings', () => {
        const resourceSettings = [
            'mcdataSource',
            'useGitFilenames',
            'promptClearBeforeImport',
            'promptImportMode',
            'skipEmptyLines',
            'importMode',
            'defaultFormat',
            'jsonPretty',
            'maxRowsPerFile',
            'backupBeforeImport',
            'createDebugLog',
        ];
        for (const setting of resourceSettings) {
            assert.equal(properties[`sfmcData.${setting}`].scope, 'resource', setting);
        }
    });

    it('declares safe export option defaults and split bounds', () => {
        const pretty = properties['sfmcData.jsonPretty'];
        assert.equal(pretty.type, 'boolean');
        assert.equal(pretty.default, false);
        const split = properties['sfmcData.maxRowsPerFile'];
        assert.deepEqual(split.type, ['integer', 'null']);
        assert.equal(split.default, null);
        assert.equal(split.minimum, 1);
        assert.equal(split.maximum, Number.MAX_SAFE_INTEGER);
    });

    it('keeps executable paths machine-specific but folder-overridable', () => {
        assert.equal(properties['sfmcData.mcdataPath'].scope, 'machine-overridable');
    });

    it('describes shell-free resolution and the supported Windows launcher boundary', () => {
        const source = properties['sfmcData.mcdataSource'];
        const autoDescription = source.enumDescriptions[source.enum.indexOf('auto')];
        const pathDescription = properties['sfmcData.mcdataPath'].markdownDescription;
        for (const description of [autoDescription, pathDescription]) {
            assert.match(description, /without a shell/i);
            assert.match(description, /recognized npm `\.cmd` shims/i);
            assert.match(description, /directly through Node\.js/i);
            assert.doesNotMatch(description, /shell lookup/i);
        }
        assert.match(pathDescription, /unsupported shell wrappers are rejected/i);
    });
});
