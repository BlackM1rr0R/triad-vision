import type { SeoLocale } from '../seoCatalogue.js';

/**
 * "Which visa fits me?" comparison page (/compare-visas): the five common routes side by side. One source for
 * the client page (GET /api/compare-visas), the crawlable body and the FAQPage JSON-LD (lib/seo.ts,
 * lib/seoBody.ts). Facts follow the guide seed content (prisma/seed/guides); the Blue Card and 45+ salary
 * figures are the admin-editable thresholds (GET /api/seo/blue-card), filled in at render time.
 */

export const COMPARE_ROUTES = ['chancenkarte', 'blueCard', 'ausbildung', 'skilled18a', 'family'] as const;
export type CompareRoute = (typeof COMPARE_ROUTES)[number];
export const COMPARE_CRITERIA = ['requirements', 'german', 'jobOffer', 'salary', 'duration', 'family', 'permanent', 'processing'] as const;
export type CompareCriterion = (typeof COMPARE_CRITERIA)[number];

/** Guide key (GuidePage.key) and tool page of each route. */
export const ROUTE_LINKS: Record<CompareRoute, { guide: string; tool?: string }> = {
  chancenkarte: { guide: 'chancenkarte', tool: '/chancenkarte-calculator' },
  blueCard: { guide: 'blue-card', tool: '/blue-card-check' },
  ausbildung: { guide: 'ausbildung' },
  skilled18a: { guide: 'anerkennung', tool: '/anerkennung' },
  family: { guide: 'familiennachzug' },
};

/** Short yes / no / depends value of the "job offer needed?" row (icons in the client). */
export const JOB_OFFER: Record<CompareRoute, 'yes' | 'no'> = { chancenkarte: 'no', blueCard: 'yes', ausbildung: 'yes', skilled18a: 'yes', family: 'no' };

interface LangContent {
  intro: string;
  caption: string;
  criterion: string;
  routes: Record<CompareRoute, string>;
  criteria: Record<CompareCriterion, string>;
  cells: Record<CompareRoute, Record<CompareCriterion, string>>;
  faq: { q: string; a: string }[];
  disclaimer: string;
}

