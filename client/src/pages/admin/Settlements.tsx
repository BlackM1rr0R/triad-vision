import { useLocation } from 'react-router-dom';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { Banknote, CheckCheck, FileDown, FileSpreadsheet, FileUp, FolderInput, Pencil, Plus, RotateCcw, Save, Scale, Search, Trash2, Undo2, X } from 'lucide-react';
import { api, errorCode } from '@/lib/api';
import { usePageTitle } from '@/lib/usePageTitle';
import { PageLoader } from '@/components/ui/Spinner';
import { registerCopy } from '@/i18n';
import { pagesSettlement } from '@/i18n/pagesSettlement';
import { buildColumns } from '@/components/settlement/columns';
import { SettlementTable, type TableActions, type ViewRow } from '@/components/settlement/SettlementTable';
import { SummaryCards } from '@/components/settlement/SummaryCards';
import { ImportDialog } from '@/components/settlement/ImportDialog';
import { RowImportDialog } from '@/components/settlement/RowImportDialog';
import { RulesDialog } from '@/components/settlement/RulesDialog';
import { LinkDialog } from '@/components/settlement/LinkDialog';
import { RenameProjectDialog } from '@/components/settlement/RenameProjectDialog';
import { addBag, fmtBag } from '@/components/settlement/money';
import { STAGES, type Bag, type CellValue, type ListResponse, type Row, type Stage, type Summary, type Tab } from '@/components/settlement/types';
import { useAuth } from '@/lib/auth';
import { AdminAiButton, AdminAiPanel, useAiActionDone } from '@/components/aiAdmin/AdminAiPanel';
import { confirmDialog } from '@/components/ui/ConfirmHost';

registerCopy(pagesSettlement);

/**
 * Settlement ledger "Hesablaşmalar" (/admin/settlements and /workspace/settlements): the team's Excel workbook as
 * an editable table — sheet tabs at the bottom, drafts saved in one batch (Ctrl+S), undo, filters, bulk actions,
 * case links, Excel import / export and the split rules.
 */

const KEY = ['settlements'] as const;
type Drafts = Map<string, Record<string, CellValue>>;
type HistoryEntry = { id: string; field: string; had: boolean; prev: CellValue | undefined }[];

const DIRECT_FIELDS = new Set([
  'project',
  'clientName',
  'licence',
  'employer',
  'tlsDate',
  'visaDate',
  'stage',
  'stageAuto',
  'amountCents',
  'currency',
  'payAfterVisa',
  'paidCents',
  'partnerId',
  'partnerShareCents',
  'partnerShareCurrency',
  'expensesCents',
  'note',
]);

const applyDraft = (r: Row, d: Record<string, CellValue>): ViewRow => {
  const v: ViewRow = { ...r, _draft: d };
  const rec = v as unknown as Record<string, unknown>;
  for (const [k, val] of Object.entries(d)) if (DIRECT_FIELDS.has(k)) rec[k] = k === 'paidCents' ? (val ?? 0) : val;
  if ('stage' in d) v.stageAuto = false;
  return v;
};

const isUnpaid = (r: Row) => Object.values(r.shares).some((s) => s && s.status === 'PENDING' && s.cents > 0) || (!!r.partnerShareCents && !!r.partnerId && !r.partnerPaid);

/** AI tools that change ledger rows or partners (a confirmed one reloads the page data). */
const SETTLEMENT_AI_TOOLS = /^(settlement|partner|register)_/;
const AI_CONTEXT = { page: 'settlements' };

const fold = (s: string) =>
  s
    .toLocaleLowerCase('az')
    .replace(/ə/g, 'e')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u');

const sameTab = (a: Tab, b: Tab) => a.kind === b.kind && (a.kind === 'project' ? a.name === (b as { name: string }).name : a.kind === 'partner' ? a.id === (b as { id: string }).id : true);

