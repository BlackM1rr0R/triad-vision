import type { Locale } from '@prisma/client';
import type { Step } from './flow.js';

/** Copy of the two-step case contracts: client notifications in the portal languages, staff notes in Azerbaijani (like notifyStaff). */

export const STEP_NAME: Record<Locale, Record<Step, string>> = {
  az: { LABOUR: 'Əmək müqaviləsi', WORK: 'İş müqaviləsi' },
  de: { LABOUR: 'Əmək müqaviləsi (Vertrag mit Triad Vision)', WORK: 'İş müqaviləsi (Arbeitsvertrag)' },
  en: { LABOUR: 'Əmək müqaviləsi (contract with Triad Vision)', WORK: 'İş müqaviləsi (work contract)' },
  ru: { LABOUR: 'Əmək müqaviləsi (договор с Triad Vision)', WORK: 'İş müqaviləsi (трудовой договор)' },
};

interface ClientCopy {
  approvedTitle: (name: string) => string;
  approvedBody: (p: { name: string; number: string; next: boolean }) => string;
}

export const CLIENT_TEXT: Record<Locale, ClientCopy> = {
  az: {
    approvedTitle: (n) => `${n} təsdiqləndi`,
    approvedBody: ({ name, number, next }) =>
      `${number} müraciətinizin ${name} hər iki tərəfdən imzalandı və Triad Vision tərəfindən təsdiqləndi. İmzalanmış PDF müraciət səhifənizdədir.${next ? ' Növbəti addım: sizə iş müqaviləsi göndəriləcək.' : ''}`,
  },
  de: {
    approvedTitle: (n) => `${n} bestätigt`,
    approvedBody: ({ name, number, next }) =>
      `${name} zu Ihrem Antrag ${number} ist von beiden Seiten unterschrieben und von Triad Vision bestätigt. Das unterschriebene PDF finden Sie auf Ihrer Antragsseite.${next ? ' Nächster Schritt: Sie erhalten den Arbeitsvertrag (İş müqaviləsi).' : ''}`,
  },
  en: {
    approvedTitle: (n) => `${n} approved`,
    approvedBody: ({ name, number, next }) =>
      `${name} for your application ${number} has been signed by both sides and approved by Triad Vision. The signed PDF is on your application page.${next ? ' Next step: we will send you the work contract (İş müqaviləsi).' : ''}`,
  },
  ru: {
    approvedTitle: (n) => `${n} подтверждён`,
    approvedBody: ({ name, number, next }) =>
      `${name} по вашей заявке ${number} подписан обеими сторонами и подтверждён Triad Vision. Подписанный PDF — на странице заявки.${next ? ' Следующий шаг: мы отправим вам трудовой договор (İş müqaviləsi).' : ''}`,
  },
};

/** Staff (Azerbaijani, like the other notifyStaff texts). */
export const STAFF_TEXT = {
  clientSignedTitle: (number: string, name: string) => `${number}: müştəri ${name} imzaladı`,
  clientSignedBody: (name: string, client: string) => `${client} ${name} imzaladı (Triad Vision artıq imzalamışdı). Yoxlayın və «Təsdiqlə» düyməsini basın. İmzalanmış PDF müştərinin qovluğunda «${name}» alt qovluğunda saxlanıldı.`,
};
