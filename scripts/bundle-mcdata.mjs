/**
 * Bundles sfmc-dataloader's mcdata CLI for the VSIX. Injects globalThis.__sfmc_dataloader_version__
 * so --version works when import.meta.url is not available in the CJS bundle.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const root = dirname(fileURLToPath(import.meta.url));
const projectRoot = dirname(root);
const dlRoot = join(projectRoot, 'node_modules', 'sfmc-dataloader');
const pkg = JSON.parse(readFileSync(join(dlRoot, 'package.json'), 'utf8'));
const version = typeof pkg.version === 'string' ? pkg.version : '';

await esbuild.build({
    // The published CLI uses top-level await; retain CJS packaging with an async wrapper.
    stdin: {
        contents: `import { main } from './lib/cli.mjs';
(async () => {
    try {
        const code = await main(process.argv);
        process.exit(typeof code === 'number' ? code : 0);
    } catch (error) {
        console.error(error.message ?? String(error));
        process.exit(1);
    }
})();`,
        resolveDir: dlRoot,
        sourcefile: 'mcdata-wrapper.mjs',
        loader: 'js',
    },
    bundle: true,
    outfile: join(projectRoot, 'out', 'mcdata.bundled.cjs'),
    platform: 'node',
    format: 'cjs',
    minify: true,
    legalComments: 'none',
    // Suppress the empty-import-meta warning: import.meta.url is only reached when
    // globalThis.__sfmc_dataloader_version__ is absent (i.e. never in the bundle).
    // Replacing it with the actual resolved path makes the dead code branch silent.
    define: {
        'import.meta.url': JSON.stringify(
            `file://${join(dlRoot, 'bin', 'mcdata.mjs').replaceAll('\\', '/')}`
        ),
    },
    banner: {
        js: `globalThis.__sfmc_dataloader_version__=${JSON.stringify(version)};`,
    },
});
