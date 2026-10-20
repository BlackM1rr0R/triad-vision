import type { CaseStatus, Locale } from '@prisma/client';

/** E-mail copy of the weekly management report (German formal "Sie", Russian "вы"). */

export type MetricKey =
  | 'inquiries'
  | 'registrations'
  | 'casesCreated'
  | 'approvals'
  | 'rejections'
  | 'bookingsHeld'
  | 'bookingsNoShow'
  | 'bookingsCancelled'
  | 'invoicesSent'
  | 'invoicesPaid'
  | 'aiSpendUsd';

/** Keys a recommendation may point at (the metric table plus the report sections). */
export const RECOMMENDATION_METRICS = [
  'inquiries',
  'registrations',
  'casesCreated',
  'approvals',
  'rejections',
  'bookingsHeld',
  'bookingsNoShow',
  'bookingsCancelled',
  'invoicesSent',
  'invoicesPaid',
  'overdueInvoices',
  'aiSpendUsd',
  'leadsBySource',
  'stepDurations',
  'stuckCases',
  'overdueTasks',
  'responseTime',
  'mailTriage',
] as const;
export type RecommendationMetric = (typeof RECOMMENDATION_METRICS)[number];

export interface ReportCopy {
  subject: (week: string) => string;
  title: string;
  intro: (week: string) => string;
  aiUnavailable: string;
  highlights: string;
  problems: string;
  recommendations: string;
  keyNumbers: string;
  metric: string;
  thisWeek: string;
  previous: string;
  change: string;
  metrics: Record<MetricKey, string>;
  sectionMetrics: Record<RecommendationMetric, string>;
  money: string;
  invoicesSentAmount: string;
  invoicesPaidAmount: string;
  overdueInvoices: (n: number) => string;
  leads: string;
  source: string;
  leadCols: { inquiries: string; registrations: string; bookings: string; prev: string };
  pipeline: string;
  openByStatus: string;
  avgDays: string;
  days: (n: number) => string;
  stuck: (days: number, count: number) => string;
  noStuck: string;
  idle: (n: number) => string;
  overdueTasks: (n: number) => string;
  unassigned: string;
  staffTitle: string;
  staffNote: string;
  staffCols: { name: string; open: string; handled: string; response: string; unanswered: string; overdue: string; note: string };
  needsSupport: string;
  ok: string;
  reasons: Record<'overdueTasks' | 'slowResponse' | 'unanswered' | 'stuckCases', string>;
  hours: (n: number) => string;
  mailTriage: string;
  mailTriageLine: (cur: number, prev: number) => string;
  status: Record<CaseStatus, string>;
  cta: string;
  footer: string;
}

const STATUS_AZ: Record<CaseStatus, string> = {
  DOCUMENTS_PENDING: 'Sənədlər gözlənilir',
  DOCUMENTS_REVIEW: 'Sənədlər yoxlanılır',
  CONTRACT_SENT: 'Müqavilə göndərilib',
  CONTRACT_SIGNED: 'Müqavilə imzalanıb',
  EMBASSY_DOCUMENTS: 'Səfirlik sənədləri',
  EMBASSY_REVIEW: 'Səfirlik sənədləri yoxlanılır',
  APPOINTMENT_SCHEDULED: 'Görüş təyin olunub',
  DECISION_PENDING: 'Qərar gözlənilir',
  APPROVED: 'Təsdiqlənib',
  REJECTED: 'Rədd edilib',
  CANCELLED: 'Ləğv edilib',
};
const STATUS_DE: Record<CaseStatus, string> = {
  DOCUMENTS_PENDING: 'Unterlagen ausstehend',
  DOCUMENTS_REVIEW: 'Unterlagen in Prüfung',
  CONTRACT_SENT: 'Vertrag versendet',
  CONTRACT_SIGNED: 'Vertrag unterschrieben',
  EMBASSY_DOCUMENTS: 'Botschaftsunterlagen',
  EMBASSY_REVIEW: 'Botschaftsunterlagen in Prüfung',
  APPOINTMENT_SCHEDULED: 'Termin vereinbart',
  DECISION_PENDING: 'Entscheidung ausstehend',
  APPROVED: 'Genehmigt',
  REJECTED: 'Abgelehnt',
  CANCELLED: 'Storniert',
};
const STATUS_EN: Record<CaseStatus, string> = {
  DOCUMENTS_PENDING: 'Documents pending',
  DOCUMENTS_REVIEW: 'Documents in review',
  CONTRACT_SENT: 'Contract sent',
  CONTRACT_SIGNED: 'Contract signed',
  EMBASSY_DOCUMENTS: 'Embassy documents',
  EMBASSY_REVIEW: 'Embassy documents in review',
  APPOINTMENT_SCHEDULED: 'Appointment scheduled',
  DECISION_PENDING: 'Decision pending',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
};
const STATUS_RU: Record<CaseStatus, string> = {
  DOCUMENTS_PENDING: 'Ожидаются документы',
  DOCUMENTS_REVIEW: 'Документы на проверке',
  CONTRACT_SENT: 'Договор отправлен',
  CONTRACT_SIGNED: 'Договор подписан',
  EMBASSY_DOCUMENTS: 'Документы для посольства',
  EMBASSY_REVIEW: 'Документы посольства на проверке',
  APPOINTMENT_SCHEDULED: 'Назначен приём',
  DECISION_PENDING: 'Ожидается решение',
  APPROVED: 'Одобрено',
  REJECTED: 'Отказ',
  CANCELLED: 'Отменено',
};

