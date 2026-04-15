import * as vscode from 'vscode';
import * as fs from 'node:fs';
import path from 'node:path';
import { runMcdataWithProgress } from '../runMcdata';

export function registerInitProjectCommand(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('sfmc-data.initProject', () => initProject(context))
    );
}

async function initProject(context: vscode.ExtensionContext): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        void vscode.window.showErrorMessage(
            'SFMC Data: Initialize Project requires an open workspace folder.'
        );
        return;
    }

    const projectRoot =
        workspaceFolders.length === 1
            ? workspaceFolders[0].uri.fsPath
            : await (async () => {
                  const pick = await vscode.window.showQuickPick(
                      workspaceFolders.map((f) => f.uri.fsPath),
                      {
                          title: 'SFMC Data - Initialize Project',
                          placeHolder: 'Select workspace folder',
                      }
                  );
                  return pick;
              })();

    if (!projectRoot) {
        return;
    }

    // Check 1: block when this is a full mcdev project (both config files present)
    const mcdevRcPath = path.join(projectRoot, '.mcdevrc.json');
    const mcdevAuthPath = path.join(projectRoot, '.mcdev-auth.json');
    if (fs.existsSync(mcdevRcPath) && fs.existsSync(mcdevAuthPath)) {
        void vscode.window.showErrorMessage(
            'This project is managed by mcdev. Manage your credentials by editing .mcdev-auth.json directly, or run mcdev init to re-initialise.'
        );
        return;
    }

    // Check 2: confirm before overwriting existing mcdata config
    const mcdataRcPath = path.join(projectRoot, '.mcdatarc.json');
    const mcdataAuthPath = path.join(projectRoot, '.mcdata-auth.json');
    if (fs.existsSync(mcdataRcPath) || fs.existsSync(mcdataAuthPath)) {
        const choice = await vscode.window.showWarningMessage(
            'SFMC Data: An existing mcdata configuration was found. Do you want to override it?',
            { modal: true },
            'Override'
        );
        if (choice !== 'Override') {
            return;
        }
    }

    const credential = await vscode.window.showInputBox({
        title: 'SFMC Data - Initialize Project (1/5)',
        prompt: 'Credential name — used as a key in the config (e.g. MyOrg)',
        placeHolder: 'MyOrg',
        ignoreFocusOut: true,
        validateInput: (v) => (v.trim() ? undefined : 'Credential name is required'),
    });
    if (!credential?.trim()) {
        return;
    }

    const clientId = await vscode.window.showInputBox({
        title: 'SFMC Data - Initialize Project (2/5)',
        prompt: 'Installed-package Client ID',
        placeHolder: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        ignoreFocusOut: true,
        validateInput: (v) => (v.trim() ? undefined : 'Client ID is required'),
    });
    if (!clientId?.trim()) {
        return;
    }

    const clientSecret = await vscode.window.showInputBox({
        title: 'SFMC Data - Initialize Project (3/5)',
        prompt: 'Installed-package Client Secret',
        placeHolder: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        password: true,
        ignoreFocusOut: true,
        validateInput: (v) => (v.trim() ? undefined : 'Client Secret is required'),
    });
    if (!clientSecret?.trim()) {
        return;
    }

    const authUrl = await vscode.window.showInputBox({
        title: 'SFMC Data - Initialize Project (4/5)',
        prompt: 'Auth URL',
        placeHolder: 'https://mc<mid>.auth.marketingcloudapis.com/',
        ignoreFocusOut: true,
        validateInput: (v) => {
            if (!v.trim()) {
                return 'Auth URL is required';
            }
            try {
                new URL(v);
            } catch {
                return 'Enter a valid URL';
            }
            return;
        },
    });
    if (!authUrl?.trim()) {
        return;
    }

    const enterpriseIdInput = await vscode.window.showInputBox({
        title: 'SFMC Data - Initialize Project (5/5)',
        prompt: 'Enterprise MID (parent account ID)',
        placeHolder: '1234567',
        ignoreFocusOut: true,
        validateInput: (v) => {
            const n = Number.parseInt(v, 10);
            return Number.isInteger(n) && n > 0 ? undefined : 'Enter a valid integer MID';
        },
    });
    if (!enterpriseIdInput?.trim()) {
        return;
    }

    const args = [
        'init',
        '-p',
        projectRoot,
        '--credential',
        credential.trim(),
        '--client-id',
        clientId.trim(),
        '--client-secret',
        clientSecret.trim(),
        '--auth-url',
        authUrl.trim(),
        '--enterprise-id',
        enterpriseIdInput.trim(),
        '--yes',
    ];

    await runMcdataWithProgress(context, projectRoot, args, {
        progressTitle: 'SFMC Data - Initialize Project',
    });

    if (fs.existsSync(mcdataRcPath)) {
        const open = 'Open .mcdatarc.json';
        const choice = await vscode.window.showInformationMessage(
            'SFMC Data: Project initialized successfully.',
            open
        );
        if (choice === open) {
            const doc = await vscode.workspace.openTextDocument(mcdataRcPath);
            await vscode.window.showTextDocument(doc);
        }
    }
}
