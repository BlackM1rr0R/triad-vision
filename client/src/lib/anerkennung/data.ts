/**
 * Curated recognition (Anerkennung) guide for the professions our clients most often have.
 * Structural facts live here; shared UI wording (procedures, authorities, documents, durations, fees)
 * is in i18n/pagesTools.ts under `anerkPage.*`. Profession names and notes are localized inline.
 *
 * Everything is deliberately general: fees and durations vary by federal state and case, and the binding
 * answer always comes from the competent authority (see the Anerkennungs-Finder).
 */

type L = { az: string; de: string; en: string; ru: string };

/** What the person actually has to do. */
export type Procedure =
  /** Regulated profession: recognition / licence is mandatory to work. */
  | 'licence'
  /** Regulated, but through the medical "Approbation" (incl. Kenntnisprüfung / Fachsprachprüfung). */
  | 'approbation'
  /** Not regulated, vocational: equivalence assessment (needed for the skilled-worker visa). */
  | 'equivalence'
  /** Not regulated, university degree: ZAB statement of comparability (Zeugnisbewertung). */
  | 'zab'
  /** No recognition: driving licence conversion + professional qualification (Code 95). */
  | 'driving';

export type Authority = 'health' | 'approbation' | 'education' | 'youth' | 'chamberEng' | 'hwk' | 'ihk' | 'zab' | 'driving';

export type DocKey =
  | 'diploma'
  | 'transcript'
  | 'translations'
  | 'cv'
  | 'experience'
  | 'id'
  | 'language'
  | 'medical'
  | 'police'
  | 'intent'
  | 'licenceCopy'
  | 'code95'
  | 'licenceProof';

export type DurationKey = 'licence' | 'approbation' | 'chamber' | 'zab' | 'education' | 'driving';
export type FeeKey = 'health' | 'approbation' | 'chamber' | 'zab' | 'education' | 'driving';

export type ProfessionIcon =
  | 'heart'
  | 'stethoscope'
  | 'tooth'
  | 'pill'
  | 'activity'
  | 'school'
  | 'cog'
  | 'laptop'
  | 'zap'
  | 'wrench'
  | 'car'
  | 'flame'
  | 'truck'
  | 'bus'
  | 'chef'
  | 'hotel'
  | 'brick'
  | 'package'
  | 'hand'
  | 'calc'
  | 'baby';

export interface Profession {
  id: string;
  icon: ProfessionIcon;
  /** Official German designation (shown under the localized name, searchable). */
  german: string;
  name: L;
  /** One or two sentences specific to this profession. */
  note: L;
  regulated: boolean;
  procedure: Procedure;
  authority: Authority[];
  docs: DocKey[];
  /** German level usually required by the authority / employer (null = no formal requirement). */
  language: 'A2' | 'B1' | 'B2' | 'C1' | null;
  duration: DurationKey;
  fee: FeeKey;
}

const BASE_DOCS: DocKey[] = ['id', 'cv', 'diploma', 'transcript', 'experience', 'translations'];
const HEALTH_DOCS: DocKey[] = [...BASE_DOCS, 'language', 'medical', 'police', 'intent'];

