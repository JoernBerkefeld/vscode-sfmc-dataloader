import * as vscode from 'vscode';

const CHANNEL_NAME = 'SFMC Data Loader';

const state: { channel: vscode.OutputChannel | undefined } = { channel: undefined };
const runSequence = { nextId: 0 };
const activeRuns = new Set<number>();
const runListeners = new Set<() => void>();

export function getActiveMcdataRunCount(): number {
    return activeRuns.size;
}

export function onMcdataRunsChanged(listener: () => void): vscode.Disposable {
    runListeners.add(listener);
    return {
        dispose: () => {
            runListeners.delete(listener);
        },
    };
}

/**
 * Creates a lightweight run identity without retaining output or process ownership.
 * @returns {object} Run tag and idempotent completion handle.
 */
export function beginMcdataRun() {
    const id = ++runSequence.nextId;
    activeRuns.add(id);
    for (const listener of runListeners) listener();
    return {
        tag: `[run ${id}]`,
        dispose(): void {
            if (!activeRuns.delete(id)) return;
            for (const listener of runListeners) listener();
        },
    };
}

/**
 * Tags each redacted fragment, including partial lines, without buffering CLI output.
 * @param channel - Shared extension output.
 * @param tag - Unique run prefix.
 * @returns {object} Tagged append methods.
 */
export function createTaggedMcdataOutput(channel: vscode.OutputChannel, tag: string) {
    const append = (text: string): void => {
        if (!text) return;
        // Fragments deliberately end at a line boundary so concurrent writes cannot steal a tag.
        const lines = text.split(/\r\n|\r|\n/);
        if (lines.at(-1) === '') lines.pop();
        for (const line of lines) channel.appendLine(`${tag} ${line}`);
    };
    return { append, appendLine: (text: string) => channel.appendLine(`${tag} ${text}`) };
}

/**
 * Creates the extension output channel and registers disposal on deactivate.
 * @param context - VS Code extension context for subscription lifetime
 * @returns {vscode.OutputChannel} the **SFMC Data Loader** output channel
 */
export function registerSfmcDataOutput(context: vscode.ExtensionContext): vscode.OutputChannel {
    state.channel = vscode.window.createOutputChannel(CHANNEL_NAME);
    context.subscriptions.push(state.channel);
    return state.channel;
}

export function getSfmcDataOutputChannel(): vscode.OutputChannel {
    if (!state.channel) {
        throw new Error('SFMC Data output channel was not registered');
    }
    return state.channel;
}
