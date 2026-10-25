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
        assert.ok(display.startsWith('"node" "my script" ""'));
        assert.ok(display.includes(String.raw`"line\nbreak"`));
        assert.deepEqual(arguments_, before);
    });
});
