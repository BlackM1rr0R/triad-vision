import type { Locale } from '@prisma/client';

/** Texts of the post-arrival check-ins (worker / employer / staff alert), in the recipient's language. */

export const TOPICS = ['HOUSING', 'SALARY', 'WORKPLACE', 'HEALTH', 'DOCUMENTS', 'OTHER'] as const;
export type Topic = (typeof TOPICS)[number];

export const LEFT_REASONS = ['QUIT', 'DISMISSED', 'CONTRACT_ENDED', 'CHANGED_EMPLOYER', 'RETURNED_HOME', 'OTHER'] as const;
export type LeftReason = (typeof LEFT_REASONS)[number];

const TOPIC_LABEL: Record<Locale, Record<Topic, string>> = {
  az: { HOUSING: 'Mənzil', SALARY: 'Maaş', WORKPLACE: 'İş yeri', HEALTH: 'Sağlamlıq', DOCUMENTS: 'Sənədlər', OTHER: 'Digər' },
  de: { HOUSING: 'Wohnung', SALARY: 'Gehalt', WORKPLACE: 'Arbeitsplatz', HEALTH: 'Gesundheit', DOCUMENTS: 'Dokumente', OTHER: 'Sonstiges' },
  en: { HOUSING: 'Housing', SALARY: 'Salary', WORKPLACE: 'Workplace', HEALTH: 'Health', DOCUMENTS: 'Documents', OTHER: 'Other' },
  ru: { HOUSING: 'Жильё', SALARY: 'Зарплата', WORKPLACE: 'Место работы', HEALTH: 'Здоровье', DOCUMENTS: 'Документы', OTHER: 'Другое' },
};

export const topicLabels = (topics: string[], l: Locale) => topics.map((t) => TOPIC_LABEL[l]?.[t as Topic] ?? t).join(', ');

interface WorkerP {
  firstName: string;
  days: number;
}
interface EmployerP {
  company: string;
  worker: string;
}
interface StaffP {
  worker: string;
  number: string;
  days: number;
  topics: string;
  comment: string | null;
  employer: boolean;
}

const T: Record<
  Locale,
  {
    workerTitle: string;
    workerBody: (p: WorkerP) => string;
    cta: string;
    employerTitle: string;
    employerBody: (p: EmployerP) => string;
    employerCta: string;
    issueTitle: (p: StaffP) => string;
    issueBody: (p: StaffP) => string;
    taskTitle: (p: StaffP) => string;
  }
> = {
  az: {
    workerTitle: 'Almaniyada necəsiniz?',
    workerBody: (p) => `Salam, ${p.firstName}! Almaniyaya gəlişinizdən ${p.days} gün keçdi. Hər şey qaydasındadırmı? Bir toxunuşla cavab verin — problem varsa, komandamız dərhal sizinlə əlaqə saxlayacaq.`,
    cta: 'Cavab verin',
    employerTitle: 'İşçiniz necədir?',
    employerBody: (p) => `${p.company}: ${p.worker} 30 gündür sizdə işləyir. Hər şey qaydasındadırmı? Qısa cavabınız bizə kömək edir.`,
    employerCta: 'Cavab verin',
    issueTitle: (p) => `Problem bildirildi: ${p.worker} (${p.number})`,
    issueBody: (p) => `${p.employer ? 'İşəgötürən' : p.worker} gəlişdən ${p.days} gün sonrakı yoxlamada “Problem var” cavabını verdi. Mövzular: ${p.topics || '—'}${p.comment ? `\nŞərh: ${p.comment}` : ''}`,
    taskTitle: (p) => `Gəlişdən sonra problem: ${p.worker} (${p.number}) — ${p.topics || 'əlaqə saxlayın'}`,
  },
  de: {
    workerTitle: 'Wie geht es Ihnen in Deutschland?',
    workerBody: (p) => `Hallo ${p.firstName}, seit Ihrer Ankunft in Deutschland sind ${p.days} Tage vergangen. Ist alles in Ordnung? Antworten Sie mit einem Tippen — bei einem Problem meldet sich unser Team sofort bei Ihnen.`,
    cta: 'Jetzt antworten',
    employerTitle: 'Wie läuft es mit Ihrem neuen Mitarbeiter?',
    employerBody: (p) => `${p.company}: ${p.worker} arbeitet seit 30 Tagen bei Ihnen. Ist alles in Ordnung? Ihre kurze Rückmeldung hilft uns sehr.`,
    employerCta: 'Rückmeldung geben',
    issueTitle: (p) => `Problem gemeldet: ${p.worker} (${p.number})`,
    issueBody: (p) => `${p.employer ? 'Der Arbeitgeber' : p.worker} hat beim Check-in ${p.days} Tage nach der Ankunft „Problem“ gemeldet. Themen: ${p.topics || '—'}${p.comment ? `\nKommentar: ${p.comment}` : ''}`,
    taskTitle: (p) => `Problem nach Ankunft: ${p.worker} (${p.number}) — ${p.topics || 'Kontakt aufnehmen'}`,
  },
  en: {
    workerTitle: 'How are you doing in Germany?',
    workerBody: (p) => `Hello ${p.firstName}, it has been ${p.days} days since you arrived in Germany. Is everything fine? Answer with one tap — if there is a problem, our team will contact you right away.`,
    cta: 'Answer now',
    employerTitle: 'How is your new worker doing?',
    employerBody: (p) => `${p.company}: ${p.worker} has been working with you for 30 days. Is everything fine? Your short answer helps us a lot.`,
    employerCta: 'Give feedback',
    issueTitle: (p) => `Problem reported: ${p.worker} (${p.number})`,
    issueBody: (p) => `${p.employer ? 'The employer' : p.worker} answered “Problem” in the check-in ${p.days} days after arrival. Topics: ${p.topics || '—'}${p.comment ? `\nComment: ${p.comment}` : ''}`,
    taskTitle: (p) => `Problem after arrival: ${p.worker} (${p.number}) — ${p.topics || 'get in touch'}`,
  },
  ru: {
    workerTitle: 'Как у вас дела в Германии?',
    workerBody: (p) => `Здравствуйте, ${p.firstName}! С вашего приезда в Германию прошло ${p.days} дн. Всё в порядке? Ответьте одним нажатием — если есть проблема, наша команда сразу свяжется с вами.`,
    cta: 'Ответить',
    employerTitle: 'Как дела у вашего нового сотрудника?',
    employerBody: (p) => `${p.company}: ${p.worker} работает у вас 30 дней. Всё в порядке? Ваш короткий ответ очень нам поможет.`,
    employerCta: 'Ответить',
    issueTitle: (p) => `Сообщение о проблеме: ${p.worker} (${p.number})`,
    issueBody: (p) => `${p.employer ? 'Работодатель' : p.worker} ответил(а) «Есть проблема» в опросе через ${p.days} дн. после приезда. Темы: ${p.topics || '—'}${p.comment ? `\nКомментарий: ${p.comment}` : ''}`,
    taskTitle: (p) => `Проблема после приезда: ${p.worker} (${p.number}) — ${p.topics || 'связаться'}`,
  },
};

export const checkInTexts = (l: Locale) => T[l] ?? T.az;
