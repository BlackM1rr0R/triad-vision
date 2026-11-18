/**
 * Per-language chunks for big page-copy modules (src/i18n/pagesXxx.ts), without changing their source.
 *
 *   import jobsCopy from '@/i18n/pagesJobs?lazy-copy';   // { az: () => import(…), de: () => import(…), … }
 *   await registerLazyCopy(jobsCopy);                      // src/i18n/index.ts: loads only the languages in use
 *
 * A copy module exports one object of languages (`export const pagesJobs = { az, de, en, ru }`, values may also be
 * inline objects or expressions such as `wrap(deSections)`). For `<file>?copy-lang=de` this plugin serves the
 * module's own source with its exports turned into local declarations and `export default <the de value>` added:
 * Rollup drops the other languages' declarations as unused, so each language becomes a chunk of its own. Tests and
 * other code keep importing the module as it is (all languages).
 *
 * SSR build (and anything not a browser build or dev server): the loaders resolve from one static import of the
 * whole module, so a render never waits for a chunk and every language is there, as with registerCopy.
 */
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import type { Plugin } from 'vite';

const LAZY = '?lazy-copy';
const LANG = '?copy-lang=';
const LANGS = ['az', 'de', 'en', 'ru', 'tr', 'uk'];

interface Parsed {
  source: string;
  sf: ts.SourceFile;
  exportName: string;
  langs: Map<string, string>; // language -> expression text
}

const parse = (file: string): Parsed => {
  const source = readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const found: { name: string; obj: ts.ObjectLiteralExpression }[] = [];
  for (const st of sf.statements) {
    if (!ts.isVariableStatement(st) || !st.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
    for (const d of st.declarationList.declarations) {
      if (!ts.isIdentifier(d.name) || !d.initializer || !ts.isObjectLiteralExpression(d.initializer)) continue;
      const keys = d.initializer.properties.map((p) => (p.name && ts.isIdentifier(p.name) ? p.name.text : ''));
      if (keys.includes('az') && keys.includes('de') && keys.every((k) => LANGS.includes(k))) found.push({ name: d.name.text, obj: d.initializer });
    }
  }
  if (found.length !== 1) throw new Error(`[lazy-copy] ${file}: expected exactly one exported { az, de, … } object, found ${found.length}`);
  const langs = new Map<string, string>();
  for (const p of found[0].obj.properties) {
    if (ts.isShorthandPropertyAssignment(p)) langs.set(p.name.text, p.name.text);
    else if (ts.isPropertyAssignment(p) && ts.isIdentifier(p.name)) langs.set(p.name.text, p.initializer.getText(sf));
    else throw new Error(`[lazy-copy] ${file}: unsupported property in ${found[0].name}`);
  }
  return { source, sf, exportName: found[0].name, langs };
};

/**
 * Languages whose copy has every key of the Azerbaijani copy (the fallback of de / en / ru), so the browser never
 * needs the az chunk to show them. Found by running the module (copy modules are plain data without imports); a
 * module that cannot run here simply gets no entry, and the az copy is loaded with every language, as i18next's
 * fallback would read it. A key counts as present unless it is missing or null (i18next falls back on those;
 * an empty string is returned as it is). Arrays count as one value (returnObjects).
 */
const completeLanguages = ({ source, exportName, langs }: Parsed): string[] => {
  let copy: Record<string, unknown>;
  try {
    const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const mod = { exports: {} as Record<string, unknown> };
    const run = new Function('module', 'exports', 'require', js);
    run(mod, mod.exports, () => {
      throw new Error('imports');
    });
    copy = mod.exports[exportName] as Record<string, unknown>;
  } catch {
    return [];
  }
  const leaves = (v: unknown, prefix: string, out: Set<string>) => {
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) for (const [k, x] of Object.entries(v)) leaves(x, `${prefix}${k}.`, out);
    else if (v !== null && v !== undefined) out.add(prefix);
    return out;
  };
  const az = leaves(copy.az, '', new Set());
  if (!az.size) return [];
  return [...langs.keys()].filter((l) => {
    if (l === 'az') return false;
    const own = leaves(copy[l], '', new Set());
    for (const k of az) if (!own.has(k)) return false;
    return true;
  });
};

/** The module's source with every export made local, plus `export default <expr>`. */
const langModule = ({ source, sf }: Parsed, expr: string) => {
  const cuts: [number, number, string][] = [];
  for (const st of sf.statements) {
    if (ts.isExportAssignment(st) || ts.isExportDeclaration(st)) {
      cuts.push([st.getStart(sf), st.getEnd(), '']);
      continue;
    }
    const mods = ts.canHaveModifiers(st) ? ts.getModifiers(st) : undefined;
    const exp = mods?.find((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    if (!exp) continue;
    const def = mods?.find((m) => m.kind === ts.SyntaxKind.DefaultKeyword);
    cuts.push([exp.getStart(sf), (def ?? exp).getEnd(), '']);
  }
  let out = source;
  for (const [a, b, s] of cuts.sort((x, y) => y[0] - x[0])) out = out.slice(0, a) + s + out.slice(b);
  return `${out}\nexport default (${expr});\n`;
};

/** Copy module (path with forward slashes) -> its languages that need no az fallback (for the HTML preloads). */
export const lazyCopyComplete = new Map<string, string[]>();

export const lazyCopy = (): Plugin => {
  let eager = true;
  const cache = new Map<string, Parsed>();
  const parsed = (file: string) => {
    let p = cache.get(file);
    if (!p) cache.set(file, (p = parse(file)));
    return p;
  };
  return {
    name: 'tv-lazy-copy',
    enforce: 'pre',
    configResolved(c) {
      // Browser build or dev server: one chunk per language. SSR build / vitest: eager (see above).
      eager = Boolean(c.build.ssr) || (c.command === 'serve' && c.mode === 'test');
    },
    async resolveId(id, importer) {
      const q = id.indexOf(LAZY) >= 0 ? LAZY : id.indexOf(LANG) >= 0 ? id.slice(id.indexOf(LANG)) : null;
      if (!q) return null;
      const base = id.slice(0, id.indexOf('?'));
      const r = await this.resolve(base, importer, { skipSelf: true });
      return r ? `${r.id}${q}` : null;
    },
    load(id) {
      const file = id.slice(0, id.indexOf('?')).replace(/\\/g, '/');
      if (id.endsWith(LAZY)) {
        const p = parsed(file);
        this.addWatchFile(file);
        if (eager) {
          const entries = [...p.langs.keys()].map((l) => `  ${l}: () => Promise.resolve(copy.${l}),`).join('\n');
          return `import { ${p.exportName} as copy } from ${JSON.stringify(file)};\nexport default {\n${entries}\n};\n`;
        }
        const entries = [...p.langs.keys()].map((l) => `  ${l}: () => import(${JSON.stringify(`${file}${LANG}${l}`)}).then((m) => m.default),`).join('\n');
        const complete = completeLanguages(p);
        lazyCopyComplete.set(file, complete);
        return `export default {\n${entries}\n  complete: ${JSON.stringify(complete)},\n};\n`;
      }
      const at = id.indexOf(LANG);
      if (at >= 0) {
        cache.delete(file); // re-read: the source may have changed (dev server)
        const p = parsed(file);
        const lang = id.slice(at + LANG.length);
        const expr = p.langs.get(lang);
        if (!expr) throw new Error(`[lazy-copy] ${file}: no "${lang}" copy`);
        this.addWatchFile(file);
        return langModule(p, expr);
      }
      return null;
    },
    handleHotUpdate(ctx) {
      cache.delete(ctx.file.replace(/\\/g, '/'));
    },
  };
};
