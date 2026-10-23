import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import {
  ArrowLeft,
  ArrowRight,
  Ban,
  BedDouble,
  CalendarPlus,
  Car,
  CheckCircle2,
  ClipboardCheck,
  Compass,
  Home,
  Info,
  MapPin,
  Pencil,
  Plane,
  PlaneLanding,
  RotateCcw,
  Send,
  UserRound,
} from 'lucide-react';
import { api } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesArrival } from '@/i18n/pagesArrival';
import { usePageTitle } from '@/lib/usePageTitle';
import { useRealtime } from '@/lib/realtime';
import { PageLoader, Spinner } from '@/components/ui/Spinner';
import { Tabs } from '@/components/ui/Tabs';
import { ConfirmDialog } from '@/components/portal/ConfirmDialog';
import { CITIES } from '@/lib/cities/data';
import {
  ArrivalStatusPill,
  ArrivalTimeline,
  DEPARTURE_AIRPORTS,
  GERMAN_AIRPORTS,
  airportLabel,
  berlinInputToIso,
  isoToBerlinInput,
  isoToDateInput,
  personName,
  useArrivalError,
  useArrivalFormat,
  type ArrivalPlan,
} from '@/components/arrival/shared';

registerCopy(pagesArrival);

const LIST_KEY = ['arrival'] as const;

interface Form {
  flightDate: string;
  flightNumber: string;
  departureAirport: string;
  arrivalAirport: string;
  arrivalTime: string; // German local time, datetime-local format
  travellers: number;
  luggageNote: string;
  pickupRequested: boolean;
  housingRequested: boolean;
  housingCity: string;
  housingBudget: string;
  housingFrom: string;
  housingNote: string;
  clientNote: string;
}

const toForm = (p: ArrivalPlan): Form => ({
  flightDate: isoToDateInput(p.flightDate),
  flightNumber: p.flightNumber ?? '',
  departureAirport: p.departureAirport ?? '',
  arrivalAirport: p.arrivalAirport ?? '',
  arrivalTime: isoToBerlinInput(p.arrivalTime),
  travellers: p.travellers,
  luggageNote: p.luggageNote ?? '',
  pickupRequested: p.pickupRequested,
  housingRequested: p.housingStatus !== 'NONE',
  housingCity: p.housingCity ?? '',
  housingBudget: p.housingBudget != null ? String(p.housingBudget) : '',
  housingFrom: isoToDateInput(p.housingFrom),
  housingNote: p.housingNote ?? '',
  clientNote: p.clientNote ?? '',
});

/** Only the fields that differ from the stored plan (so untouched values are never re-validated). */
const diff = (p: ArrivalPlan, f: Form) => {
  const base = toForm(p);
  const out: Record<string, unknown> = {};
  const str = (k: keyof Form) => {
    if (f[k] !== base[k]) out[k] = (f[k] as string).trim() || null;
  };
  (['flightNumber', 'departureAirport', 'arrivalAirport', 'luggageNote', 'housingCity', 'housingNote', 'clientNote', 'flightDate', 'housingFrom'] as const).forEach(str);
  if (f.arrivalTime !== base.arrivalTime) out.arrivalTime = f.arrivalTime ? berlinInputToIso(f.arrivalTime) : null;
  if (f.travellers !== base.travellers) out.travellers = f.travellers;
  if (f.pickupRequested !== base.pickupRequested) out.pickupRequested = f.pickupRequested;
  if (f.housingRequested !== base.housingRequested) out.housingRequested = f.housingRequested;
  if (f.housingBudget !== base.housingBudget) out.housingBudget = f.housingBudget.trim() ? Number(f.housingBudget) : null;
  return out;
};

const STEPS = ['flight', 'pickup', 'housing', 'summary'] as const;
type Step = (typeof STEPS)[number];
const STEP_ICON: Record<Step, typeof Plane> = { flight: Plane, pickup: Car, housing: BedDouble, summary: ClipboardCheck };

// ─── Small building blocks ────────────────────────────────────────────────

