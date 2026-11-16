import { useMemo, useState, type FormEvent, type InputHTMLAttributes } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { CheckCircle2, Clock3, GraduationCap, Languages, RotateCcw, Send, ShieldCheck, Users } from 'lucide-react';
import { PageHero } from '@/components/layout/PageHero';
import { Spinner } from '@/components/ui/Spinner';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { registerCopy } from '@/i18n';
import { pagesCandidateCatalogue } from '@/i18n/pagesCandidateCatalogue';
import { usePageTitle } from '@/lib/usePageTitle';

registerCopy(pagesCandidateCatalogue);

const GERMAN = ['A0_A2', 'B1', 'B2_PLUS'] as const;
const EXPERIENCE = ['0_2', '3_5', '6_10', '10_PLUS'] as const;
const AVAILABILITY = ['NOW', 'SOON', 'LATER'] as const;
type L6 = Record<'de' | 'en' | 'az' | 'ru' | 'tr' | 'uk', string>;

interface Group {
  profession: string;
  german: (typeof GERMAN)[number];
  experience: (typeof EXPERIENCE)[number];
  availability: (typeof AVAILABILITY)[number];
  count: number;
}
interface CatalogueData {
  groups: Group[];
  professions: { profession: string; count: number }[];
  total: number;
  suppressed: number;
  k: number;
  updatedAt: string;
  labels: Record<string, L6 | null>;
}

/**
 * /kandidaten — public anonymous candidate catalogue (German first). Shows only the k-anonymous groups the
 * server publishes (server lib/candidateCatalogue: consented pool, ≥ k identical generalised profiles, no
 * identifiers); filters work on those groups only. "Request candidates" → public inquiry (kind company) or,
 * for signed-in employers, the portal request flow. SSR key "candidate-catalogue".
 */
