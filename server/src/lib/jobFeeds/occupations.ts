/**
 * Small lookup of KldB 2010 occupation codes (Klassifikation der Berufe 2010, revised 2020) for the professions
 * Triad Vision places. Five digits: the first four are the Berufsuntergruppe, the fifth the Anforderungsniveau
 * (1 Helfer, 2 Fachkraft, 3 Spezialist, 4 Experte).
 *
 * Source: Statistik der Bundesagentur für Arbeit, "Klassifikation der Berufe 2010 – überarbeitete Fassung 2020"
 * (https://statistik.arbeitsagentur.de → Klassifikationen → KldB 2010) and BERUFENET. The list was compiled by
 * hand; entries marked `verify: true` should be checked against the official Systematik before relying on them.
 *
 * The BA Jobbörse (HR-BA-XML) expects its own TitleCode (Berufe-ID / DKZ from the "HR-BA-XML Kataloge"
 * download, available after the cooperation agreement); that id is entered per vacancy (baTitleCode).
 */
export interface Occupation {
  code: string;
  de: string;
  az: string;
  en: string;
  /** Lower-case search words (any language). */
  keywords: string[];
  verify?: boolean;
}

export const OCCUPATIONS: Occupation[] = [
  { code: '52122', de: 'Berufskraftfahrer/in (Güterverkehr/LKW)', az: 'LKW sürücüsü', en: 'Truck driver (HGV)', keywords: ['lkw', 'fahrer', 'truck', 'ce', 'sürücü', 'водитель', 'kraftfahrer'] },
  { code: '52132', de: 'Busfahrer/in', az: 'Avtobus sürücüsü', en: 'Bus driver', keywords: ['bus', 'avtobus', 'автобус', 'fahrer', 'sürücü'], verify: true },
  { code: '52112', de: 'Berufskraftfahrer/in (Personentransport/PKW)', az: 'Sürücü (minik)', en: 'Driver (car / passenger transport)', keywords: ['pkw', 'taxi', 'fahrer', 'driver', 'sürücü'], verify: true },
  { code: '51322', de: 'Kurier-/Zustellfahrer/in', az: 'Kuryer', en: 'Courier / delivery driver', keywords: ['kurier', 'courier', 'kuryer', 'zusteller', 'paket', 'курьер'], verify: true },
  { code: '51311', de: 'Lagerhelfer/in', az: 'Anbar köməkçisi', en: 'Warehouse helper', keywords: ['lager', 'warehouse', 'anbar', 'склад', 'helfer'], verify: true },
  { code: '51312', de: 'Fachkraft für Lagerlogistik / Fachlagerist/in', az: 'Anbar işçisi (ixtisaslı)', en: 'Warehouse operative (skilled)', keywords: ['lager', 'lagerlogistik', 'warehouse', 'anbar', 'склад'], verify: true },
  { code: '24422', de: 'Schweißer/in', az: 'Qaynaqçı', en: 'Welder', keywords: ['schweißer', 'schweisser', 'welder', 'qaynaq', 'сварщик'] },
  { code: '29302', de: 'Koch/Köchin', az: 'Aşpaz', en: 'Cook / chef', keywords: ['koch', 'köchin', 'cook', 'chef', 'aşpaz', 'повар'] },
  { code: '29301', de: 'Küchenhilfe', az: 'Mətbəx köməkçisi', en: 'Kitchen helper', keywords: ['küche', 'kitchen', 'mətbəx', 'helfer'] },
  { code: '81302', de: 'Gesundheits- und Krankenpfleger/in / Pflegefachkraft', az: 'Tibb bacısı / qardaşı', en: 'Nurse (registered)', keywords: ['pflege', 'pflegefachkraft', 'kranken', 'nurse', 'tibb', 'медсестра'] },
  { code: '81301', de: 'Pflegehelfer/in (Krankenpflege)', az: 'Tibb bacısı köməkçisi', en: 'Nursing assistant', keywords: ['pflegehelfer', 'pflege', 'assistant', 'köməkçi'] },
  { code: '82102', de: 'Altenpfleger/in', az: 'Qocalara qulluq mütəxəssisi', en: 'Geriatric nurse', keywords: ['altenpflege', 'altenpfleger', 'elderly', 'qulluq'] },
  { code: '82101', de: 'Altenpflegehelfer/in', az: 'Qocalara qulluq köməkçisi', en: 'Elderly care assistant', keywords: ['altenpflegehelfer', 'altenpflege', 'helfer'] },
  { code: '26212', de: 'Elektroniker/in – Energie- und Gebäudetechnik', az: 'Elektrik', en: 'Electrician (buildings)', keywords: ['elektriker', 'elektroniker', 'electrician', 'elektrik', 'электрик'] },
  { code: '26252', de: 'Elektroniker/in – Betriebstechnik', az: 'Elektrik (sənaye)', en: 'Industrial electrician', keywords: ['betriebstechnik', 'elektriker', 'industrial', 'electrician'], verify: true },
  { code: '25212', de: 'Kfz-Mechatroniker/in', az: 'Avtomexanik', en: 'Car mechanic', keywords: ['kfz', 'mechatroniker', 'mechanic', 'mexanik', 'механик'] },
  { code: '34212', de: 'Anlagenmechaniker/in SHK', az: 'Santexnik', en: 'Plumber / HVAC fitter', keywords: ['shk', 'sanitär', 'heizung', 'plumber', 'santexnik'], verify: true },
  { code: '32122', de: 'Maurer/in', az: 'Hörgüçü', en: 'Bricklayer', keywords: ['maurer', 'bricklayer', 'hörgü', 'bau'], verify: true },
  { code: '32101', de: 'Bauhelfer/in (Hochbau)', az: 'Tikinti işçisi', en: 'Construction worker', keywords: ['bau', 'bauarbeiter', 'bauhelfer', 'construction', 'tikinti', 'строитель'], verify: true },
  { code: '63302', de: 'Restaurantfachmann/-frau / Servicekraft', az: 'Ofisiant', en: 'Waiter / restaurant service', keywords: ['service', 'kellner', 'restaurant', 'waiter', 'ofisiant'], verify: true },
  { code: '11101', de: 'Helfer/in Landwirtschaft / Erntehelfer/in', az: 'Kənd təsərrüfatı işçisi', en: 'Farm / harvest worker', keywords: ['landwirtschaft', 'ernte', 'farm', 'harvest', 'kənd'], verify: true },
  { code: '54101', de: 'Reinigungskraft', az: 'Təmizlikçi', en: 'Cleaner', keywords: ['reinigung', 'cleaner', 'təmizlik', 'уборщик'], verify: true },
  { code: '71402', de: 'Kaufmann/-frau für Büromanagement / Bürofachkraft', az: 'Ofis mütəxəssisi', en: 'Office specialist', keywords: ['büro', 'office', 'ofis', 'kaufmann'] },
];

export const occupationByCode = (code: string | null | undefined) => (code ? OCCUPATIONS.find((o) => o.code === code) : undefined);

/** Best matches for a search text (code prefix or any word of the names / keywords). */
export const searchOccupations = (q: string, limit = 12): Occupation[] => {
  const s = q.trim().toLowerCase();
  if (!s) return OCCUPATIONS.slice(0, limit);
  const score = (o: Occupation) => {
    if (o.code.startsWith(s)) return 3;
    if ([o.de, o.az, o.en].some((n) => n.toLowerCase().includes(s))) return 2;
    if (o.keywords.some((k) => k.includes(s) || s.includes(k))) return 1;
    return 0;
  };
  return OCCUPATIONS.map((o) => ({ o, s: score(o) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.o);
};

/** Suggestion from the vacancy's free-text profession / German title (first keyword hit). */
export const suggestOccupation = (...texts: (string | null | undefined)[]): Occupation | undefined => {
  const hay = texts.filter(Boolean).join(' ').toLowerCase();
  if (!hay) return undefined;
  return OCCUPATIONS.find((o) => o.keywords.some((k) => k.length >= 3 && hay.includes(k)));
};
