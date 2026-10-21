import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { AlertTriangle, ExternalLink, FileText, PenLine, Printer, Truck } from 'lucide-react';
import { useL10n } from '@/lib/l10n';
import { Drawer } from '@/components/admin/Drawer';
import { STATUS_TONE, actUrl, labelUrl, type Original, type OriginalStatus } from './api';

export const StatusChip = ({ status, className }: { status: OriginalStatus; className?: string }) => {
  const { t } = useTranslation();
  return <span className={clsx('badge whitespace-nowrap', STATUS_TONE[status], className)}>{t(`originals.status.${status}`)}</span>;
};

export const DaysChip = ({ o }: { o: Pick<Original, 'daysInStatus' | 'overdue'> }) => {
  const { t } = useTranslation();
  return (
    <span className={clsx('badge inline-flex items-center gap-1 whitespace-nowrap tabular-nums', o.overdue ? 'bg-red-100 text-red-800' : 'bg-surface text-muted')}>
      {o.overdue && <AlertTriangle className="size-3" aria-hidden />}
      {t('originals.days', { count: o.daysInStatus })}
      {o.overdue && <span className="sr-only">{t('originals.overdue')}</span>}
    </span>
  );
};

/** Where the original is now: location in the office, holder, or courier + tracking link. */
export const WhereCell = ({ o }: { o: Original }) => {
  const { t } = useTranslation();
  if (o.status === 'IN_TRANSIT' && o.carrier) {
    return (
      <span className="inline-flex flex-wrap items-center gap-1 text-xs">
        <Truck className="size-3.5 text-muted" aria-hidden />
        {t(`originals.carriers.${o.carrier}`, { defaultValue: o.carrier })}
        {o.trackingNo &&
          (o.trackingUrl ? (
            <a href={o.trackingUrl} target="_blank" rel="noopener noreferrer" className="font-mono text-brand-600 hover:underline">
              {o.trackingNo}
            </a>
          ) : (
            <span className="font-mono">{o.trackingNo}</span>
          ))}
      </span>
    );
  }
  if (o.status === 'IN_OFFICE') return <span className="text-xs">{o.location ?? '—'}</span>;
  return <span className="text-xs">{o.holder ?? o.location ?? '—'}</span>;
};

/** "Print QR label" with the three layouts (opens the PDF in a new tab for printing). */
export const LabelMenu = ({ caseId, compact }: { caseId: string; compact?: boolean }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <button type="button" className="btn-white btn-sm border border-line" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen((v) => !v)} title={t('originals.label.button')}>
        <Printer className="size-4" aria-hidden />
        {compact ? <span className="sr-only">{t('originals.label.button')}</span> : t('originals.label.button')}
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-30 mt-1 w-56 overflow-hidden rounded-lg border border-line bg-white py-1 shadow-lg">
          {(
            [
              ['a4-1', 'a41'],
              ['a4-8', 'a48'],
              ['62mm', 'l62'],
            ] as const
          ).map(([layout, key]) => (
            <a key={layout} role="menuitem" href={labelUrl(caseId, layout)} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)} className="block px-3 py-2 text-sm text-ink hover:bg-surface">
              {t(`originals.label.${key}`)}
            </a>
          ))}
        </div>
      )}
    </div>
  );
};

/** History of one original, with links to its acts (open / print, sign on screen). */
export const TimelineDrawer = ({ original, open, onClose, onSign }: { original: Original | null; open: boolean; onClose: () => void; onSign: (eventId: string) => void }) => {
  const { t } = useTranslation();
  const { dateTime } = useL10n();
  return (
    <Drawer open={open && !!original} onClose={onClose} title={original ? `${t('originals.timeline.title')} · ${original.title}` : ''}>
      {original && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <StatusChip status={original.status} />
            <DaysChip o={original} />
            <span className="text-muted">
              {original.case.client.name} · <span className="font-mono text-xs">{original.case.number}</span>
            </span>
          </div>
          {original.events.length === 0 ? (
            <p className="text-sm text-muted">{t('originals.timeline.empty')}</p>
          ) : (
            <ol className="relative space-y-4 border-l border-line pl-5">
              {original.events.map((e) => (
                <li key={e.id} className="relative">
                  <span className="absolute top-1.5 -left-[1.6rem] size-2.5 rounded-full bg-brand-600 ring-4 ring-white" aria-hidden />
                  <p className="text-sm font-semibold text-navy-900">{t(`originals.actions.${e.action}`)}</p>
                  <p className="text-xs text-muted">{dateTime(e.at)}</p>
                  <div className="mt-1 space-y-0.5 text-xs text-ink">
                    {e.location && <p>{t('originals.form.location')}: {e.location}</p>}
                    {e.holder && <p>{t('originals.form.holder')}: {e.holder}</p>}
                    {e.carrier && (
                      <p>
                        {t(`originals.carriers.${e.carrier}`, { defaultValue: e.carrier })}
                        {e.trackingNo && ' · '}
                        {e.trackingNo &&
                          (e.trackingUrl ? (
                            <a href={e.trackingUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 font-mono text-brand-600 hover:underline">
                              {e.trackingNo} <ExternalLink className="size-3" aria-hidden />
                            </a>
                          ) : (
                            <span className="font-mono">{e.trackingNo}</span>
                          ))}
                      </p>
                    )}
                    {e.note && <p className="text-muted">{e.note}</p>}
                  </div>
                  {e.actNodeId && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <a href={actUrl(e.id)} target="_blank" rel="noopener noreferrer" className="btn-white btn-sm border border-line">
                        <FileText className="size-4" aria-hidden /> {t('originals.timeline.openAct')}
                      </a>
                      <button type="button" className="btn-white btn-sm border border-line" onClick={() => onSign(e.id)}>
                        <PenLine className="size-4" aria-hidden /> {t('originals.timeline.sign')}
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </Drawer>
  );
};
