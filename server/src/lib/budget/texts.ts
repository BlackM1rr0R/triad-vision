import type { Household, Housing, MonthlyKey, OneOffKey } from './budget.js';

/** Copy of the budget PDF (az / de / en / ru). The page has its own copy (client/src/i18n/pagesBudget.ts). */

export const BUDGET_LANGS = ['az', 'de', 'en', 'ru'] as const;
export type BudgetLang = (typeof BUDGET_LANGS)[number];

export interface BudgetTexts {
  title: string;
  subtitle: string;
  estimate: string;
  inputs: string;
  city: string;
  gross: string;
  taxClass: string;
  church: string;
  yes: string;
  no: string;
  household: string;
  households: Record<Household, string>;
  children: string;
  housing: string;
  housings: Record<Housing, string>;
  start: string;
  arrival: string;
  firstPay: string;
  netTitle: string;
  incomeTax: string;
  soli: string;
  churchTax: string;
  pension: string;
  unemployment: string;
  health: string;
  care: string;
  net: string;
  oneOffTitle: string;
  oneOffIntro: string;
  oneOff: Record<OneOffKey, string>;
  total: string;
  monthlyTitle: string;
  monthly: Record<MonthlyKey, string>;
  costs: string;
  income: string;
  kindergeld: string;
  remaining: string;
  bringTitle: string;
  recommended: string;
  buffer: string;
  blockedTitle: string;
  blockedText: (a: { year: string; monthly: string; releases: number; released: string; besides: string }) => string;
  noBlocked: string;
  midijob: string;
  deficit: string;
  disclaimer: string;
  asOf: string;
  source: string;
  link: string;
  page: string;
  of: string;
}

const de: BudgetTexts = {
  title: 'Budget für den ersten Monat in Deutschland',
  subtitle: 'Nettogehalt, Kosten bis zum ersten Gehalt, Monatsbudget und wie viel Geld Sie mitbringen sollten',
  estimate: 'Schätzung',
  inputs: 'Ihre Angaben',
  city: 'Ort',
  gross: 'Bruttogehalt pro Monat',
  taxClass: 'Steuerklasse',
  church: 'Kirchensteuer',
  yes: 'ja',
  no: 'nein',
  household: 'Haushalt',
  households: { single: 'allein', couple: 'mit Partner/in', family: 'mit Kindern' },
  children: 'Kinder',
  housing: 'Wohnen',
  housings: { wg: 'WG-Zimmer', flat: 'eigene Wohnung', company: 'Unterkunft vom Arbeitgeber' },
  start: 'Arbeitsbeginn',
  arrival: 'Ankunft',
  firstPay: 'Erstes Gehalt (erwartet)',
  netTitle: 'Geschätztes Nettogehalt pro Monat',
  incomeTax: 'Lohnsteuer',
  soli: 'Solidaritätszuschlag',
  churchTax: 'Kirchensteuer',
  pension: 'Rentenversicherung',
  unemployment: 'Arbeitslosenversicherung',
  health: 'Krankenversicherung',
  care: 'Pflegeversicherung',
  net: 'Netto',
  oneOffTitle: 'Kosten bis zum ersten Gehalt',
  oneOffIntro: 'Von der Ankunft bis zum ersten Gehalt',
  oneOff: {
    deposit: 'Mietkaution',
    rent: 'Miete bis zum ersten Gehalt',
    furniture: 'Möbel und Grundausstattung',
    transport: 'Deutschlandticket',
    phone: 'SIM-Karte und Handytarif',
    rundfunk: 'Rundfunkbeitrag (erste Rechnung)',
    liability: 'Privathaftpflicht (Jahresbeitrag)',
    healthGap: 'Krankenversicherung bis zum Arbeitsbeginn',
    food: 'Lebensmittel bis zum ersten Gehalt',
    living: 'Strom, Internet und Persönliches',
  },
  total: 'Summe',
  monthlyTitle: 'Monatsbudget ab dem ersten Gehalt',
  monthly: {
    rent: 'Miete (warm)',
    electricity: 'Strom',
    internet: 'Internet',
    phone: 'Handy',
    food: 'Lebensmittel und Haushalt',
    transport: 'Deutschlandticket',
    rundfunk: 'Rundfunkbeitrag',
    insurance: 'Haftpflichtversicherung',
    children: 'Kinder (Kleidung, Kita, Schule)',
    personal: 'Persönliches und Freizeit',
  },
  costs: 'Ausgaben',
  income: 'Einnahmen',
  kindergeld: 'Kindergeld',
  remaining: 'Bleibt übrig',
  bringTitle: 'Wie viel Geld mitbringen?',
  recommended: 'Empfehlung (inkl. Puffer)',
  buffer: 'davon Puffer',
  blockedTitle: 'Sperrkonto',
  blockedText: (a) =>
    `Ihr Visum verlangt ein Sperrkonto von ${a.year}. Es zahlt monatlich ${a.monthly} aus; bis zum ersten Gehalt sind das voraussichtlich ${a.releases} Auszahlung(en) = ${a.released}. Damit lassen sich laufende Kosten bezahlen, nicht aber Kaution und Möbel. Zusätzlich zum Sperrkonto mitbringen: ${a.besides}.`,
  noBlocked: 'Für diese Auswahl ist kein Sperrkonto nötig.',
  midijob: 'Bruttogehalt bis 2.000 €: im Übergangsbereich (Midijob) sind die Abzüge niedriger als hier gezeigt.',
  deficit: 'Achtung: im ungünstigen Fall reicht das Nettogehalt nicht für die Monatskosten.',
  disclaimer:
    'Unverbindliche Schätzung auf Basis vereinfachter Annahmen (Lohnsteuer nach dem amtlichen Programmablaufplan, Durchschnittswerte für Mieten und Preise). Kein Steuer- oder Rechtsrat. Tatsächliche Beträge hängen von Arbeitsvertrag, Krankenkasse, Wohnung und persönlicher Situation ab.',
  asOf: 'Stand',
  source: 'Quelle der Ortsdaten',
  link: 'Online öffnen',
  page: 'Seite',
  of: 'von',
};

