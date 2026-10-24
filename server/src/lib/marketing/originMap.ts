import type { CaseStatus, Prisma, VisaType } from '@prisma/client';
import { prisma } from '../../db.js';
import { cached } from '../cache.js';
import { cityKeyOf, getMapSettings, MIN_PER_CITY } from '../growth/map.js';

/**
 * Origin side of the placement map: where our clients come from (Azerbaijan, Türkiye, Ukraine) and
 * origin → destination flows (home city → German city of the employer).
 *
 * Origins come from the main applicant's profile: User.city (free text, spelled in many ways) and
 * User.nationality. Both are normalised with the tables below; a known city also implies its country.
 * Public output only has aggregates of at least MIN_PER_CITY (3) per point and per flow; the admin view
 * (Sayt alətləri → Haradan) shows exact counts with filters.
 */

export const ORIGIN_COUNTRIES = ['AZ', 'TR', 'UA'] as const;
export type OriginCountry = (typeof ORIGIN_COUNTRIES)[number];

interface CityDef {
  key: string;
  country: OriginCountry;
  name: string;
  lat: number;
  lng: number;
  aliases: string[];
}

/** Common spellings (Latin / local / Cyrillic, with and without diacritics) of the main cities. */
const CITIES: CityDef[] = [
  // Azerbaijan
  { key: 'baku', country: 'AZ', name: 'Bakı', lat: 40.41, lng: 49.87, aliases: ['baku', 'bakı', 'baki', 'баку', 'bakü'] },
  { key: 'ganja', country: 'AZ', name: 'Gəncə', lat: 40.68, lng: 46.36, aliases: ['ganja', 'gəncə', 'gence', 'gandja', 'гянджа', 'gänçä'] },
  { key: 'sumgait', country: 'AZ', name: 'Sumqayıt', lat: 40.59, lng: 49.67, aliases: ['sumqayit', 'sumqayıt', 'sumgait', 'sumgayit', 'сумгаит', 'sumgayıt'] },
  { key: 'mingachevir', country: 'AZ', name: 'Mingəçevir', lat: 40.77, lng: 47.05, aliases: ['mingachevir', 'mingəçevir', 'mingecevir', 'mingechaur', 'мингечаур'] },
  { key: 'lankaran', country: 'AZ', name: 'Lənkəran', lat: 38.75, lng: 48.85, aliases: ['lankaran', 'lənkəran', 'lenkeran', 'ленкорань', 'lenkoran'] },
  { key: 'shaki', country: 'AZ', name: 'Şəki', lat: 41.19, lng: 47.17, aliases: ['shaki', 'şəki', 'seki', 'sheki', 'шеки'] },
  { key: 'shirvan', country: 'AZ', name: 'Şirvan', lat: 39.93, lng: 48.92, aliases: ['shirvan', 'şirvan', 'sirvan', 'ширван'] },
  { key: 'nakhchivan', country: 'AZ', name: 'Naxçıvan', lat: 39.21, lng: 45.41, aliases: ['nakhchivan', 'naxçıvan', 'naxcivan', 'nakhichevan', 'нахичевань', 'nahçıvan'] },
  { key: 'quba', country: 'AZ', name: 'Quba', lat: 41.36, lng: 48.51, aliases: ['quba', 'guba', 'куба'] },
  { key: 'khachmaz', country: 'AZ', name: 'Xaçmaz', lat: 41.46, lng: 48.8, aliases: ['xaçmaz', 'xacmaz', 'khachmaz', 'хачмаз'] },
  { key: 'yevlakh', country: 'AZ', name: 'Yevlax', lat: 40.62, lng: 47.15, aliases: ['yevlax', 'yevlakh', 'евлах'] },
  { key: 'barda', country: 'AZ', name: 'Bərdə', lat: 40.37, lng: 47.13, aliases: ['bərdə', 'berde', 'barda', 'барда'] },
  { key: 'zaqatala', country: 'AZ', name: 'Zaqatala', lat: 41.63, lng: 46.64, aliases: ['zaqatala', 'zakatala', 'закатала'] },
  { key: 'qabala', country: 'AZ', name: 'Qəbələ', lat: 40.98, lng: 47.85, aliases: ['qəbələ', 'qebele', 'gabala', 'qabala', 'габала'] },
  { key: 'salyan', country: 'AZ', name: 'Salyan', lat: 39.6, lng: 48.98, aliases: ['salyan', 'сальяны'] },
  { key: 'jalilabad', country: 'AZ', name: 'Cəlilabad', lat: 39.21, lng: 48.5, aliases: ['cəlilabad', 'celilabad', 'jalilabad', 'джалилабад'] },
  // Türkiye
  { key: 'istanbul', country: 'TR', name: 'İstanbul', lat: 41.01, lng: 28.98, aliases: ['istanbul', 'i̇stanbul', 'стамбул', 'istambul'] },
  { key: 'ankara', country: 'TR', name: 'Ankara', lat: 39.93, lng: 32.86, aliases: ['ankara', 'анкара'] },
  { key: 'izmir', country: 'TR', name: 'İzmir', lat: 38.42, lng: 27.14, aliases: ['izmir', 'i̇zmir', 'измир', 'smyrna'] },
  { key: 'bursa', country: 'TR', name: 'Bursa', lat: 40.19, lng: 29.06, aliases: ['bursa', 'бурса'] },
  { key: 'antalya', country: 'TR', name: 'Antalya', lat: 36.9, lng: 30.71, aliases: ['antalya', 'анталья', 'анталия'] },
  { key: 'adana', country: 'TR', name: 'Adana', lat: 37.0, lng: 35.32, aliases: ['adana', 'адана'] },
  { key: 'konya', country: 'TR', name: 'Konya', lat: 37.87, lng: 32.48, aliases: ['konya', 'конья'] },
  { key: 'gaziantep', country: 'TR', name: 'Gaziantep', lat: 37.07, lng: 37.38, aliases: ['gaziantep', 'antep', 'газиантеп'] },
  { key: 'kayseri', country: 'TR', name: 'Kayseri', lat: 38.73, lng: 35.49, aliases: ['kayseri', 'кайсери'] },
  { key: 'trabzon', country: 'TR', name: 'Trabzon', lat: 41.0, lng: 39.72, aliases: ['trabzon', 'трабзон'] },
  { key: 'samsun', country: 'TR', name: 'Samsun', lat: 41.29, lng: 36.33, aliases: ['samsun', 'самсун'] },
  { key: 'erzurum', country: 'TR', name: 'Erzurum', lat: 39.9, lng: 41.27, aliases: ['erzurum', 'эрзурум'] },
  { key: 'kars', country: 'TR', name: 'Kars', lat: 40.6, lng: 43.1, aliases: ['kars', 'карс'] },
  { key: 'igdir', country: 'TR', name: 'Iğdır', lat: 39.92, lng: 44.05, aliases: ['iğdır', 'igdir', 'ığdır', 'игдыр'] },
  { key: 'mersin', country: 'TR', name: 'Mersin', lat: 36.81, lng: 34.64, aliases: ['mersin', 'мерсин'] },
  { key: 'kocaeli', country: 'TR', name: 'Kocaeli', lat: 40.77, lng: 29.92, aliases: ['kocaeli', 'izmit', 'i̇zmit', 'коджаэли'] },
  { key: 'eskisehir', country: 'TR', name: 'Eskişehir', lat: 39.78, lng: 30.52, aliases: ['eskişehir', 'eskisehir', 'эскишехир'] },
  { key: 'diyarbakir', country: 'TR', name: 'Diyarbakır', lat: 37.91, lng: 40.24, aliases: ['diyarbakır', 'diyarbakir', 'диярбакыр'] },
  // Ukraine
  { key: 'kyiv', country: 'UA', name: 'Kyiv', lat: 50.45, lng: 30.52, aliases: ['kyiv', 'kiev', 'київ', 'киев', 'kiew', 'kijev'] },
  { key: 'kharkiv', country: 'UA', name: 'Kharkiv', lat: 49.99, lng: 36.23, aliases: ['kharkiv', 'kharkov', 'харків', 'харьков', 'charkiw'] },
  { key: 'odesa', country: 'UA', name: 'Odesa', lat: 46.48, lng: 30.73, aliases: ['odesa', 'odessa', 'одеса', 'одесса'] },
  { key: 'lviv', country: 'UA', name: 'Lviv', lat: 49.84, lng: 24.03, aliases: ['lviv', 'lvov', 'львів', 'львов', 'lwiw', 'lemberg'] },
  { key: 'dnipro', country: 'UA', name: 'Dnipro', lat: 48.46, lng: 35.05, aliases: ['dnipro', 'dnepr', 'dnipropetrovsk', 'дніпро', 'днепр', 'днепропетровск'] },
  { key: 'zaporizhzhia', country: 'UA', name: 'Zaporizhzhia', lat: 47.84, lng: 35.14, aliases: ['zaporizhzhia', 'zaporozhye', 'zaporizhia', 'запоріжжя', 'запорожье'] },
  { key: 'vinnytsia', country: 'UA', name: 'Vinnytsia', lat: 49.23, lng: 28.47, aliases: ['vinnytsia', 'vinnitsa', 'вінниця', 'винница'] },
  { key: 'poltava', country: 'UA', name: 'Poltava', lat: 49.59, lng: 34.55, aliases: ['poltava', 'полтава'] },
  { key: 'chernihiv', country: 'UA', name: 'Chernihiv', lat: 51.49, lng: 31.29, aliases: ['chernihiv', 'chernigov', 'чернігів', 'чернигов'] },
  { key: 'ivano-frankivsk', country: 'UA', name: 'Ivano-Frankivsk', lat: 48.92, lng: 24.71, aliases: ['ivano-frankivsk', 'ivano frankivsk', 'івано-франківськ', 'ивано-франковск'] },
  { key: 'ternopil', country: 'UA', name: 'Ternopil', lat: 49.55, lng: 25.59, aliases: ['ternopil', 'ternopol', 'тернопіль', 'тернополь'] },
  { key: 'mykolaiv', country: 'UA', name: 'Mykolaiv', lat: 46.97, lng: 32.0, aliases: ['mykolaiv', 'nikolaev', 'миколаїв', 'николаев'] },
  { key: 'kherson', country: 'UA', name: 'Kherson', lat: 46.64, lng: 32.62, aliases: ['kherson', 'херсон'] },
  { key: 'uzhhorod', country: 'UA', name: 'Uzhhorod', lat: 48.62, lng: 22.3, aliases: ['uzhhorod', 'uzhgorod', 'ужгород'] },
  { key: 'rivne', country: 'UA', name: 'Rivne', lat: 50.62, lng: 26.25, aliases: ['rivne', 'rovno', 'рівне', 'ровно'] },
  { key: 'lutsk', country: 'UA', name: 'Lutsk', lat: 50.75, lng: 25.34, aliases: ['lutsk', 'луцьк', 'луцк'] },
  { key: 'zhytomyr', country: 'UA', name: 'Zhytomyr', lat: 50.25, lng: 28.66, aliases: ['zhytomyr', 'zhitomir', 'житомир'] },
  { key: 'chernivtsi', country: 'UA', name: 'Chernivtsi', lat: 48.29, lng: 25.94, aliases: ['chernivtsi', 'chernovtsy', 'чернівці', 'черновцы'] },
  { key: 'sumy', country: 'UA', name: 'Sumy', lat: 50.91, lng: 34.8, aliases: ['sumy', 'суми', 'сумы'] },
  { key: 'cherkasy', country: 'UA', name: 'Cherkasy', lat: 49.44, lng: 32.06, aliases: ['cherkasy', 'cherkassy', 'черкаси', 'черкассы'] },
];

