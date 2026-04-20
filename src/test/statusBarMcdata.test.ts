import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildMcdataStatusTooltipMarkdown } from '../statusBarMcdataTooltip';

describe('buildMcdataStatusTooltipMarkdown', () => {
    it('includes Show Output command and settings query', () => {
        const value = buildMcdataStatusTooltipMarkdown();
        assert.match(value, /sfmc-data\.openOutputChannel/);
        assert.ok(value.includes('workbench.action.openSettings'));
        assert.ok(value.includes('joernberkefeld.sfmc-data'));
    });

    it('does not include a caching section header', () => {
        const value = buildMcdataStatusTooltipMarkdown();
        assert.ok(!value.includes('**Caching**'));
    });
});
