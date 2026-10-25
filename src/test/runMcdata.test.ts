import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createBatchProgressLineHandler } from '../runMcdata';

describe('createBatchProgressLineHandler', () => {
    it('reports streaming uploads without inventing totals or percentage increments', () => {
        const reports: { message?: string; increment?: number }[] = [];
        const onLine = createBatchProgressLineHandler({
            report: (value) => {
                reports.push(value);
            },
        });
        onLine('info: Uploading batch 1');
        onLine('info: Uploading batch 2');
        assert.deepEqual(reports, [
            { message: 'Uploading batch 1' },
            { message: 'Uploading batch 2' },
        ]);
    });

    it('preserves legacy upload totals', () => {
        const reports: { message?: string; increment?: number }[] = [];
        const onLine = createBatchProgressLineHandler({
            report: (value) => {
                reports.push(value);
            },
        });
        onLine('info: Uploading batch 2 of 5 (4000 rows)');
        assert.deepEqual(reports, [{ message: 'Uploading batch 2 of 5' }]);
    });

    it('preserves download totals and ignores downloads without totals', () => {
        const reports: { message?: string; increment?: number }[] = [];
        const onLine = createBatchProgressLineHandler({
            report: (value) => {
                reports.push(value);
            },
        });
        onLine('info: Downloading batch 3 of 7');
        onLine('info: Downloading batch 4');
        onLine('info: Import completed');
        assert.deepEqual(reports, [{ message: 'Downloading batch 3 of 7' }]);
    });
});
