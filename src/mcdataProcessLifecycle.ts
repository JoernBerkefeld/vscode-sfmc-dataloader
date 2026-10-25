import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';
import path from 'node:path';
import type { McdataLaunch } from './mcdataResolve';

export type McdataProcessOutcome =
    | { status: 'success' }
    | { status: 'failed'; exitCode: number | null }
    | { status: 'cancelled' }
    | { status: 'spawn_error'; message: string; error?: Error };

export interface ProcessCancellation {
    readonly isCancellationRequested: boolean;
    onCancellationRequested(listener: () => void): { dispose(): void };
}

interface RunOptions {
    cwd: string;
    launch: McdataLaunch;
    arguments: string[];
    token: ProcessCancellation;
    onStdout(chunk: Buffer): void;
    onStderr(chunk: Buffer): void;
}

interface LifecycleDependencies {
    spawn?: (executable: string, arguments_: string[], options: SpawnOptions) => ChildProcess;
    platform?: NodeJS.Platform;
    terminateTree?: (pid: number) => Promise<void>;
    drainTimeoutMs?: number;
    terminationTimeoutMs?: number;
}

interface ActiveRun {
    cancel(): void;
    result: Promise<McdataProcessOutcome>;
}

/**
Owns only children started by this manager; never selects processes by name.
 */
export class McdataProcessLifecycle {
    private readonly active = new Set<ActiveRun>();
    private isDisposed = false;
    private readonly platform: NodeJS.Platform;

    constructor(private readonly dependencies: LifecycleDependencies = {}) {
        this.platform = dependencies.platform ?? process.platform;
    }

    /**
    Rejects new launches and requests termination of every currently owned run.
     */
    dispose(): void {
        this.isDisposed = true;
        for (const run of this.active) {
            run.cancel();
        }
    }

    /**
    Waits for bounded cancellation outcomes without claiming remote rollback.
     */
    async shutdown(): Promise<void> {
        this.dispose();
        await Promise.all([...this.active].map((run) => run.result));
    }

    /**
    Runs shell-free, retaining ownership until exit and tree termination complete.
     * @param options - Launch, cancellation and stream callbacks for this run.
     * @returns {Promise<McdataProcessOutcome>} Exactly one outcome, after confirmed termination or a bounded failure.
     */
    run(options: RunOptions): Promise<McdataProcessOutcome> {
        if (this.isDisposed || options.token.isCancellationRequested) {
            return Promise.resolve({ status: 'cancelled' });
        }

        let settle!: (outcome: McdataProcessOutcome) => void;
        // eslint-disable-next-line unicorn/prefer-promise-with-resolvers -- Extension hosts can predate Promise.withResolvers.
        const result = new Promise<McdataProcessOutcome>((resolve) => {
            settle = resolve;
        });
        let child: ChildProcess;
        try {
            child = (this.dependencies.spawn ?? spawn)(
                options.launch.executable,
                [...options.launch.prefixArgs, ...options.arguments],
                {
                    cwd: options.cwd,
                    shell: false,
                    windowsHide: true,
                    detached: this.platform !== 'win32',
                }
            );
        } catch (ex) {
            const error = ex instanceof Error ? ex : new Error(String(ex));
            return Promise.resolve({ status: 'spawn_error', message: error.message, error });
        }

        let isSettled = false;
        let isCancelled = false;
        let hasExited = false;
        let hasClosed = false;
        let isTerminating = false;
        let hasTerminatedTree = false;
        let exitCode: number | null = null;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const subscription: { current?: { dispose(): void } } = {};
        const run: ActiveRun = { cancel: () => cancel(), result };
        this.active.add(run);

        const release = (): void => {
            if (isSettled && hasExited && (!isTerminating || hasTerminatedTree)) {
                this.active.delete(run);
            }
        };
        const finish = (outcome: McdataProcessOutcome): void => {
            if (isSettled) {
                return;
            }
            isSettled = true;
            if (timer) {
                clearTimeout(timer);
            }
            subscription.current?.dispose();
            // A descendant may keep inherited handles open after the direct child exits.
            child.stdout?.destroy();
            child.stderr?.destroy();
            release();
            settle(outcome);
        };
        const completeCancellation = (): void => {
            if (!(hasExited && hasTerminatedTree)) {
                return;
            }

            finish({ status: 'cancelled' });
            release();
        };
        const cancel = (): void => {
            if (isCancelled || isSettled) {
                return;
            }
            isCancelled = true;
            if (timer) {
                clearTimeout(timer);
            }
            if (!child.pid) {
                // Node emits an error for failed spawn; there is no owned PID to kill.
                return;
            }
            if (hasExited && this.platform === 'win32') {
                // Once the parent exits Windows no longer guarantees its PID/tree identity.
                finish({
                    status: 'spawn_error',
                    message:
                        'mcdata already exited; descendant termination could not be confirmed.',
                });
                return;
            }
            isTerminating = true;
            timer = setTimeout(() => {
                finish({
                    status: 'spawn_error',
                    message: 'Could not confirm termination of the owned mcdata process tree.',
                });
            }, this.dependencies.terminationTimeoutMs ?? 6000);
            const terminate =
                this.dependencies.terminateTree ?? ((pid: number) => this.terminate(pid));
            void terminate(child.pid)
                .then(() => {
                    hasTerminatedTree = true;
                    completeCancellation();
                    release();
                })
                .catch(() => {
                    finish({
                        status: 'spawn_error',
                        message: 'Could not terminate the owned mcdata process tree.',
                    });
                });
        };

        child.stdout?.on('data', options.onStdout);
        child.stderr?.on('data', options.onStderr);
        child.on('error', (error: Error) => {
            if (!child.pid) {
                hasExited = true;
            }
            finish({ status: 'spawn_error', message: error.message, error });
        });
        child.on('exit', (code: number | null) => {
            hasExited = true;
            exitCode = code;
            release();
            if (isCancelled) {
                completeCancellation();
            } else if (!hasClosed && !isSettled) {
                timer = setTimeout(() => {
                    finish({
                        status: 'spawn_error',
                        message: 'mcdata exited but its inherited output pipes did not close.',
                    });
                }, this.dependencies.drainTimeoutMs ?? 1500);
            }
        });
        child.on('close', (code: number | null) => {
            hasClosed = true;
            hasExited = true;
            exitCode = code;
            if (isCancelled) {
                completeCancellation();
            } else {
                finish(exitCode === 0 ? { status: 'success' } : { status: 'failed', exitCode });
            }
            release();
        });
        subscription.current = options.token.onCancellationRequested(cancel);
        // Register first, then recheck so cancellation during spawn/subscription is not lost.
        if (options.token.isCancellationRequested || this.isDisposed) {
            cancel();
        }
        if (isSettled) {
            subscription.current.dispose();
        }
        return result;
    }

