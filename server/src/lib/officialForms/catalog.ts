/**
 * Official form engine — the curated catalogue of data keys a PDF field can be mapped to, the value formats and
 * the "auto-suggest mapping" heuristics (German / English field names of the official forms).
 *
 * A key is "<group>.<name>"; the resolver (resolve.ts) computes every key for one case. Dates are resolved as ISO
 * days (YYYY-MM-DD) and printed DD.MM.YYYY unless the mapping asks for another format; codes (sex M/F/X, marital
 * status, contract type …) are mapped to the option names of radio groups / check boxes in the field map.
 */

export type L10n = { az: string; de: string; en: string; ru: string };
export type DataKind = 'text' | 'date' | 'code' | 'money' | 'number';
export type DataGroup = 'client' | 'passport' | 'address' | 'case' | 'spouse' | 'children' | 'company' | 'contract' | 'employment' | 'meta';

export interface DataKeyDef {
  key: string;
  group: DataGroup;
  kind: DataKind;
  label: L10n;
  /** Codes this key resolves to (radio / check box mapping helpers in the UI). */
  codes?: string[];
  /** Employer-side value: the employer may correct it in the company portal (Erklärung zum Beschäftigungsverhältnis). */
  employer?: boolean;
}

const k = (key: string, group: DataGroup, kind: DataKind, de: string, az: string, en: string, ru: string, extra: Partial<DataKeyDef> = {}): DataKeyDef => ({
  key,
  group,
  kind,
  label: { az, de, en, ru },
  ...extra,
});

export const SEX_CODES = ['M', 'F', 'X'];
export const MARITAL_CODES = ['LEDIG', 'VERHEIRATET', 'LEBENSPARTNERSCHAFT', 'GESCHIEDEN', 'VERWITWET'];
export const EDUCATION_CODES = ['school', 'vocational', 'university'];
export const VISA_TYPE_CODES = ['WORK', 'AUSBILDUNG', 'WEITERBILDUNG', 'JOB_SEEKER', 'STUDY', 'FAMILY', 'TOURIST'];
export const CONTRACT_TYPE_CODES = ['UNLIMITED', 'FIXED', 'AUSBILDUNG'];
export const WORKING_TIME_CODES = ['FULL', 'PART', 'MINI'];
export const YES_NO = ['yes', 'no'];
export const WORKPLACE_CODES = ['EMPLOYER_SEAT', 'CHANGING', 'ADDRESS'];
/** Children rows the catalogue offers (the national visa form has six). */
export const CHILD_ROWS = 6;

const CHILD_KEYS = (): DataKeyDef[] => {
  const out: DataKeyDef[] = [];
  for (let i = 1; i <= CHILD_ROWS; i++) {
    out.push(
      k(`children.${i}.lastName`, 'children', 'text', `Kind ${i}: Familienname`, `Uşaq ${i}: soyad`, `Child ${i}: surname`, `Ребёнок ${i}: фамилия`),
      k(`children.${i}.firstName`, 'children', 'text', `Kind ${i}: Vorname(n)`, `Uşaq ${i}: ad`, `Child ${i}: first name(s)`, `Ребёнок ${i}: имя`),
      k(`children.${i}.sex`, 'children', 'code', `Kind ${i}: Geschlecht (m/w)`, `Uşaq ${i}: cins`, `Child ${i}: sex`, `Ребёнок ${i}: пол`, { codes: SEX_CODES }),
      k(`children.${i}.birthDate`, 'children', 'date', `Kind ${i}: Geburtsdatum`, `Uşaq ${i}: doğum tarixi`, `Child ${i}: date of birth`, `Ребёнок ${i}: дата рождения`),
      k(`children.${i}.birthDatePlace`, 'children', 'text', `Kind ${i}: Geburtsdatum und -ort`, `Uşaq ${i}: doğum tarixi və yeri`, `Child ${i}: date and place of birth`, `Ребёнок ${i}: дата и место рождения`),
      k(`children.${i}.nationality`, 'children', 'text', `Kind ${i}: Staatsangehörigkeit`, `Uşaq ${i}: vətəndaşlıq`, `Child ${i}: nationality`, `Ребёнок ${i}: гражданство`),
      k(`children.${i}.residence`, 'children', 'text', `Kind ${i}: Wohnort`, `Uşaq ${i}: yaşayış yeri`, `Child ${i}: place of residence`, `Ребёнок ${i}: место жительства`),
    );
  }
  return out;
};

