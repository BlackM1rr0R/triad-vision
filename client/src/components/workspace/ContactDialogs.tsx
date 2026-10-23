import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { Building2, Download, Plus, Sparkles, Upload, UserRound, Users } from 'lucide-react';
import { api } from '@/lib/api';
import type { Contact, Suggestions } from './api';
import { useSuggestions, useWorkspaceInvalidate } from './api';
import { Avatar, Empty, Modal, Skeleton, Toggle, errorText, fullName } from './ui';
import { downloadText } from './vcard';

interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
  total: number;
  columns: string[];
  unmapped: string[];
}

/** CSV import (paste or file) and export in one dialog. */
export const ImportExportDialog = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const { t } = useTranslation();
  const inv = useWorkspaceInvalidate();
  const [csv, setCsv] = useState('');
  const [shared, setShared] = useState(true);
  const [update, setUpdate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  useEffect(() => {
    if (open) {
      setCsv('');
      setResult(null);
      setBusy(false);
    }
  }, [open]);

  const pickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setCsv(String(reader.result ?? ''));
    reader.readAsText(f);
  };
  const run = async () => {
    if (!csv.trim() || busy) return;
    setBusy(true);
    try {
      const { data } = await api.post<ImportResult>('/contacts/import', { csv, shared, update });
      setResult(data);
      inv.contacts();
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  };
  const exportCsv = async () => {
    try {
      const { data } = await api.get<string>('/contacts/export.csv', { responseType: 'text' });
      downloadText(`contacts-${new Date().toISOString().slice(0, 10)}.csv`, data, 'text/csv');
    } catch (err) {
      toast.error(errorText(err));
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('ws.contacts.import.title')}
      busy={busy}
      footer={
        <>
          <button type="button" onClick={() => void exportCsv()} className="btn-white btn-sm mr-auto border border-line">
            <Download className="size-4" /> {t('ws.contacts.actions.export')}
          </button>
          <button type="button" onClick={onClose} className="btn-secondary btn-sm" disabled={busy}>
            {t('ws.common.close')}
          </button>
          <button type="button" onClick={() => void run()} className="btn-primary btn-sm" disabled={busy || !csv.trim()}>
            <Upload className="size-4" /> {t('ws.contacts.import.run')}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-muted">{t('ws.contacts.import.hint')}</p>
        <div className="flex flex-wrap items-center gap-3">
          <label className="btn-white btn-sm cursor-pointer border border-line">
            <Upload className="size-4" /> {t('ws.contacts.import.file')}
            <input type="file" accept=".csv,text/csv,text/plain" onChange={pickFile} className="sr-only" />
          </label>
          <Toggle checked={shared} onChange={setShared} label={t('ws.contacts.import.shared')} />
          <Toggle checked={update} onChange={setUpdate} label={t('ws.contacts.import.update')} />
        </div>
        <textarea value={csv} onChange={(e) => setCsv(e.target.value)} rows={10} placeholder={`${t('ws.contacts.import.paste')}\n\nfirstName,lastName,email,phone,company,position,tags\nHans,Müller,hans@example.de,+49 30 1234,Müller GmbH,CEO,"partner, logistics"`} className="input resize-y font-mono text-xs leading-relaxed" />
        {result && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            <p className="font-semibold">{t('ws.contacts.import.result', { created: result.created, updated: result.updated, skipped: result.skipped })}</p>
            {result.unmapped.length > 0 && <p className="mt-1 text-xs">{t('ws.contacts.import.unmapped', { cols: result.unmapped.join(', ') })}</p>}
          </div>
        )}
        <p className="text-xs text-muted">{t('ws.contacts.export.hint')}</p>
      </div>
    </Modal>
  );
};

