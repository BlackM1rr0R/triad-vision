import type { ChangeAudience, FreshnessStatus } from '../dataFreshness/registry.js';

/**
 * Texts of /changes-2027 in the six site languages. NO figures of the registry here (old / new values, dates,
 * statuses come from lib/dataFreshness/registry.ts); only titles, explanations, labels, FAQ. Facts checked
 * 2026-11-17: MiLoG § 1/§ 20 (minimum wage for every employee in Germany), § 175(4) SGB V (special right to
 * switch fund when the Zusatzbeitrag rises), § 63(1) EStG (Kindergeld: child resident in Germany / EU / EEA or
 * a treaty state), Einkommensteuerreformgesetz 2027 (BT-Drs. 21/8235, also proposes the mini-job flat tax
 * 2 % → 5 %), "antragsloses Kindergeld" law (Bundesrat 25.9.2026; Familienkasse: technical start later in 2027),
 * Grundsicherungsgeld instead of Bürgergeld since 1.7.2026 (BGBl. 2026 I Nr. 107).
 */

export type ChangesLocale = 'az' | 'de' | 'en' | 'ru' | 'tr' | 'uk';

export interface ChangesTexts {
  h1: string;
  intro: string;
  labels: {
    before: string;
    after: string;
    from: string;
    status: string;
    affects: string;
    source: string;
    tools: string;
    glossary: string;
    all: string;
    filter: string;
    asOf: string;
    implemented: string;
    faq: string;
    also: string;
    disclaimer: string;
    toc: string;
  };
  status: Record<FreshnessStatus, string>;
  statusHelp: Record<FreshnessStatus, string>;
  affects: Record<ChangeAudience, string>;
  /** Per registry id. */
  items: Record<string, { title: string; text: string }>;
  /** Further points (no registry figure): already in force, technical start dates, related proposals. */
  also: string[];
  faq: { q: string; a: string }[];
}

const en: ChangesTexts = {
  h1: 'What changes in Germany on 1 January 2027',
  intro:
    'Minimum wage, mini-job limit, taxes, child benefit, social insurance, Deutschlandticket and the Blue Card salary thresholds: every change on 1 January 2027 that matters for workers from Azerbaijan, with the old and the new value, how certain it is and the official source. Changes marked “proposal” or “expected” are not law yet — we update this page when they are decided.',
  labels: {
    before: 'Until 31 Dec 2026',
    after: 'From 1 Jan 2027',
    from: 'Valid from',
    status: 'Status',
    affects: 'Affects',
    source: 'Official source',
    tools: 'Calculate',
    glossary: 'Terms',
    all: 'All',
    filter: 'Show changes for',
    asOf: 'As of',
    implemented: 'Our calculators switch to the new value automatically on 1 January.',
    faq: 'Frequently asked questions',
    also: 'Also good to know',
    disclaimer: 'General information, not legal or tax advice. Proposals and expected values can still change; check the official source before you rely on a figure.',
    toc: 'Changes',
  },
  status: { enacted: 'Law / in force', decided: 'Decided', expected: 'Expected', proposed: 'Proposal' },
  statusHelp: {
    enacted: 'Fixed by law or ordinance — it will apply.',
    decided: 'Decided by the responsible body; a last formal step may be pending.',
    expected: 'Calculated from rules that are already fixed; the official figure is not published yet.',
    proposed: 'Only a bill or recommendation — it may change or not come at all.',
  },
  affects: { workers: 'Workers', families: 'Families', employers: 'Employers', households: 'Households', commuters: 'Commuters', newcomers: 'Visa applicants', drivers: 'Drivers' },
  items: {
    'minimum-wage': {
      title: 'Statutory minimum wage (gross per hour)',
      text: 'Applies to every employee in Germany, whatever the nationality — also to mini-jobs and to workers coming with a visa. This is the second step set by the Minimum Wage Commission; the 2028 value will be decided in mid-2027.',
    },
    'minijob-limit': {
      title: 'Mini-job limit (per month) and midi-job range',
      text: 'The limit is tied to the minimum wage, so it rises automatically. Between the mini-job limit and the upper end of the range, employees pay reduced social contributions. The tax bill (see below) would also raise the employer’s flat-rate tax on mini-jobs from 2 % to 5 % — not decided yet.',
    },
    'income-tax-tariff': {
      title: 'Income tax: basic allowance, employee lump sum, child allowance (per year)',
      text: 'More income would stay tax-free and the lump sum for work expenses would rise, so the monthly wage tax would fall slightly for most workers. Only if the bill passes; employers then apply it in payroll.',
    },
    kindergeld: {
      title: 'Child benefit (Kindergeld) per child and month',
      text: 'Paid by the Familienkasse, as a rule for children living in Germany, the EU / EEA or a treaty country — usually not for children living in Azerbaijan; ask the Familienkasse about your case. A separate law already passed: for newborns Kindergeld is to be paid without an application; the Familienkasse expects the technical start only later in 2027.',
    },
    'social-insurance-limits': {
      title: 'Contribution ceilings (BBG) and the private health insurance threshold (JAEG), per year',
      text: 'Pension, unemployment, health and care contributions are charged only up to these incomes. Above the JAEG you may leave statutory health insurance. The Blue Card salary thresholds are derived from the pension ceiling.',
    },
    'contribution-rates': {
      title: 'Average additional health contribution (Zusatzbeitrag)',
      text: 'The average stays the same, but each health fund sets its own rate and many change it on 1 January. If your fund raises it, you may switch (special right of termination, § 175 SGB V).',
    },
    deutschlandticket: {
      title: 'Deutschlandticket (per month)',
      text: 'The subscription for all local and regional buses and trains in Germany. Existing subscriptions move to the new price automatically; you can cancel monthly. Many employers subsidise it as a job ticket.',
    },
    rundfunkbeitrag: {
      title: 'Broadcasting fee (Rundfunkbeitrag) per household and month',
      text: 'Every flat pays it once, shared flats included. Unless all states agree or the Constitutional Court decides, the fee stays as it is.',
    },
    'blue-card-thresholds': {
      title: 'Blue Card and age-45+ salary thresholds (gross per year)',
      text: 'First figure: EU Blue Card standard; second: shortage occupations and recent graduates. “45+”: minimum salary for people aged 45 or over coming to work for the first time (without enough pension provision); § 19c(2): experienced workers without recognised qualification. For a contract starting in 2027 plan with the new figures.',
    },
  },
  also: [
    'Already since 1 July 2026: Bürgergeld is being replaced step by step by the new basic income support (Grundsicherungsgeld) — not a 2027 change.',
    'Visa fee for a national visa and the fast-track fee: no change announced as of the date above.',
    'Public holidays 2027 and bridge days: see the holiday planner.',
  ],
  faq: [
    {
      q: 'When do these changes take effect?',
      a: 'All changes on this page are planned for 1 January 2027. Those marked “Law / in force” or “Decided” will apply; “Expected” values are calculated from fixed rules but not yet published; a “Proposal” may still change or be dropped.',
    },
    {
      q: 'Does the minimum wage also apply to foreign workers?',
      a: 'Yes. The statutory minimum wage applies to every employee working in Germany, regardless of nationality or visa type, including mini-jobs. Employers coming through recruitment programmes must pay at least this amount per hour.',
    },
    {
      q: 'What changes for Blue Card applicants from Azerbaijan in 2027?',
      a: 'The minimum salary for the EU Blue Card rises because it is tied to the pension contribution ceiling. Until the Federal Ministry of the Interior publishes the official figures (usually in December), the 2027 values are an expectation. Check your offer with the Blue Card check.',
    },
    {
      q: 'Will my net salary change in January 2027?',
      a: 'Possibly a little: the contribution ceilings matter only for high incomes, the average health contribution stays the same, and the income tax relief applies only if the bill passes. Use the salary calculator to see your net pay.',
    },
  ],
};