const az: ReportCopy = {
  subject: (w) => `Həftəlik idarəetmə hesabatı · ${w}`,
  title: 'Həftəlik idarəetmə hesabatı',
  intro: (w) => `${w} həftəsinin rəqəmləri və əvvəlki həftə ilə müqayisə.`,
  aiUnavailable: 'AI xülasəsi bu dəfə hazırlana bilmədi — aşağıda yalnız rəqəmlər var.',
  highlights: 'Əsas uğurlar',
  problems: 'Problemlər',
  recommendations: 'Tövsiyələr',
  keyNumbers: 'Əsas rəqəmlər',
  metric: 'Göstərici',
  thisWeek: 'Bu həftə',
  previous: 'Əvvəlki həftə',
  change: 'Dəyişiklik',
  metrics: {
    inquiries: 'Yeni sorğular',
    registrations: 'Qeydiyyatlar',
    casesCreated: 'Yeni müraciətlər',
    approvals: 'Təsdiqlər',
    rejections: 'İmtinalar',
    bookingsHeld: 'Keçirilmiş konsultasiyalar',
    bookingsNoShow: 'Gəlməyənlər',
    bookingsCancelled: 'Ləğv edilmiş konsultasiyalar',
    invoicesSent: 'Göndərilmiş hesablar',
    invoicesPaid: 'Ödənilmiş hesablar',
    aiSpendUsd: 'AI xərci (USD)',
  },
  sectionMetrics: {} as Record<RecommendationMetric, string>,
  money: 'Hesab-fakturalar',
  invoicesSentAmount: 'Göndərilib',
  invoicesPaidAmount: 'Ödənilib',
  overdueInvoices: (n) => `Gecikmiş hesablar: ${n}`,
  leads: 'Mənbələr üzrə müraciətlər',
  source: 'Mənbə',
  leadCols: { inquiries: 'Sorğu', registrations: 'Qeydiyyat', bookings: 'Konsultasiya', prev: 'Əvvəlki həftə' },
  pipeline: 'Müraciətlər axını',
  openByStatus: 'Açıq müraciətlər (mərhələ üzrə)',
  avgDays: 'Mərhələdə orta müddət',
  days: (n) => `${n} gün`,
  stuck: (d, c) => `İlişib qalan müraciətlər (${d} gündən çox yenilənməyib): ${c}`,
  noStuck: 'İlişib qalan müraciət yoxdur.',
  idle: (n) => `${n} gün`,
  overdueTasks: (n) => `Gecikmiş tapşırıqlar: ${n}`,
  unassigned: 'Təyin olunmayıb',
  staffTitle: 'Komanda (yalnız super admin görür)',
  staffNote: 'Rəqəmlər faktlardır; "dəstək lazımdır" — gecikmiş tapşırıqlar, cavabsız mesajlar, ləng cavab və ya ilişib qalan müraciətlər həddi keçəndə.',
  staffCols: { name: 'Əməkdaş', open: 'Açıq', handled: 'İşlənib', response: 'Orta cavab', unanswered: 'Cavabsız', overdue: 'Gecikmiş', note: 'Qeyd' },
  needsSupport: 'Dəstək lazımdır',
  ok: 'Qaydasındadır',
  reasons: { overdueTasks: 'gecikmiş tapşırıqlar', slowResponse: 'ləng cavab', unanswered: 'cavabsız mesajlar', stuckCases: 'ilişib qalan müraciətlər' },
  hours: (n) => `${n} saat`,
  mailTriage: 'Poçt triajı',
  mailTriageLine: (c, p) => `Təsnif edilmiş məktublar: ${c} (əvvəlki həftə: ${p})`,
  status: STATUS_AZ,
  cta: 'Hesabatı admin paneldə aç',
  footer: 'Bu hesabat hər bazar ertəsi 08:00-da (Bakı) avtomatik göndərilir. Ayarlar: Admin → Həftəlik hesabatlar.',
};
az.sectionMetrics = {
  ...az.metrics,
  overdueInvoices: 'Gecikmiş hesablar',
  leadsBySource: 'Mənbələr',
  stepDurations: 'Mərhələ müddətləri',
  stuckCases: 'İlişib qalan müraciətlər',
  overdueTasks: 'Gecikmiş tapşırıqlar',
  responseTime: 'Cavab müddəti',
  mailTriage: 'Poçt triajı',
};

