import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useDriveLock } from '@/components/drive/collab/useDriveLock';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { AlertTriangle, ChevronRight, Download, Eye, FileSpreadsheet, FolderOpen, Loader2, Pencil, RefreshCw, Save, X } from 'lucide-react';
import { api, errorCode } from '@/lib/api';
import { usePageTitle } from '@/lib/usePageTitle';
import { Spinner } from '@/components/ui/Spinner';
import { contentUrl, startDownload } from '@/components/drive/api';
import { registerCopy } from '@/i18n';
import { pagesSheet } from '@/i18n/pagesSheet';
import { Grid } from '@/components/sheet/Grid';
import { FormatBar } from '@/components/sheet/Toolbar';
import { SheetTabs } from '@/components/sheet/SheetTabs';
import { useLeaveGuard } from '@/components/sheet/useLeaveGuard';
import { fromApi, toApi, toApiPatch, useWorkbook, validSheetName, type ApiSheet } from '@/components/sheet/useWorkbook';
import { formatValue } from '@/components/sheet/format';
import { impliedFormat } from '@/components/sheet/formula';
import { DEFAULT_COL_WIDTH, countCells, getCell, mergeIndex, rawOf, type Sheet } from '@/components/sheet/model';
import type { GridSource } from '@/components/sheet/types';

registerCopy(pagesSheet);

interface Crumb {
  id: string;
  name: string;
  space: string;
  system: boolean;
}

interface WorkbookResponse {
  id: string;
  name: string;
  version: number;
  size: number;
  parentId: string | null;
  canEdit: boolean;
  canDownload: boolean;
  path: Crumb[];
  limits: { cellsPerSheet: number; fileBytes: number; sheets: number };
  sheets: ApiSheet[];
}

const AUTOSAVE_KEY = 'tv-sheet-autosave';
const readAutosave = () => {
  try {
    return localStorage.getItem(AUTOSAVE_KEY) === '1';
  } catch {
    return false;
  }
};

const folderHref = (id: string) => `/workspace/drive/f/${encodeURIComponent(id)}`;

