import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { parseContextFilePath } from '../filePathParser';

const ROOT = path.join('C:', 'projects', 'mcdev');

function abs(...parts: string[]): string {
    return path.join(ROOT, ...parts);
}

describe('parseContextFilePath — retrieve files', () => {
    it('parses a dataExtension-meta.json path', () => {
        const result = parseContextFilePath(
            abs(
                'retrieve',
                'MyCred',
                'MyBU',
                'dataExtension',
                'Contact_DE.dataExtension-meta.json'
            ),
            ROOT
        );
        assert.ok(result);
        assert.equal(result.type, 'retrieve');
        assert.equal(result.cred, 'MyCred');
        assert.equal(result.bu, 'MyBU');
        assert.equal(result.credBu, 'MyCred/MyBU');
        assert.equal(result.deKey, 'Contact_DE');
    });

    it('parses a dataExtension-doc.md path', () => {
        const result = parseContextFilePath(
            abs(
                'retrieve',
                'MyCred',
                'MyBU',
                'dataExtension',
                'AC_EmailLog_Staging.dataExtension-doc.md'
            ),
            ROOT
        );
        assert.ok(result);
        assert.equal(result.type, 'retrieve');
        assert.equal(result.deKey, 'AC_EmailLog_Staging');
        assert.equal(result.credBu, 'MyCred/MyBU');
    });

    it('returns undefined for a retrieve file outside dataExtension folder', () => {
        const result = parseContextFilePath(
            abs('retrieve', 'MyCred', 'MyBU', 'emailSend', 'some.emailSend-meta.json'),
            ROOT
        );
        assert.equal(result, undefined);
    });

    it('returns undefined for a file too deep', () => {
        const result = parseContextFilePath(
            abs(
                'retrieve',
                'MyCred',
                'MyBU',
                'dataExtension',
                'sub',
                'Contact_DE.dataExtension-meta.json'
            ),
            ROOT
        );
        assert.equal(result, undefined);
    });
});

describe('parseContextFilePath — data files', () => {
    it('parses a timestamped .mcdata. CSV file', () => {
        const result = parseContextFilePath(
            abs('data', 'MyCred', 'MyBU', 'Contact_DE.mcdata.2026-04-08T10-00-00.000Z.csv'),
            ROOT
        );
        assert.ok(result);
        assert.equal(result.type, 'data');
        assert.equal(result.cred, 'MyCred');
        assert.equal(result.bu, 'MyBU');
        assert.equal(result.credBu, 'MyCred/MyBU');
        assert.equal(result.deKey, 'Contact_DE');
    });

    it('parses a --git style .mcdata. JSON file', () => {
        const result = parseContextFilePath(
            abs('data', 'ProdCred', 'ProdBU', 'Order_DE.mcdata.json'),
            ROOT
        );
        assert.ok(result);
        assert.equal(result.type, 'data');
        assert.equal(result.deKey, 'Order_DE');
        assert.equal(result.credBu, 'ProdCred/ProdBU');
    });

    it('returns undefined for a data file without valid mcdata basename', () => {
        const result = parseContextFilePath(abs('data', 'MyCred', 'MyBU', 'Contact_DE.csv'), ROOT);
        assert.equal(result, undefined);
    });

    it('returns undefined for a file one level too deep in data/', () => {
        const result = parseContextFilePath(
            abs('data', 'MyCred', 'MyBU', 'sub', 'Contact_DE.mcdata.2026-04-08T10-00-00.000Z.csv'),
            ROOT
        );
        assert.equal(result, undefined);
    });
});

describe('parseContextFilePath — unrecognised paths', () => {
    it('returns undefined for an arbitrary file', () => {
        assert.equal(parseContextFilePath(abs('src', 'foo.ts'), ROOT), undefined);
    });

    it('returns undefined for a file directly in the project root', () => {
        assert.equal(parseContextFilePath(abs('.mcdevrc.json'), ROOT), undefined);
    });
});