export const DATA_KEYS: DataKeyDef[] = [
  // ── Client (person) ──
  k('client.lastName', 'client', 'text', 'Familienname', 'Soyad', 'Surname', 'Фамилия'),
  k('client.firstName', 'client', 'text', 'Vorname(n)', 'Ad(lar)', 'First name(s)', 'Имя (имена)'),
  k('client.fullName', 'client', 'text', 'Vor- und Familienname', 'Ad və soyad', 'Full name', 'Имя и фамилия'),
  k('client.birthName', 'client', 'text', 'Geburtsname / frühere Familiennamen', 'Doğulduğu soyad / əvvəlki soyadlar', 'Surname at birth / former surnames', 'Фамилия при рождении / прежние'),
  k('client.birthDate', 'client', 'date', 'Geburtsdatum', 'Doğum tarixi', 'Date of birth', 'Дата рождения'),
  k('client.birthPlace', 'client', 'text', 'Geburtsort', 'Doğulduğu yer', 'Place of birth', 'Место рождения'),
  k('client.birthCountry', 'client', 'text', 'Geburtsland', 'Doğulduğu ölkə', 'Country of birth', 'Страна рождения'),
  k('client.nationality', 'client', 'text', 'Staatsangehörigkeit', 'Vətəndaşlıq', 'Nationality', 'Гражданство'),
  k('client.nationalityAtBirth', 'client', 'text', 'Frühere Staatsangehörigkeit(en)', 'Əvvəlki vətəndaşlıq', 'Former nationality', 'Прежнее гражданство'),
  k('client.sex', 'client', 'code', 'Geschlecht', 'Cins', 'Sex', 'Пол', { codes: SEX_CODES }),
  k('client.maritalStatus', 'client', 'code', 'Familienstand', 'Ailə vəziyyəti', 'Marital status', 'Семейное положение', { codes: MARITAL_CODES }),
  k('client.profession', 'client', 'text', 'Erlernter / ausgeübter Beruf', 'Peşə', 'Profession', 'Профессия'),
  k('client.education', 'client', 'code', 'Höchster Abschluss (Code)', 'Təhsil (kod)', 'Education (code)', 'Образование (код)', { codes: EDUCATION_CODES }),
  k('client.educationText', 'client', 'text', 'Höchster Bildungsabschluss', 'Ən yüksək təhsil', 'Highest education', 'Высшее образование'),
  k('client.germanLevel', 'client', 'text', 'Deutschkenntnisse', 'Alman dili səviyyəsi', 'German level', 'Уровень немецкого'),
  k('client.phone', 'client', 'text', 'Telefon / Mobil', 'Telefon', 'Phone / mobile', 'Телефон'),
  k('client.email', 'client', 'text', 'E-Mail', 'E-poçt', 'E-mail', 'Эл. почта'),
  // ── Passport ──
  k('passport.type', 'passport', 'text', 'Art des Reisedokuments', 'Səyahət sənədinin növü', 'Type of travel document', 'Тип документа'),
  k('passport.number', 'passport', 'text', 'Passnummer', 'Pasport nömrəsi', 'Passport number', 'Номер паспорта'),
  k('passport.issueDate', 'passport', 'date', 'Ausstellungsdatum', 'Verilmə tarixi', 'Date of issue', 'Дата выдачи'),
  k('passport.expiry', 'passport', 'date', 'Gültig bis', 'Etibarlıdır', 'Valid until', 'Действителен до'),
  k('passport.authority', 'passport', 'text', 'Ausstellende Behörde', 'Verən orqan', 'Issuing authority', 'Кем выдан'),
  k('passport.country', 'passport', 'text', 'Ausstellungsstaat', 'Verən dövlət', 'Issuing country', 'Страна выдачи'),
  // ── Address ──
  k('address.street', 'address', 'text', 'Straße, Hausnummer', 'Küçə, ev', 'Street, number', 'Улица, дом'),
  k('address.postalCode', 'address', 'text', 'Postleitzahl', 'Poçt indeksi', 'Postcode', 'Индекс'),
  k('address.city', 'address', 'text', 'Ort', 'Şəhər', 'City', 'Город'),
  k('address.postalCity', 'address', 'text', 'PLZ, Ort', 'İndeks, şəhər', 'Postcode, place', 'Индекс, город'),
  k('address.country', 'address', 'text', 'Land', 'Ölkə', 'Country', 'Страна'),
  k('address.full', 'address', 'text', 'Vollständige Anschrift', 'Tam ünvan', 'Full address', 'Полный адрес'),
  // ── Case ──
  k('case.number', 'case', 'text', 'Aktenzeichen', 'İş nömrəsi', 'Case number', 'Номер дела'),
  k('case.visaType', 'case', 'code', 'Visumart (Code)', 'Viza növü (kod)', 'Visa type (code)', 'Тип визы (код)', { codes: VISA_TYPE_CODES }),
  k('case.visaCategory', 'case', 'text', 'Visumkategorie', 'Viza kateqoriyası', 'Visa category', 'Категория визы'),
  k('case.purpose', 'case', 'text', 'Zweck des Aufenthalts', 'Səfərin məqsədi', 'Purpose of stay', 'Цель пребывания'),
  k('case.plannedEntryDate', 'case', 'date', 'Geplantes Einreisedatum', 'Planlaşdırılan giriş tarixi', 'Planned entry date', 'Планируемая дата въезда'),
  k('case.stayUntil', 'case', 'date', 'Aufenthalt bis', 'Qalma müddəti (bitmə)', 'Stay until', 'Пребывание до'),
  k('case.stayDuration', 'case', 'text', 'Geplante Aufenthaltsdauer', 'Planlaşdırılan qalma müddəti', 'Intended duration of stay', 'Длительность пребывания'),
  k('case.residenceGermany', 'case', 'text', 'Künftiger Wohnort in Deutschland', 'Almaniyada yaşayış yeri', 'Future residence in Germany', 'Место жительства в Германии'),
  k('case.costCoverage', 'case', 'text', 'Bestreitung des Lebensunterhalts', 'Yaşayış xərcləri', 'Means of subsistence', 'Средства к существованию'),
  k('case.position', 'case', 'text', 'Beabsichtigte Erwerbstätigkeit', 'Planlaşdırılan iş', 'Intended employment', 'Планируемая работа'),
  k('case.familyAccompanying', 'case', 'code', 'Familienangehörige reisen mit', 'Ailə üzvləri birgə gəlir', 'Family members accompany', 'Члены семьи едут вместе', { codes: YES_NO }),
  k('case.familyAccompanyingNames', 'case', 'text', 'Mitreisende Familienangehörige', 'Birgə gələn ailə üzvləri', 'Accompanying family members', 'Сопровождающие члены семьи'),
  // ── Spouse ──
  k('spouse.lastName', 'spouse', 'text', 'Ehegatte: Familienname', 'Həyat yoldaşı: soyad', 'Spouse: surname', 'Супруг(а): фамилия'),
  k('spouse.firstName', 'spouse', 'text', 'Ehegatte: Vorname(n)', 'Həyat yoldaşı: ad', 'Spouse: first name(s)', 'Супруг(а): имя'),
  k('spouse.birthDate', 'spouse', 'date', 'Ehegatte: Geburtsdatum', 'Həyat yoldaşı: doğum tarixi', 'Spouse: date of birth', 'Супруг(а): дата рождения'),
  k('spouse.birthPlace', 'spouse', 'text', 'Ehegatte: Geburtsort', 'Həyat yoldaşı: doğulduğu yer', 'Spouse: place of birth', 'Супруг(а): место рождения'),
  k('spouse.nationality', 'spouse', 'text', 'Ehegatte: Staatsangehörigkeit', 'Həyat yoldaşı: vətəndaşlıq', 'Spouse: nationality', 'Супруг(а): гражданство'),
  k('spouse.residence', 'spouse', 'text', 'Ehegatte: Wohnort', 'Həyat yoldaşı: yaşayış yeri', 'Spouse: place of residence', 'Супруг(а): место жительства'),
  ...CHILD_KEYS(),
  // ── Employer ──
  k('company.name', 'company', 'text', 'Arbeitgeber (Firma)', 'İşəgötürən (şirkət)', 'Employer (company)', 'Работодатель', { employer: true }),
  k('company.street', 'company', 'text', 'Arbeitgeber: Straße', 'İşəgötürən: küçə', 'Employer: street', 'Работодатель: улица', { employer: true }),
  k('company.houseNumber', 'company', 'text', 'Arbeitgeber: Hausnummer', 'İşəgötürən: ev nömrəsi', 'Employer: house number', 'Работодатель: дом', { employer: true }),
  k('company.streetLine', 'company', 'text', 'Arbeitgeber: Straße, Hausnummer', 'İşəgötürən: küçə, ev', 'Employer: street, number', 'Работодатель: улица, дом'),
  k('company.postalCode', 'company', 'text', 'Arbeitgeber: PLZ', 'İşəgötürən: indeks', 'Employer: postcode', 'Работодатель: индекс', { employer: true }),
  k('company.city', 'company', 'text', 'Arbeitgeber: Ort', 'İşəgötürən: şəhər', 'Employer: city', 'Работодатель: город', { employer: true }),
  k('company.postalCity', 'company', 'text', 'Arbeitgeber: PLZ, Ort', 'İşəgötürən: indeks, şəhər', 'Employer: postcode, place', 'Работодатель: индекс, город'),
  k('company.address', 'company', 'text', 'Arbeitgeber: Anschrift', 'İşəgötürən: ünvan', 'Employer: address', 'Работодатель: адрес'),
  k('company.contactName', 'company', 'text', 'Arbeitgeber: Kontaktperson', 'İşəgötürən: əlaqə şəxsi', 'Employer: contact person', 'Работодатель: контактное лицо', { employer: true }),
  k('company.phone', 'company', 'text', 'Arbeitgeber: Telefon', 'İşəgötürən: telefon', 'Employer: phone', 'Работодатель: телефон', { employer: true }),
  k('company.email', 'company', 'text', 'Arbeitgeber: E-Mail', 'İşəgötürən: e-poçt', 'Employer: e-mail', 'Работодатель: эл. почта', { employer: true }),
  k('company.fax', 'company', 'text', 'Arbeitgeber: Telefax', 'İşəgötürən: faks', 'Employer: fax', 'Работодатель: факс', { employer: true }),
  k('company.betriebsnummer', 'company', 'text', 'Betriebsnummer', 'Betriebsnummer (müəssisə nömrəsi)', 'Establishment number (Betriebsnummer)', 'Betriebsnummer (номер предприятия)', { employer: true }),
  k('company.handelsregister', 'company', 'text', 'Handelsregister', 'Ticarət reyestri (Handelsregister)', 'Commercial register', 'Торговый реестр', { employer: true }),
  k('company.foundedRecently', 'company', 'code', 'In den letzten 24 Monaten gegründet', 'Son 24 ayda yaradılıb', 'Founded in the last 24 months', 'Основано за последние 24 месяца', { codes: YES_NO, employer: true }),
  // ── Employment contract ──
  k('contract.jobTitle', 'contract', 'text', 'Berufsbezeichnung', 'Vəzifə', 'Job title', 'Должность', { employer: true }),
  k('contract.contractType', 'contract', 'code', 'Befristung (Code)', 'Müqavilə növü (kod)', 'Contract type (code)', 'Тип договора (код)', { codes: CONTRACT_TYPE_CODES, employer: true }),
  k('contract.grossMonthly', 'contract', 'money', 'Bruttomonatsentgelt (EUR)', 'Aylıq brutto (EUR)', 'Gross monthly salary (EUR)', 'Брутто в месяц (EUR)', { employer: true }),
  k('contract.grossYearly', 'contract', 'money', 'Bruttojahresentgelt (EUR)', 'İllik brutto (EUR)', 'Gross yearly salary (EUR)', 'Брутто в год (EUR)'),
  k('contract.hourlyWage', 'contract', 'money', 'Bruttostundenlohn (EUR)', 'Saatlıq brutto (EUR)', 'Gross hourly wage (EUR)', 'Брутто в час (EUR)'),
  k('contract.weeklyHours', 'contract', 'number', 'Wochenarbeitszeit (Stunden)', 'Həftəlik iş saatı', 'Weekly hours', 'Часов в неделю', { employer: true }),
  k('contract.workingTime', 'contract', 'code', 'Arbeitszeit (Voll-/Teilzeit)', 'İş rejimi (tam/yarım)', 'Working time (full/part)', 'Режим (полный/частичный)', { codes: WORKING_TIME_CODES }),
  k('contract.startDate', 'contract', 'date', 'Beginn der Beschäftigung', 'İşin başlama tarixi', 'Start of employment', 'Начало работы', { employer: true }),
  k('contract.endDate', 'contract', 'date', 'Befristet bis', 'Bitmə tarixi', 'Fixed term until', 'Срок до', { employer: true }),
  k('contract.probationMonths', 'contract', 'number', 'Probezeit (Monate)', 'Sınaq müddəti (ay)', 'Probation (months)', 'Испытательный срок (мес.)', { employer: true }),
  k('contract.vacationDays', 'contract', 'number', 'Urlaubstage pro Jahr', 'İllik məzuniyyət günləri', 'Vacation days per year', 'Дней отпуска в год', { employer: true }),
  // ── Employment details (employer declaration) ──
  k('employment.jobDescription', 'employment', 'text', 'Beschreibung der Tätigkeit', 'İşin təsviri', 'Job description', 'Описание работы', { employer: true }),
  k('employment.jobTitleDescription', 'employment', 'text', 'Berufsbezeichnung und Beschreibung', 'Vəzifə və təsvir', 'Job title and description', 'Должность и описание'),
  k('employment.workplaceMode', 'employment', 'code', 'Arbeitsort', 'İş yeri', 'Place of work', 'Место работы', { codes: WORKPLACE_CODES, employer: true }),
  k('employment.workplaceAddress', 'employment', 'text', 'Adresse des Arbeitsorts', 'İş yerinin ünvanı', 'Workplace address', 'Адрес места работы', { employer: true }),
  k('employment.leasedToThirdParty', 'employment', 'code', 'Überlassung an Dritte', 'Üçüncü tərəfə verilmə', 'Leased to third parties', 'Передача третьим лицам', { codes: YES_NO, employer: true }),
  k('employment.overtime', 'employment', 'code', 'Überstunden verpflichtend', 'Əlavə iş saatları', 'Overtime required', 'Сверхурочные', { codes: YES_NO, employer: true }),
  k('employment.collectiveAgreement', 'employment', 'code', 'Tarifgebunden', 'Kollektiv müqavilə (Tarif)', 'Bound by collective agreement', 'Коллективный договор', { codes: YES_NO, employer: true }),
  k('employment.socialInsurance', 'employment', 'code', 'Sozialversicherungspflicht in Deutschland', 'Almaniyada sosial sığorta', 'Social insurance in Germany', 'Соцстрахование в Германии', { codes: YES_NO, employer: true }),
  // ── Meta ──
  k('meta.today', 'meta', 'date', 'Heutiges Datum', 'Bugünkü tarix', 'Today', 'Сегодня'),
  k('meta.placeAndDate', 'meta', 'text', 'Ort und Datum (Antragsteller)', 'Yer və tarix (müraciətçi)', 'Place and date (applicant)', 'Место и дата (заявитель)'),
  k('meta.employerPlaceDate', 'meta', 'text', 'Ort und Datum (Arbeitgeber)', 'Yer və tarix (işəgötürən)', 'Place and date (employer)', 'Место и дата (работодатель)'),
];

