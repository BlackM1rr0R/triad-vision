import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { isAxiosError } from 'axios';
import { FileDown, FileUp, History, Loader2, Search, ShieldAlert, Undo2 } from 'lucide-react';
import { api, errorCode } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesSettlementImport } from '@/i18n/pagesSettlementImport';
import { Modal as UiModal } from '@/components/ui/Modal';
import { STAGE_CHIP } from './money';
import { STAGES, type Stage } from './types';
import { confirmDialog } from '@/components/ui/ConfirmHost';

registerCopy(pagesSettlementImport);

/**
 * Row import (ADMIN+): template download → upload CSV / XLSX → preview with matches the admin corrects
 * (case, company, intermediary, beneficiary columns, stage, rows on / off) → confirm (one transaction, one batch)
 * → history with "Undo this import".
 */

type Cur = 'AZN' | 'EUR';
interface ShareCell {
  cents: number | null;
  currency: Cur | null;
  text: string | null;
}
interface NRow {
  line: number;
  project: string;
  intermediary: string | null;
  clientName: string;
  licence: string | null;
  willNotWork: boolean;
  employer: string | null;
  tlsDate: string | null;
  visaDate: string | null;
  statusText: string | null;
  refused: boolean;
  cancelled: boolean;
  stage: Stage;
  amountCents: number | null;
  currency: Cur;
  payAfterVisa: boolean;
  instalments: number[];
  partnerShare: ShareCell | null;
  expenses: ShareCell | null;
  shares: Record<string, ShareCell>;
  note: string | null;
  warnings: string[];
}
interface CaseCand {
  caseId: string;
  number: string;
  status: string;
  clientName: string;
  score: number;
}
interface PRow {
  row: NRow;
  include: boolean;
  client: { status: string; caseId: string | null; candidates: CaseCand[] };
  company: { status: string; companyId: string | null; candidates: { id: string; name: string; score: number }[] };
  duplicates: { id: string; project: string; clientName: string; amount: string | null }[];
  warnings: string[];
}
interface Preview {
  fileName: string;
  rows: PRow[];
  beneficiaryColumns: { column: string; beneficiaryId: string | null; action: 'map' | 'create' | 'ignore' }[];
  partners: { name: string; partnerId: string | null; action: 'map' | 'create'; candidates: { id: string; name: string }[] }[];
  options: { partners: { id: string; name: string }[]; beneficiaries: { id: string; name: string; rule: string; active: boolean }[]; companies: { id: string; name: string }[] };
  counts: Record<string, number>;
  skippedCredentials: number;
}
interface Batch {
  id: string;
  at: string;
  fileName: string;
  actor: string | null;
  counts: { rows: number; linked: number; cancelled: number; refused: number };
  remaining: number;
  edited: number;
  undoneAt: string | null;
  canUndo: boolean;
}

/** Per-row decision: case id ('' = none), company ('map:<id>' | 'create' | 'none'), stage, included. */
interface Decision {
  include: boolean;
  caseId: string;
  caseLabel: string | null;
  company: string;
  stage: Stage;
}

const COUNT_KEYS = ['rows', 'included', 'clientMatched', 'clientAmbiguous', 'clientNone', 'duplicates', 'cancelled', 'refused'] as const;
const FORMAT_KEYS = ['Project', 'Intermediary', 'Client', 'Licence', 'Employer', 'TLS date', 'Visa date', 'Status', 'Amount', 'Currency', 'Pay after visa', 'Sanani', '<Beneficiary>', 'Expenses', 'Note'];
const INFO_WARNINGS = new Set(['NO_CLIENT_MATCH', 'NEW_PARTNER', 'WILL_NOT_WORK']);
const money = (c: ShareCell | null | undefined) => (!c ? '' : c.text ? c.text : c.cents == null ? '' : `${c.cents / 100}${c.currency ? ` ${c.currency}` : ''}`);

