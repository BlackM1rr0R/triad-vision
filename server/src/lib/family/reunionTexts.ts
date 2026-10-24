import type { Locale } from '@prisma/client';

/** Texts of the family reunion start (client notification, case events), in the recipient's language. */

interface P {
  firstName: string;
  names: string;
  number: string;
  copied: number;
}

const T: Record<Locale, { title: string; body: (p: P) => string; cta: string; memberEvent: (p: P) => string; mainEvent: (p: P) => string; copiedEvent: (p: P & { docs: string }) => string }> = {
  az: {
    title: 'Ailənin birləşməsi başladı',
    body: (p) => `Salam, ${p.firstName}! ${p.names} üçün ailənin birləşməsi (Familiennachzug) müraciəti başladı.${p.copied ? ` Sizin müraciətinizdən ${p.copied} sənəd avtomatik əlavə olundu.` : ''} Qalan sənədləri portalda yükləyin.`,
    cta: 'Ailə bölməsinə keç',
    memberEvent: (p) => `Ailənin birləşməsi başladı (əsas müraciət ${p.number})`,
    mainEvent: (p) => `Ailənin birləşməsi başladı: ${p.names}`,
    copiedEvent: (p) => `${p.number} müraciətindən ${p.copied} sənəd köçürüldü: ${p.docs}`,
  },
  de: {
    title: 'Familiennachzug gestartet',
    body: (p) => `Hallo ${p.firstName}, der Familiennachzug für ${p.names} hat begonnen.${p.copied ? ` ${p.copied} Unterlage(n) aus Ihrem Antrag wurden automatisch übernommen.` : ''} Bitte laden Sie die übrigen Unterlagen im Portal hoch.`,
    cta: 'Zur Familie',
    memberEvent: (p) => `Familiennachzug gestartet (Hauptantrag ${p.number})`,
    mainEvent: (p) => `Familiennachzug gestartet: ${p.names}`,
    copiedEvent: (p) => `${p.copied} Unterlage(n) aus ${p.number} übernommen: ${p.docs}`,
  },
  en: {
    title: 'Family reunion started',
    body: (p) => `Hello ${p.firstName}, the family reunion for ${p.names} has started.${p.copied ? ` ${p.copied} document(s) from your application were added automatically.` : ''} Please upload the remaining documents in the portal.`,
    cta: 'Open family section',
    memberEvent: (p) => `Family reunion started (main application ${p.number})`,
    mainEvent: (p) => `Family reunion started: ${p.names}`,
    copiedEvent: (p) => `${p.copied} document(s) copied from ${p.number}: ${p.docs}`,
  },
  ru: {
    title: 'Воссоединение семьи начато',
    body: (p) => `Здравствуйте, ${p.firstName}! Начато воссоединение семьи для: ${p.names}.${p.copied ? ` ${p.copied} документ(а) из вашей заявки добавлены автоматически.` : ''} Загрузите остальные документы в портале.`,
    cta: 'К разделу «Семья»',
    memberEvent: (p) => `Воссоединение семьи начато (основная заявка ${p.number})`,
    mainEvent: (p) => `Воссоединение семьи начато: ${p.names}`,
    copiedEvent: (p) => `Скопировано документов из ${p.number}: ${p.copied} — ${p.docs}`,
  },
};

export const reunionTexts = (l: Locale) => T[l] ?? T.az;
