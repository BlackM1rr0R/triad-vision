import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { toast } from 'sonner';
import {
  AlertTriangle,
  ArrowRight,
  BellRing,
  Building2,
  CalendarPlus,
  Check,
  ChevronDown,
  ClipboardCheck,
  ExternalLink,
  FileText,
  Home,
  Info,
  KeyRound,
  ListChecks,
  MapPin,
  Phone,
  ShieldAlert,
  Upload,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { usePageTitle } from '@/lib/usePageTitle';
import { registerCopy } from '@/i18n';
import { pagesHousing } from '@/i18n/pagesHousing';
import { Badge, Button, Card, Field, Input, PageLoader, Tabs, TabPanel, Textarea, useTabParam } from '@/components/ui';
import {
  BRING_ITEMS,
  HOUSING_KEY,
  OPTIONAL_BRING,
  deadlineTone,
  fmtBerlin,
  fmtDay,
  priceLabel,
  useHousing,
  useHousingError,
  type ClientListing,
  type HousingResponse,
  type HousingView,
} from '@/components/housing/api';
import { LandlordLetter } from '@/components/housing/LandlordLetter';

registerCopy(pagesHousing);

const TABS = ['housing', 'anmeldung', 'offers'] as const;
type Tab = (typeof TABS)[number];

const DATE_LOCALE: Record<string, string> = { az: 'az-Latn-AZ', de: 'de-DE', en: 'en-GB', ru: 'ru-RU' };

const useLocaleTag = () => {
  const { i18n } = useTranslation();
  return DATE_LOCALE[(i18n.resolvedLanguage ?? 'az').slice(0, 2)] ?? 'en-GB';
};

type Patch = Partial<{
  city: string | null;
  budgetMax: number | null;
  moveInDate: string | null;
  steps: Record<string, boolean>;
  bring: Record<string, boolean>;
  appointment: { date: string; time: string; address: string; note?: string | null } | null;
}>;

/** PATCH /housing → the full response replaces the cache. */
const usePatch = () => {
  const qc = useQueryClient();
  const onError = useHousingError();
  return useMutation({
    mutationFn: async (body: Patch) => (await api.patch<HousingResponse>('/housing', body)).data,
    onSuccess: (data) => qc.setQueryData(HOUSING_KEY, data),
    onError,
  });
};

const useUpload = (path: string) => {
  const qc = useQueryClient();
  const onError = useHousingError();
  return useMutation({
    mutationFn: async (fd: FormData) => (await api.post<HousingResponse>(path, fd)).data,
    onSuccess: (data) => qc.setQueryData(HOUSING_KEY, data),
    onError,
  });
};

const CheckButton = ({ done, label, disabled, onClick }: { done: boolean; label: string; disabled?: boolean; onClick: () => void }) => (
  <button
    type="button"
    role="checkbox"
    aria-checked={done}
    aria-label={label}
    disabled={disabled}
    onClick={onClick}
    className={clsx('grid size-11 shrink-0 place-items-center rounded-full transition', disabled && 'opacity-60')}
  >
    <span className={clsx('grid size-7 place-items-center rounded-full border-2', done ? 'border-success bg-success text-white' : 'border-line bg-card text-transparent hover:border-primary')}>
      <Check className="size-4" strokeWidth={3} aria-hidden />
    </span>
  </button>
);

const DeadlineLine = ({ a }: { a: HousingView['anmeldung'] }) => {
  const { t } = useTranslation();
  const locale = useLocaleTag();
  if (a.state === 'done') return <span>{t('housing.status.DONE')}</span>;
  if (!a.deadline || a.daysLeft === null) return <span>{t('housing.summary.noMoveIn')}</span>;
  const rel = a.daysLeft < 0 ? t('housing.summary.overdue', { count: -a.daysLeft }) : a.daysLeft === 0 ? t('housing.summary.today') : t('housing.summary.daysLeft', { count: a.daysLeft });
  return (
    <span>
      {t('housing.summary.deadline', { date: fmtDay(a.deadline, locale) })} · <span className={clsx(a.state === 'overdue' ? 'font-semibold text-danger' : a.state === 'soon' && 'font-semibold text-warning-fg')}>{rel}</span>
    </span>
  );
};

// ─── Housing tab ─────────────────────────────────────────────────────

const StepCard = ({ stepKey, doneAt, index, onToggle, busy, children }: { stepKey: string; doneAt: string | null; index: number; onToggle: () => void; busy: boolean; children?: ReactNode }) => {
  const { t } = useTranslation();
  const locale = useLocaleTag();
  const [open, setOpen] = useState(false);
  const points = t(`housing.steps.${stepKey}.points`, { returnObjects: true }) as string[];
  const id = `hstep-${stepKey}`;
  const warn = stepKey === 'scams';
  return (
    <li className={clsx('card overflow-hidden', doneAt && 'border-success/30 bg-success-bg', warn && !doneAt && 'border-warning-border')}>
      <div className="flex items-start gap-2 p-3 sm:gap-3 sm:p-4">
        <CheckButton done={!!doneAt} disabled={busy} label={`${t(`housing.steps.${stepKey}.title`)}: ${doneAt ? t('housing.check.undo') : t('housing.check.mark')}`} onClick={onToggle} />
        <div className="min-w-0 flex-1 pt-2">
          <button type="button" className="flex w-full items-start justify-between gap-3 text-left" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
            <span className="min-w-0">
              <span className="type-caption block">{index + 1} / 8</span>
              <span className={clsx('flex items-center gap-2 font-semibold text-ink', doneAt && 'line-through decoration-success/60')}>
                {warn && <ShieldAlert className="size-4 shrink-0 text-warning-fg" aria-hidden />}
                {t(`housing.steps.${stepKey}.title`)}
              </span>
              {doneAt && <span className="type-caption mt-0.5 block text-success-fg">{t('housing.check.doneAt', { date: new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(doneAt)) })}</span>}
            </span>
            <ChevronDown className={clsx('mt-1 size-4 shrink-0 text-muted transition-transform', open && 'rotate-180')} aria-hidden />
          </button>
          {open && (
            <div id={id} className="space-y-3 pt-3 text-sm leading-relaxed text-ink/90">
              <p>{t(`housing.steps.${stepKey}.body`)}</p>
              {Array.isArray(points) && (
                <ul className="list-disc space-y-1.5 pl-5">
                  {points.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              )}
              {children}
            </div>
          )}
        </div>
      </div>
    </li>
  );
};

const BudgetCityForm = ({ h }: { h: HousingView }) => {
  const { t } = useTranslation();
  const patch = usePatch();
  const [budget, setBudget] = useState(h.budgetMax ? String(h.budgetMax) : '');
  const [city, setCity] = useState(h.city ?? '');
  useEffect(() => {
    setBudget(h.budgetMax ? String(h.budgetMax) : '');
    setCity(h.city ?? '');
  }, [h.budgetMax, h.city]);
  const dirty = budget !== (h.budgetMax ? String(h.budgetMax) : '') || city !== (h.city ?? '');
  return (
    <form
      className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        patch.mutate({ budgetMax: budget ? Number(budget) : null, city: city.trim() || null }, { onSuccess: () => toast.success(t('housing.budget.saved')) });
      }}
    >
      <Field label={t('housing.city.label')} hint={h.effectiveCity && !h.city ? t('housing.city.current', { city: h.effectiveCity }) : t('housing.city.hint')}>
        <Input value={city} maxLength={80} onChange={(e) => setCity(e.target.value)} placeholder={h.effectiveCity ?? ''} />
      </Field>
      <Field label={t('housing.budget.label')} hint={t('housing.budget.hint')}>
        <Input type="number" inputMode="numeric" min={100} max={10000} value={budget} onChange={(e) => setBudget(e.target.value)} />
      </Field>
      <Button type="submit" variant="secondary" loading={patch.isPending} disabled={!dirty}>
        {t('housing.budget.save')}
      </Button>
    </form>
  );
};

