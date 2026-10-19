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

/** Small link to /uygunluq-testi for the home hero (light text on the dark hero). */
export const QuizCta = ({ className }: { className?: string }) => {
  const { i18n } = useTranslation();
  const l = (i18n.resolvedLanguage ?? 'az').slice(0, 2) as keyof typeof TEXT;
  const txt = TEXT[l] ?? TEXT.az;
  return (
    <Link to="/uygunluq-testi" className={clsx('group inline-flex items-center gap-2 text-sm text-white/85 hover:text-white', className)}>
      <span className="grid size-8 place-items-center rounded-full bg-white/10 text-brand-300 group-hover:bg-white/20">
        <ClipboardCheck className="size-4" aria-hidden />
      </span>
      <span>
        <span className="font-semibold underline decoration-white/30 underline-offset-4 group-hover:decoration-white">{txt.cta}</span>
        <span className="text-white/60"> — {txt.hint}</span>
      </span>
    </Link>
  );
};

export default QuizCta;
