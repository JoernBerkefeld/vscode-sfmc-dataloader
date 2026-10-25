import { mcdataProcesses, type McdataProcessOutcome } from './mcdataProcessLifecycle';
import { getProjectConfiguration as getProjectConfig } from './config';
import { StringDecoder } from 'node:string_decoder';
import * as vscode from 'vscode';
import { mapMcdataRunStatus, trackCommandOutcome } from './commandTelemetry';
import { appendMcdataDebugArgument } from './mcdataDebugArguments';
import { resolveMcdataLaunch } from './mcdataPrefix';
import { buildMcdataCommandDisplay } from './mcdataShellCommand';
import type { McdataLaunch } from './mcdataResolve';
import { getSfmcDataOutputChannel } from './sfmcDataOutput';
import { getReporter } from './telemetry';

/**
 * Matches SFMC DevTools command result notifications.
 */
const MORE_DETAILS = 'More Details';

export type McdataRunOutcome = McdataProcessOutcome | { status: 'resolution_failed' };

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
 * @param options.suppressSuccessNotification - Lets init own its single actionable success notification.
 * @returns {Promise<McdataRunOutcome>} Actual process result, or resolution failure.
 */
export async function runMcdataWithProgress(
    context: vscode.ExtensionContext,
    projectRoot: string,
    arguments_: string[],
    options: {
        progressTitle: string;
        telemetryCommand: string;
        suppressSuccessNotification?: boolean;
    }
): Promise<McdataRunOutcome> {
    const startedAt = Date.now();
    const prefix = await resolveMcdataLaunch(context, projectRoot);
    if (prefix === undefined) {
        trackCommandOutcome(getReporter(), options.telemetryCommand, 'mcdataPrefixMissing', {
            durationMs: Date.now() - startedAt,
        });
        return { status: 'resolution_failed' };
    }

    const config = getProjectConfig(projectRoot);
    const isCreateDebugLog = config.get<boolean>('createDebugLog') === true;
    const finalArguments = appendMcdataDebugArgument(arguments_, isCreateDebugLog);

    const diagnostics = createSafeDiagnostics([...prefix.prefixArgs, ...finalArguments]);
    const commandLine = diagnostics.redact(
        buildMcdataCommandDisplay(prefix, diagnostics.display(finalArguments))
    );
    const outputChannel = getSfmcDataOutputChannel();

    const outcome = await vscode.window.withProgress<McdataProcessOutcome>(
        {
            location: vscode.ProgressLocation.Notification,
            title: options.progressTitle,
            cancellable: true,
        },
        async (progress, token) => {
            progress.report({ message: 'Running mcdata…' });
            outputChannel.appendLine(`⚡ ${commandLine}`);
            outputChannel.appendLine('');
            return executeMcdata(
                projectRoot,
                prefix,
                finalArguments,
                outputChannel,
                token,
                progress
            );
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
            if (options.suppressSuccessNotification) break;
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
    return outcome;
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

/**
Retains only a bounded tail even when a custom CLI never writes a newline.
 * @param onLine - Receives complete lines or bounded partial-line windows.
 * @returns {object} Bounded parser with append, flush and retained-state inspection.
 */
export function createBoundedProgressParser(onLine: (line: string) => void) {
    const limit = 1024;
    let pending = '';
    return {
        get retainedLength() {
            return pending.length;
        },
        append(text: string): void {
            // Scan fixed-size slices, not an ever-growing accumulated line.
            for (let offset = 0; offset < text.length; offset += limit) {
                const lines = (pending + text.slice(offset, offset + limit)).split(/\r?\n/);
                pending = lines.pop() ?? '';
                for (const line of lines) onLine(line);
                if (pending.length > limit) {
                    onLine(pending);
                    pending = pending.slice(-limit);
                }
            }
        },
        flush(): void {
            if (pending) onLine(pending);
            pending = '';
        },
    };
}

const SENSITIVE_FLAGS = new Set(['--client-id', '--client-secret']);

function display(values: string[]): string[] {
    let isHideNext = false;
    return values.map((value) => {
        if (isHideNext) {
            isHideNext = false;
            return '[REDACTED]';
        }
        const equal = value.indexOf('=');
        const flag = equal === -1 ? value : value.slice(0, equal);
        if (!SENSITIVE_FLAGS.has(flag)) return value;
        if (equal !== -1) return `${flag}=[REDACTED]`;
        isHideNext = true;
        return value;
    });
}

function createSafeDiagnostics(arguments_: string[]) {
    const secrets: string[] = [];
    for (let index = 0; index < arguments_.length; index++) {
        const value = arguments_[index];
        const equal = value.indexOf('=');
        if (SENSITIVE_FLAGS.has(equal === -1 ? value : value.slice(0, equal))) {
            const secret = equal === -1 ? arguments_[++index] : value.slice(equal + 1);
            if (secret) secrets.push(secret);
        }
    }
    const variants = [
        ...new Set(secrets.flatMap((secret) => [secret, JSON.stringify(secret).slice(1, -1)])),
    ].toSorted((left, right) => right.length - left.length);
    return {
        display,
        variants,
        redact: (text: string): string => {
            for (const secret of variants) text = text.replaceAll(secret, '[REDACTED]');
            return text;
        },
    };
}

function createSafeStream(
    diagnostics: ReturnType<typeof createSafeDiagnostics>,
    append: (text: string) => void
) {
    const decoder = new StringDecoder('utf8');
    let pending = '';
    const drain = (isFlush: boolean): void => {
        let offset = 0;
        const output: string[] = [];
        while (offset < pending.length) {
            const secret = diagnostics.variants.find((value) => pending.startsWith(value, offset));
            if (secret) {
                output.push('[REDACTED]');
                offset += secret.length;
            } else {
                if (
                    !isFlush &&
                    diagnostics.variants.some(
                        (value) =>
                            value.length > pending.length - offset &&
                            value.startsWith(pending.slice(offset))
                    )
                )
                    break;
                output.push(pending[offset++]);
            }
        }
        append(output.join(''));
        pending = pending.slice(offset);
    };
    return {
        append(chunk: Buffer): void {
            pending += decoder.write(chunk);
            drain(false);
        },
        flush(): void {
            pending += decoder.end();
            drain(true);
        },
    };
}

async function executeMcdata(
    cwd: string,
    launch: McdataLaunch,
    arguments_: string[],
    channel: vscode.OutputChannel,
    token: vscode.CancellationToken,
    progress: vscode.Progress<{ message?: string; increment?: number }>
): Promise<McdataProcessOutcome> {
    const diagnostics = createSafeDiagnostics([...launch.prefixArgs, ...arguments_]);
    const reportBatchFromLine = createBatchProgressLineHandler({
        report: (value) =>
            progress.report({
                ...value,
                message: value.message && diagnostics.redact(value.message),
            }),
    });
    const stdoutParser = createBoundedProgressParser(reportBatchFromLine);
    const stderrParser = createBoundedProgressParser(reportBatchFromLine);
    const stdout = createSafeStream(diagnostics, (text) => {
        channel.append(text);
        stdoutParser.append(text);
    });
    const stderr = createSafeStream(diagnostics, (text) => {
        channel.append(text);
        stderrParser.append(text);
    });
    const outcome = await mcdataProcesses.run({
        cwd,
        launch,
        arguments: arguments_,
        token,
        onStdout: stdout.append,
        onStderr: stderr.append,
    });
    stdout.flush();
    stderr.flush();
    stdoutParser.flush();
    stderrParser.flush();
    if (outcome.status === 'cancelled') {
        channel.appendLine('');
        channel.appendLine('Local process cancelled. Remote work already submitted may continue.');
    } else if (outcome.status === 'spawn_error') {
        const message = diagnostics.redact(outcome.message);
        channel.appendLine(message);
        // Never return the original Error: its stack/cause can contain raw argv.
        return { status: 'spawn_error', message, error: new Error(message) };
    }
    return outcome;
}