const ContractPanel = ({ h }: { h: HousingView }) => {
  const { t } = useTranslation();
  const locale = useLocaleTag();
  const qc = useQueryClient();
  const onError = useHousingError();
  const upload = useUpload('/housing/contract');
  const fileRef = useRef<HTMLInputElement>(null);
  const [review, setReview] = useState(true);
  const [question, setQuestion] = useState('');
  const ask = useMutation({
    mutationFn: async () => (await api.post<HousingResponse>('/housing/contract/review', { question: question.trim() || undefined })).data,
    onSuccess: (data) => {
      qc.setQueryData(HOUSING_KEY, data);
      setQuestion('');
      toast.success(t('housing.contract.reviewSent'));
    },
    onError,
  });
  const c = h.contract;
  const send = (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    if (review) fd.append('requestReview', 'true');
    if (question.trim()) fd.append('question', question.trim());
    upload.mutate(fd, {
      onSuccess: () => {
        setQuestion('');
        toast.success(review ? t('housing.contract.reviewSent') : t('housing.contract.done'));
      },
      onSettled: () => {
        if (fileRef.current) fileRef.current.value = '';
      },
    });
  };
  const tone = c.review === 'REVIEWED' ? 'success' : c.review === 'REQUESTED' ? 'warning' : 'neutral';
  return (
    <Card id="housing-contract" title={t('housing.contract.title')} icon={FileText} actions={c.file ? <Badge tone={tone}>{t(`housing.contract.review.${c.review}`)}</Badge> : undefined}>
      <div className="space-y-4">
        <p className="type-body text-muted">{t('housing.contract.body')}</p>
        {c.file && (
          <p className="flex flex-wrap items-center gap-2 text-sm text-ink">
            <FileText className="size-4 text-link" aria-hidden />
            {t('housing.contract.uploaded', { name: c.file.filename, date: new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(c.file.createdAt)) })}
            <a href={`/api/vault/${c.file.id}/file`} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1 font-semibold text-link">
              <ExternalLink className="size-3.5" aria-hidden /> {t('housing.contract.open')}
            </a>
          </p>
        )}
        {c.review === 'REVIEWED' && c.reply && (
          <div className="rounded-xl border border-success-border bg-success-bg p-3 text-sm">
            <p className="font-semibold text-success-fg">{t('housing.contract.reply')}</p>
            <p className="mt-1 whitespace-pre-line text-ink">{c.reply}</p>
            <p className="type-caption mt-2">{t('housing.contract.note')}</p>
          </div>
        )}
        {c.review !== 'REQUESTED' && (
          <div className="space-y-3">
            <Field label={t('housing.contract.question')}>
              <Textarea rows={2} maxLength={2000} value={question} placeholder={t('housing.contract.questionPlaceholder')} onChange={(e) => setQuestion(e.target.value)} />
            </Field>
            <label className="flex min-h-11 items-center gap-2 text-sm text-ink">
              <input type="checkbox" className="size-5" checked={review} onChange={(e) => setReview(e.target.checked)} />
              {t('housing.contract.requestReview')}
            </label>
            <div className="flex flex-wrap gap-2">
              <input ref={fileRef} type="file" className="sr-only" accept="application/pdf,image/jpeg,image/png,image/webp,image/heic" onChange={(e) => e.target.files?.[0] && send(e.target.files[0])} />
              <Button icon={Upload} loading={upload.isPending} onClick={() => fileRef.current?.click()}>
                {c.file ? t('housing.contract.replace') : t('housing.contract.upload')}
              </Button>
              {c.file && c.review === 'NONE' && (
                <Button variant="secondary" loading={ask.isPending} onClick={() => ask.mutate()}>
                  {t('housing.contract.askReview')}
                </Button>
              )}
            </div>
          </div>
        )}
        {c.review === 'REQUESTED' && c.question && <p className="rounded-xl bg-sunken p-3 text-sm whitespace-pre-line text-ink">{c.question}</p>}
      </div>
    </Card>
  );
};

