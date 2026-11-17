import type { Locale } from '@/i18n';

/**
 * "Azerbaijan in Germany" (/azerbaijan-in-germany): a small, hand-verified list of Azerbaijani institutions,
 * cultural places, associations and food places in Germany. Only entries we could confirm in at least one
 * public source (OpenStreetMap and/or the organisation's own or an official web page) are listed; private
 * individuals are never listed. Every entry carries its sources and the date it was checked.
 *
 * Research notes (16.11.2026): an OpenStreetMap search over all of Germany (cuisine=azerbaijani/caucasian,
 * names with Aserbaidschan/Azerbaijan/Baku/Bakı/Kaukasus… on restaurants, cafés, shops, offices, clubs) found no
 * restaurant tagged with Azerbaijani cuisine; many "Baku" places are döner/pizza shops without an Azerbaijani
 * link and are left out. Associations named in older encyclopaedia articles without a current web presence are
 * left out too. Corrections go through /contact.
 *
 * Data partly © OpenStreetMap contributors, ODbL (https://www.openstreetmap.org/copyright).
 */

export type L4 = Record<Locale, string>;
export type PlaceType = 'official' | 'culture' | 'community' | 'food';

export interface Source {
  label: string;
  url: string;
}

export interface AzPlace {
  id: string;
  type: PlaceType;
  name: string;
  city: string;
  address: string;
  lat: number;
  lon: number;
  website?: string;
  phone?: string;
  /** OpenStreetMap object ("node/123", "way/456") when the entry was found or checked there. */
  osm?: string;
  sources: Source[];
  verifiedOn: string;
  note: L4;
}

export const VERIFIED_ON = '2026-11-16';

const AA_LIST: Source = {
  label: 'Auswärtiges Amt: Vertretungen Aserbaidschans in Deutschland',
  url: 'https://www.auswaertiges-amt.de/de/service/laender/aserbaidschan-node/vertretungenaserbaidschan/201896',
};

