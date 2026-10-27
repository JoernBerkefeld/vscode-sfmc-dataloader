import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { describe, it } from 'node:test';
import { buildMcdataCommandDisplay } from '../mcdataShellCommand';

const arguments_ = [
    '',
    'A&B',
    'a|b',
    '>file',
    '<file',
    '^caret',
    '%PATH%',
    '!name!',
    '$(echo nope)',
    '; exit',
    '"quoted"',
    "single'quote",
    'trailing\\',
    'space and slash\\',
    'Grüße 世界',
    'line\nbreak',
    'carriage\rreturn',
];
const launch = {
    executable: process.execPath,
    prefixArgs: ['-e', 'process.stdout.write(JSON.stringify(process.argv.slice(1)))', '--'],
};

describe('literal argv delivery', () => {
    it('round trips difficult arguments through shell-free spawn', async () => {
        const child = spawn(launch.executable, [...launch.prefixArgs, ...arguments_], {
            shell: false,
            windowsHide: true,
        });
        let output = '';
        child.stdout.on('data', (chunk: Buffer) => {
            output += chunk.toString();
        });
        await new Promise<void>((resolve, reject) => {
            child.on('error', reject);
            child.on('close', (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`exit ${code}`));
                }
            });
        });
        assert.deepEqual(JSON.parse(output), arguments_);
    });
    it('round trips through the shell-free execFile version-probe API', async () => {
        const { stdout } = await promisify(execFile)(
            launch.executable,
            [...launch.prefixArgs, ...arguments_],
            { shell: false, windowsHide: true }
        );
        assert.deepEqual(JSON.parse(stdout), arguments_);
    });
    it('builds display text separately without mutating execution argv', () => {
        const before = [...arguments_];
        const display = buildMcdataCommandDisplay(
            { executable: 'node', prefixArgs: ['my script'] },
            arguments_
        );
        assert.ok(display.startsWith('⚡ mcdata ""'));
        assert.ok(!display.includes('node'));
        assert.ok(!display.includes('my script'));
        assert.ok(display.includes(String.raw`"line\nbreak"`));
        assert.deepEqual(arguments_, before);
    });
    it('shows ordinary CLI tokens without quotes or launcher internals', () => {
        assert.equal(
            buildMcdataCommandDisplay(launch, [
                'export',
                'R1/DEV',
                '--format',
                'csv',
                '--git',
                '--de',
                'MCV_Talent_Details',
                '--debug',
            ]),
            '⚡ mcdata export R1/DEV --format csv --git --de MCV_Talent_Details --debug'
        );
        assert.equal(buildMcdataCommandDisplay(launch, []), '⚡ mcdata');
        assert.equal(
            buildMcdataCommandDisplay(launch, ['file-name.csv', '--format=csv', 'Grüße世界']),
            '⚡ mcdata file-name.csv --format=csv Grüße世界'
        );
    });
    it('JSON-quotes empty, whitespace, control, quote and shell-special tokens', () => {
        for (const argument of [
            ...arguments_,
            'tab\tvalue',
            'null\u{0}value',
            'delete\u{7F}value',
            'control\u{85}value',
            '`command`',
            '(group)',
            '{group}',
            '[pattern]',
            '*',
            '?',
            '#comment',
            '~home',
        ]) {
            assert.equal(
                buildMcdataCommandDisplay(launch, [argument]),
                `⚡ mcdata ${JSON.stringify(argument)}`
            );
        }
    });
});
