import * as vscode from 'vscode';
import { registerExportCommand } from './commands/exportDE';
import { registerImportCommand } from './commands/importDE';

export function activate(context: vscode.ExtensionContext): void {
    registerExportCommand(context);
    registerImportCommand(context);
}

export function deactivate(): void {
    // nothing to clean up
}