const CONTENT: Record<SeoLocale, LangContent> = {
  en: {
    intro:
      'Five common legal routes to Germany side by side: what each one requires, how much German you need, whether you need a job offer, salary thresholds, family options and the way to permanent residence. Answer six short questions and we suggest the routes that fit you best.',
    caption: 'German residence routes for workers and families compared (2026)',
    criterion: 'Criterion',
    routes: {
      chancenkarte: 'Opportunity Card (Chancenkarte, §20a)',
      blueCard: 'EU Blue Card (§18g)',
      ausbildung: 'Ausbildung — vocational training (§16a)',
      skilled18a: 'Skilled worker with vocational training (§18a)',
      family: 'Family reunification (§§27–36)',
    },
    criteria: {
      requirements: 'Requirements',
      german: 'German level',
      jobOffer: 'Job offer needed?',
      salary: 'Salary threshold',
      duration: 'Duration',
      family: 'Family',
      permanent: 'Path to permanent residence',
      processing: 'Processing time',
    },
    cells: {
      chancenkarte: {
        requirements: 'Degree or vocational qualification (at least 2 years) recognised in your country and 6 points — no points if fully recognised in Germany; proof of funds and health insurance',
        german: 'German A1 or English B2',
        jobOffer: 'No — you look for a job in Germany',
        salary: 'No threshold; proof of funds instead (2025: €1,091 per month)',
        duration: 'Up to 12 months; with a job offer a follow-up card of up to 2 years is possible',
        family: 'Not intended — the family usually follows after the switch to a work permit',
        permanent: 'Switch to §18a, §18b or the Blue Card once you find a job, then their path',
        processing: 'A few weeks to several months, depending on the mission',
      },
      blueCard: {
        requirements: 'Recognised or comparable university degree (IT: 3 years of experience can replace it) and a qualified job offer for at least 6 months',
        german: 'Not required',
        jobOffer: 'Yes',
        salary: '2026: €{bcStandard} gross per year; €{bcShortage} for shortage occupations and recent graduates',
        duration: 'Contract length plus 3 months, up to 4 years',
        family: 'Yes — the spouse needs no A1 German and may work without restriction',
        permanent: 'Settlement permit after 27 months, after 21 months with German B1',
        processing: 'Often 1–3 months after the embassy appointment; the fast-track procedure (§81a) can shorten it',
      },
      ausbildung: {
        requirements: 'Training contract with a German company, school certificate and secured livelihood',
        german: 'Usually B1',
        jobOffer: 'Yes — a training contract',
        salary: 'No threshold; the company pays a training allowance (statutory minimum 2025: €682 per month, nursing about €1,300+)',
        duration: 'Length of the training (2–3.5 years), then up to 18 months to find a job',
        family: 'Only if income and living space are sufficient — rarely possible on an allowance',
        permanent: 'After the final exam: skilled worker permit (§18a), settlement permit after about 3 more years',
        processing: 'About 1–3 months after the embassy appointment',
      },
      skilled18a: {
        requirements: 'Vocational qualification recognised in Germany (Anerkennung) and a concrete job offer in a qualified job',
        german: 'No legal minimum; in practice A2–B1, regulated professions such as nursing B1–B2',
        jobOffer: 'Yes',
        salary: 'No general threshold; first-time applicants aged 45+ need €{olderWorker} per year (2026) or adequate pension provision',
        duration: 'Up to 4 years, tied to the employment contract',
        family: 'Yes — as a rule without A1 German for the spouse; income and living space must be sufficient',
        permanent: 'Settlement permit after 3 years in skilled work (with pension contributions and German B1)',
        processing: '1–4 months; recognition beforehand often takes 2–4 months more',
      },
      family: {
        requirements: 'The family member in Germany (sponsor) holds a suitable title, earns enough for everyone and has adequate living space; valid marriage, both partners 18+',
        german: 'A1 for many spouses — not for spouses of Blue Card holders and most skilled workers; none for children under 16',
        jobOffer: 'No',
        salary: 'No fixed threshold; the sponsor\'s net income must cover the family\'s needs',
        duration: 'Usually as long as the sponsor\'s residence permit',
        family: 'This is the family route: spouse, minor children; parents only for skilled workers with a title from 1 March 2024',
        permanent: 'Own settlement permit usually after 3–5 years, depending on the sponsor\'s status',
        processing: 'Often 1–3 months, at busy missions longer',
      },
    },
    faq: [
      {
        q: 'Which route works if I do not have a job offer yet?',
        a: 'The Opportunity Card (Chancenkarte) lets you look for a job in Germany for up to one year without an offer, if you reach 6 points or your qualification is fully recognised. For young people with B1 German, a visa to search for a training place (up to 9 months) is another option.',
      },
      {
        q: 'Do I need to speak German for the EU Blue Card?',
        a: 'No. The Blue Card has no German requirement. You need a recognised or comparable degree and a job offer above the salary threshold (2026: €{bcStandard}, or €{bcShortage} in shortage occupations). German at B1 shortens the way to permanent residence from 27 to 21 months.',
      },
      {
        q: 'Can my family come with me?',
        a: 'With the Blue Card or a skilled worker permit (§18a / §18b) your spouse and children can join you; Blue Card spouses do not need A1 German. On the Opportunity Card and during an Ausbildung, family reunification is only possible if income and living space are sufficient, which is rarely the case.',
      },
      {
        q: 'What is the difference between §18a and the Blue Card?',
        a: '§18a is for skilled workers with recognised vocational training and has no fixed salary threshold (except for first-time applicants aged 45+). The Blue Card is for university graduates with a salary above the threshold and offers faster permanent residence and easier family reunification.',
      },
      {
        q: 'How long does it take to get permanent residence?',
        a: 'With the Blue Card 27 months, or 21 months with German B1. Skilled workers under §18a / §18b can usually apply after 3 years. After an Ausbildung or the Opportunity Card, the clock usually starts when you switch to a skilled worker permit.',
      },
    ],
    disclaimer: 'General information as of 2026, not legal advice. Thresholds change every 1 January; the German mission and the foreigners\' authority decide in each individual case.',
  },
  de: {
    intro:
      'Fünf häufige Wege nach Deutschland im direkten Vergleich: Voraussetzungen, nötige Deutschkenntnisse, ob ein Jobangebot nötig ist, Gehaltsgrenzen, Familie und der Weg zur Niederlassungserlaubnis. Beantworten Sie sechs kurze Fragen, und wir schlagen Ihnen die passenden Wege vor.',
    caption: 'Aufenthaltswege für Fachkräfte und Familien im Vergleich (2026)',
    criterion: 'Kriterium',
    routes: {
      chancenkarte: 'Chancenkarte (§ 20a)',
      blueCard: 'Blaue Karte EU (§ 18g)',
      ausbildung: 'Ausbildung (§ 16a)',
      skilled18a: 'Fachkraft mit Berufsausbildung (§ 18a)',
      family: 'Familiennachzug (§§ 27–36)',
    },
    criteria: {
      requirements: 'Voraussetzungen',
      german: 'Deutschkenntnisse',
      jobOffer: 'Jobangebot nötig?',
      salary: 'Gehaltsgrenze',
      duration: 'Dauer',
      family: 'Familie',
      permanent: 'Weg zur Niederlassungserlaubnis',
      processing: 'Bearbeitungszeit',
    },
    cells: {
      chancenkarte: {
        requirements: 'Im Herkunftsland anerkannter Hochschul- oder mindestens zweijähriger Berufsabschluss und 6 Punkte — ohne Punkte bei voller Anerkennung in Deutschland; Finanzierungsnachweis und Krankenversicherung',
        german: 'Deutsch A1 oder Englisch B2',
        jobOffer: 'Nein — Sie suchen in Deutschland',
        salary: 'Keine Grenze; stattdessen Finanzierungsnachweis (2025: 1.091 € pro Monat)',
        duration: 'Bis zu 12 Monate; mit Jobangebot Folge-Chancenkarte bis zu 2 Jahre möglich',
        family: 'Nicht vorgesehen — die Familie folgt meist nach dem Wechsel in einen Arbeitstitel',
        permanent: 'Nach der Jobsuche Wechsel in § 18a, § 18b oder die Blaue Karte, dann deren Weg',
        processing: 'Wenige Wochen bis mehrere Monate, je nach Auslandsvertretung',
      },
      blueCard: {
        requirements: 'Anerkannter oder vergleichbarer Hochschulabschluss (IT: 3 Jahre Berufserfahrung genügen) und qualifiziertes Jobangebot für mindestens 6 Monate',
        german: 'Nicht erforderlich',
        jobOffer: 'Ja',
        salary: '2026: {bcStandard} € brutto im Jahr; {bcShortage} € für Engpassberufe und Berufseinsteiger',
        duration: 'Vertragsdauer plus 3 Monate, höchstens 4 Jahre',
        family: 'Ja — Ehepartner brauchen kein A1 und dürfen uneingeschränkt arbeiten',
        permanent: 'Niederlassungserlaubnis nach 27 Monaten, mit Deutsch B1 nach 21 Monaten',
        processing: 'Oft 1–3 Monate nach dem Botschaftstermin; das beschleunigte Fachkräfteverfahren (§ 81a) verkürzt',
      },
      ausbildung: {
        requirements: 'Ausbildungsvertrag mit einem deutschen Betrieb, Schulabschluss und gesicherter Lebensunterhalt',
        german: 'In der Regel B1',
        jobOffer: 'Ja — einen Ausbildungsvertrag',
        salary: 'Keine Grenze; Ausbildungsvergütung des Betriebs (Mindestvergütung 2025: 682 € im Monat, Pflege ca. 1.300 €+)',
        duration: 'Dauer der Ausbildung (2–3,5 Jahre), danach bis zu 18 Monate Jobsuche',
        family: 'Nur bei ausreichendem Einkommen und Wohnraum — mit einer Vergütung selten möglich',
        permanent: 'Nach der Prüfung Fachkräftetitel (§ 18a), Niederlassungserlaubnis nach etwa 3 weiteren Jahren',
        processing: 'Etwa 1–3 Monate nach dem Botschaftstermin',
      },
      skilled18a: {
        requirements: 'In Deutschland anerkannte Berufsausbildung (Anerkennung) und konkretes Jobangebot in einer qualifizierten Beschäftigung',
        german: 'Kein gesetzliches Minimum; praktisch A2–B1, reglementierte Berufe wie Pflege B1–B2',
        jobOffer: 'Ja',
        salary: 'Keine allgemeine Grenze; Erstantragsteller ab 45 brauchen {olderWorker} € im Jahr (2026) oder eine angemessene Altersvorsorge',
        duration: 'Bis zu 4 Jahre, an den Arbeitsvertrag gebunden',
        family: 'Ja — für Ehepartner in der Regel ohne A1; Einkommen und Wohnraum müssen reichen',
        permanent: 'Niederlassungserlaubnis nach 3 Jahren Fachkrafttätigkeit (mit Rentenbeiträgen und Deutsch B1)',
        processing: '1–4 Monate; die Anerkennung vorher dauert oft weitere 2–4 Monate',
      },
      family: {
        requirements: 'Der Angehörige in Deutschland hat einen passenden Titel, ausreichendes Einkommen für alle und genügend Wohnraum; gültige Ehe, beide mindestens 18',
        german: 'A1 für viele Ehepartner — nicht für Partner von Blue-Card-Inhabern und den meisten Fachkräften; Kinder unter 16 ohne',
        jobOffer: 'Nein',
        salary: 'Keine feste Grenze; das Nettoeinkommen muss den Bedarf der Familie decken',
        duration: 'In der Regel so lange wie der Titel des Stammberechtigten',
        family: 'Der Familienweg: Ehepartner, minderjährige Kinder; Eltern nur bei Fachkräften mit Titel ab 1. März 2024',
        permanent: 'Eigene Niederlassungserlaubnis meist nach 3–5 Jahren, je nach Status des Stammberechtigten',
        processing: 'Oft 1–3 Monate, bei stark ausgelasteten Vertretungen länger',
      },
    },
    faq: [
      {
        q: 'Welcher Weg passt, wenn ich noch kein Jobangebot habe?',
        a: 'Mit der Chancenkarte können Sie bis zu einem Jahr ohne Angebot in Deutschland eine Stelle suchen, wenn Sie 6 Punkte erreichen oder Ihr Abschluss voll anerkannt ist. Für junge Menschen mit Deutsch B1 ist auch ein Visum zur Suche eines Ausbildungsplatzes (bis zu 9 Monate) möglich.',
      },
      {
        q: 'Brauche ich für die Blaue Karte EU Deutschkenntnisse?',
        a: 'Nein. Für die Blaue Karte gibt es keine Sprachvoraussetzung. Nötig sind ein anerkannter oder vergleichbarer Hochschulabschluss und ein Jobangebot über der Gehaltsgrenze (2026: {bcStandard} €, in Engpassberufen {bcShortage} €). Mit Deutsch B1 verkürzt sich der Weg zur Niederlassungserlaubnis von 27 auf 21 Monate.',
      },
      {
        q: 'Kann meine Familie mitkommen?',
        a: 'Mit der Blauen Karte oder einem Fachkräftetitel (§ 18a / § 18b) können Ehepartner und Kinder nachziehen; Ehepartner von Blue-Card-Inhabern brauchen kein A1. Mit der Chancenkarte und während der Ausbildung ist Familiennachzug nur bei ausreichendem Einkommen und Wohnraum möglich — das ist selten der Fall.',
      },
      {
        q: 'Was ist der Unterschied zwischen § 18a und der Blauen Karte?',
        a: '§ 18a gilt für Fachkräfte mit anerkannter Berufsausbildung und hat keine feste Gehaltsgrenze (außer für Erstantragsteller ab 45). Die Blaue Karte ist für Akademiker mit einem Gehalt über der Grenze und bietet eine schnellere Niederlassungserlaubnis und leichteren Familiennachzug.',
      },
      {
        q: 'Wie lange dauert es bis zur Niederlassungserlaubnis?',
        a: 'Mit der Blauen Karte 27 Monate, mit Deutsch B1 21 Monate. Fachkräfte nach § 18a / § 18b können meist nach 3 Jahren beantragen. Nach einer Ausbildung oder der Chancenkarte beginnt die Frist in der Regel mit dem Wechsel in einen Fachkräftetitel.',
      },
    ],
    disclaimer: 'Allgemeine Informationen, Stand 2026, keine Rechtsberatung. Gehaltsgrenzen ändern sich jeweils zum 1. Januar; im Einzelfall entscheiden die Auslandsvertretung und die Ausländerbehörde.',
  },
  az: {
    intro:
      'Almaniyaya beş əsas leqal yol yan-yana: hər birinin tələbləri, lazım olan alman dili səviyyəsi, iş təklifinin lazım olub-olmaması, maaş həddi, ailə imkanları və daimi yaşayışa gedən yol. Altı qısa suala cavab verin, sizə ən uyğun yolları təklif edək.',
    caption: 'İşçilər və ailələr üçün Almaniya yaşayış yollarının müqayisəsi (2026)',
    criterion: 'Meyar',
    routes: {
      chancenkarte: 'İmkan Kartı (Chancenkarte, §20a)',
      blueCard: 'AB Mavi Kartı (§18g)',
      ausbildung: 'Ausbildung — peşə təhsili (§16a)',
      skilled18a: 'Peşə təhsilli mütəxəssis (§18a)',
      family: 'Ailə birləşməsi (§§27–36)',
    },
    criteria: {
      requirements: 'Tələblər',
      german: 'Alman dili',
      jobOffer: 'İş təklifi lazımdır?',
      salary: 'Maaş həddi',
      duration: 'Müddət',
      family: 'Ailə',
      permanent: 'Daimi yaşayışa yol',
      processing: 'Baxılma müddəti',
    },
    cells: {
      chancenkarte: {
        requirements: 'Öz ölkənizdə tanınan ali və ya ən azı 2 illik peşə təhsili və 6 xal — Almaniyada tam tanınma varsa xal lazım deyil; maliyyə sübutu və tibbi sığorta',
        german: 'Alman dili A1 və ya ingilis dili B2',
        jobOffer: 'Xeyr — işi Almaniyada axtarırsınız',
        salary: 'Hədd yoxdur; əvəzində maliyyə sübutu (2025: ayda 1 091 €)',
        duration: '12 aya qədər; iş təklifi ilə 2 ilə qədər növbəti kart mümkündür',
        family: 'Nəzərdə tutulmayıb — ailə adətən iş icazəsinə keçiddən sonra gəlir',
        permanent: 'İş tapdıqdan sonra §18a, §18b və ya Mavi Karta keçid, sonra onların yolu',
        processing: 'Səfirlikdən asılı olaraq bir neçə həftədən bir neçə aya qədər',
      },
      blueCard: {
        requirements: 'Tanınmış və ya müqayisəli ali təhsil (İT: 3 il təcrübə əvəz edə bilər) və ən azı 6 aylıq ixtisaslı iş təklifi',
        german: 'Tələb olunmur',
        jobOffer: 'Bəli',
        salary: '2026: ildə {bcStandard} € brutto; çatışmayan peşələr və yeni məzunlar üçün {bcShortage} €',
        duration: 'Müqavilə müddəti üstəgəl 3 ay, ən çox 4 il',
        family: 'Bəli — həyat yoldaşına A1 lazım deyil və məhdudiyyətsiz işləyə bilər',
        permanent: '27 aydan sonra daimi yaşayış icazəsi, alman dili B1 ilə 21 aydan sonra',
        processing: 'Səfirlik görüşündən sonra çox vaxt 1–3 ay; sürətləndirilmiş prosedur (§81a) müddəti qısaldır',
      },
      ausbildung: {
        requirements: 'Alman şirkəti ilə təhsil müqaviləsi, məktəb attestatı və təmin olunmuş yaşayış xərcləri',
        german: 'Adətən B1',
        jobOffer: 'Bəli — təhsil müqaviləsi',
        salary: 'Hədd yoxdur; şirkət təqaüd ödəyir (2025 qanuni minimum: ayda 682 €, tibb bacılığında təxminən 1 300 €+)',
        duration: 'Təhsil müddəti (2–3,5 il), sonra iş axtarmaq üçün 18 aya qədər',
        family: 'Yalnız gəlir və yaşayış sahəsi kifayət edərsə — təqaüdlə nadir hallarda mümkündür',
        permanent: 'Yekun imtahandan sonra mütəxəssis icazəsi (§18a), təxminən daha 3 ildən sonra daimi yaşayış',
        processing: 'Səfirlik görüşündən sonra təxminən 1–3 ay',
      },
      skilled18a: {
        requirements: 'Almaniyada tanınmış peşə təhsili (Anerkennung) və ixtisaslı vəzifə üçün konkret iş təklifi',
        german: 'Qanuni minimum yoxdur; praktikada A2–B1, tibb bacılığı kimi tənzimlənən peşələrdə B1–B2',
        jobOffer: 'Bəli',
        salary: 'Ümumi hədd yoxdur; ilk dəfə müraciət edən 45+ yaşlılara ildə {olderWorker} € (2026) və ya kifayət qədər pensiya təminatı lazımdır',
        duration: '4 ilə qədər, əmək müqaviləsinə bağlıdır',
        family: 'Bəli — həyat yoldaşı üçün adətən A1-siz; gəlir və yaşayış sahəsi kifayət etməlidir',
        permanent: 'Mütəxəssis kimi 3 il işlədikdən sonra daimi yaşayış (pensiya ayırmaları və B1 alman dili ilə)',
        processing: '1–4 ay; öncəki tanınma çox vaxt əlavə 2–4 ay çəkir',
      },
      family: {
        requirements: 'Almaniyadakı ailə üzvünün uyğun icazəsi, hamı üçün kifayət edən gəliri və yaşayış sahəsi var; etibarlı nikah, hər iki tərəf 18+',
        german: 'Bir çox həyat yoldaşı üçün A1 — Mavi Kart sahiblərinin və əksər mütəxəssislərin yoldaşları üçün yox; 16 yaşadək uşaqlara lazım deyil',
        jobOffer: 'Xeyr',
        salary: 'Sabit hədd yoxdur; ailə başçısının xalis gəliri ailənin ehtiyaclarını ödəməlidir',
        duration: 'Adətən Almaniyadakı ailə üzvünün icazəsi qədər',
        family: 'Ailə yolunun özüdür: həyat yoldaşı, yetkinlik yaşına çatmamış uşaqlar; valideynlər yalnız 1 mart 2024-dən icazə almış mütəxəssislər üçün',
        permanent: 'Öz daimi yaşayış icazəsi adətən 3–5 ildən sonra, ailə üzvünün statusundan asılı olaraq',
        processing: 'Çox vaxt 1–3 ay, yüklü səfirliklərdə daha uzun',
      },
    },
    faq: [
      {
        q: 'Hələ iş təklifim yoxdursa, hansı yol uyğundur?',
        a: 'İmkan Kartı (Chancenkarte) ilə 6 xal toplayırsınızsa və ya diplomunuz tam tanınıbsa, iş təklifi olmadan bir ilə qədər Almaniyada iş axtara bilərsiniz. Alman dili B1 olan gənclər üçün təhsil yeri axtarmaq vizası (9 aya qədər) da mümkündür.',
      },
      {
        q: 'Mavi Kart üçün alman dili lazımdırmı?',
        a: 'Xeyr. Mavi Kart üçün dil tələbi yoxdur. Tanınmış və ya müqayisəli ali təhsil və maaş həddindən yuxarı iş təklifi lazımdır (2026: {bcStandard} €, çatışmayan peşələrdə {bcShortage} €). B1 alman dili daimi yaşayışa yolu 27 aydan 21 aya qısaldır.',
      },
      {
        q: 'Ailəm mənimlə gələ bilərmi?',
        a: 'Mavi Kart və ya mütəxəssis icazəsi (§18a / §18b) ilə həyat yoldaşınız və uşaqlarınız gələ bilər; Mavi Kart sahiblərinin yoldaşlarına A1 lazım deyil. İmkan Kartı ilə və Ausbildung zamanı ailə birləşməsi yalnız gəlir və yaşayış sahəsi kifayət edərsə mümkündür — bu nadir hallarda olur.',
      },
      {
        q: '§18a ilə Mavi Kart arasında fərq nədir?',
        a: '§18a tanınmış peşə təhsili olan mütəxəssislər üçündür və sabit maaş həddi yoxdur (45+ yaşda ilk dəfə müraciət edənlər istisna). Mavi Kart maaşı həddən yuxarı olan ali təhsillilər üçündür, daha tez daimi yaşayış və asan ailə birləşməsi verir.',
      },
      {
        q: 'Daimi yaşayış icazəsini almaq nə qədər çəkir?',
        a: 'Mavi Kartla 27 ay, B1 alman dili ilə 21 ay. §18a / §18b üzrə mütəxəssislər adətən 3 ildən sonra müraciət edə bilər. Ausbildung və ya İmkan Kartından sonra müddət adətən mütəxəssis icazəsinə keçiddən başlayır.',
      },
    ],
    disclaimer: '2026-cı il üzrə ümumi məlumatdır, hüquqi məsləhət deyil. Maaş hədləri hər il 1 yanvarda dəyişir; hər konkret halda səfirlik və əcnəbilər idarəsi qərar verir.',
  },
  ru: {
    intro:
      'Пять распространённых легальных путей в Германию рядом: требования, нужный уровень немецкого, нужен ли оффер, пороги зарплаты, возможности для семьи и путь к ПМЖ. Ответьте на шесть коротких вопросов — и мы подскажем, какие пути подходят вам лучше всего.',
    caption: 'Сравнение путей переезда в Германию для специалистов и семей (2026)',
    criterion: 'Критерий',
    routes: {
      chancenkarte: 'Карта возможностей (Chancenkarte, §20a)',
      blueCard: 'Голубая карта ЕС (§18g)',
      ausbildung: 'Ausbildung — профобучение (§16a)',
      skilled18a: 'Специалист с профобразованием (§18a)',
      family: 'Воссоединение семьи (§§27–36)',
    },
    criteria: {
      requirements: 'Требования',
      german: 'Уровень немецкого',
      jobOffer: 'Нужен оффер?',
      salary: 'Порог зарплаты',
      duration: 'Срок',
      family: 'Семья',
      permanent: 'Путь к ПМЖ',
      processing: 'Срок рассмотрения',
    },
    cells: {
      chancenkarte: {
        requirements: 'Признанное в вашей стране высшее или не менее чем двухлетнее профобразование и 6 баллов — без баллов при полном признании в Германии; подтверждение средств и страховка',
        german: 'Немецкий A1 или английский B2',
        jobOffer: 'Нет — работу ищут в Германии',
        salary: 'Порога нет; вместо него подтверждение средств (2025: 1 091 € в месяц)',
        duration: 'До 12 месяцев; при наличии оффера — продление до 2 лет',
        family: 'Не предусмотрено — семья обычно приезжает после перехода на рабочий ВНЖ',
        permanent: 'После поиска работы — переход на §18a, §18b или Голубую карту и их путь',
        processing: 'От нескольких недель до нескольких месяцев, в зависимости от посольства',
      },
      blueCard: {
        requirements: 'Признанный или сопоставимый диплом вуза (в IT его заменяют 3 года опыта) и квалифицированный оффер минимум на 6 месяцев',
        german: 'Не требуется',
        jobOffer: 'Да',
        salary: '2026: {bcStandard} € брутто в год; {bcShortage} € для дефицитных профессий и молодых специалистов',
        duration: 'Срок контракта плюс 3 месяца, максимум 4 года',
        family: 'Да — супругу не нужен A1, он(а) может работать без ограничений',
        permanent: 'ПМЖ через 27 месяцев, с немецким B1 — через 21 месяц',
        processing: 'Часто 1–3 месяца после записи в посольство; ускоренная процедура (§81a) сокращает срок',
      },
      ausbildung: {
        requirements: 'Договор на обучение с немецкой компанией, школьный аттестат и обеспеченное проживание',
        german: 'Как правило, B1',
        jobOffer: 'Да — договор на обучение',
        salary: 'Порога нет; компания платит стипендию (законный минимум 2025: 682 € в месяц, в уходе за больными ок. 1 300 €+)',
        duration: 'Срок обучения (2–3,5 года), затем до 18 месяцев на поиск работы',
        family: 'Только при достаточном доходе и жилье — на стипендию это редко возможно',
        permanent: 'После экзамена — ВНЖ специалиста (§18a), ПМЖ примерно ещё через 3 года',
        processing: 'Около 1–3 месяцев после записи в посольство',
      },
      skilled18a: {
        requirements: 'Профобразование, признанное в Германии (Anerkennung), и конкретный оффер на квалифицированную работу',
        german: 'Законного минимума нет; на практике A2–B1, в регулируемых профессиях (уход за больными) B1–B2',
        jobOffer: 'Да',
        salary: 'Общего порога нет; впервые подающим в 45+ нужно {olderWorker} € в год (2026) или достаточное пенсионное обеспечение',
        duration: 'До 4 лет, привязано к трудовому договору',
        family: 'Да — супругу, как правило, без A1; доход и жильё должны быть достаточными',
        permanent: 'ПМЖ после 3 лет работы специалистом (с пенсионными взносами и немецким B1)',
        processing: '1–4 месяца; признание диплома до этого часто занимает ещё 2–4 месяца',
      },
      family: {
        requirements: 'Родственник в Германии имеет подходящий ВНЖ, достаточный доход на всех и жильё нужной площади; действительный брак, обоим 18+',
        german: 'A1 для многих супругов — не нужен супругам владельцев Голубой карты и большинства специалистов; детям до 16 не нужен',
        jobOffer: 'Нет',
        salary: 'Фиксированного порога нет; чистый доход должен покрывать потребности семьи',
        duration: 'Обычно на срок ВНЖ родственника в Германии',
        family: 'Это и есть семейный путь: супруг(а), несовершеннолетние дети; родители — только у специалистов с ВНЖ с 1 марта 2024',
        permanent: 'Собственное ПМЖ обычно через 3–5 лет, в зависимости от статуса родственника',
        processing: 'Часто 1–3 месяца, в загруженных посольствах дольше',
      },
    },
    faq: [
      {
        q: 'Какой путь подходит, если у меня ещё нет оффера?',
        a: 'Карта возможностей (Chancenkarte) позволяет искать работу в Германии до года без оффера, если вы набираете 6 баллов или ваш диплом полностью признан. Молодым людям с немецким B1 подходит и виза для поиска места обучения (до 9 месяцев).',
      },
      {
        q: 'Нужен ли немецкий для Голубой карты ЕС?',
        a: 'Нет. Языковых требований для Голубой карты нет. Нужны признанный или сопоставимый диплом и оффер выше порога зарплаты (2026: {bcStandard} €, в дефицитных профессиях {bcShortage} €). Немецкий B1 сокращает путь к ПМЖ с 27 до 21 месяца.',
      },
      {
        q: 'Может ли семья поехать со мной?',
        a: 'С Голубой картой или ВНЖ специалиста (§18a / §18b) супруг(а) и дети могут приехать к вам; супругам владельцев Голубой карты не нужен A1. С Картой возможностей и во время Ausbildung воссоединение возможно только при достаточном доходе и жилье — это бывает редко.',
      },
      {
        q: 'Чем §18a отличается от Голубой карты?',
        a: '§18a — для специалистов с признанным профобразованием, без фиксированного порога зарплаты (кроме впервые подающих в 45+). Голубая карта — для выпускников вузов с зарплатой выше порога; она даёт более быстрое ПМЖ и упрощённое воссоединение семьи.',
      },
      {
        q: 'Сколько времени до ПМЖ?',
        a: 'С Голубой картой 27 месяцев, с немецким B1 — 21 месяц. Специалисты по §18a / §18b обычно могут подать через 3 года. После Ausbildung или Карты возможностей отсчёт обычно начинается с перехода на ВНЖ специалиста.',
      },
    ],
    disclaimer: 'Общая информация на 2026 год, не юридическая консультация. Пороги меняются каждое 1 января; решение в каждом случае принимают посольство и ведомство по делам иностранцев.',
  },
  tr: {
    intro:
      'Almanya\'ya beş yaygın yasal yol yan yana: her birinin şartları, gereken Almanca seviyesi, iş teklifi gerekip gerekmediği, maaş sınırları, aile olanakları ve kalıcı oturuma giden yol. Altı kısa soruyu yanıtlayın, size en uygun yolları önerelim.',
    caption: 'Çalışanlar ve aileler için Almanya oturum yollarının karşılaştırması (2026)',
    criterion: 'Kriter',
    routes: {
      chancenkarte: 'Fırsat Kartı (Chancenkarte, §20a)',
      blueCard: 'AB Mavi Kart (§18g)',
      ausbildung: 'Ausbildung — mesleki eğitim (§16a)',
      skilled18a: 'Mesleki eğitimli nitelikli işçi (§18a)',
      family: 'Aile birleşimi (§§27–36)',
    },
    criteria: {
      requirements: 'Şartlar',
      german: 'Almanca seviyesi',
      jobOffer: 'İş teklifi gerekli mi?',
      salary: 'Maaş sınırı',
      duration: 'Süre',
      family: 'Aile',
      permanent: 'Kalıcı oturuma yol',
      processing: 'İşlem süresi',
    },
    cells: {
      chancenkarte: {
        requirements: 'Kendi ülkenizde tanınan üniversite veya en az 2 yıllık meslek eğitimi ve 6 puan — Almanya\'da tam denklik varsa puan gerekmez; geçim kanıtı ve sağlık sigortası',
        german: 'Almanca A1 veya İngilizce B2',
        jobOffer: 'Hayır — işi Almanya\'da ararsınız',
        salary: 'Sınır yok; bunun yerine geçim kanıtı (2025: ayda 1.091 €)',
        duration: '12 aya kadar; iş teklifiyle 2 yıla kadar devam kartı mümkün',
        family: 'Öngörülmemiş — aile genellikle çalışma iznine geçişten sonra gelir',
        permanent: 'İş bulunca §18a, §18b veya Mavi Kart\'a geçiş, ardından onların yolu',
        processing: 'Temsilciliğe göre birkaç haftadan birkaç aya kadar',
      },
      blueCard: {
        requirements: 'Tanınan veya denk üniversite diploması (BT: 3 yıl deneyim yerine geçebilir) ve en az 6 aylık nitelikli iş teklifi',
        german: 'Gerekmez',
        jobOffer: 'Evet',
        salary: '2026: yıllık brüt {bcStandard} €; eleman açığı olan meslekler ve yeni mezunlar için {bcShortage} €',
        duration: 'Sözleşme süresi artı 3 ay, en fazla 4 yıl',
        family: 'Evet — eşin A1 Almancaya ihtiyacı yok ve kısıtlamasız çalışabilir',
        permanent: '27 ay sonra kalıcı oturum, Almanca B1 ile 21 ay sonra',
        processing: 'Konsolosluk randevusundan sonra çoğu zaman 1–3 ay; hızlandırılmış prosedür (§81a) süreyi kısaltır',
      },
      ausbildung: {
        requirements: 'Alman bir şirketle eğitim sözleşmesi, okul diploması ve güvence altına alınmış geçim',
        german: 'Genellikle B1',
        jobOffer: 'Evet — eğitim sözleşmesi',
        salary: 'Sınır yok; şirket eğitim ücreti öder (2025 yasal asgari: ayda 682 €, hemşirelikte yaklaşık 1.300 €+)',
        duration: 'Eğitim süresi (2–3,5 yıl), ardından iş aramak için 18 aya kadar',
        family: 'Yalnızca gelir ve konut yeterliyse — eğitim ücretiyle nadiren mümkün',
        permanent: 'Bitirme sınavından sonra nitelikli işçi izni (§18a), yaklaşık 3 yıl sonra kalıcı oturum',
        processing: 'Konsolosluk randevusundan sonra yaklaşık 1–3 ay',
      },
      skilled18a: {
        requirements: 'Almanya\'da tanınan mesleki eğitim (Anerkennung) ve nitelikli bir iş için somut teklif',
        german: 'Yasal asgari yok; pratikte A2–B1, hemşirelik gibi düzenlenmiş mesleklerde B1–B2',
        jobOffer: 'Evet',
        salary: 'Genel sınır yok; ilk kez başvuran 45 yaş üstü kişiler için yıllık {olderWorker} € (2026) veya yeterli emeklilik güvencesi',
        duration: '4 yıla kadar, iş sözleşmesine bağlı',
        family: 'Evet — eş için genellikle A1 gerekmez; gelir ve konut yeterli olmalı',
        permanent: 'Nitelikli işçi olarak 3 yıl sonra kalıcı oturum (emeklilik primleri ve Almanca B1 ile)',
        processing: '1–4 ay; öncesindeki denklik çoğu zaman 2–4 ay daha sürer',
      },
      family: {
        requirements: 'Almanya\'daki aile üyesinin uygun bir izni, herkese yetecek geliri ve yeterli konutu var; geçerli evlilik, iki taraf da 18+',
        german: 'Birçok eş için A1 — Mavi Kart sahiplerinin ve çoğu nitelikli işçinin eşleri için gerekmez; 16 yaş altı çocuklara gerekmez',
        jobOffer: 'Hayır',
        salary: 'Sabit sınır yok; net gelir ailenin ihtiyaçlarını karşılamalı',
        duration: 'Genellikle Almanya\'daki aile üyesinin izni kadar',
        family: 'Aile yolunun kendisi: eş, reşit olmayan çocuklar; ebeveynler yalnızca 1 Mart 2024\'ten itibaren izin almış nitelikli işçiler için',
        permanent: 'Kendi kalıcı oturumu genellikle 3–5 yıl sonra, aile üyesinin statüsüne göre',
        processing: 'Çoğu zaman 1–3 ay, yoğun temsilciliklerde daha uzun',
      },
    },
    faq: [
      {
        q: 'Henüz iş teklifim yoksa hangi yol uygun?',
        a: 'Fırsat Kartı (Chancenkarte) ile 6 puana ulaşırsanız veya diplomanız tam tanınmışsa iş teklifi olmadan bir yıla kadar Almanya\'da iş arayabilirsiniz. Almancası B1 olan gençler için eğitim yeri arama vizesi (9 aya kadar) de bir seçenektir.',
      },
      {
        q: 'AB Mavi Kart için Almanca gerekli mi?',
        a: 'Hayır. Mavi Kart için dil şartı yoktur. Tanınan veya denk bir üniversite diploması ve maaş sınırının üzerinde bir iş teklifi gerekir (2026: {bcStandard} €, eleman açığı olan mesleklerde {bcShortage} €). Almanca B1, kalıcı oturuma giden yolu 27 aydan 21 aya kısaltır.',
      },
      {
        q: 'Ailem benimle gelebilir mi?',
        a: 'Mavi Kart veya nitelikli işçi izniyle (§18a / §18b) eşiniz ve çocuklarınız yanınıza gelebilir; Mavi Kart sahiplerinin eşlerinin A1\'e ihtiyacı yoktur. Fırsat Kartı ile ve Ausbildung sırasında aile birleşimi yalnızca gelir ve konut yeterliyse mümkündür — bu nadiren olur.',
      },
      {
        q: '§18a ile Mavi Kart arasındaki fark nedir?',
        a: '§18a tanınan mesleki eğitimi olan nitelikli işçiler içindir ve sabit maaş sınırı yoktur (ilk kez başvuran 45 yaş üstü kişiler hariç). Mavi Kart, maaşı sınırın üzerinde olan üniversite mezunları içindir; daha hızlı kalıcı oturum ve kolay aile birleşimi sağlar.',
      },
      {
        q: 'Kalıcı oturum ne kadar sürede alınır?',
        a: 'Mavi Kart ile 27 ay, Almanca B1 ile 21 ay. §18a / §18b kapsamındaki nitelikli işçiler genellikle 3 yıl sonra başvurabilir. Ausbildung veya Fırsat Kartı sonrasında süre genellikle nitelikli işçi iznine geçişle başlar.',
      },
    ],
    disclaimer: '2026 itibarıyla genel bilgidir, hukuki danışmanlık değildir. Sınırlar her yıl 1 Ocak\'ta değişir; her somut durumda temsilcilik ve yabancılar dairesi karar verir.',
  },
  uk: {
    intro:
      'П’ять поширених легальних шляхів до Німеччини поруч: вимоги, потрібний рівень німецької, чи потрібна пропозиція роботи, пороги зарплати, можливості для сім’ї та шлях до постійного проживання. Дайте відповідь на шість коротких запитань — і ми підкажемо, які шляхи вам підходять найкраще.',
    caption: 'Порівняння шляхів переїзду до Німеччини для фахівців і сімей (2026)',
    criterion: 'Критерій',
    routes: {
      chancenkarte: 'Карта можливостей (Chancenkarte, §20a)',
      blueCard: 'Блакитна карта ЄС (§18g)',
      ausbildung: 'Ausbildung — профнавчання (§16a)',
      skilled18a: 'Фахівець із профосвітою (§18a)',
      family: 'Возз’єднання сім’ї (§§27–36)',
    },
    criteria: {
      requirements: 'Вимоги',
      german: 'Рівень німецької',
      jobOffer: 'Потрібна пропозиція роботи?',
      salary: 'Поріг зарплати',
      duration: 'Термін',
      family: 'Сім’я',
      permanent: 'Шлях до постійного проживання',
      processing: 'Термін розгляду',
    },
    cells: {
      chancenkarte: {
        requirements: 'Визнана у вашій країні вища або щонайменше дворічна професійна освіта і 6 балів — без балів у разі повного визнання в Німеччині; підтвердження коштів і медичне страхування',
        german: 'Німецька A1 або англійська B2',
        jobOffer: 'Ні — роботу шукають у Німеччині',
        salary: 'Порогу немає; натомість підтвердження коштів (2025: 1 091 € на місяць)',
        duration: 'До 12 місяців; з пропозицією роботи — продовження до 2 років',
        family: 'Не передбачено — сім’я зазвичай приїжджає після переходу на робочий дозвіл',
        permanent: 'Після пошуку роботи — перехід на §18a, §18b або Блакитну карту та їхній шлях',
        processing: 'Від кількох тижнів до кількох місяців, залежно від посольства',
      },
      blueCard: {
        requirements: 'Визнаний або порівнянний диплом університету (в IT його замінюють 3 роки досвіду) і кваліфікована пропозиція роботи щонайменше на 6 місяців',
        german: 'Не потрібна',
        jobOffer: 'Так',
        salary: '2026: {bcStandard} € брутто на рік; {bcShortage} € для дефіцитних професій і молодих фахівців',
        duration: 'Строк контракту плюс 3 місяці, максимум 4 роки',
        family: 'Так — подружжю не потрібен A1, і воно може працювати без обмежень',
        permanent: 'Дозвіл на постійне проживання через 27 місяців, із німецькою B1 — через 21 місяць',
        processing: 'Часто 1–3 місяці після запису в посольство; прискорена процедура (§81a) скорочує строк',
      },
      ausbildung: {
        requirements: 'Договір на навчання з німецькою компанією, шкільний атестат і забезпечене проживання',
        german: 'Зазвичай B1',
        jobOffer: 'Так — договір на навчання',
        salary: 'Порогу немає; компанія платить стипендію (законний мінімум 2025: 682 € на місяць, у догляді близько 1 300 €+)',
        duration: 'Тривалість навчання (2–3,5 роки), потім до 18 місяців на пошук роботи',
        family: 'Лише за достатнього доходу й житла — зі стипендією це рідко можливо',
        permanent: 'Після іспиту — дозвіл фахівця (§18a), постійне проживання приблизно ще через 3 роки',
        processing: 'Близько 1–3 місяців після запису в посольство',
      },
      skilled18a: {
        requirements: 'Професійна освіта, визнана в Німеччині (Anerkennung), і конкретна пропозиція кваліфікованої роботи',
        german: 'Законного мінімуму немає; на практиці A2–B1, у регульованих професіях (догляд) B1–B2',
        jobOffer: 'Так',
        salary: 'Загального порогу немає; тим, хто вперше подається у 45+, потрібно {olderWorker} € на рік (2026) або достатнє пенсійне забезпечення',
        duration: 'До 4 років, прив’язано до трудового договору',
        family: 'Так — для подружжя, як правило, без A1; дохід і житло мають бути достатніми',
        permanent: 'Постійне проживання після 3 років роботи фахівцем (із пенсійними внесками та німецькою B1)',
        processing: '1–4 місяці; визнання до цього часто триває ще 2–4 місяці',
      },
      family: {
        requirements: 'Родич у Німеччині має відповідний дозвіл, достатній дохід на всіх і житло потрібної площі; дійсний шлюб, обом 18+',
        german: 'A1 для багатьох із подружжя — не потрібен подружжю власників Блакитної карти та більшості фахівців; дітям до 16 не потрібен',
        jobOffer: 'Ні',
        salary: 'Фіксованого порогу немає; чистий дохід має покривати потреби сім’ї',
        duration: 'Зазвичай на строк дозволу родича в Німеччині',
        family: 'Це і є сімейний шлях: подружжя, неповнолітні діти; батьки — лише у фахівців із дозволом від 1 березня 2024',
        permanent: 'Власний дозвіл на постійне проживання зазвичай через 3–5 років, залежно від статусу родича',
        processing: 'Часто 1–3 місяці, у завантажених посольствах довше',
      },
    },
    faq: [
      {
        q: 'Який шлях підходить, якщо в мене ще немає пропозиції роботи?',
        a: 'Карта можливостей (Chancenkarte) дає змогу шукати роботу в Німеччині до року без пропозиції, якщо ви набираєте 6 балів або ваш диплом повністю визнано. Молодим людям із німецькою B1 підходить і віза для пошуку місця навчання (до 9 місяців).',
      },
      {
        q: 'Чи потрібна німецька для Блакитної карти ЄС?',
        a: 'Ні. Мовних вимог для Блакитної карти немає. Потрібні визнаний або порівнянний диплом і пропозиція роботи вище порогу зарплати (2026: {bcStandard} €, у дефіцитних професіях {bcShortage} €). Німецька B1 скорочує шлях до постійного проживання з 27 до 21 місяця.',
      },
      {
        q: 'Чи може сім’я поїхати зі мною?',
        a: 'З Блакитною картою або дозволом фахівця (§18a / §18b) подружжя й діти можуть приїхати до вас; подружжю власників Блакитної карти не потрібен A1. З Картою можливостей і під час Ausbildung возз’єднання можливе лише за достатнього доходу й житла — це трапляється рідко.',
      },
      {
        q: 'Чим §18a відрізняється від Блакитної карти?',
        a: '§18a — для фахівців із визнаною професійною освітою, без фіксованого порогу зарплати (крім тих, хто вперше подається у 45+). Блакитна карта — для випускників університетів із зарплатою вище порогу; вона дає швидше постійне проживання й простіше возз’єднання сім’ї.',
      },
      {
        q: 'Скільки часу до постійного проживання?',
        a: 'З Блакитною картою 27 місяців, із німецькою B1 — 21 місяць. Фахівці за §18a / §18b зазвичай можуть подаватися через 3 роки. Після Ausbildung або Карти можливостей відлік зазвичай починається з переходу на дозвіл фахівця.',
      },
    ],
    disclaimer: 'Загальна інформація станом на 2026 рік, не юридична консультація. Пороги змінюються щороку 1 січня; рішення в кожному випадку ухвалюють посольство та відомство у справах іноземців.',
  },
};

