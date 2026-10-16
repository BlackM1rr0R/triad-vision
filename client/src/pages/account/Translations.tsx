import { useMemo, useState, type ReactNode } from 'react';
import { Link, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Ban,
  Check,
  FileCheck2,
  FileText,
  FolderOpen,
  Info,
  Languages,
  Mail,
  MapPin,
  Plus,
  Stamp,
  Store,
  Truck,
  Zap,
} from 'lucide-react';
import { api, formatBytes } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesTranslations } from '@/i18n/pagesTranslations';
import { usePageTitle } from '@/lib/usePageTitle';
import { useRealtime } from '@/lib/realtime';
import { PageLoader, Spinner } from '@/components/ui/Spinner';
import { ConfirmDialog } from '@/components/portal/ConfirmDialog';
import { MultiFileDrop } from '@/components/translations/MultiFileDrop';
import {
  DELIVERIES,
  SERVICES,
  TrFileRow,
  TrStatusPill,
  TrStepper,
  useTrError,
  useTrFormat,
  type TrClientOrder,
  type TrDelivery,
  type TrPricing,
  type TrService,
  type TrUrgency,
} from '@/components/translations/shared';

registerCopy(pagesTranslations);

const LIST_KEY = ['translations'] as const;
const orderKeyQ = (id: string) => ['translations', id] as const;

const SERVICE_ICON: Record<TrService, typeof Languages> = { TRANSLATION: Languages, APOSTILLE: Stamp, TRANSLATION_APOSTILLE: FileCheck2, NOTARY: BadgeCheck };
const DELIVERY_ICON: Record<TrDelivery, typeof Mail> = { DIGITAL: Mail, PICKUP: Store, COURIER: Truck };

const usePricing = () =>
  useQuery({ queryKey: ['translations', 'pricing'], queryFn: async () => (await api.get<{ pricing: TrPricing }>('/translations/pricing')).data.pricing, staleTime: 5 * 60_000 });

/** Refetch the order list / detail when a translation notification arrives. */
const useLiveOrders = () => {
  const qc = useQueryClient();
  useRealtime('notification', (p) => {
    if (typeof p.type === 'string' && p.type.startsWith('TRANSLATION_')) void qc.invalidateQueries({ queryKey: LIST_KEY });
  });
};

const uploadFiles = async (orderId: string, files: File[], onProgress?: (p: number) => void) => {
  const form = new FormData();
  files.forEach((f) => form.append('file', f));
  return (
    await api.post<{ order: TrClientOrder }>(`/translations/${orderId}/files`, form, {
      onUploadProgress: (e) => onProgress?.(e.total ? e.loaded / e.total : 0),
    })
  ).data.order;
};

const estimateOf = (p: TrPricing | undefined, service: TrService, pages: number, urgency: TrUrgency) => {
  if (!p) return null;
  const base = (p.perPage[service] ?? 0) * Math.max(1, pages || 1);
  const surcharge = urgency === 'EXPRESS' ? Math.round((base * p.expressSurchargePct) / 100) : 0;
  return { base, surcharge, total: base + surcharge };
};

// ─── List ─────────────────────────────────────────────────────────────────