const HousingTab = ({ h }: { h: HousingView }) => {
  const { t } = useTranslation();
  const patch = usePatch();
  return (
    <div className="stack-page">
      <Card title={t('housing.summary.housing')} icon={Home}>
        <BudgetCityForm h={h} />
      </Card>
      <ol className="space-y-3" aria-label={t('housing.tabs.housing')}>
        {h.steps.map((s, i) => (
          <StepCard key={s.key} stepKey={s.key} doneAt={s.doneAt} index={i} busy={patch.isPending} onToggle={() => patch.mutate({ steps: { [s.key]: !s.doneAt } })}>
            {s.key === 'contract' && (
              <a href="#housing-contract" className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-link">
                <Upload className="size-4" aria-hidden /> {t('housing.contract.upload')}
              </a>
            )}
          </StepCard>
        ))}
      </ol>
      <ContractPanel h={h} />
    </div>
  );
};

// ─── Anmeldung tab ───────────────────────────────────────────────────

const AppointmentPanel = ({ h, caseId }: { h: HousingView; caseId: string }) => {
  const { t } = useTranslation();
  const locale = useLocaleTag();
  const patch = usePatch();
  const appt = h.anmeldung.appointment;
  const [editing, setEditing] = useState(!appt);
  const [form, setForm] = useState({ date: appt?.day ?? '', time: appt?.time ?? '', address: appt?.address ?? '', note: appt?.note ?? '' });
  useEffect(() => {
    setEditing(!appt);
    setForm({ date: appt?.day ?? '', time: appt?.time ?? '', address: appt?.address ?? '', note: appt?.note ?? '' });
  }, [appt]);
  const save = () =>
    patch.mutate(
      { appointment: { date: form.date, time: form.time, address: form.address.trim(), note: form.note.trim() || null } },
      { onSuccess: () => toast.success(t('housing.anmeldung.appointmentSaved')) },
    );
  return (
    <Card title={t('housing.anmeldung.appointmentTitle')} icon={CalendarPlus}>
      <div className="space-y-4">
        <p className="type-body text-muted">{t('housing.anmeldung.appointmentBody')}</p>
        {appt && !editing ? (
          <div className="space-y-3">
            <div className="rounded-xl border border-line bg-sunken p-4">
              <p className="font-semibold text-ink">{fmtBerlin(appt.at, locale)}</p>
              {appt.address && (
                <p className="mt-1 flex items-start gap-1.5 text-sm text-ink">
                  <MapPin className="mt-0.5 size-4 shrink-0 text-link" aria-hidden /> {appt.address}
                </p>
              )}
              {appt.note && <p className="mt-1 text-sm text-muted">{appt.note}</p>}
            </div>
            <div>
              <p className="type-overline flex items-center gap-1.5 text-muted">
                <BellRing className="size-3.5" aria-hidden /> {t('housing.anmeldung.remindersTitle')}
              </p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {appt.reminders.map((r) => (
                  <li key={r.kind}>
                    <Badge tone={r.skipped ? 'neutral' : r.sent ? 'success' : 'info'}>
                      {t(`housing.anmeldung.reminder.${r.kind}`)}
                      {r.skipped ? ` · ${t('housing.anmeldung.reminderSkipped')}` : r.sent ? ` · ${t('housing.anmeldung.reminderSent')}` : ''}
                    </Badge>
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex flex-wrap gap-2">
              <a href={`/api/housing/appointment.ics?caseId=${encodeURIComponent(caseId)}`} className="btn-secondary btn-sm">
                <CalendarPlus className="size-4" aria-hidden /> {t('housing.anmeldung.calendar')}
              </a>
              <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
                {t('housing.anmeldung.changeAppointment')}
              </Button>
              <Button size="sm" variant="ghost" loading={patch.isPending} onClick={() => patch.mutate({ appointment: null })}>
                {t('housing.anmeldung.removeAppointment')}
              </Button>
            </div>
          </div>
        ) : (
          <form
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <Field label={t('housing.anmeldung.date')} required>
              <Input type="date" required value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
            </Field>
            <Field label={t('housing.anmeldung.time')} required>
              <Input type="time" required value={form.time} onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))} />
            </Field>
            <div className="sm:col-span-2">
              <Field label={t('housing.anmeldung.address')} required>
                <Input required minLength={3} maxLength={300} value={form.address} placeholder={t('housing.anmeldung.addressPlaceholder')} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label={t('housing.anmeldung.appointmentNote')}>
                <Input maxLength={500} value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
              </Field>
            </div>
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <Button type="submit" loading={patch.isPending}>
                {t('housing.anmeldung.saveAppointment')}
              </Button>
              {appt && (
                <Button variant="ghost" onClick={() => setEditing(false)}>
                  {t('housing.page.cancel')}
                </Button>
              )}
            </div>
          </form>
        )}
      </div>
    </Card>
  );
};

