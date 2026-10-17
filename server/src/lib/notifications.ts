import type { Locale } from '@prisma/client';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { renderEmail, sendMail } from './mailer.js';
import { sendPush } from './push.js';
import { publish } from './messaging/realtime.js';
import { sendWhatsApp } from './messaging/outbound.js';
import { getOverride, renderTemplate } from './messaging/templates.js';

export type NotificationType =
  | 'CASE_CREATED'
  | 'DOCS_CHANGES_REQUESTED'
  | 'CONTRACT_SENT'
  | 'CONTRACT_RESIGN_REQUESTED'
  | 'EMBASSY_DOCS_REQUESTED'
  | 'EMBASSY_CHANGES_REQUESTED'
  | 'APPOINTMENT_SCHEDULED'
  | 'DECISION_PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'REOPENED'
  | 'DOCUMENT_ACCEPTED'
  | 'DOCUMENT_REJECTED'
  | 'NEW_MESSAGE';

export interface NotifyParams {
  number?: string;
  note?: string | null;
  date?: string;
  place?: string;
  reason?: string;
  doc?: string;
}

type Template = (p: NotifyParams) => { title: string; body: string };
type Catalog = Record<NotificationType, Template>;

const noteLine = (label: string, note?: string | null) => (note ? `\n\n${label}: ${note}` : '');

const az: Catalog = {
  CASE_CREATED: (p) => ({ title: `Müraciətiniz yaradıldı (${p.number})`, body: 'Müraciətiniz uğurla yaradıldı. İndi kabinetinizdə tələb olunan sənədləri yükləyin və yoxlamaya göndərin.' }),
  DOCS_CHANGES_REQUESTED: (p) => ({ title: 'Sənədlərdə düzəliş tələb olunur', body: 'Əməkdaşımız sənədlərinizi yoxladı və bəzi düzəlişlər tələb edir. Zəhmət olmasa qeyd olunan sənədləri yenidən yükləyin.' + noteLine('Qeyd', p.note) }),
  CONTRACT_SENT: () => ({ title: 'Müqavilə imzalanmağa göndərildi', body: 'Sənədləriniz təsdiqləndi. Müqavilə kabinetinizə göndərildi. Zəhmət olmasa diqqətlə oxuyun və elektron imzalayın.' }),
  CONTRACT_RESIGN_REQUESTED: (p) => ({ title: 'Müqavilənin yenidən imzalanması tələb olunur', body: 'İmzalanmış müqavilə qəbul edilmədi. Zəhmət olmasa müqaviləni yenidən imzalayın.' + noteLine('Səbəb', p.note) }),
  EMBASSY_DOCS_REQUESTED: () => ({ title: 'Səfirlik üçün sənədlər', body: 'Müqaviləniz təsdiqləndi. Növbəti addım: səfirlik üçün tələb olunan sənədləri kabinetinizdə yükləyin.' }),
  EMBASSY_CHANGES_REQUESTED: (p) => ({ title: 'Səfirlik sənədlərində düzəliş tələb olunur', body: 'Səfirlik sənədlərinizdə düzəliş tələb olunur. Zəhmət olmasa qeyd olunan sənədləri yenidən yükləyin.' + noteLine('Qeyd', p.note) }),
  APPOINTMENT_SCHEDULED: (p) => ({ title: 'Səfirlik görüşü təyin edildi', body: `Səfirlik görüşünüz təyin edildi.\n\nTarix: ${p.date}\nYer: ${p.place}\n\nZəhmət olmasa bütün orijinal sənədlərinizlə vaxtında gəlin.` + noteLine('Qeyd', p.note) }),
  DECISION_PENDING: () => ({ title: 'Müraciət səfirliyə təqdim edildi', body: 'Viza müraciətiniz səfirliyə təqdim edildi. Qərar gözlənilir. Nəticə məlum olan kimi sizə bildiriş göndəriləcək.' }),
  APPROVED: (p) => ({ title: 'Təbriklər! Vizanız təsdiqləndi', body: 'Vizanız təsdiqləndi! Almaniyaya gəliş, yaşayış və işə başlama ilə bağlı növbəti addımlar üçün sizinlə əlaqə saxlayacağıq.' + noteLine('Qeyd', p.reason) }),
  REJECTED: (p) => ({ title: 'Viza qərarı: imtina', body: 'Təəssüf ki, səfirlik viza müraciətinizi rədd etdi.' + noteLine('Səbəb', p.reason) + '\n\nNövbəti addımları müzakirə etmək üçün əməkdaşımız sizinlə əlaqə saxlayacaq.' }),
  CANCELLED: (p) => ({ title: 'Müraciət ləğv edildi', body: 'Müraciətiniz ləğv edildi.' + noteLine('Səbəb', p.reason) }),
  REOPENED: (p) => ({ title: 'Müraciət yenidən açıldı', body: 'Müraciətiniz yenidən açıldı. Kabinetinizdə növbəti addımlara baxın.' + noteLine('Qeyd', p.note) }),
  DOCUMENT_ACCEPTED: (p) => ({ title: 'Sənəd qəbul edildi', body: `"${p.doc}" sənədi qəbul edildi.` }),
  DOCUMENT_REJECTED: (p) => ({ title: 'Sənəd qəbul edilmədi', body: `"${p.doc}" sənədi qəbul edilmədi. Zəhmət olmasa yenidən yükləyin.` + noteLine('Səbəb', p.note) }),
  NEW_MESSAGE: () => ({ title: 'Yeni mesaj', body: 'Triad Vision əməkdaşından yeni mesajınız var.' }),
};