export default function Settlements() {
  const inWorkspace = useLocation().pathname.startsWith('/workspace');
  const { t } = useTranslation();
  usePageTitle(t('settlement.title'));
  const qc = useQueryClient();
  // Super-admin AI assistant; unsaved drafts stay (they are kept apart from the fetched rows).
  const isSuper = useAuth().user?.role === 'SUPER_ADMIN';
  const [aiOpen, setAiOpen] = useState(false);
  useAiActionDone(() => void qc.invalidateQueries({ queryKey: ['settlements'] }), SETTLEMENT_AI_TOOLS);

  const list = useQuery({ queryKey: KEY, queryFn: async () => (await api.get<ListResponse>('/admin/settlements')).data });
  const [month, setMonth] = useState('');
  const summary = useQuery({
    queryKey: ['settlements', 'summary', month || 'now'],
    queryFn: async () => (await api.get<Summary>('/admin/settlements/summary', { params: month ? { month } : {} })).data,
  });

  const [tab, setTab] = useState<Tab>({ kind: 'all' });
  const [q, setQ] = useState('');
  const query = useDeferredValue(q);
  const [stage, setStage] = useState<Stage | ''>('');
  const [partnerFilter, setPartnerFilter] = useState('');
  const [unpaidOnly, setUnpaidOnly] = useState(false);
  const [drafts, setDrafts] = useState<Drafts>(() => new Map());
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;
  const history = useRef<HistoryEntry[]>([]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const lastSelected = useRef<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dialog, setDialog] = useState<'import' | 'rowImport' | 'rules' | null>(null);
  const [linkRow, setLinkRow] = useState<Row | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null); // sheet (project) being renamed
  const [newName, setNewName] = useState('');
  const [moveTo, setMoveTo] = useState('');

  const data = list.data;
  const rows = useMemo(() => data?.rows ?? [], [data]);
  const partners = useMemo(() => data?.partners ?? [], [data]);
  const beneficiaries = useMemo(() => data?.beneficiaries ?? [], [data]);
  const cols = useMemo(() => buildColumns(t, beneficiaries), [t, beneficiaries]);
  const dirtyCount = useMemo(() => [...drafts.values()].reduce((a, d) => a + Object.keys(d).length, 0), [drafts]);

  const refreshSummary = useCallback(() => void qc.invalidateQueries({ queryKey: ['settlements', 'summary'] }), [qc]);
  const mergeRows = useCallback(
    (updated: Row[]) => {
      if (!updated.length) return;
      qc.setQueryData<ListResponse>(KEY, (old) => {
        if (!old) return old;
        const byId = new Map(updated.map((r) => [r.id, r]));
        const known = new Set(old.rows.map((r) => r.id));
        const next = old.rows.map((r) => byId.get(r.id) ?? r);
        for (const u of updated) if (!known.has(u.id)) next.push(u);
        const counts = new Map<string, number>();
        for (const r of next) counts.set(r.project, (counts.get(r.project) ?? 0) + 1);
        return { ...old, rows: next, projects: [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([name, count]) => ({ name, count })) };
      });
      refreshSummary();
    },
    [qc, refreshSummary],
  );
  const reloadAll = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ['settlements'] });
  }, [qc]);

  // ─── Filtering ─────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const needle = fold(query.trim());
    return rows.filter((r) => {
      if (tab.kind === 'project' && r.project !== tab.name) return false;
      if (tab.kind === 'partner' && r.partnerId !== tab.id) return false;
      if ((tab.kind === 'unpaid' || unpaidOnly) && !isUnpaid(r)) return false;
      if (stage && r.stage !== stage) return false;
      if (partnerFilter && (partnerFilter === 'none' ? r.partnerId : r.partnerId !== partnerFilter)) return false;
      if (month && r.month !== month) return false;
      if (needle && !fold(`${r.clientName} ${r.employer ?? ''} ${r.note ?? ''} ${r.case?.number ?? ''}`).includes(needle)) return false;
      return true;
    });
  }, [rows, tab, unpaidOnly, stage, partnerFilter, month, query]);

  const viewCache = useRef(new WeakMap<Record<string, CellValue>, { base: Row; view: ViewRow }>());
  const viewRows = useMemo(
    () =>
      filtered.map((r) => {
        const d = drafts.get(r.id);
        if (!d) return r;
        const hit = viewCache.current.get(d);
        if (hit && hit.base === r) return hit.view;
        const view = applyDraft(r, d);
        viewCache.current.set(d, { base: r, view });
        return view;
      }),
    [filtered, drafts],
  );

  const totals = useMemo(() => {
    const out: Record<string, string> = { clientName: t('settlement.totals', { count: filtered.length }) };
    const amount: Bag = {};
    const paid: Bag = {};
    const partnerShare: Bag = {};
    const expenses: Bag = {};
    const shares: Record<string, Bag> = {};
    for (const r of filtered) {
      addBag(amount, r.currency, r.amountCents);
      addBag(paid, r.currency, r.paidCents);
      addBag(partnerShare, r.partnerShareCurrency, r.partnerShareCents);
      addBag(expenses, r.currency, r.expensesCents);
      for (const [id, s] of Object.entries(r.shares)) if (s && !s.text) addBag((shares[id] ??= {}), s.currency, s.cents);
    }
    out.amountCents = fmtBag(amount);
    out.paidCents = fmtBag(paid);
    out.partnerShareCents = fmtBag(partnerShare);
    out.expensesCents = fmtBag(expenses);
    for (const [id, bag] of Object.entries(shares)) out[`share:${id}`] = fmtBag(bag);
    return out;
  }, [filtered, t]);

  // ─── Drafts, undo, save ────────────────────────────────────────────
  const change = useCallback((id: string, changes: { field: string; value: CellValue }[]) => {
    const next = new Map(draftsRef.current);
    const cur = { ...(next.get(id) ?? {}) };
    const entry: HistoryEntry = [];
    for (const ch of changes) {
      entry.push({ id, field: ch.field, had: ch.field in cur, prev: cur[ch.field] });
      cur[ch.field] = ch.value;
    }
    next.set(id, cur);
    history.current.push(entry);
    if (history.current.length > 200) history.current.shift();
    setDrafts(next);
  }, []);

  const undo = useCallback(() => {
    const entry = history.current.pop();
    if (!entry) return;
    const next = new Map(draftsRef.current);
    for (const e of [...entry].reverse()) {
      const cur = { ...(next.get(e.id) ?? {}) };
      if (e.had) cur[e.field] = e.prev as CellValue;
      else delete cur[e.field];
      if (Object.keys(cur).length) next.set(e.id, cur);
      else next.delete(e.id);
    }
    setDrafts(next);
  }, []);

  const errText = useCallback(
    (code: string) => {
      const k = `settlement.errors.${code}`;
      const s = t(k);
      return s === k ? code : s;
    },
    [t],
  );

  const save = useCallback(async () => {
    const current = draftsRef.current;
    const changes = [...current.entries()].flatMap(([id, d]) => Object.entries(d).map(([field, value]) => ({ id, field, value })));
    if (!changes.length || saving) return;
    setSaving(true);
    try {
      const { data: res } = await api.patch<{ results: { id: string; field: string; ok: boolean; error?: string }[]; rows: Row[]; failed: number }>('/admin/settlements', { changes });
      mergeRows(res.rows);
      const failed = res.results.filter((r) => !r.ok);
      // Keep only what failed (and anything typed meanwhile).
      const next: Drafts = new Map();
      const latest = draftsRef.current;
      for (const [id, d] of latest) {
        const keep: Record<string, CellValue> = {};
        for (const [field, value] of Object.entries(d)) {
          const sent = current.get(id);
          const unchangedSinceSend = sent && field in sent && sent[field] === value;
          if (!unchangedSinceSend || failed.some((f) => f.id === id && f.field === field)) keep[field] = value;
        }
        if (Object.keys(keep).length) next.set(id, keep);
      }
      setDrafts(next);
      history.current = [];
      if (failed.length) toast.error(t('settlement.errors.partial', { count: failed.length, error: errText(failed[0]!.error ?? '') }));
      else toast.success(t('settlement.toolbar.saved'));
    } catch {
      toast.error(t('settlement.errors.saveFailed'));
    } finally {
      setSaving(false);
    }
  }, [mergeRows, saving, t, errText]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      if (e.key.toLowerCase() === 's') {
        e.preventDefault();
        void save();
      } else if (e.key.toLowerCase() === 'z' && !e.shiftKey) {
        const el = e.target as HTMLElement | null;
        if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')) return;
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [save, undo]);

  useEffect(() => {
    if (!dirtyCount) return;
    const onUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = t('settlement.leaveWarning');
    };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [dirtyCount, t]);

  // ─── Row actions ───────────────────────────────────────────────────
  const markPaid = useCallback(
    async (items: { id: string; beneficiaryId: string }[], paid: boolean) => {
      try {
        const { data: res } = await api.post<{ rows: Row[] }>('/admin/settlements/paid', { items, paid });
        mergeRows(res.rows);
      } catch {
        toast.error(t('settlement.errors.generic'));
      }
    },
    [mergeRows, t],
  );

  const recalc = useCallback(
    async (ids: string[]) => {
      try {
        const { data: res } = await api.post<{ rows: Row[] }>('/admin/settlements/recalculate', { ids });
        mergeRows(res.rows);
        // Pending share values of those rows are obsolete now.
        const next = new Map(draftsRef.current);
        for (const id of ids) {
          const d = next.get(id);
          if (!d) continue;
          const keep = Object.fromEntries(Object.entries(d).filter(([k]) => !k.startsWith('share:')));
          if (Object.keys(keep).length) next.set(id, keep);
          else next.delete(id);
        }
        setDrafts(next);
      } catch {
        toast.error(t('settlement.errors.generic'));
      }
    },
    [mergeRows, t],
  );

  const viewRowsRef = useRef(viewRows);
  viewRowsRef.current = viewRows;

  const actions = useMemo<TableActions>(
    () => ({
      change,
      togglePaid: (id, key, paid) => void markPaid([{ id, beneficiaryId: key }], paid),
      toggleSelect: (id, range) => {
        setSelected((prev) => {
          const next = new Set(prev);
          const order = viewRowsRef.current.map((r) => r.id);
          if (range && lastSelected.current && order.includes(lastSelected.current)) {
            const a = order.indexOf(lastSelected.current);
            const b = order.indexOf(id);
            for (const x of order.slice(Math.min(a, b), Math.max(a, b) + 1)) next.add(x);
          } else if (next.has(id)) next.delete(id);
          else next.add(id);
          lastSelected.current = id;
          return next;
        });
      },
      toggleAll: () => {
        setSelected((prev) => {
          const ids = viewRowsRef.current.map((r) => r.id);
          return ids.length && ids.every((id) => prev.has(id)) ? new Set() : new Set(ids);
        });
      },
      openLink: (row) => setLinkRow(row),
      recalc: (id) => void recalc([id]),
    }),
    [change, markPaid, recalc],
  );

  const selectedIds = useMemo(() => viewRows.filter((r) => selected.has(r.id)).map((r) => r.id), [viewRows, selected]);
  const allSelected = viewRows.length > 0 && selectedIds.length === viewRows.length;

  const bulkDelete = async () => {
    if (!(await confirmDialog({ message: t('settlement.bulk.confirmDelete', { count: selectedIds.length }), confirmLabel: t('ui.confirmDlg.delete') }))) return;
    try {
      await api.delete('/admin/settlements/bulk', { data: { ids: selectedIds } });
      const gone = new Set(selectedIds);
      qc.setQueryData<ListResponse>(KEY, (old) => (old ? { ...old, rows: old.rows.filter((r) => !gone.has(r.id)) } : old));
      setSelected(new Set());
      refreshSummary();
    } catch (err) {
      toast.error(errText(errorCode(err)));
    }
  };

  const bulkMove = async () => {
    const project = moveTo.trim();
    if (!project || !selectedIds.length) return;
    try {
      const { data: res } = await api.post<{ rows: Row[] }>('/admin/settlements/move', { ids: selectedIds, project });
      mergeRows(res.rows);
      setMoveTo('');
    } catch {
      toast.error(t('settlement.errors.generic'));
    }
  };

  const addRow = async () => {
    const name = newName.trim();
    if (!name) return;
    const project = tab.kind === 'project' ? tab.name : (data?.projects[0]?.name ?? 'Ümumi');
    const partnerId = tab.kind === 'partner' ? tab.id : partnerFilter && partnerFilter !== 'none' ? partnerFilter : undefined;
    try {
      const { data: res } = await api.post<{ row: Row }>('/admin/settlements', { clientName: name, project, partnerId });
      mergeRows([res.row]);
      setNewName('');
    } catch {
      toast.error(t('settlement.errors.generic'));
    }
  };

  // ─── Tabs ──────────────────────────────────────────────────────────
  const partnerTabs = useMemo(() => {
    const ids = new Set(rows.map((r) => r.partnerId).filter((x): x is string => !!x));
    return partners.filter((p) => ids.has(p.id));
  }, [rows, partners]);
  const projectTabs = useMemo(() => {
    const partnerNames = new Set(partnerTabs.map((p) => p.name.toLowerCase()));
    return (data?.projects ?? []).filter((p) => !partnerNames.has(p.name.toLowerCase()));
  }, [data?.projects, partnerTabs]);
  const unpaidCount = useMemo(() => rows.filter(isUnpaid).length, [rows]);

  const exportHref = `/api/admin/settlements/export.xlsx${tab.kind === 'project' ? `?project=${encodeURIComponent(tab.name)}` : ''}`;
  const canManage = !!data?.canManage;
  const filtersOn = !!(q || stage || partnerFilter || month || unpaidOnly);

  if (list.isLoading) return <PageLoader />;
  if (list.isError || !data) return <p className="p-6 text-sm text-danger-fg">{t('settlement.loadFailed')}</p>;

  const tabBtn = (key: string, active: boolean, label: string, onClick: () => void, count?: number) => (
    <button
      key={key}
      type="button"
      onClick={onClick}
      className={clsx(
        'shrink-0 rounded-b-lg border border-t-0 px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition',
        active ? 'border-line bg-card text-link shadow-[var(--tv-shadow-card)]' : 'border-transparent text-muted hover:bg-card/60 hover:text-ink',
      )}
    >
      {label}
      {count != null && <span className="ml-1 text-[10px] font-normal text-muted">{count}</span>}
    </button>
  );

  return (
    // The workspace shell has no page padding (the admin shell does).
    <div className={clsx('flex min-w-0 flex-col gap-3', inWorkspace && 'p-4 sm:p-6', aiOpen && 'lg:pr-[25rem]')}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 type-page-title">
            <Banknote className="size-6 text-link" /> {t('settlement.title')}
          </h1>
          <p className="text-sm text-muted">{t('settlement.subtitle')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isSuper && <AdminAiButton open={aiOpen} onClick={() => setAiOpen((o) => !o)} />}
          {canManage && (
            <button type="button" className="btn-secondary btn-sm" onClick={() => setDialog('import')}>
              <FileUp className="size-4" /> {t('settlement.toolbar.import')}
            </button>
          )}
          {canManage && (
            <button type="button" className="btn-secondary btn-sm" onClick={() => setDialog('rowImport')}>
              <FileSpreadsheet className="size-4" /> {t('settlementImport.button', { defaultValue: 'Import (CSV/XLSX)' })}
            </button>
          )}
          <a className="btn-secondary btn-sm" href={exportHref} download>
            <FileDown className="size-4" /> {t('settlement.toolbar.export')}
          </a>
          <button type="button" className="btn-secondary btn-sm" onClick={() => setDialog('rules')}>
            <Scale className="size-4" /> {t('settlement.toolbar.rules')}
          </button>
        </div>
      </header>

      <SummaryCards summary={summary.data} />

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <input className="input py-2 pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('settlement.toolbar.search')} />
        </label>
        <select className="input w-auto py-2" value={stage} onChange={(e) => setStage(e.target.value as Stage | '')} aria-label={t('settlement.cols.stage')}>
          <option value="">{t('settlement.toolbar.allStages')}</option>
          {STAGES.map((s) => (
            <option key={s} value={s}>
              {t(`settlement.stage.${s}`)}
            </option>
          ))}
        </select>
        <select className="input w-auto py-2" value={partnerFilter} onChange={(e) => setPartnerFilter(e.target.value)} aria-label={t('settlement.cols.partner')}>
          <option value="">{t('settlement.toolbar.allPartners')}</option>
          <option value="none">{t('settlement.toolbar.noPartner')}</option>
          {partners.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <input type="month" className="input w-auto py-2" value={month} onChange={(e) => setMonth(e.target.value)} aria-label={t('settlement.toolbar.month')} title={t('settlement.toolbar.month')} />
        <label className="flex items-center gap-1.5 text-sm text-ink">
          <input type="checkbox" className="size-4 accent-primary" checked={unpaidOnly} onChange={(e) => setUnpaidOnly(e.target.checked)} />
          {t('settlement.toolbar.unpaidOnly')}
        </label>
        {filtersOn && (
          <button
            type="button"
            className="text-xs font-semibold text-link hover:underline"
            onClick={() => {
              setQ('');
              setStage('');
              setPartnerFilter('');
              setMonth('');
              setUnpaidOnly(false);
            }}
          >
            {t('settlement.toolbar.clearFilters')}
          </button>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <form
            className="flex items-center gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              void addRow();
            }}
          >
            <input className="input w-48 py-2" value={newName} maxLength={160} onChange={(e) => setNewName(e.target.value)} placeholder={t('settlement.toolbar.newRowPlaceholder')} />
            <button type="submit" className="btn-secondary btn-sm" disabled={!newName.trim()}>
              <Plus className="size-4" /> {t('settlement.toolbar.newRow')}
            </button>
          </form>
          <button type="button" className="btn-secondary btn-sm" onClick={undo} disabled={!dirtyCount} title="Ctrl+Z">
            <Undo2 className="size-4" /> {t('settlement.toolbar.undo')}
          </button>
          <button type="button" className="btn-primary btn-sm" onClick={() => void save()} disabled={!dirtyCount || saving} title="Ctrl+S">
            <Save className="size-4" /> {t('settlement.toolbar.save')}
            {dirtyCount > 0 && <span className="rounded bg-white/25 px-1.5 text-[11px]">{dirtyCount}</span>}
          </button>
        </div>
      </div>

      {/* Bulk bar */}
      {selectedIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary/[0.06] px-3 py-2 text-sm">
          <span className="font-semibold text-ink">{t('settlement.bulk.selected', { count: selectedIds.length })}</span>
          <button type="button" className="btn-secondary btn-sm" onClick={() => void markPaid(selectedIds.map((id) => ({ id, beneficiaryId: '*' })), true)}>
            <CheckCheck className="size-4" /> {t('settlement.bulk.markPaid')}
          </button>
          <button type="button" className="btn-secondary btn-sm" onClick={() => void markPaid(selectedIds.map((id) => ({ id, beneficiaryId: '*' })), false)}>
            {t('settlement.bulk.markUnpaid')}
          </button>
          <button type="button" className="btn-secondary btn-sm" onClick={() => void recalc(selectedIds)}>
            <RotateCcw className="size-4" /> {t('settlement.bulk.recalc')}
          </button>
          <form
            className="flex items-center gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              void bulkMove();
            }}
          >
            <input className="input w-40 py-1.5" list="settlement-projects" value={moveTo} onChange={(e) => setMoveTo(e.target.value)} placeholder={t('settlement.bulk.movePrompt')} maxLength={80} />
            <datalist id="settlement-projects">
              {data.projects.map((p) => (
                <option key={p.name} value={p.name} />
              ))}
            </datalist>
            <button type="submit" className="btn-secondary btn-sm" disabled={!moveTo.trim()}>
              <FolderInput className="size-4" /> {t('settlement.bulk.move')}
            </button>
          </form>
          {canManage && (
            <button type="button" className="btn-danger btn-sm" onClick={() => void bulkDelete()}>
              <Trash2 className="size-4" /> {t('settlement.bulk.delete')}
            </button>
          )}
          <button type="button" className="ml-auto rounded-lg p-1 text-muted hover:text-ink" onClick={() => setSelected(new Set())} aria-label={t('settlement.bulk.clear')} title={t('settlement.bulk.clear')}>
            <X className="size-4" />
          </button>
        </div>
      )}

      {/* Table + sheet tabs */}
      <div className="flex min-w-0 flex-col">
        <div className="h-[calc(100dvh-330px)] min-h-[380px] min-w-0">
          <SettlementTable rows={viewRows} cols={cols} partners={partners} selected={selected} allSelected={allSelected} totals={totals} actions={actions} emptyText={t('settlement.empty')} />
        </div>
        <nav className="flex min-w-0 gap-0.5 overflow-x-auto border-t border-line px-1 [scrollbar-width:thin]" aria-label={t('settlement.tabs.projects')}>
          {tabBtn('all', tab.kind === 'all', t('settlement.tabs.all'), () => setTab({ kind: 'all' }), rows.length)}
          {projectTabs.map((p) => tabBtn(`p:${p.name}`, sameTab(tab, { kind: 'project', name: p.name }), p.name, () => setTab({ kind: 'project', name: p.name }), p.count))}
          {canManage && tab.kind === 'project' && (
            <button type="button" className="shrink-0 self-start rounded-b-lg px-2 py-1.5 text-muted transition hover:bg-card/60 hover:text-ink" title={t('settlement.rename.button')} aria-label={t('settlement.rename.button')} onClick={() => setRenaming(tab.name)}>
              <Pencil className="size-3.5" aria-hidden />
            </button>
          )}
          {partnerTabs.length > 0 && <span className="mx-1 my-1.5 w-px shrink-0 bg-line" />}
          {partnerTabs.map((p) =>
            tabBtn(`r:${p.id}`, sameTab(tab, { kind: 'partner', id: p.id }), p.name, () => setTab({ kind: 'partner', id: p.id }), rows.filter((r) => r.partnerId === p.id).length),
          )}
          <span className="mx-1 my-1.5 w-px shrink-0 bg-line" />
          {tabBtn('unpaid', tab.kind === 'unpaid', t('settlement.tabs.unpaid'), () => setTab({ kind: 'unpaid' }), unpaidCount)}
        </nav>
        <p className="mt-1 hidden text-[11px] text-muted sm:block">{t('settlement.shortcuts')}</p>
      </div>

      {dialog === 'import' && <ImportDialog onClose={() => setDialog(null)} onDone={reloadAll} />}
      {dialog === 'rowImport' && <RowImportDialog onClose={() => setDialog(null)} onDone={reloadAll} />}
      {dialog === 'rules' && <RulesDialog beneficiaries={beneficiaries} rate={data.settings.eurAzn} canManage={canManage} onClose={() => setDialog(null)} onSaved={reloadAll} />}
      {renaming && (
        <RenameProjectDialog
          name={renaming}
          onClose={() => setRenaming(null)}
          onRenamed={(to) => {
            setTab({ kind: 'project', name: to });
            reloadAll();
          }}
        />
      )}
      {linkRow && <LinkDialog row={linkRow} onClose={() => setLinkRow(null)} onLinked={(r) => mergeRows([r])} />}
      {isSuper && <AdminAiPanel variant="float" open={aiOpen} onClose={() => setAiOpen(false)} context={AI_CONTEXT} hint={t('aiAdmin.settlementsHint')} />}
    </div>
  );
}