const Field = ({ label, children, hint, className }: { label: string; children: ReactNode; hint?: string; className?: string }) => (
  <label className={clsx('block', className)}>
    <span className="label">{label}</span>
    {children}
    {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
  </label>
);

const Toggle = ({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string; disabled?: boolean }) => (
  <label className={clsx('flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors', checked ? 'border-brand-500 bg-brand-50' : 'border-line bg-surface hover:border-brand-400/60', disabled && 'cursor-not-allowed opacity-60')}>
    <input type="checkbox" className="mt-0.5 size-5 accent-brand-600" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
    <span>
      <span className="block font-semibold text-ink">{label}</span>
      {hint && <span className="mt-0.5 block text-sm text-muted">{hint}</span>}
    </span>
  </label>
);

const SummaryRow = ({ label, value }: { label: string; value: ReactNode }) => {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap justify-between gap-x-4 gap-y-0.5 py-2 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-medium text-ink">{value || <span className="font-normal text-muted italic">{t('arrival.summary.notSet')}</span>}</dd>
    </div>
  );
};

// ─── Staff answer ─────────────────────────────────────────────────────────

const StaffAnswer = ({ plan }: { plan: ArrivalPlan }) => {
  const { t } = useTranslation();
  const hasPickup = plan.pickupConfirmed && !!plan.pickupDetails;
  const hasHousing = !!plan.housingDetails;
  if (plan.status === 'DRAFT') return null;
  return (
    <section className="rounded-2xl border border-brand-500/40 bg-card p-5 shadow-sm">
      <h3 className="flex items-center gap-2 font-bold text-ink">
        <UserRound className="size-5 text-brand-600" aria-hidden /> {t('arrival.staff.title')}
      </h3>
      {!hasPickup && !hasHousing ? (
        <p className="mt-2 text-sm text-muted">{plan.pickupRequested || plan.housingStatus !== 'NONE' ? t('arrival.staff.waiting') : t('arrival.lockedHint')}</p>
      ) : (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {hasPickup && (
            <div className="rounded-xl bg-emerald-50 p-4 text-emerald-900">
              <p className="flex items-center gap-1.5 text-xs font-bold tracking-wide uppercase">
                <Car className="size-4" aria-hidden /> {t('arrival.staff.pickup')}
              </p>
              <p className="mt-1.5 text-sm whitespace-pre-line">{plan.pickupDetails}</p>
            </div>
          )}
          {hasHousing && (
            <div className="rounded-xl bg-sky-50 p-4 text-sky-900">
              <p className="flex items-center gap-1.5 text-xs font-bold tracking-wide uppercase">
                <Home className="size-4" aria-hidden /> {t('arrival.staff.housing')} · {t(`arrival.housing.${plan.housingStatus}`)}
              </p>
              <p className="mt-1.5 text-sm whitespace-pre-line">{plan.housingDetails}</p>
            </div>
          )}
        </div>
      )}
      {plan.handledBy && (
        <p className="mt-3 text-xs text-muted">
          {t('arrival.staff.handler')}: <span className="font-semibold text-ink">{personName(plan.handledBy)}</span>
        </p>
      )}
    </section>
  );
};

// ─── Summary (read-only and step 4) ───────────────────────────────────────