const de: ChangesTexts = {
  h1: 'Was sich am 1. Januar 2027 in Deutschland ändert',
  intro:
    'Mindestlohn, Minijob-Grenze, Steuern, Kindergeld, Sozialversicherung, Deutschlandticket und Blue-Card-Gehaltsgrenzen: alle Änderungen zum 1. Januar 2027, die für Arbeitskräfte aus Aserbaidschan wichtig sind — mit altem und neuem Wert, Stand des Verfahrens und amtlicher Quelle. „Vorschlag“ und „erwartet“ sind noch kein geltendes Recht; wir aktualisieren die Seite, sobald entschieden ist.',
  labels: {
    before: 'Bis 31.12.2026',
    after: 'Ab 1.1.2027',
    from: 'Gültig ab',
    status: 'Stand',
    affects: 'Betrifft',
    source: 'Amtliche Quelle',
    tools: 'Berechnen',
    glossary: 'Begriffe',
    all: 'Alle',
    filter: 'Änderungen anzeigen für',
    asOf: 'Stand',
    implemented: 'Unsere Rechner stellen am 1. Januar automatisch auf den neuen Wert um.',
    faq: 'Häufige Fragen',
    also: 'Außerdem wichtig',
    disclaimer: 'Allgemeine Information, keine Rechts- oder Steuerberatung. Vorschläge und erwartete Werte können sich noch ändern; prüfen Sie vor Entscheidungen die amtliche Quelle.',
    toc: 'Änderungen',
  },
  status: { enacted: 'Gesetz / in Kraft', decided: 'Beschlossen', expected: 'Erwartet', proposed: 'Vorschlag' },
  statusHelp: {
    enacted: 'Per Gesetz oder Verordnung festgelegt — gilt sicher.',
    decided: 'Vom zuständigen Gremium beschlossen; ein letzter formaler Schritt kann noch ausstehen.',
    expected: 'Aus bereits feststehenden Regeln berechnet; der amtliche Wert ist noch nicht veröffentlicht.',
    proposed: 'Nur Gesetzentwurf oder Empfehlung — kann sich ändern oder ganz entfallen.',
  },
  affects: { workers: 'Beschäftigte', families: 'Familien', employers: 'Arbeitgeber', households: 'Haushalte', commuters: 'Pendler', newcomers: 'Visumantragsteller', drivers: 'Autofahrer' },
  items: {
    'minimum-wage': {
      title: 'Gesetzlicher Mindestlohn (brutto pro Stunde)',
      text: 'Gilt für alle Beschäftigten in Deutschland, unabhängig von der Staatsangehörigkeit — auch im Minijob und für Fachkräfte mit Visum. Es ist die zweite Stufe des Beschlusses der Mindestlohnkommission; über 2028 wird Mitte 2027 entschieden.',
    },
    'minijob-limit': {
      title: 'Minijob-Grenze (pro Monat) und Übergangsbereich (Midijob)',
      text: 'Die Grenze ist an den Mindestlohn gekoppelt und steigt deshalb automatisch. Im Übergangsbereich zahlen Beschäftigte verringerte Sozialbeiträge. Der Steuer-Gesetzentwurf (siehe unten) würde zudem die Pauschalsteuer des Arbeitgebers im Minijob von 2 % auf 5 % erhöhen — noch nicht beschlossen.',
    },
    'income-tax-tariff': {
      title: 'Einkommensteuer: Grundfreibetrag, Arbeitnehmer-Pauschbetrag, Kinderfreibetrag (pro Jahr)',
      text: 'Mehr Einkommen bliebe steuerfrei und die Werbungskostenpauschale stiege — die monatliche Lohnsteuer sänke für die meisten leicht. Nur wenn das Gesetz beschlossen wird; Arbeitgeber setzen es dann in der Lohnabrechnung um.',
    },
    kindergeld: {
      title: 'Kindergeld pro Kind und Monat',
      text: 'Zahlt die Familienkasse, in der Regel für Kinder mit Wohnsitz in Deutschland, der EU / dem EWR oder einem Abkommensstaat — für Kinder in Aserbaidschan meist nicht; fragen Sie die Familienkasse zu Ihrem Fall. Bereits beschlossen ist ein eigenes Gesetz: Kindergeld für Neugeborene soll ohne Antrag fließen; technisch rechnet die Familienkasse erst später im Jahr 2027 damit.',
    },
    'social-insurance-limits': {
      title: 'Beitragsbemessungsgrenzen (BBG) und Versicherungspflichtgrenze (JAEG), pro Jahr',
      text: 'Renten-, Arbeitslosen-, Kranken- und Pflegebeiträge werden nur bis zu diesen Einkommen erhoben. Oberhalb der JAEG kann man die gesetzliche Krankenversicherung verlassen. Die Blue-Card-Gehaltsgrenzen werden aus der Renten-BBG abgeleitet.',
    },
    'contribution-rates': {
      title: 'Durchschnittlicher Zusatzbeitrag der Krankenkassen',
      text: 'Der Durchschnitt bleibt gleich, aber jede Kasse legt ihren eigenen Satz fest und viele ändern ihn zum 1. Januar. Erhöht Ihre Kasse, dürfen Sie wechseln (Sonderkündigungsrecht, § 175 SGB V).',
    },
    deutschlandticket: {
      title: 'Deutschlandticket (pro Monat)',
      text: 'Das Abo für alle Busse und Bahnen im Nah- und Regionalverkehr. Bestehende Abos gehen automatisch auf den neuen Preis über; Kündigung monatlich möglich. Viele Arbeitgeber bezuschussen es als Jobticket.',
    },
    rundfunkbeitrag: {
      title: 'Rundfunkbeitrag pro Wohnung und Monat',
      text: 'Jede Wohnung zahlt ihn einmal, auch eine WG. Solange nicht alle Länder zustimmen oder das Bundesverfassungsgericht entscheidet, bleibt der Beitrag unverändert.',
    },
    'blue-card-thresholds': {
      title: 'Gehaltsgrenzen Blaue Karte und ab 45 Jahren (brutto pro Jahr)',
      text: 'Erste Zahl: Blaue Karte EU regulär; zweite: Engpassberufe und Berufsanfänger. „45+“: Mindestgehalt für Personen ab 45, die erstmals zur Arbeit kommen (ohne ausreichende Altersvorsorge); § 19c Abs. 2: berufserfahrene Kräfte ohne anerkannten Abschluss. Für einen Vertragsbeginn 2027 mit den neuen Zahlen planen.',
    },
  },
  also: [
    'Schon seit 1. Juli 2026: Das Bürgergeld wird schrittweise durch die neue Grundsicherung (Grundsicherungsgeld) ersetzt — keine Änderung 2027.',
    'Visumgebühr für nationale Visa und Gebühr für das beschleunigte Fachkräfteverfahren: zum oben genannten Stand keine Änderung angekündigt.',
    'Feiertage 2027 und Brückentage: siehe Feiertagsplaner.',
  ],
  faq: [
    {
      q: 'Ab wann gelten die Änderungen?',
      a: 'Alle Änderungen auf dieser Seite sind zum 1. Januar 2027 geplant. „Gesetz / in Kraft“ und „Beschlossen“ gelten; „Erwartet“ ist aus feststehenden Regeln berechnet, aber noch nicht veröffentlicht; ein „Vorschlag“ kann sich noch ändern oder entfallen.',
    },
    {
      q: 'Gilt der Mindestlohn auch für ausländische Arbeitskräfte?',
      a: 'Ja. Der gesetzliche Mindestlohn gilt für alle in Deutschland Beschäftigten, unabhängig von Staatsangehörigkeit oder Visum, auch im Minijob. Arbeitgeber müssen mindestens diesen Stundenlohn zahlen.',
    },
    {
      q: 'Was ändert sich 2027 für Blue-Card-Bewerber aus Aserbaidschan?',
      a: 'Das Mindestgehalt für die Blaue Karte EU steigt, weil es an die Beitragsbemessungsgrenze der Rentenversicherung gekoppelt ist. Bis das Bundesinnenministerium die amtlichen Zahlen veröffentlicht (meist im Dezember), sind die Werte für 2027 eine Erwartung. Prüfen Sie Ihr Angebot mit dem Blue-Card-Check.',
    },
    {
      q: 'Ändert sich mein Nettogehalt im Januar 2027?',
      a: 'Eventuell etwas: Die Beitragsbemessungsgrenzen betreffen nur hohe Einkommen, der durchschnittliche Zusatzbeitrag bleibt gleich und die Steuerentlastung kommt nur, wenn das Gesetz beschlossen wird. Ihr Netto zeigt der Gehaltsrechner.',
    },
  ],
};

