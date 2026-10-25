import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Building2, Calculator, Info, Scale } from 'lucide-react';
import { PageHero } from '@/components/layout/PageHero';
import { Germany } from '@/components/illustrations';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { PageCta } from '@/components/visa/PageCta';
import { CityCard } from '@/components/cities/CityCard';
import { CompareTable } from '@/components/cities/CompareTable';
import { CostCalculator } from '@/components/cities/CostCalculator';
import { CITIES, DATA_YEAR, cityBySlug } from '@/lib/cities/data';
import { registerCopy } from '@/i18n';
import { pagesCities } from '@/i18n/pagesCities';
import { usePageTitle } from '@/lib/usePageTitle';

registerCopy(pagesCities);

const MAX_COMPARE = 3;
const STORE_KEY = 'tv_cities_compare';

const loadCompare = (): string[] => {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) ?? '[]') as unknown;
    return Array.isArray(raw) ? raw.filter((s): s is string => typeof s === 'string' && !!cityBySlug(s)).slice(0, MAX_COMPARE) : [];
  } catch {
    return [];
  }
};

export default function CitiesGuide() {
  const { t } = useTranslation();
  usePageTitle(t('citiesPage.metaTitle'));
  const [compare, setCompareState] = useState<string[]>(loadCompare);
  const [calcCity, setCalcCity] = useState('berlin');
  const calcRef = useRef<HTMLElement>(null);

  const setCompare = (next: string[]) => {
    setCompareState(next);
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(next));
    } catch {
      /* private mode: comparison just is not remembered */
    }
  };
  const toggle = (slug: string) => {
    if (compare.includes(slug)) setCompare(compare.filter((s) => s !== slug));
    else if (compare.length >= MAX_COMPARE) toast.info(t('citiesPage.compare.max'));
    else setCompare([...compare, slug]);
  };
  const openCalc = (slug: string) => {
    setCalcCity(slug);
    calcRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const selected = compare.map((s) => cityBySlug(s)!).filter(Boolean);

  return (
    <>
      <PageHero
        title={t('citiesPage.title')}
        subtitle={t('citiesPage.subtitle')}
        illustration={<Germany />}
        crumb={{ to: '/tools', label: t('siteNav.tools') }}
      />

      <nav aria-label={t('citiesPage.title')} className="border-b border-line bg-canvas">
        <div className="container-x flex gap-1.5 overflow-x-auto py-2.5 text-sm font-semibold">
          {[
            { id: 'cities', icon: Building2 },
            { id: 'compare', icon: Scale },
            { id: 'calc', icon: Calculator },
          ].map(({ id, icon: Icon }) => (
            <a key={id} href={`#${id}`} className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full px-4 py-2 text-ink/80 transition-colors hover:bg-sunken hover:text-ink">
              <Icon className="size-4" aria-hidden /> {t(`citiesPage.jump.${id}`)}
              {id === 'compare' && compare.length > 0 && <span className="rounded-full bg-primary px-1.5 text-[11px] text-primary-contrast tabular-nums">{compare.length}</span>}
            </a>
          ))}
        </div>
      </nav>

      <section id="cities" className="section scroll-mt-28">
        <div className="container-x">
          <div className="mb-8 flex flex-wrap items-start gap-3 rounded-2xl border border-line bg-sunken p-4 text-sm text-muted sm:p-5">
            <Info className="mt-0.5 size-4 shrink-0 text-ink" aria-hidden />
            <p className="min-w-0 flex-1">
              <span className="font-semibold text-ink">{t('citiesPage.approx', { year: DATA_YEAR })}.</span> {t('citiesPage.disclaimer')}
            </p>
          </div>
          <div className="grid-cards sm:grid-cols-2 xl:grid-cols-3">
            {CITIES.map((c) => (
              <CityCard key={c.slug} city={c} selected={compare.includes(c.slug)} canSelect={compare.length < MAX_COMPARE} onToggle={() => toggle(c.slug)} onCalc={() => openCalc(c.slug)} />
            ))}
          </div>
        </div>
      </section>

      <section id="compare" className="section scroll-mt-28 bg-sunken">
        <div className="container-x">
          <SectionHeading eyebrow={t('citiesPage.jump.compare')} title={t('citiesPage.compare.title')} subtitle={t('citiesPage.compare.hint')} />
          <CompareTable cities={selected} onRemove={(s) => setCompare(compare.filter((x) => x !== s))} onClear={() => setCompare([])} />
        </div>
      </section>

      <section id="calc" ref={calcRef} className="section scroll-mt-28">
        <div className="container-x">
          <SectionHeading eyebrow={t('citiesPage.jump.calc')} title={t('citiesPage.calc.title')} subtitle={t('citiesPage.calc.subtitle')} />
          <CostCalculator citySlug={calcCity} onCityChange={setCalcCity} />
          <p className="mt-4 text-xs text-muted">{t('citiesPage.disclaimer')}</p>
        </div>
      </section>

      <PageCta title={t('citiesPage.cta.title')} text={t('citiesPage.cta.text')} primary={{ to: '/booking', label: t('citiesPage.cta.button') }} />
    </>
  );
}
