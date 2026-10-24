// Client portal journey map (components/portal/JourneyCard): origin city → German destination with six
// milestones. Registered with registerCopy(pagesJourneyMap) by the journey components; tr / uk fall back to English.
const az = {
  jmap: {
    title: 'Sizin yolunuz',
    route: '{{from}} → {{to}}',
    homeFallback: 'Sizin şəhəriniz',
    germany: 'Almaniya',
    mapLabel: '{{from}} şəhərindən {{to}} şəhərinə marşrut. {{status}}',
    listLabel: 'Yolunuzun mərhələləri',
    currentIs: 'Hazırkı mərhələ: {{step}}',
    allDone: 'Bütün mərhələlər tamamlandı',
    stopped: 'Müraciət dayandırılıb',
    milestones: {
      documents: 'Sənədlər',
      contract: 'Müqavilə',
      embassy: 'Səfirlik',
      decision: 'Qərar',
      travel: 'Səfər',
      arrival: 'Almaniyaya gəliş',
    },
    status: { done: 'Tamamlandı', current: 'Hazırda', upcoming: 'Növbəti', skipped: 'Tətbiq olunmur' },
    doneOn: '{{date}} tarixində',
    expected: 'Gözlənilir: {{date}}',
    expectedRange: 'Gözlənilir: {{from}} – {{to}}',
    planned: 'Planlaşdırılıb: {{date}}',
    rejected: 'Müraciət rədd edilib',
    approved: 'Viza təsdiqlənib',
    estimateNote: 'Tarixlər oxşar müraciətlərə əsaslanan təxmini proqnozdur.',
  },
};

type Copy = typeof az;

const de: Copy = {
  jmap: {
    title: 'Ihr Weg',
    route: '{{from}} → {{to}}',
    homeFallback: 'Ihre Stadt',
    germany: 'Deutschland',
    mapLabel: 'Route von {{from}} nach {{to}}. {{status}}',
    listLabel: 'Etappen Ihres Weges',
    currentIs: 'Aktuelle Etappe: {{step}}',
    allDone: 'Alle Etappen abgeschlossen',
    stopped: 'Antrag beendet',
    milestones: {
      documents: 'Unterlagen',
      contract: 'Vertrag',
      embassy: 'Botschaft',
      decision: 'Entscheidung',
      travel: 'Reise',
      arrival: 'Ankunft in Deutschland',
    },
    status: { done: 'Erledigt', current: 'Aktuell', upcoming: 'Als Nächstes', skipped: 'Entfällt' },
    doneOn: 'am {{date}}',
    expected: 'Erwartet: {{date}}',
    expectedRange: 'Erwartet: {{from}} – {{to}}',
    planned: 'Geplant: {{date}}',
    rejected: 'Antrag abgelehnt',
    approved: 'Visum erteilt',
    estimateNote: 'Die Daten sind eine Schätzung auf Basis ähnlicher Anträge.',
  },
};

const en: Copy = {
  jmap: {
    title: 'Your journey',
    route: '{{from}} → {{to}}',
    homeFallback: 'Your city',
    germany: 'Germany',
    mapLabel: 'Route from {{from}} to {{to}}. {{status}}',
    listLabel: 'Stages of your journey',
    currentIs: 'Current stage: {{step}}',
    allDone: 'All stages completed',
    stopped: 'Application closed',
    milestones: {
      documents: 'Documents',
      contract: 'Contract',
      embassy: 'Embassy',
      decision: 'Decision',
      travel: 'Travel',
      arrival: 'Arrival in Germany',
    },
    status: { done: 'Done', current: 'Now', upcoming: 'Next', skipped: 'Not applicable' },
    doneOn: 'on {{date}}',
    expected: 'Expected: {{date}}',
    expectedRange: 'Expected: {{from}} – {{to}}',
    planned: 'Planned: {{date}}',
    rejected: 'Application refused',
    approved: 'Visa approved',
    estimateNote: 'Dates are an estimate based on similar applications.',
  },
};

const ru: Copy = {
  jmap: {
    title: 'Ваш путь',
    route: '{{from}} → {{to}}',
    homeFallback: 'Ваш город',
    germany: 'Германия',
    mapLabel: 'Маршрут из {{from}} в {{to}}. {{status}}',
    listLabel: 'Этапы вашего пути',
    currentIs: 'Текущий этап: {{step}}',
    allDone: 'Все этапы пройдены',
    stopped: 'Заявка закрыта',
    milestones: {
      documents: 'Документы',
      contract: 'Договор',
      embassy: 'Посольство',
      decision: 'Решение',
      travel: 'Поездка',
      arrival: 'Прибытие в Германию',
    },
    status: { done: 'Готово', current: 'Сейчас', upcoming: 'Далее', skipped: 'Не требуется' },
    doneOn: '{{date}}',
    expected: 'Ожидается: {{date}}',
    expectedRange: 'Ожидается: {{from}} – {{to}}',
    planned: 'Запланировано: {{date}}',
    rejected: 'В заявке отказано',
    approved: 'Виза одобрена',
    estimateNote: 'Даты — примерный прогноз на основе похожих заявок.',
  },
};

export const pagesJourneyMap: { az: Copy; de: Copy; en: Copy; ru: Copy } = { az, de, en, ru };