const az: ChangesTexts = {
  h1: '1 yanvar 2027-dən Almaniyada nə dəyişir',
  intro:
    'Minimum əmək haqqı, minijob həddi, vergilər, uşaq pulu, sosial sığorta, Deutschlandticket və Mavi Kart maaş hədləri: Azərbaycandan gələn işçilər üçün vacib olan 1 yanvar 2027 dəyişiklikləri — köhnə və yeni dəyər, qərarın vəziyyəti və rəsmi mənbə ilə. “Təklif” və “gözlənilir” hələ qanun deyil; qərar veriləndə səhifəni yeniləyirik.',
  labels: {
    before: '31.12.2026-dək',
    after: '1.1.2027-dən',
    from: 'Qüvvəyə minir',
    status: 'Vəziyyət',
    affects: 'Kimə aiddir',
    source: 'Rəsmi mənbə',
    tools: 'Hesablayın',
    glossary: 'Terminlər',
    all: 'Hamısı',
    filter: 'Dəyişiklikləri göstər',
    asOf: 'Tarix',
    implemented: 'Kalkulyatorlarımız 1 yanvarda yeni dəyərə avtomatik keçir.',
    faq: 'Tez-tez verilən suallar',
    also: 'Bunu da bilin',
    disclaimer: 'Ümumi məlumatdır, hüquqi və ya vergi məsləhəti deyil. Təkliflər və gözlənilən dəyərlər dəyişə bilər; qərar verməzdən əvvəl rəsmi mənbəni yoxlayın.',
    toc: 'Dəyişikliklər',
  },
  status: { enacted: 'Qanun / qüvvədə', decided: 'Qərar verilib', expected: 'Gözlənilir', proposed: 'Təklif' },
  statusHelp: {
    enacted: 'Qanun və ya fərmanla müəyyən edilib — mütləq tətbiq olunacaq.',
    decided: 'Səlahiyyətli orqan qərar verib; son formal addım qala bilər.',
    expected: 'Artıq məlum qaydalardan hesablanıb; rəsmi rəqəm hələ dərc olunmayıb.',
    proposed: 'Yalnız qanun layihəsi və ya tövsiyə — dəyişə və ya ümumiyyətlə qəbul olunmaya bilər.',
  },
  affects: { workers: 'İşçilər', families: 'Ailələr', employers: 'İşəgötürənlər', households: 'Ev təsərrüfatları', commuters: 'Nəqliyyatla gedənlər', newcomers: 'Viza üçün müraciət edənlər', drivers: 'Sürücülər' },
  items: {
    'minimum-wage': {
      title: 'Qanuni minimum əmək haqqı (saatlıq, brutto)',
      text: 'Vətəndaşlığından asılı olmayaraq Almaniyada işləyən hər kəsə aiddir — minijob-a və viza ilə gələn işçilərə də. Bu, Minimum Əmək Haqqı Komissiyasının qərarının ikinci addımıdır; 2028 üçün qərar 2027-ci ilin ortasında veriləcək.',
    },
    'minijob-limit': {
      title: 'Minijob həddi (aylıq) və Midijob aralığı',
      text: 'Hədd minimum əmək haqqına bağlıdır, ona görə avtomatik artır. Keçid aralığında (Midijob) işçi azaldılmış sosial sığorta haqqı ödəyir. Vergi qanun layihəsi (aşağıda) həmçinin işəgötürənin minijob üzrə sabit vergisini 2 %-dən 5 %-ə qaldırmağı təklif edir — hələ qərar yoxdur.',
    },
    'income-tax-tariff': {
      title: 'Gəlir vergisi: Grundfreibetrag, Arbeitnehmer-Pauschbetrag, Kinderfreibetrag (illik)',
      text: 'Daha çox gəlir vergidən azad olardı və işlə bağlı xərclərin sabit məbləği artardı — əksər işçilər üçün aylıq vergi bir az azalardı. Yalnız qanun qəbul olunarsa; sonra işəgötürən maaş hesablamasında tətbiq edir.',
    },
    kindergeld: {
      title: 'Uşaq pulu (Kindergeld), hər uşaq üçün aylıq',
      text: 'Familienkasse ödəyir, adətən Almaniyada, AB / AİZ-də və ya müqaviləsi olan ölkədə yaşayan uşaqlar üçün — Azərbaycanda yaşayan uşaqlar üçün adətən ödənilmir; öz vəziyyətinizi Familienkasse-dən soruşun. Ayrıca qanun artıq qəbul olunub: yeni doğulan uşaqlar üçün Kindergeld ərizəsiz ödəniləcək; Familienkasse texniki başlanğıcı 2027-ci ilin sonlarına gözləyir.',
    },
    'social-insurance-limits': {
      title: 'Sığorta haqqı tavanları (BBG) və özəl tibbi sığorta həddi (JAEG), illik',
      text: 'Pensiya, işsizlik, xəstəlik və qulluq sığortası haqları yalnız bu gəlirə qədər tutulur. JAEG-dən yuxarı gəlirlə dövlət tibbi sığortasından çıxmaq olar. Mavi Kart maaş hədləri pensiya tavanından hesablanır.',
    },
    'contribution-rates': {
      title: 'Tibbi sığortada orta əlavə haqq (Zusatzbeitrag)',
      text: 'Orta faiz dəyişmir, lakin hər kassa öz faizini təyin edir və çoxu 1 yanvarda dəyişir. Kassanız faizi artırarsa, başqa kassaya keçə bilərsiniz (xüsusi ləğv hüququ, § 175 SGB V).',
    },
    deutschlandticket: {
      title: 'Deutschlandticket (aylıq)',
      text: 'Almaniyada bütün yerli və regional avtobus və qatarlar üçün abunə. Mövcud abunələr avtomatik yeni qiymətə keçir; hər ay ləğv etmək olar. Bir çox işəgötürən onu Jobticket kimi ödəyir.',
    },
    rundfunkbeitrag: {
      title: 'Yayım haqqı (Rundfunkbeitrag), mənzil üzrə aylıq',
      text: 'Hər mənzil bir dəfə ödəyir, ortaq mənzil (WG) də. Bütün əyalətlər razılaşmasa və ya Konstitusiya Məhkəməsi qərar verməsə, məbləğ dəyişmir.',
    },
    'blue-card-thresholds': {
      title: 'Mavi Kart və 45+ yaş üçün maaş hədləri (illik brutto)',
      text: 'Birinci rəqəm: adi Mavi Kart; ikinci: çatışmazlıq peşələri və yeni məzunlar. “45+”: ilk dəfə işləməyə gələn 45 yaş və yuxarı şəxslər üçün minimum maaş (kifayət qədər pensiya təminatı olmadan); § 19c(2): tanınmış diplomu olmayan təcrübəli işçilər. 2027-də başlayan müqavilə üçün yeni rəqəmlərlə planlayın.',
    },
  },
  also: [
    '1 iyul 2026-dan artıq: Bürgergeld mərhələlərlə yeni Grundsicherung (Grundsicherungsgeld) ilə əvəz olunur — bu, 2027 dəyişikliyi deyil.',
    'Milli viza rüsumu və sürətləndirilmiş prosedur rüsumu: yuxarıdakı tarixə dəyişiklik elan olunmayıb.',
    '2027 bayramları və körpü günləri: bayram planlayıcısına baxın.',
  ],
  faq: [
    {
      q: 'Dəyişikliklər nə vaxt qüvvəyə minir?',
      a: 'Bu səhifədəki bütün dəyişikliklər 1 yanvar 2027 üçün planlaşdırılıb. “Qanun / qüvvədə” və “Qərar verilib” mütləq tətbiq olunur; “Gözlənilir” məlum qaydalardan hesablanıb, amma hələ dərc olunmayıb; “Təklif” dəyişə və ya ləğv oluna bilər.',
    },
    {
      q: 'Minimum əmək haqqı əcnəbi işçilərə də aiddirmi?',
      a: 'Bəli. Qanuni minimum əmək haqqı vətəndaşlıq və viza növündən asılı olmayaraq Almaniyada işləyən hər kəsə, minijob-a da aiddir. İşəgötürən saatda ən azı bu məbləği ödəməlidir.',
    },
    {
      q: '2027-də Azərbaycandan Mavi Kart üçün müraciət edənlər üçün nə dəyişir?',
      a: 'Mavi Kart üçün minimum maaş artır, çünki pensiya sığortasının tavanına bağlıdır. Federal Daxili İşlər Nazirliyi rəsmi rəqəmləri dərc edənə qədər (adətən dekabrda) 2027 dəyərləri gözləntidir. Təklifinizi Mavi Kart yoxlaması ilə yoxlayın.',
    },
    {
      q: 'Yanvar 2027-də xalis maaşım dəyişəcəkmi?',
      a: 'Bir az ola bilər: tavanlar yalnız yüksək gəlirlərə təsir edir, orta Zusatzbeitrag dəyişmir, vergi güzəşti isə yalnız qanun qəbul olunarsa gələcək. Xalis maaşınızı maaş kalkulyatorunda görün.',
    },
  ],
};

