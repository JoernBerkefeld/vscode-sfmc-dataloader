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
import { registerInitProjectCommand } from './commands/initProject';
import { registerRefreshDeCacheCommand } from './commands/refreshDeCache';
import { registerSfmcDataOutput } from './sfmcDataOutput';
import { registerMcdataStatusBar } from './statusBarMcdata';

const EXTENSION_DISPLAY_NAME = 'SFMC Data Loader';

export function activate(context: vscode.ExtensionContext): void {
    registerSfmcDataOutput(context);
    registerMcdataStatusBar(context);

    context.subscriptions.push(
        vscode.commands.registerCommand('sfmc-data.showWhatsNew', () =>
            showWhatsNewPanel(context, EXTENSION_DISPLAY_NAME)
        )
    );
    void checkAndShowWhatsNew(context, EXTENSION_DISPLAY_NAME);

    registerInitProjectCommand(context);
    registerRefreshDeCacheCommand(context);
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