const de: ReportCopy = {
  subject: (w) => `Wöchentlicher Management-Bericht · ${w}`,
  title: 'Wöchentlicher Management-Bericht',
  intro: (w) => `Die Zahlen der Woche ${w} im Vergleich zur Vorwoche.`,
  aiUnavailable: 'Die KI-Zusammenfassung konnte diesmal nicht erstellt werden — unten finden Sie die Zahlen.',
  highlights: 'Highlights',
  problems: 'Probleme',
  recommendations: 'Empfehlungen',
  keyNumbers: 'Kennzahlen',
  metric: 'Kennzahl',
  thisWeek: 'Diese Woche',
  previous: 'Vorwoche',
  change: 'Veränderung',
  metrics: {
    inquiries: 'Neue Anfragen',
    registrations: 'Registrierungen',
    casesCreated: 'Neue Anträge',
    approvals: 'Genehmigungen',
    rejections: 'Ablehnungen',
    bookingsHeld: 'Durchgeführte Beratungen',
    bookingsNoShow: 'Nicht erschienen',
    bookingsCancelled: 'Abgesagte Beratungen',
    invoicesSent: 'Versendete Rechnungen',
    invoicesPaid: 'Bezahlte Rechnungen',
    aiSpendUsd: 'KI-Kosten (USD)',
  },
  sectionMetrics: {} as Record<RecommendationMetric, string>,
  money: 'Rechnungen',
  invoicesSentAmount: 'Versendet',
  invoicesPaidAmount: 'Bezahlt',
  overdueInvoices: (n) => `Überfällige Rechnungen: ${n}`,
  leads: 'Anfragen nach Quelle',
  source: 'Quelle',
  leadCols: { inquiries: 'Anfragen', registrations: 'Registrierungen', bookings: 'Beratungen', prev: 'Vorwoche' },
  pipeline: 'Antragsverlauf',
  openByStatus: 'Offene Anträge nach Schritt',
  avgDays: 'Ø Dauer im Schritt',
  days: (n) => `${n} Tage`,
  stuck: (d, c) => `Feststeckende Anträge (seit über ${d} Tagen keine Änderung): ${c}`,
  noStuck: 'Keine feststeckenden Anträge.',
  idle: (n) => `${n} Tage`,
  overdueTasks: (n) => `Überfällige Aufgaben: ${n}`,
  unassigned: 'Nicht zugewiesen',
  staffTitle: 'Team (nur für den Super-Admin sichtbar)',
  staffNote: 'Die Zahlen sind Fakten; „Unterstützung sinnvoll“ erscheint, wenn überfällige Aufgaben, unbeantwortete Nachrichten, lange Antwortzeiten oder feststeckende Anträge einen Grenzwert überschreiten.',
  staffCols: { name: 'Mitarbeiter', open: 'Offen', handled: 'Bearbeitet', response: 'Ø Antwort', unanswered: 'Unbeantwortet', overdue: 'Überfällig', note: 'Hinweis' },
  needsSupport: 'Unterstützung sinnvoll',
  ok: 'In Ordnung',
  reasons: { overdueTasks: 'überfällige Aufgaben', slowResponse: 'lange Antwortzeit', unanswered: 'unbeantwortete Nachrichten', stuckCases: 'feststeckende Anträge' },
  hours: (n) => `${n} Std.`,
  mailTriage: 'E-Mail-Triage',
  mailTriageLine: (c, p) => `Klassifizierte E-Mails: ${c} (Vorwoche: ${p})`,
  status: STATUS_DE,
  cta: 'Bericht im Adminbereich öffnen',
  footer: 'Dieser Bericht wird jeden Montag um 08:00 Uhr (Baku) automatisch versendet. Einstellungen: Admin → Wochenberichte.',
};
de.sectionMetrics = {
  ...de.metrics,
  overdueInvoices: 'Überfällige Rechnungen',
  leadsBySource: 'Quellen',
  stepDurations: 'Dauer der Schritte',
  stuckCases: 'Feststeckende Anträge',
  overdueTasks: 'Überfällige Aufgaben',
  responseTime: 'Antwortzeit',
  mailTriage: 'E-Mail-Triage',
};

