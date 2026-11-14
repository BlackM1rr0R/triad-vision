// "Bu günüm" (/admin/my-day): the day plan of a staff member, built on the my-work queue (components/today).
// Also adds the two queue kinds it introduced (client_message, interview) to today.* (nav label: admin.nav.myDay).
// Registered with registerCopy(pagesMyDay) by components/today/kinds.ts (so every queue view knows the kinds).

const az = {
  today: {
    kind: { client_message: 'Cavabsız müştəri mesajı', interview: 'Müsahibə' },
    action: { reply: 'Cavab yaz' },
    note: {
      clientMessages: '{{count}} cavabsız mesaj',
      interviewStatus: { PROPOSED: 'Təklif olunub', CONFIRMED: 'Təsdiqlənib' },
    },
  },
  myDay: {
    title: 'Bu günüm',
    subtitle: 'Bu günün tapşırıqları, gecikən müraciətlər, cavabsız mesajlar, görüşlər və yeni müraciətlər — bir baxışda.',
    greeting: { morning: 'Sabahınız xeyir, {{name}}', afternoon: 'Günortanız xeyir, {{name}}', evening: 'Axşamınız xeyir, {{name}}' },
    queue: 'Bütün iş növbəsi',
    landing: 'Başlanğıc səhifəm',
    landingHint: '/admin açılanda bu səhifə göstərilsin',
    landingOn: '“Bu günüm” indi başlanğıc səhifənizdir',
    landingOff: 'Başlanğıc səhifə standarta qaytarıldı',
    kpi: { overdue: 'Gecikmiş', tasks: 'Bu günün tapşırıqları', messages: 'Cavabsız mesajlar', agenda: 'Bu gün görüşlər', leads: 'Yeni müraciətlər' },
    section: {
      tasks: 'Bu günün tapşırıqları',
      cases: 'Gecikən müraciətlər',
      messages: 'Cavabsız müştəri mesajları',
      agenda: 'Görüşlər və müsahibələr · 7 gün',
      leads: 'Yeni müraciətlər (lead)',
    },
    empty: {
      tasks: 'Bu gün üçün tapşırıq yoxdur.',
      cases: 'Gecikən müraciət yoxdur.',
      messages: 'Bütün müştərilərə cavab verilib.',
      agenda: 'Bu həftə görüş planlaşdırılmayıb.',
      leads: 'Yeni müraciət yoxdur.',
    },
    day: { today: 'Bu gün', tomorrow: 'Sabah' },
    showAll: 'Hamısı ({{count}})',
    showLess: 'Daha az',
    allClear: 'Bu gün üçün hər şey qaydasındadır 🎉',
  },
};

const de: typeof az = {
  today: {
    kind: { client_message: 'Unbeantwortete Kundennachricht', interview: 'Vorstellungsgespräch' },
    action: { reply: 'Antworten' },
    note: {
      clientMessages: '{{count}} unbeantwortete Nachrichten',
      interviewStatus: { PROPOSED: 'Vorgeschlagen', CONFIRMED: 'Bestätigt' },
    },
  },
  myDay: {
    title: 'Mein Tag',
    subtitle: 'Heutige Aufgaben, überfällige Anträge, unbeantwortete Nachrichten, Termine und neue Anfragen — auf einen Blick.',
    greeting: { morning: 'Guten Morgen, {{name}}', afternoon: 'Guten Tag, {{name}}', evening: 'Guten Abend, {{name}}' },
    queue: 'Gesamte Arbeitsliste',
    landing: 'Meine Startseite',
    landingHint: 'Diese Seite beim Öffnen von /admin zeigen',
    landingOn: '„Mein Tag“ ist jetzt Ihre Startseite',
    landingOff: 'Startseite auf den Standard zurückgesetzt',
    kpi: { overdue: 'Überfällig', tasks: 'Aufgaben heute', messages: 'Unbeantwortet', agenda: 'Termine heute', leads: 'Neue Anfragen' },
    section: {
      tasks: 'Aufgaben für heute',
      cases: 'Überfällige Anträge',
      messages: 'Unbeantwortete Kundennachrichten',
      agenda: 'Termine und Gespräche · 7 Tage',
      leads: 'Neue Anfragen (Leads)',
    },
    empty: {
      tasks: 'Keine Aufgaben für heute.',
      cases: 'Keine überfälligen Anträge.',
      messages: 'Alle Kunden haben eine Antwort.',
      agenda: 'Diese Woche sind keine Termine geplant.',
      leads: 'Keine neuen Anfragen.',
    },
    day: { today: 'Heute', tomorrow: 'Morgen' },
    showAll: 'Alle ({{count}})',
    showLess: 'Weniger',
    allClear: 'Für heute ist alles erledigt 🎉',
  },
};

