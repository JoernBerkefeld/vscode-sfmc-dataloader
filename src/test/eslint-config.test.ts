import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { ESLint } from 'eslint';

const projectRoot = path.resolve(__dirname, '../../..');
const filePath = path.join(projectRoot, 'src/test/jsdoc-regression.ts');

describe('ESLint starred JSDoc configuration', () => {
    it('disables the asterisk-removal rule in the effective configuration', async () => {
        const eslint = new ESLint({ cwd: projectRoot });
        const config = await eslint.calculateConfigForFile(filePath);
        assert.strictEqual(
            config.rules['unicorn/no-asterisk-prefix-in-documentation-comments'][0],
            0
        );
    });

    it('preserves starred multiline JSDoc during autofix', async () => {
        const eslint = new ESLint({ cwd: projectRoot, fix: true });
        const comment = [
            '/**',
            ' * Return the supplied label.',
            ' * @param label - Label to return.',
            ' * @returns {string} The supplied label.',
            ' */',
        ].join('\n');
        const source = `${comment}\nexport function describeLabel(label: string): string {\n    return label;\n}\n`;
        const [result] = await eslint.lintText(source, { filePath });
        assert.strictEqual(result.errorCount, 0, JSON.stringify(result.messages));
        assert.strictEqual(result.warningCount, 0, JSON.stringify(result.messages));
        assert.ok((result.output ?? source).includes(comment), result.output ?? source);
    });
});
