import { spawn } from 'node:child_process';
import * as vscode from 'vscode';
import { mapMcdataRunStatus, trackCommandOutcome } from './commandTelemetry';
import { appendMcdataDebugArgument } from './mcdataDebugArguments';
import { resolveMcdataShellPrefix } from './mcdataPrefix';
import { buildMcdataShellCommandLine } from './mcdataShellCommand';
import { getSfmcDataOutputChannel } from './sfmcDataOutput';
import { getReporter } from './telemetry';

/**
 * Matches SFMC DevTools command result notifications.
 */
const MORE_DETAILS = 'More Details';

export type McdataRunOutcome =
    | { status: 'success' }
    | { status: 'failed'; exitCode: number | null }
    | { status: 'cancelled' }
    | { status: 'spawn_error'; message: string; error?: Error };

/**
 * Runs `mcdata` in a subprocess (no integrated terminal), logs to the extension output channel,
 * shows a cancellable notification while running, then non-modal success/error toasts with optional
 * **More Details** (opens the output channel).
 * @param context - VS Code extension context (mcdata resolution + output channel)
 * @param projectRoot - absolute cwd for the mcdata subprocess
 * @param arguments_ - argv after the executable (subcommand and flags; `--debug` may be appended from settings)
 * @param options - notification UI and telemetry options
 * @param options.progressTitle - title shown on the cancellable progress notification
 * @param options.telemetryCommand - VS Code command id for command.executed / command.failed
 * @returns {Promise<void>}
 */
export async function runMcdataWithProgress(
    context: vscode.ExtensionContext,
    projectRoot: string,
    arguments_: string[],
    options: { progressTitle: string; telemetryCommand: string }
): Promise<void> {
    const startedAt = Date.now();
    const prefix = resolveMcdataShellPrefix(context, projectRoot);
    if (prefix === undefined) {
        trackCommandOutcome(getReporter(), options.telemetryCommand, 'mcdataPrefixMissing', {
            durationMs: Date.now() - startedAt,
        });
        return;
    }

    const config = vscode.workspace.getConfiguration('sfmcData');
    const isCreateDebugLog = config.get<boolean>('createDebugLog') === true;
    const finalArguments = appendMcdataDebugArgument(arguments_, isCreateDebugLog);

    const commandLine = buildMcdataShellCommandLine(prefix, finalArguments);
    const outputChannel = getSfmcDataOutputChannel();

    const outcome = await vscode.window.withProgress<McdataRunOutcome>(
        {
            location: vscode.ProgressLocation.Notification,
            title: options.progressTitle,
            cancellable: true,
        },
        async (progress, token) => {
            progress.report({ message: 'Running mcdata…' });
            outputChannel.appendLine(`⚡ ${commandLine}`);
            outputChannel.appendLine('');
            return executeMcdataShell(projectRoot, commandLine, outputChannel, token, progress);
        }
    );

    const extras: { durationMs: number; error?: Error; errorCode?: number | null } = {
        durationMs: Date.now() - startedAt,
    };
    if (outcome.status === 'failed') {
        extras.errorCode = outcome.exitCode;
    } else if (outcome.status === 'spawn_error') {
        extras.error = outcome.error;
    }
    trackCommandOutcome(
        getReporter(),
        options.telemetryCommand,
        mapMcdataRunStatus(outcome.status),
        extras
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

/**
 * Matches export (stdout) and import (stderr) batch lines from mcdata.
 */
const BATCH_PROGRESS = /\b(Downloading batch \d+ of \d+|Uploading batch \d+(?: of \d+)?)\b/;

export function createBatchProgressLineHandler(
    progress: vscode.Progress<{ message?: string; increment?: number }>
): (line: string) => void {
    return (line: string) => {
        const match = line.match(BATCH_PROGRESS);
        if (match) {
            progress.report({ message: match[1] });
        }
    };
}

function appendStreamLine(
    chunk: Buffer,
    buffer: { value: string },
    onLine: (line: string) => void
): void {
    buffer.value += chunk.toString();
    const lines = buffer.value.split(/\r?\n/);
    buffer.value = lines.pop() ?? '';
    for (const line of lines) {
        onLine(line);
    }
}

function flushStreamBuffer(buffer: { value: string }, onLine: (line: string) => void): void {
    if (!(buffer.value.length > 0)) {
        return;
    }

    onLine(buffer.value);
    buffer.value = '';
}

function executeMcdataShell(
    cwd: string,
    commandLine: string,
    channel: vscode.OutputChannel,
    token: vscode.CancellationToken,
    progress: vscode.Progress<{ message?: string; increment?: number }>
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

        let isSettled = false;
        const finish = (outcome: McdataRunOutcome): void => {
            if (isSettled) {
                return;
            }
            isSettled = true;
            cancellation.dispose();
            resolve(outcome);
        };

        const stdoutBuffer = { value: '' };
        const stderrBuffer = { value: '' };
        const reportBatchFromLine = createBatchProgressLineHandler(progress);

        child.stdout?.on('data', (chunk: Buffer) => {
            const text = chunk.toString();
            channel.append(text);
            appendStreamLine(chunk, stdoutBuffer, reportBatchFromLine);
        });
        child.stderr?.on('data', (chunk: Buffer) => {
            const text = chunk.toString();
            channel.append(text);
            appendStreamLine(chunk, stderrBuffer, reportBatchFromLine);
        });

        child.on('error', (error: Error) => {
            channel.appendLine(String(error));
            finish({ status: 'spawn_error', message: error.message, error });
        });

        child.on('close', (code: number | null) => {
            flushStreamBuffer(stdoutBuffer, reportBatchFromLine);
            flushStreamBuffer(stderrBuffer, reportBatchFromLine);
            if (token.isCancellationRequested) {
                channel.appendLine('');
                channel.appendLine('Process cancelled by user.');
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
