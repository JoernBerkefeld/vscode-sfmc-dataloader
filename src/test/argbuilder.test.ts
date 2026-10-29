import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    buildExportArguments,
    buildImportArguments,
    buildMultiBuExportArguments,
    buildCrossBuImportArguments,
    buildFileToMultiBuImportArguments,
} from '../argbuilder';

describe('export file options', () => {
    const builders = [
        (format: string, options: { jsonPretty?: boolean; maxRowsPerFile?: number | null }) =>
            buildExportArguments('org/bu', ['K'], format, false, options),
        (format: string, options: { jsonPretty?: boolean; maxRowsPerFile?: number | null }) =>
            buildMultiBuExportArguments({
                fromCredBus: ['org/bu'],
                deKeys: ['K'],
                format,
                ...options,
            }),
    ];
    for (const [index, build] of builders.entries()) {
        for (const format of ['csv', 'tsv', 'json']) {
            it(`builder ${index} preserves ${format} defaults and limits pretty to JSON`, () => {
                const defaults = build(format, {});
                assert.ok(!defaults.includes('--json-pretty'));
                assert.ok(!defaults.includes('--max-rows-per-file'));
                assert.deepEqual(
                    build(format, { jsonPretty: false, maxRowsPerFile: null }),
                    defaults
                );
                const flags = build(format, { jsonPretty: true, maxRowsPerFile: 123 });
                assert.equal(flags.includes('--json-pretty'), format === 'json');
                assert.equal(flags[flags.indexOf('--max-rows-per-file') + 1], '123');
            });
        }
        for (const value of [
            0,
            -1,
            1.5,
            NaN,
            Infinity,
            Number.MAX_SAFE_INTEGER + 1,
            '12',
            '',
            true,
        ]) {
            it(`builder ${index} rejects split size ${String(value)}`, () => {
                assert.throws(
                    () => build('csv', { maxRowsPerFile: value as number }),
                    /positive safe integer/
                );
            });
        }
        for (const value of [1, Number.MAX_SAFE_INTEGER]) {
            it(`builder ${index} accepts split boundary ${value}`, () => {
                const flags = build('json', { maxRowsPerFile: value });
                assert.equal(flags[flags.indexOf('--max-rows-per-file') + 1], String(value));
            });
        }
    }
});

