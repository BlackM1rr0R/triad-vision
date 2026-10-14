import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Info, MessageCircle } from 'lucide-react';
import { PageHero } from '@/components/layout/PageHero';
import { Reveal } from '@/components/motion';
import { usePageTitle } from '@/lib/usePageTitle';

/** Public accessibility statement (linked from the accessibility widget). */
export default function AccessibilityPage() {
  const { t } = useTranslation();
  usePageTitle(t('a11y.page.title'));
  const measures = t('a11y.page.measures', { returnObjects: true }) as string[];
  const limits = t('a11y.page.limits', { returnObjects: true }) as string[];

  return (
    <>
      <PageHero title={t('a11y.page.title')} subtitle={t('a11y.page.lead')} image="https://images.unsplash.com/photo-1573164713988-8665fc963095?auto=format&fit=crop&w=2000&q=70" />
      <section className="section">
        <div className="container-x grid gap-8 lg:grid-cols-[1fr_340px] lg:gap-12">
          <div className="min-w-0">
            <Reveal>
              <h2 className="font-display text-2xl font-extrabold text-navy-900 sm:text-3xl">{t('a11y.page.goalTitle')}</h2>
              <p className="mt-3 leading-relaxed text-muted">{t('a11y.page.goalText')}</p>
            </Reveal>

            <Reveal delay={0.1}>
              <h2 className="mt-12 font-display text-2xl font-extrabold text-navy-900 sm:text-3xl">{t('a11y.page.measuresTitle')}</h2>
              <ul className="mt-5 space-y-3">
                {measures.map((m) => (
                  <li key={m} className="flex gap-3 text-[0.95rem] leading-relaxed text-ink/85">
                    <CheckCircle2 className="mt-1 size-5 shrink-0 text-success" aria-hidden />
                    <span>{m}</span>
                  </li>
                ))}
              </ul>
            </Reveal>

            <Reveal delay={0.1}>
              <h2 className="mt-12 font-display text-2xl font-extrabold text-navy-900 sm:text-3xl">{t('a11y.page.limitsTitle')}</h2>
              <ul className="mt-5 space-y-3">
                {limits.map((m) => (
                  <li key={m} className="flex gap-3 text-[0.95rem] leading-relaxed text-ink/85">
                    <Info className="mt-1 size-5 shrink-0 text-warning" aria-hidden />
                    <span>{m}</span>
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>

          <aside className="lg:sticky lg:top-28 lg:self-start">
            <Reveal delay={0.15}>
              <div className="card card-pad">
                <h2 className="font-display text-lg font-bold text-navy-900">{t('a11y.page.contactTitle')}</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted">{t('a11y.page.contactText')}</p>
                <Link to="/contact" className="btn-primary mt-5 w-full">
                  <MessageCircle className="size-4" aria-hidden /> {t('a11y.page.contactCta')}
                </Link>
                <p className="mt-4 text-xs text-muted">
                  {t('a11y.page.openWidget')}: <kbd className="rounded border border-line bg-surface px-1.5 py-0.5 font-sans text-[11px] font-semibold text-navy-900">Alt + A</kbd>
                </p>
              </div>
            </Reveal>
          </aside>
        </div>
      </section>
    </>
  );
}
