# White-label: platformanı başqa agentliklərə satmaq / Selling the platform to other agencies

**Model:** hər agentlik üçün **ayrı instansiya** — öz serveri (VM), öz domeni, öz MySQL bazası, öz yükləmələri, öz brendi.
Bir bazada multi-tenancy yoxdur. Kod və Docker image-ləri hamı üçün eynidir; fərq yalnız konfiqurasiyadadır
(`.env.production`, `System → Brend`, lisenziya açarı).

**Model:** one **separate instance per agency** — own server (VM), own domain, own MySQL database, own uploads, own brand.
No multi-tenancy inside one database. Same code and images everywhere; per-instance differences are configuration only.

---

## Azərbaycanca

### Nə konfiqurasiya olunur

| Nə | Harada |
|---|---|
| Brend adı, qısa ad, şüar, hüquqi şəxs, dəstək e-poçtu, telefon, ölkə, təsvir, e-poçt altlığı, göndərən adı/ünvanı, dillər | `.env.production` (`BRAND_*`) → `System → Brend` paneli (SUPER_ADMIN) üstün gəlir |
| Loqo (açıq/tünd fon), favicon + PWA ikonları (bir kvadrat şəkildən sharp ilə bütün ölçülər) | `System → Brend` → yükləmə (hər fayl PNG kimi yenidən kodlanır) |
| Rənglər | `System → Brend` daxilindəki mövzu qurucusu (Setting `theme`) |
| Ofislər, iş saatları, WhatsApp, sosial şəbəkələr | `Admin → Parametrlər` (Setting `contact`, `social`) — təkrarlanmır |
| İmpressum / müqavilələrdəki şirkət məlumatları | `Admin → Hüquqi məlumatlar` (Setting `legal`) |
| Modullar və əməkdaş limiti | lisenziya açarı (`LICENSE_KEY`) + `System → Modullar` |

Brend hər yerdə tətbiq olunur: sayt mətnləri (`{{brand}}` i18next dəyişəni, 6 dil), loqo, səhifə başlıqları, `<head>`
(Caddy `/__seo/brand` include: theme-color, favicon, app ikonları, `<meta name="tv-brand">`), dinamik
`/manifest.webmanifest`, SEO head/body/JSON-LD, RSS, OG şəkilləri, e-poçtlar (başlıq, altlıq, mövzu, göndərən),
bildirişlər / push / SMS / WhatsApp, bütün PDF-lər (fakturalar, müqavilələr, hesabatlar, CV, rəsmi formalar),
AI sistem promptları, iCal lentləri. Standart brend **Triad Vision**-dur: heç nə qurulmayıbsa sahibin saytı
əvvəlki kimi qalır (texniki: serverdə `brandify()` yalnız brend fərqli olanda mətndəki "Triad Vision",
"triad-vision.de", telefonu və s. dəyişir).

### Lisenziya

- Açar: `TV1.<payload>.<Ed25519 imza>`; payload = `{customer, domain, plan, modules, staffLimit, issuedAt, expiresAt}`.
- **İctimai açar** koddadır (`server/src/lib/license/index.ts`), **şəxsi açar yalnız sizdə** (git-ə, serverə heç vaxt).
- Davranış: etibarlı → normal; müddət bitib → 14 gün güzəşt (adminlərə banner), sonra əməkdaşlar üçün **yalnız oxumaq**;
  etibarsız (imza/domen) və ya yoxdur → dərhal yalnız oxumaq. **Müştərilər heç vaxt bağlanmır** (DSGVO).
- Plan: əməkdaş yerləri limiti (yeni əməkdaş yaratmaq/rol vermək bloklanır), plana daxil olmayan modullar gizlədilir.
- Sahibin serveri (`triad-vision.de`): `LICENSE_KEY` yoxdursa avtomatik **owner** instansiyasıdır — limitsiz, banner yox.
  Başqa domendə `LICENSE_KEY`-siz production serveri "açar yoxdur" sayılır, ona görə **hər müştəri serverində
  `INSTANCE_ROLE=customer` + `LICENSE_KEY` olmalıdır** (`new-instance.sh` yazır).
