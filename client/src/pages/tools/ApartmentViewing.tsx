import { useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { AlertTriangle, Ban, CheckCircle2, ClipboardList, Download, FileText, House, Info, Play, ShieldAlert, UserRound, type LucideIcon } from 'lucide-react';
import { PageHero } from '@/components/layout/PageHero';
import { buttonClass } from '@/components/ui/Button';
import { RelatedGuides } from '@/components/guides/RelatedGuides';
import { downloadBlob, filenameFrom } from '@/components/cv/types';
import { Disclaimer, GlossaryLinks, NumField, Sources, ToolFaq, useFaq, useLng } from '@/components/tools/calc/CalcShared';
import { registerCopy } from '@/i18n';
import { pagesApartmentViewing } from '@/i18n/pagesApartmentViewing';
import { pagesGames } from '@/i18n/pagesGames';
import { pagesGermanSimulator } from '@/i18n/pagesGermanSimulator';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { usePageTitle } from '@/lib/usePageTitle';
import { pickTx } from '@/lib/games/common';
import { APARTMENT_SCENES } from '@/lib/games/simulator/scenes';
import { Player } from '@/pages/games/GermanSimulator';
import { ATTACHMENT_KEYS, DEFAULT_DISCLOSURE, DISCLOSURE_AS_OF, DISCLOSURE_SOURCES, stageIncludes, type DisclosureForm, type DisclosurePrefill, type Stage, type YesNo } from '@/lib/rentalDisclosure';

registerCopy(pagesGames);
registerCopy(pagesGermanSimulator);
registerCopy(pagesApartmentViewing);

const PATH = '/apartment-viewing';
const SCENE_ICON: Record<string, LucideIcon> = { viewing: House, flatScam: ShieldAlert };

const Field = ({ id, label, children, hint }: { id: string; label: string; children: ReactNode; hint?: string }) => (
  <div>
    <label htmlFor={id} className="label">
      {label}
    </label>
    {children}
    {hint && <p className="mt-1 text-[11px] leading-snug text-muted">{hint}</p>}
  </div>
);

const Text = ({ id, label, value, onChange, hint, type = 'text', autoComplete, max = 160 }: { id: string; label: string; value: string; onChange: (v: string) => void; hint?: string; type?: string; autoComplete?: string; max?: number }) => (
  <Field id={id} label={label} hint={hint}>
    <input id={id} type={type} className="input" value={value} maxLength={max} autoComplete={autoComplete} onChange={(e) => onChange(e.target.value)} />
  </Field>
);

const YesNoField = ({ legend, value, onChange }: { legend: string; value: YesNo; onChange: (v: YesNo) => void }) => {
  const { t } = useTranslation();
  return (
    <fieldset>
      <legend className="label">{legend}</legend>
      <div className="grid grid-cols-2 gap-2">
        {(['yes', 'no'] as const).map((v) => (
          <label
            key={v}
            className={clsx(
              'flex min-h-11 cursor-pointer items-center justify-center rounded-xl border px-2 text-sm font-semibold has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-focus/40',
              value === v ? 'border-primary bg-primary text-primary-contrast' : 'border-line bg-card text-ink hover:bg-sunken',
            )}
          >
            <input type="radio" className="sr-only" checked={value === v} onChange={() => onChange(v)} />
            {t(`aptView.form.${v}`)}
          </label>
        ))}
      </div>
    </fieldset>
  );
};

const Generator = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [f, setF] = useState<DisclosureForm>(DEFAULT_DISCLOSURE);
  const [busy, setBusy] = useState(false);
  const [prefilled, setPrefilled] = useState<DisclosurePrefill | null>(null);
  const set = (patch: Partial<DisclosureForm>) => setF((x) => ({ ...x, ...patch }));
  const isClient = user?.role === 'CLIENT';

  const prefill = async () => {
    try {
      const p = (await api.get<DisclosurePrefill>('/rental-disclosure/me')).data;
      setF((x) => ({
        ...x,
        name: p.name || x.name,
        address: p.address || x.address,
        phone: p.phone || x.phone,
        email: p.email || x.email,
        employer: p.employer || x.employer,
        occupation: p.occupation || x.occupation,
        net: p.net ?? x.net,
        moveIn: p.moveIn ? p.moveIn.split('-').reverse().join('.') : x.moveIn,
      }));
      setPrefilled(p);
      toast.success(t('aptView.form.prefilled'));
    } catch {
      toast.error(t('aptView.form.prefillFailed'));
    }
  };

  const generate = async () => {
    if (!f.name.trim()) {
      toast.error(t('aptView.form.nameRequired'));
      document.getElementById('sa-name')?.focus();
      return;
    }
    setBusy(true);
    try {
      const res = await api.post<Blob>('/rental-disclosure/pdf', f, { responseType: 'blob' });
      downloadBlob(res.data, filenameFrom(res.headers['content-disposition'] as string | undefined, 'Mieterselbstauskunft.pdf'));
    } catch {
      toast.error(t('aptView.form.pdfFailed'));
    } finally {
      setBusy(false);
    }
  };

  const B = stageIncludes(f.stage, 'B');
  const C = stageIncludes(f.stage, 'C');

  return (
    <form className="space-y-5 rounded-3xl border border-line bg-card p-4 sm:p-6" onSubmit={(e) => {
        e.preventDefault();
        void generate();
      }}
      aria-labelledby="sa-h"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="sa-h" className="flex items-center gap-2 font-display text-xl font-semibold text-ink">
            <FileText className="size-5 text-primary" aria-hidden /> {t('aptView.form.title')}
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted">{t('aptView.form.intro')}</p>
        </div>
        {isClient ? (
          <button type="button" className={buttonClass({ variant: 'outline', size: 'sm' })} onClick={() => void prefill()}>
            <UserRound className="size-4" aria-hidden /> {t('aptView.form.prefill')}
          </button>
        ) : (
          <p className="max-w-xs text-xs text-muted">
            <Link to="/login" state={{ from: PATH }} className="font-semibold text-link hover:underline">
              {t('aptView.form.login')}
            </Link>{' '}
            {t('aptView.form.loginHint')}
          </p>
        )}
      </div>
      {prefilled?.sources.net && <p className="rounded-2xl border border-warning-border bg-warning-bg p-3 text-xs text-warning-fg">{t('aptView.form.netEstimate')}</p>}

      <fieldset>
        <legend className="label">{t('aptView.form.stage')}</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {(['A', 'B', 'C'] as const satisfies readonly Stage[]).map((s) => (
            <label
              key={s}
              className={clsx(
                'flex cursor-pointer flex-col rounded-2xl border p-3 text-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-focus/40',
                f.stage === s ? 'border-primary bg-primary/10' : 'border-line bg-card hover:bg-sunken',
              )}
            >
              <input type="radio" className="sr-only" checked={f.stage === s} onChange={() => set({ stage: s })} />
              <span className="font-semibold text-ink">{t(`aptView.stages.${s}.title`)}</span>
              <span className="mt-0.5 text-xs text-muted">{t(`aptView.stages.${s}.short`)}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Text id="sa-flat" label={t('aptView.form.flatAddress')} value={f.flatAddress} onChange={(flatAddress) => set({ flatAddress })} max={300} />
        <Text id="sa-movein" label={t('aptView.form.moveIn')} value={f.moveIn} onChange={(moveIn) => set({ moveIn })} max={40} hint={t('aptView.form.moveInHint')} />
        <Text id="sa-landlord" label={t('aptView.form.landlordName')} value={f.landlordName} onChange={(landlordName) => set({ landlordName })} />
        <Text id="sa-unit" label={t('aptView.form.flatUnit')} value={f.flatUnit} onChange={(flatUnit) => set({ flatUnit })} max={120} />
      </div>

      <section className="space-y-4 border-t border-line pt-4" aria-labelledby="sa-a">
        <h3 id="sa-a" className="font-semibold text-ink">
          {t('aptView.stages.A.title')}
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Text id="sa-name" label={t('aptView.form.name')} value={f.name} onChange={(name) => set({ name })} autoComplete="name" />
          <Text id="sa-address" label={t('aptView.form.address')} value={f.address} onChange={(address) => set({ address })} autoComplete="street-address" max={300} />
          <Text id="sa-phone" label={t('aptView.form.phone')} value={f.phone} onChange={(phone) => set({ phone })} type="tel" autoComplete="tel" max={60} />
          <Text id="sa-email" label={t('aptView.form.email')} value={f.email} onChange={(email) => set({ email })} type="email" autoComplete="email" />
        </div>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" className="size-4" checked={f.socialHousing} onChange={(e) => set({ socialHousing: e.target.checked })} /> {t('aptView.form.socialHousing')}
        </label>
        {f.socialHousing && <YesNoField legend={t('aptView.form.wbs')} value={f.wbs} onChange={(wbs) => set({ wbs })} />}
      </section>

      {B && (
        <section className="space-y-4 border-t border-line pt-4" aria-labelledby="sa-b">
          <h3 id="sa-b" className="font-semibold text-ink">
            {t('aptView.stages.B.title')}
          </h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <NumField label={t('aptView.form.adults')} value={f.adults} min={1} max={20} onChange={(n) => set({ adults: Math.max(1, Math.round(n)) })} />
            <NumField label={t('aptView.form.children')} value={f.children} max={20} onChange={(n) => set({ children: Math.round(n) })} />
            <Text id="sa-employer" label={t('aptView.form.employer')} value={f.employer} onChange={(employer) => set({ employer })} max={200} />
            <Text id="sa-occupation" label={t('aptView.form.occupation')} value={f.occupation} onChange={(occupation) => set({ occupation })} />
          </div>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" className="size-4" checked={f.publicPayer} onChange={(e) => set({ publicPayer: e.target.checked })} /> {t('aptView.form.publicPayer')}
          </label>
          {!f.publicPayer && (
            <>
              <fieldset>
                <legend className="label">{t('aptView.form.incomeMode')}</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(['amount', 'threshold'] as const).map((m) => (
                    <label key={m} className={clsx('flex min-h-11 cursor-pointer items-center rounded-xl border px-3 text-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-focus/40', f.incomeMode === m ? 'border-primary bg-primary/10 font-semibold' : 'border-line bg-card')}>
                      <input type="radio" className="sr-only" checked={f.incomeMode === m} onChange={() => set({ incomeMode: m })} />
                      {t(`aptView.form.incomeModes.${m}`)}
                    </label>
                  ))}
                </div>
              </fieldset>
              {f.incomeMode === 'amount' ? (
                <NumField label={t('aptView.form.net')} value={f.net ?? 0} max={1_000_000} onChange={(n) => set({ net: n > 0 ? Math.round(n) : null })} suffix="€" hint={t('aptView.form.netHint')} />
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  <NumField label={t('aptView.form.threshold')} value={f.threshold ?? 0} max={1_000_000} onChange={(n) => set({ threshold: n > 0 ? Math.round(n) : null })} suffix="€" />
                  <YesNoField legend={t('aptView.form.thresholdOk')} value={f.thresholdOk} onChange={(thresholdOk) => set({ thresholdOk })} />
                </div>
              )}
            </>
          )}
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" className="size-4" checked={f.petsAsked} onChange={(e) => set({ petsAsked: e.target.checked })} /> {t('aptView.form.petsAsked')}
          </label>
          {f.petsAsked && <Text id="sa-pets" label={t('aptView.form.pets')} value={f.pets} onChange={(pets) => set({ pets })} max={300} hint={t('aptView.form.petsHint')} />}
          <div className="grid gap-4 sm:grid-cols-2">
            <YesNoField legend={t('aptView.form.insolvency')} value={f.insolvency} onChange={(insolvency) => set({ insolvency })} />
            <YesNoField legend={t('aptView.form.eviction')} value={f.eviction} onChange={(eviction) => set({ eviction })} />
          </div>
        </section>
      )}

      {C && (
        <section className="space-y-4 border-t border-line pt-4" aria-labelledby="sa-c">
          <h3 id="sa-c" className="font-semibold text-ink">
            {t('aptView.stages.C.title')}
          </h3>
          <YesNoField legend={t('aptView.form.arrearsTwoMonths')} value={f.arrearsTwoMonths} onChange={(arrearsTwoMonths) => set({ arrearsTwoMonths })} />
          <YesNoField legend={t('aptView.form.arrearsTwoRents')} value={f.arrearsTwoRents} onChange={(arrearsTwoRents) => set({ arrearsTwoRents })} />
          <YesNoField legend={t('aptView.form.terminated')} value={f.terminated} onChange={(terminated) => set({ terminated })} />
          {f.terminated === 'yes' && (
            <>
              <Field id="sa-what" label={t('aptView.form.terminatedWhat')}>
                <textarea id="sa-what" className="input min-h-20" maxLength={600} value={f.terminatedWhat} onChange={(e) => set({ terminatedWhat: e.target.value })} />
              </Field>
              <Field id="sa-reasons" label={t('aptView.form.reasons')}>
                <textarea id="sa-reasons" className="input min-h-24" maxLength={1200} value={f.reasons} onChange={(e) => set({ reasons: e.target.value })} />
              </Field>
            </>
          )}
          <fieldset>
            <legend className="label">{t('aptView.form.attachments')}</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {ATTACHMENT_KEYS.filter((a) => (a === 'publicPayer' ? f.publicPayer : a === 'wbs' ? f.socialHousing : true)).map((a) => (
                <label key={a} className="flex items-start gap-2 text-sm text-ink">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4"
                    checked={f.attachments.includes(a)}
                    onChange={(e) => set({ attachments: e.target.checked ? [...f.attachments, a] : f.attachments.filter((x) => x !== a) })}
                  />
                  {t(`aptView.checklist.items.${a}.title`)}
                </label>
              ))}
            </div>
          </fieldset>
        </section>
      )}

      <div className="grid gap-4 border-t border-line pt-4 sm:grid-cols-2">
        <Text id="sa-place" label={t('aptView.form.place')} value={f.place} onChange={(place) => set({ place })} max={80} />
        <Text id="sa-date" label={t('aptView.form.date')} value={f.date} onChange={(date) => set({ date })} max={20} hint="TT.MM.JJJJ" />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <button type="submit" className={buttonClass({ size: 'lg' })} disabled={busy}>
          <Download className="size-4" aria-hidden /> {busy ? t('aptView.form.generating') : t('aptView.form.download')}
        </button>
        <p className="flex items-start gap-1.5 text-xs text-muted">
          <Info className="mt-px size-3.5 shrink-0" aria-hidden /> {t('aptView.form.privacy')}
        </p>
      </div>
    </form>
  );
};

/**
 * /apartment-viewing — flat viewing in Germany: two scripted scenes of the Bürgeramt simulator engine (viewing with a
 * property manager, fake advert), what a landlord may and may not ask (DSK guidance, AGG), scams, and the
 * Mieterselbstauskunft generator (only DSK-permissible fields; logged-in clients can prefill from the portal; the
 * PDF is rendered by POST /api/rental-disclosure/pdf and nothing is stored) with the attachment checklist.
 */
export default function ApartmentViewingPage() {
  const { t } = useTranslation();
  usePageTitle(t('aptView.heroTitle'));
  const lng = useLng();
  const faq = useFaq('aptView.faq');
  const [params, setParams] = useSearchParams();
  const scene = APARTMENT_SCENES.find((s) => s.id === params.get('scene')) ?? null;
  const open = (id: string | null) => setParams(id ? new URLSearchParams({ scene: id }) : new URLSearchParams(), { replace: false, preventScrollReset: true });
  const list = (key: string) => {
    const v = t(key, { returnObjects: true }) as unknown;
    return Array.isArray(v) ? (v as string[]) : [];
  };

  return (
    <>
      <PageHero title={t('aptView.heroTitle')} subtitle={t('aptView.heroSubtitle')} crumb={{ to: '/tools', label: t('siteNav.tools') }} />
      <section className="section">
        <div className="container-x max-w-5xl space-y-10">
          <section aria-labelledby="av-sim-h" id="practice">
            <h2 id="av-sim-h" className="font-display text-xl font-semibold text-ink">
              {t('aptView.sim.title')}
            </h2>
            <p className="mt-1 text-sm text-muted">{t('aptView.sim.text')}</p>
            <div className="mt-4">
              {scene ? (
                <Player key={scene.id} scene={scene} path={PATH} onExit={() => open(null)} onFinish={() => undefined} />
              ) : (
                <ul className="grid gap-3 sm:grid-cols-2">
                  {APARTMENT_SCENES.map((s) => {
                    const Icon = SCENE_ICON[s.id] ?? House;
                    return (
                      <li key={s.id} className="flex flex-col rounded-3xl border border-line bg-card p-4 sm:p-5">
                        <div className="flex items-start gap-3">
                          <span className="grid size-11 shrink-0 place-items-center rounded-xl chip-soft">
                            <Icon className="size-5" aria-hidden />
                          </span>
                          <div className="min-w-0">
                            <h3 className="font-semibold text-ink">{pickTx(s.title, lng)}</h3>
                            <p className="mt-1 text-sm leading-snug text-muted">{pickTx(s.setting, lng)}</p>
                          </div>
                        </div>
                        <div className="mt-auto pt-4">
                          <button type="button" className={buttonClass({ size: 'sm' })} onClick={() => open(s.id)}>
                            <Play className="size-4" aria-hidden /> {t('aptView.sim.play')}
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>

          <section aria-labelledby="av-costs-h" className="rounded-3xl border border-line bg-card p-5 sm:p-6">
            <h2 id="av-costs-h" className="font-display text-xl font-semibold text-ink">
              {t('aptView.costs.title')}
            </h2>
            <dl className="mt-3 grid gap-3 sm:grid-cols-2">
              {(['kaltmiete', 'nebenkosten', 'warmmiete', 'kaution'] as const).map((k) => (
                <div key={k} className="rounded-2xl border border-line bg-sunken p-3">
                  <dt className="font-semibold text-ink">
                    <Link to={`/glossary/${k}`} className="hover:underline" translate="no">
                      {t(`aptView.costs.${k}.term`)}
                    </Link>
                  </dt>
                  <dd className="mt-1 text-sm text-muted">{t(`aptView.costs.${k}.text`)}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section aria-labelledby="av-ask-h">
            <h2 id="av-ask-h" className="font-display text-xl font-semibold text-ink">
              {t('aptView.ask.title')}
            </h2>
            <p className="mt-1 text-sm text-muted">{t('aptView.ask.text')}</p>
            <ol className="mt-4 grid gap-3 md:grid-cols-3">
              {(['A', 'B', 'C'] as const).map((s) => (
                <li key={s} className="rounded-3xl border border-line bg-card p-4">
                  <p className="font-semibold text-ink">{t(`aptView.stages.${s}.title`)}</p>
                  <ul className="mt-2 space-y-1.5 text-sm text-ink">
                    {list(`aptView.stages.${s}.items`).map((x) => (
                      <li key={x} className="flex gap-2">
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success-fg" aria-hidden /> {x}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="rounded-3xl border border-danger-border bg-danger-bg p-4 text-danger-fg">
                <p className="flex items-center gap-2 font-semibold">
                  <Ban className="size-5" aria-hidden /> {t('aptView.notAllowed.title')}
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                  {list('aptView.notAllowed.items').map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
                <p className="mt-2 text-xs">{t('aptView.notAllowed.agg')}</p>
              </div>
              <div className="rounded-3xl border border-warning-border bg-warning-bg p-4 text-warning-fg">
                <p className="flex items-center gap-2 font-semibold">
                  <AlertTriangle className="size-5" aria-hidden /> {t('aptView.scams.title')}
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                  {list('aptView.scams.items').map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </div>
            </div>
          </section>

          <Generator />

          <section aria-labelledby="av-check-h" className="rounded-3xl border border-line bg-card p-5 sm:p-6">
            <h2 id="av-check-h" className="flex items-center gap-2 font-display text-xl font-semibold text-ink">
              <ClipboardList className="size-5 text-primary" aria-hidden /> {t('aptView.checklist.title')}
            </h2>
            <ul className="mt-3 space-y-3">
              {(['payslips', 'contract', 'bonityCheck', 'id', 'rentClearance', 'wbs'] as const).map((k) => (
                <li key={k} className="rounded-2xl border border-line bg-sunken p-3">
                  <p className="font-semibold text-ink">{t(`aptView.checklist.items.${k}.title`)}</p>
                  <p className="mt-0.5 text-sm text-muted">{t(`aptView.checklist.items.${k}.text`)}</p>
                </li>
              ))}
            </ul>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-line p-3">
                <p className="font-semibold text-ink">{t('aptView.schufa.freeTitle')}</p>
                <p className="mt-1 text-sm text-muted">{t('aptView.schufa.free')}</p>
              </div>
              <div className="rounded-2xl border border-line p-3">
                <p className="font-semibold text-ink">{t('aptView.schufa.paidTitle')}</p>
                <p className="mt-1 text-sm text-muted">{t('aptView.schufa.paid')}</p>
              </div>
            </div>
          </section>

          <GlossaryLinks
            terms={[
              { slug: 'wohnungsbesichtigung', label: 'Wohnungsbesichtigung' },
              { slug: 'kaltmiete', label: 'Kaltmiete' },
              { slug: 'warmmiete', label: 'Warmmiete' },
              { slug: 'nebenkosten', label: 'Nebenkosten' },
              { slug: 'kaution', label: 'Kaution' },
              { slug: 'schufa', label: 'SCHUFA' },
              { slug: 'mietschuldenfreiheitsbescheinigung', label: 'Mietschuldenfreiheitsbescheinigung' },
              { slug: 'ruhezeiten', label: 'Ruhezeiten' },
              { slug: 'hausverwaltung', label: 'Hausverwaltung' },
              { slug: 'mietvertrag', label: 'Mietvertrag' },
            ]}
          />
          <div className="flex flex-wrap gap-2 text-sm">
            <Link to="/rent-check" className={buttonClass({ variant: 'outline', size: 'sm' })}>
              {t('aptView.links.rentCheck')}
            </Link>
            <Link to="/german-apartment" className={buttonClass({ variant: 'outline', size: 'sm' })}>
              {t('aptView.links.apartment')}
            </Link>
            <Link to="/german-simulator" className={buttonClass({ variant: 'outline', size: 'sm' })}>
              {t('aptView.links.simulator')}
            </Link>
          </div>
          <Sources checked={DISCLOSURE_AS_OF} items={DISCLOSURE_SOURCES} />
          <Disclaimer>{t('aptView.disclaimer')}</Disclaimer>
        </div>
      </section>
      <ToolFaq items={faq} />
      <RelatedGuides tool={PATH} />
    </>
  );
}
