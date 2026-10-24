import type { Locale } from '@prisma/client';

/** Staff notification texts of the placement features (employer share links, interview evaluations). */

type L10n = Record<Locale, string>;

export const DECISION_LABEL: Record<'INTERESTED' | 'REJECTED', L10n> = {
  INTERESTED: { az: 'Maraqlanır', de: 'Interesse', en: 'Interested', ru: 'Интересно' },
  REJECTED: { az: 'Uyğun deyil', de: 'Passt nicht', en: 'Not a fit', ru: 'Не подходит' },
};

const shareDecisionTitle: Record<'INTERESTED' | 'REJECTED', (p: { candidate: string; employer: string }) => L10n> = {
  INTERESTED: ({ candidate, employer }) => ({
    az: `${employer} ${candidate} ilə maraqlanır`,
    de: `${employer} hat Interesse an ${candidate}`,
    en: `${employer} is interested in ${candidate}`,
    ru: `${employer}: интерес к кандидату ${candidate}`,
  }),
  REJECTED: ({ candidate, employer }) => ({
    az: `${employer}: ${candidate} uyğun deyil`,
    de: `${employer}: ${candidate} passt nicht`,
    en: `${employer}: ${candidate} is not a fit`,
    ru: `${employer}: кандидат ${candidate} не подходит`,
  }),
};

const NAME: L10n = { az: 'Ad', de: 'Name', en: 'Name', ru: 'Имя' };
const NOTE: L10n = { az: 'Qeyd', de: 'Notiz', en: 'Note', ru: 'Комментарий' };
const VIA: L10n = {
  az: 'Cavab namizədin paylaşım linki ilə verildi.',
  de: 'Die Antwort kam über den Kandidaten-Link.',
  en: 'The answer came in through the candidate share link.',
  ru: 'Ответ получен по ссылке на профиль кандидата.',
};
export const EMPLOYER_FALLBACK: L10n = { az: 'İşəgötürən', de: 'Arbeitgeber', en: 'Employer', ru: 'Работодатель' };

export const shareDecisionText = (
  locale: Locale,
  p: { decision: 'INTERESTED' | 'REJECTED'; candidate: string; employer: string | null; name: string; note: string | null },
) => ({
  title: shareDecisionTitle[p.decision]({ candidate: p.candidate, employer: p.employer || EMPLOYER_FALLBACK[locale] })[locale].slice(0, 190),
  body: [VIA[locale], `${NAME[locale]}: ${p.name}`, p.note ? `${NOTE[locale]}: ${p.note}` : null].filter(Boolean).join('\n'),
});

/** Line written to the application's employer note when the decision came through a share link. */
export const applicationNoteLine = (decision: 'INTERESTED' | 'REJECTED', name: string, note: string | null, at: Date) =>
  `[${at.toISOString().slice(0, 10)} · Link] ${DECISION_LABEL[decision].de} — ${name}${note ? `: ${note}` : ''}`;

const REC: Record<'HIRE' | 'MAYBE' | 'NO', L10n> = {
  HIRE: { az: 'işə götürmək', de: 'einstellen', en: 'hire', ru: 'нанять' },
  MAYBE: { az: 'bəlkə', de: 'vielleicht', en: 'maybe', ru: 'возможно' },
  NO: { az: 'yox', de: 'nein', en: 'no', ru: 'нет' },
};

export const evaluationText = (locale: Locale, p: { candidate: string; author: string; overall: number; recommendation: 'HIRE' | 'MAYBE' | 'NO' }) => ({
  title: {
    az: `Müsahibə qiymətləndirməsi: ${p.candidate}`,
    de: `Interviewbewertung: ${p.candidate}`,
    en: `Interview evaluation: ${p.candidate}`,
    ru: `Оценка собеседования: ${p.candidate}`,
  }[locale].slice(0, 190),
  body: {
    az: `${p.author} qiymət verdi: ${p.overall}/5, tövsiyə: ${REC[p.recommendation].az}.`,
    de: `${p.author} hat bewertet: ${p.overall}/5, Empfehlung: ${REC[p.recommendation].de}.`,
    en: `${p.author} rated ${p.overall}/5, recommendation: ${REC[p.recommendation].en}.`,
    ru: `${p.author} поставил(а) ${p.overall}/5, рекомендация: ${REC[p.recommendation].ru}.`,
  }[locale],
});
