import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { appendMcdataDebugArg } from '../mcdataDebugArgs';

describe('appendMcdataDebugArg', () => {
    it('returns a copy unchanged when disabled', () => {
        const args = ['export', 'a/b', '--de', 'K'];
        const out = appendMcdataDebugArg(args, false);
        assert.deepEqual(out, args);
        assert.notStrictEqual(out, args);
    });

    it('appends --debug when enabled', () => {
        const out = appendMcdataDebugArg(['import', 'a/b', '--file', 'x.csv'], true);
        assert.deepEqual(out, ['import', 'a/b', '--file', 'x.csv', '--debug']);
    });

    it('does not duplicate --debug', () => {
        const out = appendMcdataDebugArg(['export', 'a/b', '--debug', '--de', 'K'], true);
        assert.deepEqual(out, ['export', 'a/b', '--debug', '--de', 'K']);
    });
});
