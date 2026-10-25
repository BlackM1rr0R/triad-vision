import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { toast } from 'sonner';
import { ExternalLink, Package, Pencil, Plus, RefreshCw, Send, ShoppingCart, Trash2, Ban, X } from 'lucide-react';
import { api, errorCode } from '@/lib/api';
import i18n, { registerCopy } from '@/i18n';
import { pagesPackages } from '@/i18n/pagesPackages';
import { pagesBilling } from '@/i18n/pagesBilling';
import { Chip, EmptyState, ErrorBlock, LoadingBlock, PageHead, Switch } from '@/components/admin/ui';
import { Tabs } from '@/components/ui/Tabs';
import { Modal } from '@/components/admin/Modal';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { Spinner } from '@/components/ui/Spinner';
import { L10nInput, L10nListInput, LANGS, emptyL10n, emptyL10nList } from '@/components/admin/L10nInput';
import { errorMessage, fmtDate } from '@/components/admin/labels';
import { useNewParam } from '@/components/command/useNewParam';
import { CURRENCIES, TRIGGER_STATUSES, centsToInput, fmtEur, parseEuro, triggerLabel, type Currency } from '@/components/billing/api';
import type { L10n, L10nList } from '@/lib/types';

registerCopy(pagesPackages);
registerCopy(pagesBilling);

const TIERS = ['BASIC', 'STANDARD', 'PREMIUM'] as const;
const VISA_TYPES = ['WORK', 'AUSBILDUNG', 'WEITERBILDUNG', 'JOB_SEEKER', 'STUDY', 'FAMILY', 'TOURIST'] as const;
const PKG_TRIGGERS = ['ON_SIGN', ...TRIGGER_STATUSES.map((s) => `CASE_STATUS:${s}`)];

interface Pkg {
  id: string;
  slug: string;
  tier: (typeof TIERS)[number];
  visaTypes: string[] | null;
  title: L10n;
  summary: L10n;
  features: L10nList;
  priceCents: number;
  /** Base currency of priceCents. */
  currency: string;
  /** Base + optional fixed prices in other currencies. */
  prices?: Partial<Record<Currency, number>>;
  installments: { label: L10n; percent: number; trigger: string }[];
  contractTemplateId: string | null;
  highlight: boolean;
  published: boolean;
  sortOrder: number;
  orders: number;
}
interface Tpl {
  id: string;
  name: string;
  language: string;
  active: boolean;
  isDefault: boolean;
}
interface Order {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  priceCents: number;
  currency: string;
  status: 'STARTED' | 'SIGNED' | 'ACTIVE' | 'CANCELLED';
  signatureStatus: string | null;
  countersignPending?: boolean;
  caseId: string | null;
  caseNumber: string | null;
  createdAt: string;
  package: { title: L10n; tier: string } | null;
}

const KEY = ['admin-packages'] as const;
const errText = (err: unknown) => {
  const code = errorCode(err);
  return i18n.exists(`apkg.errors.${code}`) ? i18n.t(`apkg.errors.${code}`) : errorMessage(err, i18n.t('apkg.errors.default'));
};
const ORDER_TONE: Record<Order['status'], string> = { STARTED: 'bg-warning-bg text-warning-fg', SIGNED: 'bg-info-bg text-info-fg', ACTIVE: 'bg-success-bg text-success-fg', CANCELLED: 'bg-neutral-bg text-neutral-fg' };

