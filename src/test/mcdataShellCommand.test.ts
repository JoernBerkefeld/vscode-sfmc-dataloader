import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildMcdataShellCommandLine } from '../mcdataShellCommand';

describe('buildMcdataShellCommandLine', () => {
    it('joins prefix and args without extra quotes when no spaces', () => {
        assert.equal(
            buildMcdataShellCommandLine('mcdata', ['export', 'a/b', '--de', 'Key1']),
            'mcdata export a/b --de Key1'
        );
    });

    it('quotes args that contain spaces', () => {
        assert.equal(
            buildMcdataShellCommandLine('node "C:/ext/mcdata.cjs"', [
                'import',
                'a/b',
                '--file',
                'C:/My Files/x.csv',
            ]),
            'node "C:/ext/mcdata.cjs" import a/b --file "C:/My Files/x.csv"'
        );
    });
});
