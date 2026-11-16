/**
 * Texts of the quarterly labour mobility report (PDF + labels of the admin preview / public list).
 * Languages of the report: az, en, de.
 */

export const REPORT_LANGS = ['az', 'en', 'de'] as const;
export type ReportLang = (typeof REPORT_LANGS)[number];

export const reportLang = (v: unknown): ReportLang => (REPORT_LANGS.includes(v as ReportLang) ? (v as ReportLang) : 'en');

/** German federal states: the German names are used in every language (like the study catalogue). */
export const STATE_NAMES: Record<string, string> = {
  BW: 'Baden-Württemberg',
  BY: 'Bayern',
  BE: 'Berlin',
  BB: 'Brandenburg',
  HB: 'Bremen',
  HH: 'Hamburg',
  HE: 'Hessen',
  MV: 'Mecklenburg-Vorpommern',
  NI: 'Niedersachsen',
  NW: 'Nordrhein-Westfalen',
  RP: 'Rheinland-Pfalz',
  SL: 'Saarland',
  SN: 'Sachsen',
  ST: 'Sachsen-Anhalt',
  SH: 'Schleswig-Holstein',
  TH: 'Thüringen',
};

type Dict = Record<string, string>;

interface Texts {
  title: (q: number, y: number) => string;
  subtitle: string;
  quarterLabel: (q: number, y: number) => string;
  period: string;
  dataAsOf: string;
  intro: string;
  defaultIntro: (q: number, y: number) => string;
  keyFigures: string;
  approved: string;
  previousQuarter: string;
  change: string;
  fewer: string;
  noTrend: string;
  byProfession: string;
  byVisaType: string;
  byState: string;
  byLevel: string;
  levelNote: string;
  stateNote: string;
  processing: string;
  processingNote: string;
  stage: string;
  mean: string;
  median: string;
  cases: string;
  days: string;
  stages: Dict;
  comparison: string;
  thisQuarter: string;
  methodology: string;
  methodologyText: string[];
  suppressedNote: string;
  noData: string;
  other: string;
  unspecified: string;
  professions: Dict;
  visaTypes: Dict;
  levels: Dict;
  page: string;
  of: string;
  contact: string;
}

