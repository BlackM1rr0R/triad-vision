import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { ArrowDown, ArrowUp, Columns3, CornerDownRight, ExternalLink, FileDown, Loader2, Plus, RefreshCw, RotateCcw, Save, Search, Sheet as SheetIcon, Trash2, X } from 'lucide-react';
import { api, errorCode } from '@/lib/api';
import { usePageTitle } from '@/lib/usePageTitle';
import { Spinner } from '@/components/ui/Spinner';
import { Modal } from '@/components/ui/Modal';
import { registerCopy } from '@/i18n';
import { pagesSheet } from '@/i18n/pagesSheet';
import { Grid, Sep, ToolButton } from '@/components/sheet/Grid';
import { useLeaveGuard } from '@/components/sheet/useLeaveGuard';
import { parseDateText } from '@/components/sheet/model';
import type { CellChange, ColumnDef, GridSource } from '@/components/sheet/types';

registerCopy(pagesSheet);

type ColType = 'TEXT' | 'NUMBER' | 'DATE' | 'SELECT' | 'CHECKBOX';
type Value = string | number | boolean | null;

interface CustomColumn {
  id: string;
  label: string;
  type: ColType;
  options: string[];
  width: number;
  sortOrder: number;
}

interface Row {
  id: string;
  number: string;
  kind: 'main' | 'member';
  parentId: string | null;
  parentNumber: string | null;
  relation: string | null;
  firstName: string;
  lastName: string;
  passportNumber: string | null;
  birthDate: string | null;
  phone: string | null;
  email: string | null;
  visaType: string;
  category: string | null;
  partnerId: string | null;
  status: string;
  assignedStaffId: string | null;
  createdAt: string;
  decisionAt: string | null;
  _note: string;
  data: Record<string, string | number | boolean>;
}

interface RegisterResponse {
  rows: Row[];
  truncated: boolean;
  columns: CustomColumn[];
  options: { partners: { id: string; name: string; active: boolean }[]; staff: { id: string; name: string }[]; visaTypes: string[] };
  canManageColumns: boolean;
}

interface Field {
  field: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'select' | 'checkbox';
  width: number;
  readOnly?: boolean;
  /** Read-only for family-member rows (stored on the main applicant). */
  memberReadOnly?: boolean;
  options?: { value: string; label: string }[];
  custom?: boolean;
}

const FIXED: { field: string; type: Field['type']; width: number; readOnly?: boolean; memberReadOnly?: boolean }[] = [
  { field: 'number', type: 'text', width: 150, readOnly: true },
  { field: 'firstName', type: 'text', width: 130 },
  { field: 'lastName', type: 'text', width: 140 },
  { field: 'passportNumber', type: 'text', width: 120, memberReadOnly: true },
  { field: 'birthDate', type: 'date', width: 110 },
  { field: 'phone', type: 'text', width: 140, memberReadOnly: true },
  { field: 'email', type: 'text', width: 200, readOnly: true },
  { field: 'visaType', type: 'select', width: 140 },
  { field: 'category', type: 'text', width: 160, readOnly: true },
  { field: 'partnerId', type: 'select', width: 150 },
  { field: 'status', type: 'text', width: 170, readOnly: true },
  { field: 'assignedStaffId', type: 'select', width: 160 },
  { field: 'createdAt', type: 'date', width: 110, readOnly: true },
  { field: 'decisionAt', type: 'date', width: 110, readOnly: true },
  { field: '_note', type: 'text', width: 240 },
];

const WIDTHS_KEY = 'tv-register-widths';
const readWidths = (): Record<string, number> => {
  try {
    return JSON.parse(localStorage.getItem(WIDTHS_KEY) ?? '{}') as Record<string, number>;
  } catch {
    return {};
  }
};

const pkey = (caseId: string, field: string) => `${caseId}\u0000${field}`;
const dmy = (iso: string | null | undefined) => {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return d && m && y ? `${d}.${m}.${y}` : iso;
};

