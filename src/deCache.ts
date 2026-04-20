import type { DeItem } from 'sfmc-dataloader';

/**
 * Session-only cache: credential → BU name → DE list from last refresh.
 * Not persisted; cleared when the extension host restarts.
 */
const deCache: Record<string, Record<string, DeItem[]>> = {};

export function hasDeCacheForBu(credential: string, bu: string): boolean {
    return Boolean(deCache[credential]?.[bu]?.length);
}

export function getDeCacheForBu(credential: string, bu: string): DeItem[] | undefined {
    const list = deCache[credential]?.[bu];
    return list?.length ? list : undefined;
}

export function setDeCacheBu(credential: string, bu: string, items: DeItem[]): void {
    if (!deCache[credential]) {
        deCache[credential] = {};
    }
    deCache[credential][bu] = items;
}

/** Clears the entire in-memory DE cache (e.g. for tests). */
export function clearDeCache(): void {
    for (const k of Object.keys(deCache)) {
        delete deCache[k];
    }
}
