import type { Locale } from '@/i18n';

/**
 * German city profiles for the public city guide (/cities) and the cost calculator.
 *
 * All money values are approximate monthly euro amounts for 2026, built from public rent indices and
 * listing portals of 2025 with a moderate increase. They are orientation values, not quotes:
 *  - rent: cold rent (Kaltmiete) per m² for new contracts; small flats cost more per m² than larger ones;
 *  - wgRoom: a room in a shared flat, all-in ("warm", utilities and internet usually included);
 *  - utilities: Nebenkosten incl. heating per m² (electricity is separate).
 */

export type L4 = Record<Locale, string>;
export type Range = readonly [number, number];

export type Industry =
  | 'health'
  | 'care'
  | 'logistics'
  | 'automotive'
  | 'it'
  | 'construction'
  | 'hospitality'
  | 'manufacturing'
  | 'trade'
  | 'finance'
  | 'media'
  | 'chemicals'
  | 'energy'
  | 'aviation'
  | 'port'
  | 'research'
  | 'electrical'
  | 'food';

export type Climate = 'north' | 'west' | 'south' | 'east' | 'central';
export type Community = 'large' | 'notable' | 'smaller';
export type Airport = 'BER' | 'HAM' | 'MUC' | 'CGN' | 'FRA' | 'STR' | 'DUS' | 'LEJ' | 'DRS' | 'HAJ' | 'NUE' | 'DTM' | 'BRE';

export interface City {
  slug: string;
  name: L4;
  state: string; // Bundesland (German name)
  population: number; // approx., 2024/2025
  description: L4;
  industries: Industry[];
  rent: { oneRoom: Range; twoRoom: Range }; // € per m², cold
  wgRoom: Range; // € per month, all-in
  utilities: Range; // € per m², incl. heating
  groceries: Range; // € per adult per month
  car: Range; // € per month (insurance, tax, fuel, upkeep, parking) without purchase/loan
  transport: string; // local operators / network
  community: Community;
  climate: Climate;
  website?: string;
  airport?: Airport;
}

const same = (s: string): L4 => ({ az: s, de: s, en: s, ru: s });

/** Deutschlandticket price per month in 2026 (raised from 58 € to 63 € on 1 January 2026). */
export const DEUTSCHLANDTICKET = 63;
/** Broadcasting fee per household per month (unchanged at 18.36 € at the time of writing). */
export const RUNDFUNK = 18.36;
/** Child benefit per child per month in 2026. */
export const KINDERGELD = 259;
export const DATA_YEAR = 2026;

