import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    buildExportArgs,
    buildImportArgs,
    buildMultiBuExportArgs,
    buildCrossBuImportArgs,
    buildFileToMultiBuImportArgs,
} from '../argbuilder';

describe('buildExportArgs', () => {
    it('produces export subcommand with a single DE key', () => {
        const args = buildExportArgs('myOrg/myBU', ['DE_Key_1'], 'csv');
        assert.deepEqual(args, ['export', 'myOrg/myBU', '--format', 'csv', '--de', 'DE_Key_1']);
    });

    it('appends --git when requested', () => {
        const args = buildExportArgs('myOrg/myBU', ['K'], 'csv', true);
        assert.ok(args.includes('--git'));
    });

    it('produces repeated --de flags for multiple keys', () => {
        const args = buildExportArgs('myOrg/myBU', ['Key_A', 'Key_B'], 'tsv');
        assert.deepEqual(args, [
            'export',
            'myOrg/myBU',
            '--format',
            'tsv',
            '--de',
            'Key_A',
            '--de',
            'Key_B',
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
    it('produces import subcommand with required flags (no --format)', () => {
        const args = buildImportArgs('myOrg/myBU', {
            deKeys: ['DE_Key_1'],
            mode: 'upsert',
            clearBeforeImport: false,
            acceptClearRisk: false,
        });
        assert.deepEqual(args, ['import', 'myOrg/myBU', '--mode', 'upsert', '--de', 'DE_Key_1']);
        assert.ok(!args.includes('--format'), 'import must not include --format');
    });

    it('produces repeated --de for multiple keys', () => {
        const args = buildImportArgs('a/b', {
            deKeys: ['K1', 'K2'],
            mode: 'insert',
            clearBeforeImport: false,
            acceptClearRisk: false,
        });
        assert.ok(args.includes('--de'));
        assert.deepEqual(
            args.filter((_, i, a) => a[i - 1] === '--de'),
            ['K1', 'K2']
        );
    });

    it('appends --clear-before-import when requested', () => {
        const args = buildImportArgs('a/b', {
            deKeys: ['K'],
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
            mode: 'upsert',
            clearBeforeImport: false,
            acceptClearRisk: false,
        });
        assert.ok(!args.includes('--clear-before-import'));
        assert.ok(!args.includes('--i-accept-clear-data-risk'));
    });

    it('does not emit --api', () => {
        const args = buildImportArgs('a/b', {
            deKeys: ['K'],
            mode: 'upsert',
            clearBeforeImport: false,
            acceptClearRisk: false,
        });
        assert.ok(!args.includes('--api'));
    });

    it('appends --backup-before-import when backupBeforeImport is true', () => {
        const args = buildImportArgs('a/b', {
            deKeys: ['K'],
            mode: 'upsert',
            clearBeforeImport: false,
            acceptClearRisk: false,
            backupBeforeImport: true,
        });
        assert.ok(args.includes('--backup-before-import'));
        assert.ok(!args.includes('--no-backup-before-import'));
    });

    it('appends --no-backup-before-import when backupBeforeImport is false', () => {
        const args = buildImportArgs('a/b', {
            deKeys: ['K'],
            mode: 'upsert',
            clearBeforeImport: false,
            acceptClearRisk: false,
            backupBeforeImport: false,
        });
        assert.ok(!args.includes('--backup-before-import'));
        assert.ok(args.includes('--no-backup-before-import'));
    });

    it('omits backup flags when backupBeforeImport is undefined', () => {
        const args = buildImportArgs('a/b', {
            deKeys: ['K'],
            mode: 'upsert',
            clearBeforeImport: false,
            acceptClearRisk: false,
        });
        assert.ok(!args.includes('--backup-before-import'));
        assert.ok(!args.includes('--no-backup-before-import'));
    });
});

describe('buildMultiBuExportArgs', () => {
    it('produces export with multiple --from flags', () => {
        const args = buildMultiBuExportArgs({
            fromCredBus: ['org/Dev', 'org/QA'],
            deKeys: ['DE1'],
            format: 'csv',
        });
        assert.equal(args[0], 'export');
        assert.ok(!args.includes('org/Dev') || args.indexOf('--from') < args.indexOf('org/Dev'));
        assert.deepEqual(
            args.filter((_, i, a) => a[i - 1] === '--from'),
            ['org/Dev', 'org/QA']
        );
        assert.deepEqual(
            args.filter((_, i, a) => a[i - 1] === '--de'),
            ['DE1']
        );
    });

    it('supports --git', () => {
        const args = buildMultiBuExportArgs({
            fromCredBus: ['org/Dev'],
            deKeys: ['K'],
            format: 'csv',
            useGit: true,
        });
        assert.ok(args.includes('--git'));
    });

    it('supports multiple DE keys', () => {
        const args = buildMultiBuExportArgs({
            fromCredBus: ['org/Dev'],
            deKeys: ['K1', 'K2'],
            format: 'tsv',
        });
        assert.deepEqual(
            args.filter((_, i, a) => a[i - 1] === '--de'),
            ['K1', 'K2']
        );
    });

    it('appends --json-pretty when requested', () => {
        const args = buildMultiBuExportArgs({
            fromCredBus: ['org/Dev'],
            deKeys: ['K'],
            format: 'json',
            jsonPretty: true,
        });
        assert.ok(args.includes('--json-pretty'));
    });

    it('does not append --json-pretty when not requested', () => {
        const args = buildMultiBuExportArgs({
            fromCredBus: ['org/Dev'],
            deKeys: ['K'],
            format: 'csv',
        });
        assert.ok(!args.includes('--json-pretty'));
    });
});

describe('buildCrossBuImportArgs', () => {
    it('produces import with --from and multiple --to flags (no --format)', () => {
        const args = buildCrossBuImportArgs({
            fromCredBu: 'org/Dev',
            toCredBus: ['org/QA', 'org/Prod'],
            deKeys: ['DE1'],
            mode: 'upsert',
            clearBeforeImport: false,
            acceptClearRisk: false,
        });
        assert.equal(args[0], 'import');
        assert.equal(args[args.indexOf('--from') + 1], 'org/Dev');
        assert.deepEqual(
            args.filter((_, i, a) => a[i - 1] === '--to'),
            ['org/QA', 'org/Prod']
        );
        assert.deepEqual(
            args.filter((_, i, a) => a[i - 1] === '--de'),
            ['DE1']
        );
        assert.ok(!args.includes('--api'));
        assert.ok(!args.includes('--format'), 'import must not include --format');
    });

    it('includes --clear-before-import when requested', () => {
        const args = buildCrossBuImportArgs({
            fromCredBu: 'org/Dev',
            toCredBus: ['org/QA'],
            deKeys: ['K'],
            mode: 'upsert',
            clearBeforeImport: true,
            acceptClearRisk: false,
        });
        assert.ok(args.includes('--clear-before-import'));
        assert.ok(!args.includes('--i-accept-clear-data-risk'));
    });

    it('includes both clear flags when risk is accepted', () => {
        const args = buildCrossBuImportArgs({
            fromCredBu: 'org/Dev',
            toCredBus: ['org/QA'],
            deKeys: ['K'],
            mode: 'upsert',
            clearBeforeImport: true,
            acceptClearRisk: true,
        });
        assert.ok(args.includes('--clear-before-import'));
        assert.ok(args.includes('--i-accept-clear-data-risk'));
    });

    it('does not include clear flags when both are false', () => {
        const args = buildCrossBuImportArgs({
            fromCredBu: 'org/Dev',
            toCredBus: ['org/QA'],
            deKeys: ['K'],
            mode: 'upsert',
            clearBeforeImport: false,
            acceptClearRisk: false,
        });
        assert.ok(!args.includes('--clear-before-import'));
        assert.ok(!args.includes('--i-accept-clear-data-risk'));
    });

    it('appends --backup-before-import when backupBeforeImport is true', () => {
        const args = buildCrossBuImportArgs({
            fromCredBu: 'org/Dev',
            toCredBus: ['org/QA'],
            deKeys: ['K'],
            mode: 'upsert',
            clearBeforeImport: false,
            acceptClearRisk: false,
            backupBeforeImport: true,
        });
        assert.ok(args.includes('--backup-before-import'));
        assert.ok(!args.includes('--no-backup-before-import'));
    });
});

describe('buildFileToMultiBuImportArgs', () => {
    it('produces import with --to flags and --file flags (no --from, no --format)', () => {
        const args = buildFileToMultiBuImportArgs({
            filePaths: ['/data/org/bu/My_DE.mcdata.2026-04-08T10-00-00Z.csv'],
            toCredBus: ['org/QA', 'org/Prod'],
            mode: 'upsert',
            clearBeforeImport: false,
            acceptClearRisk: false,
        });
        assert.equal(args[0], 'import');
        assert.ok(!args.includes('--from'), '--from must not appear in file mode');
        assert.ok(!args.includes('--de'), '--de must not appear in file mode');
        assert.ok(!args.includes('--format'), 'import must not include --format');
        assert.deepEqual(
            args.filter((_, i, a) => a[i - 1] === '--to'),
            ['org/QA', 'org/Prod']
        );
        assert.deepEqual(
            args.filter((_, i, a) => a[i - 1] === '--file'),
            ['/data/org/bu/My_DE.mcdata.2026-04-08T10-00-00Z.csv']
        );
    });

    it('supports multiple files', () => {
        const args = buildFileToMultiBuImportArgs({
            filePaths: ['/data/org/bu/DE1.mcdata.ts.csv', '/data/org/bu/DE2.mcdata.ts.csv'],
            toCredBus: ['org/QA'],
            mode: 'upsert',
            clearBeforeImport: false,
            acceptClearRisk: false,
        });
        assert.deepEqual(
            args.filter((_, i, a) => a[i - 1] === '--file'),
            ['/data/org/bu/DE1.mcdata.ts.csv', '/data/org/bu/DE2.mcdata.ts.csv']
        );
    });

    it('appends --clear-before-import when requested', () => {
        const args = buildFileToMultiBuImportArgs({
            filePaths: ['/data/org/bu/K.mcdata.ts.csv'],
            toCredBus: ['org/QA'],
            mode: 'upsert',
            clearBeforeImport: true,
            acceptClearRisk: false,
        });
        assert.ok(args.includes('--clear-before-import'));
        assert.ok(!args.includes('--i-accept-clear-data-risk'));
    });

    it('appends --no-backup-before-import when backupBeforeImport is false', () => {
        const args = buildFileToMultiBuImportArgs({
            filePaths: ['/data/org/bu/K.mcdata.ts.csv'],
            toCredBus: ['org/QA'],
            mode: 'upsert',
            clearBeforeImport: false,
            acceptClearRisk: false,
            backupBeforeImport: false,
        });
        assert.ok(args.includes('--no-backup-before-import'));
        assert.ok(!args.includes('--backup-before-import'));
    });
});

describe('buildImportArgs — by file path', () => {
    it('produces --file flags instead of --de (no --format)', () => {
        const args = buildImportArgs('org/bu', {
            filePaths: ['/data/org/bu/My_DE.mcdata.2026-04-01T00-00-00Z.csv'],
            mode: 'upsert',
            clearBeforeImport: false,
            acceptClearRisk: false,
        });
        assert.ok(args.includes('--file'));
        assert.ok(!args.includes('--de'));
        assert.ok(!args.includes('--format'), 'import must not include --format');
    });

    it('produces repeated --file for multiple files', () => {
        const args = buildImportArgs('org/bu', {
            filePaths: ['/a/file1.csv', '/b/file2.csv'],
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