export const AZ_PLACES: AzPlace[] = [
  {
    id: 'embassy',
    type: 'official',
    name: 'Botschaft der Republik Aserbaidschan (Konsularabteilung)',
    city: 'Berlin',
    address: 'Hubertusallee 43, 14193 Berlin',
    lat: 52.48753,
    lon: 13.28411,
    website: 'https://berlin.mfa.gov.az',
    phone: '+49 30 2191613',
    osm: 'node/548141332',
    sources: [{ label: 'berlin.mfa.gov.az: Kontakt', url: 'https://berlin.mfa.gov.az/en/contacts' }, AA_LIST],
    verifiedOn: VERIFIED_ON,
    note: {
      az: 'Səfirlik bütün Almaniya üzrə məsuldur. Konsulluq şöbəsi: +49 30 20648063. Qəbul və zəng saatlarını səfirliyin saytında yoxlayın.',
      de: 'Zuständig für ganz Deutschland. Konsularabteilung: +49 30 20648063. Sprech- und Telefonzeiten bitte auf der Website der Botschaft prüfen.',
      en: 'Responsible for all of Germany. Consular section: +49 30 20648063. Check opening and phone hours on the embassy website.',
      ru: 'Отвечает за всю Германию. Консульский отдел: +49 30 20648063. Часы приёма и звонков проверяйте на сайте посольства.',
    },
  },
  {
    id: 'culture-centre',
    type: 'culture',
    name: 'Kulturzentrum Aserbaidschan (Kulturabteilung der Botschaft)',
    city: 'Berlin',
    address: 'Klingelhöferstraße 20, 10785 Berlin',
    lat: 52.50737,
    lon: 13.35291,
    website: 'https://berlin.mfa.gov.az',
    osm: 'way/479109936',
    sources: [AA_LIST],
    verifiedOn: VERIFIED_ON,
    note: {
      az: 'Səfirliyin mədəniyyət şöbəsi: sərgilər, konsertlər və bayram tədbirləri. Xarici İşlər Nazirliyinin siyahısında səfirlik üçün bu ünvan da göstərilir.',
      de: 'Kulturabteilung der Botschaft: Ausstellungen, Konzerte und Feste. Das Auswärtige Amt führt diese Adresse auch als Anschrift der Botschaft.',
      en: 'The embassy’s cultural department: exhibitions, concerts and festivities. The German Foreign Office also lists this address for the embassy.',
      ru: 'Культурный отдел посольства: выставки, концерты и праздники. МИД Германии указывает этот адрес и как адрес посольства.',
    },
  },
  {
    id: 'honorary-consulate-stuttgart',
    type: 'official',
    name: 'Honorarkonsulat der Republik Aserbaidschan',
    city: 'Stuttgart',
    address: 'Presselstraße, 70191 Stuttgart',
    lat: 48.80034,
    lon: 9.18365,
    osm: 'node/6242691771',
    sources: [
      { label: 'OpenStreetMap', url: 'https://www.openstreetmap.org/node/6242691771' },
      { label: 'AZERTAC: Honorary consulate opened in Stuttgart', url: 'https://azertag.az/en/xeber/azerbaijans_honorary_consulate_opened_in_stuttgart-590078' },
    ],
    verifiedOn: VERIFIED_ON,
    note: {
      az: 'Fəxri konsulluq pasport və viza vermir. Hazırkı fəaliyyət və saatlar rəsmi siyahıda təsdiqlənmədi — əvvəlcə səfirliklə əlaqə saxlayın. Köhnə sayt artıq başqa səhifəyə yönləndirir, ona görə link verilmir.',
      de: 'Ein Honorarkonsulat stellt keine Pässe oder Visa aus. Aktueller Betrieb und Sprechzeiten waren in keiner amtlichen Liste bestätigt – bitte zuerst die Botschaft fragen. Die frühere Website leitet inzwischen auf eine fremde Seite um und ist daher nicht verlinkt.',
      en: 'An honorary consulate does not issue passports or visas. Current operation and hours could not be confirmed on an official list — ask the embassy first. Its former website now redirects to an unrelated page, so it is not linked.',
      ru: 'Почётное консульство не выдаёт паспорта и визы. Текущая работа и часы не подтверждены в официальном списке — сначала обратитесь в посольство. Прежний сайт перенаправляет на посторонний ресурс, поэтому ссылки нет.',
    },
  },
  {
    id: 'karlstadt-verein',
    type: 'community',
    name: 'Aserbaidschan Kultur Verein Karlstadt e.V.',
    city: 'Karlstadt',
    address: 'Martellstraße 4, 97753 Karlstadt',
    lat: 49.95924,
    lon: 9.75873,
    osm: 'way/220777264',
    sources: [{ label: 'OpenStreetMap', url: 'https://www.openstreetmap.org/way/220777264' }],
    verifiedOn: VERIFIED_ON,
    note: {
      az: 'İcma birliyi; OpenStreetMap-da həm də ibadət yeri kimi qeyd olunub. Öz saytı tapılmadı.',
      de: 'Gemeinschaftsverein; in OpenStreetMap zugleich als Gebetsstätte eingetragen. Eine eigene Website haben wir nicht gefunden.',
      en: 'A community association; OpenStreetMap also lists it as a place of worship. We found no website of its own.',
      ru: 'Общественное объединение; в OpenStreetMap также отмечено как место молитвы. Собственного сайта мы не нашли.',
    },
  },
  {
    id: 'cafe-baku-berlin',
    type: 'food',
    name: 'Cafe Baku (Baku City)',
    city: 'Berlin',
    address: 'Brandenburgische Straße 22, 10707 Berlin',
    lat: 52.4961,
    lon: 13.30868,
    website: 'https://www.bakucitycatering.de',
    osm: 'node/760035376',
    sources: [{ label: 'HauptstadtEcho, 15.02.2026: Aserbaidschanische Küche in Wilmersdorf', url: 'https://hauptstadtecho.de/aserbaidschanische-kueche-in-wilmersdorf/' }],
    verifiedOn: VERIFIED_ON,
    note: {
      az: 'Azərbaycan şirniyyatları və isti yeməklər; şənbə günləri səhər yeməyi. OSM-də açılış saatları 22.05.2026-da yoxlanılıb (bazar ertəsi bağlıdır).',
      de: 'Aserbaidschanisches Gebäck und warme Gerichte, samstags Brunch. Öffnungszeiten in OSM am 22.05.2026 geprüft (montags Ruhetag).',
      en: 'Azerbaijani pastries and warm dishes, brunch on Saturdays. Opening hours checked in OSM on 22 May 2026 (closed on Mondays).',
      ru: 'Азербайджанская выпечка и горячие блюда, по субботам бранч. Часы работы проверены в OSM 22.05.2026 (понедельник — выходной).',
    },
  },
  {
    id: 'botanic-garden-steppe',
    type: 'culture',
    name: 'Botanischer Garten Berlin: Aserbaidschan – Steppe, Halbwüste, Salzvegetation',
    city: 'Berlin',
    address: 'Königin-Luise-Straße 6–8, 14195 Berlin',
    lat: 52.45504,
    lon: 13.30391,
    website: 'https://www.bo.berlin',
    osm: 'way/542817261',
    sources: [{ label: 'OpenStreetMap', url: 'https://www.openstreetmap.org/way/542817261' }],
    verifiedOn: VERIFIED_ON,
    note: {
      az: 'Bitki coğrafiyası bölməsində Azərbaycanın çöl və yarımsəhra bitkiləri. Bağa giriş pulludur.',
      de: 'Pflanzen der aserbaidschanischen Steppe und Halbwüste in der pflanzengeografischen Abteilung. Eintritt in den Garten kostenpflichtig.',
      en: 'Plants of the Azerbaijani steppe and semi-desert in the plant-geography section. Admission to the garden is charged.',
      ru: 'Растения азербайджанской степи и полупустыни в фитогеографическом отделе. Вход в сад платный.',
    },
  },
  {
    id: 'buddy-bear-azerbaijan',
    type: 'culture',
    name: 'Buddy Bär „Azerbaijan“',
    city: 'Berlin',
    address: 'Neue Jüdenstraße, 10179 Berlin',
    lat: 52.51542,
    lon: 13.41054,
    osm: 'node/2589577535',
    sources: [{ label: 'OpenStreetMap', url: 'https://www.openstreetmap.org/node/2589577535' }],
    verifiedOn: VERIFIED_ON,
    note: {
      az: 'Berlinin məşhur ayı heykəllərindən biri, Azərbaycan mövzusunda bəzədilib; Mitte rayonunda küçədə.',
      de: 'Einer der Berliner Buddy Bären, gestaltet zum Thema Aserbaidschan; frei zugänglich in Mitte.',
      en: 'One of Berlin’s Buddy Bear sculptures, designed on the theme of Azerbaijan; freely accessible in Mitte.',
      ru: 'Одна из берлинских скульптур Buddy Bear на тему Азербайджана; в свободном доступе в районе Митте.',
    },
  },
];

