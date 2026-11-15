import { useTranslation } from 'react-i18next';
import { HeartHandshake } from 'lucide-react';
import { PageHero } from '@/components/layout/PageHero';
import { Germany } from '@/components/illustrations';
import { PageCta } from '@/components/visa/PageCta';
import { LifeSimulator } from '@/components/life/LifeSimulator';
import { LifeArticle } from '@/components/life/LifeArticle';
import { useLifeConfig } from '@/components/life/api';
import { RelatedGuides } from '@/components/guides/RelatedGuides';
import { registerCopy } from '@/i18n';
import { pagesLife } from '@/i18n/pagesLife';
import { useClientOnly } from '@/lib/ssr';
import { usePageTitle } from '@/lib/usePageTitle';

registerCopy(pagesLife);

/**
 * Public "Life in Germany" simulator (/life-in-germany). Choices come from the URL (share links). The page,
 * article and FAQ are server-rendered; the interactive simulator mounts after hydration into a placeholder of
 * about its height (so nothing below jumps and server / browser number formatting can never differ).
 */
export default function LifeInGermanyPage() {
  const { t } = useTranslation();
  usePageTitle(t('life.heroTitle'));
  const client = useClientOnly();
  const config = useLifeConfig();
  return (
    <>
      <PageHero title={t('life.heroTitle')} subtitle={t('life.heroSubtitle')} illustration={<Germany />} crumb={{ to: '/tools', label: t('siteNav.tools') }} />
      <section className="section">
        <div className="container-x">{client ? <LifeSimulator /> : <div className="min-h-[52rem] lg:min-h-[40rem]" aria-hidden />}</div>
      </section>
      <LifeArticle config={config.data} />
      <RelatedGuides tool="/life-in-germany" />
      <PageCta
        icon={<HeartHandshake className="size-7" aria-hidden />}
        title={t('life.teaser.title')}
        text={t('life.teaser.text')}
        primary={{ to: '/booking', label: t('life.actions.booking') }}
        secondary={{ to: '/budget', label: t('life.actions.budget') }}
      />
    </>
  );
}
