import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { Check, ClipboardCopy, Globe, KeyRound, Link2, ListTree, Plus, Upload, X } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { driveCollabCopy } from '@/i18n/pagesDriveCollab';
import { fmtDate, fmtDateTime } from '@/components/admin/labels';
import { Modal } from '@/components/admin/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { STATUS_TONES, toneClasses } from '@/components/ui/status';
import { toastDriveError } from '../api';
import type { DriveItem } from '../types';
import { collabKeys, createLink, fetchAccesses, fetchLinks, revokeLink, type LinkStatus, type ShareLink } from './api';

registerCopy(driveCollabCopy);

const STATUS_TONE: Record<LinkStatus, string> = toneClasses(STATUS_TONES.shareLink);
const DAY_CHOICES = [1, 7, 30] as const;

const copyText = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
};

const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const AccessLog = ({ link, onClose }: { link: ShareLink | null; onClose: () => void }) => {
  const { t } = useTranslation();
  const q = useQuery({ queryKey: collabKeys.accesses(link?.id ?? ''), queryFn: () => fetchAccesses(link!.id), enabled: !!link });
  return (
    <Modal open={!!link} onClose={onClose} size="lg" title={t('driveCollab.links.logTitle', { label: link?.label || t('driveCollab.links.unnamed') })}>
      {q.isLoading ? (
        <div className="grid place-items-center py-8">
          <Spinner />
        </div>
      ) : !q.data?.length ? (
        <p className="py-6 text-center text-sm text-muted">{t('driveCollab.links.logEmpty')}</p>
      ) : (
        <ul className="max-h-[60vh] divide-y divide-line overflow-y-auto rounded-xl border border-line text-xs">
          {q.data.map((a) => (
            <li key={a.id} className="grid gap-1 px-3 py-2 sm:grid-cols-[9rem_8rem_minmax(0,1fr)] sm:gap-3">
              <span className="text-muted">{fmtDateTime(a.createdAt)}</span>
              <span className={clsx('font-semibold', a.action === 'BAD_PASSWORD' ? 'text-danger-fg' : 'text-ink')}>
                {t(`driveCollab.links.access.${a.action}`)}
                {a.fileName ? <span className="block truncate font-normal text-muted">{a.fileName}</span> : null}
              </span>
              <span className="min-w-0 truncate text-muted" title={a.userAgent ?? undefined}>
                {a.ip ?? '—'} · {a.userAgent ?? '—'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
};

/** External links of a file or folder: create (expiry, password, download limit, uploads), list, revoke, access log. */
export const ShareLinksSection = ({ item }: { item: DriveItem }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: collabKeys.links(item.id), queryFn: () => fetchLinks(item.id) });
  const [form, setForm] = useState(false);
  const [label, setLabel] = useState('');
  const [days, setDays] = useState<number | 'custom'>(7);
  const [date, setDate] = useState('');
  const [password, setPassword] = useState('');
  const [maxDownloads, setMaxDownloads] = useState('');
  const [allowUpload, setAllowUpload] = useState(false);
  const [created, setCreated] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [logFor, setLogFor] = useState<ShareLink | null>(null);
  useEffect(() => {
    setForm(false);
    setCreated(null);
  }, [item.id]);

  const maxDays = q.data?.maxDays ?? 90;
  const minDate = isoDay(new Date(Date.now() + 86_400_000));
  const maxDate = isoDay(new Date(Date.now() + maxDays * 86_400_000));
  const refresh = () => void qc.invalidateQueries({ queryKey: collabKeys.links(item.id) });

  const create = useMutation({
    mutationFn: () =>
      createLink(item.id, {
        label: label.trim() || null,
        ...(days === 'custom' ? { expiresAt: new Date(`${date}T23:59:00`).toISOString() } : { expiresInDays: days }),
        password: password || null,
        maxDownloads: maxDownloads ? Number(maxDownloads) : null,
        allowUpload: item.kind === 'FOLDER' && allowUpload,
      }),
    onSuccess: (r) => {
      setCreated(r.url);
      setCopied(false);
      setForm(false);
      setLabel('');
      setPassword('');
      setMaxDownloads('');
      setAllowUpload(false);
      setDays(7);
      refresh();
      void copyText(r.url).then((ok) => ok && setCopied(true));
    },
    onError: toastDriveError,
  });
  const revoke = useMutation({
    mutationFn: (id: string) => revokeLink(id),
    onSuccess: () => {
      toast.success(t('driveCollab.links.revoked'));
      refresh();
    },
    onError: toastDriveError,
  });
  const valid = (days !== 'custom' || (!!date && date >= minDate && date <= maxDate)) && (!password || password.length >= 4) && (!maxDownloads || Number(maxDownloads) >= 1);

  return (
    <section className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-1.5 text-sm font-bold text-ink">
            <Globe className="size-4 text-link" /> {t('driveCollab.links.title')}
          </h3>
          <p className="mt-0.5 text-xs text-muted">{t('driveCollab.links.hint')}</p>
        </div>
        {!form && (
          <button type="button" className="btn-secondary btn-sm shrink-0 border border-line" onClick={() => { setForm(true); setCreated(null); }}>
            <Plus className="size-3.5" /> {t('driveCollab.links.newLink')}
          </button>
        )}
      </div>

      {created && (
        <div className="rounded-xl border border-success-border bg-success-bg p-3 dark:border-emerald-500/40 dark:bg-emerald-500/10">
          <p className="text-sm font-semibold text-success-fg dark:text-emerald-200">{t('driveCollab.links.createdTitle')}</p>
          <p className="mt-0.5 text-xs text-success-fg dark:text-emerald-200/80">{t('driveCollab.links.onceHint')}</p>
          <div className="mt-2 flex gap-2">
            <input readOnly value={created} onFocus={(e) => e.target.select()} className="input !py-1.5 font-mono !text-xs" aria-label="URL" />
            <button
              type="button"
              className="btn-primary btn-sm shrink-0"
              onClick={() =>
                void copyText(created).then((ok) => {
                  if (ok) {
                    setCopied(true);
                    toast.success(t('driveCollab.links.copied'));
                  }
                })
              }
            >
              {copied ? <Check className="size-3.5" /> : <ClipboardCopy className="size-3.5" />} {t('driveCollab.links.copy')}
            </button>
          </div>
          <div className="mt-2 text-right">
            <button type="button" className="text-xs font-semibold text-success-fg hover:underline dark:text-emerald-200" onClick={() => setCreated(null)}>
              {t('driveCollab.links.done')}
            </button>
          </div>
        </div>
      )}

      {form && (
        <div className="space-y-3 rounded-xl border border-line p-3">
          <label className="block text-xs font-semibold text-muted">
            {t('driveCollab.links.label')}
            <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={160} placeholder={t('driveCollab.links.labelPh')} className="input mt-1 !text-sm" data-autofocus />
          </label>
          <div>
            <span className="text-xs font-semibold text-muted">{t('driveCollab.links.expiry')}</span>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {DAY_CHOICES.map((d) => (
                <button key={d} type="button" onClick={() => setDays(d)} aria-pressed={days === d} className={clsx('rounded-lg border px-2.5 py-1 text-xs font-semibold', days === d ? 'border-primary bg-primary/[0.06] text-link dark:bg-brand-500/15 dark:text-brand-200' : 'border-line text-ink hover:bg-sunken')}>
                  {t('driveCollab.links.days', { count: d })}
                </button>
              ))}
              <button type="button" onClick={() => setDays('custom')} aria-pressed={days === 'custom'} className={clsx('rounded-lg border px-2.5 py-1 text-xs font-semibold', days === 'custom' ? 'border-primary bg-primary/[0.06] text-link dark:bg-brand-500/15 dark:text-brand-200' : 'border-line text-ink hover:bg-sunken')}>
                {t('driveCollab.links.customDate')}
              </button>
              {days === 'custom' && <input type="date" value={date} min={minDate} max={maxDate} onChange={(e) => setDate(e.target.value)} className="input !w-auto !py-1 !text-xs" />}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-semibold text-muted">
              {t('driveCollab.links.password')}
              <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t('driveCollab.links.passwordPh')} className="input mt-1 !text-sm" />
            </label>
            <label className="block text-xs font-semibold text-muted">
              {t('driveCollab.links.maxDownloads')}
              <input type="number" min={1} max={100000} value={maxDownloads} onChange={(e) => setMaxDownloads(e.target.value)} placeholder={t('driveCollab.links.unlimited')} className="input mt-1 !text-sm" />
            </label>
          </div>
          {item.kind === 'FOLDER' && (
            <label className="flex cursor-pointer items-start gap-2.5">
              <input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={allowUpload} onChange={(e) => setAllowUpload(e.target.checked)} />
              <span>
                <span className="block text-sm font-semibold text-ink">{t('driveCollab.links.allowUpload')}</span>
                <span className="block text-xs text-muted">{t('driveCollab.links.allowUploadHint')}</span>
              </span>
            </label>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-sm px-2 text-xs text-muted" onClick={() => setForm(false)}>
              {t('driveCollab.comments.cancel')}
            </button>
            <button type="button" className="btn-primary btn-sm" disabled={!valid || create.isPending} onClick={() => create.mutate()}>
              {create.isPending ? <Spinner className="size-3.5" /> : <Link2 className="size-3.5" />} {t('driveCollab.links.create')}
            </button>
          </div>
        </div>
      )}

      {q.isLoading ? (
        <div className="grid place-items-center py-4">
          <Spinner />
        </div>
      ) : !q.data?.links.length ? (
        !form && !created && <p className="text-xs text-muted">{t('driveCollab.links.empty')}</p>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {q.data.links.map((l) => (
            <li key={l.id} className="px-3 py-2.5">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{l.label || t('driveCollab.links.unnamed')}</span>
                <span className={clsx('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold', STATUS_TONE[l.status])}>{t(`driveCollab.links.status.${l.status}`)}</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
                <span>{t('driveCollab.links.until', { date: fmtDate(l.expiresAt) })}</span>
                <span>{l.maxDownloads ? t('driveCollab.links.downloadsOf', { count: l.downloads, max: l.maxDownloads }) : t('driveCollab.links.downloads', { count: l.downloads })}</span>
                {l.hasPassword && (
                  <span className="inline-flex items-center gap-1">
                    <KeyRound className="size-3" /> {t('driveCollab.links.protected')}
                  </span>
                )}
                {l.allowUpload && (
                  <span className="inline-flex items-center gap-1">
                    <Upload className="size-3" /> {t('driveCollab.links.uploadOn')}
                  </span>
                )}
                <span>{l.lastAccessAt ? t('driveCollab.links.lastAccess', { time: fmtDateTime(l.lastAccessAt) }) : t('driveCollab.links.never')}</span>
                {l.createdBy && <span>{t('driveCollab.links.by', { name: `${l.createdBy.firstName} ${l.createdBy.lastName}` })}</span>}
              </div>
              <div className="mt-1.5 flex gap-3 text-xs font-semibold">
                <button type="button" onClick={() => setLogFor(l)} className="inline-flex items-center gap-1 text-link hover:underline">
                  <ListTree className="size-3.5" /> {t('driveCollab.links.log')} ({l.accessCount})
                </button>
                {l.status !== 'revoked' && (
                  <button type="button" onClick={() => window.confirm(t('driveCollab.links.revokeConfirm')) && revoke.mutate(l.id)} className="inline-flex items-center gap-1 text-danger-fg hover:underline">
                    <X className="size-3.5" /> {t('driveCollab.links.revoke')}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <AccessLog link={logFor} onClose={() => setLogFor(null)} />
    </section>
  );
};

/** Stand-alone dialog (from the details panel) for people with EDIT who do not manage the folder. */
export const ShareLinksDialog = ({ item, onClose }: { item: DriveItem | null; onClose: () => void }) => {
  const { t } = useTranslation();
  return (
    <Modal open={!!item} onClose={onClose} size="lg" title={t('driveCollab.links.dialogTitle', { name: item?.name ?? '' })}>
      {item && <ShareLinksSection item={item} />}
    </Modal>
  );
};