export const CITIES: City[] = [
  {
    slug: 'berlin',
    name: same('Berlin'),
    state: 'Berlin',
    population: 3_880_000,
    description: {
      az: 'Almaniyanın paytaxtı və ən böyük şəhəri: beynəlxalq mühit, çoxlu iş yeri və geniş mədəni həyat. Mənzil tapmaq çətindir, buna görə tez başlamaq vacibdir.',
      de: 'Hauptstadt und größte Stadt Deutschlands: international, viele Arbeitgeber und ein riesiges Kulturangebot. Der Wohnungsmarkt ist angespannt – früh mit der Suche beginnen.',
      en: 'Germany’s capital and largest city: international, many employers and a huge cultural scene. The housing market is tight, so start searching early.',
      ru: 'Столица и крупнейший город Германии: международная среда, много работодателей и богатая культурная жизнь. Найти жильё сложно — начинайте поиск заранее.',
    },
    industries: ['it', 'health', 'care', 'hospitality', 'construction', 'logistics', 'media'],
    rent: { oneRoom: [17, 23], twoRoom: [14, 19] },
    wgRoom: [600, 720],
    utilities: [2.9, 3.6],
    groceries: [260, 340],
    car: [320, 450],
    transport: 'BVG, S-Bahn Berlin (VBB)',
    community: 'large',
    climate: 'east',
    website: 'https://www.berlin.de',
    airport: 'BER',
  },
  {
    slug: 'hamburg',
    name: same('Hamburg'),
    state: 'Hamburg',
    population: 1_910_000,
    description: {
      az: 'Avropanın ən böyük limanlarından biri olan liman şəhəri: logistika, aviasiya və ticarət güclüdür. Yaşıl, səliqəli, lakin bahalı şəhərdir.',
      de: 'Hafenmetropole mit einem der größten Häfen Europas: stark in Logistik, Luftfahrt und Handel. Grün und gepflegt, aber teuer.',
      en: 'Port city with one of Europe’s largest harbours: strong in logistics, aviation and trade. Green and well kept, but expensive.',
      ru: 'Портовый мегаполис с одним из крупнейших портов Европы: сильны логистика, авиация и торговля. Зелёный и ухоженный, но дорогой город.',
    },
    industries: ['port', 'logistics', 'aviation', 'trade', 'health', 'media'],
    rent: { oneRoom: [17, 22], twoRoom: [14, 18] },
    wgRoom: [600, 700],
    utilities: [2.9, 3.6],
    groceries: [270, 350],
    car: [330, 460],
    transport: 'HVV (Hochbahn, S-Bahn Hamburg)',
    community: 'large',
    climate: 'north',
    website: 'https://www.hamburg.de',
    airport: 'HAM',
  },
  {
    slug: 'muenchen',
    name: { az: 'Münhen', de: 'München', en: 'Munich', ru: 'Мюнхен' },
    state: 'Bayern',
    population: 1_510_000,
    description: {
      az: 'Almaniyanın ən bahalı, lakin maaşları da ən yüksək olan şəhərlərindən biri: avtomobil, IT, sığorta. Alp dağlarına yaxın, təhlükəsiz şəhər.',
      de: 'Eine der teuersten Städte Deutschlands – mit entsprechend hohen Löhnen: Automobil, IT, Versicherungen. Sicher und nah an den Alpen.',
      en: 'One of Germany’s most expensive cities, with matching high wages: automotive, IT, insurance. Safe and close to the Alps.',
      ru: 'Один из самых дорогих городов Германии — и с самыми высокими зарплатами: автопром, IT, страхование. Безопасный город рядом с Альпами.',
    },
    industries: ['automotive', 'it', 'finance', 'health', 'care', 'construction', 'hospitality'],
    rent: { oneRoom: [24, 31], twoRoom: [21, 26] },
    wgRoom: [760, 880],
    utilities: [3.0, 3.8],
    groceries: [290, 370],
    car: [360, 500],
    transport: 'MVV (MVG, S-Bahn München)',
    community: 'large',
    climate: 'south',
    website: 'https://www.muenchen.de',
    airport: 'MUC',
  },
  {
    slug: 'koeln',
    name: { az: 'Köln', de: 'Köln', en: 'Cologne', ru: 'Кёльн' },
    state: 'Nordrhein-Westfalen',
    population: 1_090_000,
    description: {
      az: 'Reyn çayı üzərində açıq və mehriban şəhər: media, sığorta, kimya və logistika. Ruhr və Düsseldorf ilə yaxşı nəqliyyat əlaqəsi var.',
      de: 'Offene, lebensfrohe Stadt am Rhein: Medien, Versicherungen, Chemie und Logistik. Sehr gut angebunden an Düsseldorf und das Ruhrgebiet.',
      en: 'Open, cheerful city on the Rhine: media, insurance, chemicals and logistics. Very well connected to Düsseldorf and the Ruhr area.',
      ru: 'Открытый и жизнерадостный город на Рейне: медиа, страхование, химия и логистика. Отличное сообщение с Дюссельдорфом и Руром.',
    },
    industries: ['media', 'chemicals', 'logistics', 'automotive', 'health', 'care', 'trade'],
    rent: { oneRoom: [16, 20], twoRoom: [13, 16] },
    wgRoom: [560, 650],
    utilities: [2.8, 3.5],
    groceries: [260, 340],
    car: [320, 440],
    transport: 'KVB (VRS)',
    community: 'large',
    climate: 'west',
    website: 'https://www.stadt-koeln.de',
    airport: 'CGN',
  },
  {
    slug: 'frankfurt',
    name: { az: 'Frankfurt (Main)', de: 'Frankfurt am Main', en: 'Frankfurt am Main', ru: 'Франкфурт-на-Майне' },
    state: 'Hessen',
    population: 775_000,
    description: {
      az: 'Avropanın maliyyə mərkəzi və ən böyük hava limanlarından biri: bank, aviasiya, logistika. Çox beynəlxalq şəhərdir, kirayələr yüksəkdir.',
      de: 'Finanzzentrum Europas mit einem der größten Flughäfen: Banken, Luftfahrt, Logistik. Sehr international, die Mieten sind hoch.',
      en: 'Europe’s financial centre with one of its largest airports: banking, aviation, logistics. Very international, rents are high.',
      ru: 'Финансовый центр Европы с одним из крупнейших аэропортов: банки, авиация, логистика. Очень интернациональный город, аренда высокая.',
    },
    industries: ['finance', 'aviation', 'logistics', 'it', 'chemicals', 'health', 'hospitality'],
    rent: { oneRoom: [18, 24], twoRoom: [15, 19] },
    wgRoom: [640, 740],
    utilities: [2.9, 3.6],
    groceries: [270, 350],
    car: [340, 470],
    transport: 'RMV (VGF, S-Bahn Rhein-Main)',
    community: 'large',
    climate: 'central',
    website: 'https://frankfurt.de',
    airport: 'FRA',
  },
  {
    slug: 'stuttgart',
    name: { az: 'Ştutqart', de: 'Stuttgart', en: 'Stuttgart', ru: 'Штутгарт' },
    state: 'Baden-Württemberg',
    population: 633_000,
    description: {
      az: 'Avtomobil sənayesinin vətəni: Mercedes-Benz, Porsche, Bosch və yüzlərlə təchizatçı. Mühəndislər, mexatroniklər və elektriklər üçün çox iş var.',
      de: 'Heimat der Autoindustrie: Mercedes-Benz, Porsche, Bosch und hunderte Zulieferer. Viel Arbeit für Ingenieure, Mechatroniker und Elektriker.',
      en: 'Home of the car industry: Mercedes-Benz, Porsche, Bosch and hundreds of suppliers. Plenty of work for engineers, mechatronics technicians and electricians.',
      ru: 'Родина автопрома: Mercedes-Benz, Porsche, Bosch и сотни поставщиков. Много работы для инженеров, мехатроников и электриков.',
    },
    industries: ['automotive', 'manufacturing', 'electrical', 'it', 'health', 'care'],
    rent: { oneRoom: [17, 22], twoRoom: [15, 18] },
    wgRoom: [600, 700],
    utilities: [2.9, 3.6],
    groceries: [270, 350],
    car: [340, 470],
    transport: 'VVS (SSB, S-Bahn Stuttgart)',
    community: 'notable',
    climate: 'south',
    website: 'https://www.stuttgart.de',
    airport: 'STR',
  },
  {
    slug: 'duesseldorf',
    name: { az: 'Düsseldorf', de: 'Düsseldorf', en: 'Düsseldorf', ru: 'Дюссельдорф' },
    state: 'Nordrhein-Westfalen',
    population: 631_000,
    description: {
      az: 'Şimali Reyn-Vestfaliyanın paytaxtı: ticarət, reklam, telekommunikasiya və sərgilər şəhəri. Böyük hava limanı və geniş rusdilli icma var.',
      de: 'Landeshauptstadt von NRW: Handel, Werbung, Telekommunikation und Messen. Großer Flughafen und eine große russischsprachige Gemeinschaft.',
      en: 'Capital of North Rhine-Westphalia: trade, advertising, telecoms and trade fairs. Large airport and a big Russian-speaking community.',
      ru: 'Столица земли Северный Рейн-Вестфалия: торговля, реклама, телекоммуникации и выставки. Крупный аэропорт и большая русскоязычная община.',
    },
    industries: ['trade', 'it', 'finance', 'logistics', 'health', 'care', 'hospitality'],
    rent: { oneRoom: [15, 19], twoRoom: [12.5, 15.5] },
    wgRoom: [540, 630],
    utilities: [2.8, 3.5],
    groceries: [260, 340],
    car: [320, 440],
    transport: 'Rheinbahn (VRR)',
    community: 'large',
    climate: 'west',
    website: 'https://www.duesseldorf.de',
    airport: 'DUS',
  },
  {
    slug: 'leipzig',
    name: { az: 'Leypsiq', de: 'Leipzig', en: 'Leipzig', ru: 'Лейпциг' },
    state: 'Sachsen',
    population: 628_000,
    description: {
      az: 'Sürətlə böyüyən, gənc şəhər: logistika (DHL hab), avtomobil zavodları (BMW, Porsche) və səhiyyə. Kirayələr böyük şəhərlərə görə əlçatandır.',
      de: 'Schnell wachsende, junge Stadt: Logistik (DHL-Drehkreuz), Autowerke (BMW, Porsche) und Gesundheit. Die Mieten sind für eine Großstadt bezahlbar.',
      en: 'Fast-growing, young city: logistics (DHL hub), car plants (BMW, Porsche) and healthcare. Rents are affordable for a big city.',
      ru: 'Быстрорастущий молодой город: логистика (хаб DHL), автозаводы (BMW, Porsche) и здравоохранение. Аренда доступная для большого города.',
    },
    industries: ['logistics', 'automotive', 'health', 'care', 'it', 'trade'],
    rent: { oneRoom: [10, 13], twoRoom: [8, 10.5] },
    wgRoom: [390, 460],
    utilities: [2.6, 3.3],
    groceries: [240, 310],
    car: [290, 400],
    transport: 'LVB (MDV)',
    community: 'notable',
    climate: 'east',
    website: 'https://www.leipzig.de',
    airport: 'LEJ',
  },
  {
    slug: 'dresden',
    name: { az: 'Drezden', de: 'Dresden', en: 'Dresden', ru: 'Дрезден' },
    state: 'Sachsen',
    population: 567_000,
    description: {
      az: 'Saksoniyanın paytaxtı, "Silikon Saksoniya": mikroelektronika, tədqiqat və səhiyyə. Gözəl tarixi mərkəz və sakit həyat tempi.',
      de: 'Sächsische Landeshauptstadt und „Silicon Saxony“: Mikroelektronik, Forschung und Gesundheit. Schöne Altstadt, ruhigeres Lebenstempo.',
      en: 'Saxony’s capital and “Silicon Saxony”: microelectronics, research and healthcare. Beautiful old town and a calmer pace of life.',
      ru: 'Столица Саксонии и «Кремниевая Саксония»: микроэлектроника, исследования и медицина. Красивый исторический центр и спокойный ритм жизни.',
    },
    industries: ['electrical', 'research', 'health', 'care', 'manufacturing', 'hospitality'],
    rent: { oneRoom: [10, 13], twoRoom: [8.5, 10.5] },
    wgRoom: [390, 460],
    utilities: [2.6, 3.3],
    groceries: [240, 310],
    car: [290, 400],
    transport: 'DVB (VVO)',
    community: 'notable',
    climate: 'east',
    website: 'https://www.dresden.de',
    airport: 'DRS',
  },
  {
    slug: 'hannover',
    name: { az: 'Hannover', de: 'Hannover', en: 'Hanover', ru: 'Ганновер' },
    state: 'Niedersachsen',
    population: 548_000,
    description: {
      az: 'Aşağı Saksoniyanın paytaxtı: sərgilər, sığorta, avtomobil (Volkswagen kommersiya avtomobilləri) və səhiyyə. Mərkəzi yerləşmə, orta xərclər.',
      de: 'Landeshauptstadt Niedersachsens: Messen, Versicherungen, Automobil (VW Nutzfahrzeuge) und Gesundheit. Zentrale Lage, mittlere Kosten.',
      en: 'Capital of Lower Saxony: trade fairs, insurance, automotive (VW Commercial Vehicles) and healthcare. Central location, moderate costs.',
      ru: 'Столица Нижней Саксонии: выставки, страхование, автопром (VW Nutzfahrzeuge) и медицина. Центральное расположение, средние расходы.',
    },
    industries: ['automotive', 'finance', 'health', 'care', 'logistics', 'manufacturing'],
    rent: { oneRoom: [12, 15], twoRoom: [10, 12.5] },
    wgRoom: [450, 530],
    utilities: [2.7, 3.4],
    groceries: [250, 320],
    car: [300, 420],
    transport: 'ÜSTRA (GVH)',
    community: 'large',
    climate: 'north',
    website: 'https://www.hannover.de',
    airport: 'HAJ',
  },
  {
    slug: 'nuernberg',
    name: { az: 'Nürnberq', de: 'Nürnberg', en: 'Nuremberg', ru: 'Нюрнберг' },
    state: 'Bayern',
    population: 530_000,
    description: {
      az: 'Bavariyanın ikinci böyük şəhəri: elektrotexnika, logistika, IT və sərgilər. Münhendən xeyli ucuzdur, maaşlar isə yaxşıdır.',
      de: 'Zweitgrößte Stadt Bayerns: Elektrotechnik, Logistik, IT und Messen. Deutlich günstiger als München bei guten Löhnen.',
      en: 'Bavaria’s second city: electrical engineering, logistics, IT and trade fairs. Much cheaper than Munich, with good wages.',
      ru: 'Второй город Баварии: электротехника, логистика, IT и выставки. Заметно дешевле Мюнхена при хороших зарплатах.',
    },
    industries: ['electrical', 'logistics', 'it', 'manufacturing', 'health', 'care'],
    rent: { oneRoom: [13, 16.5], twoRoom: [11, 13.5] },
    wgRoom: [480, 560],
    utilities: [2.8, 3.4],
    groceries: [260, 330],
    car: [300, 420],
    transport: 'VAG (VGN)',
    community: 'notable',
    climate: 'south',
    website: 'https://www.nuernberg.de',
    airport: 'NUE',
  },
  {
    slug: 'dortmund',
    name: { az: 'Dortmund', de: 'Dortmund', en: 'Dortmund', ru: 'Дортмунд' },
    state: 'Nordrhein-Westfalen',
    population: 595_000,
    description: {
      az: 'Ruhr vilayətinin ən böyük şəhəri: logistika, IT, sığorta və tikinti. Kirayələr aşağıdır, Ruhrun digər şəhərləri yaxındır.',
      de: 'Größte Stadt des Ruhrgebiets: Logistik, IT, Versicherungen und Bau. Niedrige Mieten, die anderen Ruhrstädte sind nah.',
      en: 'The largest city of the Ruhr area: logistics, IT, insurance and construction. Low rents, the other Ruhr cities are close by.',
      ru: 'Крупнейший город Рурской области: логистика, IT, страхование и строительство. Низкая аренда, другие города Рура рядом.',
    },
    industries: ['logistics', 'it', 'construction', 'finance', 'health', 'care'],
    rent: { oneRoom: [10, 13], twoRoom: [8.5, 10.5] },
    wgRoom: [400, 470],
    utilities: [2.7, 3.4],
    groceries: [240, 310],
    car: [290, 400],
    transport: 'DSW21 (VRR)',
    community: 'notable',
    climate: 'west',
    website: 'https://www.dortmund.de',
    airport: 'DTM',
  },
  {
    slug: 'bremen',
    name: { az: 'Bremen', de: 'Bremen', en: 'Bremen', ru: 'Бремен' },
    state: 'Bremen',
    population: 577_000,
    description: {
      az: 'Hanza şəhəri və limanı: aviasiya və kosmos (Airbus), qida sənayesi, avtomobil (Mercedes-Benz zavodu) və logistika. Orta xərclər.',
      de: 'Hansestadt mit Hafen: Luft- und Raumfahrt (Airbus), Lebensmittelindustrie, Automobil (Mercedes-Benz-Werk) und Logistik. Mittlere Kosten.',
      en: 'Hanseatic port city: aerospace (Airbus), food industry, automotive (Mercedes-Benz plant) and logistics. Moderate costs.',
      ru: 'Ганзейский портовый город: авиация и космос (Airbus), пищевая промышленность, автопром (завод Mercedes-Benz) и логистика. Средние расходы.',
    },
    industries: ['aviation', 'food', 'automotive', 'port', 'logistics', 'health', 'care'],
    rent: { oneRoom: [11.5, 14], twoRoom: [9.5, 12] },
    wgRoom: [420, 500],
    utilities: [2.7, 3.4],
    groceries: [250, 320],
    car: [300, 410],
    transport: 'BSAG (VBN)',
    community: 'notable',
    climate: 'north',
    website: 'https://www.bremen.de',
    airport: 'BRE',
  },
  {
    slug: 'essen',
    name: { az: 'Essen', de: 'Essen', en: 'Essen', ru: 'Эссен' },
    state: 'Nordrhein-Westfalen',
    population: 584_000,
    description: {
      az: 'Ruhrun mərkəzi: enerji şirkətləri, ticarət, səhiyyə (böyük universitet klinikası). Kirayələr Almaniyanın böyük şəhərləri arasında ən aşağılardandır.',
      de: 'Zentrum des Ruhrgebiets: Energiekonzerne, Handel, Gesundheit (großes Uniklinikum). Die Mieten gehören zu den niedrigsten unter den Großstädten.',
      en: 'Heart of the Ruhr: energy groups, retail, healthcare (large university hospital). Rents are among the lowest of Germany’s big cities.',
      ru: 'Центр Рура: энергетические концерны, торговля, медицина (крупная университетская клиника). Аренда — одна из самых низких среди крупных городов.',
    },
    industries: ['energy', 'trade', 'health', 'care', 'construction', 'logistics'],
    rent: { oneRoom: [10, 12.5], twoRoom: [8.5, 10.5] },
    wgRoom: [390, 460],
    utilities: [2.7, 3.4],
    groceries: [240, 310],
    car: [290, 400],
    transport: 'Ruhrbahn (VRR)',
    community: 'notable',
    climate: 'west',
    website: 'https://www.essen.de',
    airport: 'DUS',
  },
  {
    slug: 'small-town',
    name: { az: 'Kiçik şəhər (nümunə)', de: 'Kleinstadt (Beispiel)', en: 'Small town (example)', ru: 'Небольшой город (пример)' },
    state: '—',
    population: 30_000,
    description: {
      az: 'Bir çox müştərimiz kiçik şəhərlərdə xəstəxana, qocalar evi və ya istehsalat müəssisəsində işləyir. Kirayələr aşağıdır, lakin çox vaxt avtomobil lazım olur.',
      de: 'Viele unserer Kundinnen und Kunden arbeiten in Kleinstädten – in Kliniken, Pflegeheimen oder Betrieben. Die Mieten sind niedrig, oft braucht man aber ein Auto.',
      en: 'Many of our clients work in small towns – in hospitals, care homes or factories. Rents are low, but you often need a car.',
      ru: 'Многие наши клиенты работают в небольших городах — в клиниках, домах престарелых или на производстве. Аренда низкая, но часто нужен автомобиль.',
    },
    industries: ['care', 'health', 'manufacturing', 'construction', 'food', 'logistics'],
    rent: { oneRoom: [8, 11], twoRoom: [7, 9] },
    wgRoom: [320, 400],
    utilities: [2.5, 3.2],
    groceries: [230, 300],
    car: [260, 370],
    transport: '—',
    community: 'smaller',
    climate: 'central',
  },
];

export const cityBySlug = (slug: string | null | undefined) => CITIES.find((c) => c.slug === slug);