const de: Catalog = {
  CASE_CREATED: (p) => ({ title: `Ihr Antrag wurde erstellt (${p.number})`, body: 'Ihr Antrag wurde erfolgreich erstellt. Bitte laden Sie nun die erforderlichen Dokumente in Ihrem Kundenbereich hoch und reichen Sie sie zur Prüfung ein.' }),
  DOCS_CHANGES_REQUESTED: (p) => ({ title: 'Korrekturen an Ihren Dokumenten erforderlich', body: 'Wir haben Ihre Dokumente geprüft und benötigen einige Korrekturen. Bitte laden Sie die markierten Dokumente erneut hoch.' + noteLine('Hinweis', p.note) }),
  CONTRACT_SENT: () => ({ title: 'Vertrag zur Unterschrift bereit', body: 'Ihre Dokumente wurden bestätigt. Der Vertrag liegt in Ihrem Kundenbereich bereit. Bitte lesen Sie ihn sorgfältig und unterschreiben Sie elektronisch.' }),
  CONTRACT_RESIGN_REQUESTED: (p) => ({ title: 'Bitte unterschreiben Sie den Vertrag erneut', body: 'Der unterschriebene Vertrag konnte nicht akzeptiert werden. Bitte unterschreiben Sie erneut.' + noteLine('Grund', p.note) }),
  EMBASSY_DOCS_REQUESTED: () => ({ title: 'Dokumente für die Botschaft', body: 'Ihr Vertrag wurde bestätigt. Nächster Schritt: Laden Sie die für die Botschaft erforderlichen Dokumente hoch.' }),
  EMBASSY_CHANGES_REQUESTED: (p) => ({ title: 'Korrekturen an den Botschaftsunterlagen erforderlich', body: 'Ihre Botschaftsunterlagen benötigen Korrekturen. Bitte laden Sie die markierten Dokumente erneut hoch.' + noteLine('Hinweis', p.note) }),
  APPOINTMENT_SCHEDULED: (p) => ({ title: 'Botschaftstermin vereinbart', body: `Ihr Termin bei der Botschaft wurde vereinbart.\n\nDatum: ${p.date}\nOrt: ${p.place}\n\nBitte erscheinen Sie pünktlich mit allen Originaldokumenten.` + noteLine('Hinweis', p.note) }),
  DECISION_PENDING: () => ({ title: 'Antrag bei der Botschaft eingereicht', body: 'Ihr Visumantrag wurde bei der Botschaft eingereicht. Wir benachrichtigen Sie, sobald die Entscheidung vorliegt.' }),
  APPROVED: (p) => ({ title: 'Herzlichen Glückwunsch! Ihr Visum wurde erteilt', body: 'Ihr Visum wurde erteilt! Wir melden uns bei Ihnen zu Einreise, Wohnung und Arbeitsbeginn.' + noteLine('Hinweis', p.reason) }),
  REJECTED: (p) => ({ title: 'Visumentscheidung: Ablehnung', body: 'Leider hat die Botschaft Ihren Visumantrag abgelehnt.' + noteLine('Grund', p.reason) + '\n\nUnser Team kontaktiert Sie, um die nächsten Schritte zu besprechen.' }),
  CANCELLED: (p) => ({ title: 'Antrag storniert', body: 'Ihr Antrag wurde storniert.' + noteLine('Grund', p.reason) }),
  REOPENED: (p) => ({ title: 'Antrag wieder geöffnet', body: 'Ihr Antrag wurde wieder geöffnet. Die nächsten Schritte finden Sie in Ihrem Kundenbereich.' + noteLine('Hinweis', p.note) }),
  DOCUMENT_ACCEPTED: (p) => ({ title: 'Dokument akzeptiert', body: `Das Dokument „${p.doc}" wurde akzeptiert.` }),
  DOCUMENT_REJECTED: (p) => ({ title: 'Dokument nicht akzeptiert', body: `Das Dokument „${p.doc}" wurde nicht akzeptiert. Bitte erneut hochladen.` + noteLine('Grund', p.note) }),
  NEW_MESSAGE: () => ({ title: 'Neue Nachricht', body: 'Sie haben eine neue Nachricht vom Triad-Vision-Team.' }),
};