export default function CandidateCataloguePage() {
  const { t, i18n } = useTranslation();
  usePageTitle(t('catalogue.heroTitle'));
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const lng = ((i18n.resolvedLanguage ?? 'de').slice(0, 2) as keyof L6) || 'de';
  const { data, isLoading } = useQuery({ queryKey: ['candidate-catalogue'], queryFn: async () => (await api.get<CatalogueData>('/candidate-catalogue')).data, staleTime: 10 * 60_000 });

  const profession = params.get('beruf') ?? '';
  const german = params.get('deutsch') ?? '';
  const experience = params.get('erfahrung') ?? '';
  const availability = params.get('start') ?? '';
  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };
  const label = (p: string) => data?.labels[p]?.[lng] ?? data?.labels[p]?.de ?? p;

  const groups = useMemo(
    () =>
      (data?.groups ?? []).filter(
        (g) =>
          (!profession || g.profession === profession) &&
          (!german || GERMAN.indexOf(g.german) >= GERMAN.indexOf(german as Group['german'])) &&
          (!experience || EXPERIENCE.indexOf(g.experience) >= EXPERIENCE.indexOf(experience as Group['experience'])) &&
          (!availability || AVAILABILITY.indexOf(g.availability) <= AVAILABILITY.indexOf(availability as Group['availability'])),
      ),
    [data, profession, german, experience, availability],
  );
  const filtered = !!(profession || german || experience || availability);

  return (
    <>
      <PageHero title={t('catalogue.heroTitle')} subtitle={t('catalogue.heroSubtitle')} crumb={{ to: '/for-employers', label: t('catalogue.crumb') }} />
      <section className="section">
        <div className="container-x grid gap-6 lg:grid-cols-[18rem_1fr] lg:items-start">
          <aside className="space-y-4 rounded-3xl border border-line bg-card p-4 sm:p-5" aria-labelledby="cat-filters">
            <h2 id="cat-filters" className="font-display text-base font-semibold text-ink">
              {t('catalogue.filters.title')}
            </h2>
            <Select id="cat-prof" label={t('catalogue.filters.profession')} value={profession} onChange={(v) => setFilter('beruf', v)} options={[['', t('catalogue.filters.all')], ...(data?.professions ?? []).map((p) => [p.profession, `${label(p.profession)} (${p.count})`] as [string, string])]} />
            <Select id="cat-de" label={t('catalogue.filters.german')} value={german} onChange={(v) => setFilter('deutsch', v)} options={[['', t('catalogue.filters.any')], ...GERMAN.map((g) => [g, t(`catalogue.bands.german.${g}`)] as [string, string])]} />
            <Select id="cat-exp" label={t('catalogue.filters.experience')} value={experience} onChange={(v) => setFilter('erfahrung', v)} options={[['', t('catalogue.filters.any')], ...EXPERIENCE.map((g) => [g, t(`catalogue.bands.experience.${g}`)] as [string, string])]} />
            <Select id="cat-av" label={t('catalogue.filters.availability')} value={availability} onChange={(v) => setFilter('start', v)} options={[['', t('catalogue.filters.any')], ...AVAILABILITY.map((g) => [g, t(`catalogue.bands.availability.${g}`)] as [string, string])]} />
            {filtered && (
              <button type="button" className="btn-ghost btn-sm" onClick={() => setParams(new URLSearchParams(), { replace: true })}>
                <RotateCcw className="size-4" aria-hidden />
                {t('catalogue.filters.reset')}
              </button>
            )}
            <p className="flex items-start gap-2 border-t border-line pt-3 text-xs text-muted">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-link" aria-hidden />
              {t('catalogue.privacy', { k: data?.k ?? 3 })}
            </p>
          </aside>

          <div className="space-y-6">
            {isLoading ? (
              <div className="grid place-items-center py-12 text-link">
                <Spinner />
              </div>
            ) : (
              <>
                {data && data.total > 0 && (
                  <p className="text-sm text-muted" role="status">
                    <span className="font-semibold text-ink">{t('catalogue.total', { count: data.total })}</span>
                    {data.suppressed > 0 ? ` · ${t('catalogue.suppressed', { count: data.suppressed })}` : ''}
                  </p>
                )}
                {!groups.length ? (
                  <p className="rounded-3xl border border-dashed border-line bg-card p-6 text-sm text-muted">{data?.total ? t('catalogue.empty') : t('catalogue.emptyAll')}</p>
                ) : (
                  <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {groups.map((g) => (
                      <li key={`${g.profession}-${g.german}-${g.experience}-${g.availability}`} className="rounded-3xl border border-line bg-card p-4 sm:p-5">
                        <p className="font-display text-base font-semibold text-ink">{label(g.profession)}</p>
                        <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-link">
                          <Users className="size-4" aria-hidden />
                          {t('catalogue.card.count', { count: g.count })}
                        </p>
                        <dl className="mt-3 space-y-1.5 text-sm">
                          <Row icon={Languages} label={t('catalogue.card.german')} value={t(`catalogue.bands.german.${g.german}`)} />
                          <Row icon={GraduationCap} label={t('catalogue.card.experience')} value={t(`catalogue.bands.experience.${g.experience}`)} />
                          <Row icon={Clock3} label={t('catalogue.card.availability')} value={t(`catalogue.bands.availability.${g.availability}`)} />
                        </dl>
                        <a href="#cat-request" onClick={() => setFilter('beruf', g.profession)} className="mt-3 inline-block text-sm font-semibold text-link hover:underline">
                          {t('catalogue.request.title')}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
                {data && data.updatedAt && <p className="text-xs text-muted">{t('catalogue.updated', { date: new Date(data.updatedAt).toLocaleDateString(lng) })}</p>}
              </>
            )}

            <RequestForm professionLabel={profession ? label(profession) : ''} isCompany={user?.role === 'COMPANY'} />
          </div>
        </div>
      </section>
    </>
  );
}

const Row = ({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string }) => (
  <div className="flex items-center gap-2">
    <Icon className="size-4 shrink-0 text-muted" aria-hidden />
    <dt className="text-muted">{label}:</dt>
    <dd className="font-medium text-ink">{value}</dd>
  </div>
);

const Select = ({ id, label, value, onChange, options }: { id: string; label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) => (
  <div>
    <label className="label" htmlFor={id}>
      {label}
    </label>
    <select id={id} className="input" value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map(([v, l]) => (
        <option key={v || 'all'} value={v}>
          {l}
        </option>
      ))}
    </select>
  </div>
);

const RequestForm = ({ professionLabel, isCompany }: { professionLabel: string; isCompany: boolean }) => {
  const { t, i18n } = useTranslation();
  const [form, setForm] = useState({ companyName: '', contactName: '', email: '', phone: '', workersNeeded: '', message: '', website: '' });
  const locale = (['az', 'de', 'en', 'ru'] as const).find((l) => (i18n.resolvedLanguage ?? '').startsWith(l)) ?? 'de';
  const send = useMutation({
    mutationFn: async () =>
      api.post('/public/inquiries', {
        kind: 'company',
        companyName: form.companyName || undefined,
        contactName: form.contactName,
        email: form.email,
        phone: form.phone || undefined,
        workersNeeded: form.workersNeeded ? Number(form.workersNeeded) : undefined,
        message: form.message || t('catalogue.request.messagePrefill', { profession: professionLabel || '—' }),
        locale,
        website: form.website,
      }),
  });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    send.mutate();
  };
  return (
    <section id="cat-request" className="rounded-3xl border border-line bg-card p-4 sm:p-6" aria-labelledby="cat-request-h">
      <h2 id="cat-request-h" className="font-display text-lg font-semibold text-ink">
        {t('catalogue.request.title')}
      </h2>
      <p className="mt-1 text-sm text-muted">{t('catalogue.request.text')}</p>
      {isCompany && (
        <p className="mt-3 rounded-xl bg-sunken px-3 py-2 text-sm">
          {t('catalogue.request.portal')}{' '}
          <Link to="/company/requests/new" className="font-semibold text-link hover:underline">
            {t('catalogue.request.portalLink')}
          </Link>
        </p>
      )}
      {send.isSuccess ? (
        <p className="mt-4 flex items-center gap-2 text-sm font-semibold text-success-fg" role="status">
          <CheckCircle2 className="size-5" aria-hidden />
          {t('catalogue.request.sent')}
        </p>
      ) : (
        <form className="mt-4 grid gap-4 sm:grid-cols-2" onSubmit={onSubmit}>
          <Input id="cr-company" label={t('catalogue.request.company')} value={form.companyName} onChange={set('companyName')} autoComplete="organization" />
          <Input id="cr-name" label={t('catalogue.request.name')} value={form.contactName} onChange={set('contactName')} required autoComplete="name" />
          <Input id="cr-email" label={t('catalogue.request.email')} type="email" value={form.email} onChange={set('email')} required autoComplete="email" />
          <Input id="cr-phone" label={t('catalogue.request.phone')} type="tel" value={form.phone} onChange={set('phone')} autoComplete="tel" />
          <Input id="cr-count" label={t('catalogue.request.count')} type="number" value={form.workersNeeded} onChange={set('workersNeeded')} />
          <div className="sm:col-span-2">
            <label className="label" htmlFor="cr-msg">
              {t('catalogue.request.message')}
            </label>
            <textarea id="cr-msg" className="input" rows={4} maxLength={5000} value={form.message} placeholder={t('catalogue.request.messagePrefill', { profession: professionLabel || '…' })} onChange={set('message')} />
          </div>
          {/* honeypot */}
          <input type="text" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden value={form.website} onChange={set('website')} />
          {send.isError && <p className="text-sm text-danger-fg sm:col-span-2">{t('catalogue.request.error')}</p>}
          <div className="sm:col-span-2">
            <button type="submit" className={clsx('btn-primary')} disabled={send.isPending}>
              {send.isPending ? <Spinner className="size-4" /> : <Send className="size-4" aria-hidden />}
              {t('catalogue.request.send')}
            </button>
          </div>
        </form>
      )}
    </section>
  );
};

const Input = ({ id, label, ...rest }: { id: string; label: string } & InputHTMLAttributes<HTMLInputElement>) => (
  <div>
    <label className="label" htmlFor={id}>
      {label}
    </label>
    <input id={id} className="input" {...rest} />
  </div>
);