export const DATA_KEY_MAP = new Map(DATA_KEYS.map((d) => [d.key, d]));
export const isDataKey = (key: string) => DATA_KEY_MAP.has(key);

export const GROUP_LABELS: Record<DataGroup, L10n> = {
  client: { az: 'Müştəri', de: 'Antragsteller/in', en: 'Applicant', ru: 'Заявитель' },
  passport: { az: 'Pasport', de: 'Reisepass', en: 'Passport', ru: 'Паспорт' },
  address: { az: 'Ünvan', de: 'Anschrift', en: 'Address', ru: 'Адрес' },
  case: { az: 'İş (case)', de: 'Akte / Aufenthalt', en: 'Case / stay', ru: 'Дело / пребывание' },
  spouse: { az: 'Həyat yoldaşı', de: 'Ehegatte', en: 'Spouse', ru: 'Супруг(а)' },
  children: { az: 'Uşaqlar', de: 'Kinder', en: 'Children', ru: 'Дети' },
  company: { az: 'İşəgötürən', de: 'Arbeitgeber', en: 'Employer', ru: 'Работодатель' },
  contract: { az: 'Əmək müqaviləsi', de: 'Arbeitsvertrag', en: 'Employment contract', ru: 'Трудовой договор' },
  employment: { az: 'Məşğulluq detalları', de: 'Beschäftigung', en: 'Employment details', ru: 'Детали занятости' },
  meta: { az: 'Tarix və yer', de: 'Datum / Ort', en: 'Date / place', ru: 'Дата / место' },
};