const en: ReportCopy = {
  subject: (w) => `Weekly management report · ${w}`,
  title: 'Weekly management report',
  intro: (w) => `The numbers of the week ${w} compared with the week before.`,
  aiUnavailable: 'The AI summary could not be written this time — the numbers are below.',
  highlights: 'Highlights',
  problems: 'Problems',
  recommendations: 'Recommendations',
  keyNumbers: 'Key numbers',
  metric: 'Metric',
  thisWeek: 'This week',
  previous: 'Week before',
  change: 'Change',
  metrics: {
    inquiries: 'New inquiries',
    registrations: 'Registrations',
    casesCreated: 'New cases',
    approvals: 'Approvals',
    rejections: 'Rejections',
    bookingsHeld: 'Consultations held',
    bookingsNoShow: 'No-shows',
    bookingsCancelled: 'Consultations cancelled',
    invoicesSent: 'Invoices sent',
    invoicesPaid: 'Invoices paid',
    aiSpendUsd: 'AI spend (USD)',
  },
  sectionMetrics: {} as Record<RecommendationMetric, string>,
  money: 'Invoices',
  invoicesSentAmount: 'Sent',
  invoicesPaidAmount: 'Paid',
  overdueInvoices: (n) => `Overdue invoices: ${n}`,
  leads: 'Leads by source',
  source: 'Source',
  leadCols: { inquiries: 'Inquiries', registrations: 'Registrations', bookings: 'Consultations', prev: 'Week before' },
  pipeline: 'Case pipeline',
  openByStatus: 'Open cases by step',
  avgDays: 'Average time in step',
  days: (n) => `${n} days`,
  stuck: (d, c) => `Stuck cases (no update for more than ${d} days): ${c}`,
  noStuck: 'No stuck cases.',
  idle: (n) => `${n} days`,
  overdueTasks: (n) => `Overdue tasks: ${n}`,
  unassigned: 'Unassigned',
  staffTitle: 'Team (visible to the super admin only)',
  staffNote: 'The numbers are facts; "needs support" appears when overdue tasks, unanswered messages, slow replies or stuck cases pass a threshold.',
  staffCols: { name: 'Staff member', open: 'Open', handled: 'Handled', response: 'Avg reply', unanswered: 'Unanswered', overdue: 'Overdue', note: 'Note' },
  needsSupport: 'Needs support',
  ok: 'On track',
  reasons: { overdueTasks: 'overdue tasks', slowResponse: 'slow replies', unanswered: 'unanswered messages', stuckCases: 'stuck cases' },
  hours: (n) => `${n} h`,
  mailTriage: 'Mail triage',
  mailTriageLine: (c, p) => `Classified e-mails: ${c} (week before: ${p})`,
  status: STATUS_EN,
  cta: 'Open the report in the admin panel',
  footer: 'This report is sent automatically every Monday at 08:00 (Baku). Settings: Admin → Weekly reports.',
};
en.sectionMetrics = {
  ...en.metrics,
  overdueInvoices: 'Overdue invoices',
  leadsBySource: 'Lead sources',
  stepDurations: 'Step durations',
  stuckCases: 'Stuck cases',
  overdueTasks: 'Overdue tasks',
  responseTime: 'Response time',
  mailTriage: 'Mail triage',
};

