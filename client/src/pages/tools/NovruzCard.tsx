import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Flower2 } from 'lucide-react';
import { PageHero } from '@/components/layout/PageHero';
import { ToolFaq, useFaq } from '@/components/tools/calc/CalcShared';
import { NovruzCardStudio } from '@/components/novruz/NovruzCardStudio';
import { NovruzDatesNote } from '@/components/novruz/NovruzInfo';
import { registerCopy } from '@/i18n';
import { pagesNovruzCard } from '@/i18n/pagesNovruzCard';
import { pagesWorkplaceEtiquette } from '@/i18n/pagesWorkplaceEtiquette';
import { usePageTitle } from '@/lib/usePageTitle';

registerCopy(pagesNovruzCard);
registerCopy(pagesWorkplaceEtiquette);

/**
 * /novruz-card — Novruz greeting card generator for any employer (German first): free-text first names, four
 * self-drawn designs, ready Azerbaijani greetings, optional German line, company name; PNG / A5 PDF made in the
 * browser. The company portal has the same studio with the employer's own workers and logo (/company/novruz-card).
 */
export default function NovruzCardPage() {
  const { t } = useTranslation();
  usePageTitle(t('novruz.heroTitle'));
  const faq = useFaq('novruz.faq');
  return (
    <>
      <PageHero title={t('novruz.heroTitle')} subtitle={t('novruz.heroSubtitle')} crumb={{ to: '/tools', label: t('siteNav.tools') }} />
      <section className="section">
        <div className="container-x max-w-6xl space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-line bg-card p-4 text-sm leading-relaxed text-ink">
              <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
                <Flower2 className="size-5 text-primary" aria-hidden /> {t('novruz.what.title')}
              </h2>
              <p className="mt-1">{t('novruz.what.text')}</p>
            </div>
            <div className="space-y-3">
              <NovruzDatesNote />
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                <Link to="/employer-guide-azerbaijan" className="inline-flex min-h-10 items-center gap-1 font-semibold text-link hover:underline">
                  {t('etq.employers.guide')} <ArrowRight className="size-4" aria-hidden />
                </Link>
                <Link to="/workplace-etiquette" className="inline-flex min-h-10 items-center gap-1 font-semibold text-link hover:underline">
                  {t('etq.teaser.title')} <ArrowRight className="size-4" aria-hidden />
                </Link>
              </div>
            </div>
          </div>
          <NovruzCardStudio />
        </div>
      </section>
      <ToolFaq items={faq} />
    </>
  );
}
