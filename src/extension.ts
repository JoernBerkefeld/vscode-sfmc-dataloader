import * as vscode from 'vscode';
import { checkAndShowWhatsNew, showWhatsNewPanel } from './whatsNew';
import { registerExportCommand } from './commands/exportDE';
import { registerImportCommand } from './commands/importDE';
import { registerExportMultiBUCommand } from './commands/exportDEMultiBU';
import { registerImportCrossBUCommand } from './commands/importDECrossBU';
import { registerContextExportCommand } from './commands/contextExportDE';
import { registerContextImportCommand } from './commands/contextImportDE';
import { registerContextImportToBUCommand } from './commands/contextImportToBU';
import { registerContextExportFromBUsCommand } from './commands/contextExportFromBUs';

const EXTENSION_DISPLAY_NAME = 'SFMC Data Loader';

export function activate(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('sfmc-data.showWhatsNew', () =>
            showWhatsNewPanel(context, EXTENSION_DISPLAY_NAME),
        ),
    );
    void checkAndShowWhatsNew(context, EXTENSION_DISPLAY_NAME);

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