const en: typeof az = {
  today: {
    kind: { client_message: 'Unanswered client message', interview: 'Interview' },
    action: { reply: 'Reply' },
    note: {
      clientMessages: '{{count}} unanswered messages',
      interviewStatus: { PROPOSED: 'Proposed', CONFIRMED: 'Confirmed' },
    },
  },
  myDay: {
    title: 'My day',
    subtitle: "Today's tasks, overdue cases, unanswered messages, appointments and new leads — at a glance.",
    greeting: { morning: 'Good morning, {{name}}', afternoon: 'Good afternoon, {{name}}', evening: 'Good evening, {{name}}' },
    queue: 'Full work queue',
    landing: 'My start page',
    landingHint: 'Show this page when /admin opens',
    landingOn: '“My day” is now your start page',
    landingOff: 'Start page reset to the default',
    kpi: { overdue: 'Overdue', tasks: 'Tasks today', messages: 'Unanswered', agenda: 'Appointments today', leads: 'New leads' },
    section: {
      tasks: "Today's tasks",
      cases: 'Overdue cases',
      messages: 'Unanswered client messages',
      agenda: 'Appointments and interviews · 7 days',
      leads: 'New leads',
    },
    empty: {
      tasks: 'No tasks for today.',
      cases: 'No overdue cases.',
      messages: 'Every client has an answer.',
      agenda: 'No appointments this week.',
      leads: 'No new leads.',
    },
    day: { today: 'Today', tomorrow: 'Tomorrow' },
    showAll: 'All ({{count}})',
    showLess: 'Less',
    allClear: 'All clear for today 🎉',
  },
};

const ru: typeof az = {
  today: {
    kind: { client_message: 'Сообщение клиента без ответа', interview: 'Собеседование' },
    action: { reply: 'Ответить' },
    note: {
      clientMessages: 'Без ответа: {{count}}',
      interviewStatus: { PROPOSED: 'Предложено', CONFIRMED: 'Подтверждено' },
    },
  },
  myDay: {
    title: 'Мой день',
    subtitle: 'Задачи на сегодня, просроченные заявки, сообщения без ответа, встречи и новые обращения — на одном экране.',
    greeting: { morning: 'Доброе утро, {{name}}', afternoon: 'Добрый день, {{name}}', evening: 'Добрый вечер, {{name}}' },
    queue: 'Вся очередь работы',
    landing: 'Моя стартовая страница',
    landingHint: 'Показывать эту страницу при открытии /admin',
    landingOn: '«Мой день» теперь ваша стартовая страница',
    landingOff: 'Стартовая страница сброшена',
    kpi: { overdue: 'Просрочено', tasks: 'Задачи сегодня', messages: 'Без ответа', agenda: 'Встречи сегодня', leads: 'Новые обращения' },
    section: {
      tasks: 'Задачи на сегодня',
      cases: 'Просроченные заявки',
      messages: 'Сообщения клиентов без ответа',
      agenda: 'Встречи и собеседования · 7 дней',
      leads: 'Новые обращения (лиды)',
    },
    empty: {
      tasks: 'На сегодня задач нет.',
      cases: 'Просроченных заявок нет.',
      messages: 'Всем клиентам ответили.',
      agenda: 'На этой неделе встреч нет.',
      leads: 'Новых обращений нет.',
    },
    day: { today: 'Сегодня', tomorrow: 'Завтра' },
    showAll: 'Все ({{count}})',
    showLess: 'Свернуть',
    allClear: 'На сегодня всё готово 🎉',
  },
};

export const pagesMyDay = { az, de, en, ru };
export default pagesMyDay;