const PlanSummary = ({ form }: { form: Form }) => {
  const { t } = useTranslation();
  const f = useArrivalFormat();
  const arrivalIso = form.arrivalTime ? berlinInputToIso(form.arrivalTime) : null;
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <div className="rounded-xl border border-line bg-surface/60 p-4">
        <p className="flex items-center gap-1.5 text-xs font-bold tracking-wide text-muted uppercase">
          <Plane className="size-4" aria-hidden /> {t('arrival.steps.flight')}
        </p>
        <dl className="mt-1 divide-y divide-line">
          <SummaryRow label={t('arrival.flight.flightNumber')} value={form.flightNumber.toUpperCase()} />
          <SummaryRow label={t('arrival.flight.flightDate')} value={form.flightDate ? f.day(`${form.flightDate}T00:00:00Z`) : null} />
          <SummaryRow label={t('arrival.flight.departure')} value={airportLabel(form.departureAirport)} />
          <SummaryRow label={t('arrival.flight.arrival')} value={airportLabel(form.arrivalAirport)} />
          <SummaryRow label={t('arrival.flight.arrivalTime')} value={f.arrival(arrivalIso)} />
          <SummaryRow label={t('arrival.flight.travellers')} value={t('arrival.summary.travellers', { n: form.travellers })} />
          {form.luggageNote && <SummaryRow label={t('arrival.flight.luggage')} value={form.luggageNote} />}
        </dl>
      </div>
      <div className="rounded-xl border border-line bg-surface/60 p-4">
        <p className="flex items-center gap-1.5 text-xs font-bold tracking-wide text-muted uppercase">
          <Car className="size-4" aria-hidden /> {t('arrival.steps.pickup')}
        </p>
        <p className="mt-2 text-sm font-medium text-ink">{form.pickupRequested ? t('arrival.pickup.request') : t('arrival.pickup.none')}</p>
      </div>
      <div className="rounded-xl border border-line bg-surface/60 p-4">
        <p className="flex items-center gap-1.5 text-xs font-bold tracking-wide text-muted uppercase">
          <BedDouble className="size-4" aria-hidden /> {t('arrival.steps.housing')}
        </p>
        {form.housingRequested ? (
          <dl className="mt-1 divide-y divide-line">
            <SummaryRow label={t('arrival.housingStep.city')} value={form.housingCity} />
            <SummaryRow label={t('arrival.housingStep.budget')} value={form.housingBudget ? t('arrival.summary.budget', { amount: form.housingBudget }) : null} />
            <SummaryRow label={t('arrival.housingStep.from')} value={form.housingFrom ? f.day(`${form.housingFrom}T00:00:00Z`) : null} />
            {form.housingNote && <SummaryRow label={t('arrival.housingStep.note')} value={form.housingNote} />}
          </dl>
        ) : (
          <p className="mt-2 text-sm font-medium text-ink">{t('arrival.housing.NONE')}</p>
        )}
      </div>
    </div>
  );
};

// ─── One plan ─────────────────────────────────────────────────────────────

