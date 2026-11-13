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
| Crawlable body | Server-rendered text, navigation, breadcrumbs, lists and footer NAP inside `#root` (`/__seo/body`) for crawlers without JavaScript. Job pages: salary, type, city, other jobs, visa links. |
| Status codes | Unknown URLs, missing/unpublished content, closed or expired vacancies and past events answer **HTTP 404** (same SPA page for visitors). Trailing slash → 301 to the bare path; old aliases (`/calculators`, `/workers`, `/candidates`, `/employers`) → 301; http → https, www → apex (Caddy/Cloudflare). |
| Google for Jobs | `JobPosting` on every open vacancy: title, HTML description, datePosted, validThrough, employmentType, hiringOrganization (employer name if shown on the page, otherwise `"confidential"` as Google asks for agencies), jobLocation with locality / region / postal code / `DE`, baseSalary EUR per MONTH, directApply, identifier, image, occupation (KldB), experience. Closed / expired → 404 and out of the sitemap. |
| Other structured data | Organization + WebSite (home), ProfessionalService per office (home, contact; same NAP as the footer), BreadcrumbList (inner pages), FAQPage (FAQ, visa pages, guides, compare page — only FAQs visible on the page), Article (guides), NewsArticle (news), Service (service pages, packages), Event (info sessions), WebApplication (calculators), VideoObject (video stories), Book (e-books), ItemList (guides, tools). **No AggregateRating/Review** on our own organisation: self-serving reviews are not eligible for rich results. |
| Sitemaps | `/sitemap.xml` (index) → `/sitemaps/pages|content|guides|jobs|events|landing.xml` with lastmod, xhtml:link hreflang alternates and image entries. Only indexable, published, open content. |
| robots.txt | Private areas blocked on segment boundaries (`/r$`, `/r/`, `/r?` …). *Fixed:* the former `Disallow: /r` also blocked every Russian page (`/ru/…`) and `/register`. |
| Performance | Hashed assets immutable (1 year, Brotli), unhashed images/icons 1 week, font preloaded with `font-display: swap`, CLS 0. Lighthouse (mobile, live /de): SEO 100, best practices 100, accessibility 96, performance ~56 — LCP is text painted after the JS bundle boots (see "Next steps"). |
| Misc | theme-color, manifest, SVG + 192 px PNG favicon, `/favicon.ico`, RSS per language, search page `noindex`, private areas `noindex`. |

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

## Next steps (not done here)

- **Performance**: LCP on mobile ~10 s (Lighthouse simulation) because the first paint waits for the JS bundle
  (framer-motion ~140 KB and React boot on every page). Options: render the hero text without waiting for
  animations, lazy-load framer-motion, or prerender the hero HTML. This is the largest remaining ranking factor.
- Google **Indexing API** for job postings (instant add/remove; needs a service account in Search Console).
- Visible "related jobs" block on the job page (the crawlable HTML already links them).
