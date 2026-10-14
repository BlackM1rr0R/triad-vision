#!/usr/bin/env node
/**
 * Copies the web translations (client/src/i18n/*.ts) into mobile/src/i18n/locales/*.json.
 *
 * The web modules are TypeScript, so we bundle them with esbuild into a tiny ESM module,
 * import it from a data: URL and write one merged JSON file per language
 * ({ ...base, ...details[lng], ...extra[lng] } — the same merge the web app does).
 *
 * Run after the web translations change:  npm run sync-i18n
 */
import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const webI18n = path.resolve(here, '../../client/src/i18n');
const outDir = path.resolve(here, '../src/i18n/locales');
const LOCALES = ['az', 'de', 'en', 'ru'];

const entry = `
${LOCALES.map((l) => `import ${l} from './${l}';`).join('\n')}
import { details } from './details';
import { extra } from './extra';
export default { ${LOCALES.map((l) => `${l}: { ...${l}, ...details.${l}, ...extra.${l} }`).join(', ')} };
`;

const result = await build({
  stdin: { contents: entry, resolveDir: webI18n, loader: 'ts', sourcefile: 'mobile-i18n-entry.ts' },
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  write: false,
  logLevel: 'error',
});

const code = result.outputFiles[0].text;
const mod = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const all = mod.default;

await mkdir(outDir, { recursive: true });
for (const lng of LOCALES) {
  const file = path.join(outDir, `${lng}.json`);
  await writeFile(file, JSON.stringify(all[lng], null, 1) + '\n', 'utf8');
  console.log(`wrote ${path.relative(process.cwd(), file)} (${Object.keys(all[lng]).length} sections)`);
}
