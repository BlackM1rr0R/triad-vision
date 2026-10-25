import { useEffect, useMemo, useState, type DragEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { AlertTriangle, ArrowDown, ArrowUp, CheckCircle2, CircleSlash, Download, FileStack, GripVertical, Hourglass, Send } from 'lucide-react';
import { api, fileUrl, formatBytes } from '@/lib/api';
import { useL10n } from '@/lib/l10n';
import { Drawer } from '@/components/admin/Drawer';
import { LoadingBlock, ErrorBlock, Switch } from '@/components/admin/ui';
import { Spinner } from '@/components/ui/Spinner';
import { fmtDateTime, toastError } from '@/components/admin/labels';
import { caseKey } from '@/components/admin/case/shared';
import { fetchPackagePreview, fmtAppointment, nextStepKey, packageKey, type BuildResult, type ItemStatus, type PackagePreview, type PreviewItem } from './api';
import { FamilyPackageOption } from '@/components/family/FamilyPackageOption';
import PackageConfirmWarning from '@/components/clientData/PackageConfirmWarning'; // client data not confirmed → warning + "build anyway"

const STATUS_ICON: Record<ItemStatus, typeof CheckCircle2> = { found: CheckCircle2, pending: Hourglass, missing: CircleSlash, manual: FileStack };
const STATUS_STYLE: Record<ItemStatus, string> = {
  found: 'text-success-fg dark:text-emerald-300',
  pending: 'text-warning-fg dark:text-amber-300',
  missing: 'text-danger-fg dark:text-red-300',
  manual: 'text-muted',
};
const MAX_COPIES = 4;

interface Choice {
  include: boolean;
  copies: number | null;
  documentId: string | null;
}

/**
 * Preview checklist of the embassy package: ✓ found / ⚠ only pending review / ✗ missing per checklist item, include
 * toggles, order (drag or arrows), copies, separators, ZIP; "Request missing from client" and "Build (anyway)".
 */
export const EmbassyPackageDrawer = ({ caseId, open, onClose }: { caseId: string; open: boolean; onClose: () => void }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: packageKey(caseId), queryFn: () => fetchPackagePreview(caseId), enabled: open, staleTime: 0 });
  const [order, setOrder] = useState<string[]>([]);
  const [choice, setChoice] = useState<Record<string, Choice>>({});
  const [separators, setSeparators] = useState(true);
  const [copies, setCopies] = useState(1);
  const [zip, setZip] = useState(false);
  const [family, setFamily] = useState(true); // family members' sections (main case with members)
  const [busy, setBusy] = useState<'build' | 'request' | null>(null);
  const [result, setResult] = useState<BuildResult | null>(null);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [dataBlocked, setDataBlocked] = useState(false);

  // (Re)initialise from the server defaults whenever a fresh preview arrives.
  useEffect(() => {
    if (!data) return;
    setOrder((prev) => {
      const keys = data.items.map((i) => i.key);
      const kept = prev.filter((k) => keys.includes(k));
      return [...kept, ...keys.filter((k) => !kept.includes(k))];
    });
    setChoice((prev) => Object.fromEntries(data.items.map((i) => [i.key, prev[i.key] && i.status === 'found' ? prev[i.key] : { include: i.include, copies: null, documentId: null }])));
  }, [data]);

  useEffect(() => {
    if (!open) setResult(null);
  }, [open]);

  const byKey = useMemo(() => new Map((data?.items ?? []).map((i) => [i.key, i])), [data]);
  const items = order.map((k) => byKey.get(k)).filter((i): i is PreviewItem => !!i);
  const buildable = (i: PreviewItem) => i.status === 'found' || i.status === 'pending';
  const included = items.filter((i) => buildable(i) && choice[i.key]?.include);
  const missing = items.filter((i) => i.source === 'checklist' && i.status === 'missing');
  const notIn = items.filter((i) => i.source === 'checklist' && !(buildable(i) && choice[i.key]?.include));

  const set = (key: string, patch: Partial<Choice>) => setChoice((c) => ({ ...c, [key]: { ...(c[key] ?? { include: false, copies: null, documentId: null }), ...patch } }));
  const move = (key: string, delta: number) =>
    setOrder((o) => {
      const i = o.indexOf(key);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= o.length) return o;
      const next = [...o];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  const onDrop = (target: string) => (e: DragEvent) => {
    e.preventDefault();
    if (!dragKey || dragKey === target) return;
    setOrder((o) => {
      const next = o.filter((k) => k !== dragKey);
      next.splice(next.indexOf(target), 0, dragKey);
      return next;
    });
    setDragKey(null);
  };

  const refreshCase = () => {
    void qc.invalidateQueries({ queryKey: caseKey(caseId) });
    void qc.invalidateQueries({ queryKey: nextStepKey(caseId) });
  };

  const build = async () => {
    setBusy('build');
    try {
      const body = {
        separators,
        copies,
        format: zip ? 'zip' : 'pdf',
        ...(data?.family?.length ? { family } : {}),
        items: items.map((i) => ({ key: i.key, include: buildable(i) && !!choice[i.key]?.include, ...(choice[i.key]?.copies ? { copies: choice[i.key].copies } : {}), ...(choice[i.key]?.documentId ? { documentId: choice[i.key].documentId } : {}) })),
      };
      const res = (await api.post<BuildResult>(`/admin/cases/${caseId}/embassy-package`, body)).data;
      setResult(res);
      toast.success(t('caseNext.pkg.built', { pages: res.pages, size: formatBytes(res.sizeBytes) }));
      // Start the download right away (the file is also saved in the case).
      const a = document.createElement('a');
      a.href = fileUrl(res.document.id, true);
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      refreshCase();
      void refetch();
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(null);
    }
  };

  const requestMissing = async () => {
    setBusy('request');
    try {
      const res = (await api.post<{ requested: unknown[]; preview?: PackagePreview }>(`/admin/cases/${caseId}/embassy-package/request`, { keys: missing.map((i) => i.key) })).data;
      toast.success(t('caseNext.pkg.requested', { count: res.requested.length }));
      if (res.preview) qc.setQueryData(packageKey(caseId), res.preview);
      refreshCase();
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(null);
    }
  };

  const footer = data ? (
    <>
      {missing.length > 0 && (
        <button type="button" className="btn-secondary btn-sm" disabled={!!busy} onClick={() => void requestMissing()}>
          {busy === 'request' ? <Spinner className="size-3.5" /> : <Send className="size-3.5" aria-hidden />} {t('caseNext.pkg.requestMissing', { count: missing.length })}
        </button>
      )}
      <button type="button" className="btn-primary btn-sm" disabled={!!busy || !included.length || dataBlocked} onClick={() => void build()} title={!included.length ? t('caseNext.pkg.nothingSelected') : undefined}>
        {busy === 'build' ? <Spinner className="size-3.5" /> : <FileStack className="size-3.5" aria-hidden />}
        {busy === 'build' ? t('caseNext.pkg.building') : notIn.length ? t('caseNext.pkg.buildAnyway') : t('caseNext.pkg.build')}
      </button>
    </>
  ) : undefined;

  return (
    <Drawer open={open} onClose={onClose} title={t('caseNext.pkg.drawerTitle')} footer={footer}>
      {isLoading ? (
        <LoadingBlock className="min-h-[20vh]" />
      ) : error || !data ? (
        <ErrorBlock error={error} onRetry={() => refetch()} />
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
            <span className="font-semibold text-ink">{t('caseNext.pkg.summary', data.summary)}</span>
            <span>{data.appointmentAt ? t('caseNext.pkg.appointment', { date: fmtAppointment(data.appointmentAt) }) : t('caseNext.pkg.noAppointment')}</span>
            {data.lastPackage && (
              <a className="text-link hover:underline" href={fileUrl(data.lastPackage.documentId, true)}>
                {t('caseNext.pkg.lastPackage', { date: fmtDateTime(data.lastPackage.createdAt) })}
              </a>
            )}
          </div>

          {result && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-success-bg px-3 py-2.5 text-sm text-success-fg dark:bg-emerald-950/40 dark:text-emerald-200" role="status">
              <span className="flex items-center gap-2">
                <CheckCircle2 className="size-4 shrink-0" aria-hidden /> {t('caseNext.pkg.built', { pages: result.pages, size: formatBytes(result.sizeBytes) })}
              </span>
              <a className="btn-secondary btn-sm" href={fileUrl(result.document.id, true)}>
                <Download className="size-3.5" aria-hidden /> {t('caseNext.pkg.download')}
              </a>
            </div>
          )}

          <div className="grid gap-3 rounded-xl border border-line p-3 sm:grid-cols-3 sm:p-4">
            <label className="flex items-center justify-between gap-3 text-xs text-ink/80 sm:flex-col sm:items-start">
              <span>{t('caseNext.pkg.separators')}</span>
              <Switch checked={separators} onChange={setSeparators} label={t('caseNext.pkg.separators')} />
            </label>
            <label className="flex items-center justify-between gap-3 text-xs text-ink/80 sm:flex-col sm:items-start">
              <span>{t('caseNext.pkg.copiesAll')}</span>
              <select className="input w-24 py-1.5 text-sm" value={copies} onChange={(e) => setCopies(Number(e.target.value))} aria-label={t('caseNext.pkg.copiesAll')}>
                {Array.from({ length: MAX_COPIES }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n}×
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center justify-between gap-3 text-xs text-ink/80 sm:flex-col sm:items-start">
              <span>{t('caseNext.pkg.zip')}</span>
              <Switch checked={zip} onChange={setZip} label={t('caseNext.pkg.zip')} />
            </label>
          </div>

          <FamilyPackageOption members={data.family ?? []} checked={family} onChange={setFamily} />

          <PackageConfirmWarning caseId={caseId} onBlockedChange={setDataBlocked} />

          {notIn.length > 0 && (
            <p className="flex items-start gap-2 rounded-lg bg-warning-bg px-3 py-2 text-xs text-warning-fg dark:bg-amber-950/40 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {t('caseNext.pkg.warnMissing', { count: notIn.length })}
            </p>
          )}

          <div>
            <p className="mb-2 text-[11px] text-muted">{t('caseNext.pkg.orderHint')}</p>
            <ol className="space-y-2">
              {items.map((i, idx) => (
                <ItemRow
                  key={i.key}
                  item={i}
                  index={idx}
                  last={idx === items.length - 1}
                  choice={choice[i.key]}
                  defaultCopies={copies}
                  dragging={dragKey === i.key}
                  onSet={(p) => set(i.key, p)}
                  onMove={(d) => move(i.key, d)}
                  onDragStart={() => setDragKey(i.key)}
                  onDragEnd={() => setDragKey(null)}
                  onDrop={onDrop(i.key)}
                />
              ))}
            </ol>
          </div>
          <p className="text-[11px] text-muted">{t('caseNext.pkg.maxSize', { mb: Math.round(data.maxBytes / 1024 / 1024) })}</p>
        </div>
      )}
    </Drawer>
  );
};