    // eslint-disable-next-line unicorn/consistent-class-member-order -- Keep platform-specific termination after the lifecycle state machine.
    private async terminate(pid: number): Promise<void> {
        if (this.platform === 'win32') {
            // /F with /T is one operation: killing the parent first loses tree ancestry.
            await new Promise<void>((resolve, reject) => {
                const killer = spawn(
                    path.join(
                        process.env.SystemRoot ?? String.raw`C:\Windows`,
                        'System32',
                        'taskkill.exe'
                    ),
                    ['/pid', String(pid), '/T', '/F'],
                    { shell: false, windowsHide: true, stdio: 'ignore' }
                );
                const timeout = setTimeout(() => {
                    killer.kill();
                    reject(new Error('Owned tree termination timed out'));
                }, 4000);
                killer.once('error', (error) => {
                    clearTimeout(timeout);
                    reject(error);
                });
                killer.once('close', (code) => {
                    clearTimeout(timeout);
                    if (code === 0) {
                        resolve();
                    } else {
                        reject(new Error('Owned tree termination failed'));
                    }
                });
            });
            return;
        }

        const hasSignalledGroup = (signal: NodeJS.Signals): boolean => {
            try {
                process.kill(-pid, signal);
                return true;
            } catch (ex) {
                if ((ex as NodeJS.ErrnoException).code === 'ESRCH') {
                    return false;
                }
                throw ex;
            }
        };
        if (!hasSignalledGroup('SIGTERM')) {
            return;
        }
        await new Promise<void>((resolve) => setTimeout(resolve, 250));
        hasSignalledGroup('SIGKILL');
    }
}

export const mcdataProcesses = new McdataProcessLifecycle();

/**
Registers the process manager for extension-lifetime disposal.
 * @param context - Extension lifetime registration container.
 * @param context.subscriptions - Disposables owned by this activation.
 */
export function registerMcdataProcessLifecycle(context: {
    subscriptions: { dispose(): void }[];
}): void {
    context.subscriptions.push(mcdataProcesses);
}