const rowValue = (row: Row, f: Field): Value => {
  if (f.custom) return row.data[f.field] ?? null;
  const v = (row as unknown as Record<string, unknown>)[f.field];
  return v === undefined ? null : (v as Value);
};

/** Typed text (editor, paste) → value of a field, or the text itself so the server explains what is wrong. */
const parseFor = (f: Field, raw: string): Value => {
  const s = raw.trim();
  switch (f.type) {
    case 'checkbox':
      return ['true', '1', 'yes', 'x', '✓', 'ja', 'bəli', 'да'].includes(s.toLowerCase());
    case 'number': {
      if (!s) return null;
      const n = Number(s.replace(/\s/g, '').replace(',', '.'));
      return Number.isFinite(n) ? n : s;
    }
    case 'date': {
      if (!s) return null;
      const d = parseDateText(s);
      return d ? `${d[0]}-${String(d[1]).padStart(2, '0')}-${String(d[2]).padStart(2, '0')}` : s;
    }
    case 'select': {
      if (!s) return null;
      const opt = f.options?.find((o) => o.value === s) ?? f.options?.find((o) => o.label.toLocaleLowerCase() === s.toLocaleLowerCase());
      return opt ? opt.value : s;
    }
    default:
      return raw;
  }
};

const same = (a: Value, b: Value) => (a ?? '') === (b ?? '') || (a === false && b === null) || (a === null && b === false);

/**
 * Client register (/admin/register): every application as one row of an Excel-like table — the
 * client's data, the case's fixed fields and admin-defined extra columns. Edits stay highlighted until
 * saved as one batch; the server validates each change.
 */
