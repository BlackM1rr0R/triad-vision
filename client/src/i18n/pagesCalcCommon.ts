/**
 * Shared labels of the public calculators in components/tools/calc (tax refund, shift pay, rent check, holiday
 * planner, grade converter). All six site languages. Keys under calcCommon.*.
 */
const az = {
  calcCommon: {
    estimate: 'Təxmini hesab',
    asOf: '{{date}} tarixinə',
    sources: 'Mənbələr',
    faq: 'Tez-tez verilən suallar',
    azn: '≈ {{amount}} (AMB məzənnəsi, {{date}})',
    glossary: 'Lüğət',
    yes: 'Bəli',
    no: 'Xeyr',
    reset: 'Sıfırla',
    noAdvice: 'Yalnız istiqamət üçündür — vergi və ya hüquq məsləhəti deyil.',
  },
};
const de = {
  calcCommon: {
    estimate: 'Schätzung',
    asOf: 'Stand {{date}}',
    sources: 'Quellen',
    faq: 'Häufige Fragen',
    azn: '≈ {{amount}} (CBAR-Kurs vom {{date}})',
    glossary: 'Glossar',
    yes: 'Ja',
    no: 'Nein',
    reset: 'Zurücksetzen',
    noAdvice: 'Nur zur Orientierung – keine Steuer- oder Rechtsberatung.',
  },
};
const en = {
  calcCommon: {
    estimate: 'Estimate',
    asOf: 'as of {{date}}',
    sources: 'Sources',
    faq: 'Frequently asked questions',
    azn: '≈ {{amount}} (CBAR rate of {{date}})',
    glossary: 'Glossary',
    yes: 'Yes',
    no: 'No',
    reset: 'Reset',
    noAdvice: 'For orientation only — not tax or legal advice.',
  },
};
const ru = {
  calcCommon: {
    estimate: 'Оценка',
    asOf: 'по состоянию на {{date}}',
    sources: 'Источники',
    faq: 'Частые вопросы',
    azn: '≈ {{amount}} (курс ЦБА на {{date}})',
    glossary: 'Глоссарий',
    yes: 'Да',
    no: 'Нет',
    reset: 'Сбросить',
    noAdvice: 'Только для ориентира — не налоговая и не юридическая консультация.',
  },
};
const tr = {
  calcCommon: {
    estimate: 'Tahmin',
    asOf: '{{date}} itibarıyla',
    sources: 'Kaynaklar',
    faq: 'Sık sorulan sorular',
    azn: '≈ {{amount}} (CBAR kuru, {{date}})',
    glossary: 'Sözlük',
    yes: 'Evet',
    no: 'Hayır',
    reset: 'Sıfırla',
    noAdvice: 'Yalnızca yön göstermek içindir — vergi veya hukuk danışmanlığı değildir.',
  },
};
const uk = {
  calcCommon: {
    estimate: 'Оцінка',
    asOf: 'станом на {{date}}',
    sources: 'Джерела',
    faq: 'Часті запитання',
    azn: '≈ {{amount}} (курс ЦБА на {{date}})',
    glossary: 'Глосарій',
    yes: 'Так',
    no: 'Ні',
    reset: 'Скинути',
    noAdvice: 'Лише для орієнтиру — не податкова й не юридична консультація.',
  },
};

export const pagesCalcCommon = { az, de, en, ru, tr, uk };
