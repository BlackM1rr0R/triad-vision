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
  returnedTitle: (name: string) => string;
  returnedBody: (p: { name: string; number: string; reason: string }) => string;
}

export const CLIENT_TEXT: Record<Locale, ClientCopy> = {
  az: {
    approvedTitle: (n) => `${n} təsdiqləndi`,
    approvedBody: ({ name, number, next }) =>
      `${number} müraciətinizin ${name} hər iki tərəfdən imzalandı və Triad Vision tərəfindən təsdiqləndi. İmzalanmış PDF müraciət səhifənizdədir.${next ? ' Növbəti addım: sizə iş müqaviləsi göndəriləcək.' : ''}`,
    returnedTitle: (n) => `${n} geri qaytarıldı`,
    returnedBody: ({ name, number, reason }) => `${number} müraciətinizin ${name} Triad Vision tərəfindən geri qaytarıldı.

Səbəb: ${reason}

Düzəldilmiş sənəd sizə yenidən göndəriləcək.`,
  },
  de: {
    approvedTitle: (n) => `${n} bestätigt`,
    approvedBody: ({ name, number, next }) =>
      `${name} zu Ihrem Antrag ${number} ist von beiden Seiten unterschrieben und von Triad Vision bestätigt. Das unterschriebene PDF finden Sie auf Ihrer Antragsseite.${next ? ' Nächster Schritt: Sie erhalten den Arbeitsvertrag (İş müqaviləsi).' : ''}`,
    returnedTitle: (n) => `${n} zurückgegeben`,
    returnedBody: ({ name, number, reason }) => `${name} zu Ihrem Antrag ${number} wurde von Triad Vision zurückgegeben.

Grund: ${reason}

Sie erhalten das korrigierte Dokument erneut.`,
  },
  en: {
    approvedTitle: (n) => `${n} approved`,
    approvedBody: ({ name, number, next }) =>
      `${name} for your application ${number} has been signed by both sides and approved by Triad Vision. The signed PDF is on your application page.${next ? ' Next step: we will send you the work contract (İş müqaviləsi).' : ''}`,
    returnedTitle: (n) => `${n} returned`,
    returnedBody: ({ name, number, reason }) => `Triad Vision returned ${name} for your application ${number}.

Reason: ${reason}

We will send you the corrected document again.`,
  },
  ru: {
    approvedTitle: (n) => `${n} подтверждён`,
    approvedBody: ({ name, number, next }) =>
      `${name} по вашей заявке ${number} подписан обеими сторонами и подтверждён Triad Vision. Подписанный PDF — на странице заявки.${next ? ' Следующий шаг: мы отправим вам трудовой договор (İş müqaviləsi).' : ''}`,
    returnedTitle: (n) => `${n} возвращён`,
    returnedBody: ({ name, number, reason }) => `Triad Vision вернул ${name} по вашей заявке ${number}.

Причина: ${reason}

Исправленный документ будет отправлен вам повторно.`,
  },
};

/** Staff (Azerbaijani, like the other notifyStaff texts). */
export const STAFF_TEXT = {
  workSignedTitle: (number: string) => `${number}: müştəri iş müqaviləsinin bütün sənədlərini imzaladı`,
  workSignedBody: (client: string, count: number) =>
    `${client} iş müqaviləsinin ${count} sənədinin hamısını imzaladı. Yoxlayın və «Təsdiqlə» düyməsini basın (və ya sənədi səbəb göstərərək geri qaytarın). Təsdiqdən sonra müştəri işəgötürəni görür və müraciət səfirlik sənədləri mərhələsinə keçir.`,
  clientSignedTitle: (number: string, name: string) => `${number}: müştəri ${name} imzaladı`,
  clientSignedBody: (name: string, client: string) => `${client} ${name} imzaladı (Triad Vision artıq imzalamışdı). Yoxlayın və «Təsdiqlə» düyməsini basın. İmzalanmış PDF müştərinin qovluğunda «${name}» alt qovluğunda saxlanıldı.`,
};