/** Pick the survivor among the selected contacts, merge the rest into it. */
export const MergeDialog = ({ open, onClose, contacts, onMerged }: { open: boolean; onClose: () => void; contacts: Contact[]; onMerged: () => void }) => {
  const { t } = useTranslation();
  const inv = useWorkspaceInvalidate();
  const [keepId, setKeepId] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setKeepId(contacts[0]?.id ?? '');
      setBusy(false);
    }
  }, [open, contacts]);
  const run = async () => {
    if (!keepId || contacts.length < 2 || busy) return;
    setBusy(true);
    try {
      const { data } = await api.post<{ contact: Contact; merged: number }>('/contacts/merge', { keepId, mergeIds: contacts.filter((c) => c.id !== keepId).map((c) => c.id) });
      toast.success(t('ws.contacts.merge.done', { count: data.merged }));
      inv.contacts();
      onMerged();
      onClose();
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('ws.contacts.merge.title')}
      busy={busy}
      size="sm"
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-secondary btn-sm" disabled={busy}>
            {t('ws.common.cancel')}
          </button>
          <button type="button" onClick={() => void run()} className="btn-primary btn-sm" disabled={busy || contacts.length < 2 || !keepId}>
            {t('ws.contacts.merge.run')}
          </button>
        </>
      }
    >
      <p className="mb-3 text-sm text-muted">{contacts.length < 2 ? t('ws.contacts.merge.selectHint') : t('ws.contacts.merge.hint')}</p>
      <ul className="space-y-2" role="radiogroup">
        {contacts.map((c) => (
          <li key={c.id}>
            <button type="button" role="radio" aria-checked={keepId === c.id} onClick={() => setKeepId(c.id)} className={clsx('flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition', keepId === c.id ? 'border-brand-500 bg-brand-50' : 'border-line bg-surface hover:border-brand-300')}>
              <Avatar id={c.id} person={c} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-ink">{fullName(c)}</span>
                <span className="block truncate text-xs text-muted">{[c.email, c.company].filter(Boolean).join(' · ')}</span>
              </span>
              {keepId === c.id && <span className="badge bg-brand-600 text-white">{t('ws.contacts.merge.keep')}</span>}
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
};

type SuggestionRow = Suggestions['clients'][number] | Suggestions['employers'][number] | Suggestions['companies'][number];

/** People on the platform who are not contacts yet, with one-click add. */
export const SuggestionsPanel = ({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded: (c: Contact) => void }) => {
  const { t } = useTranslation();
  const inv = useWorkspaceInvalidate();
  const q = useSuggestions(open);
  const [busy, setBusy] = useState<string | null>(null);
  const add = async (row: SuggestionRow) => {
    const key = row.kind === 'company' ? row.companyId : row.userId;
    setBusy(key);
    try {
      const { data } = await api.post<{ contact: Contact }>(row.kind === 'company' ? `/contacts/from-company/${row.companyId}` : `/contacts/from-user/${row.userId}`);
      toast.success(t('ws.contacts.suggest.added'));
      inv.contacts();
      onAdded(data.contact);
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(null);
    }
  };
  const groups: { key: keyof Suggestions; icon: typeof Users; rows: SuggestionRow[] }[] = q.data
    ? [
        { key: 'clients', icon: UserRound, rows: q.data.clients },
        { key: 'employers', icon: Users, rows: q.data.employers },
        { key: 'companies', icon: Building2, rows: q.data.companies },
      ]
    : [];
  const total = groups.reduce((n, g) => n + g.rows.length, 0);
  return (
    <Modal open={open} onClose={onClose} title={t('ws.contacts.suggest.title')}>
      <p className="mb-4 text-sm text-muted">{t('ws.contacts.suggest.hint')}</p>
      {q.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
      ) : !total ? (
        <Empty icon={Sparkles}>{t('ws.contacts.suggest.empty')}</Empty>
      ) : (
        <div className="space-y-5">
          {groups
            .filter((g) => g.rows.length)
            .map((g) => (
              <section key={g.key}>
                <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold tracking-wide text-muted uppercase">
                  <g.icon className="size-3.5" aria-hidden /> {t(`ws.contacts.suggest.${g.key}`)} · {g.rows.length}
                </h3>
                <ul className="divide-y divide-line rounded-lg border border-line">
                  {g.rows.map((r) => {
                    const id = r.kind === 'company' ? r.companyId : r.userId;
                    const name = r.kind === 'company' ? r.name : fullName(r);
                    const sub = r.kind === 'client' ? [r.email, t('ws.contacts.suggest.cases', { count: r.cases })] : r.kind === 'employer' ? [r.email, r.company] : [r.contactName, r.email, r.city];
                    return (
                      <li key={id} className="flex items-center gap-3 px-3 py-2">
                        <Avatar id={id} person={r.kind === 'company' ? { firstName: r.name } : r} size="sm" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-ink">{name}</span>
                          <span className="block truncate text-xs text-muted">{sub.filter(Boolean).join(' · ')}</span>
                        </span>
                        <button type="button" onClick={() => void add(r)} disabled={busy === id} className="btn-white btn-sm h-8 border border-line px-3">
                          <Plus className="size-3.5" /> {t('ws.contacts.suggest.add')}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
        </div>
      )}
    </Modal>
  );
};
