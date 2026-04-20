declare module 'sfmc-dataloader' {
    export interface DeItem {
        name: string;
        key: string;
    }

    export function parseExportBasename(basename: string): {
        customerKey: string;
        timestampPart: string;
        ext: string;
    };

    export function fetchDeList(
        projectRoot: string,
        credential: string,
        bu: string
    ): Promise<DeItem[]>;
}
