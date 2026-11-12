# Triad Vision — davam etmək üçün qeyd (handoff)

Yazılıb: 2026-11-13. Bu fayl başqa kompüterdə / başqa Claude sessiyasında işi qaldığımız yerdən davam etdirmək üçündür.
Repo publicdir: bura parol, server IP-si, şəxsi məlumat yazılmır.

## 1. Hazırkı vəziyyət

- `main` = **c8b7b2d** (Analytics overview), production-a deploy olunub, CI yaşıl.
- Davam edən iş **`wip/seo-2026-11`** branch-indədir (main-ə deyil, ona görə deploy olmur).
  - Branch-də yalnız bu fayl varsa → SEO işi köhnə kompüterdə bitməyib / gəlməyib, 4-cü bölmədəki tapşırıqları yenidən başlat.
  - Branch-də "SEO: …" commit-i varsa → 5-ci bölmədəki yoxlamaları et, sonra main-ə birləşdir.

Son deploy olunan round-lar (ən yenisi yuxarıda):
1. `c8b7b2d` — Admin → **İcmal** (`/admin/overview`) analitika səhifəsi, SVG qrafik dəsti (`client/src/components/charts/`), Analytics/BizAnalytics yeni qrafiklərdə.
2. `de4a782` — vakansiya ↔ Drive arxiv qovluğu; Drive "İş axınına kopyala" + Schon geschrieben → In Bearbeitung → Fertig/Ablehnung; partnyor müştəri kvotası + ⓘ info paneli; superadmin üçün @triad-vision.de poçt qutuları.
3. `f41b9da` — şirkət/partnyor hüquqi rekvizitləri, müqavilələr, əlaqə şəxsləri; müştəri zaman xətti, SMS/WhatsApp xatırlatma, yükləmədən əvvəl pasport yoxlaması; işçi səhər xülasəsi + performans hesabatı; qurumlar kataloqu; şirkət portalında namizədə səs + gəliş checklisti; `deploy/backup-verify.sh`.

## 2. Sahibkardan cavab gözləyən suallar

1. Həftəlik backup yoxlaması: serverdə cron qurulsun? (əmrlər `deploy/README-ci.md` → "Backup restore test (weekly)"; root SSH lazımdır).
2. Səhər məktubları: köhnə task-digest və SLA-digest yalnız portal bildirişi olsun ki, işçiyə səhər 1 məktub getsin?
3. Google Search Console: sahibkar saytı əlavə edib təsdiq kodunu verməlidir (SEO round-u bunun üçün yer hazırlayır).
4. SMS/WhatsApp real göndərmə üçün Twilio / WhatsApp açarları serverdə yoxdur (indi yalnız log-a yazılır).

Cavablanmış qərarlar: Ablehnung hər mərhələdən mümkündür; "Müştəri əlavə et"də başqa partnyorun müştəriləri gizlədilmir ("hazırda: X" kimi görünür).

## 3. İş qaydaları (köhnə kompüterin Claude yaddaşından)

- Sahibkarla **yalnız Azərbaycan dilində** yaz (status mesajları, suallar da). Böyük, tam round-lar istəyir: təklif siyahısı → hamısını et → yoxla → hesabat.
- **Push/deploy yalnız sahibkar deyəndə** ("push et", "deploy ele", "beli/he" deploy sualına).
- `main`-ə push = GitHub Actions: typecheck, build, unit, 12 e2e shard, sonra avtomatik deploy (əvvəl backup). Push-dan sonra `deploy/push.sh` işlətmə (CI deploy ilə toqquşur). Push-dan əvvəl həmişə `git fetch`.
- CI nəticəsi: `https://api.github.com/repos/BlackM1rr0R/triad-vision/actions/runs?head_sha=<sha>`; xətalar: `/check-runs/<jobId>/annotations`.
- Lokalda tam vitest dəstini işlətmə (CI edir): typecheck + client build + `node scripts/ci/check-csp-hash.mjs client/dist/index.html` + `node scripts/ci/a11y-smoke.mjs --dir client/dist` + unit (`npx vitest run --project unit`) + toxunulan e2e faylları.
- Paralel agentlər: hər biri ayrıca test DB (`TEST_DB_NAME=triad_test_<ad>` — `triad` istifadəçisinin `triad_test_%` icazəsi var), miqrasiyanı əl ilə yazır, `prisma format` / `migrate diff` işlətmir; sonda `migrate diff` boş olmalıdır.
- Heç vaxt commit etmə: `.env*`, `XTA.xlsx.pdf` (`.git/info/exclude`), whitelabel license private key, müştəri Excel-lərindəki parollar. OpenRouter açarı yalnız `server/.env` və serverdə.
- Bəzi fayllar CRLF-dir: redaktədə sətir sonlarını qoru (bütöv-fayl diff olmasın).
- Hesablaşma (XTA) qaydaları: "rawot" = ləğv/imtina → pay yoxdur; viza imtinası ("atkaz") → bütün vasitəçi payları ləğv; import yalnız admin preview ilə; cədvəlin 6-cı səhifəsindəki e-poçt+parolu heç vaxt idxal etmə/saxlama. XTA idxalı sahibkar tərəfindən edilib, daha yoxlama.
- Cloudflare: domen narıncı buludla (proxied); `mail.` qeydi DNS only. Origin IP-ni heç yerə yazma.

