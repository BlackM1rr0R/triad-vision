// Production build of the API: transpiles every src/**/*.ts file to dist/ with esbuild (one file at a time, no
// bundling) and copies the JSON files that are imported with `with { type: 'json' }`.
//
// Why not `tsc`: the full TypeScript program (Prisma's generated types included) needs ~2.5 GB of heap, more than
// the 2 GB production server has. Type checking already runs in CI (`npm run typecheck`) before every deploy, so
// the image only needs the JavaScript output.
import { build } from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'src');
const out = path.join(root, 'dist');

const walk = async (dir) => {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(entries.map((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)])));
  return files.flat();
};

const files = await walk(src);
const ts = files.filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts'));
const json = files.filter((f) => f.endsWith('.json'));

await fs.rm(out, { recursive: true, force: true });
await build({
  entryPoints: ts,
  outdir: out,
  outbase: src,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  bundle: false,
  sourcemap: false,
  logLevel: 'warning',
});
for (const f of json) {
  const dest = path.join(out, path.relative(src, f));
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.copyFile(f, dest);
}
console.log(`build-prod: ${ts.length} modules, ${json.length} json files → dist/`);
