import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Gauge, GraduationCap, type LucideIcon } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { pagesMockExam } from '@/i18n/pagesMockExam';
import { pagesLevelSelf } from '@/i18n/pagesLevelSelf';

registerCopy(pagesMockExam);
registerCopy(pagesLevelSelf);

/** Cards to the mock exams and the level self-assessment (portal German page). */
export const ExamLinks = () => {
  const { t } = useTranslation();
  const items: { to: string; icon: LucideIcon; title: string; text: string }[] = [
    { to: '/german-level-test-self', icon: Gauge, title: t('levelSelf.heroTitle'), text: t('levelSelf.heroSubtitle') },
    { to: '/german-mock-exam/a1', icon: GraduationCap, title: t('mockExam.a1Title'), text: t('mockExam.hubA1') },
    { to: '/german-mock-exam/b1', icon: GraduationCap, title: t('mockExam.b1Title'), text: t('mockExam.hubB1') },
  ];
  return (
    <section aria-labelledby="exam-links-h" className="space-y-3">
      <h2 id="exam-links-h" className="font-display text-lg font-semibold text-ink">
        {t('mockExam.hubTitle')}
      </h2>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((it) => (
          <li key={it.to}>
            <Link to={it.to} className="group flex h-full items-start gap-3 rounded-2xl border border-line bg-card p-4 transition-colors hover:border-line-strong hover:bg-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/40">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl chip-soft">
                <it.icon className="size-5" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-1 text-sm font-semibold text-ink">
                  {it.title} <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
                </span>
                <span className="mt-0.5 line-clamp-3 block text-xs leading-snug text-muted">{it.text}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
};