/** Admin → Paketlər: service packages (CMS) and their online orders. */
export default function AdminPackages() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'orders' ? 'orders' : 'packages';
  const [editing, setEditing] = useState<Pkg | 'new' | null>(null);
  useNewParam(() => setEditing('new'));
  const q = useQuery({ queryKey: KEY, queryFn: async () => (await api.get<{ packages: Pkg[]; templates: Tpl[] }>('/admin/packages')).data });
  return (
    <div>
      <PageHead
        title={t('admin.nav.packages')}
        subtitle={t('apkg.subtitle')}
        actions={
          <div className="flex gap-2">
            <Link to="/packages" target="_blank" rel="noopener" className="btn-secondary btn-sm">
              <ExternalLink className="size-3.5" aria-hidden /> {t('apkg.view')}
            </Link>
            {tab === 'packages' && (
              <button type="button" className="btn-primary btn-sm" onClick={() => setEditing('new')}>
                <Plus className="size-4" aria-hidden /> {t('apkg.create')}
              </button>
            )}
          </div>
        }
      />
      <Tabs
        className="mb-5"
        label={t('apkg.tabs.packages')}
        items={(['packages', 'orders'] as const).map((k) => ({ key: k, icon: k === 'packages' ? Package : ShoppingCart, label: t(`apkg.tabs.${k}`) }))}
        value={tab}
        onChange={(k) => {
          const next = new URLSearchParams(params);
          if (k === 'orders') next.set('tab', 'orders');
          else next.delete('tab');
          setParams(next, { replace: true });
        }}
      />
      {tab === 'packages' ? (
        q.isLoading ? (
          <LoadingBlock />
        ) : q.error || !q.data ? (
          <ErrorBlock error={q.error} onRetry={() => q.refetch()} />
        ) : (
          <PackageList packages={q.data.packages} onEdit={setEditing} />
        )
      ) : (
        <Orders />
      )}
      {editing && q.data && <Editor pkg={editing === 'new' ? null : editing} templates={q.data.templates} onClose={() => setEditing(null)} />}
    </div>
  );
}