- Gündəlik və hər başlanğıcda yoxlanılır (`server/src/jobs/license.ts`). Status: `System → Lisenziya`.

Açar yaratmaq (öz kompüterinizdə):

```bash
node deploy/whitelabel/issue-license.mjs --key license-private.pem \
  --customer "Acme Visa GmbH" --domain acme-visa.de --plan pro --expires 2027-01-31
# planlar: starter (3 əməkdaş, əsas modullar) | pro (10, hamısı) | enterprise (limitsiz)
# üstələmək: --staff 5 --modules bookings,reviews,calls   |   yoxlamaq: --verify <token>
```

### İlk müştərini satmaq — addım-addım

1. **Şəxsi açarı** təhlükəsiz yerə köçürün (parol meneceri + oflayn nüsxə). İndi:
   `%TEMP%\claude\…\scratchpad\whitelabel\license-private.pem`. İtirilsə yeni cüt yaradın (`--keygen`), ictimai açarı
   koda qoyun və bütün müştərilərə yeni açar verin.
2. Müştəri üçün **Ubuntu 22.04/24.04 VM** (2 GB RAM + swap kifayətdir), SSH açarı ilə `root` girişi.
3. Müştərinin **domeni**: `A` qeydi (apex və `www`) serverin IP-sinə.
4. **Lisenziya** verin (yuxarıdakı komanda).
5. Dəyişiklikləri commit edin (skript `git archive HEAD` göndərir), sonra:
   ```bash
   BRAND_NAME="Acme Visa" ADMIN_EMAIL=boss@acme-visa.de LICENSE_KEY="TV1…" \
   SMTP_HOST=smtp.example.com SMTP_USER=no-reply@acme-visa.de SMTP_PASS=… \
   bash deploy/whitelabel/new-instance.sh root@203.0.113.10 acme-visa.de
   ```
   Skript: server hazırlığı (`deploy/server-setup.sh`), təsadüfi sirlərlə `.env.production` (`env.template`),
   sahibin mail serverisiz compose override, build + migrasiya + seed (`SEED_PROFILE=whitelabel`: Triad Vision-un rəyləri,
   statistikası, xəbərləri, əlaqə məlumatları **yoxdur**; ümumi məzmunda "Triad Vision" → brend adı), ilk SUPER_ADMIN üçün
   **birdəfəlik link** (72 saat; itirilsə `setup-link.sh`), gecəlik şifrəli backup (cron; `BACKUP_REMOTE=user@host:/path/`
   ilə serverdən kənara nüsxə).
6. Müştəri linklə şifrə qoyur → `System → Brend` (loqo, ikon, rəng), `Parametrlər` (əlaqə), `Hüquqi məlumatlar`.
7. Öz saytınızda `System → Müştəri agentliklər`: agentliyi əlavə edin, açarı yapışdırın, "Şirkət yarat" → aylıq
   hesab-fakturaları `Maliyyə → Hesab-fakturalar` bölməsində yazın.
8. Yeniləmə: `bash deploy/whitelabel/update-instance.sh root@203.0.113.10 [tag]` (əvvəl backup).
   Lisenziyanı uzatmaq: `LICENSE_KEY="TV1…" bash deploy/whitelabel/update-instance.sh root@…`.

### Bilməli olduqlarınız

- `triad-vision.de` CI ilə deploy olunur (`deploy/ci-deploy.sh` → `deploy/remote-deploy.sh`) — dəyişməyib. `remote-deploy.sh`
  yalnız `<APP_DIR>/docker-compose.instance.yml` olanda onu əlavə edir; sahibin serverində bu fayl yoxdur.
- Bir serverdə iki instansiya nəzərdə tutulmayıb (80/443 portları); hər agentlik öz VM-i.
- Brendlə dəyişməyən, sahə üzrə mətnlər: statik SEO kataloqu və sayt mətnlərində "Azərbaycandan Almaniyaya" kimi
  ifadələr, seed bələdçilərində "Bakı ofisi". Müştəri CMS-də öz məzmununu yazır; bu mətnlər fərqli bazar üçün ayrıca
  redaktə tələb edə bilər.
