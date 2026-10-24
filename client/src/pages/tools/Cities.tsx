import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Building2, Calculator, Info, Scale } from 'lucide-react';
import { PageHero } from '@/components/layout/PageHero';
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
        image="https://images.unsplash.com/photo-1467269204594-9661b134dd2b?auto=format&fit=crop&w=2000&q=70"
        crumb={{ to: '/tools', label: t('siteNav.tools') }}
      />

      <nav aria-label={t('citiesPage.title')} className="border-b border-line bg-card">
        <div className="container-x flex gap-1 overflow-x-auto py-2 text-sm font-semibold">
          {[
            { id: 'cities', icon: Building2 },
            { id: 'compare', icon: Scale },
            { id: 'calc', icon: Calculator },
          ].map(({ id, icon: Icon }) => (
            <a key={id} href={`#${id}`} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-ink/80 hover:bg-surface hover:text-ink">
              <Icon className="size-4" aria-hidden /> {t(`citiesPage.jump.${id}`)}
              {id === 'compare' && compare.length > 0 && <span className="rounded-full bg-brand-600 px-1.5 text-[11px] text-white tabular-nums">{compare.length}</span>}
            </a>
          ))}
        </div>
      </nav>

      <section id="cities" className="section scroll-mt-28">
        <div className="container-x">
          <div className="mb-6 flex flex-wrap items-start gap-2 rounded-xl border border-line bg-card p-4 text-sm text-muted">
            <Info className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />
            <p className="min-w-0 flex-1">
              <span className="font-semibold text-ink">{t('citiesPage.approx', { year: DATA_YEAR })}.</span> {t('citiesPage.disclaimer')}
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {CITIES.map((c) => (
              <CityCard key={c.slug} city={c} selected={compare.includes(c.slug)} canSelect={compare.length < MAX_COMPARE} onToggle={() => toggle(c.slug)} onCalc={() => openCalc(c.slug)} />
            ))}
          </div>
        </div>
      </section>

      <section id="compare" className="scroll-mt-28 pb-14 sm:pb-20">
        <div className="container-x">
          <SectionHeading eyebrow={t('citiesPage.jump.compare')} title={t('citiesPage.compare.title')} subtitle={t('citiesPage.compare.hint')} />
          <CompareTable cities={selected} onRemove={(s) => setCompare(compare.filter((x) => x !== s))} onClear={() => setCompare([])} />
        </div>
      </section>

      <section id="calc" ref={calcRef} className="scroll-mt-28 pb-14 sm:pb-20">
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