export interface CompareThresholds {
  year: string;
  standard: number;
  shortage: number;
  olderWorker: number | null;
}

const NUMBER_LOCALE: Record<SeoLocale, string> = { az: 'az-Latn-AZ', de: 'de-DE', en: 'en-GB', ru: 'ru-RU', tr: 'tr-TR', uk: 'uk-UA' };

/** 50700 → "50,700" / "50.700" / "50 700"; 45934.2 → two decimals. */
export const formatAmount = (n: number, lng: SeoLocale) =>
  new Intl.NumberFormat(NUMBER_LOCALE[lng], Number.isInteger(n) ? { maximumFractionDigits: 0 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

export const fillThresholds = (s: string, t: CompareThresholds, lng: SeoLocale) =>
  s
    .replace(/\{bcStandard\}/g, formatAmount(t.standard, lng))
    .replace(/\{bcShortage\}/g, formatAmount(t.shortage, lng))
    .replace(/\{olderWorker\}/g, t.olderWorker != null ? formatAmount(t.olderWorker, lng) : '—');

export interface CompareContent {
  lng: SeoLocale;
  year: string;
  intro: string;
  caption: string;
  criterion: string;
  disclaimer: string;
  routes: { key: CompareRoute; name: string; jobOffer: 'yes' | 'no'; guideKey: string; tool: string | null; cells: Record<CompareCriterion, string> }[];
  criteria: { key: CompareCriterion; label: string }[];
  faq: { q: string; a: string }[];
}

/** The comparison in one language with the current thresholds filled in. */
export const compareContent = (lng: SeoLocale, t: CompareThresholds): CompareContent => {
  const c = CONTENT[lng];
  const fill = (s: string) => fillThresholds(s, t, lng);
  return {
    lng,
    year: t.year,
    intro: c.intro,
    caption: c.caption,
    criterion: c.criterion,
    disclaimer: c.disclaimer,
    routes: COMPARE_ROUTES.map((key) => ({
      key,
      name: c.routes[key],
      jobOffer: JOB_OFFER[key],
      guideKey: ROUTE_LINKS[key].guide,
      tool: ROUTE_LINKS[key].tool ?? null,
      cells: Object.fromEntries(COMPARE_CRITERIA.map((k) => [k, fill(c.cells[key][k])])) as Record<CompareCriterion, string>,
    })),
    criteria: COMPARE_CRITERIA.map((key) => ({ key, label: c.criteria[key] })),
    faq: c.faq.map((f) => ({ q: f.q, a: fill(f.a) })),
  };
};

/** Thresholds of the current year from the case AI settings (same source as GET /api/seo/blue-card). */
export const currentThresholds = (s: { blueCard: Record<string, { standard: number; shortage: number }>; olderWorker: Record<string, number> }, now = new Date()): CompareThresholds => {
  const years = Object.keys(s.blueCard).sort();
  const current = String(now.getFullYear());
  const year = years.includes(current) ? current : (years[years.length - 1] ?? current);
  const bc = s.blueCard[year] ?? { standard: 50_700, shortage: 45_934.2 };
  return { year, standard: bc.standard, shortage: bc.shortage, olderWorker: s.olderWorker[year] ?? null };
};