// ─── Formats ─────────────────────────────────────────────────────────────

export const FORMATS = ['date', 'dateIso', 'monthYear', 'upper', 'lower', 'money', 'none'] as const;
export type ValueFormat = (typeof FORMATS)[number];

/** One entry of a template's field map. */
export interface FieldMapping {
  /** A data key of the catalogue, or "const" for a fixed value. */
  source: string;
  /** Fixed value (source "const"). */
  value?: string;
  format?: ValueFormat;
  /** Check box: checked when the resolved value equals one of these ("|"-separated; "*" = any non-empty value). */
  when?: string;
  /** Translation of resolved values / codes into the PDF's option names or texts ("M" → "maennlich"). */
  map?: Record<string, string>;
  /** Not reported as missing when empty. */
  optional?: boolean;
}
export type FieldMap = Record<string, FieldMapping>;

// ─── Auto-suggest ────────────────────────────────────────────────────────

export type PdfFieldType = 'text' | 'checkbox' | 'radio' | 'dropdown' | 'optionlist' | 'signature' | 'button' | 'unknown';

export interface PdfFieldInfo {
  name: string;
  type: PdfFieldType;
  options: string[];
  page: number | null;
  maxLength: number | null;
  readOnly: boolean;
}

/** Lower-case, umlauts folded, separators to spaces: "Staatsangehörigkeit_2" → "staatsangehoerigkeit 2". */
export const normName = (s: string) =>
  s
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[_\-./()[\]:,]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