const en: Catalog = {
  CASE_CREATED: (p) => ({ title: `Your application was created (${p.number})`, body: 'Your application was created. Please upload the required documents in your account and submit them for review.' }),
  DOCS_CHANGES_REQUESTED: (p) => ({ title: 'Changes needed on your documents', body: 'We reviewed your documents and need some changes. Please re-upload the marked documents.' + noteLine('Note', p.note) }),
  CONTRACT_SENT: () => ({ title: 'Contract ready to sign', body: 'Your documents were approved. Your contract is waiting in your account. Please read it carefully and sign electronically.' }),
  CONTRACT_RESIGN_REQUESTED: (p) => ({ title: 'Please sign the contract again', body: 'The signed contract could not be accepted. Please sign it again.' + noteLine('Reason', p.note) }),
  EMBASSY_DOCS_REQUESTED: () => ({ title: 'Documents for the embassy', body: 'Your contract was confirmed. Next step: upload the documents required by the embassy.' }),
  EMBASSY_CHANGES_REQUESTED: (p) => ({ title: 'Changes needed on embassy documents', body: 'Your embassy documents need changes. Please re-upload the marked documents.' + noteLine('Note', p.note) }),
  APPOINTMENT_SCHEDULED: (p) => ({ title: 'Embassy appointment scheduled', body: `Your embassy appointment is scheduled.\n\nDate: ${p.date}\nPlace: ${p.place}\n\nPlease arrive on time with all original documents.` + noteLine('Note', p.note) }),
  DECISION_PENDING: () => ({ title: 'Application lodged at the embassy', body: 'Your visa application was lodged at the embassy. We will notify you as soon as the decision is made.' }),
  APPROVED: (p) => ({ title: 'Congratulations! Your visa was approved', body: 'Your visa was approved! We will contact you about travel, housing and your first working day.' + noteLine('Note', p.reason) }),
  REJECTED: (p) => ({ title: 'Visa decision: refused', body: 'Unfortunately the embassy refused your visa application.' + noteLine('Reason', p.reason) + '\n\nOur team will contact you to discuss next steps.' }),
  CANCELLED: (p) => ({ title: 'Application cancelled', body: 'Your application was cancelled.' + noteLine('Reason', p.reason) }),
  REOPENED: (p) => ({ title: 'Application reopened', body: 'Your application was reopened. See the next steps in your account.' + noteLine('Note', p.note) }),
  DOCUMENT_ACCEPTED: (p) => ({ title: 'Document accepted', body: `The document "${p.doc}" was accepted.` }),
  DOCUMENT_REJECTED: (p) => ({ title: 'Document not accepted', body: `The document "${p.doc}" was not accepted. Please upload it again.` + noteLine('Reason', p.note) }),
  NEW_MESSAGE: () => ({ title: 'New message', body: 'You have a new message from the Triad Vision team.' }),
};