/** Country spellings → code. */
const COUNTRY_ALIASES: Record<OriginCountry, string[]> = {
  AZ: ['az', 'aze', 'azerbaijan', 'azərbaycan', 'azerbaycan', 'aserbaidschan', 'азербайджан', 'azerbaidjan', 'azeri', 'azərbaycanlı', 'azerbaijani'],
  TR: ['tr', 'tur', 'turkey', 'türkiye', 'turkiye', 'türkei', 'tuerkei', 'турция', 'türk', 'turkish'],
  UA: ['ua', 'ukr', 'ukraine', 'ukraina', 'україна', 'украина', 'ukrayna', 'ukrainian', 'украинец', 'українець'],
};

/** Rough country centres for clients with a nationality but no known city. */
export const COUNTRY_CENTRES: Record<OriginCountry, { lat: number; lng: number }> = {
  AZ: { lat: 40.3, lng: 47.7 },
  TR: { lat: 39.0, lng: 35.0 },
  UA: { lat: 49.0, lng: 31.4 },
};

const FILLER = new Set(['city', 'şəhəri', 'seheri', 'şəhər', 'şehri', 'şehir', 'город', 'г', 'місто', 'м', 'stadt', 'rayonu', 'r-nu', 'rayon', 'район']);

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/i̇/g, 'i') // "İ".toLowerCase() = i + combining dot
    .normalize('NFC')
    .split(/[,(/]/)[0]
    .replace(/[.]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !FILLER.has(w))
    .join(' ');

const ALIAS_INDEX = new Map<string, CityDef>();
for (const c of CITIES) for (const a of [c.key, ...c.aliases]) ALIAS_INDEX.set(norm(a), c);

/** Lower-case Latin without diacritics, for a second lookup ("Gəncə" typed as "Gänja"). */
const fold = (s: string) =>
  norm(s)
    .replace(/ə/g, 'e')
    .replace(/ı/g, 'i')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '');