const ru: ChangesTexts = {
  h1: 'Что изменится в Германии 1 января 2027 года',
  intro:
    'Минимальная зарплата, лимит мини-джоба, налоги, Kindergeld, соцстрахование, Deutschlandticket и пороги зарплаты для Голубой карты: все изменения с 1 января 2027 года, важные для работников из Азербайджана, — со старым и новым значением, статусом решения и официальным источником. «Предложение» и «ожидается» — ещё не закон; мы обновим страницу, когда решение будет принято.',
  labels: {
    before: 'До 31.12.2026',
    after: 'С 1.1.2027',
    from: 'Действует с',
    status: 'Статус',
    affects: 'Касается',
    source: 'Официальный источник',
    tools: 'Рассчитать',
    glossary: 'Термины',
    all: 'Все',
    filter: 'Показать изменения для',
    asOf: 'По состоянию на',
    implemented: 'Наши калькуляторы автоматически перейдут на новое значение 1 января.',
    faq: 'Частые вопросы',
    also: 'Также полезно знать',
    disclaimer: 'Общая информация, не юридическая и не налоговая консультация. Предложения и ожидаемые значения ещё могут измениться; перед решением проверьте официальный источник.',
    toc: 'Изменения',
  },
  status: { enacted: 'Закон / действует', decided: 'Решение принято', expected: 'Ожидается', proposed: 'Предложение' },
  statusHelp: {
    enacted: 'Установлено законом или постановлением — точно будет действовать.',
    decided: 'Решение принято ответственным органом; может остаться последний формальный шаг.',
    expected: 'Рассчитано по уже известным правилам; официальная цифра ещё не опубликована.',
    proposed: 'Только законопроект или рекомендация — может измениться или не вступить в силу.',
  },
  affects: { workers: 'Работники', families: 'Семьи', employers: 'Работодатели', households: 'Домохозяйства', commuters: 'Пассажиры', newcomers: 'Заявители на визу', drivers: 'Водители' },
  items: {
    'minimum-wage': {
      title: 'Минимальная зарплата (брутто в час)',
      text: 'Действует для всех работников в Германии независимо от гражданства — также в мини-джобе и для приезжающих по визе. Это вторая ступень решения Комиссии по минимальной зарплате; о 2028 годе решат в середине 2027-го.',
    },
    'minijob-limit': {
      title: 'Лимит мини-джоба (в месяц) и диапазон мидиджоба',
      text: 'Лимит привязан к минимальной зарплате и поэтому растёт автоматически. В переходном диапазоне (мидиджоб) работник платит сниженные взносы. Налоговый законопроект (см. ниже) также предлагает поднять паушальный налог работодателя на мини-джоб с 2 % до 5 % — решения ещё нет.',
    },
    'income-tax-tariff': {
      title: 'Подоходный налог: Grundfreibetrag, Arbeitnehmer-Pauschbetrag, Kinderfreibetrag (в год)',
      text: 'Больше дохода осталось бы без налога, а паушальная сумма рабочих расходов выросла бы — ежемесячный налог для большинства немного снизился бы. Только если закон примут; затем работодатель учтёт это в расчёте зарплаты.',
    },
    kindergeld: {
      title: 'Kindergeld (пособие на ребёнка) в месяц',
      text: 'Выплачивает Familienkasse, как правило, на детей, живущих в Германии, ЕС / ЕЭЗ или стране с соглашением, — на детей в Азербайджане обычно нет; уточните свой случай в Familienkasse. Отдельный закон уже принят: Kindergeld на новорождённых будут платить без заявления; технически Familienkasse ожидает запуск только позже в 2027 году.',
    },
    'social-insurance-limits': {
      title: 'Потолки взносов (BBG) и порог частной медстраховки (JAEG), в год',
      text: 'Пенсионные, по безработице, медицинские и по уходу взносы берутся только до этих доходов. Выше JAEG можно выйти из государственной медстраховки. Пороги Голубой карты рассчитываются из пенсионного потолка.',
    },
    'contribution-rates': {
      title: 'Средний дополнительный взнос в больничную кассу (Zusatzbeitrag)',
      text: 'Среднее значение не меняется, но каждая касса устанавливает свою ставку, и многие меняют её 1 января. Если ваша касса повышает ставку, можно перейти в другую (особое право расторжения, § 175 SGB V).',
    },
    deutschlandticket: {
      title: 'Deutschlandticket (в месяц)',
      text: 'Абонемент на все местные и региональные автобусы и поезда Германии. Действующие абонементы переходят на новую цену автоматически; отменить можно ежемесячно. Многие работодатели доплачивают его как Jobticket.',
    },
    rundfunkbeitrag: {
      title: 'Взнос за радио и ТВ (Rundfunkbeitrag) на квартиру в месяц',
      text: 'Каждая квартира платит один раз, в том числе WG. Пока все земли не согласятся или Конституционный суд не решит, сумма не меняется.',
    },
    'blue-card-thresholds': {
      title: 'Пороги зарплаты для Голубой карты и для возраста 45+ (брутто в год)',
      text: 'Первая цифра: обычная Голубая карта ЕС; вторая: дефицитные профессии и недавние выпускники. «45+»: минимальная зарплата для людей от 45 лет, впервые приезжающих работать (без достаточного пенсионного обеспечения); § 19c(2): опытные работники без признанного диплома. Для договора с началом в 2027 году планируйте по новым цифрам.',
    },
  },
  also: [
    'Уже с 1 июля 2026 года Bürgergeld поэтапно заменяется новым базовым обеспечением (Grundsicherungsgeld) — это не изменение 2027 года.',
    'Сбор за национальную визу и сбор за ускоренную процедуру: на указанную дату изменений не объявлено.',
    'Праздники 2027 года и «мостики»: смотрите планировщик праздников.',
  ],
  faq: [
    {
      q: 'Когда вступают в силу изменения?',
      a: 'Все изменения на этой странице запланированы на 1 января 2027 года. «Закон / действует» и «Решение принято» точно будут применяться; «Ожидается» рассчитано по известным правилам, но ещё не опубликовано; «Предложение» может измениться или быть отменено.',
    },
    {
      q: 'Распространяется ли минимальная зарплата на иностранных работников?',
      a: 'Да. Минимальная зарплата действует для всех, кто работает в Германии, независимо от гражданства и вида визы, включая мини-джоб. Работодатель обязан платить не меньше этой суммы в час.',
    },
    {
      q: 'Что меняется в 2027 году для заявителей на Голубую карту из Азербайджана?',
      a: 'Минимальная зарплата для Голубой карты ЕС растёт, потому что привязана к потолку пенсионных взносов. Пока МВД ФРГ не опубликует официальные цифры (обычно в декабре), значения на 2027 год — ожидание. Проверьте своё предложение в проверке Голубой карты.',
    },
    {
      q: 'Изменится ли моя зарплата нетто в январе 2027 года?',
      a: 'Возможно, немного: потолки взносов касаются только высоких доходов, средний дополнительный взнос не меняется, а налоговое облегчение будет, только если закон примут. Свою зарплату нетто посмотрите в калькуляторе зарплаты.',
    },
  ],
};