const AnmeldungTab = ({ data, h }: { data: HousingResponse; h: HousingView }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const locale = useLocaleTag();
  const patch = usePatch();
  const upload = useUpload('/housing/meldebescheinigung');
  const fileRef = useRef<HTMLInputElement>(null);
  const a = h.anmeldung;
  const [moveIn, setMoveIn] = useState(a.moveInDate ?? '');
  useEffect(() => setMoveIn(a.moveInDate ?? ''), [a.moveInDate]);
  const tenant = `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim();

  return (
    <div className="stack-page">
      <Card title={t('housing.anmeldung.introTitle')} icon={Info}>
        <p className="type-body text-ink/90">{t('housing.anmeldung.intro')}</p>
        <form
          className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            patch.mutate({ moveInDate: moveIn || null });
          }}
        >
          <Field label={t('housing.anmeldung.moveIn')} hint={t('housing.anmeldung.moveInHint')}>
            <Input type="date" value={moveIn} onChange={(e) => setMoveIn(e.target.value)} />
          </Field>
          <Button type="submit" variant="secondary" loading={patch.isPending} disabled={moveIn === (a.moveInDate ?? '')}>
            {t('housing.anmeldung.save')}
          </Button>
        </form>
        <p className="mt-3 flex flex-wrap items-center gap-2 text-sm text-ink">
          <Badge tone={deadlineTone(a.state)}>{t(`housing.state.${a.state}`)}</Badge>
          <DeadlineLine a={a} />
        </p>
      </Card>

      {a.status === 'DONE' ? (
        <Card title={t('housing.anmeldung.doneTitle')} icon={ClipboardCheck} className="border-success/30 bg-success-bg">
          <p className="text-sm text-success-fg">{t('housing.anmeldung.doneBody', { date: a.doneAt ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(a.doneAt)) : '' })}</p>
          {a.certificate && (
            <a href={`/api/vault/${a.certificate.id}/file`} target="_blank" rel="noreferrer" className="mt-2 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-link">
              <FileText className="size-4" aria-hidden /> {a.certificate.filename}
            </a>
          )}
          <div className="mt-4">
            <p className="type-overline text-muted">{t('housing.anmeldung.nextTitle')}</p>
            <ul className="mt-2 space-y-2">
              {data.followUps.map((f) => (
                <li key={f.id} className="flex items-start gap-2 text-sm text-ink">
                  <span className={clsx('mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-2', f.status === 'DONE' ? 'border-success bg-success text-white' : 'border-line')}>
                    {f.status === 'DONE' && <Check className="size-3" strokeWidth={3} aria-hidden />}
                  </span>
                  {t(`housing.anmeldung.next.${f.template}`)}
                </li>
              ))}
            </ul>
            <Link to={`/account/cases/${h.caseId}#client-tasks`} className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-link">
              {t('housing.anmeldung.tasksLink')} <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
        </Card>
      ) : (
        <AppointmentPanel h={h} caseId={h.caseId} />
      )}

      <Card title={t('housing.anmeldung.bringTitle')} icon={ListChecks}>
        <ul className="space-y-1">
          {BRING_ITEMS.map((key) => {
            const done = !!a.bring.find((b) => b.key === key)?.doneAt;
            const hint = t(`housing.anmeldung.bring.${key}.hint`);
            return (
              <li key={key} className="flex items-start gap-2">
                <CheckButton done={done} disabled={patch.isPending} label={t(`housing.anmeldung.bring.${key}.title`)} onClick={() => patch.mutate({ bring: { [key]: !done } })} />
                <div className="min-w-0 pt-2.5">
                  <p className={clsx('text-sm font-semibold text-ink', done && 'line-through decoration-success/60')}>
                    {t(`housing.anmeldung.bring.${key}.title`)}
                    {OPTIONAL_BRING.includes(key) && <span className="ml-2 text-xs font-normal text-muted">({t('housing.anmeldung.optional')})</span>}
                  </p>
                  {hint && <p className="type-small">{hint}</p>}
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card title={t('housing.anmeldung.landlordTitle')} icon={KeyRound}>
        <p className="type-body mb-3 text-muted">{t('housing.anmeldung.landlordBody')}</p>
        <LandlordLetter tenant={tenant} moveInDate={a.moveInDate} />
      </Card>

      {a.status !== 'DONE' && (
        <Card title={t('housing.anmeldung.certificateTitle')} icon={ClipboardCheck}>
          <p className="type-body mb-3 text-muted">{t('housing.anmeldung.certificateBody')}</p>
          <input
            ref={fileRef}
            type="file"
            className="sr-only"
            accept="application/pdf,image/jpeg,image/png,image/webp,image/heic"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const fd = new FormData();
              fd.append('file', file);
              upload.mutate(fd, { onSettled: () => fileRef.current && (fileRef.current.value = '') });
            }}
          />
          <Button icon={Upload} loading={upload.isPending} onClick={() => fileRef.current?.click()}>
            {t('housing.anmeldung.uploadCertificate')}
          </Button>
        </Card>
      )}
    </div>
  );
};