const CasePicker = ({ value, label, candidates, onChange }: { value: string; label: string | null; candidates: CaseCand[]; onChange: (id: string, label: string | null) => void }) => {
  const { t } = useTranslation();
  const [searching, setSearching] = useState(false);
  const [q, setQ] = useState('');
  const search = useQuery({
    queryKey: ['settlements', 'import-case-search', q],
    enabled: searching && q.trim().length >= 2,
    queryFn: async () =>
      (await api.get<{ items: { id: string; number: string; status: string; client?: { firstName: string; lastName: string } }[] }>('/admin/cases', { params: { search: q.trim() } })).data.items.slice(0, 8),
  });
  const known = candidates.some((c) => c.caseId === value);
  return (
    <div className="min-w-[13rem]">
      <div className="flex gap-1">
        <select className="input py-1 text-xs" value={value} onChange={(e) => onChange(e.target.value, null)} aria-label={t('settlementImport.cols.case')}>
          <option value="">{t('settlementImport.noCase')}</option>
          {candidates.map((c) => (
            <option key={c.caseId} value={c.caseId}>
              {c.clientName} · {c.number} · {Math.round(c.score * 100)}%
            </option>
          ))}
          {value && !known && <option value={value}>{label ?? value}</option>}
        </select>
        <button type="button" className="btn-ghost btn-sm px-1.5" onClick={() => setSearching((s) => !s)} aria-label={t('settlementImport.searchCase')} title={t('settlementImport.searchCase')}>
          <Search className="size-4" />
        </button>
      </div>
      {searching && (
        <div className="mt-1 rounded-lg border border-line bg-raised p-1.5">
          <input className="input py-1 text-xs" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('settlementImport.searchHint')} />
          <ul className="mt-1 max-h-40 overflow-y-auto">
            {(search.data ?? []).map((c) => {
              const name = `${c.client?.firstName ?? ''} ${c.client?.lastName ?? ''}`.trim();
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    className="w-full rounded px-2 py-1 text-left text-xs hover:bg-sunken"
                    onClick={() => {
                      onChange(c.id, `${name} · ${c.number}`);
                      setSearching(false);
                      setQ('');
                    }}
                  >
                    {name} · {c.number} · {c.status}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
};

export const RowImportDialog = ({ onClose, onDone }: { onClose: () => void; onDone: () => void }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [benCols, setBenCols] = useState<Preview['beneficiaryColumns']>([]);
  const [partnerMap, setPartnerMap] = useState<Record<string, string>>({}); // name → 'map:<id>' | 'create' | 'none'
  const [busy, setBusy] = useState(false);
  const [onlyIssues, setOnlyIssues] = useState(false);
  const [showFormat, setShowFormat] = useState(false);

  const batches = useQuery({
    queryKey: ['settlements', 'import-batches'],
    queryFn: async () => (await api.get<{ batches: Batch[] }>('/admin/settlements/import/batches')).data.batches,
  });

  const errText = (err: unknown) => {
    const k = `settlementImport.errors.${errorCode(err)}`;
    const s = t(k);
    return s === k ? t('settlementImport.errors.generic') : s;
  };

  const choose = async (f: File | null) => {
    setFile(f);
    setPreview(null);
    if (!f) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', f);
      const { data } = await api.post<Preview>('/admin/settlements/import/rows/preview', fd);
      setPreview(data);
      setBenCols(data.beneficiaryColumns);
      setPartnerMap(Object.fromEntries(data.partners.map((p) => [p.name, p.partnerId ? `map:${p.partnerId}` : 'create'])));
      setDecisions(
        data.rows.map((r) => ({
          include: r.include,
          caseId: r.client.caseId ?? '',
          caseLabel: null,
          company: r.company.companyId ? `map:${r.company.companyId}` : 'none',
          stage: r.row.stage,
        })),
      );
    } catch (err) {
      toast.error(errText(err));
    } finally {
      setBusy(false);
    }
  };

  const setDecision = (i: number, patch: Partial<Decision>) => setDecisions((d) => d.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  const selected = decisions.filter((d) => d.include).length;
  const visible = useMemo(
    () => (preview ? preview.rows.map((r, i) => ({ r, i })).filter(({ r }) => !onlyIssues || r.warnings.some((w) => !INFO_WARNINGS.has(w)) || r.client.status !== 'matched') : []),
    [preview, onlyIssues],
  );

  const confirm = async () => {
    if (!preview) return;
    setBusy(true);
    try {
      const body = {
        fileName: preview.fileName,
        beneficiaryColumns: benCols.map((c) => ({ column: c.column, action: c.action, beneficiaryId: c.action === 'map' ? c.beneficiaryId : null })),
        partners: preview.partners.map((p) => {
          const v = partnerMap[p.name] ?? 'create';
          return v.startsWith('map:') ? { name: p.name, action: 'map', partnerId: v.slice(4) } : { name: p.name, action: v };
        }),
        rows: preview.rows
          .map((r, i) => ({ r, d: decisions[i]! }))
          .filter(({ d }) => d.include)
          .map(({ r, d }) => ({
            row: r.row,
            caseId: d.caseId || null,
            company: d.company.startsWith('map:') ? { action: 'map', companyId: d.company.slice(4) } : { action: d.company === 'create' ? 'create' : 'none' },
            ...(d.stage !== r.row.stage ? { stage: d.stage } : {}),
          })),
      };
      const { data } = await api.post<{ batch: { id: string; counts: { rows: number } } }>('/admin/settlements/import/rows/confirm', body);
      toast.success(t('settlementImport.done', { count: data.batch.counts.rows, id: data.batch.id }));
      setPreview(null);
      setFile(null);
      void qc.invalidateQueries({ queryKey: ['settlements', 'import-batches'] });
      onDone();
    } catch (err) {
      toast.error(errText(err));
    } finally {
      setBusy(false);
    }
  };

  const undo = async (b: Batch) => {
    if (!(await confirmDialog({ message: t('settlementImport.undoConfirm', { count: b.remaining }), confirmLabel: t('ui.confirmDlg.undo') }))) return;
    setBusy(true);
    try {
      const { data } = await api.delete<{ deleted: number }>(`/admin/settlements/import/batches/${b.id}`);
      toast.success(t('settlementImport.undone', { count: data.deleted }));
      onDone();
    } catch (err) {
      if (isAxiosError(err) && err.response?.status === 409) {
        const edited = (err.response.data as { edited?: { clientName: string }[] }).edited ?? [];
        toast.error(t('settlementImport.editedList', { list: edited.slice(0, 5).map((e) => e.clientName).join(', ') }));
      } else toast.error(errText(err));
    } finally {
      setBusy(false);
      void qc.invalidateQueries({ queryKey: ['settlements', 'import-batches'] });
    }
  };

  const benOptions = preview?.options.beneficiaries ?? [];
  const partnerOptions = preview?.options.partners ?? [];

  return (
    <UiModal
      open
      onClose={onClose}
      title={t('settlementImport.title')}
      size="2xl"
      mobile="full"
      zIndex={80}
      footer={
        preview ? (
          <button type="button" className="btn-primary btn-sm" disabled={busy || !selected} onClick={() => void confirm()}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <FileUp className="size-4" />}
            {t('settlementImport.confirm', { count: selected })}
          </button>
        ) : undefined
      }
    >
      <p className="text-sm text-muted">{t('settlementImport.hint')}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <a className="btn-secondary btn-sm" href="/api/admin/settlements/import/template.xlsx" download>
          <FileDown className="size-4" /> {t('settlementImport.templateXlsx')}
        </a>
        <a className="btn-secondary btn-sm" href="/api/admin/settlements/import/template.csv" download>
          <FileDown className="size-4" /> {t('settlementImport.templateCsv')}
        </a>
        <button type="button" className="btn-ghost btn-sm" onClick={() => setShowFormat((s) => !s)} aria-expanded={showFormat}>
          {t('settlementImport.formatTitle')}
        </button>
      </div>
      {showFormat && (
        <dl className="mt-2 grid gap-x-4 gap-y-1 rounded-xl border border-line bg-sunken p-3 text-xs sm:grid-cols-[10rem_1fr]">
          {FORMAT_KEYS.map((k) => (
            <div key={k} className="contents">
              <dt className="font-mono font-semibold">{k}</dt>
              <dd className="text-muted">{t(`settlementImport.format.${k}`)}</dd>
            </div>
          ))}
        </dl>
      )}

      <label className="mt-4 flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-line bg-sunken px-4 py-3 text-sm hover:border-line-strong">
        <FileUp className="size-5 text-link" />
        <span className="min-w-0 flex-1 truncate">{file ? file.name : t('settlementImport.choose')}</span>
        <input
          type="file"
          accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="sr-only"
          onChange={(e) => {
            void choose(e.target.files?.[0] ?? null);
            e.target.value = '';
          }}
        />
      </label>
      {busy && !preview && (
        <p className="mt-4 flex items-center gap-2 text-sm text-muted">
          <Loader2 className="size-4 animate-spin" /> {t('settlementImport.previewing')}
        </p>
      )}

      {preview && (
        <div className="mt-5 space-y-5">
          <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4 lg:grid-cols-8">
            {COUNT_KEYS.map((k) => (
              <div key={k} className="rounded-xl border border-line bg-sunken p-2">
                <div className="text-lg font-bold tabular-nums">{k === 'included' ? selected : (preview.counts[k] ?? 0)}</div>
                <div className="text-[11px] leading-tight text-muted">{t(`settlementImport.counts.${k}`)}</div>
              </div>
            ))}
          </div>
          {preview.skippedCredentials > 0 && (
            <p className="flex items-start gap-2 rounded-xl bg-warning-bg p-3 text-sm text-warning-fg">
              <ShieldAlert className="mt-0.5 size-4 shrink-0" />
              {t('settlementImport.skippedCredentials', { count: preview.skippedCredentials })}
            </p>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            {benCols.length > 0 && (
              <section>
                <h3 className="mb-2 text-sm font-semibold">{t('settlementImport.beneficiaries')}</h3>
                <ul className="space-y-1.5">
                  {benCols.map((c, i) => (
                    <li key={c.column} className="flex items-center gap-2 text-sm">
                      <span className="w-28 shrink-0 truncate font-medium">{c.column}</span>
                      <select
                        className="input py-1 text-xs"
                        value={c.action === 'map' ? `map:${c.beneficiaryId}` : c.action}
                        onChange={(e) => {
                          const v = e.target.value;
                          setBenCols((cols) =>
                            cols.map((x, k) => (k !== i ? x : v.startsWith('map:') ? { ...x, action: 'map', beneficiaryId: v.slice(4) } : { ...x, action: v as 'create' | 'ignore', beneficiaryId: null })),
                          );
                        }}
                      >
                        {benOptions.map((b) => (
                          <option key={b.id} value={`map:${b.id}`}>
                            {t('settlementImport.map')}: {b.name}
                          </option>
                        ))}
                        <option value="create">{t('settlementImport.create')}</option>
                        <option value="ignore">{t('settlementImport.ignore')}</option>
                      </select>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {preview.partners.length > 0 && (
              <section>
                <h3 className="mb-2 text-sm font-semibold">{t('settlementImport.partners')}</h3>
                <ul className="max-h-48 space-y-1.5 overflow-y-auto">
                  {preview.partners.map((p) => (
                    <li key={p.name} className="flex items-center gap-2 text-sm">
                      <span className="w-28 shrink-0 truncate font-medium">{p.name}</span>
                      <select className="input py-1 text-xs" value={partnerMap[p.name] ?? 'create'} onChange={(e) => setPartnerMap((m) => ({ ...m, [p.name]: e.target.value }))}>
                        <option value="create">{t('settlementImport.create')}</option>
                        <option value="none">{t('settlementImport.none')}</option>
                        {[...p.candidates, ...partnerOptions.filter((o) => !p.candidates.some((c) => c.id === o.id))].map((o) => (
                          <option key={o.id} value={`map:${o.id}`}>
                            {t('settlementImport.map')}: {o.name}
                          </option>
                        ))}
                      </select>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>

          <section>
            <div className="mb-2 flex flex-wrap items-center gap-3">
              <h3 className="text-sm font-semibold">{t('settlementImport.rowsTitle')}</h3>
              <label className="flex items-center gap-1.5 text-xs text-muted">
                <input type="checkbox" checked={onlyIssues} onChange={(e) => setOnlyIssues(e.target.checked)} />
                {t('settlementImport.onlyIssues')}
              </label>
              <label className="flex items-center gap-1.5 text-xs text-muted">
                <input
                  type="checkbox"
                  checked={selected === decisions.length && decisions.length > 0}
                  onChange={(e) => setDecisions((d) => d.map((x) => ({ ...x, include: e.target.checked })))}
                />
                {t('settlementImport.selectAll')}
              </label>
            </div>
            <div className="max-h-[55vh] overflow-auto rounded-xl border border-line">
              <table className="w-full min-w-[1100px] text-xs">
                <thead className="sticky top-0 z-10 bg-sunken text-muted">
                  <tr>
                    <th className="px-2 py-1.5" />
                    <th className="px-2 py-1.5 text-left">{t('settlementImport.cols.line')}</th>
                    <th className="px-2 py-1.5 text-left">{t('settlementImport.cols.client')}</th>
                    <th className="px-2 py-1.5 text-left">{t('settlementImport.cols.case')}</th>
                    <th className="px-2 py-1.5 text-left">{t('settlementImport.cols.company')}</th>
                    <th className="px-2 py-1.5 text-left">{t('settlementImport.cols.stage')}</th>
                    <th className="px-2 py-1.5 text-right">{t('settlementImport.cols.amount')}</th>
                    <th className="px-2 py-1.5 text-right">{t('settlementImport.cols.sanani')}</th>
                    <th className="px-2 py-1.5 text-left">{t('settlementImport.cols.shares')}</th>
                    <th className="px-2 py-1.5 text-left">{t('settlementImport.cols.warnings')}</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map(({ r, i }) => {
                    const d = decisions[i]!;
                    const others = preview.options.companies.filter((c) => !r.company.candidates.some((x) => x.id === c.id));
                    return (
                      <tr key={r.row.line} className={clsx('border-t border-line align-top', !d.include && 'opacity-55')}>
                        <td className="px-2 py-1.5">
                          <input type="checkbox" checked={d.include} onChange={(e) => setDecision(i, { include: e.target.checked })} aria-label={r.row.clientName} />
                        </td>
                        <td className="px-2 py-1.5 tabular-nums text-muted">{r.row.line}</td>
                        <td className="px-2 py-1.5">
                          <div className="font-semibold">
                            {r.row.clientName}
                            {r.row.licence ? ` (${r.row.licence})` : ''}
                          </div>
                          <div className="text-muted">
                            {r.row.project}
                            {r.row.intermediary ? ` · ${r.row.intermediary}` : ''}
                          </div>
                          {r.duplicates.length > 0 && (
                            <div className="text-danger-fg">{t('settlementImport.duplicateOf', { list: r.duplicates.map((x) => `${x.project}: ${x.clientName}${x.amount ? ` (${x.amount})` : ''}`).join('; ') })}</div>
                          )}
                        </td>
                        <td className="px-2 py-1.5">
                          <CasePicker value={d.caseId} label={d.caseLabel} candidates={r.client.candidates} onChange={(id, label) => setDecision(i, { caseId: id, caseLabel: label })} />
                        </td>
                        <td className="px-2 py-1.5">
                          {r.row.employer ? (
                            <select className="input min-w-[11rem] py-1 text-xs" value={d.company} onChange={(e) => setDecision(i, { company: e.target.value })} aria-label={t('settlementImport.cols.company')}>
                              <option value="none">
                                {t('settlementImport.noCompany')} ({r.row.employer})
                              </option>
                              <option value="create">{t('settlementImport.createCompany')}</option>
                              {r.company.candidates.length > 0 && (
                                <optgroup label={t('settlementImport.candidates')}>
                                  {r.company.candidates.map((c) => (
                                    <option key={c.id} value={`map:${c.id}`}>
                                      {c.name} · {Math.round(c.score * 100)}%
                                    </option>
                                  ))}
                                </optgroup>
                              )}
                              {others.length > 0 && (
                                <optgroup label={t('settlementImport.allCompanies')}>
                                  {others.map((c) => (
                                    <option key={c.id} value={`map:${c.id}`}>
                                      {c.name}
                                    </option>
                                  ))}
                                </optgroup>
                              )}
                            </select>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                        <td className="px-2 py-1.5">
                          <select
                            className={clsx('rounded px-1.5 py-1 text-xs font-semibold', STAGE_CHIP[d.stage])}
                            value={d.stage}
                            onChange={(e) => setDecision(i, { stage: e.target.value as Stage })}
                            aria-label={t('settlementImport.cols.stage')}
                          >
                            {STAGES.map((s) => (
                              <option key={s} value={s}>
                                {t(`settlementImport.stage.${s}`)}
                              </option>
                            ))}
                          </select>
                          {(r.row.tlsDate || r.row.visaDate) && (
                            <div className="mt-0.5 text-muted">
                              {r.row.tlsDate && `TLS ${r.row.tlsDate}`}
                              {r.row.visaDate && ` · ${r.row.visaDate}`}
                            </div>
                          )}
                          {r.row.statusText && <div className="text-muted">{r.row.statusText}</div>}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums">
                          {r.row.amountCents != null ? `${r.row.amountCents / 100} ${r.row.currency}` : ''}
                          {r.row.payAfterVisa && <div className="text-[11px] text-warning-fg">{t('settlementImport.afterVisa')}</div>}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{money(r.row.partnerShare)}</td>
                        <td className="px-2 py-1.5">
                          {Object.entries(r.row.shares).map(([k, v]) => (
                            <div key={k} className="whitespace-nowrap">
                              <span className="text-muted">{k}:</span> {money(v)}
                            </div>
                          ))}
                          {r.row.expenses && (
                            <div className="whitespace-nowrap">
                              <span className="text-muted">Rasxod:</span> {money(r.row.expenses)}
                            </div>
                          )}
                        </td>
                        <td className="px-2 py-1.5">
                          <div className="flex max-w-[14rem] flex-wrap gap-1">
                            {r.warnings.map((w) => (
                              <span key={w} className={clsx('rounded px-1.5 py-0.5', INFO_WARNINGS.has(w) ? 'bg-info-bg text-info-fg' : 'bg-warning-bg text-warning-fg')}>
                                {t(`settlementImport.warn.${w}`, { defaultValue: w })}
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      <section className="mt-6">
        <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
          <History className="size-4" /> {t('settlementImport.batches')}
        </h3>
        {batches.data && batches.data.length === 0 && <p className="text-xs text-muted">{t('settlementImport.noBatches')}</p>}
        <ul className="divide-y divide-line rounded-xl border border-line">
          {(batches.data ?? []).map((b) => (
            <li key={b.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs">
              <span className="font-mono">{b.id}</span>
              <span className="text-muted">
                {new Date(b.at).toLocaleString()} · {b.fileName}
                {b.actor ? ` · ${b.actor}` : ''} · {t('settlementImport.remaining', { count: b.undoneAt ? 0 : b.remaining })}
              </span>
              <span className="ml-auto flex items-center gap-2">
                {b.undoneAt ? (
                  <span className="text-muted">{t('settlementImport.undoneAt')}</span>
                ) : b.canUndo ? (
                  <button type="button" className="btn-secondary btn-sm" disabled={busy} onClick={() => void undo(b)}>
                    <Undo2 className="size-4" /> {t('settlementImport.undo')}
                  </button>
                ) : (
                  <span className="text-warning-fg">{t('settlementImport.edited', { count: b.edited })}</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </UiModal>
  );
};