## 4. SEO round-u (davam edir)

Sahibkarın istəyi: "Almaniyada viza, iş vizası, Ausbildung və bu sənədlərlə bağlı hər şeyi əlavə et, SEO ideal olsun."

Mövcud baza (yoxlanıb): botlar üçün server-render meta + body (`server/src/lib/seo.ts`, `seoBody.ts`, `seoCatalogue.ts`, `routes/seo.ts`), sitemap index (pages/content/guides, ~324 URL), FAQPage/Breadcrumb/Organization JSON-LD, 6 dil (az kök, de/en/ru/tr/uk prefiks; CMS mətnləri az/de/en/ru, tr/uk → en fallback). Viza səhifələri yalnız 3 idi: lkw-fahrer, kurierfahrer, ausbildung.

İki paralel tapşırıq (eyni slug-larla):

**A. Məzmun** (content seed mexanizmi ilə, admin redaktələrini əzmədən, slug üzrə insert-if-missing):
- Viza: `arbeitsvisum-fachkraefte`, `blaue-karte-eu`, `chancenkarte`, `erfahrungssaeule`, `anerkennungspartnerschaft`, `pflegefachkraft`, `studium`, `sprachkurs`, `familiennachzug`, `ausbildung` (genişləndir).
- Bələdçilər: `sened-siyahisi-is-vizasi`, `sened-siyahisi-ausbildung`, `diplomun-taninmasi-anerkennung`, `sperrkonto-2026`, `vorabzustimmung-bundesagentur`, `sefirlik-termini-baki`, `viza-qiymeti-ve-muddeti`, `alman-dili-seviyyesi-teleblari`, `terceume-ve-apostil`, `viza-imtinasi-sebebleri`.
- Hər fakt yalnız rəsmi mənbədən (make-it-in-germany.com, auswaertiges-amt.de / baku.diplo.de, bamf.de, arbeitsagentur.de, anerkennung-in-deutschland.de, gesetze-im-internet.de); təsdiqlənməyən rəqəm yazılmır; hər səhifədə mənbələr + "Son yoxlama" tarixi. Title ≤60, description ≤155.

**B. Texniki SEO** (`seo.ts`, `seoBody.ts`, `seoCatalogue.ts`, `routes/seo.ts`):
- Prod audit (Googlebot UA): title/description/H1/canonical/hreflang/JSON-LD/OG/404/sitemap.
- "Almaniyaya viza" hub səhifəsi (viza növləri müqayisə cədvəli, bütün viza və bələdçi linkləri — yalnız mövcud slug-lara, FAQ, uyğunluq testinə CTA) + "Sənədlər" hub-ı, 6 dildə.
- Schema: Service, HowTo, Article, Breadcrumb, WebSite SearchAction, ofis üçün ProfessionalService.
- Əlaqəli səhifələr blokları (bot body-də də), tr/uk fallback-də dublikat məzmun həlli (hreflang/canonical/noindex), Core Web Vitals, IndexNow, Search Console təsdiq yeri.

## 5. Branch-də iş gəlibsə — bitirmə addımları

```bash
git fetch && git switch wip/seo-2026-11
cd server && npm ci && npx prisma migrate deploy && npx prisma generate
npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma \
  --shadow-database-url mysql://triad:triad_dev_password@localhost:3308/prisma_migrate_shadow_db_manual --script   # boş olmalıdır
npm run typecheck && npx vitest run --project unit
cd ../client && npm ci && npm run build && cd .. \
  && node scripts/ci/check-csp-hash.mjs client/dist/index.html && node scripts/ci/a11y-smoke.mjs --dir client/dist
```
Sonra sahibkara Azərbaycan dilində hesabat ver və icazə ilə: `git switch main && git merge --ff-only wip/seo-2026-11` (və ya merge) → `git push origin main` → CI-ni izlə → canlı saytı yoxla (`/sitemap.xml`, yeni `/visas/<slug>` səhifələri Googlebot UA ilə).

## 6. Yeni kompüterdə lokal mühit

- Docker Desktop + MySQL 8.4 konteyneri, port **3308**, istifadəçi `triad` / `triad_dev_password`, DB `triad_vision` (test DB-lər `triad_test_*`). `docker-compose.yml`-a bax.
- `server/.env` köhnə kompüterdədir — yeni kompüterdə `server/.env.example`-dan yarat (açarları sahibkar özü daxil edir; çata yapışdırılmasın).
- API `localhost:4000`, Vite `localhost:5173`.
- Production-a SSH açarı yalnız köhnə kompüterdədir; deploy üçün lazım deyil (CI edir).
- Windows-da Git Bash: başda `/` olan arqumentlər üçün `MSYS_NO_PATHCONV=1`; Python patch skriptlərini faylda yaz və `python -I` ilə işlət.
