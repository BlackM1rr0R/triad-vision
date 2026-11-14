# SEO — status and owner checklist

Short reference for triad-vision.de. Code: `server/src/lib/seo.ts` (head tags, JSON-LD, sitemaps, robots,
status codes), `seoBody.ts` (crawlable HTML), `seoCatalogue.ts` (static page texts, route list),
`deploy/Caddyfile` + `client/index.html` (server-side includes, 404s, redirects).

## What is implemented

| Area | How |
| --- | --- |
| Languages / URLs | az at `/` (also x-default), `/de` `/en` `/ru` `/tr` `/uk`. `?lng=xx` and `/az/…` → one 301 to the clean URL (Caddy `@lnglegacy`): `/salary-calculator?lng=ru` → `/ru/salary-calculator`, `lng=az` / unknown / empty → bare path, other query parameters kept, trailing slash dropped in the same hop, value case-insensitive (`RU`, `ru-RU`); on a prefixed path the prefix wins (`/de/jobs?lng=ru` → `/de/jobs`). Private areas (= `PRIVATE_PREFIXES`) keep `?lng=`. Checked in CI by `deploy/caddy-redirects-test.sh` (real Caddy container) and `tests/unit/seoTechnical.test.ts` (exclusion list = `PRIVATE_PREFIXES`). Canonicals and hreflang never carry a query. |
| Head tags | Per page and language: `<title>` ≤ 60 (keyword first, the terms from Search Console, "2026" on the calculators), description 120–155 on static pages, unique per language (`tests/unit/seoTechnical.test.ts`), self canonical, hreflang (+ x-default), Open Graph incl. `og:locale` / `og:locale:alternate`, Twitter card, `<html lang>`. Rendered server-side by Caddy for every page; after hydration the document keeps the same SEO `<title>` (`client/src/lib/usePageTitle.ts`: the head fragment's title wins on public pages). |
| hreflang | Static pages: all six languages. CMS items (visas, services, news, jobs, events, e-books): only the languages the item is written in; e.g. `/tr/visas/x` showing English text has its canonical on `/en/visas/x` and no hreflang. Guides: each language's own slug. Landing pages: one language. |
| Server-rendered pages | Public pages arrive with their real markup inside `#root`, rendered per request by the `ssr` service (React `prerender` of the same app, `client/src/entry-server.tsx`, `client/ssr/server.mjs`; Caddy includes it, the browser hydrates it). Visitors and crawlers see the page before the JavaScript runs. Data: public queries only (CMS content, visas, services, news, jobs, guides…), fetched anonymously and shipped as JSON next to the markup. |
| Crawlable body (fallback) | When the SSR service is down, slow (> 1.5 s) or the path is private: plain semantic HTML from the API inside `#root` (`/__seo/body`) for crawlers without JavaScript — navigation, breadcrumbs, lists, footer NAP; job pages: salary, type, city, other jobs, visa links. |
| Status codes | Unknown URLs, missing/unpublished content, closed or expired vacancies and past events answer **HTTP 404** (same SPA page for visitors). Trailing slash → 301 to the bare path; old aliases (`/calculators`, `/workers`, `/candidates`, `/employers`) → 301; http → https, www → apex (Caddy/Cloudflare). |
| Google for Jobs | `JobPosting` on every open vacancy: title, HTML description, datePosted, validThrough, employmentType, hiringOrganization (employer name if shown on the page, otherwise `"confidential"` as Google asks for agencies), jobLocation with locality / region / postal code / `DE`, baseSalary EUR per MONTH, directApply, identifier, image, occupation (KldB), experience. Closed / expired → 404 and out of the sitemap. |
| Other structured data | Organization + WebSite (home), ProfessionalService per office (home, contact; same NAP as the footer), BreadcrumbList (inner pages), FAQPage (FAQ, visa pages, guides, compare page — only FAQs visible on the page; the tool articles (salary, Chancenkarte, Blue Card, cities), `/anerkennung` and `/ausbildung` render theirs inside the page markup, `client/src/components/seo/FaqJsonLd.tsx`), Article (guides), NewsArticle (news), Service (service pages, packages), Event (info sessions), WebApplication (calculators, checks, `/cities`, the visa quizzes; price 0), VideoObject (video stories), Book (e-books), ItemList (guides, tools). **No AggregateRating/Review** on our own organisation: self-serving reviews are not eligible for rich results. |
| Profession × city pages | `/jobs/in/<city>/<profession>` (e.g. `/de/jobs/in/hamburg/lkw-fahrer`), `server/src/lib/jobLandings.ts`: one page per combination of canonical profession (`lib/matching.ts`, vacancy profession or title) and city that has at least one live vacancy — otherwise **404** and out of the sitemap (no thin pages). Title, description, H1 and intro generated in all six languages from the page's facts (count, salary range, federal state, employment types); hreflang = all six languages; ItemList of the vacancy URLs (each vacancy page keeps its own JobPosting). Linked from each vacancy page ("more … jobs in …"), from `/jobs` (crawler HTML) and from each other (same city / same profession). Data: `GET /api/vacancies/landing/:city/:profession?lng=`. |
| Sitemaps | `/sitemap.xml` (index) → `/sitemaps/pages|content|guides|jobs|events|landing.xml` with lastmod, xhtml:link hreflang alternates and image entries. Only indexable, published, open content. |
| robots.txt | Private areas blocked on segment boundaries (`/r$`, `/r/`, `/r?` …). *Fixed:* the former `Disallow: /r` also blocked every Russian page (`/ru/…`) and `/register`. |
| Images | Stock photos (images.unsplash.com) and CMS photos (`/uploads/<stamp>-<hex>.*`) are served from our own origin, resized to the displayed width and re-encoded as WebP: `/api/img/<width>/<base64url(source)>.webp` (`server/src/lib/imageProxy.ts`; URLs built by `client/src/lib/img.ts` `sized` / `srcSet`). Source allowlist (images.unsplash.com + `IMAGE_PROXY_HOSTS`), width presets, no redirects followed, disk cache `uploads/cache/img` (excluded from backups, pruned daily above `IMAGE_CACHE_MAX_MB`, default 2048), `Cache-Control: public, max-age=31536000, immutable`; upstream failure → 302 to the original. No third-party photo origin to connect to any more (the preconnect to Unsplash is gone; CSP `img-src 'self'` covers it). WebP only: AVIF would cost several times the CPU per conversion for a few % fewer bytes. |
| Performance | Server-rendered first paint (above), hashed assets immutable (1 year, Brotli), unhashed images/icons 1 week, font preloaded with `font-display: swap`, CLS 0, no entrance animation on server-rendered content, first list image eager with `fetchpriority=high`, non-essential chunks (other languages, AI advisor, extras) after `load`. Lighthouse mobile (local production build behind Caddy): LCP 1.1–1.2 s and performance 0.85–0.98 on home (all languages), visas, services, jobs, guides, news articles, about, contact, tools; the news list ~5 s before the image cache (its LCP was the first cover photo from Unsplash, on a second connection); now a same-origin WebP of the displayed width, eager with `fetchpriority=high`. The home page is server-rendered completely (all sections, not only the hero): the `.mobile-rail` snap carousels no longer scroll themselves at layout (no start padding: the first card's snap position is scrollLeft 0 — same flush-left look as before), which used to stop Chrome from recording the LCP. Before: LCP 5–6 s (same build without SSR), live 3.8–4 s (lab from a Linux container). Lighthouse on a Windows PC with ESET web protection reports ~10 s: ESET decompresses every response, so Chrome sees 4× the real transfer — measure with PageSpeed Insights or from a container. |
| Internal links | Guides ↔ tools from one map (`server/src/lib/seoLinks.ts` = `client/src/lib/guideTools.ts`, test checks both): the tools box next to each guide, "Related guides" under the salary calculator, cities and budget pages, and the same links in the crawler HTML (guide → its tools; tool → its guides first). |
| Misc | theme-color, manifest, SVG + 192 px PNG favicon, `/favicon.ico`, RSS per language, search page `noindex`, private areas `noindex`. |

## Search Console in the admin panel

Admin → Sayt → **Google axtarış nəticələri** (`/admin/search-performance`, ADMIN+): clicks, impressions, CTR and average
position of the last 28 days, top queries and top pages (`server/src/lib/searchConsole.ts`, cached 6 h, "Refresh"
re-fetches when the data is older than 10 minutes). Setup (the page shows these steps while it is not configured):

1. Google Cloud Console → project → enable "Google Search Console API"; IAM → Service accounts → create one, download a JSON key.
2. Search Console → Settings → Users and permissions → Add user: the service account e-mail, permission "Restricted".
3. Server `.env`: `GSC_SERVICE_ACCOUNT_JSON` (key file content, as is or base64) and `GSC_SITE_URL`
   (`sc-domain:triad-vision.de` for the domain property), restart the API. The key is never logged or returned.

Below the top queries and pages, the page shows **Opportunities** computed from the 28-day data: striking-distance
queries and pages (average position 4–20); low-CTR rows (≥ 20 impressions and CTR below half the expected CTR for the
position: 1 ≈ 28 %, 2 ≈ 15 %, 3 ≈ 10 %, 4–5 ≈ 6 %, 6–10 ≈ 3 %, 11–20 ≈ 1 %); a per-language breakdown (az/de/en/ru/tr/uk
from the URL prefix, position weighted by impressions); and duplicate-looking URLs (`?lng=`, `/az/`, www, http, trailing
slash, other query strings), each mapped to its clean URL and marked as redirected (301) or not. **Indexing check (URL
Inspection)** inspects 42 key URLs (7 pages × 6 languages) on demand through the URL Inspection API with the same service
account (`GET /api/admin/search-console/inspection`): coverage, last crawl and Google's chosen canonical, with a marker
when it differs from the inspected URL; cached 24 h, "Check again" only after 1 h (quota 2000 URLs/day).

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

**Profession recognition guides** (2026-11-14, `server/prisma/seed/guideDrafts/professions/`, for queries such as
"подтверждение диплома повара / архитектора / бухгалтера в германии"): keys `anerkennung-koch`, `-architekt`,
`-buchhalter`, `-oekonom`, `-zahnarzt`, `-arzt`, `-ingenieur`, `-elektroniker` in az, ru, de, en (tr / uk see the en
version). Facts were checked against official sources when written and the texts have no review placeholder, so the
seed creates these rows **published** in every language (`PUBLISHED_ON_CREATE_KEYS` / `publishedOnCreate` in
`guideDrafts/index.ts`); insert-only like every draft. Nurses and truck drivers link to the existing `pflege` and
`driver-jobs` guides. `/anerkennung` lists them in a "by profession" block (client page and crawler body,
`seoBody.ts`), and the selected profession links to its guide. Re-check fees and the 2026 Heilberufe law
(Kenntnisprüfung as standard route since 1 Nov 2026) once a year.

History: these topics were first seeded as UNPUBLISHED guide drafts (seed `server/prisma/seed/guideDrafts/`, keys driver-jobs,
work-visa, salary-net, first-month, jobs-azerbaijan in az/ru (+ en for the first two), employer-azerbaijan (de, en),
employer-drivers, employer-nursing, employer-apprentices, fast-track-81a (de)). Review them in Admin → Guides
(`/admin/guides`): facts to confirm are marked `[YOXLA: …]` / `[ПРОВЕРИТЬ: …]` / `[PRÜFEN: …]` / `[CHECK: …]`, and the
API refuses to publish a guide that still contains such a marker. Drafts are not in the sitemap and answer 404 to crawlers.

## Tool articles (salary, Chancenkarte, Blue Card, cities)

For the queries the tools already rank for (Search Console, 2026-11: "калькулятор налогов в германии", "brutto netto
калькулятор германия", "salary calculator germany", "chancenkarte punktesystem rechner", "almaniya şəhərləri"…),
`/salary-calculator`, `/chancenkarte-calculator`, `/blue-card-check` and `/cities` carry a server-rendered article
with an always-visible FAQ in all six languages: text in `client/src/lib/seoContent/*.ts`, rendered by
`client/src/components/seo/ContentArticle.tsx`. Figures are not typed into the text: euro amounts are
`{{placeholders}}` filled from the payroll parameters (`server/src/lib/budget/params.ts`), the payroll engine
(worked examples: truck driver 3,000 €, nurse 3,500 €, electrician 3,200 €), the Chancenkarte scorer and the city
data. `server/tests/unit/seoContent.test.ts` checks structure parity across languages, placeholders and that the
written-out rates match the parameters. **Yearly update**: after changing `params.ts` for a new year, update the
rate percentages in `seoContent/salary.ts`, `BLUE_CARD_HISTORY` in `seoContent/blueCard.ts`, `CONTENT_CHECKED` in
`seoContent/types.ts` — the test fails until they agree.

## Updating the text of a shipped guide

`seedGuides` is insert-only, so editing `server/prisma/seed/guides/*.ts` does not change guides already in the
database. `server/prisma/seed/guides/revisions.ts` (`seedGuideRevisions`, run by the seed on every deploy after
`seedGuides` / `seedGuideCalculators`) brings an existing row to the new seed text **field by field** (title,
description, body, FAQ) **only if that field still equals the previously shipped text** (SHA-256 of the
normalised value; CRLF/whitespace-insensitive). Anything the owner edited in Admin → Guides is kept. Each
(revision, language) runs once (setting `seed.guides.revisions`), so restoring an old text later is respected.
To ship a revision: compute `guideRevisionHashes(guide)` of the current (shipped) version **before** editing the
seed file, paste the hashes as `previous` of a new entry with a new id, then edit the seed file
(`server/tests/unit/guideRevisions.test.ts` fails if a revision would be a no-op).

First revision (2026-11, `blue-card-2026-11-mindestgehalt`): Blue Card guide in all six languages — title with
"2026" + minimum salary (de "Blaue Karte EU 2026: Mindestgehalt, Gehaltsgrenze, Antrag", slug unchanged), 4-row
threshold table (standard 50,700 €; shortage occupations, recent graduates, IT without degree 45,934.20 €; BA
approval), derivation from the pension ceiling with 2024–2026 table (BMI notice of 2 Dec 2025, BAnz AT 18.12.2025
B3), net at both thresholds from the payroll engine, and an FAQ on how the threshold is calculated.

## Next steps (not done here)

- **Performance**: ~300 KB (Brotli) of JavaScript load on every public page (React, framer-motion, the app
  shell); it no longer delays the first paint, but it costs hydration time (TBT 150–600 ms). Next levers:
  framer-motion `LazyMotion`, per-language copy chunks.
- Google **Indexing API** for job postings (instant add/remove; needs a service account in Search Console).
- Visible "related jobs" block on the job page (the crawlable HTML already links them).
