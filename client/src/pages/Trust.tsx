import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Activity, Building2, FileLock2, Mail, MapPin, Server, ShieldCheck } from 'lucide-react';
import { PageHero } from '@/components/layout/PageHero';
import { api } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesTrust } from '@/i18n/pagesTrust';
import { usePageTitle } from '@/lib/usePageTitle';

registerCopy(pagesTrust);

interface TrustData {
  dataLocation: string | null;
  dataLocationConfirmed: boolean;
  backupLocation: string | null;
  securityEmail: string | null;
  note: string | null;
  measures: { key: string; category: string }[];
  subprocessors: { key: string; name: string; optional: boolean }[];
  avvAvailable: boolean;
  links: { privacy: string; imprint: string; status: string };
}

const CATEGORY_ORDER = ['access', 'authorisation', 'transfer', 'input', 'availability', 'separation', 'encryption'];

/**
 * /trust — public Trust Center (German first): GDPR documents, AVV availability, data location (only when the
 * owner confirmed it in Admin › Trust Center), measures implemented in the code, configured sub-processors,
 * status page and the contact for security reports. Data: GET /api/trust (SSR key "trust-center").
 */
export default function TrustPage() {
  const { t } = useTranslation();
  usePageTitle(t('trust.heroTitle'));
  const { data } = useQuery({ queryKey: ['trust-center'], queryFn: async () => (await api.get<TrustData>('/trust')).data, staleTime: 5 * 60_000 });

  return (
    <>
      <PageHero title={t('trust.heroTitle')} subtitle={t('trust.heroSubtitle')} crumb={{ to: '/for-employers', label: t('trust.crumb') }} />
      <section className="section">
        <div className="container-x grid gap-6 lg:grid-cols-2">
          <Card icon={FileLock2} title={t('trust.docs.title')}>
            <ul className="space-y-2 text-sm">
              <li>
                <Link to={data?.links.privacy ?? '/privacy'} className="font-semibold text-link hover:underline">
                  {t('trust.docs.privacy')}
                </Link>
              </li>
              <li>
                <Link to={data?.links.imprint ?? '/impressum'} className="font-semibold text-link hover:underline">
                  {t('trust.docs.imprint')}
                </Link>
              </li>
              <li className="text-ink">
                {data?.avvAvailable ? t('trust.docs.avvAvailable') : t('trust.docs.avvOnRequest')}{' '}
                <Link to={data?.avvAvailable ? '/company/avv' : '/contact'} className="font-semibold text-link hover:underline">
                  {data?.avvAvailable ? t('trust.docs.avvPortal') : t('trust.docs.contact')}
                </Link>
              </li>
            </ul>
          </Card>

          <Card icon={MapPin} title={t('trust.location.title')}>
            <p className="text-sm text-ink">{t('trust.location.hosting')}</p>
            {data?.dataLocation && (
              <p className="mt-2 text-sm text-ink">
                <span className="font-semibold">{t('trust.location.value', { location: data.dataLocation })}</span>
                {data.dataLocationConfirmed && <span className="badge ml-2 bg-success-bg text-success-fg align-middle">{t('trust.location.confirmed')}</span>}
              </p>
            )}
            {data?.backupLocation && <p className="mt-1 text-sm text-muted">{t('trust.location.backups', { location: data.backupLocation })}</p>}
          </Card>

          <Card icon={ShieldCheck} title={t('trust.measures.title')} className="lg:col-span-2">
            <p className="mb-4 text-sm text-muted">{t('trust.measures.note')}</p>
            <div className="grid gap-4 sm:grid-cols-2">
              {CATEGORY_ORDER.map((c) => {
                const items = (data?.measures ?? []).filter((m) => m.category === c);
                if (!items.length) return null;
                return (
                  <div key={c} className="rounded-2xl bg-sunken p-4">
                    <h3 className="text-sm font-semibold text-ink">{t(`trust.measures.categories.${c}`)}</h3>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink">
                      {items.map((m) => (
                        <li key={m.key}>{t(`trust.measures.items.${m.key}`)}</li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
            {data?.note && <p className="mt-4 text-sm text-muted">{data.note}</p>}
          </Card>

          <Card icon={Server} title={t('trust.subs.title')}>
            <p className="mb-3 text-sm text-muted">{t('trust.subs.intro')}</p>
            <ul className="divide-y divide-line text-sm">
              {(data?.subprocessors ?? []).map((s) => (
                <li key={s.key} className="py-2">
                  <p className="font-semibold text-ink">{s.name}</p>
                  <p className="text-muted">
                    {t(`trust.subs.purposes.${s.key}`)}
                    {s.optional ? ` · ${t('trust.subs.optional')}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          </Card>

          <div className="space-y-6">
            <Card icon={Activity} title={t('trust.status.title')}>
              <p className="text-sm text-ink">{t('trust.status.text')}</p>
              <Link to={data?.links.status ?? '/status'} className="btn-secondary btn-sm mt-3">
                {t('trust.status.link')}
              </Link>
            </Card>
            <Card icon={Mail} title={t('trust.disclosure.title')}>
              <p className="text-sm text-ink">{t('trust.disclosure.text')}</p>
              {data?.securityEmail ? (
                <a href={`mailto:${data.securityEmail}`} className="mt-2 inline-block font-semibold text-link hover:underline">
                  {data.securityEmail}
                </a>
              ) : (
                <Link to="/contact" className="mt-2 inline-block font-semibold text-link hover:underline">
                  {t('trust.disclosure.none')}
                </Link>
              )}
            </Card>
          </div>
        </div>
        <div className="container-x mt-6">
          <Link to="/for-employers" className="inline-flex items-center gap-2 text-sm font-semibold text-link hover:underline">
            <Building2 className="size-4" aria-hidden />
            {t('trust.crumb')}
          </Link>
        </div>
      </section>
    </>
  );
}

const Card = ({ icon: Icon, title, children, className }: { icon: typeof ShieldCheck; title: string; children: ReactNode; className?: string }) => (
  <section className={`rounded-3xl border border-line bg-card p-5 sm:p-6 ${className ?? ''}`} aria-labelledby={`trust-${title.replace(/\W+/g, '-')}`}>
    <h2 id={`trust-${title.replace(/\W+/g, '-')}`} className="mb-3 flex items-center gap-2 font-display text-lg font-semibold text-ink">
      <Icon className="size-5 shrink-0 text-link" aria-hidden />
      {title}
    </h2>
    {children}
  </section>
);
