import * as vscode from 'vscode';

/**
 * When `sfmcData.promptClearBeforeImport` is enabled, asks at the end of an
 * import flow whether to clear target DE rows (two-step: QuickPick + modal).
 */
export async function promptOptionalClearBeforeImport(): Promise<{
    clearBeforeImport: boolean;
    acceptClearRisk: boolean;
}> {
    const cfg = vscode.workspace.getConfiguration('sfmcData');
    if (!cfg.get<boolean>('promptClearBeforeImport')) {
        return { clearBeforeImport: false, acceptClearRisk: false };
    }

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

    if (!pick?.clear) {
        return { clearBeforeImport: false, acceptClearRisk: false };
    }

    const confirm = await vscode.window.showWarningMessage(
        'This deletes all existing rows in the target Data Extension(s) before the import. This cannot be undone.',
        { modal: true, detail: 'Only continue if you intend to replace the full contents of the DE.' },
        'Cancel',
        'I understand — continue'
    );

    if (confirm !== 'I understand — continue') {
        return { clearBeforeImport: false, acceptClearRisk: false };
    }

    return { clearBeforeImport: true, acceptClearRisk: true };
}
