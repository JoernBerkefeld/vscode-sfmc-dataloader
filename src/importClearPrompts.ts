import * as vscode from 'vscode';
import { statSync } from 'node:fs';

/**
Exact submitted project and argv, captured before any safety prompt.
 */
export interface ImportIntent {
    readonly projectRoot: string;
    readonly arguments: readonly string[];
}

/**
 * Captures immutable execution inputs rather than retaining live selections/settings.
 * @param projectRoot - Selected project directory.
 * @param arguments_ - Fully built non-destructive import arguments.
 * @returns {ImportIntent} Frozen submitted operation.
 */
export function captureImportIntent(projectRoot: string, arguments_: string[]): ImportIntent {
    return Object.freeze({ projectRoot, arguments: Object.freeze([...arguments_]) });
}

/**
 * Confirms the submitted operation and optionally requires typed destructive consent.
 * @param config - Settings captured for the selected project.
 * @param intent - Immutable project and argv used for both display and execution.
 * @returns {Promise<{ clearBeforeImport: boolean; acceptClearRisk: boolean } | undefined>} Clear flags, or undefined on cancellation or unreadable explicit files.
 */
export async function promptOptionalClearBeforeImport(
    config: vscode.WorkspaceConfiguration,
    intent: ImportIntent
): Promise<{ clearBeforeImport: boolean; acceptClearRisk: boolean } | undefined> {
    const values = (flag: string) =>
        intent.arguments.flatMap((value, index) =>
            value === flag ? [intent.arguments[index + 1]] : []
        );
    const files = values('--file');
    const targets = values('--to');
    if (targets.length === 0) targets.push(intent.arguments[1]);
    const detail = `Commence import into BU:\n${[...new Set(targets)].map((target) => `• ${target}`).join('\n')}`;

    if (files.length) {
        let sizes: number[];
        try {
            sizes = files.map((file) => statSync(file).size);
        } catch {
            void vscode.window.showErrorMessage(
                'Cannot inspect an import file. Check that every selected file is accessible and try again.'
            );
            return undefined;
        }
        if (sizes.some((size) => size >= 1024 ** 3)) {
            await vscode.window.showInformationMessage(
                'At least one selected file is 1 GiB or larger.',
                {
                    modal: true,
                    detail: `${detail}\nLarge imports can take a long time. Keep VS Code open and stay connected until the job finishes.`,
                },
                { title: 'OK', isCloseAffordance: true }
            );
        }
    }

    let isClear = false;
    if (config.get<boolean>('promptClearBeforeImport')) {
        const pick = await vscode.window.showQuickPick<{ label: string; clear: boolean }>(
            [
                { label: 'No (keep existing rows)', clear: false },
                { label: 'Yes, delete existing rows before import', clear: true },
            ],
            {
                title: 'Clear target Data Extension rows first?',
                placeHolder: 'Choose whether to delete existing rows before import',
            }
        );
        if (pick === undefined) return undefined;
        isClear = pick.clear;
    }

    const confirm = await vscode.window.showWarningMessage(
        'Import Confirmation',
        {
            modal: true,
            detail,
        },
        { title: 'Continue' },
        { title: 'Cancel', isCloseAffordance: true }
    );
    if (confirm?.title !== 'Continue') return undefined;
    if (isClear) {
        const acknowledgement = await vscode.window.showInputBox({
            title: 'Acknowledge target row deletion',
            prompt: `${detail}\nType CLEAR to acknowledge irreversible deletion of all existing target rows.`,
            placeHolder: 'CLEAR',
            ignoreFocusOut: true,
            validateInput: (value) =>
                value === 'CLEAR' ? undefined : 'Type CLEAR exactly, or cancel the import.',
        });
        if (acknowledgement !== 'CLEAR') return undefined;
    }
    return { clearBeforeImport: isClear, acceptClearRisk: isClear };
}