const PlanView = ({ plan }: { plan: ArrivalPlan }) => {
  const { t } = useTranslation();
  const f = useArrivalFormat();
  const qc = useQueryClient();
  const onError = useArrivalError();
  const [form, setForm] = useState<Form>(() => toForm(plan));
  const [step, setStep] = useState<Step>('flight');
  const [editing, setEditing] = useState(plan.status === 'DRAFT');
  const [confirmCancel, setConfirmCancel] = useState(false);

  // Server changes (staff answers, other tab) refresh the form unless the user is typing.
  const [syncedAt, setSyncedAt] = useState(plan.updatedAt);
  useEffect(() => {
    if (plan.updatedAt !== syncedAt) {
      setSyncedAt(plan.updatedAt);
      if (!editing || plan.status !== 'DRAFT') setForm(toForm(plan));
      if (!plan.editable) setEditing(false);
    }
  }, [plan, syncedAt, editing]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((s) => ({ ...s, [k]: v }));
  const changes = useMemo(() => diff(plan, form), [plan, form]);
  const dirty = Object.keys(changes).length > 0;

  const update = (p: ArrivalPlan) => {
    qc.setQueryData<ArrivalPlan[]>(LIST_KEY, (old) => old?.map((x) => (x.caseId === p.caseId ? p : x)));
    setSyncedAt(p.updatedAt);
  };

  const save = useMutation({
    mutationFn: async () => (await api.patch<{ plan: ArrivalPlan }>(`/arrival/${plan.caseId}`, changes)).data.plan,
    onSuccess: (p) => {
      update(p);
      setForm(toForm(p));
    },
    onError,
  });
  const submit = useMutation({
    mutationFn: async () => {
      if (dirty) await api.patch(`/arrival/${plan.caseId}`, changes);
      return (await api.post<{ plan: ArrivalPlan }>(`/arrival/${plan.caseId}/submit`)).data.plan;
    },
    onSuccess: (p) => {
      update(p);
      setForm(toForm(p));
      setEditing(false);
      toast.success(t('arrival.actions.submitted'));
    },
    onError: (e) => {
      void qc.invalidateQueries({ queryKey: LIST_KEY });
      onError(e);
    },
  });
  const action = useMutation({
    mutationFn: async (kind: 'cancel' | 'reopen') => (await api.post<{ plan: ArrivalPlan }>(`/arrival/${plan.caseId}/${kind}`)).data.plan,
    onSuccess: (p, kind) => {
      update(p);
      setForm(toForm(p));
      setConfirmCancel(false);
      if (kind === 'cancel') toast.success(t('arrival.actions.cancelled'));
      else {
        setEditing(true);
        setStep('flight');
      }
    },
    onError,
  });

  const go = async (next: Step) => {
    if (dirty) {
      try {
        await save.mutateAsync();
      } catch {
        return;
      }
    }
    setStep(next);
  };

  const idx = STEPS.indexOf(step);
  const busy = save.isPending || submit.isPending;
  const housingLocked = plan.housingStatus !== 'NONE' && plan.housingStatus !== 'REQUESTED';

  return (
    <div className="space-y-5">
      {/* Status */}
      <section className="rounded-2xl border border-line bg-card p-5">
        <div className="flex flex-wrap items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-brand-100 text-brand-600">
            <PlaneLanding className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-ink">{t('arrival.caseLabel', { number: plan.case.number })}</p>
            <p className="truncate text-sm text-muted">
              {plan.case.profession}
              {plan.arrivalTime && <> · {f.arrival(plan.arrivalTime)}</>}
            </p>
          </div>
          <ArrivalStatusPill status={plan.status} />
        </div>
        <div className="mt-4">
          <ArrivalTimeline status={plan.status} />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {plan.arrivalTime && plan.status !== 'CANCELLED' && (
            <a href={`/api/arrival/${plan.caseId}/ics`} className="btn-secondary btn-sm">
              <CalendarPlus className="size-4" aria-hidden /> {t('arrival.actions.calendar')}
            </a>
          )}
          {plan.editable && !editing && (
            <button type="button" className="btn-secondary btn-sm" onClick={() => setEditing(true)}>
              <Pencil className="size-4" aria-hidden /> {t('arrival.actions.edit')}
            </button>
          )}
          {plan.status !== 'CANCELLED' && plan.status !== 'COMPLETED' && (
            <button type="button" className="btn-sm inline-flex items-center gap-1.5 rounded-lg px-3 font-semibold text-danger hover:bg-red-50" onClick={() => setConfirmCancel(true)}>
              <Ban className="size-4" aria-hidden /> {t('arrival.actions.cancel')}
            </button>
          )}
          {plan.status === 'CANCELLED' && (
            <button type="button" className="btn-primary btn-sm" disabled={action.isPending} onClick={() => action.mutate('reopen')}>
              <RotateCcw className="size-4" aria-hidden /> {t('arrival.actions.reopen')}
            </button>
          )}
        </div>
      </section>

      {plan.status === 'COMPLETED' && (
        <section className="flex flex-wrap items-center gap-4 rounded-2xl bg-gradient-to-br from-brand-600 to-brand-800 p-5 text-white">
          <Compass className="size-8 shrink-0" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-lg font-extrabold">{t('arrival.completed.title')}</p>
            <p className="text-sm text-white/85">{t('arrival.completed.text')}</p>
          </div>
          <Link to="/account/onboarding" className="btn-white btn-sm">
            {t('arrival.completed.link')} <ArrowRight className="size-4" aria-hidden />
          </Link>
        </section>
      )}
      {plan.status === 'CANCELLED' && <p className="rounded-xl border border-line bg-surface p-4 text-sm text-muted">{t('arrival.cancelledBanner')}</p>}

      <StaffAnswer plan={plan} />

      {editing && plan.editable ? (
        <section className="rounded-2xl border border-line bg-card">
          {/* Stepper */}
          <ol className="grid grid-cols-4 border-b border-line">
            {STEPS.map((s, i) => {
              const Icon = STEP_ICON[s];
              return (
                <li key={s}>
                  <button
                    type="button"
                    onClick={() => void go(s)}
                    disabled={busy}
                    aria-current={s === step ? 'step' : undefined}
                    className={clsx('flex w-full flex-col items-center gap-1 px-1 py-3 text-xs font-semibold transition-colors sm:flex-row sm:justify-center sm:gap-2 sm:text-sm', s === step ? 'text-brand-700' : i < idx ? 'text-ink' : 'text-muted hover:text-ink')}
                  >
                    <span className={clsx('grid size-7 place-items-center rounded-full transition-colors duration-200', s === step ? 'bg-brand-600 text-white' : i < idx ? 'bg-brand-100 text-brand-700' : 'bg-surface')}>
                      <Icon className="size-4" aria-hidden />
                    </span>
                    {t(`arrival.steps.${s}`)}
                  </button>
                </li>
              );
            })}
          </ol>

          <div key={step} className="page-in p-5 sm:p-6">
            {step === 'flight' && (
              <div>
                <h3 className="text-lg font-bold text-ink">{t('arrival.flight.title')}</h3>
                <p className="mt-1 text-sm text-muted">{t('arrival.flight.hint')}</p>
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <Field label={t('arrival.flight.flightNumber')}>
                    <input className="input uppercase" maxLength={10} placeholder={t('arrival.flight.flightNumberPh')} value={form.flightNumber} onChange={(e) => set('flightNumber', e.target.value)} />
                  </Field>
                  <Field label={t('arrival.flight.flightDate')}>
                    <input type="date" className="input" value={form.flightDate} onChange={(e) => set('flightDate', e.target.value)} />
                  </Field>
                  <Field label={t('arrival.flight.departure')}>
                    <input className="input" list="arrival-dep-airports" maxLength={80} placeholder={t('arrival.flight.airportPh')} value={form.departureAirport} onChange={(e) => set('departureAirport', e.target.value)} />
                    <datalist id="arrival-dep-airports">
                      {DEPARTURE_AIRPORTS.map((a) => (
                        <option key={a.code} value={a.code}>
                          {a.city}
                        </option>
                      ))}
                    </datalist>
                  </Field>
                  <Field label={`${t('arrival.flight.arrival')} *`}>
                    <input className="input" list="arrival-de-airports" maxLength={80} placeholder={t('arrival.flight.airportPh')} value={form.arrivalAirport} onChange={(e) => set('arrivalAirport', e.target.value)} />
                    <datalist id="arrival-de-airports">
                      {GERMAN_AIRPORTS.map((a) => (
                        <option key={a.code} value={a.code}>
                          {a.city}
                        </option>
                      ))}
                    </datalist>
                  </Field>
                  <Field label={`${t('arrival.flight.arrivalTime')} *`}>
                    <input type="datetime-local" className="input" value={form.arrivalTime} onChange={(e) => set('arrivalTime', e.target.value)} />
                  </Field>
                  <Field label={t('arrival.flight.travellers')}>
                    <input type="number" min={1} max={10} className="input" value={form.travellers} onChange={(e) => set('travellers', Math.max(1, Math.min(10, Number(e.target.value) || 1)))} />
                  </Field>
                  <Field label={t('arrival.flight.luggage')} className="sm:col-span-2">
                    <input className="input" maxLength={300} placeholder={t('arrival.flight.luggagePh')} value={form.luggageNote} onChange={(e) => set('luggageNote', e.target.value)} />
                  </Field>
                </div>
              </div>
            )}

            {step === 'pickup' && (
              <div>
                <h3 className="text-lg font-bold text-ink">{t('arrival.pickup.title')}</h3>
                <p className="mt-1 text-sm text-muted">{t('arrival.pickup.hint')}</p>
                <div className="mt-5">
                  <Toggle checked={form.pickupRequested} onChange={(v) => set('pickupRequested', v)} label={t('arrival.pickup.request')} hint={t('arrival.pickup.requestHint')} />
                </div>
                {form.arrivalAirport && (
                  <p className="mt-3 flex items-center gap-1.5 text-sm text-muted">
                    <MapPin className="size-4" aria-hidden /> {airportLabel(form.arrivalAirport)}
                    {form.arrivalTime && <> · {f.arrival(berlinInputToIso(form.arrivalTime))}</>}
                  </p>
                )}
              </div>
            )}

            {step === 'housing' && (
              <div>
                <h3 className="text-lg font-bold text-ink">{t('arrival.housingStep.title')}</h3>
                <p className="mt-1 text-sm text-muted">{t('arrival.housingStep.hint')}</p>
                <div className="mt-5">
                  <Toggle checked={form.housingRequested} disabled={housingLocked} onChange={(v) => set('housingRequested', v)} label={t('arrival.housingStep.request')} />
                  {housingLocked && <p className="mt-2 text-xs text-muted">{t('arrival.housingStep.inProgress')}</p>}
                </div>
                <div className={clsx('grid transition-[grid-template-rows,opacity] duration-300', form.housingRequested ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0')}>
                  <div className="overflow-hidden">
                    <div className="mt-4 grid gap-4 sm:grid-cols-3">
                      <Field label={`${t('arrival.housingStep.city')} *`}>
                        <input className="input" list="arrival-cities" maxLength={80} value={form.housingCity} onChange={(e) => set('housingCity', e.target.value)} />
                        <datalist id="arrival-cities">
                          {CITIES.filter((c) => c.slug !== 'small-town').map((c) => (
                            <option key={c.slug} value={c.name.de} />
                          ))}
                        </datalist>
                      </Field>
                      <Field label={t('arrival.housingStep.budget')}>
                        <input type="number" min={100} max={10000} step={50} className="input" value={form.housingBudget} onChange={(e) => set('housingBudget', e.target.value)} />
                      </Field>
                      <Field label={`${t('arrival.housingStep.from')} *`}>
                        <input type="date" className="input" value={form.housingFrom} onChange={(e) => set('housingFrom', e.target.value)} />
                      </Field>
                      <Field label={t('arrival.housingStep.note')} className="sm:col-span-3">
                        <textarea className="input min-h-20" maxLength={2000} placeholder={t('arrival.housingStep.notePh')} value={form.housingNote} onChange={(e) => set('housingNote', e.target.value)} />
                      </Field>
                    </div>
                    <Link to="/cities" target="_blank" className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:underline">
                      <Info className="size-4" aria-hidden /> {t('arrival.housingStep.costs')}
                    </Link>
                  </div>
                </div>
              </div>
            )}

            {step === 'summary' && (
              <div>
                <h3 className="text-lg font-bold text-ink">{t('arrival.summary.title')}</h3>
                <p className="mt-1 text-sm text-muted">{t('arrival.summary.hint')}</p>
                <div className="mt-5">
                  <PlanSummary form={form} />
                </div>
                <Field label={t('arrival.summary.clientNote')} className="mt-5">
                  <textarea className="input min-h-20" maxLength={2000} value={form.clientNote} onChange={(e) => set('clientNote', e.target.value)} />
                </Field>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-5 py-4 sm:px-6">
            {idx > 0 ? (
              <button type="button" className="btn-secondary btn-sm" disabled={busy} onClick={() => void go(STEPS[idx - 1])}>
                <ArrowLeft className="size-4" aria-hidden /> {t('arrival.actions.back')}
              </button>
            ) : (
              <span />
            )}
            <div className="flex flex-wrap gap-2">
              {dirty && step !== 'summary' && (
                <button type="button" className="btn-secondary btn-sm" disabled={busy} onClick={() => save.mutate(undefined, { onSuccess: () => toast.success(t('arrival.actions.saved')) })}>
                  {save.isPending && <Spinner className="size-4" />} {t('arrival.actions.save')}
                </button>
              )}
              {step !== 'summary' ? (
                <button type="button" className="btn-primary btn-sm" disabled={busy} onClick={() => void go(STEPS[idx + 1])}>
                  {t('arrival.actions.next')} <ArrowRight className="size-4" aria-hidden />
                </button>
              ) : plan.status === 'DRAFT' ? (
                <button type="button" className="btn-primary btn-sm" disabled={busy} onClick={() => submit.mutate()}>
                  {submit.isPending ? <Spinner className="size-4" /> : <Send className="size-4" aria-hidden />} {t('arrival.actions.submit')}
                </button>
              ) : (
                <button
                  type="button"
                  className="btn-primary btn-sm"
                  disabled={busy}
                  onClick={() =>
                    save.mutate(undefined, {
                      onSuccess: () => {
                        toast.success(t('arrival.actions.saved'));
                        setEditing(false);
                      },
                    })
                  }
                >
                  {save.isPending ? <Spinner className="size-4" /> : <CheckCircle2 className="size-4" aria-hidden />} {t('arrival.actions.save')}
                </button>
              )}
            </div>
          </div>
        </section>
      ) : (
        plan.status !== 'CANCELLED' && (
          <section className="rounded-2xl border border-line bg-card p-5">
            <PlanSummary form={form} />
            {form.clientNote && (
              <p className="mt-4 rounded-xl bg-surface p-3 text-sm text-ink/85">
                <span className="font-semibold">{t('arrival.summary.clientNote')}:</span> {form.clientNote}
              </p>
            )}
            {!plan.editable && plan.status === 'CONFIRMED' && <p className="mt-4 text-xs text-muted">{t('arrival.lockedHint')}</p>}
          </section>
        )
      )}

      <ConfirmDialog
        open={confirmCancel}
        title={t('arrival.actions.cancelTitle')}
        confirmLabel={t('arrival.actions.cancel')}
        danger
        busy={action.isPending}
        onConfirm={() => action.mutate('cancel')}
        onClose={() => setConfirmCancel(false)}
      >
        {t('arrival.actions.cancelText')}
      </ConfirmDialog>
    </div>
  );
};

// ─── Page ─────────────────────────────────────────────────────────────────

export default function AccountArrival() {
  const { t } = useTranslation();
  usePageTitle(t('arrival.title'));
  const qc = useQueryClient();
  const [active, setActive] = useState<string | null>(null);
  const list = useQuery({ queryKey: LIST_KEY, queryFn: async () => (await api.get<{ items: ArrivalPlan[] }>('/arrival')).data.items });

  useRealtime('notification', (p) => {
    if (typeof p.type === 'string' && p.type.startsWith('ARRIVAL_')) void qc.invalidateQueries({ queryKey: LIST_KEY });
  });

  if (list.isLoading) return <PageLoader />;
  const items = list.data ?? [];
  const plan = items.find((p) => p.caseId === active) ?? items[0];

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-extrabold text-ink sm:text-2xl">{t('arrival.title')}</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted">{t('arrival.subtitle')}</p>
      </div>

      {list.isError ? (
        <div className="card p-6 text-center text-sm text-muted">
          {t('common.error')}{' '}
          <button type="button" className="font-semibold text-brand-700 hover:underline" onClick={() => void list.refetch()}>
            ↻
          </button>
        </div>
      ) : !plan ? (
        <div className="card flex flex-col items-center px-6 py-12 text-center">
          {/* TODO(ui): large portal empty state (size-14 icon, display title) -> <EmptyState size="lg" tone="brand"> (portal rework) */}
          <span className="grid size-14 place-items-center rounded-2xl bg-brand-100 text-brand-600">
            <PlaneLanding className="size-7" aria-hidden />
          </span>
          <p className="mt-4 text-lg font-bold text-ink">{t('arrival.emptyTitle')}</p>
          <p className="mt-1 max-w-md text-sm text-muted">{t('arrival.emptyText')}</p>
        </div>
      ) : (
        <>
          {items.length > 1 && (
            <Tabs variant="pills" label={t('arrival.title')} items={items.map((p) => ({ key: p.caseId, label: p.case.number }))} value={plan.caseId} onChange={setActive} />
          )}
          <PlanView key={plan.caseId} plan={plan} />
        </>
      )}
    </div>
  );
}