const ru: Catalog = {
  CASE_CREATED: (p) => ({ title: `Ваша заявка создана (${p.number})`, body: 'Ваша заявка успешно создана. Загрузите необходимые документы в личном кабинете и отправьте их на проверку.' }),
  DOCS_CHANGES_REQUESTED: (p) => ({ title: 'Требуются исправления в документах', body: 'Мы проверили ваши документы, требуются исправления. Пожалуйста, загрузите отмеченные документы повторно.' + noteLine('Примечание', p.note) }),
  CONTRACT_SENT: () => ({ title: 'Договор готов к подписанию', body: 'Ваши документы подтверждены. Договор находится в личном кабинете. Пожалуйста, внимательно прочитайте и подпишите его электронно.' }),
  CONTRACT_RESIGN_REQUESTED: (p) => ({ title: 'Пожалуйста, подпишите договор повторно', body: 'Подписанный договор не был принят. Пожалуйста, подпишите его повторно.' + noteLine('Причина', p.note) }),
  EMBASSY_DOCS_REQUESTED: () => ({ title: 'Документы для посольства', body: 'Ваш договор подтверждён. Следующий шаг: загрузите документы, необходимые для посольства.' }),
  EMBASSY_CHANGES_REQUESTED: (p) => ({ title: 'Требуются исправления в документах для посольства', body: 'В документах для посольства требуются исправления. Пожалуйста, загрузите отмеченные документы повторно.' + noteLine('Примечание', p.note) }),
  APPOINTMENT_SCHEDULED: (p) => ({ title: 'Назначена встреча в посольстве', body: `Ваша встреча в посольстве назначена.\n\nДата: ${p.date}\nМесто: ${p.place}\n\nПожалуйста, приходите вовремя со всеми оригиналами документов.` + noteLine('Примечание', p.note) }),
  DECISION_PENDING: () => ({ title: 'Заявка подана в посольство', body: 'Ваша визовая заявка подана в посольство. Мы сообщим вам, как только будет принято решение.' }),
  APPROVED: (p) => ({ title: 'Поздравляем! Ваша виза одобрена', body: 'Ваша виза одобрена! Мы свяжемся с вами по поводу переезда, жилья и начала работы.' + noteLine('Примечание', p.reason) }),
  REJECTED: (p) => ({ title: 'Решение по визе: отказ', body: 'К сожалению, посольство отказало в выдаче визы.' + noteLine('Причина', p.reason) + '\n\nНаш сотрудник свяжется с вами, чтобы обсудить дальнейшие шаги.' }),
  CANCELLED: (p) => ({ title: 'Заявка отменена', body: 'Ваша заявка отменена.' + noteLine('Причина', p.reason) }),
  REOPENED: (p) => ({ title: 'Заявка возобновлена', body: 'Ваша заявка возобновлена. Следующие шаги смотрите в личном кабинете.' + noteLine('Примечание', p.note) }),
  DOCUMENT_ACCEPTED: (p) => ({ title: 'Документ принят', body: `Документ «${p.doc}» принят.` }),
  DOCUMENT_REJECTED: (p) => ({ title: 'Документ не принят', body: `Документ «${p.doc}» не принят. Пожалуйста, загрузите его повторно.` + noteLine('Причина', p.note) }),
  NEW_MESSAGE: () => ({ title: 'Новое сообщение', body: 'У вас новое сообщение от команды Triad Vision.' }),
};

const catalogs: Record<Locale, Catalog> = { az, de, en, ru };

const ctaLabel: Record<Locale, string> = {
  az: 'Kabinetə keç',
  de: 'Zum Kundenbereich',
  en: 'Open my account',
  ru: 'Перейти в кабинет',
};

/** Types that are frequent and minor: in-app only, no email. */
const IN_APP_ONLY = new Set<NotificationType>(['DOCUMENT_ACCEPTED', 'DOCUMENT_REJECTED']);

export const NOTIFICATION_TYPES = Object.keys(az) as NotificationType[];

