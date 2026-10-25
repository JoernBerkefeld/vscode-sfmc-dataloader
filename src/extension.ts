import { execFile } from 'node:child_process';
import { mcdataProcesses, registerMcdataProcessLifecycle } from './mcdataProcessLifecycle';
import { promisify } from 'node:util';
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
import { findProjectRoot, getProjectConfiguration as getProjectConfig } from './config';
import { buildMcdataLaunch, normalizeMcdataSource, type McdataSource } from './mcdataResolve';
import { getProjectFlags } from './projectFlags';
import { registerSfmcDataOutput } from './sfmcDataOutput';
import { registerMcdataStatusBar } from './statusBarMcdata';
import { TelemetryReporter, detectEcosystem, getReporter, setReporter } from './telemetry';

const execFileAsync = promisify(execFile);

const EXTENSION_DISPLAY_NAME = 'SFMC Data Loader';
const EXTENSION_TELEMETRY_NAME = 'sfmc-data';
const EXTENSION_ID = 'joernberkefeld.sfmc-data';
const MCDATA_VERSION_TIMEOUT_MS = 8000;
const MCDATA_VERSION_PATTERN = /\b(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\b/;

const session = { hasTrackedMcdataVersion: false };

export function activate(context: vscode.ExtensionContext): void {
    registerMcdataProcessLifecycle(context);
    const reporter = new TelemetryReporter({
        extensionName: EXTENSION_TELEMETRY_NAME,
        extensionVersion: context.extension.packageJSON.version,
    });
    context.subscriptions.push(reporter);
    setReporter(reporter);

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

    const mcdataSource = normalizeMcdataSource(
        vscode.workspace.getConfiguration('sfmcData').get<string>('mcdataSource')
    );
    reporter.track('extension.activated', {
        ...detectEcosystem(EXTENSION_ID),
        ...getProjectFlags(vscode.workspace.workspaceFolders),
        mcdataSource,
    });
    void trackMcdataVersionOnce(context);
}

export async function deactivate(): Promise<void> {
    await mcdataProcesses.shutdown();
    await getReporter()?.disposeAsync();
    setReporter(undefined);
}

/**
 * Emits `mcdata.version` once per session. Does not block activation.
 * Uses `buildMcdataLaunch` (equivalent of `resolveMcdataLaunch`) so a
 * failed lookup never toasts. Version is omitted on failure; paths are never sent.
 * @param context - Extension context used to resolve the bundled CLI path.
 */
async function trackMcdataVersionOnce(context: vscode.ExtensionContext): Promise<void> {
    if (!vscode.env.isTelemetryEnabled || session.hasTrackedMcdataVersion) {
        return;
    }
    session.hasTrackedMcdataVersion = true;

    const projectRoot =
        findProjectRoot(vscode.workspace.workspaceFolders) ??
        vscode.workspace.workspaceFolders?.find((folder) => folder.uri.scheme === 'file')?.uri
            .fsPath ??
        context.extensionPath;
    const config = getProjectConfig(projectRoot);
    const mcdataSource = normalizeMcdataSource(config.get<string>('mcdataSource'));
    const properties: { mcdataSource: McdataSource; mcdataVersion?: string } = { mcdataSource };
    const version = await lookupMcdataVersion(
        context,
        projectRoot,
        mcdataSource,
        config.get<string>('mcdataPath') ?? ''
    );
    if (version) {
        properties.mcdataVersion = version;
    }
    getReporter()?.track('mcdata.version', properties);
}

async function lookupMcdataVersion(
    context: vscode.ExtensionContext,
    projectRoot: string,
    mcdataSource: McdataSource,
    customPath: string
): Promise<string | undefined> {
    const resolved = await buildMcdataLaunch({
        mcdataSource,
        customPath: customPath ?? '',
        projectRoot,
        extensionPath: context.extensionPath,
    });
    if (!vscode.env.isTelemetryEnabled || 'error' in resolved) {
        return undefined;
    }

    try {
        const { stdout, stderr } = await execFileAsync(
            resolved.executable,
            [...resolved.prefixArgs, '--version'],
            {
                shell: false,
                cwd: projectRoot,
                timeout: MCDATA_VERSION_TIMEOUT_MS,
                windowsHide: true,
                maxBuffer: 64 * 1024,
            }
        );
        return parseMcdataVersion(stdout) ?? parseMcdataVersion(stderr);
    } catch {
        return undefined;
    }
}

/**
 * Extracts a semver-like token so telemetry never includes a path or raw dump.
 * @param output - stdout or stderr from `mcdata --version`.
 * @returns {string | undefined} Version token, or undefined when none is found.
 */
function parseMcdataVersion(output: string): string | undefined {
    const firstLine = output.trim().split(/\r?\n/, 1)[0]?.trim() ?? '';
    if (!firstLine) {
        return undefined;
    }
    const match = MCDATA_VERSION_PATTERN.exec(firstLine);
    const version = match?.[1];
    if (!version || version.length > 64) {
        return undefined;
    }
    return version;
}
