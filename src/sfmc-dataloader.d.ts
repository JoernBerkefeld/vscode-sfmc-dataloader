/**
 * Minimal typings for imports used by this extension (package is plain JS).
 * @param basename
 */
declare module 'sfmc-dataloader' {
    export function parseExportBasename(basename: string): {
        customerKey: string;
        timestampPart: string;
        ext: string;
    };
}
