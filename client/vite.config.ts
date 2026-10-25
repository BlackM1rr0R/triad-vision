import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { brotliCompressSync, constants as zlibConstants } from 'node:zlib';
import path from 'node:path';

/**
 * Stamps public/sw.js with a hash of the emitted file names, so every deployment ships a changed service
 * worker and open tabs get the "New version available" prompt (src/lib/pwa.ts).
 */
const swBuildStamp = (): Plugin => {
  let outDir = 'dist';
  let id = 'dev';
  return {
    name: 'tv-sw-build-stamp',
    apply: 'build',
    configResolved(c) {
      outDir = path.resolve(c.root, c.build.outDir);
    },
    generateBundle(_opts, bundle) {
      id = createHash('sha256').update(Object.keys(bundle).sort().join('\n')).digest('hex').slice(0, 12);
    },
    closeBundle() {
      const file = path.join(outDir, 'sw.js');
      if (existsSync(file)) writeFileSync(file, readFileSync(file, 'utf8').replace(/__TV_BUILD__/g, id));
    },
  };
};

/**
 * Writes a Brotli copy (quality 11) next to every hashed JS / CSS / SVG file in dist/assets. Caddy serves it
 * (file_server precompressed br, deploy/Caddyfile) — about 15 % smaller than the on-the-fly gzip, which
 * Cloudflare otherwise passes through. index.html is never precompressed: it is a Caddy template.
 */
const brotliAssets = (): Plugin => {
  let outDir = 'dist';
  return {
    name: 'tv-brotli-assets',
    apply: 'build',
    configResolved(c) {
      outDir = path.resolve(c.root, c.build.outDir);
    },
    closeBundle() {
      const dir = path.join(outDir, 'assets');
      if (!existsSync(dir)) return;
      for (const name of readdirSync(dir)) {
        if (!/\.(js|css|svg)$/.test(name)) continue;
        const file = path.join(dir, name);
        const data = readFileSync(file);
        if (data.length < 1024) continue;
        const br = brotliCompressSync(data, {
          params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 11, [zlibConstants.BROTLI_PARAM_SIZE_HINT]: data.length },
        });
        if (br.length < data.length) writeFileSync(`${file}.br`, br);
      }
    },
  };
};

/**
 * Public pages whose route chunk is preloaded from the HTML (see shellPreloads). Path without the language
 * prefix; `prefix` entries match every page below it (detail pages).
 */
const PRELOAD_ROUTES: { path: string; prefix?: boolean; module: string }[] = [
  { path: '', module: 'pages/Home.tsx' },
  { path: '/visas', module: 'pages/Visas.tsx' },
  { path: '/visas/', prefix: true, module: 'pages/VisaDetail.tsx' },
  { path: '/guides', module: 'pages/guides/Guides.tsx' },
  { path: '/guides/', prefix: true, module: 'pages/guides/GuideDetail.tsx' },
  { path: '/tools', module: 'pages/Tools.tsx' },
  { path: '/cost-calculator', module: 'pages/growth/CostCalculator.tsx' },
  { path: '/jobs', module: 'pages/jobs/Jobs.tsx' },
  { path: '/jobs/', prefix: true, module: 'pages/jobs/JobDetail.tsx' },
  { path: '/packages', module: 'pages/Packages.tsx' },
  { path: '/contact', module: 'pages/Contact.tsx' },
  { path: '/about', module: 'pages/About.tsx' },
  { path: '/services', module: 'pages/Services.tsx' },
  { path: '/for-workers', module: 'pages/ForWorkers.tsx' },
  { path: '/for-employers', module: 'pages/ForEmployers.tsx' },
  { path: '/news', module: 'pages/News.tsx' },
  { path: '/login', module: 'pages/auth/Login.tsx' },
];

/**
 * Per-request preload hints in the HTML shell, written as Caddy template actions (index.html is a template in
 * production, see deploy/Caddyfile; elsewhere they stay inert comments). The hashed file names are only
 * known after bundling.
 *  - Fonts: the latin Onest file on every page, plus latin-ext only for az/tr (ə ş ğ İ) and cyrillic only for
 *    ru/uk, instead of always latin + latin-ext (≈30 KB a German, English or Russian visitor never needed).
 *  - Route chunk: the page's own JS (and the chunks it imports) for the main public pages, so it downloads
 *    together with the entry bundle instead of after it has run (one round trip less before the first paint).
 */