const az: Texts = {
  title: (q, y) => `Azərbaycan → Almaniya əmək miqrasiyası hesabatı, ${q}-ci rüb ${y}`,
  subtitle: 'Triad Vision vasitəsilə hazırlanan müraciətlər üzrə anonim statistika',
  quarterLabel: (q, y) => `${q}-ci rüb ${y}`,
  period: 'Dövr',
  dataAsOf: 'Məlumatların tarixi',
  intro: 'Giriş',
  defaultIntro: (q, y) =>
    `Bu hesabat ${y}-ci ilin ${q}-ci rübündə Triad Vision-un sənədlərini hazırladığı və Almaniya səfirliyinin müsbət qərar verdiyi viza müraciətlərini ümumiləşdirir. Bütün rəqəmlər anonimdir: 3-dən az müraciəti təsvir edən heç bir rəqəm göstərilmir.`,
  keyFigures: 'Əsas göstəricilər',
  approved: 'Təsdiqlənmiş vizalar',
  previousQuarter: 'Əvvəlki rüb',
  change: 'Dəyişiklik',
  fewer: '3-dən az',
  noTrend: 'müqayisə yoxdur (3-dən az)',
  byProfession: 'Peşələr üzrə',
  byVisaType: 'Viza növləri üzrə',
  byState: 'Almaniya əyalətləri üzrə (işəgötürənin yeri)',
  byLevel: 'Alman dili səviyyəsi üzrə',
  levelNote: 'Müştəri profilində qeyd olunan cari səviyyə.',
  stateNote: 'İşəgötürənin və ya vakansiyanın şəhərinə görə; şəhər məlum deyilsə — "göstərilməyib".',
  processing: 'Mərhələlər üzrə müddətlər (gün)',
  processingNote: 'Status tarixçəsindən hesablanır; yalnız ən azı 3 müraciəti olan mərhələlər göstərilir. Səfirlik mərhələsinə görüş gözləməsi daxildir.',
  stage: 'Mərhələ',
  mean: 'Orta',
  median: 'Median',
  cases: 'Müraciət',
  days: 'gün',
  stages: { documents: 'Sənədlər', contract: 'Müqavilə', embassy: 'Səfirlik faylı və görüş', decision: 'Səfirlik qərarı', total: 'Cəmi (müraciətdən qərara)' },
  comparison: 'Əvvəlki rüblə müqayisə',
  thisQuarter: 'Bu rüb',
  methodology: 'Metodologiya və məxfilik',
  methodologyText: [
    'Mənbə: Triad Vision-un daxili müraciət sistemi. Rübdə səfirlik qərarı (təsdiq) tarixi olan əsas müraciətlər sayılır; ailə üzvlərinin müraciətləri ayrıca sayılmır.',
    'Rüb sərhədləri Bakı vaxtı ilə müəyyən edilir.',
    'k-anonimlik (k = 3): 3-dən az müraciəti olan qruplar "Digər" qrupunda birləşdirilir; birləşmiş qrup da 3-dən azdırsa, göstərilmir. Fərdi məlumatlar heç vaxt dərc edilmir.',
    'Triad Vision sənədləri hazırlayır; müştəri səfirliyə özü müraciət edir və qərarı səfirlik verir. Bu rəqəmlər rəsmi statistika deyil.',
  ],
  suppressedNote: 'Bəzi müraciətlər 3-dən az olduğu üçün göstərilmir.',
  noData: 'Bu rüb üçün kifayət qədər məlumat yoxdur (3-dən az müraciət).',
  other: 'Digər (hər biri 3-dən az)',
  unspecified: 'Göstərilməyib',
  professions: {
    truck_driver: 'Yük maşını sürücüsü', bus_driver: 'Avtobus sürücüsü', courier: 'Kuryer', nurse: 'Tibb bacısı / qardaşı', cook: 'Aşpaz', waiter: 'Ofisiant',
    hotel: 'Otel işçisi', baker: 'Çörəkçi', butcher: 'Qəssab', welder: 'Qaynaqçı', construction_worker: 'İnşaat işçisi', electrician: 'Elektrik',
    plumber: 'Santexnik', mechanic: 'Mexanik', carpenter: 'Dülgər', painter: 'Rəngsaz', warehouse: 'Anbar işçisi', it: 'İT mütəxəssisi', agriculture: 'Kənd təsərrüfatı', cleaner: 'Təmizlikçi',
  },
  visaTypes: { WORK: 'İş vizası', AUSBILDUNG: 'Peşə təhsili (Ausbildung)', WEITERBILDUNG: 'Tanınma üçün təkmilləşmə', JOB_SEEKER: 'İş axtarışı / Chancenkarte', STUDY: 'Təhsil', FAMILY: 'Ailənin birləşməsi', TOURIST: 'Turist vizası' },
  levels: { none: 'Yoxdur' },
  page: 'Səhifə',
  of: '/',
  contact: 'Əlaqə',
};

