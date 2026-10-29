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

    for (const suffix of ['.dataExtension-meta.json', '.dataExtension-doc.md']) {
        it(`preserves dotted keys and decodes loader filename escapes for ${suffix}`, () => {
            const result = parseContextFilePath(
                abs(
                    'retrieve',
                    'MyCred',
                    'MyBU',
                    'dataExtension',
                    `Orders.v2%2FItem_STAR_${suffix}`
                ),
                ROOT
            );
            assert.equal(result?.deKey, 'Orders.v2/Item*');
        });
    }

    for (const filename of [
        'Orders.json',
        'Orders.dataExtension-meta.json.bak',
        'Orders.dataExtension-doc.md.bak',
        '.dataExtension-meta.json',
        'Bad%ZZ.dataExtension-meta.json',
        'Bad%E0%A4%A.dataExtension-doc.md',
    ]) {
        it(`rejects unrelated or malformed metadata filename ${filename}`, () => {
            assert.equal(
                parseContextFilePath(
                    abs('retrieve', 'MyCred', 'MyBU', 'dataExtension', filename),
                    ROOT
                ),
                undefined
            );
        });
    }

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

    for (const [filename, key] of [
        ['Contact_DE.csv', 'Contact_DE'],
        ['Customer.List.csv', 'Customer.List'],
        ['Customers.part1.csv', 'Customers.part1'],
        ['Customers.mcdatabase.csv', 'Customers.mcdatabase'],
        ['Customers.mcdata.part1.csv', 'Customers'],
        ['Customers.CSV', 'Customers'],
        ['Bad%ZZ.csv', 'Bad%ZZ'],
        ['Orders%2FItem.csv', 'Orders%2FItem'],
        ['Orders.mcdata.csv', 'Orders'],
    ]) {
        it(`recognises explicit CSV selection ${filename}`, () => {
            const filePath = abs('data', 'MyCred', 'MyBU', filename);
            const result = parseContextFilePath(filePath, ROOT);
            assert.equal(result?.deKey, key);
            assert.equal(result?.filePath, filePath);
            assert.equal(result?.credBu, 'MyCred/MyBU');
        });
    }

    for (const filename of ['.csv', 'Customers.tsv', 'Customers.json']) {
        it(`rejects plain unsupported selection ${filename}`, () => {
            assert.equal(
                parseContextFilePath(abs('data', 'MyCred', 'MyBU', filename), ROOT),
                undefined
            );
        });
    }

    for (const filename of ['Orders.mcdata.exe', 'Bad%ZZ.mcdata.csv']) {
        it(`rejects unsupported or malformed data filename ${filename}`, () => {
            assert.equal(
                parseContextFilePath(abs('data', 'MyCred', 'MyBU', filename), ROOT),
                undefined
            );
        });
    }

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