const en: BudgetTexts = {
  title: 'First-month budget in Germany',
  subtitle: 'Net salary, costs until the first salary, monthly budget and how much money to bring',
  estimate: 'Estimate',
  inputs: 'Your details',
  city: 'Place',
  gross: 'Gross salary per month',
  taxClass: 'Tax class',
  church: 'Church tax',
  yes: 'yes',
  no: 'no',
  household: 'Household',
  households: { single: 'alone', couple: 'with partner', family: 'with children' },
  children: 'Children',
  housing: 'Housing',
  housings: { wg: 'Room in a shared flat (WG)', flat: 'Own flat', company: 'Housing from the employer' },
  start: 'Job start',
  arrival: 'Arrival',
  firstPay: 'First salary (expected)',
  netTitle: 'Estimated net salary per month',
  incomeTax: 'Income tax (Lohnsteuer)',
  soli: 'Solidarity surcharge',
  churchTax: 'Church tax',
  pension: 'Pension insurance',
  unemployment: 'Unemployment insurance',
  health: 'Health insurance',
  care: 'Long-term care insurance',
  net: 'Net',
  oneOffTitle: 'Costs until the first salary',
  oneOffIntro: 'From arrival to the first salary',
  oneOff: {
    deposit: 'Rent deposit',
    rent: 'Rent until the first salary',
    furniture: 'Furniture and basics',
    transport: 'Deutschlandticket',
    phone: 'SIM card and mobile plan',
    rundfunk: 'Broadcasting fee (first bill)',
    liability: 'Liability insurance (yearly premium)',
    healthGap: 'Health insurance until the job starts',
    food: 'Food until the first salary',
    living: 'Electricity, internet and personal costs',
  },
  total: 'Total',
  monthlyTitle: 'Monthly budget from the first salary',
  monthly: {
    rent: 'Rent (incl. utilities)',
    electricity: 'Electricity',
    internet: 'Internet',
    phone: 'Mobile phone',
    food: 'Food and household',
    transport: 'Deutschlandticket',
    rundfunk: 'Broadcasting fee',
    insurance: 'Liability insurance',
    children: 'Children (clothes, daycare, school)',
    personal: 'Personal and leisure',
  },
  costs: 'Costs',
  income: 'Income',
  kindergeld: 'Child benefit (Kindergeld)',
  remaining: 'Left over',
  bringTitle: 'How much money to bring?',
  recommended: 'Recommendation (incl. buffer)',
  buffer: 'of which buffer',
  blockedTitle: 'Blocked account (Sperrkonto)',
  blockedText: (a) =>
    `Your visa requires a blocked account of ${a.year}. It pays out ${a.monthly} per month; before your first salary that is probably ${a.releases} payout(s) = ${a.released}. This covers running costs, not the deposit or furniture. Bring in addition to the blocked account: ${a.besides}.`,
  noBlocked: 'No blocked account is needed for this choice.',
  midijob: 'Gross up to €2,000: in the transition zone (Midijob) the deductions are lower than shown here.',
  deficit: 'Note: in the worst case the net salary does not cover the monthly costs.',
  disclaimer:
    'Non-binding estimate based on simplified assumptions (income tax per the official German payroll formula, average rents and prices). Not tax or legal advice. Real amounts depend on your employment contract, health insurer, flat and personal situation.',
  asOf: 'As of',
  source: 'Source of the place data',
  link: 'Open online',
  page: 'Page',
  of: 'of',
};