const tr: ChangesTexts = {
  h1: "1 Ocak 2027'de Almanya'da neler değişiyor",
  intro:
    "Asgari ücret, minijob sınırı, vergiler, çocuk parası, sosyal sigorta, Deutschlandticket ve Mavi Kart maaş eşikleri: Azerbaycan'dan gelen çalışanlar için önemli olan 1 Ocak 2027 değişiklikleri — eski ve yeni değer, karar durumu ve resmi kaynakla. “Öneri” ve “bekleniyor” henüz yasa değildir; karar verildiğinde sayfayı güncelliyoruz.",
  labels: {
    before: "31.12.2026'ya kadar",
    after: "1.1.2027'den itibaren",
    from: 'Geçerlilik',
    status: 'Durum',
    affects: 'Kimi etkiler',
    source: 'Resmi kaynak',
    tools: 'Hesapla',
    glossary: 'Terimler',
    all: 'Tümü',
    filter: 'Değişiklikleri göster',
    asOf: 'Tarih',
    implemented: 'Hesaplayıcılarımız 1 Ocak’ta yeni değere otomatik geçer.',
    faq: 'Sıkça sorulan sorular',
    also: 'Bunu da bilin',
    disclaimer: 'Genel bilgidir, hukuki veya vergi danışmanlığı değildir. Öneriler ve beklenen değerler değişebilir; karar vermeden önce resmi kaynağı kontrol edin.',
    toc: 'Değişiklikler',
  },
  status: { enacted: 'Yasa / yürürlükte', decided: 'Karar verildi', expected: 'Bekleniyor', proposed: 'Öneri' },
  statusHelp: {
    enacted: 'Yasa veya yönetmelikle belirlendi — kesin uygulanacak.',
    decided: 'Yetkili kurum karar verdi; son bir resmi adım kalmış olabilir.',
    expected: 'Belirli kurallardan hesaplandı; resmi rakam henüz yayımlanmadı.',
    proposed: 'Yalnızca tasarı veya tavsiye — değişebilir ya da hiç gelmeyebilir.',
  },
  affects: { workers: 'Çalışanlar', families: 'Aileler', employers: 'İşverenler', households: 'Haneler', commuters: 'Toplu taşıma kullananlar', newcomers: 'Vize başvuranları', drivers: 'Sürücüler' },
  items: {
    'minimum-wage': {
      title: 'Yasal asgari ücret (saatlik brüt)',
      text: "Uyruğa bakılmaksızın Almanya'da çalışan herkes için geçerlidir — minijob ve vizeyle gelen çalışanlar dahil. Asgari Ücret Komisyonu kararının ikinci adımıdır; 2028 değeri 2027 ortasında belirlenecek.",
    },
    'minijob-limit': {
      title: 'Minijob sınırı (aylık) ve Midijob aralığı',
      text: 'Sınır asgari ücrete bağlıdır, bu yüzden otomatik artar. Geçiş aralığında (Midijob) çalışan daha düşük sosyal sigorta primi öder. Vergi tasarısı (aşağıda) ayrıca işverenin minijob götürü vergisini %2’den %5’e çıkarmayı öneriyor — henüz karar yok.',
    },
    'income-tax-tariff': {
      title: 'Gelir vergisi: Grundfreibetrag, Arbeitnehmer-Pauschbetrag, Kinderfreibetrag (yıllık)',
      text: 'Daha fazla gelir vergiden muaf kalır ve iş giderleri götürü tutarı artar — çoğu çalışan için aylık vergi biraz düşer. Yalnızca yasa çıkarsa; işveren bunu bordroda uygular.',
    },
    kindergeld: {
      title: 'Çocuk parası (Kindergeld), çocuk başına aylık',
      text: "Familienkasse öder; kural olarak Almanya'da, AB / AEA'da veya anlaşmalı bir ülkede yaşayan çocuklar için — Azerbaycan'da yaşayan çocuklar için genellikle ödenmez; durumunuzu Familienkasse'ye sorun. Ayrı bir yasa zaten çıktı: yeni doğanlar için Kindergeld başvurusuz ödenecek; Familienkasse teknik başlangıcı 2027'nin ilerleyen aylarında bekliyor.",
    },
    'social-insurance-limits': {
      title: 'Prim tavanları (BBG) ve özel sağlık sigortası eşiği (JAEG), yıllık',
      text: 'Emeklilik, işsizlik, sağlık ve bakım primleri yalnızca bu gelirlere kadar alınır. JAEG’in üzerinde yasal sağlık sigortasından çıkılabilir. Mavi Kart maaş eşikleri emeklilik tavanından hesaplanır.',
    },
    'contribution-rates': {
      title: 'Sağlık kasalarında ortalama ek prim (Zusatzbeitrag)',
      text: 'Ortalama değişmiyor, ama her kasa kendi oranını belirler ve çoğu 1 Ocak’ta değiştirir. Kasanız oranı artırırsa başka kasaya geçebilirsiniz (özel fesih hakkı, § 175 SGB V).',
    },
    deutschlandticket: {
      title: 'Deutschlandticket (aylık)',
      text: "Almanya'daki tüm yerel ve bölgesel otobüs ve trenler için abonelik. Mevcut abonelikler otomatik olarak yeni fiyata geçer; aylık iptal edilebilir. Birçok işveren Jobticket olarak destekler.",
    },
    rundfunkbeitrag: {
      title: 'Yayın ücreti (Rundfunkbeitrag), konut başına aylık',
      text: 'Her konut bir kez öder, paylaşımlı daireler (WG) dahil. Tüm eyaletler anlaşmazsa veya Anayasa Mahkemesi karar vermezse ücret aynı kalır.',
    },
    'blue-card-thresholds': {
      title: 'Mavi Kart ve 45+ yaş maaş eşikleri (yıllık brüt)',
      text: 'İlk rakam: standart AB Mavi Kart; ikinci: eleman açığı olan meslekler ve yeni mezunlar. “45+”: ilk kez çalışmaya gelen 45 yaş ve üzeri kişiler için asgari maaş (yeterli emeklilik güvencesi olmadan); § 19c(2): tanınmış diploması olmayan deneyimli çalışanlar. 2027’de başlayan sözleşme için yeni rakamlarla planlayın.',
    },
  },
  also: [
    '1 Temmuz 2026’dan beri: Bürgergeld adım adım yeni temel güvenceyle (Grundsicherungsgeld) değiştiriliyor — bu bir 2027 değişikliği değil.',
    'Ulusal vize harcı ve hızlandırılmış prosedür ücreti: yukarıdaki tarih itibarıyla değişiklik duyurulmadı.',
    '2027 resmi tatilleri ve köprü günleri: tatil planlayıcısına bakın.',
  ],
  faq: [
    {
      q: 'Değişiklikler ne zaman yürürlüğe giriyor?',
      a: 'Bu sayfadaki tüm değişiklikler 1 Ocak 2027 için planlandı. “Yasa / yürürlükte” ve “Karar verildi” kesin uygulanır; “Bekleniyor” belirli kurallardan hesaplandı ama henüz yayımlanmadı; “Öneri” değişebilir veya kaldırılabilir.',
    },
    {
      q: 'Asgari ücret yabancı çalışanlar için de geçerli mi?',
      a: "Evet. Yasal asgari ücret, uyruk ve vize türüne bakılmaksızın Almanya'da çalışan herkes için, minijob dahil geçerlidir. İşveren saat başına en az bu tutarı ödemek zorundadır.",
    },
    {
      q: "2027'de Azerbaycan'dan Mavi Kart başvuranlar için ne değişiyor?",
      a: 'Mavi Kart için asgari maaş artıyor, çünkü emeklilik prim tavanına bağlı. Federal İçişleri Bakanlığı resmi rakamları yayımlayana kadar (genellikle aralıkta) 2027 değerleri bir beklentidir. Teklifinizi Mavi Kart kontrolüyle inceleyin.',
    },
    {
      q: 'Ocak 2027’de net maaşım değişecek mi?',
      a: 'Belki biraz: prim tavanları yalnızca yüksek gelirleri etkiler, ortalama ek prim aynı kalır ve vergi indirimi yalnızca yasa çıkarsa gelir. Net maaşınızı maaş hesaplayıcısında görün.',
    },
  ],
};