export const PROFESSIONS: Profession[] = [
  {
    id: 'nurse',
    icon: 'heart',
    german: 'Pflegefachfrau / Pflegefachmann',
    name: { az: 'Tibb bacısı / qardaşı', de: 'Pflegefachkraft', en: 'Nurse', ru: 'Медсестра / медбрат' },
    note: {
      az: 'Almaniyada tənzimlənən peşədir: icazə (Berufserlaubnis) olmadan tibb bacısı kimi işləmək olmaz. Qərar verilənə qədər köməkçi kimi işləmək mümkündür.',
      de: 'Reglementierter Beruf: Ohne Berufserlaubnis keine Tätigkeit als Pflegefachkraft. Bis zur Entscheidung ist oft eine Tätigkeit als Pflegehilfskraft möglich.',
      en: 'Regulated profession: you cannot work as a registered nurse without the licence (Berufserlaubnis). Until the decision you can often work as a care assistant.',
      ru: 'Регулируемая профессия: без разрешения (Berufserlaubnis) работать медсестрой нельзя. До решения часто можно работать помощником по уходу.',
    },
    regulated: true,
    procedure: 'licence',
    authority: ['health'],
    docs: HEALTH_DOCS,
    language: 'B2',
    duration: 'licence',
    fee: 'health',
  },
  {
    id: 'doctor',
    icon: 'stethoscope',
    german: 'Ärztin / Arzt',
    name: { az: 'Həkim', de: 'Ärztin / Arzt', en: 'Doctor (physician)', ru: 'Врач' },
    note: {
      az: 'Approbation (həkimlik lisenziyası) tələb olunur. Adətən B2 ümumi alman dili və C1 səviyyəli tibbi dil imtahanı (Fachsprachprüfung) lazımdır; fərq olarsa — Kenntnisprüfung.',
      de: 'Erforderlich ist die Approbation. Üblich: Deutsch B2 allgemein plus Fachsprachprüfung auf C1-Niveau; bei Unterschieden folgt die Kenntnisprüfung.',
      en: 'You need the Approbation (full medical licence). Usually general German B2 plus a medical language exam (Fachsprachprüfung, C1 level); if differences are found, a knowledge exam (Kenntnisprüfung).',
      ru: 'Нужна Approbation (врачебная лицензия). Обычно немецкий B2 и профессиональный языковой экзамен (Fachsprachprüfung, уровень C1); при различиях — экзамен Kenntnisprüfung.',
    },
    regulated: true,
    procedure: 'approbation',
    authority: ['approbation'],
    docs: HEALTH_DOCS,
    language: 'C1',
    duration: 'approbation',
    fee: 'approbation',
  },
  {
    id: 'dentist',
    icon: 'tooth',
    german: 'Zahnärztin / Zahnarzt',
    name: { az: 'Stomatoloq', de: 'Zahnärztin / Zahnarzt', en: 'Dentist', ru: 'Стоматолог' },
    note: {
      az: 'Həkimlər kimi Approbation lazımdır: tibbi dil imtahanı və fərq olduqda Kenntnisprüfung.',
      de: 'Wie bei Ärzten ist die Approbation nötig, mit Fachsprachprüfung und ggf. Kenntnisprüfung.',
      en: 'Like doctors, dentists need the Approbation, with a medical language exam and possibly a knowledge exam.',
      ru: 'Как и врачам, нужна Approbation: профессиональный языковой экзамен и при необходимости Kenntnisprüfung.',
    },
    regulated: true,
    procedure: 'approbation',
    authority: ['approbation'],
    docs: HEALTH_DOCS,
    language: 'C1',
    duration: 'approbation',
    fee: 'approbation',
  },
  {
    id: 'pharmacist',
    icon: 'pill',
    german: 'Apothekerin / Apotheker',
    name: { az: 'Əczaçı', de: 'Apothekerin / Apotheker', en: 'Pharmacist', ru: 'Фармацевт' },
    note: {
      az: 'Approbation tələb olunur. Bəzi ştatlarda prosesə qədər müvəqqəti icazə ilə işləmək olar.',
      de: 'Approbation erforderlich. Teilweise ist bis dahin eine befristete Berufserlaubnis möglich.',
      en: 'The Approbation is required. In some cases a temporary permit is possible until then.',
      ru: 'Требуется Approbation. В некоторых случаях до этого возможно временное разрешение.',
    },
    regulated: true,
    procedure: 'approbation',
    authority: ['approbation'],
    docs: HEALTH_DOCS,
    language: 'C1',
    duration: 'approbation',
    fee: 'approbation',
  },
  {
    id: 'physio',
    icon: 'activity',
    german: 'Physiotherapeutin / Physiotherapeut',
    name: { az: 'Fizioterapevt', de: 'Physiotherapeut/in', en: 'Physiotherapist', ru: 'Физиотерапевт' },
    note: {
      az: 'Peşə adını daşımaq üçün icazə (Erlaubnis) lazımdır. Təhsildə praktik saatlar az olarsa, uyğunlaşdırma kursu tələb oluna bilər.',
      de: 'Für die Berufsbezeichnung ist eine Erlaubnis nötig. Fehlen Praxisstunden, kann ein Anpassungslehrgang verlangt werden.',
      en: 'You need a permit to use the professional title. If practical hours are missing, an adaptation course may be required.',
      ru: 'Для использования названия профессии нужно разрешение. При нехватке практических часов могут потребовать адаптационный курс.',
    },
    regulated: true,
    procedure: 'licence',
    authority: ['health'],
    docs: HEALTH_DOCS,
    language: 'B2',
    duration: 'licence',
    fee: 'health',
  },
  {
    id: 'teacher',
    icon: 'school',
    german: 'Lehrerin / Lehrer',
    name: { az: 'Müəllim', de: 'Lehrkraft', en: 'Teacher', ru: 'Учитель' },
    note: {
      az: 'Dövlət məktəbində müəllimlik tənzimlənir və ştatın təhsil nazirliyi tərəfindən tanınır. Çox vaxt iki fənn və C1–C2 alman dili tələb olunur.',
      de: 'Der Lehrerberuf an staatlichen Schulen ist reglementiert; zuständig ist das Kultusministerium des Landes. Oft werden zwei Fächer und Deutsch C1–C2 verlangt.',
      en: 'Teaching at state schools is regulated; the state education ministry decides. Often two subjects and German C1–C2 are required.',
      ru: 'Работа учителем в государственной школе регулируется; решение принимает министерство образования земли. Часто требуются два предмета и немецкий C1–C2.',
    },
    regulated: true,
    procedure: 'licence',
    authority: ['education'],
    docs: [...BASE_DOCS, 'language', 'police'],
    language: 'C1',
    duration: 'education',
    fee: 'education',
  },
  {
    id: 'engineer',
    icon: 'cog',
    german: 'Ingenieurin / Ingenieur',
    name: { az: 'Mühəndis', de: 'Ingenieur/in', en: 'Engineer', ru: 'Инженер' },
    note: {
      az: 'İşləmək üçün tanınma şərt deyil, amma "Ingenieur" adı qorunur (ştat mühəndis palatası). Viza üçün diplom anabin-də yoxdursa, ZAB qiymətləndirməsi lazımdır.',
      de: 'Die Tätigkeit ist frei, die Berufsbezeichnung „Ingenieur" ist aber geschützt (Ingenieurkammer des Landes). Für das Visum ist eine ZAB-Zeugnisbewertung nötig, wenn der Abschluss nicht in anabin steht.',
      en: 'The work itself is not regulated, but the title "Ingenieur" is protected (state chamber of engineers). For the visa you need a ZAB statement if your degree is not listed in anabin.',
      ru: 'Сама работа не регулируется, но звание «Ingenieur» защищено (инженерная палата земли). Для визы нужна оценка ZAB, если диплома нет в anabin.',
    },
    regulated: false,
    procedure: 'zab',
    authority: ['zab', 'chamberEng'],
    docs: ['id', 'cv', 'diploma', 'transcript', 'translations'],
    language: null,
    duration: 'zab',
    fee: 'zab',
  },
  {
    id: 'it',
    icon: 'laptop',
    german: 'IT-Fachkraft',
    name: { az: 'İT mütəxəssisi', de: 'IT-Fachkraft', en: 'IT specialist', ru: 'IT-специалист' },
    note: {
      az: 'Tənzimlənmir. Ali təhsil diplomu anabin-də yoxdursa, ZAB qiymətləndirməsi faydalıdır. Təcrübəli İT mütəxəssisləri bəzi hallarda diplomsuz da viza ala bilər.',
      de: 'Nicht reglementiert. Steht der Hochschulabschluss nicht in anabin, hilft eine ZAB-Zeugnisbewertung. Erfahrene IT-Fachkräfte können unter Bedingungen auch ohne Abschluss ein Visum erhalten.',
      en: 'Not regulated. If your degree is not in anabin, a ZAB statement helps. Experienced IT specialists can, under certain conditions, get a visa even without a degree.',
      ru: 'Не регулируется. Если диплома нет в anabin, поможет оценка ZAB. Опытные IT-специалисты при определённых условиях могут получить визу и без диплома.',
    },
    regulated: false,
    procedure: 'zab',
    authority: ['zab'],
    docs: ['id', 'cv', 'diploma', 'transcript', 'experience', 'translations'],
    language: null,
    duration: 'zab',
    fee: 'zab',
  },
  {
    id: 'electrician',
    icon: 'zap',
    german: 'Elektronikerin / Elektroniker',
    name: { az: 'Elektrik', de: 'Elektroniker/in', en: 'Electrician', ru: 'Электрик' },
    note: {
      az: 'İşçi kimi tənzimlənmir, amma ixtisaslı işçi vizası üçün bərabərlik qərarı lazımdır: sənətkarlıq üzrə HWK, sənaye elektriki üzrə IHK FOSA.',
      de: 'Als Angestellte/r nicht reglementiert, für das Fachkräfte-Visum ist aber die Gleichwertigkeit nötig: HWK (Handwerk) bzw. IHK FOSA (Industrie).',
      en: 'Not regulated for employees, but the skilled-worker visa needs an equivalence decision: HWK (crafts) or IHK FOSA (industrial).',
      ru: 'Для наёмного работника не регулируется, но для визы квалифицированного работника нужно решение о равноценности: HWK (ремесло) или IHK FOSA (промышленность).',
    },
    regulated: false,
    procedure: 'equivalence',
    authority: ['hwk', 'ihk'],
    docs: [...BASE_DOCS, 'intent'],
    language: null,
    duration: 'chamber',
    fee: 'chamber',
  },
  {
    id: 'plumber',
    icon: 'wrench',
    german: 'Anlagenmechaniker/in SHK',
    name: { az: 'Santexnik / istilik sistemləri ustası', de: 'Anlagenmechaniker/in SHK', en: 'Plumber / heating technician', ru: 'Сантехник / монтажник отопления' },
    note: {
      az: 'Sənətkarlıq peşəsidir — bərabərliyi Sənətkarlar Palatası (HWK) yoxlayır. Qismən bərabərlik olarsa, Almaniyada əlavə təlimlə tamamlamaq olar.',
      de: 'Handwerksberuf — die Gleichwertigkeit prüft die Handwerkskammer (HWK). Bei teilweiser Gleichwertigkeit kann man in Deutschland nachqualifizieren.',
      en: 'A craft trade — the Chamber of Crafts (HWK) checks equivalence. With partial equivalence you can top up with training in Germany.',
      ru: 'Ремесленная профессия — равноценность проверяет ремесленная палата (HWK). При частичной равноценности можно доучиться в Германии.',
    },
    regulated: false,
    procedure: 'equivalence',
    authority: ['hwk'],
    docs: [...BASE_DOCS, 'intent'],
    language: null,
    duration: 'chamber',
    fee: 'chamber',
  },
  {
    id: 'mechatronics',
    icon: 'car',
    german: 'Kfz-Mechatroniker/in',
    name: { az: 'Avtomexanik / mexatronik', de: 'Kfz-Mechatroniker/in', en: 'Car mechanic / mechatronics technician', ru: 'Автомеханик / мехатроник' },
    note: {
      az: 'Avtomobil mexatroniki HWK-da, sənaye mexatroniki IHK FOSA-da yoxlanılır. İş təcrübəsini təsdiq edən arayışlar çox vacibdir.',
      de: 'Kfz-Mechatronik prüft die HWK, Industrie-Mechatronik die IHK FOSA. Nachweise über Berufserfahrung sind besonders wichtig.',
      en: 'Car mechatronics is checked by the HWK, industrial mechatronics by IHK FOSA. Proof of work experience matters a lot.',
      ru: 'Автомехатронику проверяет HWK, промышленную мехатронику — IHK FOSA. Особенно важны подтверждения опыта работы.',
    },
    regulated: false,
    procedure: 'equivalence',
    authority: ['hwk', 'ihk'],
    docs: [...BASE_DOCS, 'intent'],
    language: null,
    duration: 'chamber',
    fee: 'chamber',
  },
  {
    id: 'welder',
    icon: 'flame',
    german: 'Metallbauer/in · Schweißer/in',
    name: { az: 'Qaynaqçı / metal ustası', de: 'Schweißer/in · Metallbauer/in', en: 'Welder / metal worker', ru: 'Сварщик / металлист' },
    note: {
      az: 'Metal ustası (Metallbauer) üçün HWK, konstruksiya mexaniki üçün IHK FOSA. Beynəlxalq qaynaq sertifikatları (məs. EN ISO 9606) işəgötürən üçün böyük üstünlükdür.',
      de: 'Metallbauer: HWK, Konstruktionsmechaniker: IHK FOSA. Internationale Schweißzertifikate (z. B. EN ISO 9606) sind für Arbeitgeber ein großes Plus.',
      en: 'Metallbauer: HWK, construction mechanic: IHK FOSA. International welding certificates (e.g. EN ISO 9606) are a big plus for employers.',
      ru: 'Metallbauer — HWK, конструкционный механик — IHK FOSA. Международные сертификаты сварщика (например, EN ISO 9606) — большой плюс для работодателя.',
    },
    regulated: false,
    procedure: 'equivalence',
    authority: ['hwk', 'ihk'],
    docs: [...BASE_DOCS, 'intent'],
    language: null,
    duration: 'chamber',
    fee: 'chamber',
  },
  {
    id: 'truck',
    icon: 'truck',
    german: 'Berufskraftfahrer/in (Lkw)',
    name: { az: 'Yük maşını sürücüsü', de: 'Berufskraftfahrer/in (Lkw)', en: 'Truck driver', ru: 'Водитель грузовика' },
    note: {
      az: 'Diplom tanınması lazım deyil. C/CE kateqoriyalı Avropa sürücülük vəsiqəsi və peşə ixtisası (Code 95) tələb olunur. Qeyri-AB vəsiqəsi dəyişdirilməlidir (adətən imtahanlarla).',
      de: 'Keine Anerkennung nötig. Erforderlich sind ein EU-Führerschein C/CE und die Grundqualifikation (Code 95). Nicht-EU-Führerscheine müssen umgeschrieben werden (meist mit Prüfungen).',
      en: 'No recognition needed. You need an EU driving licence C/CE and the initial qualification (Code 95). Non-EU licences must be converted (usually with tests).',
      ru: 'Признание диплома не нужно. Нужны европейские права категории C/CE и квалификация водителя (Code 95). Права не из ЕС нужно обменять (обычно с экзаменами).',
    },
    regulated: false,
    procedure: 'driving',
    authority: ['driving', 'ihk'],
    docs: ['id', 'cv', 'licenceCopy', 'licenceProof', 'experience', 'translations', 'medical', 'code95'],
    language: 'A2',
    duration: 'driving',
    fee: 'driving',
  },
  {
    id: 'bus',
    icon: 'bus',
    german: 'Berufskraftfahrer/in (Bus)',
    name: { az: 'Avtobus sürücüsü', de: 'Busfahrer/in', en: 'Bus driver', ru: 'Водитель автобуса' },
    note: {
      az: 'D/DE kateqoriyası və Code 95 lazımdır. Sərnişinlərlə ünsiyyət üçün işəgötürənlər adətən B1 alman dili istəyir.',
      de: 'Erforderlich sind Klasse D/DE und Code 95. Wegen des Fahrgastkontakts verlangen Arbeitgeber meist Deutsch B1.',
      en: 'You need class D/DE and Code 95. Because of passenger contact, employers usually ask for German B1.',
      ru: 'Нужны категория D/DE и Code 95. Из-за общения с пассажирами работодатели обычно требуют немецкий B1.',
    },
    regulated: false,
    procedure: 'driving',
    authority: ['driving', 'ihk'],
    docs: ['id', 'cv', 'licenceCopy', 'licenceProof', 'experience', 'translations', 'medical', 'code95'],
    language: 'B1',
    duration: 'driving',
    fee: 'driving',
  },
  {
    id: 'cook',
    icon: 'chef',
    german: 'Köchin / Koch',
    name: { az: 'Aşpaz', de: 'Koch / Köchin', en: 'Cook / chef', ru: 'Повар' },
    note: {
      az: 'Tənzimlənmir. Viza üçün peşə diplomunun bərabərliyini IHK FOSA yoxlayır. Restoran təcrübəsini təsdiq edən arayışlar vacibdir.',
      de: 'Nicht reglementiert. Für das Visum prüft die IHK FOSA die Gleichwertigkeit des Berufsabschlusses. Nachweise über Küchenerfahrung sind wichtig.',
      en: 'Not regulated. For the visa, IHK FOSA checks the equivalence of your vocational diploma. Proof of kitchen experience is important.',
      ru: 'Не регулируется. Для визы IHK FOSA проверяет равноценность диплома. Важны подтверждения опыта работы на кухне.',
    },
    regulated: false,
    procedure: 'equivalence',
    authority: ['ihk'],
    docs: [...BASE_DOCS, 'intent'],
    language: null,
    duration: 'chamber',
    fee: 'chamber',
  },
  {
    id: 'hotel',
    icon: 'hotel',
    german: 'Hotelfachmann/-frau · Restaurantfachmann/-frau',
    name: { az: 'Otel və restoran işçisi', de: 'Hotel- und Restaurantfachkraft', en: 'Hotel / restaurant staff', ru: 'Работник отеля / ресторана' },
    note: {
      az: 'Tənzimlənmir; peşə diplomu varsa, IHK FOSA bərabərliyi yoxlayır. Formal diplom yoxdursa, Ausbildung yolu ilə gəlmək çox vaxt daha asandır.',
      de: 'Nicht reglementiert; mit Berufsabschluss prüft die IHK FOSA die Gleichwertigkeit. Ohne formalen Abschluss ist der Weg über eine Ausbildung oft einfacher.',
      en: 'Not regulated; with a vocational diploma, IHK FOSA checks equivalence. Without a formal diploma, coming via an Ausbildung is often easier.',
      ru: 'Не регулируется; при наличии диплома равноценность проверяет IHK FOSA. Без формального диплома часто проще приехать через Ausbildung.',
    },
    regulated: false,
    procedure: 'equivalence',
    authority: ['ihk'],
    docs: [...BASE_DOCS, 'intent'],
    language: null,
    duration: 'chamber',
    fee: 'chamber',
  },
  {
    id: 'construction',
    icon: 'brick',
    german: 'Maurer/in · Hochbaufacharbeiter/in',
    name: { az: 'İnşaat işçisi / bənna', de: 'Maurer/in · Bauarbeiter/in', en: 'Construction worker / mason', ru: 'Строитель / каменщик' },
    note: {
      az: 'Bənna (Maurer) sənətkarlıq peşəsidir — HWK; sənaye tikinti peşələri üçün IHK FOSA. Formal diplom olmadan ixtisaslı işçi vizası çətindir.',
      de: 'Maurer ist ein Handwerksberuf — HWK; industrielle Bauberufe: IHK FOSA. Ohne formalen Abschluss ist das Fachkräfte-Visum schwierig.',
      en: 'Mason is a craft trade — HWK; industrial construction trades: IHK FOSA. Without a formal diploma the skilled-worker visa is difficult.',
      ru: 'Каменщик — ремесленная профессия (HWK); промышленные строительные профессии — IHK FOSA. Без формального диплома визу квалифицированного работника получить сложно.',
    },
    regulated: false,
    procedure: 'equivalence',
    authority: ['hwk', 'ihk'],
    docs: [...BASE_DOCS, 'intent'],
    language: null,
    duration: 'chamber',
    fee: 'chamber',
  },
  {
    id: 'logistics',
    icon: 'package',
    german: 'Fachkraft für Lagerlogistik',
    name: { az: 'Anbar və logistika işçisi', de: 'Fachkraft für Lagerlogistik', en: 'Warehouse / logistics worker', ru: 'Работник склада / логистики' },
    note: {
      az: 'Tənzimlənmir; peşə diplomu üçün IHK FOSA. Forklift vəsiqəsi (Staplerschein) Almaniyada asanlıqla alınır və işə qəbulu sürətləndirir.',
      de: 'Nicht reglementiert; für den Berufsabschluss: IHK FOSA. Ein Staplerschein ist in Deutschland schnell gemacht und erleichtert den Einstieg.',
      en: 'Not regulated; for a vocational diploma: IHK FOSA. A forklift licence (Staplerschein) is quick to get in Germany and helps you get hired.',
      ru: 'Не регулируется; для профессионального диплома — IHK FOSA. Удостоверение водителя погрузчика (Staplerschein) в Германии получают быстро — это ускоряет трудоустройство.',
    },
    regulated: false,
    procedure: 'equivalence',
    authority: ['ihk'],
    docs: [...BASE_DOCS, 'intent'],
    language: null,
    duration: 'chamber',
    fee: 'chamber',
  },
  {
    id: 'careAssistant',
    icon: 'hand',
    german: 'Pflegehelfer/in · Pflegeassistenz',
    name: { az: 'Qulluq köməkçisi', de: 'Pflegehilfskraft', en: 'Care assistant', ru: 'Помощник по уходу' },
    note: {
      az: 'Dövlət tərəfindən təsdiqlənmiş köməkçi peşəsi ştat səviyyəsində tənzimlənir. Diplomsuz köməkçi kimi işləmək də mümkündür, amma maaş aşağı olur.',
      de: 'Die staatlich anerkannte Pflegehilfe ist auf Landesebene reglementiert. Ungelernt ist eine Tätigkeit ebenfalls möglich, dann aber mit geringerem Gehalt.',
      en: 'The state-certified care assistant is regulated at state level. Working unqualified is also possible, but with lower pay.',
      ru: 'Государственно признанный помощник по уходу регулируется на уровне земли. Работать без квалификации тоже можно, но зарплата ниже.',
    },
    regulated: true,
    procedure: 'licence',
    authority: ['health'],
    docs: HEALTH_DOCS,
    language: 'B1',
    duration: 'licence',
    fee: 'health',
  },
  {
    id: 'accountant',
    icon: 'calc',
    german: 'Buchhalter/in · Wirtschaftswissenschaftler/in',
    name: { az: 'Mühasib / iqtisadçı', de: 'Buchhalter/in · Ökonom/in', en: 'Accountant / economist', ru: 'Бухгалтер / экономист' },
    note: {
      az: 'Tənzimlənmir (vergi məsləhətçisi və auditor istisnadır). Ali təhsil üçün ZAB qiymətləndirməsi, peşə diplomu üçün IHK FOSA. Alman vergi qanunları fərqli olduğu üçün yüksək alman dili vacibdir.',
      de: 'Nicht reglementiert (außer Steuerberater und Wirtschaftsprüfer). Für das Studium: ZAB-Zeugnisbewertung, für den Berufsabschluss: IHK FOSA. Gute Deutschkenntnisse sind wegen des deutschen Steuerrechts wichtig.',
      en: 'Not regulated (except tax advisers and auditors). University degree: ZAB statement; vocational diploma: IHK FOSA. Good German matters because German tax law differs.',
      ru: 'Не регулируется (кроме налоговых консультантов и аудиторов). Для вуза — оценка ZAB, для профессионального диплома — IHK FOSA. Хороший немецкий важен из-за особенностей налогового права.',
    },
    regulated: false,
    procedure: 'zab',
    authority: ['zab', 'ihk'],
    docs: ['id', 'cv', 'diploma', 'transcript', 'experience', 'translations'],
    language: 'B2',
    duration: 'zab',
    fee: 'zab',
  },
  {
    id: 'educator',
    icon: 'baby',
    german: 'Erzieherin / Erzieher',
    name: { az: 'Uşaq bağçası tərbiyəçisi', de: 'Erzieher/in', en: 'Kindergarten teacher', ru: 'Воспитатель детского сада' },
    note: {
      az: 'Ştat səviyyəsində tənzimlənir (dövlət tərəfindən tanınmış tərbiyəçi). Adətən B2, bəzi ştatlarda C1 alman dili tələb olunur; uyğunlaşdırma təcrübəsi təyin edilə bilər.',
      de: 'Auf Landesebene reglementiert (staatlich anerkannte/r Erzieher/in). Meist Deutsch B2, in manchen Ländern C1; ein Anpassungspraktikum kann auferlegt werden.',
      en: 'Regulated at state level (state-recognised educator). Usually German B2, in some states C1; an adaptation placement may be required.',
      ru: 'Регулируется на уровне земли (государственно признанный воспитатель). Обычно немецкий B2, в некоторых землях C1; может быть назначена адаптационная практика.',
    },
    regulated: true,
    procedure: 'licence',
    authority: ['youth'],
    docs: [...BASE_DOCS, 'language', 'police', 'intent'],
    language: 'B2',
    duration: 'licence',
    fee: 'education',
  },
];

export const findProfession = (id: string | null | undefined) => PROFESSIONS.find((p) => p.id === id) ?? null;

/** Generic, stable entry points (no deep links). */
export const LINKS = {
  finder: 'https://www.anerkennung-in-deutschland.de/',
  anabin: 'https://anabin.kmk.org/',
} as const;

/** localStorage key for a profession's document checklist. */
export const checklistKey = (id: string) => `tv_anerk_docs_${id}`;
