import * as vscode from 'vscode';
import { readProjectConfig } from './config';
import { createDeCacheIdentity, getDeCacheForBu } from './deCache';
import { refreshDeCacheForBu } from './commands/refreshDeCache';

/**
 * Parses customer keys without treating comma-only input as a selection.
 * @param value - Comma-separated customer keys.
 * @returns {string[]} Nonempty, trimmed keys.
 */
export function parseDeKeys(value: string): string[] {
    return value
        .split(',')
        .map((key) => key.trim())
        .filter(Boolean);
}

/**
 * Prompts for manual keys and checks the parsed result even when host validation is bypassed.
 * @param title - Operation-specific prompt title.
 * @returns {Promise<string[] | undefined>} Keys, or undefined on cancellation/empty input.
 */
export async function promptDeKeys(title: string): Promise<string[] | undefined> {
    const input = await vscode.window.showInputBox({
        title,
        prompt: 'Enter one or more DE customer keys (comma-separated)',
        placeHolder: 'My_DE_Key, Another_DE_Key',
        ignoreFocusOut: true,
        validateInput: (value) =>
            parseDeKeys(value).length > 0 ? undefined : 'At least one DE key is required',
    });
    const keys = parseDeKeys(input ?? '');
    return keys.length > 0 ? keys : undefined;
}

/**
 * Reuses the searchable project/account-scoped cache, retaining manual entry.
 * @param projectRoot - Selected project.
 * @param credential - Credential supplying the DE list.
 * @param bu - BU supplying the DE list.
 * @param title - Operation-specific picker title.
 * @param listDescription - Explains which BU/files this list represents.
 * @returns {Promise<string[] | undefined>} Selected keys, or undefined when dismissed.
 */
export async function selectDeKeys(
    projectRoot: string,
    credential: string,
    bu: string,
    title: string,
    listDescription: string
): Promise<string[] | undefined> {
    const source = await vscode.window.showQuickPick(
        [
            {
                label: '$(list-unordered) From DE list',
                description: listDescription,
                source: 'list',
            },
            {
                label: '$(edit) Enter DE keys manually',
                description: 'Comma-separated customer keys (advanced)',
                source: 'manual',
            },
        ],
        { title, placeHolder: 'How do you want to provide DE customer keys?' }
    );
    if (!source) return undefined;
    if (source.source === 'manual') return promptDeKeys(title);

    try {
        const identity = createDeCacheIdentity(
            projectRoot,
            readProjectConfig(projectRoot),
            credential,
            bu
        );
        let cached = getDeCacheForBu(identity);
        if (cached === undefined) {
            await refreshDeCacheForBu(identity);
            cached = getDeCacheForBu(identity);
        }
        if (!cached?.length) {
            void vscode.window.showErrorMessage(
                `No Data Extensions found for ${credential}/${bu}. Run SFMC Data: Refresh DE Cache to retry, or restart this command and enter DE keys manually.`
            );
            return undefined;
        }
        const selected = await vscode.window.showQuickPick(
            [...cached]
                .toSorted((a, b) =>
                    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
                )
                .map((item) => ({
                    label: item.name === item.key ? item.name : `${item.name} (${item.key})`,
                    deKey: item.key,
                })),
            {
                title,
                placeHolder: `${listDescription} — Filter by name or key, then select one or more`,
                canPickMany: true,
            }
        );
        return selected?.length ? selected.map((item) => item.deKey) : undefined;
    } catch (ex) {
        const message = ex instanceof Error ? ex.message : String(ex);
        void vscode.window.showErrorMessage(
            `Failed to load DE list: ${message}. Run SFMC Data: Refresh DE Cache to retry, or restart this command and enter DE keys manually.`
        );
        return undefined;
    }
}