const shellPreloads = (): Plugin => ({
  name: 'tv-shell-preloads',
  apply: 'build',
  transformIndexHtml: {
    order: 'post',
    handler(html, ctx) {
      const bundle = ctx.bundle ?? {};
      const files = Object.keys(bundle);
      const font = (re: RegExp) => {
        const f = files.find((x) => re.test(x));
        return f ? `<link rel="preload" as="font" type="font/woff2" href="/${f}" crossorigin>` : '';
      };
      const latin = font(/onest-latin-wght-normal-[\w-]+\.woff2$/);
      const latinExt = font(/onest-latin-ext-wght-normal-[\w-]+\.woff2$/);
      const cyrillic = font(/onest-cyrillic-wght-normal-[\w-]+\.woff2$/);

      // Static import closure of a chunk (what the browser needs before the module can run).
      const chunks = new Map<string, { imports: string[]; facade?: string | null; isEntry: boolean }>();
      for (const [name, out] of Object.entries(bundle)) {
        if (out.type === 'chunk') chunks.set(name, { imports: out.imports, facade: out.facadeModuleId, isEntry: out.isEntry });
      }
      const closure = (start: string[]) => {
        const seen = new Set<string>();
        const stack = [...start];
        while (stack.length) {
          const f = stack.pop()!;
          if (seen.has(f) || !chunks.has(f)) continue;
          seen.add(f);
          stack.push(...chunks.get(f)!.imports);
        }
        return seen;
      };
      const entry = [...chunks.entries()].find(([, c]) => c.isEntry)?.[0];
      const inEntry = closure(entry ? [entry] : []);
      const src = fileURLToPath(new URL('./src', import.meta.url)).replace(/\\/g, '/');
      const routeLinks = (module: string) => {
        const chunk = [...chunks.entries()].find(([, c]) => c.facade?.replace(/\\/g, '/') === `${src}/${module}`)?.[0];
        if (!chunk) return '';
        // Page chunk first, then its imports.
        const list = [chunk, ...[...closure([chunk])].filter((f) => f !== chunk)].filter((f) => !inEntry.has(f));
        return list.map((f) => `<link rel="modulepreload" crossorigin href="/${f}">`).join('');
      };
      const tv = (action: string) => `<!--tv:${action}:tv-->`;
      // Copy of the URL's language (i18n/index.ts: az is in the bundle, the others are chunks awaited before
      // the first render; tr / uk sit on top of English).
      const LANG_COPY: Record<string, string[]> = {
        de: ['i18n/de.ts'],
        en: ['i18n/en.ts'],
        ru: ['i18n/ru.ts'],
        tr: ['i18n/en.ts', 'i18n/site/tr/index.ts'],
        uk: ['i18n/en.ts', 'i18n/site/uk/index.ts'],
      };
      const langBranches = Object.entries(LANG_COPY)
        .map(([lang, modules]) => ({ lang, links: [...new Set(modules.map(routeLinks).join('').split(/(?=<link )/))].join('') }))
        .filter((b) => b.links);
      const langBlock = langBranches.map((b, i) => tv(`${i === 0 ? 'if' : 'else if'} eq $lang "${b.lang}"`) + b.links).join('') + (langBranches.length ? tv('end') : '');

      const branches = PRELOAD_ROUTES.map((r) => ({ cond: r.prefix ? `hasPrefix "${r.path}" $tvPath` : `eq $tvPath "${r.path}"`, links: routeLinks(r.module) })).filter((b) => b.links);

      const block = [
        latin,
        tv('if has $lang (list "az" "tr")') + latinExt + tv('else if has $lang (list "ru" "uk")') + cyrillic + tv('end'),
        langBlock,
        // Path without the language prefix and trailing slash ("/de/visas/" → "/visas", "/" → "").
        tv('$tvPath := trimSuffix "/" .OriginalReq.URL.Path') + tv('if ne $lang "az"') + tv('$tvPath = trimPrefix (printf "/%s" $lang) $tvPath') + tv('end'),
        branches.map((b, i) => tv(`${i === 0 ? 'if' : 'else if'} ${b.cond}`) + b.links).join('') + (branches.length ? tv('end') : ''),
        // Site content (header, footer, home sections; language-independent, cached by the API): every page in
        // the site layout waits for it before showing its main content. Fetching it here starts it while the
        // JS is still downloading. use-credentials = the same request the axios client (withCredentials) makes.
        tv('if not (or (hasPrefix "/admin" $tvPath) (hasPrefix "/workspace" $tvPath))') +
          '<link rel="preload" as="fetch" href="/api/public/content" crossorigin="use-credentials">' +
          tv('end'),
      ].join('\n    ');
      return html.replace('</head>', `    ${block}\n  </head>`);
    },
  },
});

export default defineConfig({
  plugins: [react(), tailwindcss(), swBuildStamp(), shellPreloads(), brotliAssets()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  // Pre-bundle heavy deps up front so the dev server never stops mid-navigation to re-optimise and reload.
  optimizeDeps: {
    include: [
      'react', 'react-dom', 'react-dom/client', 'react-router-dom', 'framer-motion', '@tanstack/react-query', 'axios',
      'i18next', 'react-i18next', 'i18next-browser-languagedetector', 'lucide-react', 'clsx', 'sonner', 'signature_pad',
    ],
  },
  server: {
    // Transform all pages when the dev server starts, so the first visit to each page is instant.
    warmup: { clientFiles: ['./src/main.tsx', './src/pages/**/*.tsx', './src/components/**/*.tsx'] },
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4000',
      '/uploads': 'http://localhost:4000',
      // SEO files generated by the API (production: Caddy routes them).
      '/sitemap.xml': 'http://localhost:4000',
      '/sitemaps': 'http://localhost:4000',
      '/robots.txt': 'http://localhost:4000',
      '/rss.xml': 'http://localhost:4000',
      '/og': 'http://localhost:4000',
    },
  },
  // `vite preview` serves the production build; proxy the API the same way so it can be measured locally.
  preview: { port: 4173, proxy: { '/api': 'http://localhost:4000', '/uploads': 'http://localhost:4000' } },
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        // Only libraries every page needs go in shared chunks.
        manualChunks: {
          react: ['react', 'react-dom', 'react-dom/client', 'react-router-dom', 'scheduler'],
          motion: ['framer-motion'],
          data: ['axios', '@tanstack/react-query'],
          i18n: ['i18next', 'react-i18next', 'i18next-browser-languagedetector'],
        },
      },
    },
  },
});
