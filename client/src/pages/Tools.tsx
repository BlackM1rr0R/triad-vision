import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageHero } from '@/components/layout/PageHero';
import { Reveal, Stagger, StaggerItem } from '@/components/motion';
import { ConsultStrip, ToolCard } from '@/components/audience/AudienceSections';
import { TOOL_GROUPS, TOOLS } from '@/components/audience/tools';
import { usePageTitle } from '@/lib/usePageTitle';

const IMG = 'https://images.unsplash.com/photo-1554224155-6726b3ff858f?auto=format&fit=crop&w=2000&q=70';

/** /tools: every calculator, check and planning aid of the site on one page, in four groups. */
export default function Tools() {
  const { t } = useTranslation();
  usePageTitle(t('siteNav.tools'));
  return (
    <>
      <PageHero title={t('toolsPage.title')} subtitle={t('toolsPage.subtitle')} image={IMG}>
        <nav aria-label={t('toolsPage.jump')} className="mt-6">
          <ul className="flex flex-wrap gap-2">
            {TOOL_GROUPS.map((g) => (
              <li key={g}>
                <Link to={{ hash: `#${g}` }} className="inline-flex min-h-10 items-center rounded-full border border-white/25 px-4 text-sm font-semibold text-white transition hover:bg-white hover:text-navy-900">
                  {t(`toolsPage.groups.${g}.title`)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </PageHero>

      {TOOL_GROUPS.map((g, gi) => (
        <section key={g} id={g} aria-labelledby={`${g}-title`} className={gi % 2 ? 'section scroll-mt-20 bg-surface' : 'section scroll-mt-20'}>
          <div className="container-x">
            <Reveal y={16}>
              <div className="section-head max-w-3xl">
                <span className="eyebrow mb-3">{t('toolsPage.eyebrow')}</span>
                <h2 id={`${g}-title`} className="h-section text-balance text-navy-900">
                  {t(`toolsPage.groups.${g}.title`)}
                </h2>
                <p className="mt-3 text-[0.95rem] leading-relaxed text-muted sm:text-lg">{t(`toolsPage.groups.${g}.text`)}</p>
              </div>
            </Reveal>
            <Stagger className="grid-cards sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {TOOLS.filter((x) => x.group === g).map((tool) => (
                <StaggerItem key={tool.key}>
                  <ToolCard tool={tool} />
                </StaggerItem>
              ))}
            </Stagger>
          </div>
        </section>
      ))}

      <section className="pb-16 sm:pb-20 lg:pb-28">
        <div className="container-x">
          <ConsultStrip title={t('toolsPage.ctaTitle')} text={t('toolsPage.ctaText')} />
        </div>
      </section>
    </>
  );
}
