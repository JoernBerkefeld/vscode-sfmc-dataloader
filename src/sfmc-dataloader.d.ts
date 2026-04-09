/** Minimal typings for imports used by this extension (package is plain JS). */
declare module 'sfmc-dataloader' {
    export function parseExportBasename(basename: string): {
        customerKey: string;
        timestampPart: string;
        ext: string;
    };
}
