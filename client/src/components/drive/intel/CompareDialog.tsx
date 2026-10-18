import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { ArrowRight, Download, FileDiff, X } from 'lucide-react';
import { api, formatBytes } from '@/lib/api';
import { useOverlay } from '@/components/admin/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { driveError, startDownload } from '../api';
import type { DriveItem, VersionRow } from '../types';
import { fetchCompare, intelKeys, type CompareResponse, type DiffOp } from './api';

const enc = encodeURIComponent;

/** One side of a text diff: equal text plus removals (left) or additions (right). */
const DiffSide = ({ ops, side }: { ops: DiffOp[]; side: 'old' | 'new' }) => (
  <div className="min-w-0 font-mono text-[12.5px] leading-relaxed break-words whitespace-pre-wrap text-ink">
    {ops.map((o, i) => {
      if (o.t === 'eq') return <span key={i}>{o.s}</span>;
      if (side === 'old' && o.t === 'del')
        return (
          <del key={i} className="rounded-sm bg-red-100 text-red-800 decoration-red-500 dark:bg-red-500/20 dark:text-red-200">
            {o.s}
          </del>
        );
      if (side === 'new' && o.t === 'ins')
        return (
          <ins key={i} className="rounded-sm bg-emerald-100 text-emerald-800 no-underline dark:bg-emerald-500/20 dark:text-emerald-200">
            {o.s}
          </ins>
        );
      return null;
    })}
  </div>
);