const ru: ReportCopy = {
  subject: (w) => `Еженедельный управленческий отчёт · ${w}`,
  title: 'Еженедельный управленческий отчёт',
  intro: (w) => `Показатели недели ${w} в сравнении с предыдущей неделей.`,
  aiUnavailable: 'AI-резюме на этот раз подготовить не удалось — ниже только цифры.',
  highlights: 'Главное',
  problems: 'Проблемы',
  recommendations: 'Рекомендации',
  keyNumbers: 'Ключевые показатели',
  metric: 'Показатель',
  thisWeek: 'Эта неделя',
  previous: 'Прошлая неделя',
  change: 'Изменение',
  metrics: {
    inquiries: 'Новые запросы',
    registrations: 'Регистрации',
    casesCreated: 'Новые заявки',
    approvals: 'Одобрения',
    rejections: 'Отказы',
    bookingsHeld: 'Проведённые консультации',
    bookingsNoShow: 'Неявки',
    bookingsCancelled: 'Отменённые консультации',
    invoicesSent: 'Отправленные счета',
    invoicesPaid: 'Оплаченные счета',
    aiSpendUsd: 'Расходы на AI (USD)',
  },
  sectionMetrics: {} as Record<RecommendationMetric, string>,
  money: 'Счета',
  invoicesSentAmount: 'Отправлено',
  invoicesPaidAmount: 'Оплачено',
  overdueInvoices: (n) => `Просроченные счета: ${n}`,
  leads: 'Обращения по источникам',
  source: 'Источник',
  leadCols: { inquiries: 'Запросы', registrations: 'Регистрации', bookings: 'Консультации', prev: 'Прошлая неделя' },
  pipeline: 'Движение заявок',
  openByStatus: 'Открытые заявки по этапам',
  avgDays: 'Среднее время на этапе',
  days: (n) => `${n} дн.`,
  stuck: (d, c) => `Зависшие заявки (без изменений более ${d} дней): ${c}`,
  noStuck: 'Зависших заявок нет.',
  idle: (n) => `${n} дн.`,
  overdueTasks: (n) => `Просроченные задачи: ${n}`,
  unassigned: 'Не назначено',
  staffTitle: 'Команда (видит только супер-админ)',
  staffNote: 'Цифры — это факты; «нужна поддержка» появляется, когда просроченные задачи, неотвеченные сообщения, медленные ответы или зависшие заявки превышают порог.',
  staffCols: { name: 'Сотрудник', open: 'Открыто', handled: 'В работе', response: 'Ср. ответ', unanswered: 'Без ответа', overdue: 'Просрочено', note: 'Примечание' },
  needsSupport: 'Нужна поддержка',
  ok: 'В порядке',
  reasons: { overdueTasks: 'просроченные задачи', slowResponse: 'медленные ответы', unanswered: 'неотвеченные сообщения', stuckCases: 'зависшие заявки' },
  hours: (n) => `${n} ч`,
  mailTriage: 'Сортировка почты',
  mailTriageLine: (c, p) => `Классифицировано писем: ${c} (прошлая неделя: ${p})`,
  status: STATUS_RU,
  cta: 'Открыть отчёт в админ-панели',
  footer: 'Этот отчёт отправляется автоматически каждый понедельник в 08:00 (Баку). Настройки: Админ → Еженедельные отчёты.',
};
ru.sectionMetrics = {
  ...ru.metrics,
  overdueInvoices: 'Просроченные счета',
  leadsBySource: 'Источники',
  stepDurations: 'Длительность этапов',
  stuckCases: 'Зависшие заявки',
  overdueTasks: 'Просроченные задачи',
  responseTime: 'Время ответа',
  mailTriage: 'Сортировка почты',
};

export const REPORT_TEXTS: Record<Locale, ReportCopy> = { az, de, en, ru };
