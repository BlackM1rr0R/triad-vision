# SEO — status and owner checklist

Short reference for triad-vision.de. Code: `server/src/lib/seo.ts` (head tags, JSON-LD, sitemaps, robots,
status codes), `seoBody.ts` (crawlable HTML), `seoCatalogue.ts` (static page texts, route list),
`deploy/Caddyfile` + `client/index.html` (server-side includes, 404s, redirects).

## What is implemented

| Area | How |
| --- | --- |
| Languages / URLs | az at `/` (also x-default), `/de` `/en` `/ru` `/tr` `/uk`. `?lng=xx` and `/az/…` → 301 to the prefixed URL. |
| Head tags | Per page and language: `<title>` ≤ 60, description ≤ 155, self canonical, hreflang (+ x-default), Open Graph incl. `og:locale` / `og:locale:alternate`, Twitter card, `<html lang>`. Rendered server-side by Caddy for every page. |
| hreflang | Static pages: all six languages. CMS items (visas, services, news, jobs, events, e-books): only the languages the item is written in; e.g. `/tr/visas/x` showing English text has its canonical on `/en/visas/x` and no hreflang. Guides: each language's own slug. Landing pages: one language. |
| Server-rendered pages | Public pages arrive with their real markup inside `#root`, rendered per request by the `ssr` service (React `prerender` of the same app, `client/src/entry-server.tsx`, `client/ssr/server.mjs`; Caddy includes it, the browser hydrates it). Visitors and crawlers see the page before the JavaScript runs. Data: public queries only (CMS content, visas, services, news, jobs, guides…), fetched anonymously and shipped as JSON next to the markup. |
| Crawlable body (fallback) | When the SSR service is down, slow (> 1.5 s) or the path is private: plain semantic HTML from the API inside `#root` (`/__seo/body`) for crawlers without JavaScript — navigation, breadcrumbs, lists, footer NAP; job pages: salary, type, city, other jobs, visa links. |
| Status codes | Unknown URLs, missing/unpublished content, closed or expired vacancies and past events answer **HTTP 404** (same SPA page for visitors). Trailing slash → 301 to the bare path; old aliases (`/calculators`, `/workers`, `/candidates`, `/employers`) → 301; http → https, www → apex (Caddy/Cloudflare). |
| Google for Jobs | `JobPosting` on every open vacancy: title, HTML description, datePosted, validThrough, employmentType, hiringOrganization (employer name if shown on the page, otherwise `"confidential"` as Google asks for agencies), jobLocation with locality / region / postal code / `DE`, baseSalary EUR per MONTH, directApply, identifier, image, occupation (KldB), experience. Closed / expired → 404 and out of the sitemap. |
| Other structured data | Organization + WebSite (home), ProfessionalService per office (home, contact; same NAP as the footer), BreadcrumbList (inner pages), FAQPage (FAQ, visa pages, guides, compare page — only FAQs visible on the page), Article (guides), NewsArticle (news), Service (service pages, packages), Event (info sessions), WebApplication (calculators), VideoObject (video stories), Book (e-books), ItemList (guides, tools). **No AggregateRating/Review** on our own organisation: self-serving reviews are not eligible for rich results. |
| Profession × city pages | `/jobs/in/<city>/<profession>` (e.g. `/de/jobs/in/hamburg/lkw-fahrer`), `server/src/lib/jobLandings.ts`: one page per combination of canonical profession (`lib/matching.ts`, vacancy profession or title) and city that has at least one live vacancy — otherwise **404** and out of the sitemap (no thin pages). Title, description, H1 and intro generated in all six languages from the page's facts (count, salary range, federal state, employment types); hreflang = all six languages; ItemList of the vacancy URLs (each vacancy page keeps its own JobPosting). Linked from each vacancy page ("more … jobs in …"), from `/jobs` (crawler HTML) and from each other (same city / same profession). Data: `GET /api/vacancies/landing/:city/:profession?lng=`. |
| Sitemaps | `/sitemap.xml` (index) → `/sitemaps/pages|content|guides|jobs|events|landing.xml` with lastmod, xhtml:link hreflang alternates and image entries. Only indexable, published, open content. |
| robots.txt | Private areas blocked on segment boundaries (`/r$`, `/r/`, `/r?` …). *Fixed:* the former `Disallow: /r` also blocked every Russian page (`/ru/…`) and `/register`. |
| Images | Stock photos (images.unsplash.com) and CMS photos (`/uploads/<stamp>-<hex>.*`) are served from our own origin, resized to the displayed width and re-encoded as WebP: `/api/img/<width>/<base64url(source)>.webp` (`server/src/lib/imageProxy.ts`; URLs built by `client/src/lib/img.ts` `sized` / `srcSet`). Source allowlist (images.unsplash.com + `IMAGE_PROXY_HOSTS`), width presets, no redirects followed, disk cache `uploads/cache/img` (excluded from backups, pruned daily above `IMAGE_CACHE_MAX_MB`, default 2048), `Cache-Control: public, max-age=31536000, immutable`; upstream failure → 302 to the original. No third-party photo origin to connect to any more (the preconnect to Unsplash is gone; CSP `img-src 'self'` covers it). WebP only: AVIF would cost several times the CPU per conversion for a few % fewer bytes. |
| Performance | Server-rendered first paint (above), hashed assets immutable (1 year, Brotli), unhashed images/icons 1 week, font preloaded with `font-display: swap`, CLS 0, no entrance animation on server-rendered content, first list image eager with `fetchpriority=high`, non-essential chunks (other languages, AI advisor, extras) after `load`. Lighthouse mobile (local production build behind Caddy): LCP 1.1–1.2 s and performance 0.85–0.98 on home (all languages), visas, services, jobs, guides, news articles, about, contact, tools; the news list ~5 s before the image cache (its LCP was the first cover photo from Unsplash, on a second connection); now a same-origin WebP of the displayed width, eager with `fetchpriority=high`. The home page is server-rendered completely (all sections, not only the hero): the `.mobile-rail` snap carousels no longer scroll themselves at layout (no start padding: the first card's snap position is scrollLeft 0 — same flush-left look as before), which used to stop Chrome from recording the LCP. Before: LCP 5–6 s (same build without SSR), live 3.8–4 s (lab from a Linux container). Lighthouse on a Windows PC with ESET web protection reports ~10 s: ESET decompresses every response, so Chrome sees 4× the real transfer — measure with PageSpeed Insights or from a container. |
| Misc | theme-color, manifest, SVG + 192 px PNG favicon, `/favicon.ico`, RSS per language, search page `noindex`, private areas `noindex`. |

## Search Console in the admin panel

Admin → Sayt → **Google axtarış nəticələri** (`/admin/search-performance`, ADMIN+): clicks, impressions, CTR and average
position of the last 28 days, top queries and top pages (`server/src/lib/searchConsole.ts`, cached 6 h, "Refresh"
re-fetches when the data is older than 10 minutes). Setup (the page shows these steps while it is not configured):

1. Google Cloud Console → project → enable "Google Search Console API"; IAM → Service accounts → create one, download a JSON key.
2. Search Console → Settings → Users and permissions → Add user: the service account e-mail, permission "Restricted".
3. Server `.env`: `GSC_SERVICE_ACCOUNT_JSON` (key file content, as is or base64) and `GSC_SITE_URL`
   (`sc-domain:triad-vision.de` for the domain property), restart the API. The key is never logged or returned.

## How to verify

- Rich Results Test (paste URL, "Googlebot smartphone"): <https://search.google.com/test/rich-results>
  - a vacancy: `https://triad-vision.de/de/jobs/<slug>` → "Job posting" valid
  - `https://triad-vision.de/faq`, `https://triad-vision.de/de/visas/lkw-fahrer` → FAQ, breadcrumbs
  - `https://triad-vision.de/de/guides/blaue-karte-eu` → Article, FAQ, breadcrumbs
- Schema validator (all types, also non-rich ones): <https://validator.schema.org/>
- Status codes as Googlebot:
  `curl -s -o /dev/null -w "%{http_code}\n" -A "Googlebot" https://triad-vision.de/this-does-not-exist` → `404`
  (also `/visas/nonexistent`, `/jobs/nonexistent`; `/visas/` → `301`).
- robots.txt tester: Search Console → Settings → robots.txt; check that `https://triad-vision.de/ru/visas` is allowed.

## Owner actions

1. **Google Search Console**: <https://search.google.com/search-console> → Add property → **Domain** →
   `triad-vision.de`. The TXT record you added for Postmaster Tools is a Google site-verification record of the
   same account, so the property usually verifies at once (if not, add the TXT value Search Console shows in
   Cloudflare DNS). The site also carries a `google-site-verification` meta tag (URL-prefix property).
   - Sitemaps → submit `https://triad-vision.de/sitemap.xml`.
   - URL inspection → "Request indexing" for `/`, `/de`, `/ru`, `/jobs`, `/de/jobs`, `/for-employers`, `/de/for-employers`
     (the Russian pages were blocked by robots.txt until this release: request them first).
   - Watch: Pages (indexing), Enhancements → Job postings / FAQ / Breadcrumbs, Core Web Vitals.
   - Settings → International targeting is gone; hreflang does this job — nothing to set.
2. **Bing Webmaster Tools**: <https://www.bing.com/webmasters> → "Import from Google Search Console" (takes over
   the site and sitemaps). Also covers Yandex-like engines via IndexNow if enabled later.
