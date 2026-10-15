import type { ApplicationStatus, Locale } from '@prisma/client';
import { prisma } from '../db.js';
import { notifyUser } from './notifications.js';

/**
 * Notifications of the employers & vacancies area (employer accounts, vacancies, applications), in the
 * recipient's language. Delivered with the shared notifyUser (in-app + push + email per preferences).
 */

type L10n = Record<Locale, string>;
type Msg = { title: L10n; body: L10n };

const line = (label: L10n, value: string | null | undefined, l: Locale) => (value ? `\n\n${label[l]}: ${value}` : '');
const REASON: L10n = { az: 'Səbəb', de: 'Grund', en: 'Reason', ru: 'Причина' };
const NOTE: L10n = { az: 'Qeyd', de: 'Hinweis', en: 'Note', ru: 'Примечание' };

export const APPLICATION_STATUS_TEXT: Record<ApplicationStatus, L10n> = {
  NEW: { az: 'Yeni', de: 'Neu', en: 'New', ru: 'Новая' },
  SHORTLISTED: { az: 'Seçilmişlər siyahısında', de: 'In der Vorauswahl', en: 'Shortlisted', ru: 'В шорт-листе' },
  PROPOSED: { az: 'İşəgötürənə təqdim edildi', de: 'Dem Arbeitgeber vorgestellt', en: 'Presented to the employer', ru: 'Представлена работодателю' },
  INTERVIEW: { az: 'Müsahibə', de: 'Vorstellungsgespräch', en: 'Interview', ru: 'Собеседование' },
  ACCEPTED: { az: 'Qəbul edildi', de: 'Zusage', en: 'Accepted', ru: 'Принята' },
  REJECTED: { az: 'Rədd edildi', de: 'Absage', en: 'Not selected', ru: 'Отклонена' },
  WITHDRAWN: { az: 'Geri götürüldü', de: 'Zurückgezogen', en: 'Withdrawn', ru: 'Отозвана' },
};

const CANDIDATE_STATUS_BODY: Partial<Record<ApplicationStatus, L10n>> = {
  SHORTLISTED: {
    az: 'Profiliniz bu vakansiya üçün seçilmişlər siyahısına əlavə edildi. Növbəti addımlar barədə sizə xəbər verəcəyik.',
    de: 'Ihr Profil wurde für diese Stelle in die Vorauswahl aufgenommen. Wir informieren Sie über die nächsten Schritte.',
    en: 'Your profile was shortlisted for this vacancy. We will let you know about the next steps.',
    ru: 'Ваш профиль включён в шорт-лист по этой вакансии. Мы сообщим о следующих шагах.',
  },
  PROPOSED: {
    az: 'Anonim profiliniz işəgötürənə təqdim edildi. İşəgötürənin cavabını gözləyirik.',
    de: 'Ihr anonymisiertes Profil wurde dem Arbeitgeber vorgestellt. Wir warten auf seine Rückmeldung.',
    en: 'Your anonymised profile was presented to the employer. We are waiting for their feedback.',
    ru: 'Ваш анонимный профиль представлен работодателю. Ждём его ответа.',
  },
  INTERVIEW: {
    az: 'İşəgötürən sizinlə müsahibə keçirmək istəyir. Əməkdaşımız tarix və format barədə sizinlə əlaqə saxlayacaq.',
    de: 'Der Arbeitgeber möchte ein Vorstellungsgespräch mit Ihnen führen. Unser Team meldet sich wegen Termin und Format.',
    en: 'The employer would like to interview you. Our team will contact you about the date and format.',
    ru: 'Работодатель хочет провести с вами собеседование. Наш сотрудник свяжется с вами насчёт даты и формата.',
  },
  ACCEPTED: {
    az: 'Təbriklər! İşəgötürən namizədliyinizi qəbul etdi. Növbəti addım viza prosesidir — əməkdaşımız sizinlə əlaqə saxlayacaq.',
    de: 'Herzlichen Glückwunsch! Der Arbeitgeber hat Ihnen zugesagt. Als Nächstes folgt das Visumverfahren — unser Team meldet sich bei Ihnen.',
    en: 'Congratulations! The employer accepted you. The next step is the visa process — our team will contact you.',
    ru: 'Поздравляем! Работодатель одобрил вашу кандидатуру. Следующий шаг — визовый процесс, наш сотрудник свяжется с вами.',
  },
  REJECTED: {
    az: 'Təəssüf ki, bu vakansiya üzrə namizədliyiniz seçilmədi. Digər uyğun vakansiyalara baxmağı tövsiyə edirik.',
    de: 'Leider wurden Sie für diese Stelle nicht ausgewählt. Schauen Sie sich gern weitere passende Stellen an.',
    en: 'Unfortunately you were not selected for this vacancy. Have a look at other matching vacancies.',
    ru: 'К сожалению, по этой вакансии выбрали другого кандидата. Посмотрите другие подходящие вакансии.',
  },
};

