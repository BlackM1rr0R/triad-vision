import type { VisaType } from '@prisma/client';

/**
 * Texts drawn on the "visa approved" share card and used in the public share page head. The card is
 * rendered in the language the client picked when sharing (az / de / en / ru); the public page head
 * also exists in Turkish and Ukrainian (site languages).
 */
export const CARD_LOCALES = ['az', 'de', 'en', 'ru'] as const;
export type CardLocale = (typeof CARD_LOCALES)[number];
export const PAGE_LOCALES = ['az', 'de', 'en', 'ru', 'tr', 'uk'] as const;
export type PageLocale = (typeof PAGE_LOCALES)[number];

export const asCardLocale = (l: string | null | undefined): CardLocale => ((CARD_LOCALES as readonly string[]).includes(l ?? '') ? (l as CardLocale) : 'en');

interface CardTexts {
  kicker: string;
  headline: string;
  subline: string;
  country: string;
  withUs: string;
  scan: string;
  code: (code: string) => string;
  visa: Record<VisaType, string>;
}

export const CARD_TEXTS: Record<CardLocale, CardTexts> = {
  az: {
    kicker: 'Uğur hekayəsi',
    headline: 'Vizam təsdiqləndi!',
    subline: 'Almaniyaya yolum başlayır',
    country: 'Almaniya',
    withUs: 'Triad Vision ilə',
    scan: 'Sən də başla',
    code: (c) => `Kod: ${c}`,
    visa: {
      WORK: 'İş vizası',
      AUSBILDUNG: 'Ausbildung vizası',
      WEITERBILDUNG: 'Diplomun tanınması vizası (§16d)',
      JOB_SEEKER: 'Chancenkarte',
      STUDY: 'Təhsil vizası',
      FAMILY: 'Ailənin birləşməsi vizası',
      TOURIST: 'Şengen vizası',
    },
  },
  de: {
    kicker: 'Erfolgsgeschichte',
    headline: 'Mein Visum ist genehmigt!',
    subline: 'Mein Weg nach Deutschland beginnt',
    country: 'Deutschland',
    withUs: 'mit Triad Vision',
    scan: 'Starte auch du',
    code: (c) => `Code: ${c}`,
    visa: {
      WORK: 'Arbeitsvisum',
      AUSBILDUNG: 'Ausbildungsvisum',
      WEITERBILDUNG: 'Visum zur Anerkennung (§16d)',
      JOB_SEEKER: 'Chancenkarte',
      STUDY: 'Studienvisum',
      FAMILY: 'Familiennachzug',
      TOURIST: 'Schengen-Visum',
    },
  },
  en: {
    kicker: 'Success story',
    headline: 'My visa is approved!',
    subline: 'My journey to Germany begins',
    country: 'Germany',
    withUs: 'with Triad Vision',
    scan: 'Start yours',
    code: (c) => `Code: ${c}`,
    visa: {
      WORK: 'Work visa',
      AUSBILDUNG: 'Vocational training visa',
      WEITERBILDUNG: 'Recognition visa (§16d)',
      JOB_SEEKER: 'Opportunity Card',
      STUDY: 'Student visa',
      FAMILY: 'Family reunion visa',
      TOURIST: 'Schengen visa',
    },
  },
  ru: {
    kicker: 'История успеха',
    headline: 'Моя виза одобрена!',
    subline: 'Мой путь в Германию начинается',
    country: 'Германия',
    withUs: 'с Triad Vision',
    scan: 'Начни и ты',
    code: (c) => `Код: ${c}`,
    visa: {
      WORK: 'Рабочая виза',
      AUSBILDUNG: 'Виза на Ausbildung',
      WEITERBILDUNG: 'Виза для признания (§16d)',
      JOB_SEEKER: 'Chancenkarte',
      STUDY: 'Студенческая виза',
      FAMILY: 'Воссоединение семьи',
      TOURIST: 'Шенгенская виза',
    },
  },
};

/** Head of the public /success/:token page (title / description), in the six site languages. */
export const PAGE_HEAD: Record<PageLocale, { title: (name: string) => string; description: string }> = {
  az: { title: (n) => `${n} — vizası təsdiqləndi · Triad Vision`, description: 'Almaniyaya yol Triad Vision ilə. Sən də öz yoluna başla: pulsuz məsləhət.' },
  de: { title: (n) => `${n} — Visum genehmigt · Triad Vision`, description: 'Der Weg nach Deutschland mit Triad Vision. Starte auch du: kostenlose Beratung.' },
  en: { title: (n) => `${n} — visa approved · Triad Vision`, description: 'The way to Germany with Triad Vision. Start your own journey: free consultation.' },
  ru: { title: (n) => `${n} — виза одобрена · Triad Vision`, description: 'Путь в Германию с Triad Vision. Начни и ты: бесплатная консультация.' },
  tr: { title: (n) => `${n} — vizesi onaylandı · Triad Vision`, description: 'Triad Vision ile Almanya yolu. Sen de yolculuğuna başla: ücretsiz danışmanlık.' },
  uk: { title: (n) => `${n} — візу схвалено · Triad Vision`, description: 'Шлях до Німеччини з Triad Vision. Почни і ти: безкоштовна консультація.' },
};
