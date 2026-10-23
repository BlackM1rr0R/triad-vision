import type { Locale } from '@prisma/client';

/** Notification texts of the staff timer (idle protection), in the staff member's language. */

type P = { number: string | null; hours: number };

const where = (p: P, l: Locale) => (p.number ? ` (${p.number})` : l === 'az' ? '' : '');

const T: Record<Locale, { idleTitle: string; idleBody: (p: P) => string; stopTitle: string; stopBody: (p: P) => string; stopNote: string }> = {
  az: {
    idleTitle: 'Hələ işləyirsiniz?',
    idleBody: (p) => `Taymeriniz${where(p, 'az')} ${p.hours} saatdır işləyir. Bitirmisinizsə, dayandırın — 12 saatdan sonra avtomatik dayanacaq.`,
    stopTitle: 'Taymer avtomatik dayandırıldı',
    stopBody: (p) => `Taymeriniz${where(p, 'az')} 12 saat işlədiyi üçün dayandırıldı. Lazım olsa, vaxtı əl ilə düzəldin.`,
    stopNote: 'Avtomatik dayandırıldı (12 saat)',
  },
  de: {
    idleTitle: 'Arbeiten Sie noch?',
    idleBody: (p) => `Ihr Timer${where(p, 'de')} läuft seit ${p.hours} Stunden. Wenn Sie fertig sind, stoppen Sie ihn bitte — nach 12 Stunden stoppt er automatisch.`,
    stopTitle: 'Timer automatisch gestoppt',
    stopBody: (p) => `Ihr Timer${where(p, 'de')} lief 12 Stunden und wurde gestoppt. Bitte korrigieren Sie die Zeit bei Bedarf von Hand.`,
    stopNote: 'Automatisch gestoppt (12 Stunden)',
  },
  en: {
    idleTitle: 'Still working?',
    idleBody: (p) => `Your timer${where(p, 'en')} has been running for ${p.hours} hours. If you are done, please stop it — it stops automatically after 12 hours.`,
    stopTitle: 'Timer stopped automatically',
    stopBody: (p) => `Your timer${where(p, 'en')} ran for 12 hours and was stopped. Please correct the time manually if needed.`,
    stopNote: 'Stopped automatically (12 hours)',
  },
  ru: {
    idleTitle: 'Вы ещё работаете?',
    idleBody: (p) => `Ваш таймер${where(p, 'ru')} работает уже ${p.hours} ч. Если вы закончили, остановите его — через 12 часов он остановится автоматически.`,
    stopTitle: 'Таймер остановлен автоматически',
    stopBody: (p) => `Ваш таймер${where(p, 'ru')} работал 12 часов и был остановлен. При необходимости исправьте время вручную.`,
    stopNote: 'Остановлен автоматически (12 часов)',
  },
};

export const timerTexts = (l: Locale) => T[l] ?? T.az;
