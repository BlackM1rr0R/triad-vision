# Job board feeds (Indeed, StepStone, BA Jobbörse, Google for Jobs)

Vacancies from the admin (Admin → Vakansiyalar) can go to external job boards. Per vacancy, the
**"Paylaşım"** section of the vacancy drawer (ADMIN+) picks the channels, the language (German by default),
how the employer is shown, the external apply URL and the occupation codes. The overview page
**Admin → İşəgötürənlər → İş elanı kanalları** (`/admin/job-channels`, ADMIN+) has the feed URLs (copy buttons),
token rotation, per-channel counts / errors and the BA settings. Every change there is audit-logged
(`JOB_FEED_TOKEN_ROTATED`, `JOB_FEED_REFRESHED`, `VACANCY_DISTRIBUTION_UPDATED`, `JOB_FEED_BA_SETTINGS_UPDATED`,
`JOB_FEED_BA_EXPORTED`, `JOB_FEED_BA_UPLOAD`).

Code: `server/src/lib/jobFeeds/` (service, BA file, KldB lookup, XML helpers), `server/src/routes/jobFeeds.ts`
(public feeds), `server/src/routes/admin/jobFeeds.ts`, `server/src/jobs/jobFeeds.ts` (BA upload job),
`client/src/pages/admin/JobChannels.tsx`, `client/src/components/jobFeeds/`. Tests: `server/tests/e2e/job-feeds.test.ts`.

## Feed URLs

| Feed | URL | Format |
| --- | --- | --- |
| Indeed | `https://<domain>/feeds/indeed.xml?token=<token>` | Indeed XML (`<source><job>…`) |
| StepStone | `https://<domain>/feeds/stepstone.xml?token=<token>` | structured XML (below) |
| Generic | `https://<domain>/feeds/generic.xml?token=<token>` | same structured XML |

- The token (32 random characters) is created on the first visit of the overview page, stored encrypted
  (`lib/secretBox`), compared in constant time and can be rotated at any time (old URLs stop working at once).
  Without a valid token the feed answers `403`.
- Caddy forwards `/feeds/*` to the API (`@jobfeeds` in `deploy/Caddyfile`). The token is in the query string and
  therefore in the access log; rotate it if logs are shared.
- Each feed is built at most every **10 minutes** (in-process cache, `X-Feed-Cache: HIT|MISS`,
  `Cache-Control: private, max-age=600`); saving a vacancy's distribution or "Rebuild now" clears it.
- Only **live** vacancies are in a feed: status `OPEN`, `publishedAt` reached, `closesAt` not passed, and the
  channel switched on. Vacancies missing required fields are left out and shown as errors.
- Text is in the vacancy's feed language (default German), falling back to German → English → Azerbaijani →
  Russian. All text is CDATA-wrapped (a `]]>` inside text is split), characters XML 1.0 forbids are removed,
  descriptions are HTML with the user text escaped.
- Apply URL: the public job page `/<lang>/jobs/<slug>` or the override, with `utm_source=<channel>`,
  `utm_medium=job_feed`, `utm_campaign=<slug>` added (existing UTM parameters are kept).
- Employer: hidden by default when the vacancy hides it on our board (`showCompany=false`); then the label
  (default "Triad Vision (für einen Kunden)", per vacancy editable) is used instead of the company name.

Status per vacancy and channel (`VacancyChannelState`): `PENDING` (switched on, not exported yet / BA file
downloaded, not uploaded), `PUBLISHED` (in the last feed build / uploaded to the BA), `ERROR` (left out; the
error codes say which field), `EXPIRED` (was published, the vacancy closed or passed `closesAt`), plus
`lastExportAt`.

## 1. Indeed

