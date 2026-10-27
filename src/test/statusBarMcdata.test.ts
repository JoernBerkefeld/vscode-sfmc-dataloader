import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildMcdataStatusTooltipMarkdown } from '../statusBarMcdataTooltip';
import Module from 'node:module';
import type * as vscode from 'vscode';
import {
    beginMcdataRun,
    createTaggedMcdataOutput,
    getActiveMcdataRunCount,
} from '../sfmcDataOutput';

it('shows concurrent active counts and releases only each completed run', () => {
    const item = { text: '', show() {}, dispose() {} };
    const loadable = Module as typeof Module & {
        _load(request: string, parent: NodeModule | undefined, isMain: boolean): unknown;
    };
    const original = loadable._load.bind(Module);
    const file = require.resolve('../statusBarMcdata');
    delete require.cache[file];
    loadable._load = (request, parent, isMain) =>
        request === 'vscode'
            ? {
                  commands: { registerCommand: () => ({ dispose() {} }) },
                  window: { createStatusBarItem: () => item },
                  StatusBarAlignment: { Right: 2 },
                  MarkdownString: class {
                      constructor(readonly value: string) {}
                  },
              }
            : original(request, parent, isMain);
    const subscriptions: vscode.Disposable[] = [];
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- Reload with a native status bar boundary mock.
        const status = require('../statusBarMcdata') as typeof import('../statusBarMcdata');
        status.registerMcdataStatusBar({ subscriptions } as vscode.ExtensionContext);
        assert.equal(item.text, '$(database) mcdata');
        const first = beginMcdataRun();
        const second = beginMcdataRun();
        assert.notEqual(first.tag, second.tag);
        assert.equal(item.text, '$(sync~spin) mcdata (2 active)');
        first.dispose();
        first.dispose();
        assert.equal(item.text, '$(sync~spin) mcdata (1 active)');
        second.dispose();
        assert.equal(item.text, '$(database) mcdata');
        assert.equal(getActiveMcdataRunCount(), 0);
    } finally {
        for (const subscription of subscriptions) subscription.dispose();
        loadable._load = original;
        delete require.cache[file];
    }
});

it('keeps interleaved partial stdout and stderr fragments attributable without buffering', () => {
    const lines: string[] = [];
    const channel = {
        appendLine: (line: string) => {
            lines.push(line);
        },
    } as vscode.OutputChannel;
    const first = createTaggedMcdataOutput(channel, '[run 1]');
    const second = createTaggedMcdataOutput(channel, '[run 2]');
    first.append('partial');
    second.append('other\r\nline\n');
    first.append(' tail');
    first.append('');
    assert.deepEqual(lines, ['[run 1] partial', '[run 2] other', '[run 2] line', '[run 1]  tail']);
});

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
