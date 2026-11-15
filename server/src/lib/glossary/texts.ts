import type { GlossaryCategory, GlossaryLocale } from './types.js';

/** Labels of the glossary's crawler HTML and titles (lib/glossary/seo.ts), per site language. */
export interface GlossaryTexts {
  categories: Record<GlossaryCategory, string>;
  /** Title of a term page without the site name: "Anmeldung: what it means". */
  termTitle: (term: string) => string;
  /** Shorter title for long terms. */
  termTitleShort: (term: string) => string;
  /** Appended to short definitions in the meta description when it fits. */
  descTail: string;
  pron: string;
  example: string;
  related: string;
  official: string;
  asOf: string;
  fallback: string;
  allTerms: string;
  disclaimer: string;
}

export const GLOSSARY_TEXTS: Record<GlossaryLocale, GlossaryTexts> = {
  az: {
    categories: { residence: 'Yaşayış icazəsi və viza', work: 'İş', tax: 'Vergilər və sığorta haqları', health: 'Sağlamlıq', housing: 'Mənzil', banking: 'Bank və sığorta', family: 'Ailə', education: 'Təhsil və tanınma', everyday: 'Gündəlik həyat' },
    termTitle: (t) => `${t} nədir? Alman bürokratiya lüğəti`,
    termTitleShort: (t) => `${t} nədir?`,
    descTail: 'Artikl, oxunuş və nümunə cümlə ilə.',
    pron: 'Oxunuşu',
    example: 'Nümunə cümlə',
    related: 'Əlaqəli terminlər',
    official: 'Rəsmi mənbə',
    asOf: 'Məlumat tarixi',
    fallback: 'Ətraflı izah ingilis dilindədir.',
    allTerms: 'Bütün terminlər',
    disclaimer: 'Lüğət ümumi məlumat üçündür və hüquqi məsləhət deyil. Rəqəmlər dəyişə bilər — rəsmi mənbəni yoxlayın.',
  },
  de: {
    categories: { residence: 'Aufenthalt und Visum', work: 'Arbeit', tax: 'Steuern und Abgaben', health: 'Gesundheit', housing: 'Wohnen', banking: 'Bank und Versicherung', family: 'Familie', education: 'Bildung und Anerkennung', everyday: 'Alltag' },
    termTitle: (t) => `${t}: Bedeutung einfach erklärt`,
    termTitleShort: (t) => `${t}: Bedeutung`,
    descTail: 'Mit Artikel, Aussprache und Beispielsatz.',
    pron: 'Aussprache',
    example: 'Beispielsatz',
    related: 'Verwandte Begriffe',
    official: 'Offizielle Quelle',
    asOf: 'Stand',
    fallback: '',
    allTerms: 'Alle Begriffe',
    disclaimer: 'Das Glossar dient der allgemeinen Information und ist keine Rechtsberatung. Beträge können sich ändern — maßgeblich ist die offizielle Quelle.',
  },
  en: {
    categories: { residence: 'Residence and visas', work: 'Work', tax: 'Tax and contributions', health: 'Health', housing: 'Housing', banking: 'Banking and insurance', family: 'Family', education: 'Education and recognition', everyday: 'Everyday life' },
    termTitle: (t) => `${t}: meaning in German bureaucracy`,
    termTitleShort: (t) => `${t}: meaning`,
    descTail: 'With article, pronunciation and an example sentence.',
    pron: 'Pronunciation',
    example: 'Example sentence',
    related: 'Related terms',
    official: 'Official source',
    asOf: 'As of',
    fallback: '',
    allTerms: 'All terms',
    disclaimer: 'The glossary is general information, not legal advice. Amounts can change — the official source is authoritative.',
  },
  ru: {
    categories: { residence: 'ВНЖ и визы', work: 'Работа', tax: 'Налоги и взносы', health: 'Здоровье', housing: 'Жильё', banking: 'Банк и страхование', family: 'Семья', education: 'Образование и признание', everyday: 'Повседневная жизнь' },
    termTitle: (t) => `${t}: что это значит в Германии`,
    termTitleShort: (t) => `${t}: что это`,
    descTail: 'Артикль, произношение и пример.',
    pron: 'Произношение',
    example: 'Пример',
    related: 'Связанные термины',
    official: 'Официальный источник',
    asOf: 'Актуально на',
    fallback: '',
    allTerms: 'Все термины',
    disclaimer: 'Словарь носит общий информационный характер и не является юридической консультацией. Суммы могут меняться — сверяйтесь с официальным источником.',
  },
  tr: {
    categories: { residence: 'Oturum ve vize', work: 'Çalışma', tax: 'Vergi ve kesintiler', health: 'Sağlık', housing: 'Konut', banking: 'Banka ve sigorta', family: 'Aile', education: 'Eğitim ve denklik', everyday: 'Günlük yaşam' },
    termTitle: (t) => `${t} nedir? Alman bürokrasi sözlüğü`,
    termTitleShort: (t) => `${t} nedir?`,
    descTail: 'Artikel, okunuş ve örnek cümleyle.',
    pron: 'Okunuşu',
    example: 'Örnek cümle',
    related: 'İlgili terimler',
    official: 'Resmi kaynak',
    asOf: 'Tarih',
    fallback: 'Ayrıntılı açıklama İngilizcedir.',
    allTerms: 'Tüm terimler',
    disclaimer: 'Sözlük genel bilgi amaçlıdır, hukuki danışmanlık değildir. Tutarlar değişebilir — resmi kaynağı kontrol edin.',
  },
  uk: {
    categories: { residence: 'Посвідка і візи', work: 'Робота', tax: 'Податки і внески', health: 'Здоровʼя', housing: 'Житло', banking: 'Банк і страхування', family: 'Сімʼя', education: 'Освіта і визнання', everyday: 'Повсякденне життя' },
    termTitle: (t) => `${t}: що це означає в Німеччині`,
    termTitleShort: (t) => `${t}: що це`,
    descTail: 'Артикль, вимова і приклад.',
    pron: 'Вимова',
    example: 'Приклад',
    related: 'Повʼязані терміни',
    official: 'Офіційне джерело',
    asOf: 'Станом на',
    fallback: 'Докладне пояснення — англійською.',
    allTerms: 'Усі терміни',
    disclaimer: 'Словник має загальний інформаційний характер і не є юридичною консультацією. Суми можуть змінюватися — перевіряйте офіційне джерело.',
  },
};
