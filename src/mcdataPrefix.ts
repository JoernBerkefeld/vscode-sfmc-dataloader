import * as vscode from 'vscode';
import { getProjectConfiguration as getProjectConfig } from './config';
import { buildMcdataLaunch, normalizeMcdataSource, type McdataLaunch } from './mcdataResolve';

/**
 * Resolves the executable and prefix argv per `sfmcData` launcher settings.
 * Shows an error message if resolution fails (e.g. missing bundled script, empty custom path).
 * @param context - VS Code extension context (for `extensionPath` and workspace config)
 * @param projectRoot - absolute path to the project root used as mcdata cwd
 * @returns {Promise<McdataLaunch | undefined>} shell-free launcher, or undefined on failure
 */
export async function resolveMcdataLaunch(
    context: vscode.ExtensionContext,
    projectRoot: string
): Promise<McdataLaunch | undefined> {
    const config = getProjectConfig(projectRoot);
    const mcdataSource = normalizeMcdataSource(config.get<string>('mcdataSource'));
    const customPath = config.get<string>('mcdataPath');
    const result = await buildMcdataLaunch({
        mcdataSource,
        customPath: customPath ?? '',
        projectRoot,
        extensionPath: context.extensionPath,
    });
    if ('error' in result) {
        void vscode.window.showErrorMessage(result.error);
        return undefined;
    }
    return result;
}