const Result = ({ data }: { data: CompareResponse }) => {
  const { t } = useTranslation();
  const [showSame, setShowSame] = useState(false);
  const r = data.result;
  if (r.kind === 'image') {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        {[data.a, data.b].map((s, i) => (
          <figure key={i} className="rounded-xl border border-line bg-surface p-2">
            <img src={s.url} alt={`v${s.version}`} className="mx-auto max-h-[65vh] w-auto object-contain" />
            <figcaption className="mt-1 text-center text-xs text-muted">v{s.version}</figcaption>
          </figure>
        ))}
      </div>
    );
  }
  if (r.kind === 'sheet') {
    const changedSheets = r.sheets.filter((s) => s.status !== 'same');
    return (
      <div className="space-y-4">
        <p className="text-sm font-semibold text-ink">{t('driveIntel.compare.cellStats', r.stats)}</p>
        {r.truncated && <p className="text-xs text-amber-700">{t('driveIntel.compare.truncated')}</p>}
        {!changedSheets.length && <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">{t('driveIntel.compare.unchanged')}</p>}
        {r.sheets.map((s) => (
          <section key={s.name} className="overflow-hidden rounded-xl border border-line">
            <header className="flex items-center gap-2 border-b border-line bg-surface px-3 py-2 text-sm font-semibold text-ink">
              {s.name}
              {s.status !== 'changed' && (
                <span className="text-xs font-normal text-muted">
                  · {s.status === 'added' ? t('driveIntel.compare.sheetAdded') : s.status === 'removed' ? t('driveIntel.compare.sheetRemoved') : t('driveIntel.compare.sheetSame')}
                </span>
              )}
            </header>
            {s.changes.length > 0 && (
              <div className="max-h-[50vh] overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-card text-left text-xs text-muted">
                    <tr>
                      <th className="px-3 py-1.5 font-semibold">{t('driveIntel.compare.cell')}</th>
                      <th className="px-3 py-1.5 font-semibold">{t('driveIntel.compare.oldValue')}</th>
                      <th className="px-3 py-1.5 font-semibold">{t('driveIntel.compare.newValue')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.changes.map((c) => (
                      <tr
                        key={c.cell}
                        title={c.type === 'changed' ? `${c.old ?? ''} → ${c.new ?? ''}` : undefined}
                        className={clsx('border-t border-line/60', c.type === 'changed' && 'bg-amber-50 dark:bg-amber-500/10', c.type === 'added' && 'bg-emerald-50 dark:bg-emerald-500/10', c.type === 'removed' && 'bg-red-50 dark:bg-red-500/10')}
                      >
                        <td className="px-3 py-1.5 font-mono text-xs font-semibold text-ink">
                          {c.cell}
                          <span className="ml-2 font-sans text-[10px] font-bold text-muted uppercase">{t(`driveIntel.compare.${c.type}`)}</span>
                        </td>
                        <td className="px-3 py-1.5 break-all">{c.old !== null && <span className={clsx(c.type === 'removed' || c.type === 'changed' ? 'text-red-700 line-through dark:text-red-300' : '')}>{c.old}</span>}</td>
                        <td className="px-3 py-1.5 break-all">
                          {c.new !== null && (
                            <span className={clsx('inline-flex items-center gap-1', c.type === 'added' ? 'text-emerald-700 dark:text-emerald-300' : 'font-semibold text-amber-800 dark:text-amber-300')}>
                              {c.type === 'changed' && <ArrowRight className="size-3 shrink-0" aria-hidden />}
                              {c.new}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ))}
      </div>
    );
  }
  const changed = r.chunks.filter((c) => c.changed);
  const shown = showSame ? r.chunks : changed;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="font-semibold text-ink">{t('driveIntel.compare.stats', r.stats)}</span>
        <span className="inline-flex items-center gap-1 text-xs text-muted">
          <del className="rounded-sm bg-red-100 px-1 text-red-800 dark:bg-red-500/20 dark:text-red-200">abc</del> {t('driveIntel.compare.legendDel')}
        </span>
        <span className="inline-flex items-center gap-1 text-xs text-muted">
          <ins className="rounded-sm bg-emerald-100 px-1 text-emerald-800 no-underline dark:bg-emerald-500/20 dark:text-emerald-200">abc</ins> {t('driveIntel.compare.legendIns')}
        </span>
        {r.chunks.length > 1 && r.chunks.length !== changed.length && (
          <label className="ml-auto inline-flex items-center gap-2 text-xs text-muted">
            <input type="checkbox" className="size-4 accent-brand-600" checked={showSame} onChange={(e) => setShowSame(e.target.checked)} />
            {t('driveIntel.compare.showUnchanged')}
          </label>
        )}
      </div>
      {r.mode === 'lines' && <p className="text-xs text-muted">{t('driveIntel.compare.linesMode')}</p>}
      {r.truncated && <p className="text-xs text-amber-700">{t('driveIntel.compare.truncated')}</p>}
      {!changed.length && <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">{t('driveIntel.compare.unchanged')}</p>}
      {shown.map((c, i) => (
        <section key={c.page ?? i} className="overflow-hidden rounded-xl border border-line">
          {c.page !== null && (
            <header className="border-b border-line bg-surface px-3 py-1.5 text-xs font-semibold text-muted">
              {c.changed ? t('driveIntel.compare.page', { page: c.page }) : t('driveIntel.compare.pageUnchanged', { page: c.page })}
            </header>
          )}
          <div className="grid divide-y divide-line md:grid-cols-2 md:divide-x md:divide-y-0">
            <div className="max-h-[60vh] overflow-auto p-3">
              <DiffSide ops={c.ops} side="old" />
            </div>
            <div className="max-h-[60vh] overflow-auto p-3">
              <DiffSide ops={c.ops} side="new" />
            </div>
          </div>
        </section>
      ))}
    </div>
  );
};

/** "Versiyaları müqayisə et": version pickers (left = older, right = newer) and the diff by file type. */
export default function CompareDialog({ item, onClose }: { item: DriveItem; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const panelRef = useOverlay(true, onClose);
  const versions = useQuery({
    queryKey: ['drive', 'versions', item.id],
    queryFn: async () => (await api.get<{ versions: VersionRow[] }>(`/drive/nodes/${enc(item.id)}/versions`)).data.versions,
  });
  const [a, setA] = useState('');
  const [b, setB] = useState('current');
  useEffect(() => {
    if (!a && versions.data?.length) setA(versions.data[0].id);
  }, [versions.data, a]);
  const fmt = useMemo(() => new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }), [i18n.language]);
  const options = [
    { id: 'current', label: t('driveIntel.compare.current', { version: item.version }) },
    ...(versions.data ?? []).map((v) => ({ id: v.id, label: `${t('driveIntel.compare.version', { version: v.version, date: fmt.format(new Date(v.createdAt)) })} · ${formatBytes(v.size)}` })),
  ];
  const ready = !!a && !!b && a !== b;
  const cmp = useQuery({ queryKey: intelKeys.compare(item.id, a, b), queryFn: () => fetchCompare(item.id, a, b), enabled: ready, retry: false });

  const picker = (value: string, onChange: (v: string) => void, label: string) => (
    <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-semibold text-muted">
      {label}
      <select className="input !py-1.5 !text-sm" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );

  return createPortal(
    <div className="fixed inset-0 z-[85] flex items-stretch justify-center bg-navy-950/50 p-0 sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label={t('driveIntel.compare.title')} tabIndex={-1} className="flex w-full max-w-6xl flex-col overflow-hidden bg-card shadow-2xl outline-none sm:rounded-2xl">
        <div className="flex items-start gap-3 border-b border-line px-4 py-3 sm:px-5">
          <FileDiff className="mt-1 size-5 shrink-0 text-brand-600" aria-hidden />
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold text-ink">{t('driveIntel.compare.title')}</h2>
            <p className="truncate text-sm text-muted">{item.name}</p>
          </div>
          <button type="button" onClick={onClose} className="grid size-10 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface hover:text-ink" aria-label={t('admin.common.close')}>
            <X className="size-4" />
          </button>
        </div>
        {versions.isLoading ? (
          <div className="grid flex-1 place-items-center p-10">
            <Spinner className="size-6" />
          </div>
        ) : !versions.data?.length ? (
          <p className="m-6 rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">{t('driveIntel.compare.noVersions')}</p>
        ) : (
          <>
            <div className="flex flex-col gap-3 border-b border-line bg-surface/60 px-4 py-3 sm:flex-row sm:items-end sm:px-5">
              {picker(a, setA, t('driveIntel.compare.older'))}
              <ArrowRight className="hidden size-4 shrink-0 self-center text-muted sm:block" aria-hidden />
              {picker(b, setB, t('driveIntel.compare.newer'))}
              {cmp.data && (
                <div className="flex shrink-0 gap-1">
                  {[cmp.data.a, cmp.data.b].map((s) => (
                    <button key={s.ref} type="button" className="btn-white btn-sm border border-line" onClick={() => startDownload(s.ref === 'current' ? `${s.url}?download=1` : s.url)} title={t('driveIntel.compare.download')}>
                      <Download className="size-3.5" /> v{s.version}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
              {!ready ? (
                <p className="text-sm text-muted">{t('driveIntel.compare.same')}</p>
              ) : cmp.isLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted">
                  <Spinner className="size-4" /> {t('driveIntel.compare.loading')}
                </div>
              ) : cmp.isError ? (
                <p className="text-sm text-danger">{driveError(cmp.error)}</p>
              ) : cmp.data ? (
                <Result data={cmp.data} />
              ) : null}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
