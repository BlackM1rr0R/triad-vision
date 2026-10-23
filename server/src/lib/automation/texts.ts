import type { Locale } from '@prisma/client';

/** Fallback texts used by automation actions (client's language; formal German, Russian "вы"). */
const T: Record<Locale, { open: string; changesRequested: string; cancelled: string }> = {
  az: { open: 'Kabinetdə aç', changesRequested: 'Zəhmət olmasa sənədlərinizi yoxlayın və yenidən yükləyin.', cancelled: 'Müraciət avtomatik olaraq ləğv edildi.' },
  de: { open: 'Im Kundenbereich öffnen', changesRequested: 'Bitte prüfen Sie Ihre Dokumente und laden Sie sie erneut hoch.', cancelled: 'Der Antrag wurde automatisch storniert.' },
  en: { open: 'Open in your account', changesRequested: 'Please check your documents and upload them again.', cancelled: 'The application was cancelled automatically.' },
  ru: { open: 'Открыть в личном кабинете', changesRequested: 'Пожалуйста, проверьте ваши документы и загрузите их снова.', cancelled: 'Заявка была отменена автоматически.' },
};

export const automationTexts = (l: Locale) => T[l] ?? T.az;
