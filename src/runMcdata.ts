import { spawn } from 'node:child_process';
import * as vscode from 'vscode';
import { resolveMcdataShellPrefix } from './mcdataPrefix';
import { buildMcdataShellCommandLine } from './mcdataShellCommand';
import { getSfmcDataOutputChannel } from './sfmcDataOutput';

/** Matches SFMC DevTools command result notifications. */
const MORE_DETAILS = 'More Details';

export type McdataRunOutcome =
    | { status: 'success' }
    | { status: 'failed'; exitCode: number | null }
    | { status: 'cancelled' }
    | { status: 'spawn_error'; message: string };

/**
 * Runs `mcdata` in a subprocess (no integrated terminal), logs to the extension output channel,
 * shows a cancellable notification while running, then non-modal success/error toasts with optional
 * **More Details** (opens the output channel).
 * @param context
 * @param projectRoot
 * @param args
 * @param options
 * @param options.progressTitle
 */
export async function runMcdataWithProgress(
    context: vscode.ExtensionContext,
    projectRoot: string,
    args: string[],
    options: { progressTitle: string }
): Promise<void> {
    const prefix = resolveMcdataShellPrefix(context, projectRoot);
    if (prefix === undefined) {
        return;
    }

    const commandLine = buildMcdataShellCommandLine(prefix, args);
    const outputChannel = getSfmcDataOutputChannel();

    const outcome = await vscode.window.withProgress<McdataRunOutcome>(
        {
            location: vscode.ProgressLocation.Notification,
            title: options.progressTitle,
            cancellable: true,
        },
        async (progress, token) => {
            progress.report({ message: 'Running mcdata…' });
            outputChannel.appendLine(`$ ${commandLine}`);
            outputChannel.appendLine('');
            return executeMcdataShell(projectRoot, commandLine, outputChannel, token);
        }
    );

    const openDetails = (): void => {
        outputChannel.show(true);
    };

    switch (outcome.status) {
        case 'success': {
            const choice = await vscode.window.showInformationMessage(
                'SFMC Data Loader: mcdata finished successfully.',
                MORE_DETAILS
            );
            if (choice === MORE_DETAILS) {
                openDetails();
            }
            break;
        }
        case 'failed': {
            const code = outcome.exitCode;
            const choice = await vscode.window.showErrorMessage(
                `SFMC Data Loader: mcdata exited with code ${code === null ? 'unknown' : String(code)}.`,
                MORE_DETAILS
            );
            if (choice === MORE_DETAILS) {
                openDetails();
            }
            break;
        }
        case 'cancelled': {
            const choice = await vscode.window.showWarningMessage(
                'SFMC Data Loader: mcdata was cancelled.',
                MORE_DETAILS
            );
            if (choice === MORE_DETAILS) {
                openDetails();
            }
            break;
        }
        case 'spawn_error': {
            const choice = await vscode.window.showErrorMessage(
                `SFMC Data Loader: failed to start mcdata (${outcome.message}).`,
                MORE_DETAILS
            );
            if (choice === MORE_DETAILS) {
                openDetails();
            }
            break;
        }
    }
}

function executeMcdataShell(
    cwd: string,
    commandLine: string,
    channel: vscode.OutputChannel,
    token: vscode.CancellationToken
): Promise<McdataRunOutcome> {
    return new Promise((resolve) => {
        const child = spawn(commandLine, {
            cwd,
            shell: true,
            windowsHide: true,
        });

        const cancellation = token.onCancellationRequested(() => {
            child.kill();
        });

        let settled = false;
        const finish = (outcome: McdataRunOutcome): void => {
            if (settled) {
                return;
            }
            settled = true;
            cancellation.dispose();
            resolve(outcome);
        };

        child.stdout?.on('data', (chunk: Buffer) => {
            channel.append(chunk.toString());
        });
        child.stderr?.on('data', (chunk: Buffer) => {
            channel.append(chunk.toString());
        });

        child.on('error', (err: Error) => {
            channel.appendLine(String(err));
            finish({ status: 'spawn_error', message: err.message });
        });

        child.on('close', (code: number | null) => {
            if (token.isCancellationRequested) {
                finish({ status: 'cancelled' });
                return;
            }
            if (code === 0) {
                finish({ status: 'success' });
            } else {
                finish({ status: 'failed', exitCode: code });
            }
        });
    });
}
