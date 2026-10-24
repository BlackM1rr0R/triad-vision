/**
 * Interactive calculators embedded in guide bodies with a shortcode line:
 *
 *   ::calculator{type="chancenkarte"}      (chancenkarte | blue-card | cost | salary)
 *
 * The server (markdown.ts) renders a short static description with a link to the full tool, wrapped in
 * <div class="guide-calculator" data-calculator="<type>">. That is what crawlers and no-JS readers see (seoBody);
 * the client (pages/guides/GuideDetail.tsx) replaces the placeholder with a compact live calculator.
 * Only the whitelisted types below are recognised; nothing from the shortcode is copied into the HTML except
 * the type itself.
 */

export const CALCULATOR_TYPES = ['chancenkarte', 'blue-card', 'cost', 'salary'] as const;
export type CalculatorType = (typeof CALCULATOR_TYPES)[number];

/** Site path of the full tool (without language prefix). */
export const CALCULATOR_TOOL_PATH: Record<CalculatorType, string> = {
  chancenkarte: '/chancenkarte-calculator',
  'blue-card': '/blue-card-check',
  cost: '/cost-calculator',
  salary: '/salary-calculator',
};

/** Matches a whole shortcode line (after trimming). Group 1: the type (validated separately). */
export const CALCULATOR_SHORTCODE_RE = /^::calculator\{\s*type\s*=\s*"([a-z-]{1,40})"\s*\}$/;

export const isCalculatorType = (v: string): v is CalculatorType => (CALCULATOR_TYPES as readonly string[]).includes(v);

/** The shortcode line for a type. */
export const calculatorShortcode = (type: CalculatorType) => `::calculator{type="${type}"}`;

type Copy = { title: string; text: string; cta: string };
type Lang = 'az' | 'de' | 'en' | 'ru' | 'tr' | 'uk';