interface Rule {
  re: RegExp;
  not?: RegExp;
  types?: PdfFieldType[];
  mapping: FieldMapping;
}

const t = (source: string, extra: Partial<FieldMapping> = {}): FieldMapping => ({ source, ...extra });

/**
 * Heuristics on the normalised field name. Order matters: specific labels (employer, spouse, children) first,
 * generic person labels last. Field names ending in a number ("…_2") belong to a second person (spouse block of
 * the national visa form) and are handled by the spouse rules.
 */
const RULES: Rule[] = [
  // Employer block
  { re: /(betriebsnummer|establishment number)/, mapping: t('company.betriebsnummer') },
  { re: /handelsregister/, mapping: t('company.handelsregister', { optional: true }) },
  { re: /(^|\s)firma(\s|$)|arbeitgeber name|name des arbeitgebers|employer name/, types: ['text'], mapping: t('company.name') },
  { re: /kontaktperson|ansprechpartner|contact person/, mapping: t('company.contactName') },
  { re: /telefax|fax/, mapping: t('company.fax', { optional: true }) },
  { re: /referenzen|references/, types: ['text'], mapping: t('company.name') },
  { re: /berufsbezeichnung|beabsichtigte erwerbstaetigkeit|intended employment|job title/, types: ['text'], mapping: t('contract.jobTitle') },
  { re: /beschaeftigungsverhaeltnis(s)?$|beginn|beschaeftigung beginnt/, not: /befrist|rbtn/, types: ['text'], mapping: t('contract.startDate') },
  { re: /arbeitsstunden|wochenarbeitszeit|stunden pro woche|weekly hours/, types: ['text'], mapping: t('contract.weeklyHours') },
  { re: /urlaub/, types: ['text'], mapping: t('contract.vacationDays') },
  { re: /entgelt pro monat|monatsgehalt|bruttomonat|monthly salary/, types: ['text'], mapping: t('contract.grossMonthly', { format: 'money' }) },
  { re: /entgelt pro stunde|stundenlohn|hourly/, types: ['text'], mapping: t('contract.hourlyWage', { format: 'money', optional: true }) },
  { re: /arbeitsort adresse|arbeitsort/, types: ['text'], mapping: t('employment.workplaceAddress', { optional: true }) },
  // Spouse block (second person)
  { re: /(name familienname|familienname|surname).*2$/, not: /frueher|former/, types: ['text'], mapping: t('spouse.lastName') },
  { re: /(vornamen?|first names?).*2$/, types: ['text'], mapping: t('spouse.firstName') },
  { re: /(geburtsdatum|date of birth).*2$/, types: ['text'], mapping: t('spouse.birthDate') },
  { re: /(staatsangehoerigkeit|nationality).*2$/, not: /frueher|former/, types: ['text'], mapping: t('spouse.nationality') },
  { re: /geburtsland.*2$/, types: ['text'], mapping: t('client.birthCountry', { optional: true }) },
  // Children table rows ("…Row1")
  { re: /(name familienname|surname)\s?row\s?(\d)$/, types: ['text'], mapping: t('children.$2.lastName', { optional: true }) },
  { re: /(vornamen|first names)\s?row\s?(\d)$/, types: ['text'], mapping: t('children.$2.firstName', { optional: true }) },
  { re: /(mw mf|m w)\s?row\s?(\d)$/, types: ['text'], mapping: t('children.$2.sex', { optional: true, map: { M: 'm', F: 'w', X: 'd' } }) },
  { re: /geburtsdatum und ort.*row\s?(\d)$/, types: ['text'], mapping: t('children.$1.birthDatePlace', { optional: true }) },
  { re: /(staats ?angehoerigkeit|nationality)\s?row\s?(\d)$/, types: ['text'], mapping: t('children.$2.nationality', { optional: true }) },
  { re: /(wohnort|place of residence)\s?row\s?(\d)$/, types: ['text'], mapping: t('children.$2.residence', { optional: true }) },
  // Person
  { re: /(frueher\w* familienname|geburtsname|former surname|birth name)/, types: ['text'], mapping: t('client.birthName', { optional: true }) },
  { re: /(frueher\w* staatsangehoerigkeit|former nationalit)/, types: ['text'], mapping: t('client.nationalityAtBirth', { optional: true }) },
  { re: /(nachname|familienname|surname|last name)/, types: ['text'], mapping: t('client.lastName', { format: 'upper' }) },
  { re: /(vorname|first name|given name)/, types: ['text'], mapping: t('client.firstName', { format: 'upper' }) },
  { re: /(geburtsdatum|date of birth|birth date)/, types: ['text'], mapping: t('client.birthDate') },
  { re: /(geburtsort|place of birth)/, types: ['text'], mapping: t('client.birthPlace') },
  { re: /(geburtsland|country of birth)/, types: ['text'], mapping: t('client.birthCountry') },
  { re: /(staatsangehoerigkeit|nationality)/, types: ['text'], mapping: t('client.nationality') },
  { re: /(maennlich|^male)/, types: ['checkbox'], mapping: t('client.sex', { when: 'M' }) },
  { re: /(weiblich|female)/, types: ['checkbox'], mapping: t('client.sex', { when: 'F' }) },
  { re: /geschlecht|(^|\s)sex(\s|$)/, types: ['radio', 'dropdown'], mapping: t('client.sex', { map: { M: 'maennlich', F: 'weiblich', X: 'divers' } }) },
  { re: /^ledig|single/, types: ['checkbox'], mapping: t('client.maritalStatus', { when: 'LEDIG' }) },
  { re: /^verheiratet|married/, types: ['checkbox'], mapping: t('client.maritalStatus', { when: 'VERHEIRATET' }) },
  { re: /lebenspartnerschaft|civil union/, types: ['checkbox'], mapping: t('client.maritalStatus', { when: 'LEBENSPARTNERSCHAFT' }) },
  { re: /^geschieden|divorced/, types: ['checkbox'], mapping: t('client.maritalStatus', { when: 'GESCHIEDEN' }) },
  { re: /^verwitwet|widowed/, types: ['checkbox'], mapping: t('client.maritalStatus', { when: 'VERWITWET' }) },
  // Passport
  { re: /^reisepass passport$|^reisepass$/, types: ['checkbox'], mapping: { source: 'const', value: 'X', when: '*' } },
  { re: /(reisepassnummer|passnummer|nummer des reisedokuments|passport (no|number)|number of travel document)/, types: ['text'], mapping: t('passport.number') },
  { re: /(ausstellungsdatum|date of issue|ausgestellt am)/, types: ['text'], mapping: t('passport.issueDate') },
  { re: /(ausgestellt durch|ausstellende behoerde|issued by|issuing authority)/, types: ['text'], mapping: t('passport.authority') },
  { re: /^(gueltig bis valid until|gueltig bis|valid until)$/, types: ['text'], mapping: t('passport.expiry') },
  // Address / contact
  { re: /(strasse hausnummer street number|^strasse hausnummer$|^street)/, not: /sofern bekannt|if known|2$|3$/, types: ['text'], mapping: t('address.street') },
  { re: /^(postleitzahl ort postcode place|postleitzahl ort|postcode place)$/, types: ['text'], mapping: t('address.postalCity') },
  { re: /^txtf \d+ strasse$|^strasse$/, types: ['text'], mapping: t('company.street') },
  { re: /hausnummer$/, types: ['text'], mapping: t('company.houseNumber') },
  { re: /postleitzahl$/, types: ['text'], mapping: t('company.postalCode') },
  { re: /(^|\s)ort$/, not: /wohnort|geburtsort|arbeitsort|aufenthaltsort/, types: ['text'], mapping: t('company.city') },
  { re: /wohnsitz|wohnort|place of residence/, not: /seit|row/, types: ['text'], mapping: t('address.full') },
  { re: /(e ?mail)/, not: /2$/, types: ['text'], mapping: t('client.email') },
  { re: /(mobilfunk|mobile)/, not: /2$|telefonmobil/, types: ['text'], mapping: t('client.phone') },
  { re: /(telefon|phone)/, not: /2$|mobil/, types: ['text'], mapping: t('client.phone', { optional: true }) },
  // Stay
  { re: /(erlernter|ausgeuebter beruf|profession)/, types: ['text'], mapping: t('client.profession') },
  { re: /(lebensunterhalt|means of subsistence)/, types: ['text'], mapping: t('case.costCoverage') },
  { re: /(ort und datum|place and date)/, types: ['text'], mapping: t('meta.placeAndDate') },
  { re: /(^|\s)datum$/, types: ['text'], mapping: t('meta.today') },
];