3. **Google Business Profile** for each office (Baku, Berlin): name exactly "Triad Vision", address and phone
   exactly as in the site footer / Admin → Settings → Contact (NAP consistency), website
   `https://triad-vision.de/` (Baku: `/`, Berlin: `/de`), category "Employment agency". Ask clients for Google
   reviews there (the site's review-request flow already links to Google) — reviews belong on Google, not in our markup.
4. **Vacancies**: always set a closing date (`closesAt`) — it becomes `validThrough`; close filled jobs promptly
   (a stale job posting can lead to a manual action). Show the employer name when the contract allows: postings
   with a named employer perform better than "confidential". Fill the city and postal code.
5. **Translations**: CMS items without Turkish/Ukrainian text are not indexed in tr/uk. Add `tr` / `uk` texts to
   visas, services and news (Admin → content) to win those languages.

## Content suggestions (landing pages / guides to add)

Write these as guides (`/guides`, one per language) or landing pages; each needs real, current facts.

| Language | Topic | Target queries |
| --- | --- | --- |
| az | Almaniyada sürücü işi (C/CE, kod 95, Führerschein çevirmə) | "Almaniyada sürücü işi", "Almaniyada TIR sürücüsü" |
| az | Almaniya iş vizası: addım-addım (§ 18a/b, § 19c, səfirlik Bakı) | "Almaniya iş vizası", "Almaniyaya iş vizası necə almaq olar" |
| az | Almaniyada iş elanları — peşələr və maaşlar 2026 | "Almaniyada iş", "Almaniyada maaşlar" |
| az | Ausbildung Almaniya: ixtisaslar, B1, maaş | "Ausbildung Almaniya", "Almaniyada pulsuz təhsil və iş" |
| ru | Работа в Германии для азербайджанцев | "работа в Германии для азербайджанцев", "работа в Германии из Баку" |
| ru | Рабочая виза в Германию: документы и сроки | "виза в Германию для работы", "рабочая виза Германия 2026" |
| ru | Водитель C/CE в Германии | "работа водителем в Германии", "водитель CE Германия вакансии" |
| ru | Ausbildung в Германии для иностранцев | "Ausbildung в Германии", "обучение и работа в Германии" |
| de | Fachkräfte aus Aserbaidschan einstellen (Ablauf, Dauer, Kosten, § 81a beschleunigtes Verfahren) | "Fachkräfte aus Aserbaidschan", "Fachkräfte aus Drittstaaten" |
| de | Berufskraftfahrer aus Drittstaaten (Führerschein-Umschreibung, BKrFQG, Kosten) | "Berufskraftfahrer aus Drittstaaten", "LKW-Fahrer aus dem Ausland" |
| de | Pflegekräfte aus dem Ausland (Anerkennung, Anpassungslehrgang, Kenntnisprüfung) | "Pflegekräfte aus dem Ausland", "ausländische Pflegekräfte einstellen" |
| de | Azubis aus dem Ausland gewinnen | "Auszubildende aus dem Ausland", "Azubis aus Drittstaaten" |
| en / tr / uk | Translate the strongest az/ru guides first; tr/uk CMS texts (see owner action 5) | — |

**Status:** the az / ru / de / en drafts were reviewed and published on production on 2026-11-13 (one-off script).
Turkish and Ukrainian versions of the five job-seeker guides (driver-jobs, work-visa, salary-net, first-month,
jobs-azerbaijan) were added on 2026-11-14 (`guideDrafts/tr.ts`, `uk.ts`: faithful translations of the checked en / ru
texts); because their facts are already checked, the seed creates these tr / uk rows **published**
(`PUBLISHED_ON_CREATE`), while new rows of other languages are still created unpublished. Existing rows are never
touched. Hreflang alternates are by guide key, so each tr / uk page is an alternate of its az / ru / en versions.

History: these topics were first seeded as UNPUBLISHED guide drafts (seed `server/prisma/seed/guideDrafts/`, keys driver-jobs,
work-visa, salary-net, first-month, jobs-azerbaijan in az/ru (+ en for the first two), employer-azerbaijan (de, en),
employer-drivers, employer-nursing, employer-apprentices, fast-track-81a (de)). Review them in Admin → Guides
(`/admin/guides`): facts to confirm are marked `[YOXLA: …]` / `[ПРОВЕРИТЬ: …]` / `[PRÜFEN: …]` / `[CHECK: …]`, and the
API refuses to publish a guide that still contains such a marker. Drafts are not in the sitemap and answer 404 to crawlers.

## Next steps (not done here)

- **Performance**: ~300 KB (Brotli) of JavaScript load on every public page (React, framer-motion, the app
  shell); it no longer delays the first paint, but it costs hydration time (TBT 150–600 ms). Next levers:
  framer-motion `LazyMotion`, per-language copy chunks.
- Google **Indexing API** for job postings (instant add/remove; needs a service account in Search Console).
- Visible "related jobs" block on the job page (the crawlable HTML already links them).
