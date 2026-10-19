import type { Locale } from '@prisma/client';
import type { Risk, RiskAction, RiskCode } from './risk.js';

/** Server-side texts of the staff AI features (risk titles / suggestions, briefing e-mail) in 4 languages. */

export const LOCALE_NAMES: Record<Locale, string> = { az: 'Azerbaijani', de: 'German', en: 'English', ru: 'Russian' };
export const asLocale = (v: string | null | undefined): Locale => {
  const l = (v ?? '').toLowerCase().slice(0, 2);
  return l === 'de' || l === 'en' || l === 'ru' ? l : 'az';
};

type RiskTitle = (r: Risk) => string;

const TITLES: Record<Locale, Record<RiskCode, RiskTitle>> = {
  az: {
    REVIEW_WAITING: (r) => `Sənədlər ${r.days} gündür yoxlama gözləyir`,
    CLIENT_SILENT: (r) => `Müştəri ${r.days} gündür düzəliş sorğusuna cavab vermir`,
    NO_ACTIVITY: (r) => `${r.days} gündür heç bir fəaliyyət yoxdur`,
    APPOINTMENT_DOCS_MISSING: (r) => `Səfirlik görüşünə ${r.days} gün qalıb, ${r.detail} sənəd çatışmır`,
    PASSPORT_EXPIRING: (r) => (r.days <= 0 ? `Pasportun müddəti bitib (${r.date})` : `Pasportun müddəti ${r.days} günə bitir (${r.date})`),
    SIGNATURE_EXPIRING: (r) => `İmza sorğusu "${r.detail}" ${Math.max(0, r.days)} günə bitir`,
    TRANSLATION_OVERDUE: (r) => `Tərcümə sifarişi ${r.detail} ${r.days} gün gecikir`,
  },
  de: {
    REVIEW_WAITING: (r) => `Dokumente warten seit ${r.days} Tagen auf Prüfung`,
    CLIENT_SILENT: (r) => `Kunde reagiert seit ${r.days} Tagen nicht auf die Nachforderung`,
    NO_ACTIVITY: (r) => `Seit ${r.days} Tagen keine Aktivität`,
    APPOINTMENT_DOCS_MISSING: (r) => `Botschaftstermin in ${r.days} Tagen, ${r.detail} Dokument(e) fehlen`,
    PASSPORT_EXPIRING: (r) => (r.days <= 0 ? `Reisepass abgelaufen (${r.date})` : `Reisepass läuft in ${r.days} Tagen ab (${r.date})`),
    SIGNATURE_EXPIRING: (r) => `Signaturanfrage „${r.detail}“ läuft in ${Math.max(0, r.days)} Tagen ab`,
    TRANSLATION_OVERDUE: (r) => `Übersetzungsauftrag ${r.detail} ist ${r.days} Tage überfällig`,
  },
  en: {
    REVIEW_WAITING: (r) => `Documents waiting for review for ${r.days} days`,
    CLIENT_SILENT: (r) => `Client has not reacted to the change request for ${r.days} days`,
    NO_ACTIVITY: (r) => `No activity for ${r.days} days`,
    APPOINTMENT_DOCS_MISSING: (r) => `Embassy appointment in ${r.days} days, ${r.detail} document(s) missing`,
    PASSPORT_EXPIRING: (r) => (r.days <= 0 ? `Passport expired (${r.date})` : `Passport expires in ${r.days} days (${r.date})`),
    SIGNATURE_EXPIRING: (r) => `Signature request "${r.detail}" expires in ${Math.max(0, r.days)} days`,
    TRANSLATION_OVERDUE: (r) => `Translation order ${r.detail} is ${r.days} days overdue`,
  },
  ru: {
    REVIEW_WAITING: (r) => `Документы ждут проверки ${r.days} дн.`,
    CLIENT_SILENT: (r) => `Клиент ${r.days} дн. не реагирует на запрос исправлений`,
    NO_ACTIVITY: (r) => `Нет активности ${r.days} дн.`,
    APPOINTMENT_DOCS_MISSING: (r) => `Запись в посольство через ${r.days} дн., не хватает документов: ${r.detail}`,
    PASSPORT_EXPIRING: (r) => (r.days <= 0 ? `Срок паспорта истёк (${r.date})` : `Паспорт истекает через ${r.days} дн. (${r.date})`),
    SIGNATURE_EXPIRING: (r) => `Запрос подписи «${r.detail}» истекает через ${Math.max(0, r.days)} дн.`,
    TRANSLATION_OVERDUE: (r) => `Заказ перевода ${r.detail} просрочен на ${r.days} дн.`,
  },
};