const OrdersList = () => {
  const { t } = useTranslation();
  const f = useTrFormat();
  useLiveOrders();
  const { data, isLoading } = useQuery({ queryKey: LIST_KEY, queryFn: async () => (await api.get<{ items: TrClientOrder[] }>('/translations')).data.items });
  if (isLoading) return <PageLoader />;
  const items = data ?? [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-extrabold text-ink sm:text-2xl">{t('trOrders.title')}</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted">{t('trOrders.subtitle')}</p>
        </div>
        <Link to="new" className="btn-primary btn-sm">
          <Plus className="size-4" aria-hidden /> {t('trOrders.newOrder')}
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="card flex flex-col items-center px-6 py-12 text-center">
          <span className="grid size-14 place-items-center rounded-2xl bg-brand-100 text-brand-600">
            <Languages className="size-7" aria-hidden />
          </span>
          <p className="mt-4 text-lg font-bold text-ink">{t('trOrders.empty')}</p>
          <p className="mt-1 max-w-md text-sm text-muted">{t('trOrders.emptyHint')}</p>
          <Link to="new" className="btn-primary mt-5">
            <Plus className="size-4" aria-hidden /> {t('trOrders.newOrder')}
          </Link>
        </div>
      ) : (
        <ul className="grid gap-3">
          {items.map((o) => {
            const Icon = SERVICE_ICON[o.service];
            return (
              <li key={o.id}>
                <Link to={o.id} className="card block p-4 transition hover:border-brand-400/60 sm:p-5">
                  <div className="flex items-start gap-3">
                    <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-100 text-brand-600">
                      <Icon className="size-5" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-ink">{t(`trOrders.service.${o.service}`)}</span>
                        <span className="text-xs font-semibold text-muted tabular-nums">{o.key}</span>
                        <TrStatusPill status={o.status} className="ml-auto" />
                      </div>
                      <p className="mt-1 truncate text-sm text-muted">
                        {f.lang(o.sourceLang)} → {f.lang(o.targetLang)} · {t('trOrders.pagesCount', { count: o.pages })} · {o.documentTypes.map(f.docType).join(', ')}
                      </p>
                      <div className="mt-3">
                        <TrStepper status={o.status} compact reached={o.events.map((e) => e.status).filter((s): s is NonNullable<typeof s> => !!s)} />
                      </div>
                      <p className="mt-2 flex flex-wrap gap-x-4 text-xs text-muted">
                        <span>
                          {t('trOrders.fields.created')}: {f.day(o.createdAt)}
                        </span>
                        {o.priceCents != null && (
                          <span className="font-semibold text-ink">
                            {t('trOrders.fields.price')}: {f.money(o.priceCents, o.currency)}
                          </span>
                        )}
                        {o.dueAt && (
                          <span>
                            {t('trOrders.fields.due')}: {f.day(o.dueAt)}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

// ─── Wizard ───────────────────────────────────────────────────────────────

interface CaseDocs {
  id: string;
  number: string;
  profession: string;
  documents: { id: string; originalName: string; mimeType: string; size: number; createdAt: string }[];
}

const STEP_KEYS = ['service', 'details', 'files', 'delivery', 'summary'] as const;

const Choice = ({ active, onClick, children, className }: { active: boolean; onClick: () => void; children: ReactNode; className?: string }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    className={clsx(
      'relative rounded-xl border p-4 text-left transition focus-visible:ring-4 focus-visible:ring-brand-500/20 focus-visible:outline-none',
      active ? 'border-brand-600 bg-brand-50 ring-2 ring-brand-600/20' : 'border-line bg-card hover:border-brand-400',
      className,
    )}
  >
    {active && (
      <span className="absolute top-3 right-3 grid size-5 place-items-center rounded-full bg-brand-600 text-white">
        <Check className="size-3.5" aria-hidden />
      </span>
    )}
    {children}
  </button>
);

const NewOrderWizard = () => {
  const { t } = useTranslation();
  const f = useTrFormat();
  const onError = useTrError();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: pricing } = usePricing();
  const { data: caseData } = useQuery({
    queryKey: ['translations', 'case-documents'],
    queryFn: async () => (await api.get<{ cases: CaseDocs[] }>('/translations/case-documents')).data.cases,
  });
  usePageTitle(t('trOrders.wizard.title'));

  const [step, setStep] = useState(0);
  const [service, setService] = useState<TrService>('TRANSLATION');
  const [sourceLang, setSourceLang] = useState('az');
  const [targetLang, setTargetLang] = useState('de');
  const [docTypes, setDocTypes] = useState<string[]>([]);
  const [pages, setPages] = useState(1);
  const [urgency, setUrgency] = useState<TrUrgency>('STANDARD');
  const [files, setFiles] = useState<File[]>([]);
  const [caseDocIds, setCaseDocIds] = useState<string[]>([]);
  const [caseId, setCaseId] = useState('');
  const [delivery, setDelivery] = useState<TrDelivery>('DIGITAL');
  const [address, setAddress] = useState('');
  const [note, setNote] = useState('');
  const [progress, setProgress] = useState<number | null>(null);

  const estimate = estimateOf(pricing, service, pages, urgency);
  const distinct = service === 'TRANSLATION' || service === 'TRANSLATION_APOSTILLE';
  const cases = caseData ?? [];
  const casesWithDocs = cases.filter((c) => c.documents.length);
  const allCaseDocs = useMemo(() => cases.flatMap((c) => c.documents), [cases]);

  const problem = (s: number): string | null => {
    if (s === 1) {
      if (distinct && sourceLang === targetLang) return t('trOrders.wizard.sameLanguage');
      if (!docTypes.length) return t('trOrders.wizard.pickDocType');
    }
    if (s === 3 && delivery === 'COURIER' && address.trim().length < 5) return t('trOrders.wizard.addressRequired');
    return null;
  };

  const go = (to: number) => {
    if (to > step) {
      for (let s = step; s < to; s++) {
        const p = problem(s);
        if (p) {
          toast.error(p);
          setStep(s);
          return;
        }
      }
    }
    setStep(to);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const submit = useMutation({
    mutationFn: async () => {
      const linkedCase = caseId || cases.find((c) => c.documents.some((d) => caseDocIds.includes(d.id)))?.id || null;
      const { order } = (
        await api.post<{ order: TrClientOrder }>('/translations', {
          service,
          sourceLang,
          targetLang,
          documentTypes: docTypes,
          pages,
          urgency,
          deliveryMethod: delivery,
          deliveryAddress: delivery === 'COURIER' ? address : null,
          caseId: linkedCase,
          clientNote: note || null,
        })
      ).data;
      let filesOk = true;
      try {
        if (caseDocIds.length) await api.post(`/translations/${order.id}/files/from-case`, { documentIds: caseDocIds });
        if (files.length) {
          setProgress(0);
          await uploadFiles(order.id, files, setProgress);
        }
      } catch {
        filesOk = false;
      } finally {
        setProgress(null);
      }
      return { order, filesOk };
    },
    onSuccess: ({ order, filesOk }) => {
      void qc.invalidateQueries({ queryKey: LIST_KEY });
      if (filesOk) toast.success(t('trOrders.wizard.created', { key: order.key }));
      else toast.warning(t('trOrders.wizard.filesFailed'));
      navigate(`/account/translations/${order.id}`, { replace: true });
    },
    onError,
  });

  if (!pricing) return <PageLoader />;

  const toggleDoc = (code: string) => setDocTypes((d) => (d.includes(code) ? d.filter((x) => x !== code) : [...d, code]));
  const toggleCaseDoc = (id: string) => setCaseDocIds((d) => (d.includes(id) ? d.filter((x) => x !== id) : [...d, id]));

  const summaryRows: [string, ReactNode][] = [
    [t('trOrders.fields.service'), t(`trOrders.service.${service}`)],
    [t('trOrders.fields.languages'), `${f.lang(sourceLang)} → ${f.lang(targetLang)}`],
    [t('trOrders.fields.documentTypes'), docTypes.map(f.docType).join(', ')],
    [t('trOrders.fields.pages'), pages],
    [t('trOrders.fields.urgency'), t(`trOrders.urgency.${urgency}`)],
    [t('trOrders.fields.files'), files.length + caseDocIds.length],
    [t('trOrders.fields.delivery'), `${t(`trOrders.delivery.${delivery}`)}${delivery === 'COURIER' ? ` — ${address}` : ''}`],
    ...(note ? [[t('trOrders.fields.note'), note] as [string, ReactNode]] : []),
  ];

  return (
    <div className="space-y-5">
      <Link to=".." relative="path" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-brand-700">
        <ArrowLeft className="size-4" aria-hidden /> {t('trOrders.backToList')}
      </Link>

      <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
        <section className="card p-5 sm:p-6" aria-labelledby="wizard-title">
          <span className="eyebrow">{t('trOrders.wizard.stepOf', { n: step + 1, total: STEP_KEYS.length })}</span>
          <h2 id="wizard-title" className="mt-1 text-xl font-extrabold text-ink sm:text-2xl">
            {t(`trOrders.wizard.steps.${STEP_KEYS[step]}`)}
          </h2>
          <ol className="mt-4 flex gap-1.5" aria-hidden>
            {STEP_KEYS.map((k, i) => (
              <li key={k} className={clsx('h-1.5 flex-1 rounded-full', i <= step ? 'bg-brand-600' : 'bg-line')} />
            ))}
          </ol>

          <div className="mt-6">
            {step === 0 && (
              <div className="space-y-4">
                <p className="text-sm font-semibold text-ink">{t('trOrders.wizard.chooseService')}</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {SERVICES.map((s) => {
                    const Icon = SERVICE_ICON[s];
                    return (
                      <Choice key={s} active={service === s} onClick={() => setService(s)}>
                        <Icon className="size-6 text-brand-600" aria-hidden />
                        <span className="mt-2 block pr-6 font-bold text-ink">{t(`trOrders.service.${s}`)}</span>
                        <span className="mt-1 block text-sm leading-relaxed text-muted">{t(`trOrders.serviceHelp.${s}`)}</span>
                        <span className="mt-2 block text-xs font-semibold text-brand-700">{t('trOrders.wizard.perPage', { price: f.money(pricing.perPage[s], pricing.currency) })}</span>
                      </Choice>
                    );
                  })}
                </div>
                <aside className="flex gap-3 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sky-900">
                  <Info className="mt-0.5 size-5 shrink-0" aria-hidden />
                  <div>
                    <p className="font-bold">{t('trOrders.apostille.title')}</p>
                    <p className="mt-1 text-sm leading-relaxed">{t('trOrders.apostille.body')}</p>
                  </div>
                </aside>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="label" htmlFor="tr-from">
                      {t('trOrders.fields.from')}
                    </label>
                    <select id="tr-from" className="input" value={sourceLang} onChange={(e) => setSourceLang(e.target.value)}>
                      {pricing.languages.map((l) => (
                        <option key={l} value={l}>
                          {f.lang(l)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label" htmlFor="tr-to">
                      {t('trOrders.fields.to')}
                    </label>
                    <select id="tr-to" className="input" value={targetLang} onChange={(e) => setTargetLang(e.target.value)}>
                      {pricing.languages.map((l) => (
                        <option key={l} value={l}>
                          {f.lang(l)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                {distinct && sourceLang === targetLang && <p className="text-sm font-medium text-danger">{t('trOrders.wizard.sameLanguage')}</p>}

                <fieldset>
                  <legend className="label">{t('trOrders.fields.documentTypes')}</legend>
                  <div className="flex flex-wrap gap-2">
                    {pricing.documentTypes.map((d) => {
                      const on = docTypes.includes(d);
                      return (
                        <button
                          key={d}
                          type="button"
                          aria-pressed={on}
                          onClick={() => toggleDoc(d)}
                          className={clsx(
                            'inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold transition',
                            on ? 'border-brand-600 bg-brand-600 text-white' : 'border-line bg-card text-ink/80 hover:border-brand-400',
                          )}
                        >
                          {on && <Check className="size-3.5" aria-hidden />}
                          {f.docType(d)}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="label" htmlFor="tr-pages">
                      {t('trOrders.fields.pages')}
                    </label>
                    <input
                      id="tr-pages"
                      type="number"
                      min={1}
                      max={200}
                      className="input"
                      value={pages}
                      onChange={(e) => setPages(Math.min(200, Math.max(1, Number(e.target.value) || 1)))}
                    />
                    <p className="mt-1 text-xs text-muted">{t('trOrders.fields.pagesHint')}</p>
                  </div>
                  <fieldset>
                    <legend className="label">{t('trOrders.fields.urgency')}</legend>
                    <div className="grid grid-cols-2 gap-2">
                      {(['STANDARD', 'EXPRESS'] as TrUrgency[]).map((u) => (
                        <Choice key={u} active={urgency === u} onClick={() => setUrgency(u)} className="p-3">
                          <span className="flex items-center gap-1.5 pr-5 text-sm font-bold text-ink">
                            {u === 'EXPRESS' && <Zap className="size-4 text-amber-500" aria-hidden />}
                            {t(`trOrders.urgency.${u}`)}
                          </span>
                          <span className="mt-0.5 block text-xs text-muted">{t(`trOrders.urgencyHelp.${u}`)}</span>
                        </Choice>
                      ))}
                    </div>
                  </fieldset>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-5">
                <div>
                  <p className="font-semibold text-ink">{t('trOrders.wizard.filesTitle')}</p>
                  <p className="mt-1 text-sm text-muted">{t('trOrders.wizard.filesHint')}</p>
                </div>
                <MultiFileDrop onFiles={(list) => setFiles((cur) => [...cur, ...list].slice(0, 20))} progress={progress} />
                {files.length > 0 && (
                  <ul className="space-y-2">
                    {files.map((file, i) => (
                      <li key={`${file.name}-${i}`} className="flex items-center gap-3 rounded-xl border border-line bg-surface/60 px-3 py-2">
                        <FileText className="size-4 shrink-0 text-brand-600" aria-hidden />
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{file.name}</span>
                        <span className="text-xs text-muted">{formatBytes(file.size)}</span>
                        <button type="button" className="text-xs font-semibold text-danger hover:underline" onClick={() => setFiles((cur) => cur.filter((_, j) => j !== i))}>
                          {t('trOrders.detail.remove')}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="rounded-xl border border-line p-4">
                  <p className="flex items-center gap-2 font-semibold text-ink">
                    <FolderOpen className="size-4 text-brand-600" aria-hidden /> {t('trOrders.wizard.fromCase')}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">{t('trOrders.wizard.fromCaseHint')}</p>
                  {casesWithDocs.length === 0 ? (
                    <p className="mt-3 text-sm text-muted">{t('trOrders.wizard.noCaseDocs')}</p>
                  ) : (
                    <div className="mt-3 space-y-3">
                      {casesWithDocs.map((c) => (
                        <div key={c.id}>
                          <p className="text-xs font-bold tracking-wide text-muted uppercase">
                            {c.number} · {c.profession}
                          </p>
                          <ul className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
                            {c.documents.map((d) => {
                              const on = caseDocIds.includes(d.id);
                              return (
                                <li key={d.id}>
                                  <label className={clsx('flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-sm transition', on ? 'border-brand-600 bg-brand-50' : 'border-line hover:border-brand-400')}>
                                    <input type="checkbox" className="size-4 accent-brand-600" checked={on} onChange={() => toggleCaseDoc(d.id)} />
                                    <span className="min-w-0 flex-1 truncate text-ink">{d.originalName}</span>
                                  </label>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      ))}
                      {caseDocIds.length > 0 && <p className="text-xs font-semibold text-brand-700">{t('trOrders.wizard.selected', { count: caseDocIds.length })}</p>}
                    </div>
                  )}
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-5">
                <div className="grid gap-3 sm:grid-cols-3">
                  {DELIVERIES.map((d) => {
                    const Icon = DELIVERY_ICON[d];
                    return (
                      <Choice key={d} active={delivery === d} onClick={() => setDelivery(d)}>
                        <Icon className="size-5 text-brand-600" aria-hidden />
                        <span className="mt-2 block pr-5 font-bold text-ink">{t(`trOrders.delivery.${d}`)}</span>
                        <span className="mt-1 block text-xs leading-relaxed text-muted">{t(`trOrders.deliveryHelp.${d}`)}</span>
                      </Choice>
                    );
                  })}
                </div>
                {delivery === 'COURIER' && (
                  <div>
                    <label className="label" htmlFor="tr-address">
                      {t('trOrders.fields.address')}
                    </label>
                    <textarea id="tr-address" rows={2} maxLength={300} className="input" placeholder={t('trOrders.fields.addressPlaceholder')} value={address} onChange={(e) => setAddress(e.target.value)} />
                  </div>
                )}
                {cases.length > 0 && (
                  <div>
                    <label className="label" htmlFor="tr-case">
                      {t('trOrders.fields.case')}
                    </label>
                    <select id="tr-case" className="input" value={caseId} onChange={(e) => setCaseId(e.target.value)}>
                      <option value="">{t('trOrders.fields.noCase')}</option>
                      {cases.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.number} · {c.profession}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <label className="label" htmlFor="tr-note">
                    {t('trOrders.fields.note')} <span className="font-normal text-muted">({t('common.optional')})</span>
                  </label>
                  <textarea id="tr-note" rows={3} maxLength={2000} className="input" placeholder={t('trOrders.fields.notePlaceholder')} value={note} onChange={(e) => setNote(e.target.value)} />
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-4">
                <p className="font-semibold text-ink">{t('trOrders.wizard.summaryTitle')}</p>
                <dl className="divide-y divide-line rounded-xl border border-line">
                  {summaryRows.map(([k, v]) => (
                    <div key={k} className="grid gap-1 px-4 py-2.5 text-sm sm:grid-cols-[180px_1fr]">
                      <dt className="text-muted">{k}</dt>
                      <dd className="font-medium break-words text-ink">{v}</dd>
                    </div>
                  ))}
                </dl>
                {allCaseDocs.length > 0 && caseDocIds.length > 0 && (
                  <p className="text-xs text-muted">
                    {allCaseDocs
                      .filter((d) => caseDocIds.includes(d.id))
                      .map((d) => d.originalName)
                      .join(', ')}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
            <button type="button" className={clsx('btn-ghost btn-sm', step === 0 && 'invisible')} onClick={() => go(step - 1)} disabled={submit.isPending}>
              <ArrowLeft className="size-4" aria-hidden /> {t('trOrders.wizard.back')}
            </button>
            {step < STEP_KEYS.length - 1 ? (
              <button type="button" className="btn-primary btn-sm" onClick={() => go(step + 1)}>
                {t('trOrders.wizard.next')} <ArrowRight className="size-4" aria-hidden />
              </button>
            ) : (
              <button type="button" className="btn-primary btn-sm" onClick={() => submit.mutate()} disabled={submit.isPending}>
                {submit.isPending ? <Spinner className="size-4" /> : <Check className="size-4" aria-hidden />} {t('trOrders.wizard.submit')}
              </button>
            )}
          </div>
        </section>

        <aside className="lg:sticky lg:top-28 lg:self-start">
          <div className="card p-5">
            <p className="eyebrow">{t('trOrders.fields.estimate')}</p>
            <p className="mt-2 text-3xl font-extrabold text-ink tabular-nums" aria-live="polite">
              {estimate ? f.money(estimate.total, pricing.currency) : '—'}
            </p>
            <ul className="mt-3 space-y-1 text-sm text-muted">
              <li>
                {t(`trOrders.service.${service}`)} · {t('trOrders.pagesCount', { count: pages })}
              </li>
              <li>{t('trOrders.wizard.perPage', { price: f.money(pricing.perPage[service], pricing.currency) })}</li>
              {urgency === 'EXPRESS' && <li className="font-semibold text-amber-700">{t('trOrders.wizard.surcharge', { pct: pricing.expressSurchargePct })}</li>}
            </ul>
            <p className="mt-4 rounded-lg bg-surface p-3 text-xs leading-relaxed text-muted">{t('trOrders.wizard.estimateHint')}</p>
          </div>
          <nav className="mt-3 hidden lg:block" aria-label={t('trOrders.wizard.title')}>
            <ol className="space-y-1">
              {STEP_KEYS.map((k, i) => (
                <li key={k}>
                  <button
                    type="button"
                    onClick={() => go(i)}
                    className={clsx('flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold transition', i === step ? 'bg-card text-brand-700 shadow-sm' : 'text-muted hover:text-ink')}
                    aria-current={i === step ? 'step' : undefined}
                  >
                    <span className={clsx('grid size-6 place-items-center rounded-full text-xs', i < step ? 'bg-brand-600 text-white' : i === step ? 'bg-brand-100 text-brand-700' : 'bg-line text-muted')}>
                      {i < step ? <Check className="size-3.5" aria-hidden /> : i + 1}
                    </span>
                    {t(`trOrders.wizard.steps.${k}`)}
                  </button>
                </li>
              ))}
            </ol>
          </nav>
        </aside>
      </div>
    </div>
  );
};

// ─── Detail ───────────────────────────────────────────────────────────────

const OrderDetail = () => {
  const { t } = useTranslation();
  const f = useTrFormat();
  const onError = useTrError();
  const { id = '' } = useParams();
  const qc = useQueryClient();
  useLiveOrders();
  const [progress, setProgress] = useState<number | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');

  const { data: order, isLoading, isError } = useQuery({
    queryKey: orderKeyQ(id),
    queryFn: async () => (await api.get<{ order: TrClientOrder }>(`/translations/${id}`)).data.order,
  });
  usePageTitle(order ? t('trOrders.order', { key: order.key }) : t('trOrders.title'));

  const setOrder = (o: TrClientOrder) => {
    qc.setQueryData(orderKeyQ(id), o);
    void qc.invalidateQueries({ queryKey: LIST_KEY, exact: true });
  };

  const upload = useMutation({
    mutationFn: async (files: File[]) => {
      setProgress(0);
      try {
        return await uploadFiles(id, files, setProgress);
      } finally {
        setProgress(null);
      }
    },
    onSuccess: (o) => {
      setOrder(o);
      toast.success(t('trOrders.detail.uploaded'));
    },
    onError,
  });
  const remove = useMutation({
    mutationFn: async (fileId: string) => (await api.delete<{ order: TrClientOrder }>(`/translations/${id}/files/${fileId}`)).data.order,
    onSuccess: (o) => {
      setOrder(o);
      toast.success(t('trOrders.detail.removed'));
    },
    onError,
  });
  const accept = useMutation({
    mutationFn: async () => (await api.post<{ order: TrClientOrder }>(`/translations/${id}/accept`)).data.order,
    onSuccess: (o) => {
      setOrder(o);
      toast.success(t('trOrders.detail.accepted'));
    },
    onError,
  });
  const cancel = useMutation({
    mutationFn: async () => (await api.post<{ order: TrClientOrder }>(`/translations/${id}/cancel`, { reason: reason || null })).data.order,
    onSuccess: (o) => {
      setOrder(o);
      setCancelOpen(false);
      toast.success(t('trOrders.detail.cancelled'));
    },
    onError,
  });

  if (isLoading) return <PageLoader />;
  if (isError || !order)
    return (
      <div className="card p-8 text-center">
        <p className="text-muted">{t('trOrders.detail.notFound')}</p>
        <Link to="/account/translations" className="btn-ghost btn-sm mt-4">
          {t('trOrders.backToList')}
        </Link>
      </div>
    );

  const sources = order.files.filter((x) => x.kind === 'SOURCE');
  const results = order.files.filter((x) => x.kind === 'RESULT');
  const canEditSources = order.status === 'NEW' || order.status === 'QUOTED';
  const canCancel = order.status === 'NEW' || order.status === 'QUOTED';
  const reached = order.events.map((e) => e.status).filter((s): s is NonNullable<typeof s> => !!s);
  const Icon = SERVICE_ICON[order.service];

  return (
    <div className="space-y-5">
      <Link to="/account/translations" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-brand-700">
        <ArrowLeft className="size-4" aria-hidden /> {t('trOrders.backToList')}
      </Link>

      <section className="card relative overflow-hidden p-5 sm:p-6">
        <span className={clsx('absolute inset-y-0 left-0 w-1.5', order.status === 'QUOTED' ? 'bg-amber-400' : order.status === 'CANCELLED' ? 'bg-slate-300' : order.status === 'READY' || order.status === 'DELIVERED' ? 'bg-success' : 'bg-brand-500')} aria-hidden />
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-brand-100 text-brand-600">
            {order.status === 'CANCELLED' ? <Ban className="size-6" aria-hidden /> : <Icon className="size-6" aria-hidden />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="eyebrow">{t('trOrders.order', { key: order.key })}</span>
              <TrStatusPill status={order.status} />
            </div>
            <h2 className="mt-1 text-xl font-extrabold text-ink sm:text-2xl">{t(`trOrders.service.${order.service}`)}</h2>
            <p className="mt-2 max-w-2xl text-muted">{t(`trOrders.statusHelp.${order.status}`)}</p>
          </div>
        </div>
        <div className="mt-5">
          <TrStepper status={order.status} reached={reached} />
        </div>
      </section>

      {order.status === 'QUOTED' && order.priceCents != null && (
        <section className="card border-amber-300/60 p-5 ring-4 ring-amber-400/10 sm:p-6" aria-labelledby="quote-title">
          <h3 id="quote-title" className="eyebrow text-amber-700">
            {t('trOrders.detail.quoteTitle')}
          </h3>
          <div className="mt-3 flex flex-wrap items-end gap-x-8 gap-y-3">
            <div>
              <p className="text-xs text-muted">{t('trOrders.fields.price')}</p>
              <p className="text-3xl font-extrabold text-ink tabular-nums">{f.money(order.priceCents, order.currency)}</p>
            </div>
            {order.dueAt && (
              <div>
                <p className="text-xs text-muted">{t('trOrders.fields.due')}</p>
                <p className="text-lg font-bold text-ink">{f.day(order.dueAt)}</p>
              </div>
            )}
          </div>
          {order.quoteNote && <p className="mt-3 rounded-lg bg-surface p-3 text-sm whitespace-pre-line text-ink">{order.quoteNote}</p>}
          <p className="mt-3 text-sm text-muted">{t('trOrders.detail.quoteHint')}</p>
          <button type="button" className="btn-primary mt-4" onClick={() => accept.mutate()} disabled={accept.isPending}>
            {accept.isPending ? <Spinner className="size-4" /> : <Check className="size-4" aria-hidden />} {t('trOrders.detail.accept')}
          </button>
        </section>
      )}

      {(order.status === 'READY' || order.status === 'DELIVERED') && results.length > 0 && (
        <section className="card border-emerald-300/60 p-5 sm:p-6" aria-labelledby="results-title">
          <h3 id="results-title" className="flex items-center gap-2 font-bold text-ink">
            <FileCheck2 className="size-5 text-success" aria-hidden /> {t('trOrders.detail.results')}
          </h3>
          <p className="mt-1 text-sm text-muted">{t('trOrders.detail.resultsHint')}</p>
          <ul className="mt-3 space-y-2">
            {results.map((file) => (
              <TrFileRow key={file.id} file={file} />
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          <section className="card p-5 sm:p-6" aria-labelledby="sources-title">
            <h3 id="sources-title" className="font-bold text-ink">
              {t('trOrders.detail.sources')}
            </h3>
            {sources.length === 0 ? (
              <p className="mt-2 text-sm text-muted">{t('trOrders.detail.noSources')}</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {sources.map((file) => (
                  <TrFileRow key={file.id} file={file} onRemove={order.status === 'NEW' ? () => remove.mutate(file.id) : undefined} busy={remove.isPending} />
                ))}
              </ul>
            )}
            {canEditSources && (
              <div className="mt-4">
                <MultiFileDrop onFiles={(list) => upload.mutate(list)} progress={progress} label={t('trOrders.detail.addFiles')} />
              </div>
            )}
          </section>

          <section className="card p-5 sm:p-6" aria-labelledby="timeline-title">
            <h3 id="timeline-title" className="font-bold text-ink">
              {t('trOrders.detail.timeline')}
            </h3>
            <ol className="mt-4 space-y-4 border-l-2 border-line pl-5">
              {[...order.events].reverse().map((e) => (
                <li key={e.id} className="relative">
                  <span className={clsx('absolute top-1 -left-[27px] size-3 rounded-full ring-4 ring-card', e.status === 'CANCELLED' ? 'bg-slate-400' : 'bg-brand-600')} aria-hidden />
                  <div className="flex flex-wrap items-center gap-2">
                    {e.status && <TrStatusPill status={e.status} />}
                    <span className="text-xs text-muted">
                      {f.dateTime(e.createdAt)} · {e.byStaff ? t('trOrders.detail.eventStaff') : t('trOrders.detail.eventYou')}
                    </span>
                  </div>
                  {e.note && <p className="mt-1 text-sm whitespace-pre-line text-ink">{e.note}</p>}
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside className="space-y-5">
          <section className="card p-5" aria-labelledby="details-title">
            <h3 id="details-title" className="font-bold text-ink">
              {t('trOrders.detail.details')}
            </h3>
            <dl className="mt-3 space-y-2.5 text-sm">
              {(
                [
                  [t('trOrders.fields.languages'), `${f.lang(order.sourceLang)} → ${f.lang(order.targetLang)}`],
                  [t('trOrders.fields.documentTypes'), order.documentTypes.map(f.docType).join(', ')],
                  [t('trOrders.fields.pages'), order.pages],
                  [t('trOrders.fields.urgency'), t(`trOrders.urgency.${order.urgency}`)],
                  [t('trOrders.fields.price'), order.priceCents != null ? f.money(order.priceCents, order.currency) : t('trOrders.detail.waitingQuote')],
                  [t('trOrders.fields.due'), f.day(order.dueAt)],
                  [t('trOrders.fields.delivery'), t(`trOrders.delivery.${order.deliveryMethod}`)],
                  ...(order.deliveryAddress ? [[t('trOrders.detail.address'), order.deliveryAddress]] : []),
                  ...(order.trackingNumber ? [[t('trOrders.fields.tracking'), order.trackingNumber]] : []),
                  ...(order.case ? [[t('trOrders.fields.case'), <Link key="c" to={`/account/cases/${order.case.id}`} className="font-semibold text-brand-700 hover:underline">{order.case.number}</Link>]] : []),
                  [t('trOrders.fields.created'), f.day(order.createdAt)],
                ] as [string, ReactNode][]
              ).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3">
                  <dt className="text-muted">{k}</dt>
                  <dd className="text-right font-medium break-words text-ink">{v}</dd>
                </div>
              ))}
            </dl>
            {order.clientNote && <p className="mt-4 rounded-lg bg-surface p-3 text-sm whitespace-pre-line text-ink">{order.clientNote}</p>}
            {order.deliveryMethod === 'COURIER' && order.deliveryAddress && (
              <p className="mt-3 flex items-start gap-2 text-xs text-muted">
                <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {t('trOrders.deliveryHelp.COURIER')}
              </p>
            )}
          </section>
          {canCancel && (
            <button type="button" className="w-full rounded-xl border border-line bg-card px-4 py-3 text-sm font-semibold text-danger transition hover:border-red-300 hover:bg-red-50" onClick={() => setCancelOpen(true)}>
              {t('trOrders.detail.cancel')}
            </button>
          )}
        </aside>
      </div>

      <ConfirmDialog open={cancelOpen} title={t('trOrders.detail.cancelTitle')} confirmLabel={t('trOrders.detail.cancel')} danger busy={cancel.isPending} onConfirm={() => cancel.mutate()} onClose={() => setCancelOpen(false)}>
        <p>{t('trOrders.detail.cancelBody')}</p>
        <label className="label mt-3" htmlFor="tr-cancel-reason">
          {t('trOrders.detail.cancelReason')}
        </label>
        <textarea id="tr-cancel-reason" rows={2} maxLength={1000} className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
      </ConfirmDialog>
    </div>
  );
};

/** /account/translations/* — translation & apostille orders of the signed-in client. */
export default function AccountTranslations() {
  const { t } = useTranslation();
  usePageTitle(t('trOrders.title'));
  return (
    <Routes>
      <Route index element={<OrdersList />} />
      <Route path="new" element={<NewOrderWizard />} />
      <Route path=":id" element={<OrderDetail />} />
    </Routes>
  );
}
