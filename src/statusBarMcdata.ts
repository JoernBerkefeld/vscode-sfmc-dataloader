import * as vscode from 'vscode';
import { buildMcdataStatusTooltipMarkdown } from './statusBarMcdataTooltip';
import {
    getActiveMcdataRunCount,
    getSfmcDataOutputChannel,
    onMcdataRunsChanged,
} from './sfmcDataOutput';

/**
 * Tooltip for the mcdata status bar item: Show Output link + Settings link (mcdev-style, no caching section).
 * @returns {vscode.MarkdownString} Markdown tooltip for hover
 */
export function buildMcdataStatusTooltip(): vscode.MarkdownString {
    const md = new vscode.MarkdownString(buildMcdataStatusTooltipMarkdown(), true);
    md.isTrusted = true;
    md.supportThemeIcons = true;
    return md;
}

/**
 * Registers the **mcdata** status bar entry (click + hover) and the **Show Output** command.
 * @param context - Extension context for subscriptions
 * @returns {void}
 */
export function registerMcdataStatusBar(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('sfmc-data.openOutputChannel', () => {
            getSfmcDataOutputChannel().show(true);
        })
    );

    const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    item.name = 'SFMC Data Loader — mcdata';
    const update = (): void => {
        const count = getActiveMcdataRunCount();
        item.text = count > 0 ? `$(sync~spin) mcdata (${count} active)` : '$(database) mcdata';
    };
    update();
    context.subscriptions.push(onMcdataRunsChanged(update));
    item.tooltip = buildMcdataStatusTooltip();
    item.command = 'sfmc-data.openOutputChannel';
    item.show();
    context.subscriptions.push(item);
}