const PackageList = ({ packages, onEdit }: { packages: Pkg[]; onEdit: (p: Pkg) => void }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [del, setDel] = useState<Pkg | null>(null);
  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`/admin/packages/${id}`),
    onSuccess: () => {
      toast.success(t('apkg.toasts.deleted'));
      setDel(null);
      void qc.invalidateQueries({ queryKey: KEY });
    },
    onError: (e) => toast.error(errText(e)),
  });
  if (!packages.length)
    return (
      <div className="rounded-xl border border-line bg-card">
        <EmptyState icon={Package} title={t('apkg.empty')}>
          {t('apkg.emptyText')}
        </EmptyState>
      </div>
    );
  return (
    <>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {packages.map((p) => (
          <article key={p.id} className={clsx('rounded-xl border bg-card p-5', p.highlight ? 'border-line-strong' : 'border-line')}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="badge bg-primary/10 text-link">{t(`apkg.tier.${p.tier}`)}</span>
              <span className={clsx('badge', p.published ? 'bg-success-bg text-success-fg' : 'bg-neutral-bg text-neutral-fg')}>{p.published ? t('apkg.published') : t('apkg.draft')}</span>
              {p.highlight && <span className="badge bg-accent-bg text-accent-fg">{t('apkg.highlight')}</span>}
            </div>
            <h2 className="mt-2 font-display text-lg font-bold text-ink">{p.title.az || p.title.de || p.slug}</h2>
            <p className="text-xs text-muted">/{p.slug}</p>
            <p className="mt-2 font-display text-2xl font-bold text-ink">{fmtEur(p.priceCents, p.currency)}</p>
            {Object.entries(p.prices ?? {})
              .filter(([c]) => c !== p.currency)
              .map(([c, v]) => (
                <p key={c} className="text-xs text-muted tabular-nums">
                  {fmtEur(v ?? 0, c)}
                </p>
              ))}
            <p className="mt-1 text-xs text-muted">{p.visaTypes?.length ? p.visaTypes.map((v) => t(`pkgs.visaType.${v}`)).join(', ') : t('apkg.allVisas')}</p>
            {p.installments.length > 0 && <p className="mt-1 text-xs text-muted">{p.installments.map((i) => `${i.percent} %`).join(' / ')}</p>}
            <p className="mt-1 text-xs text-muted">{t('apkg.orders', { count: p.orders })}</p>
            <div className="mt-4 flex gap-2">
              <button type="button" className="btn-secondary btn-sm" onClick={() => onEdit(p)}>
                <Pencil className="size-3.5" aria-hidden /> {t('apkg.edit')}
              </button>
              {p.orders === 0 && (
                <button type="button" className="btn-secondary btn-sm text-danger-fg" onClick={() => setDel(p)}>
                  <Trash2 className="size-3.5" aria-hidden /> {t('apkg.delete')}
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} onConfirm={() => del && remove.mutate(del.id)} loading={remove.isPending} title={t('apkg.confirmDelete')} message={t('apkg.confirmDeleteText')} confirmLabel={t('apkg.delete')} />
    </>
  );
};

interface InstDraft {
  key: number;
  label: L10n;
  percent: string;
  trigger: string;
}
let instSeq = 0;

const Editor = ({ pkg, templates, onClose }: { pkg: Pkg | null; templates: Tpl[]; onClose: () => void }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [slug, setSlug] = useState(pkg?.slug ?? '');
  const [tier, setTier] = useState<Pkg['tier']>(pkg?.tier ?? 'STANDARD');
  const [title, setTitle] = useState<L10n>(pkg?.title ?? emptyL10n());
  const [summary, setSummary] = useState<L10n>(pkg?.summary ?? emptyL10n());
  const [features, setFeatures] = useState<L10nList>(pkg?.features ?? emptyL10nList());
  const [price, setPrice] = useState(pkg ? centsToInput(pkg.priceCents) : '');
  const [baseCurrency, setBaseCurrency] = useState<Currency>((pkg?.currency as Currency | undefined) ?? 'EUR');
  const [extra, setExtra] = useState<Partial<Record<Currency, string>>>(() =>
    Object.fromEntries(Object.entries(pkg?.prices ?? {}).filter(([c]) => c !== (pkg?.currency ?? 'EUR')).map(([c, v]) => [c, centsToInput(v ?? 0)])),
  );
  const extraCents = Object.fromEntries(CURRENCIES.filter((c) => c !== baseCurrency).map((c) => [c, extra[c]?.trim() ? parseEuro(extra[c]!) : null])) as Partial<Record<Currency, number | null>>;
  const extraValid = Object.values(extraCents).every((v) => v === null || v === undefined || (Number.isFinite(v) && v >= 100));
  const [visaTypes, setVisaTypes] = useState<string[]>(pkg?.visaTypes ?? []);
  const [insts, setInsts] = useState<InstDraft[]>(() => (pkg?.installments ?? []).map((i) => ({ key: ++instSeq, label: i.label, percent: String(i.percent), trigger: i.trigger })));
  const [templateId, setTemplateId] = useState(pkg?.contractTemplateId ?? '');
  const [highlight, setHighlight] = useState(pkg?.highlight ?? false);
  const [published, setPublished] = useState(pkg?.published ?? false);
  const [sortOrder, setSortOrder] = useState(String(pkg?.sortOrder ?? 0));
  const cents = parseEuro(price);
  const sum = insts.reduce((a, i) => a + (Number(i.percent) || 0), 0);
  const valid = /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) && !!(title.az || title.de || title.en || title.ru) && Number.isFinite(cents) && cents >= 100 && extraValid && (insts.length === 0 || Math.round(sum) === 100);
  const setInst = (key: number, patch: Partial<InstDraft>) => setInsts((xs) => xs.map((x) => (x.key === key ? { ...x, ...patch } : x)));

  const save = useMutation({
    mutationFn: async () => {
      const body = {
        slug,
        tier,
        visaTypes: visaTypes.length ? visaTypes : null,
        title,
        summary,
        features,
        priceCents: cents,
        currency: baseCurrency,
        prices: Object.fromEntries(Object.entries(extraCents).filter(([, v]) => v !== null && v !== undefined)),
        installments: insts.length ? insts.map((i) => ({ label: i.label, percent: Number(i.percent), trigger: i.trigger })) : null,
        contractTemplateId: templateId || null,
        highlight,
        published,
        sortOrder: Number(sortOrder) || 0,
      };
      return pkg ? api.put(`/admin/packages/${pkg.id}`, body) : api.post('/admin/packages', body);
    },
    onSuccess: () => {
      toast.success(t('apkg.toasts.saved'));
      void qc.invalidateQueries({ queryKey: KEY });
      onClose();
    },
    onError: (e) => toast.error(errText(e)),
  });

  return (
    <Modal
      open
      size="xl"
      mobile="full"
      onClose={() => !save.isPending && onClose()}
      title={pkg ? t('apkg.editor.editTitle') : t('apkg.editor.newTitle')}
      footer={
        <>
          {!valid && <span className="mr-auto self-center text-xs text-muted">{t('apkg.editor.invalid')}</span>}
          <button type="button" className="btn-secondary btn-sm" onClick={onClose} disabled={save.isPending}>
            {t('apkg.editor.close')}
          </button>
          <button type="button" className="btn-primary btn-sm" disabled={!valid || save.isPending} onClick={() => save.mutate()}>
            {save.isPending && <Spinner className="size-3.5" />}
            {t('apkg.editor.save')}
          </button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-4">
        <div className="sm:col-span-2">
          <label className="label" htmlFor="pk-slug">
            {t('apkg.editor.slug')} *
          </label>
          <input id="pk-slug" className="input font-mono" maxLength={120} value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} />
        </div>
        <div>
          <label className="label" htmlFor="pk-tier">
            {t('apkg.editor.tier')}
          </label>
          <select id="pk-tier" className="input" value={tier} onChange={(e) => setTier(e.target.value as Pkg['tier'])}>
            {TIERS.map((x) => (
              <option key={x} value={x}>
                {t(`apkg.tier.${x}`)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="pk-price">
            {t('apkg.editor.price')} *
          </label>
          <div className="flex gap-1.5">
            <input id="pk-price" className="input min-w-0 flex-1 text-right tabular-nums" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
            <select className="input w-20" aria-label={t('acct.pkg.baseCurrency')} value={baseCurrency} onChange={(e) => setBaseCurrency(e.target.value as Currency)}>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>
        <fieldset className="sm:col-span-4">
          <legend className="label">{t('acct.pkg.prices')}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {CURRENCIES.filter((c) => c !== baseCurrency).map((c) => (
              <label key={c} className="flex items-center gap-2">
                <span className="w-12 text-sm font-semibold text-ink">{c}</span>
                <input className="input text-right tabular-nums" inputMode="decimal" placeholder="—" value={extra[c] ?? ''} onChange={(e) => setExtra((x) => ({ ...x, [c]: e.target.value }))} />
              </label>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-muted">{t('acct.pkg.pricesHint')}</p>
        </fieldset>
        <div className="sm:col-span-4">
          <L10nInput label={t('apkg.editor.title')} value={title} onChange={setTitle} required />
        </div>
        <div className="sm:col-span-4">
          <L10nInput label={t('apkg.editor.summary')} value={summary} onChange={setSummary} multiline rows={3} />
        </div>
        <div className="sm:col-span-4">
          <L10nListInput label={t('apkg.editor.features')} value={features} onChange={setFeatures} />
        </div>
        <fieldset className="sm:col-span-4">
          <legend className="label">{t('apkg.editor.visaTypes')}</legend>
          <div className="flex flex-wrap gap-1.5">
            {VISA_TYPES.map((v) => (
              <Chip key={v} active={visaTypes.includes(v)} onClick={() => setVisaTypes((xs) => (xs.includes(v) ? xs.filter((x) => x !== v) : [...xs, v]))}>
                {t(`pkgs.visaType.${v}`)}
              </Chip>
            ))}
          </div>
        </fieldset>
        <fieldset className="sm:col-span-4">
          <legend className="label">{t('apkg.editor.installments')}</legend>
          <p className="mb-2 text-xs text-muted">{t('apkg.editor.installmentsHint')}</p>
          <ul className="space-y-2">
            {insts.map((i) => (
              <li key={i.key} className="rounded-xl border border-line p-2.5">
                <div className="grid gap-2 sm:grid-cols-[6rem_minmax(0,1fr)_auto]">
                  <input className="input text-right" inputMode="decimal" aria-label={t('apkg.editor.percent')} placeholder="%" value={i.percent} onChange={(e) => setInst(i.key, { percent: e.target.value })} />
                  <select className="input" aria-label={t('apkg.editor.trigger')} value={i.trigger} onChange={(e) => setInst(i.key, { trigger: e.target.value })}>
                    {PKG_TRIGGERS.map((tr) => (
                      <option key={tr} value={tr}>
                        {triggerLabel(tr)}
                      </option>
                    ))}
                  </select>
                  <button type="button" className="grid size-9 place-items-center rounded-lg text-muted hover:bg-danger-bg hover:text-danger-fg" aria-label={t('apkg.editor.removeInst')} onClick={() => setInsts((xs) => xs.filter((x) => x.key !== i.key))}>
                    <X className="size-4" aria-hidden />
                  </button>
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-4">
                  {LANGS.map((l) => (
                    <input key={l} className="input" maxLength={160} aria-label={t('apkg.editor.label', { lang: l.toUpperCase() })} placeholder={t('apkg.editor.label', { lang: l.toUpperCase() })} value={i.label[l]} onChange={(e) => setInst(i.key, { label: { ...i.label, [l]: e.target.value } })} />
                  ))}
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex items-center justify-between">
            <button type="button" className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-link hover:bg-primary/[0.06]" onClick={() => setInsts((xs) => [...xs, { key: ++instSeq, label: emptyL10n(), percent: '', trigger: 'ON_SIGN' }])}>
              <Plus className="size-4" aria-hidden /> {t('apkg.editor.addInst')}
            </button>
            {insts.length > 0 && <span className={clsx('text-sm font-semibold tabular-nums', Math.round(sum) === 100 ? 'text-success-fg' : 'text-danger-fg')}>{sum} %</span>}
          </div>
        </fieldset>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="pk-tpl">
            {t('apkg.editor.template')}
          </label>
          <select id="pk-tpl" className="input" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            <option value="">{t('apkg.editor.defaultTemplate')}</option>
            {templates.map((x) => (
              <option key={x.id} value={x.id} disabled={!x.active}>
                {x.name} ({x.language.toUpperCase()})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="pk-sort">
            {t('apkg.editor.sortOrder')}
          </label>
          <input id="pk-sort" type="number" className="input" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
        </div>
        <div className="flex flex-col justify-end gap-2">
          <span className="flex items-center justify-between gap-2 text-sm">
            {t('apkg.highlight')} <Switch checked={highlight} onChange={setHighlight} label={t('apkg.highlight')} />
          </span>
          <span className="flex items-center justify-between gap-2 text-sm">
            {t('apkg.published')} <Switch checked={published} onChange={setPublished} label={t('apkg.published')} />
          </span>
        </div>
      </div>
    </Modal>
  );
};

const Orders = () => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [status, setStatus] = useState<Order['status'] | ''>('');
  const q = useQuery({
    queryKey: [...KEY, 'orders', status],
    queryFn: async () => (await api.get<{ orders: Order[]; counts: Record<string, number> }>('/admin/packages/orders/list', { params: { status: status || undefined } })).data,
  });
  const act = useMutation({
    mutationFn: async (a: { kind: 'remind' | 'retry' | 'cancel'; id: string }) => api.post(`/admin/packages/orders/${a.id}/${a.kind}`),
    onSuccess: (_d, a) => {
      toast.success(t(`apkg.toasts.${a.kind === 'remind' ? 'reminded' : a.kind === 'retry' ? 'retried' : 'cancelled'}`));
      void qc.invalidateQueries({ queryKey: KEY });
    },
    onError: (e) => toast.error(errText(e)),
  });
  return (
    <>
      <div className="mb-4 flex flex-wrap gap-1.5">
        <Chip active={!status} onClick={() => setStatus('')}>
          {t('bill.admin.all')}
        </Chip>
        {(['STARTED', 'SIGNED', 'ACTIVE', 'CANCELLED'] as const).map((s) => (
          <Chip key={s} active={status === s} count={q.data?.counts[s] ?? 0} onClick={() => setStatus(status === s ? '' : s)}>
            {t(`apkg.orderStatus.${s}`)}
          </Chip>
        ))}
      </div>
      {q.isLoading ? (
        <LoadingBlock />
      ) : q.error || !q.data ? (
        <ErrorBlock error={q.error} onRetry={() => q.refetch()} />
      ) : !q.data.orders.length ? (
        <div className="rounded-xl border border-line bg-card">
          <EmptyState icon={ShoppingCart} title={t('apkg.noOrders')} />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-card">
          <table className="w-full min-w-[44rem] text-sm">
            <thead className="bg-sunken text-left text-xs text-muted">
              <tr>
                {(['date', 'client', 'pkg', 'price', 'status', 'signature', 'case'] as const).map((c) => (
                  <th key={c} className="px-4 py-2.5 font-semibold">
                    {t(`apkg.ordersCols.${c}`)}
                  </th>
                ))}
                <th className="px-4 py-2.5">
                  <span className="sr-only">{t('bill.admin.more')}</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {q.data.orders.map((o) => (
                <tr key={o.id}>
                  <td className="px-4 py-3 text-muted">{fmtDate(o.createdAt)}</td>
                  <td className="px-4 py-3">
                    <span className="block font-medium text-ink">{o.name}</span>
                    <span className="text-xs text-muted">{o.email}</span>
                  </td>
                  <td className="px-4 py-3">{o.package ? `${o.package.title.az || o.package.title.de} (${o.package.tier})` : '—'}</td>
                  <td className="px-4 py-3 tabular-nums">{fmtEur(o.priceCents, o.currency)}</td>
                  <td className="px-4 py-3">
                    <span className={clsx('badge', ORDER_TONE[o.status])}>{t(`apkg.orderStatus.${o.status}`)}</span>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {o.signatureStatus ? t(`apkg.sigStatus.${o.signatureStatus}`, { defaultValue: o.signatureStatus }) : '—'}
                    {o.countersignPending && <span className="mt-0.5 block font-semibold text-warning-fg">{t('today.kind.countersign')}</span>}
                  </td>
                  <td className="px-4 py-3">
                    {o.caseId ? (
                      <Link to={`/admin/cases/${o.caseId}?tab=finance`} className="text-link hover:underline">
                        {o.caseNumber}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1">
                      {o.status === 'STARTED' && o.signatureStatus === 'SENT' && (
                        <button type="button" className="grid size-9 place-items-center rounded-lg border border-line hover:bg-sunken" title={t('apkg.remind')} aria-label={t('apkg.remind')} onClick={() => act.mutate({ kind: 'remind', id: o.id })}>
                          <Send className="size-4" aria-hidden />
                        </button>
                      )}
                      {o.status === 'SIGNED' && (
                        <button type="button" className="grid size-9 place-items-center rounded-lg border border-line hover:bg-sunken" title={t('apkg.retry')} aria-label={t('apkg.retry')} onClick={() => act.mutate({ kind: 'retry', id: o.id })}>
                          <RefreshCw className="size-4" aria-hidden />
                        </button>
                      )}
                      {o.status === 'STARTED' && (
                        <button type="button" className="grid size-9 place-items-center rounded-lg border border-line text-danger-fg hover:bg-danger-bg" title={t('apkg.cancelOrder')} aria-label={t('apkg.cancelOrder')} onClick={() => act.mutate({ kind: 'cancel', id: o.id })}>
                          <Ban className="size-4" aria-hidden />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
};
