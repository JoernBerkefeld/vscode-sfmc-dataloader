import * as vscode from 'vscode';
import { registerExportCommand } from './commands/exportDE';
import { registerImportCommand } from './commands/importDE';
import { registerExportMultiBUCommand } from './commands/exportDEMultiBU';
import { registerImportCrossBUCommand } from './commands/importDECrossBU';
import { registerContextExportCommand } from './commands/contextExportDE';
import { registerContextImportCommand } from './commands/contextImportDE';
import { registerContextImportToBUCommand } from './commands/contextImportToBU';
import { registerContextExportFromBUsCommand } from './commands/contextExportFromBUs';

export function activate(context: vscode.ExtensionContext): void {
    registerExportCommand(context);
    registerImportCommand(context);
    registerExportMultiBUCommand(context);
    registerImportCrossBUCommand(context);
    registerContextExportCommand(context);
    registerContextImportCommand(context);
    registerContextImportToBUCommand(context);
    registerContextExportFromBUsCommand(context);
}

export function deactivate(): void {
    // nothing to clean up
}