const ItemRow = ({
  item,
  index,
  last,
  choice,
  defaultCopies,
  dragging,
  onSet,
  onMove,
  onDragStart,
  onDragEnd,
  onDrop,
}: {
  item: PreviewItem;
  index: number;
  last: boolean;
  choice: Choice | undefined;
  defaultCopies: number;
  dragging: boolean;
  onSet: (p: Partial<Choice>) => void;
  onMove: (delta: number) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDrop: (e: DragEvent) => void;
}) => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const I = STATUS_ICON[item.status];
  const canInclude = item.status === 'found' || item.status === 'pending';
  const doc = item.candidates.find((d) => d.id === choice?.documentId) ?? item.document;
  return (
    <li
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      className={clsx('rounded-xl border border-line bg-card p-3 transition', dragging && 'opacity-50', !canInclude && 'bg-surface/60')}
    >
      <div className="flex min-w-0 items-start gap-2">
        <span className="mt-0.5 hidden shrink-0 cursor-grab text-muted sm:block" title={t('caseNext.pkg.drag')} aria-hidden>
          <GripVertical className="size-4" />
        </span>
        <span className={clsx('mt-0.5 shrink-0', STATUS_STYLE[item.status])} title={t(`caseNext.pkg.status.${item.status}`)}>
          <I className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">
            <span className="mr-1 text-muted tabular-nums">{index + 1}.</span>
            {tr(item.label)}
          </p>
          <p className={clsx('text-xs', STATUS_STYLE[item.status])}>
            {item.source === 'extra' ? t('caseNext.pkg.extra') : t(`caseNext.pkg.status.${item.status}`)}
            {doc && <span className="text-muted"> · {doc.name}</span>}
          </p>
          {doc && !doc.embeddable && <p className="mt-0.5 text-[11px] text-warning-fg dark:text-amber-300">{t('caseNext.pkg.notEmbeddable')}</p>}
          {canInclude && item.candidates.length > 1 && (
            <select className="input mt-2 py-1.5 text-xs" value={doc?.id ?? ''} onChange={(e) => onSet({ documentId: e.target.value })} aria-label={t('caseNext.pkg.document')}>
              {item.candidates.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} · {fmtDateTime(d.createdAt)} · {d.status === 'ACCEPTED' ? '✓' : '⚠'}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          {canInclude && <Switch checked={!!choice?.include} onChange={(v) => onSet({ include: v })} label={t('caseNext.pkg.include')} />}
          <span className="flex">
            <button type="button" className="grid size-8 place-items-center rounded-lg text-muted hover:bg-sunken disabled:opacity-30" disabled={index === 0} onClick={() => onMove(-1)} aria-label={t('caseNext.pkg.moveUp')}>
              <ArrowUp className="size-3.5" />
            </button>
            <button type="button" className="grid size-8 place-items-center rounded-lg text-muted hover:bg-sunken disabled:opacity-30" disabled={last} onClick={() => onMove(1)} aria-label={t('caseNext.pkg.moveDown')}>
              <ArrowDown className="size-3.5" />
            </button>
          </span>
          {canInclude && choice?.include && (
            <select className="input w-20 py-1 text-xs" value={choice.copies ?? defaultCopies} onChange={(e) => onSet({ copies: Number(e.target.value) })} aria-label={t('caseNext.pkg.copies')}>
              {Array.from({ length: MAX_COPIES }, (_, n) => n + 1).map((n) => (
                <option key={n} value={n}>
                  {n}×
                </option>
              ))}
            </select>
          )}
        </div>
      </div>
    </li>
  );
};