const az: BudgetTexts = {
  title: 'Almaniyada ilk ayın büdcəsi',
  subtitle: 'Xalis maaş, ilk maaşa qədər xərclər, aylıq büdcə və özünüzlə nə qədər pul gətirməli',
  estimate: 'Təxmini hesab',
  inputs: 'Məlumatlarınız',
  city: 'Yer',
  gross: 'Aylıq brutto maaş',
  taxClass: 'Vergi sinfi',
  church: 'Kilsə vergisi',
  yes: 'bəli',
  no: 'xeyr',
  household: 'Ailə',
  households: { single: 'tək', couple: 'həyat yoldaşı ilə', family: 'uşaqlarla' },
  children: 'Uşaqlar',
  housing: 'Yaşayış',
  housings: { wg: 'Ortaq mənzildə otaq (WG)', flat: 'Ayrıca mənzil', company: 'İşəgötürənin verdiyi yaşayış yeri' },
  start: 'İşə başlama',
  arrival: 'Gəliş',
  firstPay: 'İlk maaş (gözlənilən)',
  netTitle: 'Aylıq təxmini xalis maaş',
  incomeTax: 'Gəlir vergisi (Lohnsteuer)',
  soli: 'Həmrəylik əlavəsi',
  churchTax: 'Kilsə vergisi',
  pension: 'Pensiya sığortası',
  unemployment: 'İşsizlik sığortası',
  health: 'Tibbi sığorta',
  care: 'Qulluq sığortası',
  net: 'Xalis',
  oneOffTitle: 'İlk maaşa qədər xərclər',
  oneOffIntro: 'Gəlişdən ilk maaşa qədər',
  oneOff: {
    deposit: 'Kirayə depoziti (Kaution)',
    rent: 'İlk maaşa qədər kirayə',
    furniture: 'Mebel və əsas əşyalar',
    transport: 'Deutschlandticket',
    phone: 'SIM-kart və mobil tarif',
    rundfunk: 'Yayım haqqı (ilk hesab)',
    liability: 'Məsuliyyət sığortası (illik)',
    healthGap: 'İşə başlayana qədər tibbi sığorta',
    food: 'İlk maaşa qədər ərzaq',
    living: 'Elektrik, internet və şəxsi xərclər',
  },
  total: 'Cəmi',
  monthlyTitle: 'İlk maaşdan sonra aylıq büdcə',
  monthly: {
    rent: 'Kirayə (kommunal daxil)',
    electricity: 'Elektrik',
    internet: 'İnternet',
    phone: 'Mobil telefon',
    food: 'Ərzaq və məişət',
    transport: 'Deutschlandticket',
    rundfunk: 'Yayım haqqı',
    insurance: 'Məsuliyyət sığortası',
    children: 'Uşaqlar (geyim, uşaq bağçası, məktəb)',
    personal: 'Şəxsi xərclər və istirahət',
  },
  costs: 'Xərclər',
  income: 'Gəlir',
  kindergeld: 'Uşaq pulu (Kindergeld)',
  remaining: 'Qalır',
  bringTitle: 'Özünüzlə nə qədər pul gətirməli?',
  recommended: 'Tövsiyə (ehtiyat daxil)',
  buffer: 'onlardan ehtiyat',
  blockedTitle: 'Bloklanmış hesab (Sperrkonto)',
  blockedText: (a) =>
    `Vizanız üçün ${a.year} məbləğində bloklanmış hesab tələb olunur. Hesab hər ay ${a.monthly} ödəyir; ilk maaşa qədər təxminən ${a.releases} ödəniş = ${a.released}. Bu pul cari xərcləri ödəyir, depozit və mebeli yox. Bloklanmış hesabdan əlavə gətirin: ${a.besides}.`,
  noBlocked: 'Bu seçim üçün bloklanmış hesab lazım deyil.',
  midijob: 'Brutto 2.000 €-ya qədər: keçid zonasında (Midijob) tutulmalar burada göstəriləndən azdır.',
  deficit: 'Diqqət: pis halda xalis maaş aylıq xərcləri ödəmir.',
  disclaimer:
    'Sadələşdirilmiş fərziyyələrə əsaslanan təxmini hesabdır (gəlir vergisi rəsmi alman düsturu ilə, kirayə və qiymətlər orta göstəricilərlə). Vergi və ya hüquqi məsləhət deyil. Real məbləğlər əmək müqaviləsindən, sığorta kassasından, mənzildən və şəxsi vəziyyətdən asılıdır.',
  asOf: 'Tarix',
  source: 'Yer məlumatlarının mənbəyi',
  link: 'Onlayn açın',
  page: 'Səhifə',
  of: '/',
};