const uk: ChangesTexts = {
  h1: 'Що зміниться в Німеччині 1 січня 2027 року',
  intro:
    'Мінімальна зарплата, ліміт міні-джобу, податки, Kindergeld, соцстрахування, Deutschlandticket і пороги зарплати для Блакитної карти: усі зміни з 1 січня 2027 року, важливі для працівників з Азербайджану, — зі старим і новим значенням, статусом рішення та офіційним джерелом. «Пропозиція» та «очікується» — ще не закон; ми оновимо сторінку, коли рішення ухвалять.',
  labels: {
    before: 'До 31.12.2026',
    after: 'З 1.1.2027',
    from: 'Діє з',
    status: 'Статус',
    affects: 'Стосується',
    source: 'Офіційне джерело',
    tools: 'Розрахувати',
    glossary: 'Терміни',
    all: 'Усі',
    filter: 'Показати зміни для',
    asOf: 'Станом на',
    implemented: 'Наші калькулятори автоматично перейдуть на нове значення 1 січня.',
    faq: 'Часті запитання',
    also: 'Також варто знати',
    disclaimer: 'Загальна інформація, не юридична і не податкова консультація. Пропозиції та очікувані значення ще можуть змінитися; перед рішенням перевірте офіційне джерело.',
    toc: 'Зміни',
  },
  status: { enacted: 'Закон / чинне', decided: 'Ухвалено', expected: 'Очікується', proposed: 'Пропозиція' },
  statusHelp: {
    enacted: 'Встановлено законом або постановою — точно діятиме.',
    decided: 'Рішення ухвалив відповідальний орган; може лишитися останній формальний крок.',
    expected: 'Розраховано за вже відомими правилами; офіційну цифру ще не опубліковано.',
    proposed: 'Лише законопроєкт або рекомендація — може змінитися або не набути чинності.',
  },
  affects: { workers: 'Працівники', families: 'Сім’ї', employers: 'Роботодавці', households: 'Домогосподарства', commuters: 'Пасажири', newcomers: 'Заявники на візу', drivers: 'Водії' },
  items: {
    'minimum-wage': {
      title: 'Мінімальна зарплата (брутто за годину)',
      text: 'Діє для всіх працівників у Німеччині незалежно від громадянства — також у міні-джобі та для тих, хто приїжджає за візою. Це другий крок рішення Комісії з мінімальної зарплати; про 2028 рік вирішать у середині 2027-го.',
    },
    'minijob-limit': {
      title: 'Ліміт міні-джобу (на місяць) і діапазон мідіджобу',
      text: 'Ліміт прив’язаний до мінімальної зарплати, тому зростає автоматично. У перехідному діапазоні (мідіджоб) працівник сплачує знижені внески. Податковий законопроєкт (див. нижче) також пропонує підняти паушальний податок роботодавця на міні-джоб з 2 % до 5 % — рішення ще немає.',
    },
    'income-tax-tariff': {
      title: 'Податок на доходи: Grundfreibetrag, Arbeitnehmer-Pauschbetrag, Kinderfreibetrag (на рік)',
      text: 'Більше доходу лишалося б без податку, а паушальна сума робочих витрат зросла б — щомісячний податок для більшості трохи знизився б. Лише якщо закон ухвалять; тоді роботодавець врахує це в розрахунку зарплати.',
    },
    kindergeld: {
      title: 'Kindergeld (допомога на дитину) на місяць',
      text: 'Виплачує Familienkasse, як правило, на дітей, що живуть у Німеччині, ЄС / ЄЕП або країні з угодою, — на дітей в Азербайджані зазвичай ні; уточніть свій випадок у Familienkasse. Окремий закон уже ухвалено: Kindergeld на новонароджених виплачуватимуть без заяви; технічно Familienkasse очікує запуск лише пізніше у 2027 році.',
    },
    'social-insurance-limits': {
      title: 'Стелі внесків (BBG) і поріг приватного медстрахування (JAEG), на рік',
      text: 'Пенсійні, з безробіття, медичні та з догляду внески стягуються лише до цих доходів. Вище JAEG можна вийти з державного медстрахування. Пороги Блакитної карти розраховуються з пенсійної стелі.',
    },
    'contribution-rates': {
      title: 'Середній додатковий внесок до лікарняної каси (Zusatzbeitrag)',
      text: 'Середнє значення не змінюється, але кожна каса встановлює свою ставку, і багато хто змінює її 1 січня. Якщо ваша каса підвищує ставку, можна перейти до іншої (особливе право розірвання, § 175 SGB V).',
    },
    deutschlandticket: {
      title: 'Deutschlandticket (на місяць)',
      text: 'Абонемент на всі місцеві й регіональні автобуси та потяги Німеччини. Чинні абонементи автоматично переходять на нову ціну; скасувати можна щомісяця. Багато роботодавців доплачують його як Jobticket.',
    },
    rundfunkbeitrag: {
      title: 'Внесок за радіо й ТБ (Rundfunkbeitrag) на квартиру на місяць',
      text: 'Кожна квартира платить один раз, зокрема WG. Доки всі землі не погодяться або Конституційний суд не вирішить, сума не змінюється.',
    },
    'blue-card-thresholds': {
      title: 'Пороги зарплати для Блакитної карти та віку 45+ (брутто на рік)',
      text: 'Перша цифра: звичайна Блакитна карта ЄС; друга: дефіцитні професії та нещодавні випускники. «45+»: мінімальна зарплата для людей від 45 років, які вперше приїжджають працювати (без достатнього пенсійного забезпечення); § 19c(2): досвідчені працівники без визнаного диплома. Для договору з початком у 2027 році плануйте за новими цифрами.',
    },
  },
  also: [
    'Уже з 1 липня 2026 року Bürgergeld поетапно замінюється новим базовим забезпеченням (Grundsicherungsgeld) — це не зміна 2027 року.',
    'Збір за національну візу та збір за прискорену процедуру: станом на вказану дату змін не оголошено.',
    'Свята 2027 року та «містки»: дивіться планувальник свят.',
  ],
  faq: [
    {
      q: 'Коли набувають чинності зміни?',
      a: 'Усі зміни на цій сторінці заплановано на 1 січня 2027 року. «Закон / чинне» та «Ухвалено» точно застосовуватимуться; «Очікується» розраховано за відомими правилами, але ще не опубліковано; «Пропозиція» може змінитися або бути скасована.',
    },
    {
      q: 'Чи поширюється мінімальна зарплата на іноземних працівників?',
      a: 'Так. Мінімальна зарплата діє для всіх, хто працює в Німеччині, незалежно від громадянства та виду візи, включно з міні-джобом. Роботодавець зобов’язаний платити не менше цієї суми за годину.',
    },
    {
      q: 'Що змінюється у 2027 році для заявників на Блакитну карту з Азербайджану?',
      a: 'Мінімальна зарплата для Блакитної карти ЄС зростає, бо прив’язана до стелі пенсійних внесків. Доки МВС ФРН не опублікує офіційні цифри (зазвичай у грудні), значення на 2027 рік — очікування. Перевірте свою пропозицію в перевірці Блакитної карти.',
    },
    {
      q: 'Чи зміниться моя зарплата нетто в січні 2027 року?',
      a: 'Можливо, трохи: стелі внесків стосуються лише високих доходів, середній додатковий внесок не змінюється, а податкове полегшення буде, лише якщо закон ухвалять. Свою зарплату нетто подивіться в калькуляторі зарплати.',
    },
  ],
};

export const CHANGES_TEXTS: Record<ChangesLocale, ChangesTexts> = { az, de, en, ru, tr, uk };
