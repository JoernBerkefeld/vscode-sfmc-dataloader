/**
 * Pure parsing helpers for .mcdevrc.json content.
 * No VS Code or filesystem imports — safe to unit-test directly.
 */

export type McdevrcCredential = {
    businessUnits: Record<string, number | string>;
};

export type Mcdevrc = {
    credentials: Record<string, McdevrcCredential>;
};

/**
 * Returns all credential names from a parsed .mcdevrc.json object.
 *
 * @param mcdevrc - parsed .mcdevrc.json
 */
export function getCredentials(mcdevrc: Mcdevrc): string[] {
    return Object.keys(mcdevrc.credentials ?? {});
}

/**
 * Returns all business unit names for a given credential from a parsed
 * .mcdevrc.json object.
 *
 * @param mcdevrc - parsed .mcdevrc.json
 * @param credential - credential name
 */
export function getBusinessUnits(mcdevrc: Mcdevrc, credential: string): string[] {
    return Object.keys(mcdevrc.credentials?.[credential]?.businessUnits ?? {});
}