describe('buildExportArgs', () => {
    it('produces export subcommand with a single DE key', () => {
        const arguments_ = buildExportArguments('myOrg/myBU', ['DE_Key_1'], 'csv');
        assert.deepEqual(arguments_, [
            'export',
            'myOrg/myBU',
            '--format',
            'csv',
            '--de',
            'DE_Key_1',
        ]);
    });

    it('appends --git when requested', () => {
        const arguments_ = buildExportArguments('myOrg/myBU', ['K'], 'csv', true);
        assert.ok(arguments_.includes('--git'));
    });

    it('produces repeated --de flags for multiple keys', () => {
        const arguments_ = buildExportArguments('myOrg/myBU', ['Key_A', 'Key_B'], 'tsv');
        assert.deepEqual(arguments_, [
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
        const arguments_ = buildExportArguments('org/bu', ['K'], 'json');
        assert.equal(arguments_[3], 'json');
    });

    it('always starts with "export"', () => {
        const arguments_ = buildExportArguments('x/y', ['k'], 'csv');
        assert.equal(arguments_[0], 'export');
    });
});

describe('buildImportArgs — by DE key', () => {
    it('produces import subcommand with required flags (no --format)', () => {
        const arguments_ = buildImportArguments('myOrg/myBU', {
            deKeys: ['DE_Key_1'],
            mode: 'upsert',
            clearBeforeImport: false,
            acceptClearRisk: false,
        });
        assert.deepEqual(arguments_, [
            'import',
            'myOrg/myBU',
            '--mode',
            'upsert',
            '--skip-empty-lines',
            '--de',
            'DE_Key_1',
        ]);
        assert.ok(!arguments_.includes('--format'), 'import must not include --format');
    });

    it('produces repeated --de for multiple keys', () => {
        const arguments_ = buildImportArguments('a/b', {
            deKeys: ['K1', 'K2'],
            mode: 'insert',
            clearBeforeImport: false,
            acceptClearRisk: false,
        });
        assert.ok(arguments_.includes('--de'));
        assert.deepEqual(
            arguments_.filter((_, index, a) => a[index - 1] === '--de'),
            ['K1', 'K2']
        );
    });

    it('appends --clear-before-import when requested', () => {
        const arguments_ = buildImportArguments('a/b', {
            deKeys: ['K'],
            mode: 'upsert',
            clearBeforeImport: true,
            acceptClearRisk: false,
        });
        assert.ok(arguments_.includes('--clear-before-import'));
        assert.ok(!arguments_.includes('--i-accept-clear-data-risk'));
    });

    it('appends both clear flags when risk is accepted', () => {
        const arguments_ = buildImportArguments('a/b', {
            deKeys: ['K'],
            mode: 'upsert',
            clearBeforeImport: true,
            acceptClearRisk: true,
        });
        assert.ok(arguments_.includes('--clear-before-import'));
        assert.ok(arguments_.includes('--i-accept-clear-data-risk'));
    });

    it('does not append clear flags when both are false', () => {
        const arguments_ = buildImportArguments('a/b', {
            deKeys: ['K'],
            mode: 'upsert',
            clearBeforeImport: false,
            acceptClearRisk: false,
        });
        assert.ok(!arguments_.includes('--clear-before-import'));
        assert.ok(!arguments_.includes('--i-accept-clear-data-risk'));
    });

    it('does not emit --api', () => {
        const arguments_ = buildImportArguments('a/b', {
            deKeys: ['K'],
            mode: 'upsert',
            clearBeforeImport: false,
            acceptClearRisk: false,
        });
        assert.ok(!arguments_.includes('--api'));
    });

    it('appends --backup-before-import when backupBeforeImport is true', () => {
        const arguments_ = buildImportArguments('a/b', {
            deKeys: ['K'],
            mode: 'upsert',
            clearBeforeImport: false,
            acceptClearRisk: false,
            backupBeforeImport: true,
        });
        assert.ok(arguments_.includes('--backup-before-import'));
        assert.ok(!arguments_.includes('--no-backup-before-import'));
    });

    it('appends --no-backup-before-import when backupBeforeImport is false', () => {
        const arguments_ = buildImportArguments('a/b', {
            deKeys: ['K'],
            mode: 'upsert',
            clearBeforeImport: false,
            acceptClearRisk: false,
            backupBeforeImport: false,
        });
        assert.ok(!arguments_.includes('--backup-before-import'));
        assert.ok(arguments_.includes('--no-backup-before-import'));
    });

    it('omits backup flags when backupBeforeImport is undefined', () => {
        const arguments_ = buildImportArguments('a/b', {
            deKeys: ['K'],
            mode: 'upsert',
            clearBeforeImport: false,
            acceptClearRisk: false,
        });
        assert.ok(!arguments_.includes('--backup-before-import'));
        assert.ok(!arguments_.includes('--no-backup-before-import'));
    });
});

describe('buildMultiBuExportArgs', () => {
    it('produces export with multiple --from flags', () => {
        const arguments_ = buildMultiBuExportArguments({
            fromCredBus: ['org/Dev', 'org/QA'],
            deKeys: ['DE1'],
            format: 'csv',
        });
        assert.equal(arguments_[0], 'export');
        assert.ok(
            !arguments_.includes('org/Dev') ||
                arguments_.indexOf('--from') < arguments_.indexOf('org/Dev')
        );
        assert.deepEqual(
            arguments_.filter((_, index, a) => a[index - 1] === '--from'),
            ['org/Dev', 'org/QA']
        );
        assert.deepEqual(
            arguments_.filter((_, index, a) => a[index - 1] === '--de'),
            ['DE1']
        );
    });

    it('supports --git', () => {
        const arguments_ = buildMultiBuExportArguments({
            fromCredBus: ['org/Dev'],
            deKeys: ['K'],
            format: 'csv',
            useGit: true,
        });
        assert.ok(arguments_.includes('--git'));
    });

    it('supports multiple DE keys', () => {
        const arguments_ = buildMultiBuExportArguments({
            fromCredBus: ['org/Dev'],
            deKeys: ['K1', 'K2'],
            format: 'tsv',
        });
        assert.deepEqual(
            arguments_.filter((_, index, a) => a[index - 1] === '--de'),
            ['K1', 'K2']
        );
    });

    it('appends --json-pretty when requested', () => {
        const arguments_ = buildMultiBuExportArguments({
            fromCredBus: ['org/Dev'],
            deKeys: ['K'],
            format: 'json',
            jsonPretty: true,
        });
        assert.ok(arguments_.includes('--json-pretty'));
    });

    it('does not append --json-pretty when not requested', () => {
        const arguments_ = buildMultiBuExportArguments({
            fromCredBus: ['org/Dev'],
            deKeys: ['K'],
            format: 'csv',
        });
        assert.ok(!arguments_.includes('--json-pretty'));
    });
});

describe('buildCrossBuImportArgs', () => {
    it('produces import with --from and multiple --to flags (no --format)', () => {
        const arguments_ = buildCrossBuImportArguments({
            fromCredBu: 'org/Dev',
            toCredBus: ['org/QA', 'org/Prod'],
            deKeys: ['DE1'],
            mode: 'upsert',
            clearBeforeImport: false,
            acceptClearRisk: false,
        });
        assert.equal(arguments_[0], 'import');
        assert.equal(arguments_[arguments_.indexOf('--from') + 1], 'org/Dev');
        assert.deepEqual(
            arguments_.filter((_, index, a) => a[index - 1] === '--to'),
            ['org/QA', 'org/Prod']
        );
        assert.deepEqual(
            arguments_.filter((_, index, a) => a[index - 1] === '--de'),
            ['DE1']
        );
        assert.ok(!arguments_.includes('--api'));
        assert.ok(!arguments_.includes('--format'), 'import must not include --format');
    });

    it('includes --clear-before-import when requested', () => {
        const arguments_ = buildCrossBuImportArguments({
            fromCredBu: 'org/Dev',
            toCredBus: ['org/QA'],
            deKeys: ['K'],
            mode: 'upsert',
            clearBeforeImport: true,
            acceptClearRisk: false,
        });
        assert.ok(arguments_.includes('--clear-before-import'));
        assert.ok(!arguments_.includes('--i-accept-clear-data-risk'));
    });

    it('includes both clear flags when risk is accepted', () => {
        const arguments_ = buildCrossBuImportArguments({
            fromCredBu: 'org/Dev',
            toCredBus: ['org/QA'],
            deKeys: ['K'],
            mode: 'upsert',
            clearBeforeImport: true,
            acceptClearRisk: true,
        });
        assert.ok(arguments_.includes('--clear-before-import'));
        assert.ok(arguments_.includes('--i-accept-clear-data-risk'));
    });

    it('does not include clear flags when both are false', () => {
        const arguments_ = buildCrossBuImportArguments({
            fromCredBu: 'org/Dev',
            toCredBus: ['org/QA'],
            deKeys: ['K'],
            mode: 'upsert',
            clearBeforeImport: false,
            acceptClearRisk: false,
        });
        assert.ok(!arguments_.includes('--clear-before-import'));
        assert.ok(!arguments_.includes('--i-accept-clear-data-risk'));
    });

    it('appends --backup-before-import when backupBeforeImport is true', () => {
        const arguments_ = buildCrossBuImportArguments({
            fromCredBu: 'org/Dev',
            toCredBus: ['org/QA'],
            deKeys: ['K'],
            mode: 'upsert',
            clearBeforeImport: false,
            acceptClearRisk: false,
            backupBeforeImport: true,
        });
        assert.ok(arguments_.includes('--backup-before-import'));
        assert.ok(!arguments_.includes('--no-backup-before-import'));
    });
});

describe('buildFileToMultiBuImportArgs', () => {
    it('produces import with --to flags and --file flags (no --from, no --format)', () => {
        const arguments_ = buildFileToMultiBuImportArguments({
            filePaths: ['/data/org/bu/My_DE.mcdata.2026-04-08T10-00-00Z.csv'],
            toCredBus: ['org/QA', 'org/Prod'],
            mode: 'upsert',
            clearBeforeImport: false,
            acceptClearRisk: false,
        });
        assert.equal(arguments_[0], 'import');
        assert.ok(!arguments_.includes('--from'), '--from must not appear in file mode');
        assert.ok(!arguments_.includes('--de'), '--de must not appear in file mode');
        assert.ok(!arguments_.includes('--format'), 'import must not include --format');
        assert.deepEqual(
            arguments_.filter((_, index, a) => a[index - 1] === '--to'),
            ['org/QA', 'org/Prod']
        );
        assert.deepEqual(
            arguments_.filter((_, index, a) => a[index - 1] === '--file'),
            ['/data/org/bu/My_DE.mcdata.2026-04-08T10-00-00Z.csv']
        );
    });

    it('supports multiple files', () => {
        const arguments_ = buildFileToMultiBuImportArguments({
            filePaths: ['/data/org/bu/DE1.mcdata.ts.csv', '/data/org/bu/DE2.mcdata.ts.csv'],
            toCredBus: ['org/QA'],
            mode: 'upsert',
            clearBeforeImport: false,
            acceptClearRisk: false,
        });
        assert.deepEqual(
            arguments_.filter((_, index, a) => a[index - 1] === '--file'),
            ['/data/org/bu/DE1.mcdata.ts.csv', '/data/org/bu/DE2.mcdata.ts.csv']
        );
    });

    it('appends --clear-before-import when requested', () => {
        const arguments_ = buildFileToMultiBuImportArguments({
            filePaths: ['/data/org/bu/K.mcdata.ts.csv'],
            toCredBus: ['org/QA'],
            mode: 'upsert',
            clearBeforeImport: true,
            acceptClearRisk: false,
        });
        assert.ok(arguments_.includes('--clear-before-import'));
        assert.ok(!arguments_.includes('--i-accept-clear-data-risk'));
    });

    it('appends --no-backup-before-import when backupBeforeImport is false', () => {
        const arguments_ = buildFileToMultiBuImportArguments({
            filePaths: ['/data/org/bu/K.mcdata.ts.csv'],
            toCredBus: ['org/QA'],
            mode: 'upsert',
            clearBeforeImport: false,
            acceptClearRisk: false,
            backupBeforeImport: false,
        });
        assert.ok(arguments_.includes('--no-backup-before-import'));
        assert.ok(!arguments_.includes('--backup-before-import'));
    });
});

describe('buildImportArgs — by file path', () => {
    it('produces --file flags instead of --de (no --format)', () => {
        const arguments_ = buildImportArguments('org/bu', {
            filePaths: ['/data/org/bu/My_DE.mcdata.2026-04-01T00-00-00Z.csv'],
            mode: 'upsert',
            clearBeforeImport: false,
            acceptClearRisk: false,
        });
        assert.ok(arguments_.includes('--file'));
        assert.ok(!arguments_.includes('--de'));
        assert.ok(!arguments_.includes('--format'), 'import must not include --format');
    });

    it('produces repeated --file for multiple files', () => {
        const arguments_ = buildImportArguments('org/bu', {
            filePaths: ['/a/file1.csv', '/b/file2.csv'],
            mode: 'upsert',
            clearBeforeImport: false,
            acceptClearRisk: false,
        });
        assert.deepEqual(
            arguments_.filter((_, index, a) => a[index - 1] === '--file'),
            ['/a/file1.csv', '/b/file2.csv']
        );
    });
});
