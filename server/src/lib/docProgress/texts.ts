import type { ProcessingStage as TeamStage } from '../caseProcessing/index.js';

/** What the client sees: the team workflow stages plus "Ablehnung" for a refused visa (CaseStatus REJECTED; no longer a team stage). */
export type ProcessingStage = TeamStage | 'REFUSED';

/**
 * Client-facing words for the team's document workflow (lib/caseProcessing: Schon geschrieben → In Bearbeitung →
 * Fertig · Ablehnung). The German word stays visible in every language (the team and the folders use it), followed
 * by a plain translation and a short explanation. Informational only: the client never has to act on it.
 */

export type L10n = { az: string; de: string; en: string; ru: string };

export interface ProcessingCopy {
  /** The German word as the team uses it ("Fertig"). */
  word: string;
  /** The translation shown after the German word ("hazırdır"). */
  meaning: L10n;
  /** One or two short sentences: what it means for the client. */
  explanation: L10n;
  /** Colour of the chip in the portal. */
  tone: 'info' | 'progress' | 'success' | 'danger';
}

export const PROCESSING_COPY: Record<ProcessingStage, ProcessingCopy> = {
  WRITTEN: {
    word: 'Schon geschrieben',
    meaning: { az: 'artıq yazılıb', de: 'bereits geschrieben', en: 'already written', ru: 'уже подготовлено' },
    explanation: {
      az: 'Komandamız müraciət sənədlərinizi artıq yazıb hazırlayıb. İndi onları yoxlayırıq. Sizdən heç nə tələb olunmur.',
      de: 'Unser Team hat Ihre Antragsunterlagen bereits geschrieben und vorbereitet. Jetzt prüfen wir sie. Sie müssen nichts tun.',
      en: 'Our team has already written and prepared your application documents. We are checking them now. You do not need to do anything.',
      ru: 'Наша команда уже написала и подготовила документы для вашего заявления. Сейчас мы их проверяем. От вас ничего не требуется.',
    },
    tone: 'info',
  },
  IN_PROGRESS: {
    word: 'In Bearbeitung',
    meaning: { az: 'üzərində işlənir', de: 'wird bearbeitet', en: 'being worked on', ru: 'в работе' },
    explanation: {
      az: 'Mütəxəssisimiz sənədlərinizi yoxlayır və tamamlayır. Sizdən heç nə tələb olunmur.',
      de: 'Eine Fachkraft unseres Teams prüft und vervollständigt Ihre Unterlagen. Sie müssen nichts tun.',
      en: 'A specialist on our team is checking and completing your documents. You do not need to do anything.',
      ru: 'Наш специалист проверяет и дополняет ваши документы. От вас ничего не требуется.',
    },
    tone: 'progress',
  },
  DONE: {
    word: 'Fertig',
    meaning: { az: 'hazırdır', de: 'fertig', en: 'ready', ru: 'готово' },
    explanation: {
      az: 'Müraciət sənədləriniz hazırdır. Növbəti addımı sizə yazacağıq.',
      de: 'Ihre Antragsunterlagen sind fertig. Wir melden uns mit dem nächsten Schritt.',
      en: 'Your application documents are ready. We will tell you the next step.',
      ru: 'Документы для вашего заявления готовы. Мы сообщим вам следующий шаг.',
    },
    tone: 'success',
  },
  REFUSED: {
    word: 'Ablehnung',
    meaning: { az: 'imtina', de: 'Ablehnung', en: 'refusal', ru: 'отказ' },
    explanation: {
      az: 'Səfirlik viza müraciətinə imtina cavabı verib. Meneceriniz səbəbi və növbəti addımları sizinlə danışacaq.',
      de: 'Die Botschaft hat den Visumantrag abgelehnt. Ihre Ansprechperson bespricht mit Ihnen den Grund und die nächsten Schritte.',
      en: 'The embassy refused the visa application. Your manager will talk with you about the reason and the next steps.',
      ru: 'Посольство отказало в визе. Ваш менеджер обсудит с вами причину и следующие шаги.',
    },
    tone: 'danger',
  },
};

/** "Fertig — hazırdır" (the German word stays; in German just the word). */
export const processingLabel = (stage: ProcessingStage): L10n => {
  const c = PROCESSING_COPY[stage];
  const join = (m: string) => `${c.word} — ${m}`;
  return { az: join(c.meaning.az), de: c.word, en: join(c.meaning.en), ru: join(c.meaning.ru) };
};
