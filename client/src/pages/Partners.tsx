import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Building2, Layers, MapPin } from 'lucide-react';
import { PageHero } from '@/components/layout/PageHero';
import { HeroChips } from '@/components/about/shared';
import { cityCoords } from '@/components/about/geo';
import { PartnerModal, sectorOf } from '@/components/partners/parts';
import {
  CommitmentsSection,
  CompanyStepsSection,
  CompanyVoices,
  FeaturedPartners,
  MapExplorer,
  ModelsSection,
  PartnerDirectory,
  PartnersCta,
} from '@/components/partners/PartnerSections';
import { useSiteContent } from '@/lib/content';
import type { Partner } from '@/lib/types';
import { registerCopy } from '@/i18n';
import { pagesCompany } from '@/i18n/pagesCompany';

registerCopy(pagesCompany);

export default function Partners() {
  const { t } = useTranslation();
  const { data } = useSiteContent();
  const partners = useMemo(() => data?.partners ?? [], [data]);
  const [open, setOpen] = useState<Partner | null>(null);
  const onOpen = useCallback((p: Partner) => setOpen(p), []);
  const close = useCallback(() => setOpen(null), []);

  const featured = partners.filter((p) => p.featured);
  const cities = new Set(partners.filter((p) => cityCoords(p.city)).map((p) => p.city!.trim())).size;
  const sectors = new Set(partners.map(sectorOf)).size;
  // German office = the office located in Germany (rough bounding box), used as a map marker
  const deOffice = data?.settings.contact?.offices.find((o) => o.lat > 47 && o.lat < 55.2 && o.lng > 5.5 && o.lng < 15.5);

  return (
    <>
      <PageHero title={t('partnersPage.hero.title')} subtitle={t('partnersPage.hero.subtitle')} image="https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?auto=format&fit=crop&w=2000&q=70">
        {partners.length > 0 && (
          <HeroChips
            items={[
              <>
                <Building2 className="size-4 text-brand-400" /> {partners.length} {t('partnersPage.hero.partners')}
              </>,
              <>
                <MapPin className="size-4 text-brand-400" /> {cities} {t('partnersPage.hero.cities')}
              </>,
              <>
                <Layers className="size-4 text-brand-400" /> {sectors} {t('partnersPage.hero.sectors')}
              </>,
            ]}
          />
        )}
      </PageHero>

      <FeaturedPartners partners={featured} onOpen={onOpen} />
      {partners.length > 0 && <MapExplorer partners={partners} office={deOffice} onOpen={onOpen} />}
      <PartnerDirectory partners={partners} onOpen={onOpen} />
      <CommitmentsSection />
      <ModelsSection />
      <CompanyStepsSection />
      <CompanyVoices items={data?.testimonials.filter((x) => x.kind === 'company') ?? []} />
      <PartnersCta partners={partners} />

      <PartnerModal partner={open} onClose={close} />
    </>
  );
}
