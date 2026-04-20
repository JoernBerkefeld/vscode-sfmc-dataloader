import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import { clearDeCache, getDeCacheForBu, hasDeCacheForBu, setDeCacheBu } from '../deCache';

describe('deCache', () => {
    beforeEach(() => {
        clearDeCache();
    });

    it('stores and reads items per credential and BU', () => {
        assert.equal(hasDeCacheForBu('c1', 'bu1'), false);
        setDeCacheBu('c1', 'bu1', [
            { name: 'A', key: 'k_a' },
            { name: 'B', key: 'k_b' },
        ]);
        assert.equal(hasDeCacheForBu('c1', 'bu1'), true);
        assert.deepEqual(getDeCacheForBu('c1', 'bu1'), [
            { name: 'A', key: 'k_a' },
            { name: 'B', key: 'k_b' },
        ]);
    });

    it('hasDeCacheForBu is false when list is empty', () => {
        setDeCacheBu('c1', 'bu1', []);
        assert.equal(hasDeCacheForBu('c1', 'bu1'), false);
    });

    it('clearDeCache removes all entries', () => {
        setDeCacheBu('c1', 'bu1', [{ name: 'X', key: 'k' }]);
        clearDeCache();
        assert.equal(hasDeCacheForBu('c1', 'bu1'), false);
    });
});