const COPY: Record<Lang, Record<CalculatorType, Copy>> = {
  az: {
    chancenkarte: { title: 'Chancenkarte xal kalkulyatoru', text: 'Yaşınızı, dil biliklərinizi, təcrübənizi və ixtisasınızı daxil edin – 6 xal həddinə çatıb-çatmadığınızı dərhal görün.', cta: 'Kalkulyatoru açın' },
    'blue-card': { title: 'Mavi Kart maaş yoxlaması', text: 'Təklif olunan illik maaşı 2026-cı il hədləri ilə müqayisə edin: ümumi peşələr üçün 50 700 €, çatışmayan peşələr üçün 45 934 €.', cta: 'Maaşı yoxlayın' },
    cost: { title: 'Xərc kalkulyatoru', text: 'Viza, tərcümə, sığorta, bilet və ilk aylar üçün təxmini xərcləri hesablayın.', cta: 'Xərcləri hesablayın' },
    salary: { title: 'Maaş kalkulyatoru', text: 'Almaniyada ümumi maaşdan vergi və sosial ödənişlərdən sonra əlinizə nə qədər qalacağını görün.', cta: 'Xalis maaşı hesablayın' },
  },
  de: {
    chancenkarte: { title: 'Chancenkarte-Punkterechner', text: 'Alter, Sprachkenntnisse, Berufserfahrung und Qualifikation eingeben – sofort sehen, ob Sie die 6 Punkte erreichen.', cta: 'Rechner öffnen' },
    'blue-card': { title: 'Blaue Karte: Gehaltscheck', text: 'Vergleichen Sie das angebotene Jahresgehalt mit den Grenzen 2026: 50.700 € allgemein, 45.934 € in Engpassberufen.', cta: 'Gehalt prüfen' },
    cost: { title: 'Kostenrechner', text: 'Schätzen Sie die Kosten für Visum, Übersetzungen, Versicherung, Flug und die ersten Monate.', cta: 'Kosten berechnen' },
    salary: { title: 'Gehaltsrechner', text: 'Sehen Sie, wie viel vom Bruttogehalt nach Steuern und Sozialabgaben in Deutschland netto bleibt.', cta: 'Netto berechnen' },
  },
  en: {
    chancenkarte: { title: 'Opportunity Card points calculator', text: 'Enter your age, languages, experience and qualification – see instantly whether you reach the 6 points.', cta: 'Open the calculator' },
    'blue-card': { title: 'EU Blue Card salary check', text: 'Compare the offered annual salary with the 2026 thresholds: €50,700 in general, €45,934 in shortage occupations.', cta: 'Check the salary' },
    cost: { title: 'Cost calculator', text: 'Estimate the costs of the visa, translations, insurance, flight and your first months.', cta: 'Calculate costs' },
    salary: { title: 'Salary calculator', text: 'See how much of a gross salary in Germany is left after tax and social contributions.', cta: 'Calculate net pay' },
  },
  ru: {
    chancenkarte: { title: 'Калькулятор баллов Chancenkarte', text: 'Укажите возраст, языки, опыт и квалификацию – сразу увидите, набираете ли вы 6 баллов.', cta: 'Открыть калькулятор' },
    'blue-card': { title: 'Голубая карта: проверка зарплаты', text: 'Сравните предложенную годовую зарплату с порогами 2026 года: 50 700 € в общем случае, 45 934 € для дефицитных профессий.', cta: 'Проверить зарплату' },
    cost: { title: 'Калькулятор расходов', text: 'Оцените расходы на визу, переводы, страховку, перелёт и первые месяцы.', cta: 'Рассчитать расходы' },
    salary: { title: 'Калькулятор зарплаты', text: 'Узнайте, сколько остаётся от зарплаты брутто в Германии после налогов и соцвзносов.', cta: 'Рассчитать нетто' },
  },
  tr: {
    chancenkarte: { title: 'Fırsat Kartı puan hesaplayıcı', text: 'Yaşınızı, dillerinizi, deneyiminizi ve niteliğinizi girin – 6 puana ulaşıp ulaşmadığınızı hemen görün.', cta: 'Hesaplayıcıyı açın' },
    'blue-card': { title: 'Mavi Kart maaş kontrolü', text: 'Teklif edilen yıllık maaşı 2026 eşikleriyle karşılaştırın: genel 50.700 €, eleman açığı olan meslekler için 45.934 €.', cta: 'Maaşı kontrol edin' },
    cost: { title: 'Maliyet hesaplayıcı', text: 'Vize, tercüme, sigorta, uçuş ve ilk aylar için tahmini maliyetleri hesaplayın.', cta: 'Maliyetleri hesaplayın' },
    salary: { title: 'Maaş hesaplayıcı', text: 'Almanya’da brüt maaştan vergi ve sosyal kesintilerden sonra ne kadar kaldığını görün.', cta: 'Net maaşı hesaplayın' },
  },
  uk: {
    chancenkarte: { title: 'Калькулятор балів Chancenkarte', text: 'Вкажіть вік, мови, досвід і кваліфікацію – одразу побачите, чи набираєте ви 6 балів.', cta: 'Відкрити калькулятор' },
    'blue-card': { title: 'Блакитна карта: перевірка зарплати', text: 'Порівняйте запропоновану річну зарплату з порогами 2026 року: 50 700 € загалом, 45 934 € для дефіцитних професій.', cta: 'Перевірити зарплату' },
    cost: { title: 'Калькулятор витрат', text: 'Оцініть витрати на візу, переклади, страхування, переліт і перші місяці.', cta: 'Розрахувати витрати' },
    salary: { title: 'Калькулятор зарплати', text: 'Дізнайтеся, скільки залишається від зарплати брутто в Німеччині після податків і соцвнесків.', cta: 'Розрахувати нетто' },
  },
};

export const calculatorCopy = (type: CalculatorType, locale: string | undefined): Copy => {
  const l = (locale ?? 'en').slice(0, 2) as Lang;
  return (COPY[l] ?? COPY.en)[type];
};

/** Guide key → calculator embedded in it (seeded guides). */
export const GUIDE_CALCULATORS: Record<string, CalculatorType> = {
  chancenkarte: 'chancenkarte',
  'blue-card': 'blue-card',
  ausbildung: 'cost',
  pflege: 'salary',
};

/**
 * Inserts the calculator shortcode into a guide body unless it already contains one of that type: after the
 * first section (before the second "## " heading), or at the end when the body has fewer sections.
 * Pure (used by the seed migration step and its tests). Returns the body unchanged when nothing is to do.
 */
export const insertCalculatorShortcode = (body: string, type: CalculatorType): string => {
  const code = calculatorShortcode(type);
  const lines = body.replace(/\r\n?/g, '\n').split('\n');
  if (lines.some((l) => {
    const m = CALCULATOR_SHORTCODE_RE.exec(l.trim());
    return m !== null && m[1] === type;
  })) return body;
  const headings = lines.map((l, i) => (/^##\s/.test(l.trim()) ? i : -1)).filter((i) => i >= 0);
  if (headings.length >= 2) {
    const at = headings[1];
    const before = lines.slice(0, at);
    while (before.length && !before[before.length - 1].trim()) before.pop();
    return [...before, '', code, '', ...lines.slice(at)].join('\n');
  }
  return `${body.replace(/\s+$/, '')}\n\n${code}\n`;
};