export default function AdminClientRegister() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  usePageTitle(t('register.title'));
  const query = useQuery({
    queryKey: ['admin', 'register'],
    queryFn: async () => (await api.get<RegisterResponse>('/admin/register')).data,
    refetchOnWindowFocus: false,
  });
  const data = query.data;
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    if (data) setRows(data.rows);
  }, [data]);

  // ── pending edits with undo / redo ──
  const [pending, setPendingState] = useState<Map<string, Value>>(new Map());
  const pendingRef = useRef(pending);
  const past = useRef<Map<string, Value>[]>([]);
  const future = useRef<Map<string, Value>[]>([]);
  const setPending = useCallback((next: Map<string, Value>, record = true) => {
    if (record) {
      past.current.push(pendingRef.current);
      if (past.current.length > 100) past.current.shift();
      future.current = [];
    }
    pendingRef.current = next;
    setPendingState(next);
  }, []);
  const [errors, setErrors] = useState<Map<string, string>>(new Map());
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  // The grid filters once typing pauses (the input itself stays instant).
  const [quickFilter, setQuickFilter] = useState('');
  useEffect(() => {
    const timer = window.setTimeout(() => setQuickFilter(search), search ? 150 : 0);
    return () => window.clearTimeout(timer);
  }, [search]);
  const [widths, setWidths] = useState(readWidths);
  const [manageOpen, setManageOpen] = useState(false);

  useLeaveGuard(pending.size > 0, t('register.leaveWarning'));

  const fields = useMemo<Field[]>(() => {
    if (!data) return [];
    const visaOptions = data.options.visaTypes.map((v) => ({ value: v, label: t(`register.visaTypes.${v}`, { defaultValue: v }) }));
    const partnerOptions = data.options.partners.map((p) => ({ value: p.id, label: p.active ? p.name : `${p.name} (${t('register.inactive')})` }));
    const staffOptions = data.options.staff.map((s) => ({ value: s.id, label: s.name }));
    const fixed: Field[] = FIXED.map((f) => ({
      ...f,
      label: t(`register.columns.${f.field}`),
      width: widths[f.field] ?? f.width,
      options: f.field === 'visaType' ? visaOptions : f.field === 'partnerId' ? partnerOptions : f.field === 'assignedStaffId' ? staffOptions : undefined,
    }));
    const custom: Field[] = data.columns.map((c) => ({
      field: c.id,
      label: c.label,
      type: c.type.toLowerCase() as Field['type'],
      width: widths[c.id] ?? c.width,
      options: c.type === 'SELECT' ? c.options.map((o) => ({ value: o, label: o })) : undefined,
      custom: true,
    }));
    return [...fixed, ...custom];
  }, [data, t, widths]);

  const valueOf = useCallback(
    (row: Row, f: Field): Value => {
      const k = pkey(row.id, f.field);
      return pending.has(k) ? pending.get(k)! : rowValue(row, f);
    },
    [pending],
  );

  const display = useCallback(
    (row: Row, f: Field): string => {
      const v = valueOf(row, f);
      if (v === null || v === undefined || v === '') return '';
      if (f.field === 'status') return t(`register.statuses.${v}`, { defaultValue: String(v) });
      if (f.type === 'date') return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? dmy(v) : String(v);
      if (f.type === 'select') return f.options?.find((o) => o.value === v)?.label ?? String(v);
      if (f.type === 'checkbox') return v ? '✓' : '';
      if (f.type === 'number' && typeof v === 'number') return v.toLocaleString(undefined, { maximumFractionDigits: 6 });
      return String(v);
    },
    [valueOf, t],
  );

  // Per-row caches, kept while the labels stay the same: search text and the custom cell content (links),
  // so memoised grid cells keep the same elements and skip re-rendering.
  const searchCache = useMemo(() => new WeakMap<Row, string>(), [fields, t]);
  const nodeCache = useMemo(() => new WeakMap<Row, Partial<Record<'number' | 'status', ReactNode>>>(), [t]);
  const pendingRows = useMemo(() => {
    const ids = new Set<string>();
    for (const k of pending.keys()) ids.add(k.slice(0, k.indexOf('\u0000')));
    return ids;
  }, [pending]);

  const source = useMemo<GridSource | null>(() => {
    if (!data) return null;
    const rowText = (row: Row) => fields.map((f) => display(row, f)).join('\u0001').toLocaleLowerCase();
    return {
      rowCount: rows.length,
      colCount: fields.length,
      column: (c): ColumnDef => {
        const f = fields[c];
        return { label: f.label, width: f.width, type: f.type, options: f.options, readOnly: f.readOnly, title: f.label };
      },
      raw: (r, c) => {
        const f = fields[c];
        const v = valueOf(rows[r], f);
        if (v === null || v === undefined) return '';
        if (f.type === 'checkbox') return v ? 'true' : '';
        if (f.type === 'date' && typeof v === 'string') return v.slice(0, 10);
        return String(v);
      },
      display: (r, c) => display(rows[r], fields[c]),
      value: (r, c) => {
        const f = fields[c];
        const v = valueOf(rows[r], f);
        if (f.type === 'select' || f.field === 'status') return display(rows[r], f) || null;
        return v;
      },
      readOnly: (r, c) => !!fields[c].memberReadOnly && rows[r].kind === 'member',
      cellClass: (r, c) => {
        const k = pkey(rows[r].id, fields[c].field);
        if (errors.has(k)) return 'bg-danger/15! ring-1 ring-inset ring-danger';
        if (pending.has(k)) return 'bg-warning/20!';
        return undefined;
      },
      cellTitle: (r, c) => {
        const e = errors.get(pkey(rows[r].id, fields[c].field));
        return e ? t(`register.errors.${e}`, { defaultValue: e }) : undefined;
      },
      searchText: (r) => {
        const row = rows[r];
        if (pendingRows.has(row.id)) return rowText(row);
        let s = searchCache.get(row);
        if (s === undefined) searchCache.set(row, (s = rowText(row)));
        return s;
      },
      renderCell: (r, c) => {
        const f = fields[c];
        if (f.field !== 'number' && f.field !== 'status') return undefined;
        const row = rows[r];
        let nodes = nodeCache.get(row);
        if (!nodes) nodeCache.set(row, (nodes = {}));
        if (f.field in nodes) return nodes[f.field as 'number' | 'status'];
        let node: ReactNode;
        if (f.field === 'number') {
          node = (
            <span className="flex items-center gap-1">
              {row.kind === 'member' && <CornerDownRight size={12} className="shrink-0 text-muted" aria-label={t('register.member')} />}
              <Link to={`/admin/cases/${row.id}`} className="truncate font-semibold text-brand-600 hover:underline" title={t('register.openCase')}>
                {row.number}
              </Link>
              <ExternalLink size={11} className="shrink-0 text-muted" />
            </span>
          );
        } else node = <span className="truncate text-xs font-semibold">{display(row, f)}</span>;
        nodes[f.field as 'number' | 'status'] = node;
        return node;
      },
      rowClass: (r) => (rows[r].kind === 'member' ? 'opacity-95 [&_[role=gridcell]]:bg-surface/40' : undefined),
    };
  }, [data, rows, fields, valueOf, display, errors, pending, pendingRows, searchCache, nodeCache, t]);

  // Fill the search cache in idle time, so the first search does not stall the page.
  useEffect(() => {
    const text = source?.searchText;
    if (!source || !text) return;
    const idle = window.requestIdleCallback ?? ((cb: IdleRequestCallback) => window.setTimeout(() => cb({ didTimeout: false, timeRemaining: () => 8 }), 50));
    const cancel = window.cancelIdleCallback ?? window.clearTimeout;
    let r = 0;
    let handle = 0;
    const step = (d: IdleDeadline) => {
      while (r < source.rowCount && d.timeRemaining() > 2) text(r++);
      if (r < source.rowCount) handle = idle(step);
    };
    handle = idle(step);
    return () => cancel(handle);
  }, [source]);

  const onCommit = useCallback(
    (changes: CellChange[]) => {
      const next = new Map(pendingRef.current);
      const errs = new Map(errors);
      for (const ch of changes) {
        const row = rows[ch.r];
        const f = fields[ch.c];
        if (!row || !f || f.readOnly || (f.memberReadOnly && row.kind === 'member')) continue;
        const v = parseFor(f, ch.raw);
        const k = pkey(row.id, f.field);
        if (same(v, rowValue(row, f))) next.delete(k);
        else next.set(k, v);
        errs.delete(k);
      }
      setErrors(errs);
      setPending(next);
    },
    [rows, fields, errors, setPending],
  );

  const undo = () => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(pendingRef.current);
    setPending(prev, false);
  };
  const redo = () => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(pendingRef.current);
    setPending(next, false);
  };

  const save = useCallback(async () => {
    if (!pendingRef.current.size || saving) return;
    setSaving(true);
    const sent = new Map(pendingRef.current);
    const changes = [...sent].map(([k, value]) => {
      const [caseId, field] = k.split('\u0000');
      return { caseId, field, value: typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? value : null };
    });
    try {
      const res = await api.patch<{ results: { caseId: string; field: string; ok: boolean; error?: string }[]; saved: number; failed: number; rows: Row[] }>('/admin/register', { changes });
      const fresh = new Map(res.data.rows.map((r) => [r.id, r]));
      setRows((all) => all.map((r) => fresh.get(r.id) ?? r));
      const next = new Map(pendingRef.current);
      const errs = new Map<string, string>();
      for (const r of res.data.results) {
        const k = pkey(r.caseId, r.field);
        if (r.ok) {
          // Only drop what was sent unchanged (the user may have typed again meanwhile).
          if (next.has(k) && same(next.get(k)!, sent.get(k)!)) next.delete(k);
        } else if (r.error) errs.set(k, r.error);
      }
      past.current = [];
      future.current = [];
      setPending(next, false);
      setErrors(errs);
      if (res.data.failed) toast.error(t('register.savedWithErrors', { saved: res.data.saved, failed: res.data.failed }));
      else toast.success(t('register.saved', { count: res.data.saved }));
    } catch (err) {
      toast.error(t(`register.errors.${errorCode(err)}`, { defaultValue: t('register.errors.generic') }));
    } finally {
      setSaving(false);
    }
  }, [saving, setPending, t]);

  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        void saveRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const discard = () => {
    // TODO(ui): ConfirmDialog
    if (!pending.size || !window.confirm(t('register.discardConfirm'))) return;
    setPending(new Map());
    setErrors(new Map());
  };

  const refresh = async () => {
    // TODO(ui): ConfirmDialog
    if (pending.size && !window.confirm(t('register.refreshConfirm'))) return;
    setPending(new Map(), false);
    setErrors(new Map());
    await query.refetch();
  };

  const onColWidth = (c: number, w: number) => {
    const f = fields[c];
    if (!f) return;
    const next = { ...widths, [f.field]: w };
    setWidths(next);
    try {
      localStorage.setItem(WIDTHS_KEY, JSON.stringify(next));
    } catch {
      /* private mode */
    }
  };

  const exportXlsx = () => {
    const a = document.createElement('a');
    a.href = '/api/admin/register/export.xlsx';
    a.download = '';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const members = rows.filter((r) => r.kind === 'member').length;

  return (
    <div className="flex h-[calc(100dvh-9rem)] min-h-[520px] flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-display text-2xl font-extrabold text-ink">
            <SheetIcon className="text-emerald-600" size={24} /> {t('register.title')}
          </h1>
          <p className="text-sm text-muted">{t('register.subtitle')}</p>
        </div>
        <div className="relative w-full max-w-xs">
          <Search size={15} className="absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
          <input className="input py-2 pl-9" placeholder={t('register.search')} value={search} onChange={(e) => setSearch(e.target.value)} aria-label={t('register.search')} />
          {search && (
            <button type="button" onClick={() => setSearch('')} className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-muted hover:text-ink" aria-label={t('sheet.close')}>
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="card min-h-0 flex-1 overflow-hidden">
        {query.isLoading || !source ? (
          <div className="grid h-full place-items-center">
            {query.isError ? <p className="text-sm text-danger">{t('register.errors.generic')}</p> : <Spinner />}
          </div>
        ) : (
          <Grid
            source={source}
            mode="table"
            onCommit={onCommit}
            onUndo={undo}
            onRedo={redo}
            canUndo={past.current.length > 0}
            canRedo={future.current.length > 0}
            onSave={() => void save()}
            onColWidth={onColWidth}
            quickFilter={quickFilter}
            toolbarStart={
              <>
                <button type="button" onClick={() => void save()} disabled={!pending.size || saving} className={clsx('btn-primary btn-sm mr-1', (!pending.size || saving) && 'opacity-60')} title="Ctrl+S">
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} {t('register.save')}
                  {pending.size > 0 && <span className="rounded-full bg-white/25 px-1.5 text-[11px]">{pending.size}</span>}
                </button>
                <ToolButton label={t('register.discard')} disabled={!pending.size} onClick={discard}>
                  <RotateCcw size={16} />
                </ToolButton>
                <ToolButton label={t('register.refresh')} onClick={() => void refresh()}>
                  <RefreshCw size={16} />
                </ToolButton>
                <Sep />
              </>
            }
            toolbarEnd={
              <>
                <ToolButton label={t('register.export')} onClick={exportXlsx}>
                  <FileDown size={16} />
                </ToolButton>
                {data?.canManageColumns && (
                  <button type="button" onClick={() => setManageOpen(true)} className="flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-semibold text-ink/80 hover:bg-surface">
                    <Columns3 size={15} /> {t('register.manageColumns')}
                  </button>
                )}
              </>
            }
            statusExtra={
              <span>
                {t('register.status', { rows: rows.length, members })}
                {data?.truncated ? ` · ${t('register.truncated')}` : ''}
                {errors.size > 0 && <b className="ml-2 text-danger">{t('register.errorCount', { count: errors.size })}</b>}
              </span>
            }
          />
        )}
      </div>

      {manageOpen && data && (
        <ManageColumns
          columns={data.columns}
          onClose={() => setManageOpen(false)}
          onChanged={() => void qc.invalidateQueries({ queryKey: ['admin', 'register'] })}
        />
      )}
    </div>
  );
}

const TYPES: ColType[] = ['TEXT', 'NUMBER', 'DATE', 'SELECT', 'CHECKBOX'];

/** ADMIN+: add, rename, retype, reorder and delete the register's extra columns. */
function ManageColumns({ columns, onClose, onChanged }: { columns: CustomColumn[]; onClose: () => void; onChanged: () => void }) {
  const { t } = useTranslation();
  const [list, setList] = useState(columns);
  const [draft, setDraft] = useState<{ label: string; type: ColType; options: string }>({ label: '', type: 'TEXT', options: '' });
  const [busy, setBusy] = useState(false);
  useEffect(() => setList(columns), [columns]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      onChanged();
    } catch (err) {
      toast.error(t(`register.errors.${errorCode(err)}`, { defaultValue: t('register.errors.generic') }));
    } finally {
      setBusy(false);
    }
  };
  const opts = (s: string) => s.split(/[\n,]/).map((x) => x.trim()).filter(Boolean);

  const add = () =>
    run(async () => {
      const res = await api.post<{ column: CustomColumn }>('/admin/register/columns', {
        label: draft.label.trim(),
        type: draft.type,
        ...(draft.type === 'SELECT' ? { options: opts(draft.options) } : {}),
      });
      setList((l) => [...l, res.data.column]);
      setDraft({ label: '', type: 'TEXT', options: '' });
    });

  const update = (c: CustomColumn, patch: Partial<{ label: string; type: ColType; options: string[]; width: number }>) =>
    run(async () => {
      const res = await api.patch<{ column: CustomColumn }>(`/admin/register/columns/${c.id}`, patch);
      setList((l) => l.map((x) => (x.id === c.id ? res.data.column : x)));
    });

  const remove = (c: CustomColumn) => {
    // TODO(ui): ConfirmDialog
    if (!window.confirm(t('register.manage.confirmDelete', { label: c.label }))) return;
    void run(async () => {
      await api.delete(`/admin/register/columns/${c.id}`);
      setList((l) => l.filter((x) => x.id !== c.id));
    });
  };

  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    const next = list.slice();
    [next[i], next[j]] = [next[j], next[i]];
    setList(next);
    void run(() => api.put('/admin/register/columns/order', { ids: next.map((c) => c.id) }));
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      zIndex={90}
      closeLabel={t('sheet.close')}
      title={
        <span className="flex items-center gap-2">
          <Columns3 size={18} /> {t('register.manageColumns')}
        </span>
      }
      footer={
        <div className="w-full">
          <div className="mb-2 text-xs font-bold tracking-wide text-muted uppercase">{t('register.manage.add')}</div>
          <div className="flex flex-wrap items-start gap-2">
            <input className="input w-48 py-2" placeholder={t('register.manage.label')} value={draft.label} maxLength={80} onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
            <select className="input w-36 py-2" value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as ColType })} aria-label={t('register.manage.type')}>
              {TYPES.map((ty) => (
                <option key={ty} value={ty}>
                  {t(`register.types.${ty}`)}
                </option>
              ))}
            </select>
            {draft.type === 'SELECT' && <textarea className="input min-h-10 w-56 py-2" rows={2} placeholder={t('register.manage.options')} value={draft.options} onChange={(e) => setDraft({ ...draft, options: e.target.value })} />}
            <button type="button" disabled={busy || !draft.label.trim() || (draft.type === 'SELECT' && !opts(draft.options).length)} onClick={() => void add()} className="btn-primary btn-sm disabled:opacity-50">
              <Plus size={14} /> {t('register.manage.addButton')}
            </button>
          </div>
        </div>
      }
    >
          <p className="mb-3 text-sm text-muted">{t('register.manage.hint')}</p>
          {!list.length && <p className="rounded-lg border border-dashed border-line p-4 text-center text-sm text-muted">{t('register.manage.empty')}</p>}
          <ul className="space-y-2">
            {list.map((c, i) => (
              <ColumnRow key={c.id} column={c} first={i === 0} last={i === list.length - 1} busy={busy} onUp={() => move(i, -1)} onDown={() => move(i, 1)} onSave={(p) => void update(c, p)} onDelete={() => remove(c)} />
            ))}
          </ul>
    </Modal>
  );
}