/** Placeholders an admin may use in the template editor, per type (`number` and `firstName` always work). */
export const PLACEHOLDERS: Record<NotificationType, string[]> = {
  CASE_CREATED: ['number', 'firstName'],
  DOCS_CHANGES_REQUESTED: ['number', 'firstName', 'note'],
  CONTRACT_SENT: ['number', 'firstName'],
  CONTRACT_RESIGN_REQUESTED: ['number', 'firstName', 'note'],
  EMBASSY_DOCS_REQUESTED: ['number', 'firstName'],
  EMBASSY_CHANGES_REQUESTED: ['number', 'firstName', 'note'],
  APPOINTMENT_SCHEDULED: ['number', 'firstName', 'date', 'place', 'note'],
  DECISION_PENDING: ['number', 'firstName'],
  APPROVED: ['number', 'firstName', 'reason'],
  REJECTED: ['number', 'firstName', 'reason'],
  CANCELLED: ['number', 'firstName', 'reason'],
  REOPENED: ['number', 'firstName', 'note'],
  DOCUMENT_ACCEPTED: ['number', 'firstName', 'doc'],
  DOCUMENT_REJECTED: ['number', 'firstName', 'doc', 'note'],
  NEW_MESSAGE: ['number', 'firstName'],
};

/** Sample values for previews in the template editor. */
export const SAMPLE_PARAMS: Record<Locale, NotifyParams & { firstName: string }> = {
  az: { number: 'TV-2026-0042', firstName: 'Əli', note: 'Pasportun surəti aydın deyil', date: '20 noyabr 2026, 09:30 (Bakı / GMT+4)', place: 'Almaniya səfirliyi, Bakı', reason: 'Maliyyə sübutu çatışmır', doc: 'Pasport' },
  de: { number: 'TV-2026-0042', firstName: 'Ali', note: 'Die Passkopie ist nicht lesbar', date: '20. November 2026, 09:30 (Baku / GMT+4)', place: 'Deutsche Botschaft Baku', reason: 'Finanzierungsnachweis fehlt', doc: 'Reisepass' },
  en: { number: 'TV-2026-0042', firstName: 'Ali', note: 'The passport copy is not legible', date: '20 November 2026, 09:30 (Baku / GMT+4)', place: 'German Embassy Baku', reason: 'Proof of funds missing', doc: 'Passport' },
  ru: { number: 'TV-2026-0042', firstName: 'Али', note: 'Копия паспорта нечитаема', date: '20 ноября 2026, 09:30 (Баку / GMT+4)', place: 'Посольство Германии, Баку', reason: 'Нет подтверждения средств', doc: 'Паспорт' },
};

/** Text from the code catalog (no admin override). */
export const catalogText = (type: NotificationType, locale: Locale, params: NotifyParams = {}) => catalogs[locale][type](params);

/**
 * Title and body for a notification: the admin override for (type, locale) when one exists
 * (rendered with {{placeholders}}), otherwise the code catalog.
 */
export const renderNotification = async (type: NotificationType, locale: Locale, params: NotifyParams & { firstName?: string } = {}) => {
  const override = await getOverride(type, locale);
  if (override) return { title: renderTemplate(override.title, params), body: renderTemplate(override.body, params) };
  return catalogText(type, locale, params);
};

export const formatDateTime = (d: Date, locale: Locale) =>
  new Intl.DateTimeFormat({ az: 'az-Latn-AZ', de: 'de-DE', en: 'en-GB', ru: 'ru-RU' }[locale], {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: 'Asia/Baku',
  }).format(d) + ' (Bakı / GMT+4)';

