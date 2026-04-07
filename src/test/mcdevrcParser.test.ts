import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getCredentials, getBusinessUnits, type Mcdevrc } from '../mcdevrcParser';

const SAMPLE_MCDEVRC: Mcdevrc = {
    credentials: {
        production: {
            businessUnits: {
                ParentBU: 123456,
                ChildBU: 234567,
            },
        },
        sandbox: {
            businessUnits: {
                DevBU: 345678,
            },
        },
    },
};

describe('getCredentials', () => {
    it('returns all credential names', () => {
        assert.deepEqual(getCredentials(SAMPLE_MCDEVRC), ['production', 'sandbox']);
    });

    it('returns empty array when credentials is undefined', () => {
        assert.deepEqual(getCredentials({ credentials: undefined as unknown as Record<string, never> }), []);
    });

    it('returns empty array for an object with no credentials', () => {
        assert.deepEqual(getCredentials({ credentials: {} }), []);
    });
});

describe('getBusinessUnits', () => {
    it('returns all BU names for a credential', () => {
        assert.deepEqual(getBusinessUnits(SAMPLE_MCDEVRC, 'production'), ['ParentBU', 'ChildBU']);
    });

    it('returns the single BU for a credential with one entry', () => {
        assert.deepEqual(getBusinessUnits(SAMPLE_MCDEVRC, 'sandbox'), ['DevBU']);
    });

    it('returns empty array for an unknown credential', () => {
        assert.deepEqual(getBusinessUnits(SAMPLE_MCDEVRC, 'does-not-exist'), []);
    });

    it('returns empty array when businessUnits is undefined', () => {
        const rc: Mcdevrc = {
            credentials: {
                empty: { businessUnits: undefined as unknown as Record<string, number> },
            },
        };
        assert.deepEqual(getBusinessUnits(rc, 'empty'), []);
    });
});
