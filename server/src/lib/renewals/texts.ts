import type { Locale } from '@prisma/client';

/** Texts of the residence-title renewal and the probation-end reminder, in the recipient's language. */

interface RenewalP {
  firstName: string;
  worker: string;
  number: string;
  newNumber: string;
  date: string;
  days: number;
}
interface ProbationP {
  worker: string;
  number: string;
  date: string;
  days: number;
}

const T: Record<
  Locale,
  {
    clientTitle: string;
    clientBody: (p: RenewalP) => string;
    clientCta: string;
    staffTitle: (p: RenewalP) => string;
    staffBody: (p: RenewalP) => string;
    eventNew: (p: RenewalP) => string;
    eventOld: (p: RenewalP) => string;
    probationTitle: (p: ProbationP) => string;
    probationBody: (p: ProbationP) => string;
    probationTask: (p: ProbationP) => string;
  }
> = {
  az: {
    clientTitle: 'Yaşayış icazənizin uzadılması vaxtıdır',
    clientBody: (p) => `Salam, ${p.firstName}! Almaniyada yaşayış icazənizin müddəti ${p.date} tarixində (${p.days} gün sonra) bitir. Uzatma üçün sizə yeni müraciət açdıq: ${p.newNumber}. Lazım olan sənədlər portalda göstərilir — menecerniz sizinlə əlaqə saxlayacaq.`,
    clientCta: 'Müraciətə bax',
    staffTitle: (p) => `Uzatma müraciəti açıldı: ${p.worker} (${p.newNumber})`,
    staffBody: (p) => `${p.worker} üçün yaşayış icazəsi ${p.date} tarixində bitir (${p.days} gün). ${p.number} müraciətinin uzadılması üçün ${p.newNumber} avtomatik açıldı.`,
    eventNew: (p) => `${p.number} müraciətinin uzadılması (yaşayış icazəsi ${p.date} tarixində bitir)`,
    eventOld: (p) => `Uzatma müraciəti açıldı: ${p.newNumber} (yaşayış icazəsi ${p.date} tarixində bitir)`,
    probationTitle: (p) => `Sınaq müddəti bitir: ${p.worker} (${p.number})`,
    probationBody: (p) => `${p.worker} üçün sınaq müddəti ${p.date} tarixində (${p.days} gün sonra) bitir. İşçi və işəgötürənlə qısa danışın — hər şey qaydasındadırmı?`,
    probationTask: (p) => `Sınaq müddəti ${p.date} bitir: ${p.worker} (${p.number}) — işçi və işəgötürənlə danışın`,
  },
  de: {
    clientTitle: 'Zeit für die Verlängerung Ihres Aufenthaltstitels',
    clientBody: (p) => `Hallo ${p.firstName}, Ihr Aufenthaltstitel in Deutschland läuft am ${p.date} ab (in ${p.days} Tagen). Für die Verlängerung haben wir einen neuen Antrag für Sie eröffnet: ${p.newNumber}. Die benötigten Unterlagen sehen Sie im Portal — Ihr Betreuer meldet sich bei Ihnen.`,
    clientCta: 'Antrag ansehen',
    staffTitle: (p) => `Verlängerungsantrag eröffnet: ${p.worker} (${p.newNumber})`,
    staffBody: (p) => `Der Aufenthaltstitel von ${p.worker} läuft am ${p.date} ab (${p.days} Tage). Für die Verlängerung von ${p.number} wurde ${p.newNumber} automatisch eröffnet.`,
    eventNew: (p) => `Verlängerung von ${p.number} (Aufenthaltstitel läuft am ${p.date} ab)`,
    eventOld: (p) => `Verlängerungsantrag eröffnet: ${p.newNumber} (Aufenthaltstitel läuft am ${p.date} ab)`,
    probationTitle: (p) => `Probezeit endet: ${p.worker} (${p.number})`,
    probationBody: (p) => `Die Probezeit von ${p.worker} endet am ${p.date} (in ${p.days} Tagen). Bitte kurz mit Arbeitnehmer und Arbeitgeber sprechen — läuft alles gut?`,
    probationTask: (p) => `Probezeit endet am ${p.date}: ${p.worker} (${p.number}) — mit Arbeitnehmer und Arbeitgeber sprechen`,
  },
  en: {
    clientTitle: 'Time to renew your residence permit',
    clientBody: (p) => `Hello ${p.firstName}, your residence permit in Germany expires on ${p.date} (in ${p.days} days). We have opened a new application for the renewal: ${p.newNumber}. The documents needed are listed in the portal — your manager will contact you.`,
    clientCta: 'View application',
    staffTitle: (p) => `Renewal case opened: ${p.worker} (${p.newNumber})`,
    staffBody: (p) => `The residence permit of ${p.worker} expires on ${p.date} (${p.days} days). ${p.newNumber} was opened automatically to renew ${p.number}.`,
    eventNew: (p) => `Renewal of ${p.number} (residence permit expires on ${p.date})`,
    eventOld: (p) => `Renewal case opened: ${p.newNumber} (residence permit expires on ${p.date})`,
    probationTitle: (p) => `Probation ends: ${p.worker} (${p.number})`,
    probationBody: (p) => `The probation period of ${p.worker} ends on ${p.date} (in ${p.days} days). Please have a short talk with the worker and the employer — is everything going well?`,
    probationTask: (p) => `Probation ends on ${p.date}: ${p.worker} (${p.number}) — talk to worker and employer`,
  },
  ru: {
    clientTitle: 'Пора продлить вид на жительство',
    clientBody: (p) => `Здравствуйте, ${p.firstName}! Срок вашего вида на жительство в Германии истекает ${p.date} (через ${p.days} дн.). Для продления мы открыли новую заявку: ${p.newNumber}. Нужные документы указаны в портале — ваш менеджер свяжется с вами.`,
    clientCta: 'Открыть заявку',
    staffTitle: (p) => `Открыта заявка на продление: ${p.worker} (${p.newNumber})`,
    staffBody: (p) => `Вид на жительство ${p.worker} истекает ${p.date} (${p.days} дн.). Для продления ${p.number} автоматически открыта заявка ${p.newNumber}.`,
    eventNew: (p) => `Продление ${p.number} (вид на жительство истекает ${p.date})`,
    eventOld: (p) => `Открыта заявка на продление: ${p.newNumber} (вид на жительство истекает ${p.date})`,
    probationTitle: (p) => `Заканчивается испытательный срок: ${p.worker} (${p.number})`,
    probationBody: (p) => `Испытательный срок ${p.worker} заканчивается ${p.date} (через ${p.days} дн.). Коротко поговорите с работником и работодателем — всё ли в порядке?`,
    probationTask: (p) => `Испытательный срок заканчивается ${p.date}: ${p.worker} (${p.number}) — поговорить с работником и работодателем`,
  },
};

export const renewalTexts = (l: Locale) => T[l] ?? T.az;