/** Grid source over one sheet of the workbook (values computed by the formula engine). */
const useSheetSource = (sheet: Sheet | undefined, index: number, engine: ReturnType<typeof useWorkbook>['engine'], engineRev: number): GridSource | null =>
  useMemo(() => {
    if (!sheet) return null;
    const rows = sheet.rows;
    const merges = sheet.merges.length ? mergeIndex(sheet.merges) : undefined;
    return {
      rowCount: sheet.rowCount,
      colCount: sheet.colCount,
      column: (c) => ({ width: sheet.colWidths[c] ?? DEFAULT_COL_WIDTH }),
      raw: (r, c) => rawOf(getCell(rows, r, c)),
      value: (r, c) => engine.value(index, r, c),
      display: (r, c) => {
        const cell = getCell(rows, r, c);
        if (!cell) return '';
        const v = cell.f ? engine.value(index, r, c) : cell.v;
        return formatValue(v, cell.s?.numFmt ?? (cell.f ? impliedFormat(cell.f) : undefined));
      },
      style: (r, c) => getCell(rows, r, c)?.s,
      merges,
    };
    // engineRev: computed values changed (an edit elsewhere can change formulas of this sheet).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheet, index, engine, engineRev]);

/**
 * .xlsx editor of the team drive (/workspace/sheet/:id): an Excel-like grid with formulas, formatting
 * and sheet tabs. Saving writes a new version of the same drive file (history keeps the old one).
 */
export default function SheetEditor() {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const wb = useWorkbook();
  const [meta, setMeta] = useState<Omit<WorkbookResponse, 'sheets'> | null>(null);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState<number | null>(null);
  const [autosave, setAutosave] = useState(readAutosave);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  const query = useQuery({
    queryKey: ['sheet', id],
    queryFn: async () => (await api.get<WorkbookResponse>(`/drive/sheets/${encodeURIComponent(id)}`)).data,
    enabled: !!id,
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
    retry: false,
  });

  // (Re)load the workbook whenever a fresh response arrives.
  useEffect(() => {
    if (!query.data) return;
    const { sheets, ...rest } = query.data;
    setMeta(rest);
    wb.load(sheets.map(fromApi));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data]);

  usePageTitle(meta?.name ?? t('sheet.title'));
  // Edit lock: while someone else edits this file the sheet opens read-only (it is retried every minute).
  const lock = useDriveLock(id, { enabled: !!meta?.canEdit });
  const readOnly = !meta?.canEdit || lock.status === 'other';
  useLeaveGuard(wb.dirty && !readOnly, t('sheet.leaveWarning'));

  const savingRef = useRef(false);
  const save = useCallback(
    async (force = false) => {
      if (!meta || readOnly || savingRef.current) return;
      const state = wb.saveState();
      const sent = state.sheets;
      const tooBig = sent.find((s) => countCells(s.rows) > meta.limits.cellsPerSheet);
      if (tooBig) {
        toast.error(t('sheet.errors.SHEET_TOO_LARGE'));
        return;
      }
      savingRef.current = true;
      setSaving(true);
      try {
        // Only the changed cells of existing sheets (a forced overwrite sends everything).
        const sheets = force || !state.saved ? toApi(sent, state.engine) : toApiPatch(sent, state.saved.sheets, state.engine);
        const body = JSON.stringify({ baseVersion: meta.version, force: force || undefined, sheets });
        const res = await api.put<{ version: number; size: number }>(`/drive/sheets/${encodeURIComponent(id)}`, body, {
          headers: { 'Content-Type': 'application/vnd.triad.sheet+json' },
        });
        setMeta((m) => (m ? { ...m, version: res.data.version, size: res.data.size } : m));
        wb.markSaved({ sheets: sent, id: state.id });
        setLastSaved(new Date());
        setConflict(null);
        void qc.invalidateQueries({ queryKey: ['drive'] });
        toast.success(t('sheet.saved', { version: res.data.version }));
      } catch (err) {
        const code = errorCode(err);
        if (code === 'VERSION_CONFLICT') {
          const cur = (err as { response?: { data?: { currentVersion?: number } } }).response?.data?.currentVersion ?? null;
          setConflict(cur ?? meta.version + 1);
          setAutosave(false);
        } else toast.error(t(`sheet.errors.${code}`, { defaultValue: t('sheet.errors.generic') }));
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
    },
    [meta, readOnly, wb, id, qc, t],
  );

  // Autosave every 30 s while there are unsaved changes.
  const saveRef = useRef(save);
  saveRef.current = save;
  const dirtyRef = useRef(wb.dirty);
  dirtyRef.current = wb.dirty;
  useEffect(() => {
    try {
      localStorage.setItem(AUTOSAVE_KEY, autosave ? '1' : '0');
    } catch {
      /* private mode */
    }
    if (!autosave || readOnly) return;
    const timer = window.setInterval(() => {
      if (dirtyRef.current) void saveRef.current();
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [autosave, readOnly]);

  // Ctrl+S anywhere on the page (the grid handles it when focused, this covers the header).
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

  const source = useSheetSource(wb.sheet, wb.active, wb.engine, wb.engineRev);

  const rename = async (name: string) => {
    if (!meta) return;
    const ext = meta.name.match(/\.[^.]+$/)?.[0] ?? '.xlsx';
    const next = name.trim().replace(/\.xlsx$/i, '') + ext;
    setRenaming(null);
    if (!name.trim() || next === meta.name) return;
    try {
      await api.patch(`/drive/nodes/${encodeURIComponent(id)}`, { name: next });
      setMeta((m) => (m ? { ...m, name: next } : m));
      void qc.invalidateQueries({ queryKey: ['drive'] });
    } catch (err) {
      toast.error(t(`sheet.errors.${errorCode(err)}`, { defaultValue: t('sheet.errors.generic') }));
    }
  };

  const reload = async () => {
    setConflict(null);
    await query.refetch();
  };

  if (query.isLoading) {
    return (
      <div className="grid h-full place-items-center">
        <Spinner />
      </div>
    );
  }
  if (query.isError || !meta || !source) {
    const code = query.isError ? errorCode(query.error) : 'generic';
    return (
      <div className="grid h-full place-items-center p-6">
        <div className="max-w-md text-center">
          <AlertTriangle className="mx-auto mb-3 text-warning" size={36} />
          <h1 className="mb-2 text-lg font-bold text-ink">{t('sheet.openFailed')}</h1>
          <p className="mb-5 text-sm text-muted">{t(`sheet.errors.${code}`, { defaultValue: t('sheet.errors.generic') })}</p>
          <Link to="/workspace/drive" className="btn-primary btn-sm">
            <FolderOpen size={15} /> {t('sheet.backToDrive')}
          </Link>
        </div>
      </div>
    );
  }

  const parentCrumbs = meta.path.slice(0, -1);
  const folderId = meta.parentId;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-card px-4 py-2.5">
        <FileSpreadsheet className="shrink-0 text-emerald-600" size={26} />
        <div className="min-w-0 flex-1">
          <nav aria-label={t('sheet.breadcrumbs')} className="flex min-w-0 items-center gap-1 text-xs text-muted">
            <Link to="/workspace/drive" className="hover:text-ink hover:underline">
              {t('sheet.drive')}
            </Link>
            {parentCrumbs.map((c) => (
              <span key={c.id} className="flex min-w-0 items-center gap-1">
                <ChevronRight size={12} className="shrink-0" />
                <Link to={folderHref(c.id)} className="truncate hover:text-ink hover:underline">
                  {c.name}
                </Link>
              </span>
            ))}
          </nav>
          <div className="flex min-w-0 items-center gap-2">
            {renaming !== null ? (
              <input
                autoFocus
                value={renaming}
                onChange={(e) => setRenaming(e.target.value)}
                onBlur={() => void rename(renaming)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void rename(renaming);
                  if (e.key === 'Escape') setRenaming(null);
                }}
                className="input w-72 py-1 text-base font-semibold"
              />
            ) : (
              <h1 className="truncate font-display text-base font-bold text-ink">{meta.name}</h1>
            )}
            {!readOnly && renaming === null && (
              <button type="button" onClick={() => setRenaming(meta.name.replace(/\.xlsx$/i, ''))} className="rounded p-1 text-muted hover:bg-surface hover:text-ink" title={t('sheet.rename')} aria-label={t('sheet.rename')}>
                <Pencil size={14} />
              </button>
            )}
            <span className="badge shrink-0 bg-surface text-muted" title={t('sheet.versionHint')}>
              v{meta.version}
            </span>
            {readOnly ? (
              <span className="badge shrink-0 bg-warning/15 text-warning">
                <Eye size={12} /> {t('sheet.readOnly')}
              </span>
            ) : wb.dirty ? (
              <span className="badge shrink-0 bg-warning/15 text-warning">{t('sheet.unsaved')}</span>
            ) : lastSaved ? (
              <span className="text-xs text-muted">{t('sheet.savedAt', { time: lastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) })}</span>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {folderId && (
            <Link to={folderHref(folderId)} className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold text-muted hover:bg-surface hover:text-ink">
              <FolderOpen size={15} /> <span className="hidden sm:inline">{t('sheet.openFolder')}</span>
            </Link>
          )}
          {meta.canDownload && (
            <button
              type="button"
              onClick={() => {
                if (wb.dirty) toast.message(t('sheet.downloadSavedVersion'));
                startDownload(contentUrl(id, true));
              }}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold text-muted hover:bg-surface hover:text-ink"
            >
              <Download size={15} /> <span className="hidden sm:inline">{t('sheet.download')}</span>
            </button>
          )}
          {!readOnly && (
            <>
              <label className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-muted select-none" title={t('sheet.autosaveHint')}>
                <input type="checkbox" checked={autosave} onChange={(e) => setAutosave(e.target.checked)} className="accent-brand-600" />
                {t('sheet.autosave')}
              </label>
              <button type="button" onClick={() => void save()} disabled={saving || !wb.dirty} className={clsx('btn-primary btn-sm', (!wb.dirty || saving) && 'opacity-60')} title="Ctrl+S">
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} {t('sheet.save')}
              </button>
            </>
          )}
        </div>
      </header>

      {conflict !== null && (
        <div role="alert" className="flex flex-wrap items-center gap-3 border-b border-warning/40 bg-warning/10 px-4 py-2 text-sm text-ink">
          <AlertTriangle size={16} className="text-warning" />
          <span className="flex-1">{t('sheet.conflict', { version: conflict })}</span>
          <button type="button" onClick={() => void reload()} className="flex items-center gap-1 rounded-lg border border-line bg-card px-3 py-1 text-xs font-semibold hover:bg-surface">
            <RefreshCw size={13} /> {t('sheet.conflictReload')}
          </button>
          <button
            type="button"
            onClick={() => {
              if (window.confirm(t('sheet.conflictOverwriteConfirm'))) void save(true);
            }}
            className="flex items-center gap-1 rounded-lg bg-danger px-3 py-1 text-xs font-semibold text-white hover:brightness-110"
          >
            <Save size={13} /> {t('sheet.conflictOverwrite')}
          </button>
          <button type="button" onClick={() => setConflict(null)} className="rounded p-1 text-muted hover:bg-card" aria-label={t('sheet.close')}>
            <X size={14} />
          </button>
        </div>
      )}

      {(lock.status === 'other' || lock.status === 'error') && (
        <div role="status" className="flex shrink-0 items-center gap-2 border-b border-amber-300 bg-amber-50 px-4 py-2 text-xs text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
          <span className="min-w-0 flex-1">{lock.status === 'other' ? t('driveCollab.lock.bannerOther', { name: lock.lockedBy.name }) : t('driveCollab.lock.bannerError')}</span>
          <button type="button" onClick={lock.retry} className="shrink-0 font-semibold underline">
            {t('driveCollab.lock.retry')}
          </button>
        </div>
      )}

      <div className="min-h-0 flex-1">
        <Grid
          key={wb.sheet?.key}
          source={source}
          mode="sheet"
          readOnly={readOnly}
          frozenRows={wb.sheet?.frozenRows ?? 0}
          onCommit={wb.commit}
          onFormat={wb.format}
          onStructure={wb.structure}
          onSort={wb.sort}
          onColWidth={wb.setColWidth}
          onUndo={wb.undo}
          onRedo={wb.redo}
          canUndo={wb.canUndo}
          canRedo={wb.canRedo}
          onSave={() => void save()}
          onToggleFreeze={wb.toggleFreeze}
          onGrow={wb.grow}
          formatBar={({ style, active, cells }) => (
            <FormatBar
              disabled={readOnly}
              style={style}
              active={active}
              cells={cells}
              onFormat={wb.format}
              frozen={(wb.sheet?.frozenRows ?? 0) > 0}
              onToggleFreeze={wb.toggleFreeze}
              onSort={wb.sort}
            />
          )}
          footer={
            <SheetTabs
              sheets={wb.sheets}
              active={wb.active}
              readOnly={readOnly}
              onSelect={wb.setActive}
              onAdd={wb.addSheet}
              onRename={wb.renameSheet}
              onDelete={wb.deleteSheet}
              onMove={wb.moveSheet}
              isValidName={(name, key) => validSheetName(name, wb.sheets, key)}
            />
          }
          statusExtra={wb.sheet && wb.sheet.merges.length > 0 ? <span>{t('sheet.mergesNote')}</span> : null}
        />
      </div>
    </div>
  );
}