function ColumnRow({
  column,
  first,
  last,
  busy,
  onUp,
  onDown,
  onSave,
  onDelete,
}: {
  column: CustomColumn;
  first: boolean;
  last: boolean;
  busy: boolean;
  onUp: () => void;
  onDown: () => void;
  onSave: (p: Partial<{ label: string; type: ColType; options: string[]; width: number }>) => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const [label, setLabel] = useState(column.label);
  const [type, setType] = useState<ColType>(column.type);
  const [options, setOptions] = useState(column.options.join('\n'));
  const [width, setWidth] = useState(column.width);
  const optList = options.split(/[\n,]/).map((x) => x.trim()).filter(Boolean);
  const changed = label.trim() !== column.label || type !== column.type || width !== column.width || (type === 'SELECT' && optList.join('\n') !== column.options.join('\n'));
  return (
    <li className="flex flex-wrap items-start gap-2 rounded-xl border border-line p-2.5">
      <div className="flex flex-col">
        <button type="button" disabled={first || busy} onClick={onUp} className="rounded p-0.5 text-muted hover:bg-surface disabled:opacity-30" aria-label={t('register.manage.up')}>
          <ArrowUp size={14} />
        </button>
        <button type="button" disabled={last || busy} onClick={onDown} className="rounded p-0.5 text-muted hover:bg-surface disabled:opacity-30" aria-label={t('register.manage.down')}>
          <ArrowDown size={14} />
        </button>
      </div>
      <input className="input w-44 py-1.5" value={label} maxLength={80} onChange={(e) => setLabel(e.target.value)} aria-label={t('register.manage.label')} />
      <select className="input w-32 py-1.5" value={type} onChange={(e) => setType(e.target.value as ColType)} aria-label={t('register.manage.type')}>
        {TYPES.map((ty) => (
          <option key={ty} value={ty}>
            {t(`register.types.${ty}`)}
          </option>
        ))}
      </select>
      <input type="number" min={60} max={800} step={10} className="input w-20 py-1.5" value={width} onChange={(e) => setWidth(Number(e.target.value) || 160)} aria-label={t('register.manage.width')} title={t('register.manage.width')} />
      {type === 'SELECT' && <textarea className="input min-h-9 w-48 py-1.5 text-xs" rows={2} value={options} onChange={(e) => setOptions(e.target.value)} placeholder={t('register.manage.options')} />}
      <div className="ml-auto flex gap-1">
        <button
          type="button"
          disabled={!changed || busy || !label.trim() || (type === 'SELECT' && !optList.length)}
          onClick={() => onSave({ label: label.trim(), type, width: Math.max(60, Math.min(800, width)), ...(type === 'SELECT' ? { options: optList } : {}) })}
          className="btn-primary btn-sm disabled:opacity-40"
        >
          <Save size={13} /> {t('register.manage.save')}
        </button>
        <button type="button" disabled={busy} onClick={onDelete} className="rounded-lg p-2 text-danger hover:bg-danger/10" aria-label={t('register.manage.delete')}>
          <Trash2 size={15} />
        </button>
      </div>
    </li>
  );
}