export const PLACE_TYPES: PlaceType[] = ['official', 'culture', 'community', 'food'];

/** Cities in the list, the one with most entries first. */
export const placeCities = (places: AzPlace[] = AZ_PLACES) => {
  const counts = new Map<string, number>();
  for (const p of places) counts.set(p.city, (counts.get(p.city) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'de')).map(([city]) => city);
};

/** Entries matching the type and city filters (null = all). */
export const filterPlaces = (places: AzPlace[], type: PlaceType | null, city: string | null) =>
  places.filter((p) => (!type || p.type === type) && (!city || p.city === city));

/** One map cluster per city: mean position and the entries in it. */
export const clusterByCity = (places: AzPlace[]) => {
  const groups = new Map<string, AzPlace[]>();
  for (const p of places) groups.set(p.city, [...(groups.get(p.city) ?? []), p]);
  return [...groups.entries()].map(([city, items]) => ({
    city,
    items,
    lat: items.reduce((s, p) => s + p.lat, 0) / items.length,
    lon: items.reduce((s, p) => s + p.lon, 0) / items.length,
  }));
};

export const osmUrl = (ref: string) => `https://www.openstreetmap.org/${ref}`;
export const osmMapUrl = (lat: number, lon: number) => `https://www.openstreetmap.org/?mlat=${lat.toFixed(5)}&mlon=${lon.toFixed(5)}#map=17/${lat.toFixed(5)}/${lon.toFixed(5)}`;
