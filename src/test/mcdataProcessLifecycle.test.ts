import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { ChildProcess } from 'node:child_process';
import { mkdtemp, writeFile, readFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { describe, it } from 'node:test';
import { McdataProcessLifecycle, type ProcessCancellation } from '../mcdataProcessLifecycle';

// eslint-disable-next-line unicorn/prefer-event-target -- Fake Node child-process events use EventEmitter semantics.
class Cancellation extends EventEmitter implements ProcessCancellation {
    isCancellationRequested = false;
    onCancellationRequested(listener: () => void): { dispose(): void } {
        this.on('cancel', listener);
        return { dispose: () => this.off('cancel', listener) };
    }
    cancel(): void {
        this.isCancellationRequested = true;
        this.emit('cancel');
    }
}

function fakeChild(): ChildProcess {
    // eslint-disable-next-line unicorn/prefer-event-target -- Models Node ChildProcess, which is an EventEmitter.
    const child = new EventEmitter() as ChildProcess;
    Object.assign(child, { pid: 12345, stdout: new PassThrough(), stderr: new PassThrough() });
    return child;
}

function options(token = new Cancellation()) {
    return {
        cwd: process.cwd(),
        launch: { executable: process.execPath, prefixArgs: [] },
        arguments: [],
        token,
        onStdout: () => {},
        onStderr: () => {},
    };
}

describe('owned process lifecycle', () => {
    it('does not spawn before cancellation or after disposal', async () => {
        const manager = new McdataProcessLifecycle({ spawn: () => assert.fail('must not spawn') });
        const token = new Cancellation();
        token.cancel();
        assert.deepEqual(await manager.run(options(token)), { status: 'cancelled' });
        manager.dispose();
        assert.deepEqual(await manager.run(options()), { status: 'cancelled' });
    });

    it('waits for termination confirmation even if close arrives first', async () => {
        const child = fakeChild();
        let confirm!: () => void;
        let targeted = 0;
        const manager = new McdataProcessLifecycle({
            spawn: (_executable, _arguments, settings) => {
                assert.equal(settings.shell, false);
                assert.equal(settings.detached, true);
                return child;
            },
            platform: 'linux',
            terminateTree: (pid) => {
                targeted = pid;
                // eslint-disable-next-line unicorn/prefer-promise-with-resolvers -- Match supported extension-host Promise APIs.
                return new Promise<void>((done) => {
                    confirm = done;
                });
            },
        });
        const token = new Cancellation();
        let isSettled = false;
        const result = manager.run(options(token));
        void result.then(() => {
            isSettled = true;
        });
        token.cancel();
        child.emit('exit', 0);
        child.emit('close', 0);
        await delay(1);
        assert.equal(isSettled, false);
        assert.equal(targeted, child.pid);
        confirm();
        assert.deepEqual(await result, { status: 'cancelled' });
        child.emit('error', new Error('late event'));
        assert.deepEqual(await result, { status: 'cancelled' });
    });

    it('catches cancellation during subscription and disposal cancels active runs', async () => {
        for (const dispose of [false, true]) {
            const child = fakeChild();
            let kills = 0;
            const manager = new McdataProcessLifecycle({
                spawn: () => child,
                terminateTree: async () => {
                    kills++;
                    child.emit('exit', null);
                },
            });
            const token = new Cancellation();
            if (!dispose) {
                token.onCancellationRequested = () => {
                    token.isCancellationRequested = true;
                    return { dispose: () => {} };
                };
            }
            const result = manager.run(options(token));
            if (dispose) {
                manager.dispose();
            }
            assert.deepEqual(await result, { status: 'cancelled' });
            assert.equal(kills, 1);
            await manager.shutdown();
        }
    });

    it('reports success only after pipes close and handles asynchronous spawn failure', async () => {
        const child = fakeChild();
        const manager = new McdataProcessLifecycle({ spawn: () => child });
        let isSettled = false;
        const result = manager.run(options());
        void result.then(() => {
            isSettled = true;
        });
        child.emit('exit', 0);
        await delay(1);
        assert.equal(isSettled, false);
        child.emit('close', 0);
        assert.deepEqual(await result, { status: 'success' });
        const missing = fakeChild();
        Object.assign(missing, { pid: undefined });
        const failed = new McdataProcessLifecycle({ spawn: () => missing }).run(options());
        missing.emit('error', new Error('missing executable'));
        missing.emit('close', -1);
        assert.equal((await failed).status, 'spawn_error');
    });

    it('does not target a recycled Windows PID after observing parent exit', async () => {
        const child = fakeChild();
        const manager = new McdataProcessLifecycle({
            spawn: () => child,
            platform: 'win32',
            terminateTree: () => assert.fail('must not target an exited PID'),
        });
        const token = new Cancellation();
        const result = manager.run(options(token));
        child.emit('exit', 0);
        token.cancel();
        assert.equal((await result).status, 'spawn_error');
    });

    it('handles spawn exceptions, error/close ordering and nonzero exits once', async () => {
        const thrown = new McdataProcessLifecycle({
            spawn: () => {
                throw new Error('spawn failed');
            },
        });
        assert.equal((await thrown.run(options())).status, 'spawn_error');
        const child = fakeChild();
        const manager = new McdataProcessLifecycle({ spawn: () => child });
        const result = manager.run(options());
        child.emit('close', 7);
        child.emit('error', new Error('late'));
        assert.deepEqual(await result, { status: 'failed', exitCode: 7 });
    });

    it('never reports success when inherited pipes stay open or termination fails', async () => {
        const child = fakeChild();
        const manager = new McdataProcessLifecycle({ spawn: () => child, drainTimeoutMs: 5 });
        const result = manager.run(options());
        child.emit('exit', 0);
        assert.equal((await result).status, 'spawn_error');
        assert.equal(child.stdout?.destroyed, true);
        const token = new Cancellation();
        const failing = new McdataProcessLifecycle({
            spawn: () => fakeChild(),
            terminateTree: async () => {
                throw new Error('denied');
            },
        });
        const failed = failing.run(options(token));
        token.cancel();
        assert.equal((await failed).status, 'spawn_error');
    });

    it('bounds an unconfirmed termination without claiming cancellation success', async () => {
        const token = new Cancellation();
        const manager = new McdataProcessLifecycle({
            spawn: () => fakeChild(),
            terminateTree: () => new Promise<void>(() => {}),
            terminationTimeoutMs: 5,
        });
        const result = manager.run(options(token));
        token.cancel();
        assert.equal((await result).status, 'spawn_error');
    });

    it('terminates a real parent and heartbeat descendant', { timeout: 15000 }, async () => {
        const isValid = (value: string | undefined): boolean =>
            !!value &&
            path.isAbsolute(value) &&
            path
                .resolve(value)
                .replace(/[\\/]+$/, '')
                .toLowerCase() === String.raw`f:\temp`;
        assert.ok(isValid(process.env.TEMP) && isValid(tmpdir()));
        assert.ok([process.env.TMP, process.env.TMPDIR].every((value) => !value || isValid(value)));
        const root = await mkdtemp(path.join(tmpdir(), 'mcdata-lifecycle-'));
        const marker = path.join(root, 'owner');
        const heartbeat = path.join(root, 'heartbeat');
        const parent = path.join(root, 'parent.cjs');
        const descendant = path.join(root, 'child.cjs');
        await writeFile(marker, randomUUID());
        await writeFile(
            descendant,
            `const fs=require('node:fs');const beat=()=>fs.appendFileSync(process.argv[2],'.');beat();setInterval(beat,40);setTimeout(()=>process.exit(0),10000);`
        );
        await writeFile(
            parent,
            `const {spawn}=require('node:child_process');spawn(process.execPath,[process.argv[2],process.argv[3]],{stdio:'inherit'});setInterval(()=>{},100);setTimeout(()=>process.exit(0),10000);`
        );
        const manager = new McdataProcessLifecycle();
        const token = new Cancellation();
        const result = manager.run({
            ...options(token),
            arguments: [parent, descendant, heartbeat],
        });
        try {
            let before = '';
            for (let attempt = 0; attempt < 100; attempt++) {
                try {
                    before = await readFile(heartbeat, 'utf8');
                } catch {
                    /*
                    Wait for first beat.
                    */
                }
                if (before.length >= 2) {
                    break;
                }
                await delay(40);
            }
            assert.ok(before.length >= 2, 'descendant heartbeat started');
            token.cancel();
            assert.deepEqual(await result, { status: 'cancelled' });
            const stopped = await readFile(heartbeat, 'utf8');
            await delay(250);
            assert.equal(
                await readFile(heartbeat, 'utf8'),
                stopped,
                'descendant heartbeat stopped'
            );
        } finally {
            await manager.shutdown();
            // Only known files and an empty owned root; never recursively delete fixtures.
            for (const path of [heartbeat, parent, descendant, marker]) {
                try {
                    await unlink(path);
                } catch (ex) {
                    if ((ex as NodeJS.ErrnoException).code !== 'ENOENT') {
                        // eslint-disable-next-line no-unsafe-finally -- Cleanup errors must fail this safety regression, never be hidden.
                        throw ex;
                    }
                }
            }
            await rmdir(root);
        }
    });
});