- **Mobil tətbiq** (`mobile/`) hələ Triad Vision adı/ikonları ilə qurulur; müştəri üçün ayrıca EAS build (app.config.ts:
  ad, bundle id, ikonlar, API URL) lazımdır — bu dəyişiklikdə edilməyib.
- `client/public/sw.js` və `offline.html` statik fallback-larda "Triad Vision" sözü qalır (yalnız API əlçatmaz olanda görünür).

---

## English

### What is configurable

| What | Where |
|---|---|
| Brand name, short name, tagline, legal entity, support e-mail, phone, country, description, e-mail footer, sender name/address, languages | `.env.production` (`BRAND_*`) → overridden by the `System → Brand` panel (SUPER_ADMIN) |
| Logos (light/dark), favicon + PWA icons (every size generated with sharp from one square image) | `System → Brand` uploads (re-encoded as PNG) |
| Colours | the theme builder inside `System → Brand` (Setting `theme`) |
| Offices, hours, WhatsApp, social links | `Admin → Settings` (`contact`, `social`) — not duplicated |
| Company data for the imprint / contracts | `Admin → Legal` (`legal`) |
| Modules and staff limit | licence key (`LICENSE_KEY`) + `System → Modules` |

The brand reaches the site copy (`{{brand}}` i18next variables in all six languages), logo, titles, the HTML `<head>`
(Caddy include `/__seo/brand`), the dynamic `/manifest.webmanifest`, SEO head/body/JSON-LD, RSS, OG images, e-mails,
notifications / push / SMS / WhatsApp, every PDF, AI system prompts and iCal feeds. The default brand is **Triad Vision**:
with nothing configured the owner's site is unchanged (server-side `brandify()` only rewrites the default tokens when the
brand differs).

### Licence

- Token `TV1.<payload>.<Ed25519 signature>`, payload `{customer, domain, plan, modules, staffLimit, issuedAt, expiresAt}`.
- Public key compiled into the app (`server/src/lib/license/index.ts`); the **private key stays with the owner** only.
- Valid → normal; expired → 14-day grace (admin banner), then **read-only for staff**; invalid (signature / domain) or
  missing → read-only at once. **Clients are never locked out** (GDPR).
- Plan limits: staff seats (creating / promoting staff is refused when full), modules outside the plan are hidden.
- The owner's server (`triad-vision.de`) without `LICENSE_KEY` is the **owner instance** (unlimited). Any other production
  domain without a key counts as "missing", so **every customer server needs `INSTANCE_ROLE=customer` + `LICENSE_KEY`**
  (written by `new-instance.sh`).
- Checked at startup and daily; status page `System → License`.

### Provisioning

1. Keep `license-private.pem` safe (password manager + offline copy); never on a server or in git.
2. Fresh Ubuntu 22.04/24.04 VM with key-based root SSH; DNS `A` records (apex + `www`) to its IP.
3. `node deploy/whitelabel/issue-license.mjs --key license-private.pem --customer … --domain … --plan … --expires …`
4. Commit, then `BRAND_NAME=… ADMIN_EMAIL=… LICENSE_KEY=… [SMTP_*=…] bash deploy/whitelabel/new-instance.sh root@IP domain`
   — prepares the server (`deploy/server-setup.sh`), renders `.env.production` from `env.template` with random secrets
   (DB passwords, JWT, TOTP encryption key, VAPID keys), installs the compose override (no owner mail server), deploys
   with the existing `deploy/remote-deploy.sh` (build, migrations, seed with `SEED_PROFILE=whitelabel`), prints the
   one-time SUPER_ADMIN setup link (`setup-link.sh` issues a new one), installs the nightly encrypted backup
   (`BACKUP_REMOTE` for an off-site copy).
5. Track the customer in `System → Customers` on your own instance; "Create company" links it to the invoice module.
6. Updates: `deploy/whitelabel/update-instance.sh <ssh-target> [git-ref]` (backup first). Renewal: same with `LICENSE_KEY=…`.

Scripts: `issue-license.mjs`, `new-instance.sh`, `update-instance.sh`, `setup-link.sh`, `env.template`,
`docker-compose.instance.yml`, `lib.sh`.