// ─── Offers tab ──────────────────────────────────────────────────────

const ListingCard = ({ l }: { l: ClientListing }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const onError = useHousingError();
  const [note, setNote] = useState('');
  const done = () => {
    void qc.invalidateQueries({ queryKey: HOUSING_KEY });
    setNote('');
    toast.success(t('housing.offers.sent'));
  };
  const respond = useMutation({
    mutationFn: async (interested: boolean) => (await api.post(`/housing/proposals/${l.proposal!.id}/respond`, { interested, note: note.trim() || undefined })).data,
    onSuccess: done,
    onError,
  });
  const interest = useMutation({
    mutationFn: async () => (await api.post(`/housing/listings/${l.id}/interest`, { note: note.trim() || undefined })).data,
    onSuccess: done,
    onError,
  });
  const price = priceLabel(t, l.priceMin, l.priceMax);
  const p = l.proposal;
  return (
    <li className="card overflow-hidden">
      {l.photos[0] && <img src={l.photos[0]} alt="" loading="lazy" className="aspect-[16/9] w-full object-cover" />}
      <div className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold text-ink">{l.name}</p>
            <p className="type-small flex items-center gap-1">
              <MapPin className="size-3.5" aria-hidden /> {l.city} · {t(`housing.offers.types.${l.type}`)}
            </p>
          </div>
          {price && <Badge tone="brand">{price}</Badge>}
        </div>
        {l.employer && (
          <p className="flex items-center gap-1.5 text-sm text-ink">
            <Building2 className="size-4 text-link" aria-hidden /> {t('housing.offers.employer', { name: l.employer })}
          </p>
        )}
        {l.description && <p className="text-sm whitespace-pre-line text-ink/90">{l.description}</p>}
        {l.photos.length > 1 && (
          <div className="flex gap-2 overflow-x-auto">
            {l.photos.slice(1).map((src) => (
              <img key={src} src={src} alt="" loading="lazy" className="h-16 w-24 shrink-0 rounded-lg object-cover" />
            ))}
          </div>
        )}
        {p?.staffNote && (
          <p className="rounded-xl bg-sunken p-3 text-sm text-ink">
            <span className="font-semibold">{t('housing.offers.fromTeam')}:</span> {p.staffNote}
          </p>
        )}
        {l.contact ? (
          <div className="rounded-xl border border-success-border bg-success-bg p-3 text-sm text-ink">
            <p className="font-semibold text-success-fg">{t('housing.offers.introduced')}</p>
            {l.contact.name && <p className="mt-1">{l.contact.name}</p>}
            {l.contact.phone && (
              <a href={`tel:${l.contact.phone.replace(/\s+/g, '')}`} className="flex min-h-11 items-center gap-1.5 font-semibold text-link">
                <Phone className="size-4" aria-hidden /> {l.contact.phone}
              </a>
            )}
            {l.contact.email && (
              <a href={`mailto:${l.contact.email}`} className="block font-semibold break-all text-link">
                {l.contact.email}
              </a>
            )}
            {l.contact.address && <p className="mt-1">{l.contact.address}</p>}
            <p className="type-caption mt-2">{t('housing.offers.scamReminder')}</p>
          </div>
        ) : (
          <p className="type-caption">{t('housing.offers.contactHidden')}</p>
        )}
        {p && <Badge tone={p.response === 'INTERESTED' ? 'success' : p.response === 'NOT_INTERESTED' ? 'neutral' : 'warning'}>{t(`housing.offers.response.${p.response}`)}</Badge>}
        {!l.contact && (
          <div className="space-y-2">
            <Input value={note} maxLength={1000} placeholder={t('housing.offers.notePlaceholder')} aria-label={t('housing.offers.notePlaceholder')} onChange={(e) => setNote(e.target.value)} />
            <div className="flex flex-wrap gap-2">
              {p ? (
                <>
                  <Button size="sm" loading={respond.isPending && respond.variables === true} disabled={respond.isPending} onClick={() => respond.mutate(true)}>
                    {t('housing.offers.interested')}
                  </Button>
                  <Button size="sm" variant="secondary" loading={respond.isPending && respond.variables === false} disabled={respond.isPending} onClick={() => respond.mutate(false)}>
                    {t('housing.offers.notInterested')}
                  </Button>
                </>
              ) : (
                <Button size="sm" variant="secondary" loading={interest.isPending} onClick={() => interest.mutate()}>
                  {t('housing.offers.askAbout')}
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </li>
  );
};

const OffersTab = ({ data, h }: { data: HousingResponse; h: HousingView }) => {
  const { t } = useTranslation();
  const { proposed, matching } = data.listings;
  return (
    <div className="stack-page">
      <p className="type-body text-muted">{t('housing.offers.body')}</p>
      {proposed.length > 0 && (
        <section aria-labelledby="offers-proposed" className="stack-section">
          <h2 id="offers-proposed" className="type-section-title text-ink">
            {t('housing.offers.proposed')}
          </h2>
          <ul className="grid gap-4 md:grid-cols-2">
            {proposed.map((l) => (
              <ListingCard key={l.id} l={l} />
            ))}
          </ul>
        </section>
      )}
      <section aria-labelledby="offers-matching" className="stack-section">
        <h2 id="offers-matching" className="type-section-title text-ink">
          {h.effectiveCity ? t('housing.offers.matching', { city: h.effectiveCity }) : t('housing.offers.matchingNoCity')}
        </h2>
        {matching.length ? (
          <ul className="grid gap-4 md:grid-cols-2">
            {matching.map((l) => (
              <ListingCard key={l.id} l={l} />
            ))}
          </ul>
        ) : (
          proposed.length === 0 && <p className="rounded-xl border border-dashed border-line bg-card px-4 py-6 text-center text-sm text-muted">{t('housing.offers.empty')}</p>
        )}
      </section>
      <p className="flex items-start gap-2 rounded-xl border border-warning-border bg-warning-bg p-3 text-sm text-warning-fg">
        <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> {t('housing.offers.scamReminder')}
      </p>
    </div>
  );
};

// ─── Page ────────────────────────────────────────────────────────────

export default function Housing() {
  const { t } = useTranslation();
  const { user } = useAuth();
  usePageTitle(t('housing.title'));
  const { data, isLoading, isError } = useHousing(user?.role === 'CLIENT');
  const [tab, setTab] = useTabParam('tab', TABS, 'housing');

  if (isLoading) return <PageLoader />;
  if (isError || !data) {
    return (
      <div className="card mx-auto max-w-lg p-8 text-center">
        <AlertTriangle className="mx-auto size-10 text-warning" aria-hidden />
        <p className="mt-4 font-semibold text-ink">{t('common.error')}</p>
      </div>
    );
  }

  if (!data.case || !data.housing) {
    return (
      <section className="card border-line-strong bg-sunken p-5 sm:p-6">
        <h1 className="type-page-title text-ink">{t('housing.noCase.title')}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">{t('housing.noCase.body')}</p>
        <Link to="/account" className="btn-primary mt-4 min-h-11 px-4 py-2 text-sm">
          {t('housing.noCase.cta')} <ArrowRight className="size-4" aria-hidden />
        </Link>
      </section>
    );
  }

  const h = data.housing;
  const a = h.anmeldung;
  const offers = data.listings.proposed.length + data.listings.matching.length;
  const tile = (key: Tab, title: string, value: ReactNode, sub: ReactNode, icon: typeof Home, tone?: string) => {
    const Icon = icon;
    return (
      <button type="button" onClick={() => setTab(key)} className={clsx('card card-interactive flex min-h-11 items-start gap-3 p-4 text-left', tab === key && 'border-primary')} aria-pressed={tab === key}>
        <span className={clsx('grid size-10 shrink-0 place-items-center rounded-xl bg-sunken text-link', tone)}>
          <Icon className="size-5" aria-hidden />
        </span>
        <span className="min-w-0">
          <span className="type-caption block">{title}</span>
          <span className="block font-semibold text-ink">{value}</span>
          <span className="type-small block">{sub}</span>
        </span>
      </button>
    );
  };

  return (
    <div className="stack-page">
      <header>
        <p className="type-overline text-muted">{t('housing.caseLabel', { number: data.case.number })}</p>
        <h1 className="type-page-title mt-1 text-ink">{t('housing.title')}</h1>
        <p className="mt-1 max-w-[70ch] text-muted">{t('housing.subtitle')}</p>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        {tile('housing', t('housing.summary.housing'), t('housing.summary.steps', h.progress), t(`housing.contract.review.${h.contract.review}`), Home)}
        {tile('anmeldung', t('housing.summary.anmeldung'), t(`housing.status.${a.status}`), <DeadlineLine a={a} />, ClipboardCheck, a.state === 'overdue' ? 'text-danger' : a.state === 'soon' ? 'text-warning-fg' : undefined)}
        {tile('offers', t('housing.summary.offers'), t('housing.summary.offersCount', { count: offers }), data.listings.proposed.length ? t('housing.offers.proposed') : h.effectiveCity ?? '', Building2)}
      </div>

      <Tabs
        label={t('housing.title')}
        idPrefix="housing"
        value={tab}
        onChange={setTab}
        items={[
          { key: 'housing', label: t('housing.tabs.housing'), icon: Home },
          { key: 'anmeldung', label: t('housing.tabs.anmeldung'), icon: ClipboardCheck },
          { key: 'offers', label: t('housing.tabs.offers'), icon: Building2, count: data.listings.proposed.length || undefined },
        ]}
      />
      <TabPanel idPrefix="housing" tabKey={tab}>
        {tab === 'housing' && <HousingTab h={h} />}
        {tab === 'anmeldung' && <AnmeldungTab data={data} h={h} />}
        {tab === 'offers' && <OffersTab data={data} h={h} />}
      </TabPanel>

      <p className="flex items-start gap-2 rounded-xl border border-line bg-card p-3 text-xs leading-relaxed text-muted">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden /> {t('housing.disclaimer')}
      </p>
    </div>
  );
}