const MESSAGES = {
  COMPANY_APPROVED: (): Msg => ({
    title: { az: 'Şirkət hesabınız təsdiqləndi', de: 'Ihr Unternehmenskonto wurde freigeschaltet', en: 'Your company account was approved', ru: 'Аккаунт вашей компании одобрен' },
    body: {
      az: 'Şirkət hesabınız aktivdir. İndi vakansiyaları yoxlamaya göndərə və təqdim olunan namizədlərə baxa bilərsiniz.',
      de: 'Ihr Unternehmenskonto ist aktiv. Sie können jetzt Stellen zur Prüfung einreichen und vorgestellte Kandidaten sehen.',
      en: 'Your company account is active. You can now submit vacancies for review and see presented candidates.',
      ru: 'Аккаунт компании активен. Теперь вы можете отправлять вакансии на проверку и смотреть представленных кандидатов.',
    },
  }),
  COMPANY_SUSPENDED: (): Msg => ({
    title: { az: 'Şirkət hesabınız dayandırıldı', de: 'Ihr Unternehmenskonto wurde gesperrt', en: 'Your company account was suspended', ru: 'Аккаунт вашей компании приостановлен' },
    body: {
      az: 'Şirkət hesabınız müvəqqəti dayandırıldı. Suallarınız üçün bizimlə əlaqə saxlayın.',
      de: 'Ihr Unternehmenskonto wurde vorübergehend gesperrt. Bei Fragen kontaktieren Sie uns bitte.',
      en: 'Your company account was temporarily suspended. Please contact us if you have questions.',
      ru: 'Аккаунт компании временно приостановлен. Если у вас есть вопросы, свяжитесь с нами.',
    },
  }),
  VACANCY_APPROVED: (title: string): Msg => ({
    title: { az: 'Vakansiya dərc edildi', de: 'Stelle veröffentlicht', en: 'Vacancy published', ru: 'Вакансия опубликована' },
    body: {
      az: `"${title}" vakansiyası yoxlanıldı və saytda dərc edildi.`,
      de: `Die Stelle „${title}" wurde geprüft und auf der Website veröffentlicht.`,
      en: `The vacancy "${title}" was reviewed and published on the website.`,
      ru: `Вакансия «${title}» проверена и опубликована на сайте.`,
    },
  }),
  VACANCY_REJECTED: (title: string): Msg => ({
    title: { az: 'Vakansiyada düzəliş tələb olunur', de: 'Stelle benötigt Änderungen', en: 'Vacancy needs changes', ru: 'Вакансия требует исправлений' },
    body: {
      az: `"${title}" vakansiyası dərc edilmədi. Zəhmət olmasa düzəliş edib yenidən göndərin.`,
      de: `Die Stelle „${title}" wurde nicht veröffentlicht. Bitte überarbeiten und erneut einreichen.`,
      en: `The vacancy "${title}" was not published. Please edit it and submit it again.`,
      ru: `Вакансия «${title}» не опубликована. Пожалуйста, исправьте её и отправьте снова.`,
    },
  }),
  CANDIDATE_PROPOSED: (title: string): Msg => ({
    title: { az: 'Yeni namizəd təqdim edildi', de: 'Neuer Kandidat vorgestellt', en: 'New candidate presented', ru: 'Представлен новый кандидат' },
    body: {
      az: `"${title}" vakansiyası üçün yeni namizəd təqdim etdik. Profilə baxıb qərarınızı bildirin.`,
      de: `Wir haben für die Stelle „${title}" einen neuen Kandidaten vorgestellt. Bitte prüfen Sie das Profil und geben Sie uns Ihre Entscheidung.`,
      en: `We presented a new candidate for the vacancy "${title}". Please review the profile and let us know your decision.`,
      ru: `Мы представили нового кандидата на вакансию «${title}». Посмотрите профиль и сообщите о решении.`,
    },
  }),
};