const FOLD_INDEX = new Map<string, CityDef>();
for (const c of CITIES) for (const a of [c.key, ...c.aliases]) FOLD_INDEX.set(fold(a), c);

export const normaliseCountry = (raw: string | null | undefined): OriginCountry | null => {
  const v = norm(raw ?? '');
  if (!v) return null;
  const words = v.split(' ');
  for (const code of ORIGIN_COUNTRIES) if (COUNTRY_ALIASES[code].some((a) => v === a || words.includes(a))) return code;
  return null;
};

export interface Origin {
  country: OriginCountry;
  cityKey: string | null;
  city: string | null;
  lat: number;
  lng: number;
}

/** User.city + User.nationality → normalised origin (null for other / unknown countries). */
export const normaliseOrigin = (city: string | null | undefined, nationality: string | null | undefined): Origin | null => {
  const raw = (city ?? '').trim();
  const def = raw ? (ALIAS_INDEX.get(norm(raw)) ?? FOLD_INDEX.get(fold(raw))) : undefined;
  const country = def?.country ?? normaliseCountry(nationality) ?? normaliseCountry(raw);
  if (!country) return null;
  if (def && def.country === country) return { country, cityKey: def.key, city: def.name, lat: def.lat, lng: def.lng };
  return { country, cityKey: null, city: null, ...COUNTRY_CENTRES[country] };
};

