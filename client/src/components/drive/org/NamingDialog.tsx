import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { ArrowRight } from 'lucide-react';
import { api } from '@/lib/api';
import { Modal } from '@/components/admin/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { driveError, invalidateDrive, reportBatch, toastDriveError } from '../api';
import type { BatchResult } from '../types';
import { fetchNaming, orgKeys, type NamingSettings, type TidyRow } from './api';

const today = () => new Date().toISOString().slice(0, 10);

/** Client-side preview of a pattern (same rules as the server, for the settings form only). */
const example = (pattern: string) =>
  pattern
    .replace(/\{(\w+)\}/g, (_m, k: string) => ({ nachname: 'Məmmədov', vorname: 'Elçin', typ: 'Pasport', datum: today(), fallnummer: 'TV-2026-0012' })[k.toLowerCase()] ?? '')
    .replace(/([_\-. ])[_\-. ]+/g, '$1')
    .replace(/^[_\-. ]+|[_\-. ]+$/g, '') + '.pdf';

/** Automatic naming settings (admins): on / off and the pattern with {Nachname} {Vorname} {Typ} {Datum} {Fallnummer}. */
export const NamingSettingsDialog = ({ onClose }: { onClose: () => void }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: orgKeys.naming, queryFn: fetchNaming });
  const [enabled, setEnabled] = useState(true);
  const [pattern, setPattern] = useState('');
  useEffect(() => {
    if (q.data) {
      setEnabled(q.data.enabled);
      setPattern(q.data.pattern);
    }
  }, [q.data]);
  const save = useMutation({
    mutationFn: async () => (await api.put<NamingSettings>('/drive/naming', { enabled, pattern: pattern.trim() })).data,
    onSuccess: (d) => {
      qc.setQueryData(orgKeys.naming, d);
      toast.success(t('driveOrg.naming.saved'));
      onClose();
    },
    onError: toastDriveError,
  });
  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title={t('driveOrg.naming.settingsTitle')}
      description={t('driveOrg.naming.settingsIntro')}
      footer={
        <>
          <button type="button" className="btn-secondary btn-sm" onClick={onClose}>
            {t('driveOrg.common.cancel')}
          </button>
          <button type="button" className="btn-primary btn-sm" disabled={save.isPending || !q.data?.canManage} onClick={() => save.mutate()}>
            {t('driveOrg.common.save')}
          </button>
        </>
      }
    >
      {!q.data ? (
        <Spinner className="size-5" />
      ) : (
        <div className="space-y-3 text-sm">
          <label className="flex items-center gap-2 font-semibold text-ink">
            <input type="checkbox" className="size-4 accent-brand-600" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} disabled={!q.data.canManage} />
            {t('driveOrg.naming.enabled')}
          </label>
          <label className="block">
            <span className="mb-1 block font-semibold text-ink">{t('driveOrg.naming.pattern')}</span>
            <input className="input font-mono" value={pattern} maxLength={120} onChange={(e) => setPattern(e.target.value)} disabled={!q.data.canManage} />
          </label>
          <div className="flex flex-wrap gap-1">
            {q.data.tokens.map((tok) => (
              <button key={tok} type="button" disabled={!q.data.canManage} onClick={() => setPattern((p) => `${p}{${tok}}`)} className="rounded border border-line bg-surface px-1.5 py-0.5 font-mono text-xs hover:border-brand-400">
                {`{${tok}}`}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted">{t('driveOrg.naming.tokensHint')}</p>
          <p className="rounded-lg bg-surface px-3 py-2 text-xs">
            {t('driveOrg.naming.example')}: <span className="font-mono font-semibold text-ink">{example(pattern)}</span>
          </p>
        </div>
      )}
    </Modal>
  );
};

/** "Adları qaydaya sal": preview of the new names in a folder (and below), then apply the ticked ones. */
export const TidyDialog = ({ folderId, folderName, onClose }: { folderId: string; folderName: string; onClose: () => void }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const preview = useQuery({
    queryKey: ['drive', 'org', 'tidy', folderId],
    queryFn: async () => (await api.post<{ items: TidyRow[]; pattern: string }>('/drive/naming/preview', { folderId })).data,
    gcTime: 0,
  });
  const rows = useMemo(() => preview.data?.items ?? [], [preview.data]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  useEffect(() => setPicked(new Set(rows.filter((r) => !r.blocked).map((r) => r.id))), [rows]);
  const apply = useMutation({
    mutationFn: async () => (await api.post<{ results: BatchResult[] }>('/drive/naming/apply', { folderId, ids: [...picked] })).data.results,
    onSuccess: (results) => {
      reportBatch(results, 'driveOrg.naming.renamed');
      void invalidateDrive(qc);
      onClose();
    },
    onError: toastDriveError,
  });
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={t('driveOrg.naming.tidyTitle', { name: folderName })}
      description={preview.data ? t('driveOrg.naming.tidyIntro', { pattern: preview.data.pattern }) : undefined}
      footer={
        <>
          <button type="button" className="btn-secondary btn-sm" onClick={onClose}>
            {t('driveOrg.common.cancel')}
          </button>
          <button type="button" className="btn-primary btn-sm" disabled={apply.isPending || picked.size === 0} onClick={() => apply.mutate()}>
            {t('driveOrg.naming.apply', { count: picked.size })}
          </button>
        </>
      }
    >
      {preview.isLoading ? (
        <Spinner className="size-5" />
      ) : preview.isError ? (
        <p className="text-sm text-danger">{driveError(preview.error)}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted">{t('driveOrg.naming.nothing')}</p>
      ) : (
        <ul className="max-h-[55vh] space-y-1 overflow-y-auto text-xs">
          {rows.map((r) => (
            <li key={r.id} className={clsx('flex items-center gap-2 rounded-lg border border-line px-2 py-1.5', r.blocked && 'opacity-60')}>
              <input
                type="checkbox"
                className="size-4 shrink-0 accent-brand-600"
                disabled={!!r.blocked}
                checked={picked.has(r.id)}
                onChange={(e) =>
                  setPicked((s) => {
                    const n = new Set(s);
                    if (e.target.checked) n.add(r.id);
                    else n.delete(r.id);
                    return n;
                  })
                }
                aria-label={r.from}
              />
              <span className="min-w-0 flex-1 truncate text-muted" title={r.from}>
                {r.from}
              </span>
              <ArrowRight className="size-3.5 shrink-0 text-muted" aria-hidden />
              <span className="min-w-0 flex-1 truncate font-semibold text-ink" title={r.to}>
                {r.to}
              </span>
              {r.blocked && <span className="shrink-0 text-[10px] font-semibold text-danger">{driveError(r.blocked)}</span>}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
};
