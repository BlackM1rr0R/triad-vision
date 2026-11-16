import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { CheckCircle2, Circle, CircleSlash, ExternalLink, Mail, Rocket, Send, Upload, XCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { sanitizeBrand, setBrand } from '@/lib/brand';
import { usePageTitle } from '@/lib/usePageTitle';
import { useL10n } from '@/lib/l10n';
import { registerCopy } from '@/i18n';
import { pagesOnboarding } from '@/i18n/pagesOnboarding';
import { pagesWhitelabel } from '@/i18n/pagesWhitelabel';
import { adminNavCopy } from '@/i18n/adminNav';
import { ErrorBlock, LoadingBlock, PageHead, Panel, Switch } from '@/components/admin/ui';
import { fmtDate, toastError } from '@/components/admin/labels';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Field';
import { ThemePanel } from '@/components/admin/theme/ThemePanel';
import { MODULE_KEYS, moduleOn } from '@/components/command/navRegistry';
import { useStaffNav } from '@/components/command/navPrefs';
import { useSaveModules } from '@/components/admin/nav/useSaveModules';
import type { L10n } from '@/lib/types';

registerCopy(pagesOnboarding);
registerCopy(pagesWhitelabel);
registerCopy(adminNavCopy);

const STEPS = ['brand', 'languages', 'offer', 'modules', 'staff', 'documents', 'email', 'employer', 'golive'] as const;
type StepKey = (typeof STEPS)[number];
type StepStatus = 'open' | 'done' | 'skipped';
const LANGS = ['az', 'de', 'en', 'ru', 'tr', 'uk'] as const;

interface OnboardingView {
  applicable: boolean;
  state: { steps: Record<StepKey, { status: StepStatus; at?: string; data?: Record<string, unknown> }>; currentStep: StepKey; completedAt: string | null };
  progress: { finished: number; total: number; percent: number; next: StepKey | null };
  required: StepKey[];
  checks: {
    brand: { named: boolean; logo: boolean; icon: boolean; name: string };
    languages: { configured: boolean; languages: string[]; defaultLanguage: string };
    offer: { visas: { id: string; slug: string; title: L10n; visaLabel: string; published: boolean }[]; published: number };
    modules: { stored: boolean };
    staff: { active: number; pendingInvites: number; limit: number | null };
    documents: { templates: number };
    email: { smtpConfigured: boolean; emailFrom: string; domain: string; senderOnDomain: boolean };
    employer: { companies: number; vacancies: number };
    golive: { license: string; legal: boolean; contact: boolean; https: boolean };
  };
}
interface BrandView {
  brand: unknown;
  setting: { name?: string; shortName?: string; tagline?: string; emailFromName?: string; emailFromAddress?: string; languages?: string[]; defaultLanguage?: string };
}

const QK = ['admin-onboarding'];

/**
 * System → Onboarding (SUPER_ADMIN): the setup wizard of a newly provisioned agency instance (server
 * lib/saas/onboarding.ts). Every step writes to the existing settings (brand, theme, modules, visa types,
 * requirement templates, staff accounts); the wizard keeps only the progress, so it is resumable.
 */
export default function AgencyOnboarding() {
  const { t } = useTranslation();
  usePageTitle(t('onb.title'));
  const qc = useQueryClient();
  const q = useQuery({ queryKey: QK, queryFn: async () => (await api.get<OnboardingView>('/admin/onboarding')).data });
  const [active, setActive] = useState<StepKey | null>(null);

  const apply = (v: OnboardingView) => {
    qc.setQueryData(QK, v);
    void qc.invalidateQueries({ queryKey: ['admin-onboarding-status'] });
  };
  const step = useMutation({
    mutationFn: async ({ key, status }: { key: StepKey; status: StepStatus }) => (await api.put<OnboardingView>(`/admin/onboarding/steps/${key}`, { status })).data,
    onSuccess: (v) => {
      apply(v);
      setActive(v.state.currentStep);
    },
    onError: (e) => toastError(e),
  });
  const goTo = useMutation({
    mutationFn: async (key: StepKey) => (await api.put<OnboardingView>('/admin/onboarding/current', { step: key })).data,
    onSuccess: apply,
  });
  const complete = useMutation({
    mutationFn: async () => (await api.post<OnboardingView>('/admin/onboarding/complete')).data,
    onSuccess: apply,
    onError: (e) => toastError(e),
  });
  const reopen = useMutation({
    mutationFn: async () => (await api.post<OnboardingView>('/admin/onboarding/reopen')).data,
    onSuccess: apply,
    onError: (e) => toastError(e),
  });

  useEffect(() => {
    if (q.data && !active) setActive(q.data.state.currentStep);
  }, [q.data, active]);

  if (q.isError) return <ErrorBlock error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data || !active) return <LoadingBlock />;
  const v = q.data;
  const completed = !!v.state.completedAt;
  const open = (key: StepKey) => {
    setActive(key);
    if (!completed) goTo.mutate(key);
  };
  const refresh = () => void qc.invalidateQueries({ queryKey: QK });
  const status = (k: StepKey) => v.state.steps[k].status;
  const footer = (key: StepKey, opts: { primary?: ReactNode } = {}) =>
    completed ? null : (
      <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-line pt-4">
        {opts.primary ?? (
          <Button icon={CheckCircle2} loading={step.isPending} onClick={() => step.mutate({ key, status: 'done' })}>
            {t('onb.actions.continue')}
          </Button>
        )}
        {!v.required.includes(key) && status(key) === 'open' && (
          <Button variant="ghost" icon={CircleSlash} onClick={() => step.mutate({ key, status: 'skipped' })}>
            {t('onb.actions.skip')}
          </Button>
        )}
        {status(key) !== 'open' && (
          <Button variant="ghost" onClick={() => step.mutate({ key, status: 'open' })}>
            {t('onb.actions.reopen')}
          </Button>
        )}
      </div>
    );
  const markDone = (key: StepKey) => step.mutate({ key, status: 'done' });

  return (
    <div className="stack-page">
      <PageHead title={t('onb.title')} subtitle={t('onb.intro')} />
      <div>
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold text-ink">{t('onb.progress', { percent: v.progress.percent })}</span>
          <span className="text-muted tabular-nums">
            {v.progress.finished} / {v.progress.total}
          </span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-sunken" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={v.progress.percent} aria-label={t('onb.title')}>
          <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${v.progress.percent}%` }} />
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[17rem_1fr]">
        <nav aria-label={t('onb.title')}>
          <ol className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
            {STEPS.map((k, n) => {
              const s = status(k);
              const Icon = s === 'done' ? CheckCircle2 : s === 'skipped' ? CircleSlash : Circle;
              return (
                <li key={k} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => open(k)}
                    aria-current={k === active ? 'step' : undefined}
                    className={clsx(
                      'flex min-h-11 w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                      k === active ? 'border-primary bg-primary/10 font-semibold text-ink' : 'border-line bg-card text-ink hover:bg-sunken',
                    )}
                  >
                    <Icon className={clsx('size-4 shrink-0', s === 'done' ? 'text-success-fg' : 'text-muted')} aria-hidden />
                    <span className="whitespace-nowrap lg:whitespace-normal">
                      {n + 1}. {t(`onb.steps.${k}.t`)}
                    </span>
                    <span className="sr-only">({t(`onb.status.${s}`)})</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        <Panel
          title={t(`onb.steps.${active}.t`)}
          actions={
            <div className="flex items-center gap-2">
              {v.required.includes(active) && <Badge tone="info">{t('onb.required')}</Badge>}
              <Badge tone={status(active) === 'done' ? 'success' : 'neutral'}>{t(`onb.status.${status(active)}`)}</Badge>
            </div>
          }
        >
          <p className="mb-5 text-sm text-muted">{t(`onb.steps.${active}.d`)}</p>
          {active === 'brand' && <BrandStep v={v} onSaved={refresh} footer={footer('brand')} />}
          {active === 'languages' && <LanguagesStep onSaved={() => markDone('languages')} footer={footer('languages', { primary: <span /> })} />}
          {active === 'offer' && <OfferStep v={v} onSaved={apply} footer={footer('offer', { primary: <span /> })} />}
          {active === 'modules' && <ModulesStep footer={footer('modules')} />}
          {active === 'staff' && <StaffStep v={v} onSaved={apply} footer={footer('staff')} />}
          {active === 'documents' && <DocumentsStep v={v} onSaved={refresh} footer={footer('documents')} />}
          {active === 'email' && <EmailStep v={v} onSaved={refresh} onConfirm={() => markDone('email')} footer={footer('email', { primary: <span /> })} />}
          {active === 'employer' && <EmployerStep v={v} footer={footer('employer')} />}
          {active === 'golive' && <GoLiveStep v={v} busy={complete.isPending || reopen.isPending} onComplete={() => complete.mutate()} onReopen={() => reopen.mutate()} />}
        </Panel>
      </div>
    </div>
  );
}

// ─── Steps ────────────────────────────────────────────────────────────

const Check = ({ ok, children }: { ok: boolean; children: ReactNode }) => (
  <li className="flex items-start gap-2 text-sm">
    {ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success-fg" aria-hidden /> : <XCircle className="mt-0.5 size-4 shrink-0 text-danger-fg" aria-hidden />}
    <span className={ok ? 'text-ink' : 'text-muted'}>{children}</span>
  </li>
);

const useBrandView = () => {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin-brand'], queryFn: async () => (await api.get<BrandView>('/admin/brand')).data });
  const apply = (view: BrandView) => {
    qc.setQueryData(['admin-brand'], view);
    const b = sanitizeBrand(view.brand);
    if (b) setBrand(b);
  };
  return { q, apply };
};

const BrandStep = ({ v, onSaved, footer }: { v: OnboardingView; onSaved: () => void; footer: ReactNode }) => {
  const { t } = useTranslation();
  const { q, apply } = useBrandView();
  const [form, setForm] = useState<{ name: string; shortName: string; tagline: string } | null>(null);
  useEffect(() => {
    if (q.data && !form) setForm({ name: q.data.setting.name ?? '', shortName: q.data.setting.shortName ?? '', tagline: q.data.setting.tagline ?? '' });
  }, [q.data, form]);
  const save = useMutation({
    mutationFn: async (body: { name: string; shortName: string; tagline: string }) => (await api.put<BrandView>('/admin/brand', body)).data,
    onSuccess: (view) => {
      apply(view);
      onSaved();
      toast.success(t('wl.brand.saved'));
    },
    onError: (e) => toastError(e),
  });
  const upload = useMutation({
    mutationFn: async ({ kind, file }: { kind: 'logoLight' | 'icon'; file: File }) => {
      const fd = new FormData();
      fd.append('file', file);
      return (await api.post<BrandView>(`/admin/brand/images/${kind}`, fd)).data;
    },
    onSuccess: (view) => {
      apply(view);
      onSaved();
    },
    onError: (e) => toastError(e),
  });
  if (!form) return <LoadingBlock />;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate(form);
  };
  const file = (kind: 'logoLight' | 'icon', label: string, done: boolean) => (
    <Field label={label}>
      <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-line bg-card px-3 py-2 text-sm font-semibold text-ink hover:bg-sunken has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-focus/40">
        <Upload className="size-4" aria-hidden /> {done ? t('onb.brand.uploaded') : t('onb.brand.upload')}
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) upload.mutate({ kind, file: f });
            e.target.value = '';
          }}
        />
      </label>
    </Field>
  );
  return (
    <div className="space-y-6">
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-3">
        <Field label={t('onb.brand.name')} required>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={60} required />
        </Field>
        <Field label={t('onb.brand.shortName')}>
          <Input value={form.shortName} onChange={(e) => setForm({ ...form, shortName: e.target.value })} maxLength={30} />
        </Field>
        <Field label={t('onb.brand.tagline')}>
          <Input value={form.tagline} onChange={(e) => setForm({ ...form, tagline: e.target.value })} maxLength={80} />
        </Field>
        <div className="sm:col-span-3">
          <Button type="submit" variant="secondary" loading={save.isPending}>
            {t('onb.email.save')}
          </Button>
        </div>
      </form>
      <div className="grid gap-4 sm:grid-cols-2">
        {file('logoLight', t('onb.brand.logo'), v.checks.brand.logo)}
        {file('icon', t('onb.brand.icon'), v.checks.brand.icon)}
      </div>
      <ul className="space-y-1.5">
        <Check ok={v.checks.brand.named}>{t('onb.brand.checks.named')}</Check>
        <Check ok={v.checks.brand.logo}>{t('onb.brand.checks.logo')}</Check>
        <Check ok={v.checks.brand.icon}>{t('onb.brand.checks.icon')}</Check>
      </ul>
      <div>
        <h3 className="mb-2 text-sm font-semibold text-ink">{t('onb.brand.colours')}</h3>
        <ThemePanel />
      </div>
      <Link to="/admin/system/brand" className="inline-flex items-center gap-1 text-sm text-link underline">
        {t('onb.brand.more')} <ExternalLink className="size-3.5" aria-hidden />
      </Link>
      {footer}
    </div>
  );
};

const LanguagesStep = ({ onSaved, footer }: { onSaved: () => void; footer: ReactNode }) => {
  const { t } = useTranslation();
  const { q, apply } = useBrandView();
  const [langs, setLangs] = useState<string[] | null>(null);
  const [def, setDef] = useState('');
  useEffect(() => {
    if (q.data && !langs) {
      setLangs(q.data.setting.languages?.length ? q.data.setting.languages : [...LANGS]);
      setDef(q.data.setting.defaultLanguage ?? '');
    }
  }, [q.data, langs]);
  const save = useMutation({
    mutationFn: async () => (await api.put<BrandView>('/admin/brand', { languages: langs, defaultLanguage: def && langs?.includes(def) ? def : (langs?.[0] ?? '') })).data,
    onSuccess: (view) => {
      apply(view);
      onSaved();
    },
    onError: (e) => toastError(e),
  });
  if (!langs) return <LoadingBlock />;
  const toggle = (l: string) => setLangs((cur) => (cur!.includes(l) ? cur!.filter((x) => x !== l) : [...cur!, l]));
  return (
    <div className="space-y-5">
      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-ink">{t('onb.languages.pick')}</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {LANGS.map((l) => (
            <label key={l} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-line bg-card px-3 text-sm text-ink has-[:checked]:border-primary">
              <input type="checkbox" checked={langs.includes(l)} onChange={() => toggle(l)} className="size-4" />
              {l.toUpperCase()}
            </label>
          ))}
        </div>
        <p className="mt-1 text-xs text-muted">{t('onb.languages.hint')}</p>
      </fieldset>
      <Field label={t('onb.languages.default')}>
        <Select value={def} onChange={(e) => setDef(e.target.value)}>
          <option value="">—</option>
          {langs.map((l) => (
            <option key={l} value={l}>
              {l.toUpperCase()}
            </option>
          ))}
        </Select>
      </Field>
      <Button icon={CheckCircle2} disabled={!langs.length} loading={save.isPending} onClick={() => save.mutate()}>
        {t('onb.actions.saveContinue')}
      </Button>
      {footer}
    </div>
  );
};

const OfferStep = ({ v, onSaved, footer }: { v: OnboardingView; onSaved: (v: OnboardingView) => void; footer: ReactNode }) => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const stored = v.state.steps.offer.data?.countries;
  const [countries, setCountries] = useState(Array.isArray(stored) ? stored.join(', ') : '');
  const [ids, setIds] = useState<string[]>(v.checks.offer.visas.filter((x) => x.published).map((x) => x.id));
  const save = useMutation({
    mutationFn: async () =>
      (
        await api.put<OnboardingView>('/admin/onboarding/offer', {
          countries: countries
            .split(/[\s,;]+/)
            .map((c) => c.trim())
            .filter((c) => /^[A-Za-z]{2}$/.test(c)),
          visaCategoryIds: ids,
        })
      ).data,
    onSuccess: onSaved,
    onError: (e) => toastError(e),
  });
  return (
    <div className="space-y-5">
      <Field label={t('onb.offer.countries')}>
        <Input value={countries} onChange={(e) => setCountries(e.target.value)} maxLength={300} placeholder="AZ, GE, UZ" />
      </Field>
      <fieldset>
        <legend className="mb-1 text-sm font-semibold text-ink">{t('onb.offer.visas')}</legend>
        <p className="mb-2 text-xs text-muted">{t('onb.offer.visasHint')}</p>
        {v.checks.offer.visas.length === 0 ? (
          <p className="text-sm text-muted">{t('onb.offer.none')}</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {v.checks.offer.visas.map((x) => (
              <label key={x.id} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-line bg-card px-3 py-2 text-sm text-ink has-[:checked]:border-primary">
                <input type="checkbox" className="size-4" checked={ids.includes(x.id)} onChange={() => setIds((c) => (c.includes(x.id) ? c.filter((i) => i !== x.id) : [...c, x.id]))} />
                <span>
                  {tr(x.title)} <span className="text-xs text-muted">{x.visaLabel}</span>
                </span>
              </label>
            ))}
          </div>
        )}
      </fieldset>
      <div className="flex flex-wrap items-center gap-3">
        <Button icon={CheckCircle2} disabled={!ids.length} loading={save.isPending} onClick={() => save.mutate()}>
          {t('onb.actions.saveContinue')}
        </Button>
        <Link to="/admin/content/visa-categories" className="text-sm text-link underline">
          {t('onb.offer.manage')}
        </Link>
      </div>
      {footer}
    </div>
  );
};

const ModulesStep = ({ footer }: { footer: ReactNode }) => {
  const { t } = useTranslation();
  const { modules, loaded } = useStaffNav();
  const save = useSaveModules();
  if (!loaded) return <LoadingBlock />;
  return (
    <div>
      <p className="mb-3 text-xs text-muted">{t('onb.modules.hint')}</p>
      <ul className="divide-y divide-line rounded-lg border border-line">
        {MODULE_KEYS.map((key) => {
          const title = t(`anav.modules.${key}.title`);
          return (
            <li key={key} className="flex items-start gap-4 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">{title}</p>
                <p className="text-xs text-muted">{t(`anav.modules.${key}.desc`)}</p>
              </div>
              <Switch checked={moduleOn(modules, key)} disabled={save.isPending} onChange={(on) => save.mutate({ [key]: on })} label={t('anav.modulesPage.toggle', { module: title })} />
            </li>
          );
        })}
      </ul>
      {footer}
    </div>
  );
};

const StaffStep = ({ v, onSaved, footer }: { v: OnboardingView; onSaved: (v: OnboardingView) => void; footer: ReactNode }) => {
  const { t } = useTranslation();
  const empty = { email: '', firstName: '', lastName: '', role: 'STAFF', locale: 'en' };
  const [f, setF] = useState(empty);
  const invite = useMutation({
    mutationFn: async () => (await api.post<OnboardingView & { user: { email: string } }>('/admin/onboarding/invite', f)).data,
    onSuccess: (r) => {
      onSaved(r);
      toast.success(t('onb.staff.invited', { email: r.user.email }));
      setF(empty);
    },
    onError: (e) => toastError(e),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    invite.mutate();
  };
  const s = v.checks.staff;
  return (
    <div className="space-y-5">
      <ul className="space-y-1 text-sm text-ink">
        <li>{t('onb.staff.active', { n: s.active })}</li>
        <li>{t('onb.staff.pending', { n: s.pendingInvites })}</li>
        {s.limit !== null && <li>{t('onb.staff.limit', { n: s.limit })}</li>}
      </ul>
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label={t('onb.staff.email')} required>
          <Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required maxLength={200} />
        </Field>
        <Field label={t('onb.staff.role')}>
          <Select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
            <option value="STAFF">{t('onb.staff.roles.STAFF')}</option>
            <option value="ADMIN">{t('onb.staff.roles.ADMIN')}</option>
          </Select>
        </Field>
        <Field label={t('onb.staff.firstName')} required>
          <Input value={f.firstName} onChange={(e) => setF({ ...f, firstName: e.target.value })} required maxLength={80} />
        </Field>
        <Field label={t('onb.staff.lastName')} required>
          <Input value={f.lastName} onChange={(e) => setF({ ...f, lastName: e.target.value })} required maxLength={80} />
        </Field>
        <Field label={t('onb.staff.locale')}>
          <Select value={f.locale} onChange={(e) => setF({ ...f, locale: e.target.value })}>
            {['az', 'de', 'en', 'ru'].map((l) => (
              <option key={l} value={l}>
                {l.toUpperCase()}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex items-end">
          <Button type="submit" icon={Send} variant="secondary" loading={invite.isPending}>
            {t('onb.staff.invite')}
          </Button>
        </div>
      </form>
      {footer}
    </div>
  );
};

const DocumentsStep = ({ v, onSaved, footer }: { v: OnboardingView; onSaved: () => void; footer: ReactNode }) => {
  const { t } = useTranslation();
  const seed = useMutation({
    mutationFn: async () => (await api.post<{ created: number }>('/admin/requirements/seed-defaults')).data,
    onSuccess: (r) => {
      toast.success(t('onb.documents.imported', { n: r.created }));
      onSaved();
    },
    onError: (e) => toastError(e),
  });
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink">{t('onb.documents.count', { n: v.checks.documents.templates })}</p>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" loading={seed.isPending} onClick={() => seed.mutate()}>
          {t('onb.documents.import')}
        </Button>
        <Link to="/admin/requirements" className="text-sm text-link underline">
          {t('onb.documents.manage')}
        </Link>
      </div>
      {footer}
    </div>
  );
};

const EmailStep = ({ v, onSaved, onConfirm, footer }: { v: OnboardingView; onSaved: () => void; onConfirm: () => void; footer: ReactNode }) => {
  const { t } = useTranslation();
  const { q, apply } = useBrandView();
  const [f, setF] = useState<{ emailFromName: string; emailFromAddress: string } | null>(null);
  useEffect(() => {
    if (q.data && !f) setF({ emailFromName: q.data.setting.emailFromName ?? '', emailFromAddress: q.data.setting.emailFromAddress ?? '' });
  }, [q.data, f]);
  const save = useMutation({
    mutationFn: async () => (await api.put<BrandView>('/admin/brand', f)).data,
    onSuccess: (view) => {
      apply(view);
      onSaved();
      toast.success(t('wl.brand.saved'));
    },
    onError: (e) => toastError(e),
  });
  const test = useMutation({
    mutationFn: async () => (await api.post<{ result: { status: 'SENT' | 'CONSOLE' | 'FAILED'; error?: string }; to: string }>('/admin/onboarding/test-email')).data,
    onError: (e) => toastError(e),
  });
  const e = v.checks.email;
  if (!f) return <LoadingBlock />;
  return (
    <div className="space-y-5">
      <ul className="space-y-1.5">
        <Check ok={e.smtpConfigured}>{e.smtpConfigured ? t('onb.email.smtp') : t('onb.email.smtpMissing')}</Check>
        <Check ok={e.senderOnDomain}>
          {t('onb.email.from')}: <span className="font-mono text-xs">{e.emailFrom}</span> — {e.senderOnDomain ? t('onb.email.onDomain', { domain: e.domain }) : t('onb.email.offDomain', { domain: e.domain })}
        </Check>
      </ul>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('onb.email.fromName')}>
          <Input value={f.emailFromName} onChange={(ev) => setF({ ...f, emailFromName: ev.target.value })} maxLength={80} />
        </Field>
        <Field label={t('onb.email.fromAddress')}>
          <Input type="email" value={f.emailFromAddress} onChange={(ev) => setF({ ...f, emailFromAddress: ev.target.value })} maxLength={200} placeholder={`no-reply@${e.domain}`} />
        </Field>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" loading={save.isPending} onClick={() => save.mutate()}>
          {t('onb.email.save')}
        </Button>
        <Button variant="secondary" icon={Mail} loading={test.isPending} onClick={() => test.mutate()}>
          {t('onb.email.test')}
        </Button>
      </div>
      {test.data && (
        <p role="status" className={clsx('text-sm', test.data.result.status === 'SENT' ? 'text-success-fg' : 'text-danger-fg')}>
          {test.data.result.status === 'SENT'
            ? t('onb.email.testSent', { to: test.data.to })
            : test.data.result.status === 'CONSOLE'
              ? t('onb.email.testConsole')
              : t('onb.email.testFailed', { error: test.data.result.error ?? '' })}
        </p>
      )}
      <Button icon={CheckCircle2} disabled={!e.smtpConfigured || test.data?.result.status !== 'SENT'} onClick={onConfirm}>
        {t('onb.email.confirm')}
      </Button>
      {footer}
    </div>
  );
};

const EmployerStep = ({ v, footer }: { v: OnboardingView; footer: ReactNode }) => {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <p className="text-sm font-semibold text-ink">{t('onb.employer.counts', { companies: v.checks.employer.companies, vacancies: v.checks.employer.vacancies })}</p>
      <div className="flex flex-wrap gap-3">
        <Link to="/admin/companies" className="text-sm text-link underline">
          {t('onb.employer.addCompany')}
        </Link>
        <Link to="/admin/vacancies" className="text-sm text-link underline">
          {t('onb.employer.addVacancy')}
        </Link>
      </div>
      <p className="text-xs text-muted">{t('onb.employer.hint')}</p>
      {footer}
    </div>
  );
};

const GoLiveStep = ({ v, busy, onComplete, onReopen }: { v: OnboardingView; busy: boolean; onComplete: () => void; onReopen: () => void }) => {
  const { t } = useTranslation();
  const c = v.checks;
  const missing = STEPS.filter((k) => k !== 'golive' && v.state.steps[k].status === 'open');
  const done = !!v.state.completedAt;
  return (
    <div className="space-y-5">
      <ul className="space-y-1.5">
        <Check ok={c.golive.license === 'valid' || c.golive.license === 'owner'}>{t('onb.golive.checks.license')}</Check>
        <Check ok={c.brand.named}>{t('onb.golive.checks.brand')}</Check>
        <Check ok={c.brand.logo}>{t('onb.golive.checks.logo')}</Check>
        <Check ok={c.golive.legal}>
          {t('onb.golive.checks.legal')} ·{' '}
          <Link to="/admin/legal" className="text-link underline">
            {t('onb.golive.legalLink')}
          </Link>
        </Check>
        <Check ok={c.golive.contact}>
          {t('onb.golive.checks.contact')} ·{' '}
          <Link to="/admin/settings" className="text-link underline">
            {t('onb.golive.contactLink')}
          </Link>
        </Check>
        <Check ok={c.golive.https}>{t('onb.golive.checks.https')}</Check>
        <Check ok={c.email.smtpConfigured}>{t('onb.golive.checks.smtp')}</Check>
        <Check ok={c.staff.active > 1 || c.staff.pendingInvites > 0}>{t('onb.golive.checks.staff')}</Check>
        <Check ok={missing.length === 0}>{t('onb.golive.checks.steps')}</Check>
      </ul>
      <p className="text-xs text-muted">{t('onb.golive.advisory')}</p>
      {done ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-success-fg">
            <Rocket className="size-4" aria-hidden /> {t('onb.golive.completed', { date: fmtDate(v.state.completedAt) })}
          </p>
          <Button variant="ghost" loading={busy} onClick={onReopen}>
            {t('onb.golive.reopen')}
          </Button>
        </div>
      ) : (
        <>
          {missing.length > 0 && <p className="text-sm text-danger-fg">{t('onb.golive.missing', { steps: missing.map((k) => t(`onb.steps.${k}.t`)).join(', ') })}</p>}
          <Button icon={Rocket} disabled={missing.length > 0} loading={busy} onClick={onComplete}>
            {t('onb.golive.complete')}
          </Button>
        </>
      )}
    </div>
  );
};
