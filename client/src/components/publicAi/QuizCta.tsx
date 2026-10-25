import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ClipboardCheck } from 'lucide-react';
import clsx from 'clsx';

/** Texts kept inline (4 short strings) so the home page chunk does not pull in the whole public AI copy. */
const TEXT = {
  az: { cta: 'Uyğunluq testi', hint: '2 dəqiqədə Almaniyaya yolunuzu öyrənin' },
  de: { cta: 'Eignungstest', hint: 'In 2 Minuten Ihren Weg nach Deutschland finden' },
  en: { cta: 'Eligibility quiz', hint: 'Find your path to Germany in 2 minutes' },
  ru: { cta: 'Тест на соответствие', hint: 'Узнайте свой путь в Германию за 2 минуты' },
} as const;

/** Small link to /uygunluq-testi for the home hero. Inherits the text colour, so it reads on a light or a dark hero. */
export const QuizCta = ({ className }: { className?: string }) => {
  const { i18n } = useTranslation();
  const l = (i18n.resolvedLanguage ?? 'az').slice(0, 2) as keyof typeof TEXT;
  const txt = TEXT[l] ?? TEXT.az;
  return (
    <Link to="/uygunluq-testi" className={clsx('group inline-flex min-h-11 items-center gap-2 text-sm opacity-90 hover:opacity-100', className)}>
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-current/10 group-hover:bg-current/15">
        <ClipboardCheck className="size-4 text-highlight-fg" aria-hidden />
      </span>
      <span>
        <span className="font-semibold underline decoration-current/30 underline-offset-4 group-hover:decoration-current">{txt.cta}</span>
        <span className="opacity-75"> — {txt.hint}</span>
      </span>
    </Link>
  );
};

export default QuizCta;