const en: Texts = {
  title: (q, y) => `Azerbaijan → Germany labour mobility report Q${q} ${y}`,
  subtitle: 'Anonymous statistics of applications prepared with Triad Vision',
  quarterLabel: (q, y) => `Q${q} ${y}`,
  period: 'Period',
  dataAsOf: 'Data as of',
  intro: 'Introduction',
  defaultIntro: (q, y) =>
    `This report summarises the visa applications Triad Vision prepared and the German embassy approved in Q${q} ${y}. All figures are anonymous: no figure describes fewer than 3 applications.`,
  keyFigures: 'Key figures',
  approved: 'Visas approved',
  previousQuarter: 'Previous quarter',
  change: 'Change',
  fewer: 'fewer than 3',
  noTrend: 'no comparison (fewer than 3)',
  byProfession: 'By profession',
  byVisaType: 'By visa type',
  byState: 'By German federal state (employer location)',
  byLevel: 'By German language level',
  levelNote: 'Current level recorded in the client profile.',
  stateNote: 'From the employer’s or vacancy’s city; unknown city — "not specified".',
  processing: 'Processing time by stage (days)',
  processingNote: 'Computed from the status history; only stages with at least 3 applications are shown. The embassy stage includes waiting for the appointment.',
  stage: 'Stage',
  mean: 'Mean',
  median: 'Median',
  cases: 'Applications',
  days: 'days',
  stages: { documents: 'Documents', contract: 'Contract', embassy: 'Embassy file and appointment', decision: 'Embassy decision', total: 'Total (application to decision)' },
  comparison: 'Comparison with the previous quarter',
  thisQuarter: 'This quarter',
  methodology: 'Methodology and privacy',
  methodologyText: [
    'Source: Triad Vision’s internal case system. Counted are main applications with an embassy approval date in the quarter; family members’ applications are not counted separately.',
    'Quarter boundaries follow Baku time.',
    'k-anonymity (k = 3): groups with fewer than 3 applications are merged into "Other"; if the merged group is still below 3 it is not shown. Individual data is never published.',
    'Triad Vision prepares the documents; the client applies to the embassy, and the embassy decides. These figures are not official statistics.',
  ],
  suppressedNote: 'Some applications are not shown because they are fewer than 3.',
  noData: 'Not enough data for this quarter (fewer than 3 applications).',
  other: 'Other (each fewer than 3)',
  unspecified: 'Not specified',
  professions: {
    truck_driver: 'Truck driver', bus_driver: 'Bus driver', courier: 'Courier', nurse: 'Nurse', cook: 'Cook', waiter: 'Waiter',
    hotel: 'Hotel staff', baker: 'Baker', butcher: 'Butcher', welder: 'Welder', construction_worker: 'Construction worker', electrician: 'Electrician',
    plumber: 'Plumber', mechanic: 'Mechanic', carpenter: 'Carpenter', painter: 'Painter', warehouse: 'Warehouse worker', it: 'IT specialist', agriculture: 'Agriculture', cleaner: 'Cleaner',
  },
  visaTypes: { WORK: 'Work visa', AUSBILDUNG: 'Vocational training (Ausbildung)', WEITERBILDUNG: 'Qualification for recognition', JOB_SEEKER: 'Job seeker / Opportunity Card', STUDY: 'Studies', FAMILY: 'Family reunion', TOURIST: 'Visitor visa' },
  levels: { none: 'None' },
  page: 'Page',
  of: 'of',
  contact: 'Contact',
};