export interface OriginFilters {
  from?: Date;
  to?: Date;
  visaType?: VisaType;
  status?: CaseStatus;
}

interface Point {
  key: string;
  country: OriginCountry;
  city: string | null;
  lat: number;
  lng: number;
  count: number;
}

const DESTINATION_STATUSES: CaseStatus[] = ['APPROVED'];

/**
 * Exact aggregation over main-applicant cases (one per client): origins, destinations (company / vacancy
 * city) and flows. `destinationsOnlyPlaced` keeps flows to placed workers (approved or arrived), like the
 * public destination map.
 */
export const aggregateOrigins = async (f: OriginFilters = {}, opts: { destinationsOnlyPlaced?: boolean } = {}) => {
  const where: Prisma.CaseWhereInput = {
    parentCaseId: null,
    ...(f.from || f.to ? { createdAt: { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lte: f.to } : {}) } } : {}),
    ...(f.visaType ? { visaType: f.visaType } : {}),
    ...(f.status ? { status: f.status } : {}),
  };
  const cases = await prisma.case.findMany({
    where,
    select: {
      clientId: true,
      status: true,
      client: { select: { city: true, nationality: true } },
      company: { select: { city: true } },
      vacancy: { select: { city: true } },
      arrivalPlan: { select: { status: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 20000,
  });
  const seen = new Set<string>();
  const origins = new Map<string, Point>();
  const flows = new Map<string, { from: string; to: string; toCity: string; count: number }>();
  const countries: Record<OriginCountry, number> = { AZ: 0, TR: 0, UA: 0 };
  let unknown = 0;
  for (const c of cases) {
    // One origin per client (a client can have several main cases).
    const first = !seen.has(c.clientId);
    seen.add(c.clientId);
    const o = normaliseOrigin(c.client.city, c.client.nationality);
    if (!o) {
      if (first) unknown++;
      continue;
    }
    const key = o.cityKey ?? `country:${o.country}`;
    if (first) {
      countries[o.country]++;
      const p = origins.get(key) ?? { key, country: o.country, city: o.city, lat: o.lat, lng: o.lng, count: 0 };
      p.count++;
      origins.set(key, p);
    }
    const placed = DESTINATION_STATUSES.includes(c.status) || c.arrivalPlan?.status === 'COMPLETED';
    if (opts.destinationsOnlyPlaced && !placed) continue;
    const dest = c.company?.city?.trim() || c.vacancy?.city?.trim();
    if (!dest) continue;
    const toKey = cityKeyOf(dest);
    if (!toKey) continue;
    const fk = `${key}→${toKey}`;
    const fl = flows.get(fk) ?? { from: key, to: toKey, toCity: dest.split(',')[0].trim(), count: 0 };
    fl.count++;
    flows.set(fk, fl);
  }
  const byCount = <T extends { count: number }>(a: T, b: T) => b.count - a.count;
  return {
    origins: [...origins.values()].sort(byCount),
    flows: [...flows.values()].sort(byCount),
    countries,
    unknown,
    clients: seen.size,
  };
};

/** Public origin view: only points and flows with at least 3 people (cached; admin edits clear the cache). */
export const publicOrigins = () =>
  cached('growth:origins', async () => {
    const settings = await getMapSettings();
    if (!settings.enabled) return { enabled: false, origins: [], flows: [], countries: { AZ: 0, TR: 0, UA: 0 }, minPerPoint: MIN_PER_CITY };
    const min = Math.max(MIN_PER_CITY, settings.minPerCity);
    const data = await aggregateOrigins({}, { destinationsOnlyPlaced: true });
    const origins = data.origins.filter((o) => o.count >= min);
    const shown = new Set(origins.map((o) => o.key));
    const flows = data.flows.filter((f) => f.count >= min && shown.has(f.from));
    // Country totals are only published when each is large enough on its own.
    const countries = Object.fromEntries(ORIGIN_COUNTRIES.map((c) => [c, data.countries[c] >= min ? data.countries[c] : 0])) as Record<OriginCountry, number>;
    return {
      enabled: true,
      minPerPoint: min,
      countries,
      origins: origins.map((o) => ({ key: o.key, country: o.country, city: o.city, lat: o.lat, lng: o.lng, count: o.count })),
      flows: flows.map((f) => ({ from: f.from, to: f.toCity, count: f.count })),
    };
  });