const usersOfCompany = (companyId: string) =>
  prisma.user.findMany({ where: { companyId, role: 'COMPANY', isActive: true }, select: { id: true, locale: true } });

const sendTo = async (users: { id: string; locale: Locale }[], type: string, msg: Msg, link: string, extra?: (l: Locale) => string) => {
  for (const u of users) {
    await notifyUser(u.id, { type, title: msg.title[u.locale], body: msg.body[u.locale] + (extra?.(u.locale) ?? ''), link });
  }
};

/** First non-empty translation in the recipient's language. */
export const pickL10n = (v: unknown, l: Locale): string => {
  const o = (v ?? {}) as Partial<Record<Locale, string>>;
  return o[l] || o.de || o.en || o.az || o.ru || '';
};

export const notifyCompanyStatus = async (companyId: string, status: 'ACTIVE' | 'SUSPENDED', reason?: string | null) => {
  const users = await usersOfCompany(companyId);
  const msg = status === 'ACTIVE' ? MESSAGES.COMPANY_APPROVED() : MESSAGES.COMPANY_SUSPENDED();
  await sendTo(users, status === 'ACTIVE' ? 'COMPANY_APPROVED' : 'COMPANY_SUSPENDED', msg, '/company', (l) => line(REASON, reason, l));
};

export const notifyVacancyReviewed = async (
  vacancy: { id: string; companyId: string | null; title: unknown },
  approved: boolean,
  reason?: string | null,
) => {
  if (!vacancy.companyId) return;
  const users = await usersOfCompany(vacancy.companyId);
  for (const u of users) {
    const title = pickL10n(vacancy.title, u.locale);
    const msg = approved ? MESSAGES.VACANCY_APPROVED(title) : MESSAGES.VACANCY_REJECTED(title);
    await notifyUser(u.id, {
      type: approved ? 'VACANCY_APPROVED' : 'VACANCY_REJECTED',
      title: msg.title[u.locale],
      body: msg.body[u.locale] + line(REASON, reason, u.locale),
      link: `/company/vacancies/${vacancy.id}`,
    });
  }
};

export const notifyCandidateProposed = async (vacancy: { id: string; companyId: string | null; title: unknown }) => {
  if (!vacancy.companyId) return;
  const users = await usersOfCompany(vacancy.companyId);
  for (const u of users) {
    const msg = MESSAGES.CANDIDATE_PROPOSED(pickL10n(vacancy.title, u.locale));
    await notifyUser(u.id, { type: 'CANDIDATE_PROPOSED', title: msg.title[u.locale], body: msg.body[u.locale], link: '/company/candidates' });
  }
};

/** Tells the candidate their application moved (not for NEW / WITHDRAWN, which they cause themselves). */
export const notifyApplicationStatus = async (
  userId: string,
  vacancy: { title: unknown },
  status: ApplicationStatus,
  note?: string | null,
) => {
  const body = CANDIDATE_STATUS_BODY[status];
  if (!body) return;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { locale: true } });
  if (!user) return;
  const l = user.locale;
  const vacancyTitle = pickL10n(vacancy.title, l);
  const prefix: L10n = { az: 'Müraciət', de: 'Bewerbung', en: 'Application', ru: 'Отклик' };
  await notifyUser(userId, {
    type: 'APPLICATION_STATUS',
    title: `${prefix[l]}: ${APPLICATION_STATUS_TEXT[status][l]} · ${vacancyTitle}`.slice(0, 190),
    body: body[l] + line(NOTE, note, l),
    link: '/account/applications',
    // Shortlisting is minor: in-app only.
    email: status !== 'SHORTLISTED',
  });
};
