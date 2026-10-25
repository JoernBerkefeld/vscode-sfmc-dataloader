import path from 'node:path';
import type { DeItem } from 'sfmc-dataloader';
import type { Mcdevrc } from './mcdevrcParser';

export type DeCacheIdentity = {
    projectRoot: string;
    credential: string;
    bu: string;
    accountId: number | string | undefined;
    mid: number | string | undefined;
};

/**
 * Capture only public project identity, never authentication configuration.
 * The public parser's narrow type omits the configured enterprise ID (`eid`).
 * @param projectRoot Absolute project directory.
 * @param config Parsed public .mcdevrc.json or .mcdatarc.json.
 * @param credential Credential label.
 * @param bu Business unit label.
 * @returns {DeCacheIdentity} Identity snapshot for this project and account/BU mapping.
 */
export function createDeCacheIdentity(
    projectRoot: string,
    config: Mcdevrc,
    credential: string,
    bu: string
): DeCacheIdentity {
    const configured = config.credentials?.[credential] as
        (Mcdevrc['credentials'][string] & { eid?: number | string }) | undefined;
    return {
        projectRoot,
        credential,
        bu,
        accountId: configured?.eid,
        mid: configured?.businessUnits?.[bu],
    };
}

// Session-only cache. A successful empty result is distinct from an absent entry.
const deCache = new Map<string, DeItem[]>();

function cacheKey(identity: DeCacheIdentity): string {
    let projectRoot = path.normalize(path.resolve(identity.projectRoot));
    if (process.platform === 'win32') {
        projectRoot = projectRoot.toLowerCase();
    }
    const root = path.parse(projectRoot).root;
    while (projectRoot.length > root.length && projectRoot.endsWith(path.sep)) {
        projectRoot = projectRoot.slice(0, -1);
    }
    return JSON.stringify([
        projectRoot,
        identity.credential,
        identity.bu,
        identity.accountId,
        identity.mid,
    ]);
}

export function hasDeCacheForBu(identity: DeCacheIdentity): boolean {
    return deCache.has(cacheKey(identity));
}

export function getDeCacheForBu(identity: DeCacheIdentity): DeItem[] | undefined {
    return deCache.get(cacheKey(identity));
}

export function setDeCacheBu(identity: DeCacheIdentity, items: DeItem[]): void {
    deCache.set(cacheKey(identity), items);
}

/**
 * Clears the entire in-memory DE cache (e.g. for tests).
 */
export function clearDeCache(): void {
    deCache.clear();
}
