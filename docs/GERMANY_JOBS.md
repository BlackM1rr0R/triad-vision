# Germany job search (/jobs/germany) — sources and rules

Code: `server/src/lib/germanyJobs/` (providers, merge, apply), `server/src/routes/germanyJobs.ts`
(`/api/germany-jobs/config|search|apply`), `server/src/routes/admin/germanyJobs.ts` (status, CV download),
client `client/src/pages/jobs/GermanyJobs.tsx`, `client/src/components/germanyJobs/*`, `client/src/lib/germanyJobs.ts`.

`/jobs/germany` is indexable (our own text and the form). `/jobs/germany/search` (the results) is `noindex`
because the listings come from other sites. They are never server-rendered and never stored. Our own `/jobs`
stays the place for verified vacancies.

## Never: the Bundesagentur "Jobsuche API"

`rest.arbeitsagentur.de` is not called and not scraped, because its terms forbid unauthorised interfaces and
data collection. The page only builds a link to the public BA Jobbörse search page, which opens in a new tab:
`https://www.arbeitsagentur.de/jobsuche/suche?angebotsart=1|4&was=…&wo=…&umkreis=…` (1 = Arbeit,
4 = Ausbildung). The builder is `baJobboerseUrl` and has a unit test.

## Providers

| Source | Default | Switch | How it is called | Attribution / rules |
| --- | --- | --- | --- | --- |
| Arbeitnow | **on** | `ARBEITNOW_ENABLED=0` turns it off | Feed fetched at most hourly (scheduler `germany-jobs-feed`, or the first search after a start without a fresh file cache). Pages 1…`ARBEITNOW_MAX_PAGES` (default 3, 300 jobs each). Polite User-Agent, timeouts, backoff from 15 min to 2 h. Kept in memory plus `<UPLOADS_DIR>/cache/arbeitnow-feed.json`. Searches filter locally. Every refresh replaces the whole list, so jobs that leave the feed disappear. | API meta: "This is a free public API for jobs, please do not abuse. I would appreciate linking back to the site." Terms §11: "You also agree to providing a link back to Arbeitnow.com on your platform." We show a "Jobs via Arbeitnow" link per card, in the header and in the footer. The description goes through the sanitiser and only a snippet is shown. The feed is mostly international, often English-speaking roles; the page says so. |
| Careerjet | off (on once the key is set) | `CAREERJET_API_KEY` (publisher panel → Access API) | `GET https://search.api.careerjet.net/v4/query`, Basic auth (key as user name), `locale_code=de_DE`. Docs: <https://www.careerjet.com/partners/api/>. Cached 30 min per query. The panel whitelists server IPs (production: 172.104.149.241), so calls from other machines get 403. That counts as a provider error in the status panel, and the other sources still answer. | The partner pages invite publishers "to embed Careerjet's job search results on your site". They state no attribution rule, so we show "via Careerjet" anyway and link out only through the job's `url`. The API **requires** `user_ip` and `user_agent` of the visitor. They are passed server-side on that call only: never stored, logged or cached. |
| Jooble | off | `JOOBLE_API_KEY` **and** `JOOBLE_ENABLED=1` | `POST https://jooble.org/api/{key}` with `{ keywords, location, radius, page, ResultOnPage }`. Free plan: 100 calls per day per key (our budget is 90). Cached 30 min. | Terms §4(i): "Our Site content may not be copied for republication … without our prior express written permission." The API page does not exempt API use. **Get written confirmation from Jooble before setting `JOOBLE_ENABLED=1`.** |
| Adzuna | off | `ADZUNA_APP_ID` + `ADZUNA_APP_KEY` **and** `ADZUNA_ENABLED=1` | `GET https://api.adzuna.com/v1/api/jobs/de/search/{page}`. Cached 20 min per query. Our own budget is set with `ADZUNA_MAX_CALLS_PER_*`. | The plan is paid after the trial. Terms: each advert is labelled "Adzuna" (at least 116 × 23 px), hyperlinked to the local domain (www.adzuna.de). "Direct all queries via Adzuna", so links use `redirect_url`. Commercial use after the 14-day trial needs a licence agreement. |

Results from the enabled providers are fetched in parallel. A provider that fails is skipped and the search
still answers. Duplicates (normalised title + company + city) are removed. Admin → Job channels → "Germany job
search: sources" shows each provider's state, last fetch and last error. Tests never call a real API: every
provider goes through `setJobsFetch`.

## Apply via Triad Vision

`POST /api/germany-jobs/apply` (multipart) works for a search result (prefilled) or for any pasted link. It
creates an `Inquiry` (kind `contact`, source `external-job:<provider>:<host>`) and an `ExternalJobApplication`
(listing, German level, profession, experience, CV as PDF/DOC/DOCX with checked bytes). It notifies staff and
sends a localised confirmation e-mail. Honeypot, consent and 10 requests per hour per IP. Signed-in clients get
the form prefilled and the lead linked to their account. When a lead is anonymised, its candidate details and
the CV file are removed.

## Saved jobs and job alerts

**Saved jobs** (heart on each card and in the apply form): visitors keep them in the browser only (localStorage);
signed-in clients in their account (`SavedGermanyJob`, portal Learn › Saved jobs, `/account/saved-jobs`). A list
saved before signing in is merged into the account once. Only a snapshot is stored — title, company, place,
source, link, job type, posting date — never the description; the ad is opened at its source. Arbeitnow listings
that left the cached feed show "no longer available"; the other sources cannot be checked without extra calls,
so they count as expired 60 days after posting / saving.

**Job alerts** ("Notify me about new jobs like this", `GermanyJobAlert`): the current search (keywords, place +
radius, job / Ausbildung, working time, remote, visa sponsorship), daily or weekly, at most 5 per address.
Visitors confirm by e-mail first (double opt-in, consent wording version stored); signed-in clients subscribe
their account address directly and manage alerts in the portal. Every e-mail has a manage page
(`/job-alert/germany?token=`) and an unsubscribe link. Unconfirmed alerts are deleted after 7 days, unsubscribed
ones 30 days later; alerts are part of the Art. 15 export, the account deletion and the admin erase-by-e-mail.

Matching (`lib/germanyJobs/alerts.ts`, every 30 minutes): due alerts are grouped by search, so one lookup serves
every subscriber of the same search. Arbeitnow comes from the cached hourly feed (no extra calls). Careerjet is
used only within `CAREERJET_ALERT_CALLS_PER_DAY` (default 100, persisted per UTC day, separate from the visitors'
budget; a fresh search-cache entry costs nothing; skipped once used up; never for remote / visa searches). Jooble
and Adzuna are never called for alerts. Listing ids already e-mailed are stored per alert (pruned after 120 days),
so nothing is sent twice. An e-mail lists up to 10 new listings, each with "Apply via Triad Vision" — a link to our
search page that opens the apply form for that listing, never straight to the source. Admin → Job channels shows
the alert counts, the most subscribed searches and today's Careerjet alert budget.
