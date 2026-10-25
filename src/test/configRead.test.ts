import assert from 'node:assert/strict';
import filesystem from 'node:fs';
import path from 'node:path';
import { describe, it, mock } from 'node:test';
import { readProjectConfig, readMcdevrc } from '../config';

const root = path.resolve('config-reader-project');

describe('public project config reader', () => {
    for (const filename of ['.mcdevrc.json', '.mcdatarc.json']) {
        it(`sanitizes malformed ${filename} through both public readers`, () => {
            const exists = mock.method(
                filesystem,
                'existsSync',
                (candidate: string) => candidate === path.join(root, filename)
            );
            const read = mock.method(
                filesystem,
                'readFileSync',
                () => '{"SECRET_JSON_SENTINEL_DO_NOT_DISCLOSE":}'
            );
            try {
                for (const reader of [readProjectConfig, readMcdevrc]) {
                    assert.throws(
                        () => reader(root),
                        (error: unknown) => {
                            assert.ok(error instanceof Error);
                            assert.equal(
                                error.message,
                                `Invalid JSON in ${filename}. Fix the file and try again.`
                            );
                            assert.equal(error.cause, undefined);
                            assert.doesNotMatch(
                                String(error),
                                /SECRET_JSON_SENTINEL_DO_NOT_DISCLOSE/
                            );
                            return true;
                        }
                    );
                }
            } finally {
                exists.mock.restore();
                read.mock.restore();
            }
        });

        it(`preserves valid ${filename} and mcdev precedence when both files exist`, () => {
            const config = { credentials: { org: { eid: 100, businessUnits: { bu: 101 } } } };
            const exists = mock.method(
                filesystem,
                'existsSync',
                () => filename === '.mcdevrc.json'
            );
            const read = mock.method(filesystem, 'readFileSync', (candidate: string) => {
                assert.equal(candidate, path.join(root, filename));
                return JSON.stringify(config);
            });
            try {
                assert.deepEqual(readProjectConfig(root), config);
            } finally {
                exists.mock.restore();
                read.mock.restore();
            }
        });
    }
});