const ru: BudgetTexts = {
  title: 'Бюджет на первый месяц в Германии',
  subtitle: 'Зарплата нетто, расходы до первой зарплаты, бюджет на месяц и сколько денег взять с собой',
  estimate: 'Оценка',
  inputs: 'Ваши данные',
  city: 'Место',
  gross: 'Зарплата брутто в месяц',
  taxClass: 'Налоговый класс',
  church: 'Церковный налог',
  yes: 'да',
  no: 'нет',
  household: 'Семья',
  households: { single: 'один/одна', couple: 'с партнёром', family: 'с детьми' },
  children: 'Дети',
  housing: 'Жильё',
  housings: { wg: 'Комната в общей квартире (WG)', flat: 'Своя квартира', company: 'Жильё от работодателя' },
  start: 'Начало работы',
  arrival: 'Приезд',
  firstPay: 'Первая зарплата (ожидается)',
  netTitle: 'Ориентировочная зарплата нетто в месяц',
  incomeTax: 'Подоходный налог (Lohnsteuer)',
  soli: 'Надбавка солидарности',
  churchTax: 'Церковный налог',
  pension: 'Пенсионное страхование',
  unemployment: 'Страхование от безработицы',
  health: 'Медицинская страховка',
  care: 'Страхование по уходу',
  net: 'Нетто',
  oneOffTitle: 'Расходы до первой зарплаты',
  oneOffIntro: 'От приезда до первой зарплаты',
  oneOff: {
    deposit: 'Залог за жильё (Kaution)',
    rent: 'Аренда до первой зарплаты',
    furniture: 'Мебель и самое необходимое',
    transport: 'Deutschlandticket',
    phone: 'SIM-карта и тариф',
    rundfunk: 'Сбор за радиовещание (первый счёт)',
    liability: 'Страхование ответственности (годовой взнос)',
    healthGap: 'Медстраховка до начала работы',
    food: 'Продукты до первой зарплаты',
    living: 'Электричество, интернет и личные расходы',
  },
  total: 'Итого',
  monthlyTitle: 'Бюджет на месяц после первой зарплаты',
  monthly: {
    rent: 'Аренда (с коммунальными)',
    electricity: 'Электричество',
    internet: 'Интернет',
    phone: 'Мобильная связь',
    food: 'Продукты и быт',
    transport: 'Deutschlandticket',
    rundfunk: 'Сбор за радиовещание',
    insurance: 'Страхование ответственности',
    children: 'Дети (одежда, детсад, школа)',
    personal: 'Личные расходы и досуг',
  },
  costs: 'Расходы',
  income: 'Доходы',
  kindergeld: 'Детское пособие (Kindergeld)',
  remaining: 'Остаётся',
  bringTitle: 'Сколько денег взять с собой?',
  recommended: 'Рекомендация (с запасом)',
  buffer: 'из них запас',
  blockedTitle: 'Блокированный счёт (Sperrkonto)',
  blockedText: (a) =>
    `Для вашей визы нужен блокированный счёт на ${a.year}. Он выплачивает ${a.monthly} в месяц; до первой зарплаты это, вероятно, ${a.releases} выплат(ы) = ${a.released}. Этим можно оплатить текущие расходы, но не залог и мебель. Взять дополнительно к блокированному счёту: ${a.besides}.`,
  noBlocked: 'Для этого выбора блокированный счёт не нужен.',
  midijob: 'Брутто до 2 000 €: в переходной зоне (Midijob) удержания меньше, чем показано.',
  deficit: 'Внимание: в худшем случае зарплаты нетто не хватает на ежемесячные расходы.',
  disclaimer:
    'Необязывающая оценка на основе упрощённых допущений (подоходный налог по официальной немецкой формуле, средние цены на аренду и товары). Не является налоговой или юридической консультацией. Реальные суммы зависят от трудового договора, больничной кассы, жилья и личной ситуации.',
  asOf: 'По состоянию на',
  source: 'Источник данных по месту',
  link: 'Открыть онлайн',
  page: 'Страница',
  of: 'из',
};

export const BUDGET_TEXTS: Record<BudgetLang, BudgetTexts> = { az, de, en, ru };
export const budgetLang = (v: unknown): BudgetLang => (BUDGET_LANGS.includes(v as BudgetLang) ? (v as BudgetLang) : 'az');
