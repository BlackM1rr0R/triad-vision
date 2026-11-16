import type { CardLocale } from '../successShare/texts.js';

/** Texts drawn on the "Your visa story" share card (az / de / en / ru, like the Instagram success card). */
export interface StoryCardTexts {
  kicker: string;
  headline: string;
  days: string;
  docs: string;
  km: string;
  kmTo: (city: string) => string;
  words: string;
  messages: string;
  footer: string;
}

export const STORY_CARD_TEXTS: Record<CardLocale, StoryCardTexts> = {
  az: {
    kicker: 'Mənim viza hekayəm',
    headline: 'Viza təsdiqləndi ✈',
    days: 'gün — qeydiyyatdan təsdiqə',
    docs: 'sənəd yükləndi',
    km: 'km — Bakıdan',
    kmTo: (c) => `km — Bakı → ${c}`,
    words: 'alman sözü öyrənildi',
    messages: 'mesaj komanda ilə',
    footer: 'Sən də başla',
  },
  de: {
    kicker: 'Meine Visa-Geschichte',
    headline: 'Visum genehmigt ✈',
    days: 'Tage von der Registrierung bis zur Zusage',
    docs: 'Dokumente hochgeladen',
    km: 'km ab Baku',
    kmTo: (c) => `km Baku → ${c}`,
    words: 'deutsche Wörter gelernt',
    messages: 'Nachrichten mit dem Team',
    footer: 'Starte auch du',
  },
  en: {
    kicker: 'My visa story',
    headline: 'Visa approved ✈',
    days: 'days from sign-up to approval',
    docs: 'documents uploaded',
    km: 'km from Baku',
    kmTo: (c) => `km Baku → ${c}`,
    words: 'German words learned',
    messages: 'messages with the team',
    footer: 'Start yours',
  },
  ru: {
    kicker: 'Моя визовая история',
    headline: 'Виза одобрена ✈',
    days: 'дней от регистрации до одобрения',
    docs: 'документов загружено',
    km: 'км от Баку',
    kmTo: (c) => `км Баку → ${c}`,
    words: 'немецких слов выучено',
    messages: 'сообщений с командой',
    footer: 'Начни и ты',
  },
};
