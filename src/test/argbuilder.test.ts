import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildExportArgs, buildImportArgs } from '../argbuilder';

describe('buildExportArgs', () => {
    it('produces export subcommand with a single DE key', () => {
        const args = buildExportArgs('myOrg/myBU', ['DE_Key_1'], 'csv');
        assert.deepEqual(args, ['export', 'myOrg/myBU', '--format', 'csv', '--de', 'DE_Key_1']);
    });

    it('produces repeated --de flags for multiple keys', () => {
        const args = buildExportArgs('myOrg/myBU', ['Key_A', 'Key_B'], 'tsv');
        assert.deepEqual(args, [
            'export', 'myOrg/myBU', '--format', 'tsv',
            '--de', 'Key_A',
            '--de', 'Key_B',
        ]);
    });

    it('passes json format through', () => {
        const args = buildExportArgs('org/bu', ['K'], 'json');
        assert.equal(args[3], 'json');
    });

    it('always starts with "export"', () => {
        const args = buildExportArgs('x/y', ['k'], 'csv');
        assert.equal(args[0], 'export');
    });
});

describe('buildImportArgs — by DE key', () => {
    it('produces import subcommand with required flags', () => {
        const args = buildImportArgs('myOrg/myBU', {
            deKeys: ['DE_Key_1'],
            format: 'csv',
            api: 'async',
            mode: 'upsert',
            clearBeforeImport: false,
            acceptClearRisk: false,
        });
        assert.deepEqual(args, [
            'import', 'myOrg/myBU', '--format', 'csv', '--api', 'async', '--mode', 'upsert',
            '--de', 'DE_Key_1',
        ]);
    });

    it('produces repeated --de for multiple keys', () => {
        const args = buildImportArgs('a/b', {
            deKeys: ['K1', 'K2'],
            format: 'tsv',
            api: 'sync',
            mode: 'insert',
            clearBeforeImport: false,
            acceptClearRisk: false,
        });
        assert.ok(args.includes('--de'));
        assert.equal(args.indexOf('--de'), args.lastIndexOf('--de') - 2);
        assert.deepEqual(
            args.filter((_, i, a) => a[i - 1] === '--de'),
            ['K1', 'K2']
        );
    });

    it('appends --clear-before-import when requested', () => {
        const args = buildImportArgs('a/b', {
            deKeys: ['K'],
            format: 'csv',
            api: 'async',
            mode: 'upsert',
            clearBeforeImport: true,
            acceptClearRisk: false,
        });
        assert.ok(args.includes('--clear-before-import'));
        assert.ok(!args.includes('--i-accept-clear-data-risk'));
    });

    it('appends both clear flags when risk is accepted', () => {
        const args = buildImportArgs('a/b', {
            deKeys: ['K'],
            format: 'csv',
            api: 'async',
            mode: 'upsert',
            clearBeforeImport: true,
            acceptClearRisk: true,
        });
        assert.ok(args.includes('--clear-before-import'));
        assert.ok(args.includes('--i-accept-clear-data-risk'));
    });

    it('does not append clear flags when both are false', () => {
        const args = buildImportArgs('a/b', {
            deKeys: ['K'],
            format: 'csv',
            api: 'async',
            mode: 'upsert',
            clearBeforeImport: false,
            acceptClearRisk: false,
        });
        assert.ok(!args.includes('--clear-before-import'));
        assert.ok(!args.includes('--i-accept-clear-data-risk'));
    });
});

describe('buildImportArgs — by file path', () => {
    it('produces --file flags instead of --de', () => {
        const args = buildImportArgs('org/bu', {
            filePaths: ['/data/org/bu/My_DE+MCDATA+2026-04-01T00-00-00Z.csv'],
            format: 'csv',
            api: 'async',
            mode: 'upsert',
            clearBeforeImport: false,
            acceptClearRisk: false,
        });
        assert.ok(args.includes('--file'));
        assert.ok(!args.includes('--de'));
    });

    it('produces repeated --file for multiple files', () => {
        const args = buildImportArgs('org/bu', {
            filePaths: ['/a/file1.csv', '/b/file2.csv'],
            format: 'csv',
            api: 'async',
            mode: 'upsert',
            clearBeforeImport: false,
            acceptClearRisk: false,
        });
        assert.deepEqual(
            args.filter((_, i, a) => a[i - 1] === '--file'),
            ['/a/file1.csv', '/b/file2.csv']
        );
    });
});
