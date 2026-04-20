/** Extension settings query for the Settings UI (publisher.name from package.json). */
export const EXT_SETTINGS_QUERY = '@ext:joernberkefeld.sfmc-data';

/**
 * Markdown body for the mcdata status bar hover: Show Output + Settings (no caching section).
 * @returns {string} Markdown source string (wrapped into a MarkdownString by the status bar module)
 */
export function buildMcdataStatusTooltipMarkdown(): string {
    let md = '';
    md += `[$(terminal) Show Output](command:sfmc-data.openOutputChannel "Show SFMC Data Loader Output")\n\n`;
    md += '---\n\n';
    const settingsCommandUri = `command:workbench.action.openSettings?${encodeURIComponent(JSON.stringify(EXT_SETTINGS_QUERY))}`;
    md += `[**Settings**](${settingsCommandUri} "Open SFMC Data Loader Settings") &nbsp;[$(gear)](${settingsCommandUri} "Open SFMC Data Loader Settings")\n\n`;
    return md;
}
