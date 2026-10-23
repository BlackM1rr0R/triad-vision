import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Info, Mail, MessageCircle } from 'lucide-react';
import { PageHero } from '@/components/layout/PageHero';
import { Reveal } from '@/components/motion';
import { usePageTitle } from '@/lib/usePageTitle';
import { registerCopy } from '@/i18n';
import { pagesA11yStatement } from '@/i18n/pagesA11yStatement';

registerCopy(pagesA11yStatement);

const FEEDBACK_EMAIL = 'info@triad-vision.de';

const H2 = 'mt-12 font-display text-2xl font-extrabold text-navy-900 sm:text-3xl';

/**
 * Public accessibility statement ("Erklärung zur Barrierefreiheit", BFSG). Linked from the footer of every
 * page and from the accessibility panel. The copy lives in i18n/pagesA11yStatement.ts.
 */
export default function AccessibilityPage() {
  const { t } = useTranslation();
  usePageTitle(t('a11yStatement.title'));
  const measures = t('a11yStatement.measures', { returnObjects: true }) as string[];
  const limits = t('a11yStatement.limits', { returnObjects: true }) as string[];

  return (
    <>
      <PageHero title={t('a11yStatement.title')} subtitle={t('a11yStatement.lead')} image="https://images.unsplash.com/photo-1573164713988-8665fc963095?auto=format&fit=crop&w=2000&q=70" />
      <section className="section">
        <div className="container-x grid gap-8 lg:grid-cols-[1fr_340px] lg:gap-12">
          <div className="min-w-0">
            <Reveal>
              <h2 className="font-display text-2xl font-extrabold text-navy-900 sm:text-3xl">{t('a11yStatement.statusTitle')}</h2>
              <p className="mt-3 leading-relaxed text-muted">{t('a11yStatement.statusText')}</p>
              <h2 className={H2}>{t('a11yStatement.scopeTitle')}</h2>
              <p className="mt-3 leading-relaxed text-muted">{t('a11yStatement.scopeText')}</p>
            </Reveal>

            <Reveal delay={0.1}>
              <h2 className={H2}>{t('a11yStatement.measuresTitle')}</h2>
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
              <h2 className={H2}>{t('a11yStatement.limitsTitle')}</h2>
              <ul className="mt-5 space-y-3">
                {limits.map((m) => (
                  <li key={m} className="flex gap-3 text-[0.95rem] leading-relaxed text-ink/85">
                    <Info className="mt-1 size-5 shrink-0 text-warning" aria-hidden />
                    <span>{m}</span>
                  </li>
                ))}
              </ul>
            </Reveal>

            <Reveal delay={0.1}>
              <h2 className={H2}>{t('a11yStatement.preparedTitle')}</h2>
              <p className="mt-3 leading-relaxed text-muted">{t('a11yStatement.preparedText', { date: t('a11yStatement.date') })}</p>
              <h2 className={H2}>{t('a11yStatement.enforcementTitle')}</h2>
              <p className="mt-3 leading-relaxed text-muted">{t('a11yStatement.enforcementText')}</p>
            </Reveal>
          </div>

          <aside className="lg:sticky lg:top-28 lg:self-start" aria-labelledby="a11y-feedback-title">
            <Reveal delay={0.15}>
              <div className="card card-pad">
                <h2 id="a11y-feedback-title" className="font-display text-lg font-bold text-navy-900">
                  {t('a11yStatement.contactTitle')}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-muted">{t('a11yStatement.contactText')}</p>
                <p className="mt-4 text-sm">
                  <span className="font-semibold text-navy-900">{t('a11yStatement.emailLabel')}: </span>
                  <a href={`mailto:${FEEDBACK_EMAIL}`} className="inline-flex min-h-6 items-center gap-1.5 font-semibold break-all text-brand-700 underline underline-offset-2 hover:text-brand-800">
                    <Mail className="size-4 shrink-0" aria-hidden />
                    {FEEDBACK_EMAIL}
                  </a>
                </p>
                <Link to="/contact" className="btn-primary mt-5 w-full">
                  <MessageCircle className="size-4" aria-hidden /> {t('a11yStatement.contactCta')}
                </Link>
                <p className="mt-4 text-xs text-muted">
                  {t('a11yStatement.openWidget')}: <kbd className="rounded border border-line bg-surface px-1.5 py-0.5 font-sans text-[11px] font-semibold text-navy-900">Alt + A</kbd>
                </p>
              </div>
            </Reveal>
          </aside>
        </div>
      </section>
    </>
  );
}
