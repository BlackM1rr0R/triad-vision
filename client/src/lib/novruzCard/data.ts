/**
 * Novruz greeting cards for employers (/novruz-card and the company portal /company/novruz-card): the card
 * designs, ready Azerbaijani greetings (+ an optional German line), the salutation per worker and the portal
 * reminder window. Plain data / pure functions (unit-tested); drawing lives in ./render.ts.
 *
 * Novruz is the spring / new-year festival around the March equinox (UNESCO intangible heritage); in Azerbaijan the
 * Cabinet of Ministers sets the days off each year (2026: decision No. 362 of 2 December 2025 → 20–24 March, see
 * lib/employerGuideAz/holidays.ts). The 2027 decision is not published yet (as of November 2026), so the UI says
 * "usually around 20–21 March" for years without a decree.
 */
import { holidaysFor, type AzHoliday } from '../employerGuideAz/holidays';

export const NOVRUZ_TEMPLATES = ['semeni', 'fire', 'khoncha', 'buta'] as const;
export type NovruzTemplate = (typeof NOVRUZ_TEMPLATES)[number];

/**
 * Ready greetings in Azerbaijani (standard Latin orthography with ə, ğ, ı, ö, ş, ç, ü). Each with a German gloss so
 * the employer knows what it says. Short, neutral, no religious wording (Novruz is a spring festival).
 */
export const NOVRUZ_GREETINGS = [
  { id: 'classic', az: 'Novruz bayramınız mübarək!', de: 'Frohes Novruz-Fest!', en: 'Happy Novruz!' },
  {
    id: 'family',
    az: 'Novruz bayramınızı təbrik edirik! Sizə və ailənizə cansağlığı, xoşbəxtlik və uğurlar arzulayırıq.',
    de: 'Wir gratulieren Ihnen zum Novruz-Fest! Wir wünschen Ihnen und Ihrer Familie Gesundheit, Glück und Erfolg.',
    en: 'Congratulations on Novruz! We wish you and your family health, happiness and success.',
  },
  {
    id: 'spring',
    az: 'Baharın gəlişi mübarək! Bütün komandamız adından sizi Novruz bayramı münasibətilə təbrik edirik.',
    de: 'Willkommen, Frühling! Im Namen unseres ganzen Teams gratulieren wir Ihnen zum Novruz-Fest.',
    en: 'Welcome, spring! On behalf of our whole team we congratulate you on Novruz.',
  },
  {
    id: 'table',
    az: 'Bayramınız mübarək! Süfrəniz bərəkətli, ocağınız isti olsun!',
    de: 'Frohes Fest! Möge Ihr Tisch reich gedeckt und Ihr Zuhause warm sein!',
    en: 'Happy holiday! May your table be plentiful and your home warm!',
  },
  {
    id: 'thanks',
    az: 'Novruz bayramınız mübarək! Komandamızda olduğunuz üçün təşəkkür edirik.',
    de: 'Frohes Novruz-Fest! Danke, dass Sie Teil unseres Teams sind.',
    en: 'Happy Novruz! Thank you for being part of our team.',
  },
] as const;
export type NovruzGreetingId = (typeof NOVRUZ_GREETINGS)[number]['id'];

/** Optional German line under the Azerbaijani text. */
export const GERMAN_LINES = ['Frohes Novruz-Fest und einen schönen Frühlingsanfang!', 'Alles Gute zum Novruz-Fest!', 'Herzliche Grüße zum Frühlingsfest Novruz!'] as const;

/** "Əziz Elvin!" — the Azerbaijani salutation ("Dear …"); without a name: "Əziz həmkarımız!" ("Dear colleague"). */
export const salutation = (firstName: string) => {
  const n = firstName.trim();
  return n ? `Əziz ${n}!` : 'Əziz həmkarımız!';
};

/** First name from the employer panel's anonymised "Ali M." / "Ali Rza M." (the trailing initial is dropped). */
export const firstNameOf = (panelName: string) => panelName.trim().replace(/\s+\p{Lu}\.$/u, '').trim();

/** Names typed in the public generator: one per line or comma-separated, trimmed, de-duplicated, at most 30. */
export const parseNames = (text: string) => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(/[\n,;]+/)) {
    const n = raw.trim().replace(/\s+/g, ' ').slice(0, 40);
    if (!n || seen.has(n.toLowerCase())) continue;
    seen.add(n.toLowerCase());
    out.push(n);
    if (out.length >= 30) break;
  }
  return out;
};

/** File-name-safe slug of a name ("Elvin" → "elvin", "Gülnar" → "gulnar"). */
export const fileSlug = (s: string) =>
  s
    .toLowerCase()
    .replace(/ə/g, 'e')
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30) || 'card';

export interface NovruzDates {
  year: number;
  /** Official days off (Cabinet decree) or null when no decree is known for the year. */
  official: AzHoliday | null;
}

/** Novruz of the year of `todayIso` (or the next year once it is over), with the decree status. */
export const nextNovruz = (todayIso: string): NovruzDates => {
  const y = Number(todayIso.slice(0, 4));
  for (const year of [y, y + 1]) {
    const h = holidaysFor(year).find((x) => x.key === 'novruz') ?? null;
    const end = h?.end ?? `${year}-03-24`;
    if (end >= todayIso) return { year, official: h && h.status === 'decree' ? h : null };
  }
  return { year: y + 1, official: null };
};

/** Portal reminder ("Novruz is coming"): from 1 March up to and including 21 March. */
export const NOVRUZ_BANNER_FROM = '03-01';
export const NOVRUZ_BANNER_TO = '03-21';
export const novruzBannerVisible = (todayIso: string) => {
  const md = todayIso.slice(5, 10);
  return md >= NOVRUZ_BANNER_FROM && md <= NOVRUZ_BANNER_TO;
};

/** Today as an ISO date in local time (the banner follows the employer's calendar day). */
export const localIsoDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