const ACTIONS: Record<Locale, Record<RiskAction, string>> = {
  az: {
    REVIEW_DOCUMENTS: 'Sənədləri yoxlayın və qəbul edin və ya düzəliş istəyin.',
    REMIND_CLIENT: 'Müştəriyə xatırlatma göndərin və ya zəng edin.',
    CONTACT_CLIENT: 'Müştəri ilə əlaqə saxlayın və növbəti addımı razılaşdırın.',
    CHECK_EMBASSY: 'Səfirlikdə müraciətin statusunu yoxlayın.',
    COLLECT_EMBASSY_DOCS: 'Çatışmayan səfirlik sənədlərini təcili toplayın.',
    RENEW_PASSPORT: 'Müştəriyə pasportu yeniləməyi bildirin.',
    REMIND_SIGNER: 'İmzalayana xatırlatma göndərin və ya müddəti uzadın.',
    CHASE_TRANSLATION: 'Tərcüməçidən statusu soruşun və müştərini məlumatlandırın.',
  },
  de: {
    REVIEW_DOCUMENTS: 'Dokumente prüfen und annehmen oder Korrektur anfordern.',
    REMIND_CLIENT: 'Kunden erinnern oder anrufen.',
    CONTACT_CLIENT: 'Kunden kontaktieren und den nächsten Schritt vereinbaren.',
    CHECK_EMBASSY: 'Status des Antrags bei der Botschaft prüfen.',
    COLLECT_EMBASSY_DOCS: 'Fehlende Botschaftsdokumente dringend einholen.',
    RENEW_PASSPORT: 'Kunden auf die Passverlängerung hinweisen.',
    REMIND_SIGNER: 'Unterzeichner erinnern oder die Frist verlängern.',
    CHASE_TRANSLATION: 'Beim Übersetzer nachfragen und den Kunden informieren.',
  },
  en: {
    REVIEW_DOCUMENTS: 'Review the documents and accept them or request changes.',
    REMIND_CLIENT: 'Send the client a reminder or call them.',
    CONTACT_CLIENT: 'Contact the client and agree on the next step.',
    CHECK_EMBASSY: 'Check the application status with the embassy.',
    COLLECT_EMBASSY_DOCS: 'Collect the missing embassy documents urgently.',
    RENEW_PASSPORT: 'Ask the client to renew the passport.',
    REMIND_SIGNER: 'Remind the signer or extend the deadline.',
    CHASE_TRANSLATION: 'Ask the translator for the status and inform the client.',
  },
  ru: {
    REVIEW_DOCUMENTS: 'Проверьте документы: примите или запросите исправления.',
    REMIND_CLIENT: 'Отправьте клиенту напоминание или позвоните.',
    CONTACT_CLIENT: 'Свяжитесь с клиентом и согласуйте следующий шаг.',
    CHECK_EMBASSY: 'Уточните статус заявления в посольстве.',
    COLLECT_EMBASSY_DOCS: 'Срочно соберите недостающие документы для посольства.',
    RENEW_PASSPORT: 'Попросите клиента обновить паспорт.',
    REMIND_SIGNER: 'Напомните подписанту или продлите срок.',
    CHASE_TRANSLATION: 'Уточните статус у переводчика и сообщите клиенту.',
  },
};

export const riskText = (r: Risk, locale: Locale) => ({ title: TITLES[locale][r.code](r), suggestion: ACTIONS[locale][r.action] });

// ─── Briefing e-mail ───────────────────────────────────────────────────

export interface BriefingCopy {
  subject: (date: string) => string;
  title: string;
  intro: string;
  newCases: string;
  docsWaiting: (docs: number, cases: number) => string;
  decisions: string;
  approved: string;
  refused: string;
  appointments: string;
  interviews: string;
  today: string;
  tomorrow: string;
  expiring: string;
  daysLeft: (d: number) => string;
  stuck: string;
  money: string;
  unpaidShares: string;
  commissions: string;
  overdueTasks: string;
  aiSpend: (spent: string, budget: string) => string;
  more: (n: number) => string;
  none: string;
  cta: string;
  optOut: string;
}

