import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Compass } from 'lucide-react';
import clsx from 'clsx';

/** Texts inline (2 short strings × 6 languages) so the home / tools chunks do not pull the wizard copy. */
const TEXT = {
  az: { cta: 'Haradan başlayım?', hint: '3 sual — sizə addım-addım plan' },
  de: { cta: 'Wo fange ich an?', hint: '3 Fragen – Ihr Plan Schritt für Schritt' },
  en: { cta: 'Not sure where to start?', hint: '3 questions — your step-by-step plan' },
  ru: { cta: 'С чего начать?', hint: '3 вопроса — ваш план по шагам' },
  tr: { cta: 'Nereden başlamalı?', hint: '3 soru — adım adım planınız' },
  uk: { cta: 'З чого почати?', hint: '3 питання — ваш план по кроках' },
} as const;

/**
 * Small secondary link to the "Start here" wizard (/start): home hero and /tools. Inherits the text colour.
 * `employer`: goes straight to the employer plan (/start/plan?w=employer).
 */
export const StartHereCta = ({ className, employer = false }: { className?: string; employer?: boolean }) => {
  const { i18n } = useTranslation();
  const l = (i18n.resolvedLanguage ?? 'az').slice(0, 2) as keyof typeof TEXT;
  const txt = TEXT[l] ?? TEXT.az;
  return (
    <Link to={employer ? '/start/plan?w=employer' : '/start'} className={clsx('group inline-flex min-h-11 items-center gap-2 text-sm opacity-90 hover:opacity-100', className)}>
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-current/10 group-hover:bg-current/15">
        <Compass className="size-4 text-highlight-fg" aria-hidden />
      </span>
      <span>
        <span className="font-semibold underline decoration-current/30 underline-offset-4 group-hover:decoration-current">{txt.cta}</span>
        <span className="opacity-75"> — {txt.hint}</span>
      </span>
    </Link>
  );
};

export default StartHereCta;
