import * as vscode from 'vscode';

const CHANNEL_NAME = 'SFMC Data Loader';

let channel: vscode.OutputChannel | undefined;

/**
 * Creates the extension output channel and registers disposal on deactivate.
 * @param context
 */
export function registerSfmcDataOutput(context: vscode.ExtensionContext): vscode.OutputChannel {
    channel = vscode.window.createOutputChannel(CHANNEL_NAME);
    context.subscriptions.push(channel);
    return channel;
}

export function getSfmcDataOutputChannel(): vscode.OutputChannel {
    if (!channel) {
        throw new Error('SFMC Data output channel was not registered');
    }
    return channel;
}