/** Suggested mapping for one PDF field (null = no idea). */
export const suggestFor = (field: Pick<PdfFieldInfo, 'name' | 'type' | 'options'>): FieldMapping | null => {
  if (field.type === 'signature' || field.type === 'button' || field.type === 'unknown') return null;
  const n = normName(field.name);
  for (const r of RULES) {
    if (r.types && !r.types.includes(field.type)) continue;
    const m = n.match(r.re);
    if (!m) continue;
    if (r.not && r.not.test(n)) continue;
    const source = r.mapping.source.replace(/\$(\d)/g, (_, i: string) => m[Number(i)] ?? '');
    if (source !== 'const' && !isDataKey(source)) continue;
    const out: FieldMapping = { ...r.mapping, source };
    // A radio group whose options do not contain the mapped names: drop the translation (staff map it).
    if (out.map && (field.type === 'radio' || field.type === 'dropdown')) {
      const opts = new Set(field.options.map(normName));
      if (!Object.values(out.map).some((v) => opts.has(normName(v)))) delete out.map;
    }
    return out;
  }
  return null;
};

/** Suggestions for every field without an existing mapping. */
export const suggestMapping = (fields: PdfFieldInfo[], existing: FieldMap = {}): FieldMap => {
  const out: FieldMap = {};
  for (const f of fields) {
    if (existing[f.name]) continue;
    const s = suggestFor(f);
    if (s) out[f.name] = s;
  }
  return out;
};
