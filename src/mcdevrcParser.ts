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
 * @param mcdevrc - parsed .mcdevrc.json
 * @returns {string[]} credential names from `mcdevrc.credentials`
 */
export function getCredentials(mcdevrc: Mcdevrc): string[] {
    return Object.keys(mcdevrc.credentials ?? {});
}

/**
 * Returns all business unit names for a given credential from a parsed
 * .mcdevrc.json object.
 * @param mcdevrc - parsed .mcdevrc.json
 * @param credential - credential name
 * @returns {string[]} business unit names for that credential
 */
export function getBusinessUnits(mcdevrc: Mcdevrc, credential: string): string[] {
    return Object.keys(mcdevrc.credentials?.[credential]?.businessUnits ?? {});
}

/**
 * Returns all `"<credential>/<businessUnit>"` pairs from a parsed
 * .mcdevrc.json object, across every credential.
 * @param mcdevrc - parsed .mcdevrc.json
 * @returns {string[]} combined cred/bu tokens
 */
export function getAllCredBus(mcdevrc: Mcdevrc): string[] {
    const result: string[] = [];
    for (const cred of Object.keys(mcdevrc.credentials ?? {})) {
        for (const bu of Object.keys(mcdevrc.credentials[cred]?.businessUnits ?? {})) {
            result.push(`${cred}/${bu}`);
        }
    }
    return result;
}