**Status (checked Oct 2026):** Indeed still documents and accepts the XML job feed ("Job Sync XML feed reference",
docs.indeed.com/job-sync-xml/xml-feed; release notes of Nov/Dec 2025 and May 2026 keep maintaining it). For ATS
vendors Indeed pushes the **Job Sync API** (GraphQL; since July 2026 also open to direct employers) and Indeed Apply.
A plain XML feed URL that Indeed crawls is still one of the three listed delivery methods (URL, client
FTP/SFTP, upload to Indeed's FTP). Third-party claims that "the XML feed was retired" refer to the old
Publisher API (job search), not to job ingestion.

**What the owner must do:** have an Indeed employer account for the company; ask Indeed (employer support /
account manager, "submit an XML feed") to crawl `…/feeds/indeed.xml?token=…`. Organic listings are free;
sponsoring is paid in the Indeed dashboard. Indeed requires the feed to contain **all** jobs of the career site
(no partial opt-in) — so switch Indeed on for every public vacancy. For Indeed Apply / Job Sync API a partner
integration (API credentials) would be needed; not implemented.

**Format we send:** `<source>` → `<publisher>`, `<publisherurl>`, `<lastBuildDate>`, then per job:
`title, date (ISO-8601), referencenumber (vacancy id, stable), requisitionid (slug), url, company, sourcename,
city, state (blank), country (DE), postalcode, streetaddress (blank), email (Setting "contact".email),
description (HTML), salary ("2.800 - 3.400 EUR pro Monat"), education (blank), jobtype (fulltime / parttime /
temporary), category (KldB name or sector), experience, expirationdate (YYYY-MM-DD), remotetype (blank)`.
Every used element appears in every job, blank when unknown (Indeed's rule). Required here: title, description
≥ 30 characters, city.

## 2. StepStone

**Status:** StepStone has no self-serve organic feed. Postings are paid listings; machine delivery runs through
StepStone's partner interface ("Jobfeed" pull/push XML and the posting/apply APIs at api.stepstone.com, separate
DE format) for contracted customers and ATS / multiposting partners (e.g. d.vinci, softgarden, Greenhouse via
"ATSi"). The XSD/format is handed out by the StepStone account manager.

**What the owner must do:** sign a StepStone contract (listing package or "Jobfeed" flat rate) and ask the
account manager to connect a feed — give them `…/feeds/stepstone.xml?token=…` and ask which format they need;
alternatively book a multiposting service that pulls our generic feed and posts to StepStone.
StepStone wants complete, structured data incl. **salary**, location, contract type and working hours — fill
those in the vacancy and the Paylaşım section.

**Format we send (stepstone.xml and generic.xml):**

```xml
<jobs version="1.0" channel="stepstone" generated="…" count="n">
  <publisher><name/><url/></publisher>
  <job id="…">
    <reference/><slug/><language>de</language><title/>
    <company hidden="true|false"><name/></company>
    <url/><applyUrl/><datePosted/><dateModified/><validThrough/>
    <location><city/><postalCode/><country>DE</country></location>
    <employmentType>FULL_TIME|PART_TIME|SEASONAL|AUSBILDUNG</employmentType>
    <contractType>permanent|temporary</contractType><contractEnd/><startDate/><weeklyHours/><positions/>
    <salary currency="EUR" period="MONTH"><min/><max/><text/></salary>
    <occupation kldb="52122"><name/></occupation><sector/><germanLevel/><minExperienceYears/><drivingLicence/>
    <description>HTML</description><descriptionText/>
    <requirements><item/>…</requirements><benefits><item/>…</benefits>
  </job>
</jobs>
```

Required: title, description ≥ 30 characters, city (generic: city optional).

## 3. Bundesagentur für Arbeit — Jobbörse (HR-BA-XML)

**Requirements / onboarding** (arbeitsagentur.de → Unternehmen → HR-BA-XML-Schnittstelle):

1. An employer account looked after by the local Arbeitgeber-Service (0800 4 5555 20).
2. A **cooperation agreement** — request by e-mail from the BA Account- und Allianzpartnermanagement
   (`service-haus.vam-accountmgmt@arbeitsagentur.de`).
3. The BA then sends a download link for the personal **X.509 client certificate (.p12)**, its password in a
   separate e-mail, the **supplier id** (format `P000xxxxxx`), the alliance/partner number. (Since Sept 2022 the
   **partner id** must be sent when several certificates belong to one e-mail address.)
4. Download the partner documents (Anwenderhilfen, **Kataloge**, Programmversionen, **Musterdateien**, the XSD
   `HRBAXML_JobPosition_Current.xsd`) — only available as partner downloads.
5. Upload files in the web interface of the BA interface server (`hrbaxml.arbeitsagentur.de`, client-certificate
   HTTPS); the BA validates the file **name** and content and provides an error file a few minutes later.

**What we do now:** "Download XML" on the overview page builds a full load (`TypeOfLoad F`) of every live
vacancy with the BA channel on that passes validation; upload it by hand in the BA web interface. The
automatic upload (daily job `job-feeds-ba-upload`, plus "Upload now") is **disabled** until supplier id, partner
id, certificate, password and the upload URL are entered and the admin switches it on. Certificate and password
are stored encrypted (`lib/secretBox`, AES-256-GCM), never returned by the API, never written to the audit log
(only the names of changed fields) or to logs. The upload is a multipart POST with the client certificate to the
configured URL — **untested against the BA**; check field names (`upload`, `partnerId`) against the Anwenderhilfe
before switching it on.

File name: `DS<SupplierId>_YYYY-MM-DD_HH-MM-SS.xml` (UTC), e.g. `DSP000132700_2026-10-28_13-00-00.xml`.

**Structure we generate:**

```
HRBAXMLJobPositionPosting
  Header: SupplierId, Timestamp, Amount, TypeOfLoad=F                        (confirmed by public integrations)
  Data/JobPositionPosting
    JobPositionPostingId = <SupplierId>-<vacancyId>
    HiringOrg: HiringOrgName, Contact/PostalAddress (CountryCode, PostalCode, Municipality)
    PostDetail: StartDate, EndDate (closesAt or +60 days), LastModificationDate, Status/Code, SupplierId
    JobPositionInformation
      JobPositionTitle/TitleCode            ← baTitleCode (BA Berufe-ID / DKZ from the Kataloge)
      JobPositionDescription: JobPositionTitleDescription, JobOfferType, Objective (text), Location,
        NumberOfJobs, WorkingTime, HoursPerWeek, TermLength/TemporaryOrRegular (+ TermDate/End),
        StartDate, Salary, ApplicationURL
      JobPositionRequirements: Languages/Language (Deutsch + level), Mobility/DrivingLicence, ExperienceYears
```

**Validation before export** (error codes in the UI): title; `TitleCode` present and numeric; description
≥ 50 characters; city; PLZ (5 digits); employer name/label; Befristung end date when fixed-term; weekly hours
1–60; language German; supplier id (file level).

**Uncertain fields — check against `HRBAXML_JobPosition_Current.xsd` and the Kataloge before the first upload**
(also listed on the overview page): `PostDetail/Status/Code` (we send `1`), `JobOfferType` (`1` job, `4`
Ausbildung), `TermLength/TemporaryOrRegular` (`1` befristet, `2` unbefristet), `WorkingTime` (`VZ`/`TZ`),
`HoursPerWeek`, `JobPositionDescription/StartDate`, `Salary`, `ApplicationURL`, all of
`JobPositionRequirements/*`, whether `HiringOrgName` may be an anonymous label for a private placement agency
(the BA may require the real employer or the agency's own data plus a "private Arbeitsvermittlung" flag), and
whether `TitleCode` takes the DKZ id (we send what is entered in "BA TitleCode"). Element order may also need
adjusting to the XSD sequence. The code values live in `BA_CODES` (`server/src/lib/jobFeeds/ba.ts`).

## 4. Occupation codes (KldB 2010)

Per vacancy: **KldB 2010** code (5 digits; 4-digit Berufsuntergruppe + Anforderungsniveau 1 Helfer /
2 Fachkraft / 3 Spezialist / 4 Experte), suggested from the profession/title, plus a small searchable lookup
(`server/src/lib/jobFeeds/occupations.ts`) for the professions we place: truck/bus/car driver, courier,
warehouse, welder, cook, kitchen help, nurse, nursing assistant, geriatric care, electricians, car mechanic,
SHK, bricklayer, construction helper, restaurant service, farm/harvest, cleaning, office.
Source: Statistik der Bundesagentur für Arbeit, "Klassifikation der Berufe 2010 – überarbeitete Fassung 2020"
(statistik.arbeitsagentur.de → Klassifikationen) and BERUFENET; entries marked "verify" were compiled by hand
and must be checked against the official Systematik. The BA **TitleCode** (DKZ / Berufe-ID) is a different
catalogue (HR-BA-XML Kataloge, partner download) and is entered by hand.

## 5. Google for Jobs (JobPosting JSON-LD)

Already on every public job page (`/jobs/<slug>`, all languages; `server/src/lib/seo.ts` → `jobPostingLd`, via the
Caddy head include): `title`, `description` (HTML), `identifier`, `datePosted`, `validThrough` (when `closesAt`
is set), `employmentType` (FULL_TIME / PART_TIME / TEMPORARY; Ausbildung = FULL_TIME + OTHER),
`hiringOrganization` (the company when shown, otherwise Triad Vision with logo), `jobLocation` (PostalAddress,
locality + country DE), `baseSalary` (MonetaryAmount EUR, MONTH), `directApply: true` (candidates apply on our
page), `totalJobOpenings`, `url`, `inLanguage`. Expired / closed jobs disappear from the page and the sitemap.

Added with this change: `jobLocation.address.postalCode` (from Paylaşım), `occupationalCategory`
("52122 Berufskraftfahrer/in …" from the KldB code) and `experienceRequirements`
(`OccupationalExperienceRequirements`, `monthsOfExperience`). Still recommended by Google but not available in
our data: `streetAddress`, `addressRegion`. Check with the Rich Results Test after deploy.