export const BRIEFING_TEXTS: Record<Locale, BriefingCopy> = {
  az: {
    subject: (d) => `Gündəlik brifinq · ${d}`,
    title: 'Gündəlik brifinq',
    intro: 'Bu gün nə vacibdir',
    newCases: 'Yeni müraciətlər (dünən və bu gün)',
    docsWaiting: (d, c) => `Yoxlama gözləyən sənədlər: ${d} (${c} müraciət)`,
    decisions: 'Qərarlar (dünən və bu gün)',
    approved: 'viza verildi',
    refused: 'imtina',
    appointments: 'Səfirlik görüşləri',
    interviews: 'Müsahibələr',
    today: 'bu gün',
    tomorrow: 'sabah',
    expiring: '30 gün ərzində müddəti bitən sənədlər',
    daysLeft: (d) => (d < 0 ? 'müddəti bitib' : `${d} gün`),
    stuck: 'Diqqət tələb edən müraciətlər',
    money: 'Ödənişlər',
    unpaidShares: 'Ödənilməmiş paylar',
    commissions: 'Partnyor komissiyaları (gözləyən)',
    overdueTasks: 'Gecikmiş tapşırıqlar',
    aiSpend: (s, b) => `Bu ay AI xərci: ${s} / ${b}`,
    more: (n) => `… və daha ${n}`,
    none: '—',
    cta: 'İdarə panelini aç',
    optOut: 'Bu e-poçtu AI parametrlərində və ya idarə panelində söndürə bilərsiniz.',
  },
  de: {
    subject: (d) => `Tägliches Briefing · ${d}`,
    title: 'Tägliches Briefing',
    intro: 'Was heute wichtig ist',
    newCases: 'Neue Fälle (gestern und heute)',
    docsWaiting: (d, c) => `Dokumente zur Prüfung: ${d} (${c} Fälle)`,
    decisions: 'Entscheidungen (gestern und heute)',
    approved: 'Visum erteilt',
    refused: 'Ablehnung',
    appointments: 'Botschaftstermine',
    interviews: 'Interviews',
    today: 'heute',
    tomorrow: 'morgen',
    expiring: 'Dokumente, die innerhalb von 30 Tagen ablaufen',
    daysLeft: (d) => (d < 0 ? 'abgelaufen' : `${d} Tage`),
    stuck: 'Fälle, die Aufmerksamkeit brauchen',
    money: 'Zahlungen',
    unpaidShares: 'Offene Anteile',
    commissions: 'Partnerprovisionen (offen)',
    overdueTasks: 'Überfällige Aufgaben',
    aiSpend: (s, b) => `KI-Kosten diesen Monat: ${s} / ${b}`,
    more: (n) => `… und ${n} weitere`,
    none: '—',
    cta: 'Dashboard öffnen',
    optOut: 'Diese E-Mail können Sie in den KI-Einstellungen oder im Dashboard abbestellen.',
  },
  en: {
    subject: (d) => `Daily briefing · ${d}`,
    title: 'Daily briefing',
    intro: 'What matters today',
    newCases: 'New cases (yesterday and today)',
    docsWaiting: (d, c) => `Documents waiting for review: ${d} (${c} cases)`,
    decisions: 'Decisions (yesterday and today)',
    approved: 'visa granted',
    refused: 'refused',
    appointments: 'Embassy appointments',
    interviews: 'Interviews',
    today: 'today',
    tomorrow: 'tomorrow',
    expiring: 'Documents expiring within 30 days',
    daysLeft: (d) => (d < 0 ? 'expired' : `${d} days`),
    stuck: 'Cases that need attention',
    money: 'Payments',
    unpaidShares: 'Unpaid shares',
    commissions: 'Partner commissions (open)',
    overdueTasks: 'Overdue tasks',
    aiSpend: (s, b) => `AI spend this month: ${s} / ${b}`,
    more: (n) => `… and ${n} more`,
    none: '—',
    cta: 'Open the dashboard',
    optOut: 'You can turn this e-mail off in the AI settings or on the dashboard.',
  },
  ru: {
    subject: (d) => `Ежедневная сводка · ${d}`,
    title: 'Ежедневная сводка',
    intro: 'Что важно сегодня',
    newCases: 'Новые заявки (вчера и сегодня)',
    docsWaiting: (d, c) => `Документы на проверке: ${d} (${c} заявок)`,
    decisions: 'Решения (вчера и сегодня)',
    approved: 'виза выдана',
    refused: 'отказ',
    appointments: 'Записи в посольство',
    interviews: 'Собеседования',
    today: 'сегодня',
    tomorrow: 'завтра',
    expiring: 'Документы, истекающие в течение 30 дней',
    daysLeft: (d) => (d < 0 ? 'истёк' : `${d} дн.`),
    stuck: 'Заявки, требующие внимания',
    money: 'Платежи',
    unpaidShares: 'Невыплаченные доли',
    commissions: 'Комиссии партнёров (открытые)',
    overdueTasks: 'Просроченные задачи',
    aiSpend: (s, b) => `Расходы на ИИ в этом месяце: ${s} / ${b}`,
    more: (n) => `… и ещё ${n}`,
    none: '—',
    cta: 'Открыть панель',
    optOut: 'Это письмо можно отключить в настройках ИИ или на панели.',
  },
};
