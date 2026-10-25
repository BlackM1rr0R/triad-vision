import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, FileText } from 'lucide-react';
import { PageHero, PageHeroSkeleton } from '@/components/layout/PageHero';
import { EbookCover, LeadMagnetForm, useLeadMagnet } from '@/components/growth/LeadMagnetBlock';
import { usePageTitle } from '@/lib/usePageTitle';
import NotFound from '../NotFound';

const HERO = 'https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=2000&q=70';

/** /ebook/:slug — an e-book lead magnet: what is inside and the e-mail form (download link by e-mail). */
export default function Ebook() {
  const { t } = useTranslation();
  const { slug = '' } = useParams();
  const { data, isLoading, isError } = useLeadMagnet(slug);
  usePageTitle(data?.title ?? t('discover.ebook.eyebrow'));

  if (isLoading) return <PageHeroSkeleton />;
  if (isError || !data) return <NotFound />;

  const items = t('discover.ebook.insideItems', { returnObjects: true }) as unknown;
  return (
    <>
      <PageHero title={data.title} subtitle={data.description || undefined} image={HERO} crumb={{ to: '/guides', label: t('nav.guides') }} />
      <section className="section bg-sunken">
        <div className="container-x grid items-start gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-12">
          <div className="grid gap-6 sm:grid-cols-[10rem_minmax(0,1fr)]">
            <div className="mx-auto w-40 sm:w-full">
              <EbookCover magnet={data} />
            </div>
            <div>
              <p className="eyebrow mb-3">
                <FileText className="size-4" aria-hidden /> {t('discover.ebook.free')}
              </p>
              <h2 className="font-display text-xl font-semibold text-ink">{t('discover.ebook.inside')}</h2>
              <ul className="mt-3 space-y-2">
                {(Array.isArray(items) ? (items as string[]) : []).map((x) => (
                  <li key={x} className="flex gap-2 text-ink">
                    <CheckCircle2 className="mt-1 size-4 shrink-0 text-success" aria-hidden /> {x}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="card card-pad rounded-3xl">
            <h2 className="font-display text-lg font-semibold text-ink">{t('discover.ebook.formTitle')}</h2>
            <div className="mt-4">
              {data.fileLocale ? <LeadMagnetForm magnet={data} from={`ebook:${data.slug}`} /> : <p className="text-sm text-muted">{t('discover.ebook.notFound')}</p>}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
