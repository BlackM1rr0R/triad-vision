/**
 * Turkish / Ukrainian completeness of the client portal (/account/*) copy.
 *
 * A visitor who chose tr or uk on the public site keeps that language after logging in (LanguageSwitcher
 * offers all six languages then), so every string of the portal modules below exists in tr and uk as well —
 * without them the portal silently falls back to English. Each module carries its tr / uk copy inline
 * (registerCopy), so it ships with the portal chunk and not with the public site's tr / uk chunks.
 */
import { describe, expect, it } from 'vitest';
import { pagesAccount } from './pagesAccount';
import { pagesArrival } from './pagesArrival';
import { pagesArrivalSamples } from './pagesArrivalSamples';
import { pagesCaseContracts } from './pagesCaseContracts';
import { pagesClientPlus } from './pagesClientPlus';
import { pagesCourse } from './pagesCourse';
import { pagesCv } from './pagesCv';
import { pagesDocProgress } from './pagesDocProgress';
import { pagesGermanyDay } from './pagesGermanyDay';
import { pagesGermanyReady } from './pagesGermanyReady';
import { pagesInterviewCalendar } from './pagesInterviewCalendar';
import { pagesJourney } from './pagesJourney';
import { pagesJourneyMap } from './pagesJourneyMap';
import { pagesMilestoneDocs } from './pagesMilestoneDocs';
import { pagesPermits } from './pagesPermits';
import { pagesPortalExtras } from './pagesPortalExtras';
import { pagesPortalMoments } from './pagesPortalMoments';
import { pagesPortalNav } from './pagesPortalNav';
import { pagesPortalPlans } from './pagesPortalPlans';
import { pagesPortalStage } from './pagesPortalStage';
import { pagesPortalUx } from './pagesPortalUx';
import { pagesPrep } from './pagesPrep';
import { pagesReadiness } from './pagesReadiness';
import { pagesReferralPlus } from './pagesReferralPlus';
import { pagesVacancyPlaces } from './pagesVacancyPlaces';
import { pagesVisaStory } from './pagesVisaStory';
import { pagesWaitingRoom } from './pagesWaitingRoom';

type Tree = string | number | boolean | null | undefined | Tree[] | { [k: string]: Tree };
type Bundle = { en: unknown; az: unknown; tr?: unknown; uk?: unknown };

const PORTAL_MODULES: Record<string, Bundle> = {
  pagesAccount,
  pagesArrival,
  pagesArrivalSamples,
  pagesCaseContracts,
  pagesClientPlus,
  pagesCourse,
  pagesCv,
  pagesDocProgress,
  pagesGermanyDay,
  pagesGermanyReady,
  pagesInterviewCalendar,
  pagesJourney,
  pagesJourneyMap,
  pagesMilestoneDocs,
  pagesPermits,
  pagesPortalExtras,
  pagesPortalMoments,
  pagesPortalNav,
  pagesPortalPlans,
  pagesPortalStage,
  pagesPortalUx,
  pagesPrep,
  pagesReadiness,
  pagesReferralPlus,
  pagesVacancyPlaces,
  pagesVisaStory,
  pagesWaitingRoom,
};

/** Every string leaf as [path, value]. */
const leaves = (node: Tree, path = '', out: [string, string][] = []): [string, string][] => {
  if (typeof node === 'string') out.push([path, node]);
  else if (Array.isArray(node)) node.forEach((v, i) => leaves(v, `${path}[${i}]`, out));
  else if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) leaves(v, path ? `${path}.${k}` : k, out);
  return out;
};

const placeholders = (s: string) => new Set([...s.matchAll(/\{\{\s*([\w.]+)[^}]*\}\}/g)].map((m) => m[1]));

describe.each(Object.entries(PORTAL_MODULES))('%s', (_name, bundle) => {
  const en = new Map(leaves(bundle.en as Tree));
  const az = new Map(leaves(bundle.az as Tree));

  it.each(['tr', 'uk'] as const)('has every en string in %s, with the same placeholders', (lng) => {
    const copy = new Map(leaves(bundle[lng] as Tree));
    const missing = [...en.keys()].filter((k) => !copy.get(k)?.trim());
    expect(missing, `${lng} is missing`).toEqual([]);

    const wrong: string[] = [];
    for (const [k, enText] of en) {
      const own = placeholders(copy.get(k) ?? '');
      const known = new Set([...placeholders(enText), ...placeholders(az.get(k) ?? '')]);
      if (/_(one|few|many|other)$/.test(k)) known.add('count'); // Ukrainian "_one" also covers 21, 31 …
      // Singular forms may say "one …" instead of "{{count}} …".
      const needed = [...placeholders(enText)].filter((p) => !(p === 'count' && /_one$/.test(k)));
      if (needed.some((p) => !own.has(p)) || [...own].some((p) => !known.has(p))) wrong.push(k);
    }
    expect(wrong, `${lng} placeholders differ from en`).toEqual([]);
  });
});