const de: Texts = {
  title: (q, y) => `Arbeitsmobilität Aserbaidschan → Deutschland: Bericht Q${q} ${y}`,
  subtitle: 'Anonyme Statistik der mit Triad Vision vorbereiteten Anträge',
  quarterLabel: (q, y) => `Q${q} ${y}`,
  period: 'Zeitraum',
  dataAsOf: 'Datenstand',
  intro: 'Einleitung',
  defaultIntro: (q, y) =>
    `Dieser Bericht fasst die Visumanträge zusammen, die Triad Vision vorbereitet und die deutsche Botschaft im Q${q} ${y} bewilligt hat. Alle Zahlen sind anonym: Keine Zahl beschreibt weniger als 3 Anträge.`,
  keyFigures: 'Kennzahlen',
  approved: 'Erteilte Visa',
  previousQuarter: 'Vorquartal',
  change: 'Veränderung',
  fewer: 'weniger als 3',
  noTrend: 'kein Vergleich (weniger als 3)',
  byProfession: 'Nach Beruf',
  byVisaType: 'Nach Visumart',
  byState: 'Nach Bundesland (Standort des Arbeitgebers)',
  byLevel: 'Nach Deutschniveau',
  levelNote: 'Aktuelles Niveau laut Kundenprofil.',
  stateNote: 'Nach der Stadt des Arbeitgebers bzw. der Stelle; unbekannte Stadt — „nicht angegeben“.',
  processing: 'Bearbeitungsdauer je Phase (Tage)',
  processingNote: 'Aus dem Statusverlauf berechnet; nur Phasen mit mindestens 3 Anträgen. Die Botschaftsphase enthält die Wartezeit auf den Termin.',
  stage: 'Phase',
  mean: 'Mittelwert',
  median: 'Median',
  cases: 'Anträge',
  days: 'Tage',
  stages: { documents: 'Unterlagen', contract: 'Vertrag', embassy: 'Botschaftsunterlagen und Termin', decision: 'Entscheidung der Botschaft', total: 'Gesamt (Antrag bis Entscheidung)' },
  comparison: 'Vergleich mit dem Vorquartal',
  thisQuarter: 'Dieses Quartal',
  methodology: 'Methodik und Datenschutz',
  methodologyText: [
    'Quelle: internes Fallsystem von Triad Vision. Gezählt werden Hauptanträge mit Bewilligungsdatum der Botschaft im Quartal; Anträge von Familienangehörigen werden nicht gesondert gezählt.',
    'Quartalsgrenzen nach Bakuer Zeit.',
    'k-Anonymität (k = 3): Gruppen mit weniger als 3 Anträgen werden unter „Sonstige“ zusammengefasst; liegt auch diese Gruppe unter 3, wird sie nicht ausgewiesen. Einzeldaten werden nie veröffentlicht.',
    'Triad Vision bereitet die Unterlagen vor; den Antrag stellt der Kunde selbst bei der Botschaft, die Botschaft entscheidet. Keine amtliche Statistik.',
  ],
  suppressedNote: 'Einige Anträge sind nicht ausgewiesen, weil es weniger als 3 sind.',
  noData: 'Für dieses Quartal liegen nicht genug Daten vor (weniger als 3 Anträge).',
  other: 'Sonstige (jeweils weniger als 3)',
  unspecified: 'Nicht angegeben',
  professions: {
    truck_driver: 'Berufskraftfahrer/in (Lkw)', bus_driver: 'Busfahrer/in', courier: 'Kurierfahrer/in', nurse: 'Pflegefachkraft', cook: 'Koch/Köchin', waiter: 'Servicekraft',
    hotel: 'Hotelfachkraft', baker: 'Bäcker/in', butcher: 'Fleischer/in', welder: 'Schweißer/in', construction_worker: 'Bauarbeiter/in', electrician: 'Elektriker/in',
    plumber: 'Anlagenmechaniker/in SHK', mechanic: 'Mechaniker/in', carpenter: 'Tischler/in / Zimmerer', painter: 'Maler/in', warehouse: 'Lagerlogistik', it: 'IT-Fachkraft', agriculture: 'Landwirtschaft', cleaner: 'Reinigungskraft',
  },
  visaTypes: { WORK: 'Erwerbstätigkeit', AUSBILDUNG: 'Berufsausbildung', WEITERBILDUNG: 'Anerkennungsmaßnahme (§ 16d)', JOB_SEEKER: 'Arbeitsplatzsuche / Chancenkarte', STUDY: 'Studium', FAMILY: 'Familiennachzug', TOURIST: 'Besuchsvisum' },
  levels: { none: 'Keine' },
  page: 'Seite',
  of: 'von',
  contact: 'Kontakt',
};

export const QR_TEXTS: Record<ReportLang, Texts> = { az, en, de };

/** Display label of a bucket key of a dimension. */
export const bucketLabel = (lang: ReportLang, dimension: string, key: string): string => {
  const T = QR_TEXTS[lang];
  if (key === 'other') return T.other;
  if (key === 'unspecified') return T.unspecified;
  if (dimension === 'profession') return T.professions[key] ?? key;
  if (dimension === 'visaType') return T.visaTypes[key] ?? key;
  if (dimension === 'state') return STATE_NAMES[key] ?? key;
  if (dimension === 'germanLevel') return T.levels[key] ?? key;
  return key;
};

/** "14.10.2026" style dates (Baku day), no Intl dependency. */
export const fmtDate = (iso: string | Date) => {
  const d = new Date(new Date(iso).getTime() + 4 * 60 * 60 * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getUTCDate())}.${p(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`;
};

/** Number with one decimal in the language's style. */
export const fmtNum = (lang: ReportLang, n: number) => {
  const s = Number.isInteger(n) ? String(n) : n.toFixed(1);
  return lang === 'en' ? s : s.replace('.', ',');
};
