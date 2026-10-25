import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { AlertTriangle, BedDouble, Car, CheckCircle2, ChevronLeft, ChevronRight, Clock, ExternalLink, Inbox, Mail, Phone, Plane, PlaneLanding, Search, XCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesArrival } from '@/i18n/pagesArrival';
import { usePageTitle } from '@/lib/usePageTitle';
import { useRealtime } from '@/lib/realtime';
import { Spinner } from '@/components/ui/Spinner';
import { Drawer as UiDrawer } from '@/components/ui/Drawer';
import { EmptyState, ErrorBlock, LoadingBlock, PageHead, StatTile, Switch } from '@/components/admin/ui';
import {
  ARRIVAL_STATUSES,
  ArrivalStatusPill,
  ArrivalTimeline,
  HOUSING_STATUSES,
  HousingPill,
  airportLabel,
  personName,
  useArrivalError,
  useArrivalFormat,
  type HousingStatus,
  type StaffArrivalPlan,
} from '@/components/arrival/shared';

registerCopy(pagesArrival);

interface ListResponse {
  items: StaffArrivalPlan[];
  total: number;
  page: number;
  pageSize: number;
  counts: { submitted: number; confirmed: number; upcoming: number; pickupOpen: number; housingOpen: number };
}

interface Person {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
}

const KEY = ['admin-arrivals'] as const;

// ─── Detail drawer ────────────────────────────────────────────────────────

const Section = ({ title, icon: Icon, children }: { title: string; icon: typeof Plane; children: ReactNode }) => (
  <section className="rounded-xl border border-line bg-card p-4">
    <h3 className="mb-2 flex items-center gap-2 text-xs font-bold tracking-wide text-muted uppercase">
      <Icon className="size-4 text-link" aria-hidden /> {title}
    </h3>
    {children}
  </section>
);

const Def = ({ label, children }: { label: ReactNode; children: ReactNode }) => (
  <div className="flex justify-between gap-4 py-1 text-sm">
    <dt className="text-muted">{label}</dt>
    <dd className="text-right font-medium text-ink">{children ?? '—'}</dd>
  </div>
);