/** Notify a client about their case: stores an in-app notification and emails them in their language. */
export const notifyClient = async (
  caseId: string,
  type: NotificationType,
  params: NotifyParams = {},
) => {
  const c = await prisma.case.findUniqueOrThrow({ where: { id: caseId }, include: { client: true } });
  const locale = c.client.locale;
  const { title, body } = await renderNotification(type, locale, { number: c.number, firstName: c.client.firstName, ...params });
  const link = `/account/cases/${c.id}`;

  const n = await prisma.notification.create({
    data: { userId: c.clientId, caseId, type, title, body, link },
  });
  publish(c.clientId, 'notification', { id: n?.id, type, title, body, link, caseId });
  // In-app notification is always kept; push and email follow the client's preferences.
  if (c.client.pushNotifications !== false) void sendPush([c.clientId], { title, body, data: { caseId, link, type } });
  // WhatsApp mirrors the in-app text for clients with a phone number who opted in (minor types stay in-app only).
  if (!IN_APP_ONLY.has(type) && c.client.phone && c.client.whatsappOptIn !== false) {
    void sendWhatsApp({ userId: c.clientId, caseId, templateKey: type }, `${title}\n\n${body}`);
  }

  if (!IN_APP_ONLY.has(type) && c.client.emailNotifications !== false) {
    const html = renderEmail(title, `${body}\n\n${c.number}`, {
      label: ctaLabel[locale],
      url: `${config.clientUrl}${link}`,
    });
    // fire-and-forget so a slow SMTP server does not delay the API response
    void sendMail(c.client.email, `Triad Vision · ${title}`, html);
  }
};

/** Notify staff (admin inbox + in-app for assigned staff / all admins). */
export const notifyStaff = async (subject: string, body: string, opts: { caseId?: string; link?: string; type?: string } = {}) => {
  const recipients = await prisma.user.findMany({
    where: opts.caseId
      ? { OR: [{ role: { in: ['ADMIN', 'SUPER_ADMIN'] } }, { assignedCases: { some: { id: opts.caseId } } }], isActive: true }
      : { role: { in: ['ADMIN', 'SUPER_ADMIN'] }, isActive: true },
    select: { id: true },
  });
  if (recipients.length) {
    void sendPush(
      recipients.map((r) => r.id),
      { title: subject, body, data: { link: opts.link ?? '', caseId: opts.caseId ?? '', type: opts.type ?? 'STAFF' } },
    );
    await prisma.notification.createMany({
      data: recipients.map((r) => ({
        userId: r.id,
        caseId: opts.caseId,
        type: 'STAFF',
        title: subject,
        body,
        link: opts.link,
      })),
    });
    publish(
      recipients.map((r) => r.id),
      'notification',
      { type: opts.type ?? 'STAFF', title: subject, body, link: opts.link ?? null, caseId: opts.caseId ?? null },
    );
  }
  const url = opts.link ? `${config.clientUrl}${opts.link}` : undefined;
  void sendMail(
    config.adminNotifyEmail,
    `[Triad Vision] ${subject}`,
    renderEmail(subject, body, url ? { label: 'Admin paneldə aç', url } : undefined),
  );
};

/**
 * Generic notification for any user (candidate, employer or staff): always stores an in-app
 * notification; push and email follow the user's preferences. Texts must already be in the user's
 * language — callers pick them from their own catalogue using `user.locale`.
 */
export const notifyUser = async (
  userId: string,
  msg: {
    type: string;
    title: string;
    body: string;
    link?: string;
    caseId?: string;
    email?: boolean;
    push?: boolean;
    ctaLabel?: string;
    /** Send the e-mail even when the user turned e-mail notifications off (work assignments). */
    forceEmail?: boolean;
  },
) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.isActive) return;
  const n = await prisma.notification.create({
    data: { userId, caseId: msg.caseId, type: msg.type, title: msg.title, body: msg.body, link: msg.link },
  });
  publish(userId, 'notification', { id: n?.id, type: msg.type, title: msg.title, body: msg.body, link: msg.link ?? null, caseId: msg.caseId ?? null });
  if (msg.push !== false && user.pushNotifications !== false) {
    void sendPush([userId], { title: msg.title, body: msg.body, data: { link: msg.link ?? '', caseId: msg.caseId ?? '', type: msg.type } });
  }
  if (msg.email !== false && (msg.forceEmail || user.emailNotifications !== false)) {
    const cta = msg.link ? { label: msg.ctaLabel ?? ctaLabel[user.locale], url: `${config.clientUrl}${msg.link}` } : undefined;
    void sendMail(user.email, `Triad Vision · ${msg.title}`, renderEmail(msg.title, msg.body, cta));
  }
};