const Drawer = ({ caseId, onClose }: { caseId: string; onClose: () => void }) => {
  const { t } = useTranslation();
  const f = useArrivalFormat();
  const qc = useQueryClient();
  const onError = useArrivalError();
  const detail = useQuery({ queryKey: [...KEY, 'detail', caseId], queryFn: async () => (await api.get<{ plan: StaffArrivalPlan }>(`/admin/arrivals/${caseId}`)).data.plan });
  const people = useQuery({ queryKey: [...KEY, 'staff'], queryFn: async () => (await api.get<{ people: Person[] }>('/admin/arrivals/staff')).data.people, staleTime: 5 * 60_000 });
  const plan = detail.data;

  const [form, setForm] = useState({ pickupConfirmed: false, pickupDetails: '', housingStatus: 'NONE' as HousingStatus, housingDetails: '', staffNote: '', handledById: '', note: '' });
  useEffect(() => {
    if (plan)
      setForm({
        pickupConfirmed: plan.pickupConfirmed,
        pickupDetails: plan.pickupDetails ?? '',
        housingStatus: plan.housingStatus,
        housingDetails: plan.housingDetails ?? '',
        staffNote: plan.staffNote ?? '',
        handledById: plan.handledById ?? '',
        note: '',
      });
  }, [plan]);


  const save = useMutation({
    mutationFn: async (status?: 'CONFIRMED' | 'COMPLETED' | 'CANCELLED') =>
      (
        await api.patch<{ plan: StaffArrivalPlan }>(`/admin/arrivals/${caseId}`, {
          ...(status ? { status } : {}),
          ...(plan?.pickupRequested ? { pickupConfirmed: form.pickupConfirmed } : {}),
          pickupDetails: form.pickupDetails || null,
          housingStatus: form.housingStatus,
          housingDetails: form.housingDetails || null,
          staffNote: form.staffNote || null,
          handledById: form.handledById || null,
          note: form.note || null,
        })
      ).data.plan,
    onSuccess: (p) => {
      qc.setQueryData([...KEY, 'detail', caseId], p);
      void qc.invalidateQueries({ queryKey: KEY, predicate: (q) => q.queryKey[1] !== 'detail' && q.queryKey[1] !== 'staff' });
      toast.success(t('arrival.admin.detail.saved'));
    },
    onError,
  });

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((s) => ({ ...s, [k]: v }));
  const can = (target: 'CONFIRMED' | 'COMPLETED' | 'CANCELLED') =>
    !!plan && ({ CONFIRMED: ['DRAFT', 'SUBMITTED'], COMPLETED: ['SUBMITTED', 'CONFIRMED'], CANCELLED: ['DRAFT', 'SUBMITTED', 'CONFIRMED'] }[target] as string[]).includes(plan.status);

  return (
    <UiDrawer
      open
      onClose={onClose}
      width="md"
      closeLabel={t('arrival.admin.detail.back')}
      title={
        <span className="flex items-center gap-2">
          <PlaneLanding className="size-5 shrink-0 text-link" aria-hidden />
          <span className="truncate">{plan ? personName(plan.client) : '…'}</span>
        </span>
      }
      description={plan ? <span className="block truncate text-xs">{plan.case.number} · {plan.case.profession}</span> : undefined}
      headerActions={plan ? <ArrivalStatusPill status={plan.status} /> : undefined}
      bodyClassName="space-y-4 bg-sunken"
      footer={
        plan && (
          <div className="flex w-full flex-wrap items-center gap-2">
            <button type="button" className="btn-primary btn-sm" disabled={save.isPending} onClick={() => save.mutate(undefined)}>
              {save.isPending && <Spinner className="size-4" />} {t('arrival.admin.detail.save')}
            </button>
            <span className="flex-1" />
            {can('CONFIRMED') && (
              <button type="button" className="btn-secondary btn-sm" disabled={save.isPending} onClick={() => save.mutate('CONFIRMED')}>
                <CheckCircle2 className="size-4 text-success-fg" aria-hidden /> {t('arrival.admin.detail.confirm')}
              </button>
            )}
            {can('COMPLETED') && (
              <button type="button" className="btn-secondary btn-sm" disabled={save.isPending} onClick={() => save.mutate('COMPLETED')}>
                <PlaneLanding className="size-4 text-link" aria-hidden /> {t('arrival.admin.detail.complete')}
              </button>
            )}
            {can('CANCELLED') && (
              <button type="button" className="btn-sm inline-flex items-center gap-1.5 rounded-lg px-3 font-semibold text-danger-fg hover:bg-danger-bg" disabled={save.isPending} onClick={() => save.mutate('CANCELLED')}>
                <XCircle className="size-4" aria-hidden /> {t('arrival.admin.detail.cancel')}
              </button>
            )}
          </div>
        )
      }
    >
          {detail.isLoading ? (
            <LoadingBlock />
          ) : detail.isError || !plan ? (
            <ErrorBlock error={detail.error} onRetry={() => void detail.refetch()} />
          ) : (
            <>
              <ArrivalTimeline status={plan.status} />

              <Section title={t('arrival.admin.detail.client')} icon={Mail}>
                <dl>
                  <Def label="E-mail">
                    <a href={`mailto:${plan.client.email}`} className="text-link hover:underline">
                      {plan.client.email}
                    </a>
                  </Def>
                  {plan.client.phone && (
                    <Def label={<Phone className="inline size-3.5" aria-label="Phone" />}>
                      <a href={`tel:${plan.client.phone}`} className="text-link hover:underline">
                        {plan.client.phone}
                      </a>
                    </Def>
                  )}
                  <Def label={t('arrival.admin.detail.submittedAt')}>{f.dateTime(plan.submittedAt)}</Def>
                </dl>
                <Link to={`/admin/cases/${plan.case.id}`} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-link hover:underline">
                  <ExternalLink className="size-3.5" aria-hidden /> {t('arrival.admin.detail.openCase')}
                </Link>
              </Section>

              <Section title={t('arrival.admin.detail.flight')} icon={Plane}>
                <dl>
                  <Def label={t('arrival.flight.flightNumber')}>{plan.flightNumber}</Def>
                  <Def label={t('arrival.flight.flightDate')}>{f.day(plan.flightDate)}</Def>
                  <Def label={t('arrival.flight.departure')}>{airportLabel(plan.departureAirport)}</Def>
                  <Def label={t('arrival.flight.arrival')}>{airportLabel(plan.arrivalAirport)}</Def>
                  <Def label={t('arrival.flight.arrivalTime')}>
                    <span className={clsx(plan.upcoming && 'font-bold text-warning-fg')}>{f.arrival(plan.arrivalTime)}</span>
                  </Def>
                  <Def label={t('arrival.flight.travellers')}>{plan.travellers}</Def>
                  {plan.luggageNote && <Def label={t('arrival.flight.luggage')}>{plan.luggageNote}</Def>}
                </dl>
              </Section>

              <Section title={t('arrival.admin.detail.wishes')} icon={BedDouble}>
                <dl>
                  <Def label={t('arrival.steps.pickup')}>{plan.pickupRequested ? t('arrival.admin.pickupYes') : '—'}</Def>
                  <Def label={t('arrival.steps.housing')}>{plan.housingStatus !== 'NONE' ? [plan.housingCity, plan.housingBudget ? t('arrival.summary.budget', { amount: plan.housingBudget }) : null, f.day(plan.housingFrom)].filter(Boolean).join(' · ') : '—'}</Def>
                </dl>
                {plan.housingNote && <p className="mt-2 rounded-lg bg-sunken p-2.5 text-sm whitespace-pre-line text-ink/85">{plan.housingNote}</p>}
                {plan.clientNote && (
                  <p className="mt-2 rounded-lg bg-sunken p-2.5 text-sm whitespace-pre-line text-ink/85">
                    <span className="font-semibold">{t('arrival.admin.detail.clientNote')}:</span> {plan.clientNote}
                  </p>
                )}
              </Section>

              <Section title={t('arrival.admin.detail.staffFields')} icon={Car}>
                <div className="space-y-3">
                  <label className={clsx('flex items-center gap-2 text-sm font-medium text-ink', !plan.pickupRequested && 'opacity-50')}>
                    <Switch checked={form.pickupConfirmed} disabled={!plan.pickupRequested} onChange={(v) => set('pickupConfirmed', v)} label={t('arrival.admin.detail.pickupConfirmed')} />
                    {t('arrival.admin.detail.pickupConfirmed')}
                  </label>
                  <label className="block">
                    <span className="label">{t('arrival.admin.detail.pickupDetails')}</span>
                    <textarea className="input min-h-16" maxLength={2000} placeholder={t('arrival.admin.detail.pickupDetailsPh')} value={form.pickupDetails} onChange={(e) => set('pickupDetails', e.target.value)} />
                  </label>
                  <label className="block">
                    <span className="label">{t('arrival.admin.detail.housingStatus')}</span>
                    <select className="input" value={form.housingStatus} onChange={(e) => set('housingStatus', e.target.value as HousingStatus)}>
                      {HOUSING_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {t(`arrival.housing.${s}`)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="label">{t('arrival.admin.detail.housingDetails')}</span>
                    <textarea className="input min-h-16" maxLength={4000} placeholder={t('arrival.admin.detail.housingDetailsPh')} value={form.housingDetails} onChange={(e) => set('housingDetails', e.target.value)} />
                  </label>
                  <label className="block">
                    <span className="label">{t('arrival.admin.detail.handler')}</span>
                    <select className="input" value={form.handledById} onChange={(e) => set('handledById', e.target.value)}>
                      <option value="">
                        {t('arrival.admin.detail.noHandler')}
                        {plan.case.assignedStaff ? ` (${personName(plan.case.assignedStaff)})` : ''}
                      </option>
                      {people.data?.map((p) => (
                        <option key={p.id} value={p.id}>
                          {personName(p)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="label">{t('arrival.admin.detail.staffNote')}</span>
                    <textarea className="input min-h-16" maxLength={4000} value={form.staffNote} onChange={(e) => set('staffNote', e.target.value)} />
                  </label>
                  <label className="block">
                    <span className="label">{t('arrival.admin.detail.note')}</span>
                    <input className="input" maxLength={1000} value={form.note} onChange={(e) => set('note', e.target.value)} />
                  </label>
                </div>
              </Section>
            </>
          )}
    </UiDrawer>
  );
};

// ─── List ─────────────────────────────────────────────────────────────────

export default function AdminArrivals() {
  const { t } = useTranslation();
  usePageTitle(t('arrival.admin.title'));
  const f = useArrivalFormat();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const caseId = (useParams()['*'] ?? '').split('/')[0] || null;
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? 'open';
  const upcoming = params.get('upcoming') === '1';
  const pickup = params.get('pickup') === '1';
  const housing = params.get('housing') === '1';
  const mine = params.get('mine') === '1';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const [search, setSearch] = useState(params.get('search') ?? '');

  const set = (k: string, v: string | null) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        if (v) n.set(k, v);
        else n.delete(k);
        if (k !== 'page') n.delete('page');
        return n;
      },
      { replace: true },
    );

  useEffect(() => {
    const h = setTimeout(() => {
      if ((params.get('search') ?? '') !== search.trim()) set('search', search.trim() || null);
    }, 300);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const qs = new URLSearchParams();
  qs.set('status', status);
  if (upcoming) qs.set('upcoming', '1');
  if (pickup) qs.set('pickup', '1');
  if (housing) qs.set('housing', '1');
  if (mine) qs.set('mine', '1');
  if (params.get('search')) qs.set('search', params.get('search')!);
  qs.set('page', String(page));
  qs.set('pageSize', '30');

  const list = useQuery({
    queryKey: [...KEY, qs.toString()],
    queryFn: async () => (await api.get<ListResponse>(`/admin/arrivals?${qs}`)).data,
    placeholderData: keepPreviousData,
  });

  useRealtime('notification', (p) => {
    if (typeof p.type === 'string' && p.type.startsWith('ARRIVAL_')) void qc.invalidateQueries({ queryKey: KEY });
  });

  const counts = list.data?.counts;
  const pages = list.data ? Math.max(1, Math.ceil(list.data.total / list.data.pageSize)) : 1;
  const open = (id: string) => navigate({ pathname: `/admin/arrivals/${id}`, search: params.toString() });
  const close = () => navigate({ pathname: '/admin/arrivals', search: params.toString() });

  return (
    <div>
      <PageHead title={t('arrival.admin.title')} subtitle={t('arrival.admin.subtitle')} />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatTile label={t('arrival.admin.tiles.submitted')} value={counts?.submitted ?? '—'} icon={Inbox} tone={counts?.submitted ? 'warn' : undefined} />
        <StatTile label={t('arrival.admin.tiles.confirmed')} value={counts?.confirmed ?? '—'} icon={CheckCircle2} tone={counts?.confirmed ? 'good' : undefined} />
        <StatTile label={t('arrival.admin.tiles.upcoming')} value={counts?.upcoming ?? '—'} icon={Clock} tone={counts?.upcoming ? 'warn' : undefined} />
        <StatTile label={t('arrival.admin.tiles.pickupOpen')} value={counts?.pickupOpen ?? '—'} icon={Car} tone={counts?.pickupOpen ? 'danger' : undefined} />
        <StatTile label={t('arrival.admin.tiles.housingOpen')} value={counts?.housingOpen ?? '—'} icon={BedDouble} />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input className="input pl-9" placeholder={t('arrival.admin.filters.search')} value={search} onChange={(e) => setSearch(e.target.value)} aria-label={t('arrival.admin.filters.search')} />
        </label>
        <select className="input w-auto" value={status} onChange={(e) => set('status', e.target.value === 'open' ? null : e.target.value)} aria-label={t('arrival.admin.cols.status')}>
          <option value="open">{t('arrival.admin.filters.open')}</option>
          <option value="all">{t('arrival.admin.filters.all')}</option>
          {ARRIVAL_STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`arrival.status.${s}`)}
            </option>
          ))}
        </select>
        {(
          [
            ['upcoming', upcoming],
            ['pickup', pickup],
            ['housing', housing],
            ['mine', mine],
          ] as const
        ).map(([k, v]) => (
          <label key={k} className="inline-flex items-center gap-2 text-sm font-medium text-ink">
            <Switch checked={v} onChange={(on: boolean) => set(k, on ? '1' : null)} label={t(`arrival.admin.filters.${k}`)} />
            {t(`arrival.admin.filters.${k}`)}
          </label>
        ))}
      </div>

      {list.isLoading ? (
        <LoadingBlock />
      ) : list.isError ? (
        <ErrorBlock error={list.error} onRetry={() => void list.refetch()} />
      ) : !list.data?.items.length ? (
        <div className="rounded-xl border border-line bg-card">
          <EmptyState icon={PlaneLanding} title={t('arrival.admin.empty')} />
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-card">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="border-b border-line bg-surface/70 text-xs font-medium whitespace-nowrap text-muted">
                <tr>
                  <th className="px-4 py-2.5">{t('arrival.admin.cols.client')}</th>
                  <th className="px-4 py-2.5">{t('arrival.admin.cols.case')}</th>
                  <th className="px-4 py-2.5">{t('arrival.admin.cols.arrival')}</th>
                  <th className="px-4 py-2.5">{t('arrival.admin.cols.airport')}</th>
                  <th className="px-4 py-2.5">{t('arrival.admin.cols.pickup')}</th>
                  <th className="px-4 py-2.5">{t('arrival.admin.cols.housing')}</th>
                  <th className="px-4 py-2.5">{t('arrival.admin.cols.status')}</th>
                </tr>
              </thead>
              <tbody className={clsx('divide-y divide-line', list.isFetching && 'opacity-60')}>
                {list.data.items.map((p) => (
                  <tr
                    key={p.id}
                    onClick={() => open(p.caseId)}
                    className={clsx('cursor-pointer transition-colors hover:bg-surface/60', p.upcoming && 'bg-warning-bg/70', p.caseId === caseId && 'bg-primary/[0.06]')}
                  >
                    <td className="px-4 py-3">
                      <button type="button" className="text-left font-medium text-ink hover:text-link" onClick={(e) => {
                          e.stopPropagation();
                          open(p.caseId);
                        }}>
                        {personName(p.client)}
                      </button>
                      <span className="block truncate text-[11px] text-muted">{p.client.email}</span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="font-semibold text-link tabular-nums">{p.case.number}</span>
                      <span className="block text-[11px] text-muted">{p.handledBy ? personName(p.handledBy) : p.case.assignedStaff ? personName(p.case.assignedStaff) : '—'}</span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {p.arrivalTime ? (
                        <span className={clsx('inline-flex items-center gap-1', p.upcoming && 'font-semibold text-warning-fg')}>
                          {p.upcoming && <AlertTriangle className="size-3.5" aria-hidden />}
                          {f.arrivalShort(p.arrivalTime)}
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                      {p.flightNumber && <span className="block text-[11px] text-muted">{p.flightNumber}</span>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">{p.arrivalAirport ?? <span className="text-muted">—</span>}</td>
                    <td className="px-4 py-3">
                      {p.pickupRequested ? (
                        <span className={clsx('badge whitespace-nowrap', p.pickupConfirmed ? 'bg-success-bg text-success-fg' : 'bg-warning-bg text-warning-fg')}>{p.pickupConfirmed ? t('arrival.admin.pickupDone') : t('arrival.admin.pickupYes')}</span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <HousingPill status={p.housingStatus} />
                    </td>
                    <td className="px-4 py-3">
                      <ArrivalStatusPill status={p.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-2.5 text-xs text-muted">
            <span>{t('arrival.admin.total', { count: list.data.total })}</span>
            {pages > 1 && (
              <span className="flex items-center gap-1">
                <button type="button" className="grid size-8 place-items-center rounded-md hover:bg-sunken disabled:opacity-40" disabled={page <= 1} onClick={() => set('page', String(page - 1))} aria-label="‹">
                  <ChevronLeft className="size-4" />
                </button>
                <span className="tabular-nums">
                  {page} / {pages}
                </span>
                <button type="button" className="grid size-8 place-items-center rounded-md hover:bg-sunken disabled:opacity-40" disabled={page >= pages} onClick={() => set('page', String(page + 1))} aria-label="›">
                  <ChevronRight className="size-4" />
                </button>
              </span>
            )}
          </div>
        </div>
      )}

      {caseId && <Drawer key={caseId} caseId={caseId} onClose={close} />}
    </div>
  );
}
