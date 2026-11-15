import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { Copy, Link2, MessageCircle, Send } from 'lucide-react';
import { api } from '@/lib/api';
import { useL10n } from '@/lib/l10n';
import type { L10n } from '@/lib/types';
import { registerCopy } from '@/i18n';
import { pagesStaffTools } from '@/i18n/pagesStaffTools';
import { Panel } from '@/components/admin/ui';
import { fmtDate, toastError } from '@/components/admin/labels';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { Modal } from '@/components/ui/Modal';
import { TONE_CLASS } from '@/components/ui/status';

registerCopy(pagesStaffTools);

type LinkState = 'ACTIVE' | 'EXPIRED' | 'REVOKED' | 'EXHAUSTED';
interface UploadLink {
  id: string;
  tokenPrefix: string;
  requirementIds: string[];
  sentTo: string | null;
  createdAt: string;
  expiresAt: string;
  uploadCount: number;
  lastUsedAt: string | null;
  state: LinkState;
}
interface Requirement {
  id: string;
  title: L10n;
  stage: string;
  required: boolean;
  missing: boolean;
}

const STATE_TONE: Record<LinkState, 'success' | 'neutral' | 'danger' | 'warning'> = { ACTIVE: 'success', EXPIRED: 'neutral', REVOKED: 'danger', EXHAUSTED: 'warning' };

/**
 * Admin case › Sənədlər: "Request documents via link" — pick requirements, expiry (default 7 days), send by
 * e-mail and/or copy (WhatsApp); list of the case's links with uploads and revoke (server routes/uploadLinks.ts).
 */
export const UploadLinkPanel = ({ caseId }: { caseId: string }) => {
  const { t } = useTranslation();
  const u = (k: string, o?: Record<string, unknown>) => String(t(`staffTools.uploadLink.${k}`, o));
  const qc = useQueryClient();
  const key = ['case-upload-links', caseId];
  const links = useQuery({ queryKey: key, queryFn: async () => (await api.get<{ items: UploadLink[] }>(`/admin/cases/${caseId}/upload-links`)).data.items });
  const [open, setOpen] = useState(false);
  const [revoking, setRevoking] = useState<UploadLink | null>(null);
  const revoke = useMutation({
    mutationFn: async (id: string) => api.post(`/admin/upload-links/${id}/revoke`, {}),
    onSuccess: () => {
      toast.success(u('revoked'));
      setRevoking(null);
      void qc.invalidateQueries({ queryKey: key });
    },
    onError: (e) => toastError(e),
  });
  const items = links.data ?? [];
  return (
    <Panel
      id="case-upload-links"
      title={u('title')}
      icon={Link2}
      bodyClassName="space-y-3"
      actions={
        <button type="button" className="btn-secondary btn-sm" onClick={() => setOpen(true)}>
          <Send className="size-3.5" aria-hidden /> {u('request')}
        </button>
      }
    >
      <p className="text-xs text-muted">{u('hint')}</p>
      {items.length === 0 ? (
        <p className="text-sm text-muted">{u('empty')}</p>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {items.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
              <span className={clsx('badge', TONE_CLASS[STATE_TONE[l.state]])}>{u(`state.${l.state}`)}</span>
              <span className="font-mono text-xs text-muted">{l.tokenPrefix}…</span>
              <span className="text-xs text-ink/80">{u('uploads', { count: l.uploadCount })}</span>
              <span className="text-xs text-muted">{u('expires', { date: fmtDate(l.expiresAt) })}</span>
              {l.sentTo && <span className="truncate text-xs text-muted">✉ {l.sentTo}</span>}
              {l.state === 'ACTIVE' && (
                <button type="button" className="btn-ghost btn-sm ml-auto text-danger-fg" onClick={() => setRevoking(l)}>
                  {u('revoke')}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <CreateDialog open={open} onClose={() => setOpen(false)} caseId={caseId} onCreated={() => void qc.invalidateQueries({ queryKey: key })} />
      <ConfirmDialog
        open={!!revoking}
        onClose={() => setRevoking(null)}
        onConfirm={() => revoking && revoke.mutate(revoking.id)}
        title={u('revoke')}
        message={u('revokeConfirm')}
        confirmLabel={u('revoke')}
        loading={revoke.isPending}
      />
    </Panel>
  );
};

const CreateDialog = ({ open, onClose, caseId, onCreated }: { open: boolean; onClose: () => void; caseId: string; onCreated: () => void }) => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const u = (k: string, o?: Record<string, unknown>) => String(t(`staffTools.uploadLink.${k}`, o));
  const reqs = useQuery({
    queryKey: ['case-upload-link-reqs', caseId],
    enabled: open,
    queryFn: async () => (await api.get<{ items: Requirement[] }>(`/admin/cases/${caseId}/upload-links/requirements`)).data.items,
  });
  const [picked, setPicked] = useState<string[] | null>(null);
  const [days, setDays] = useState(7);
  const [note, setNote] = useState('');
  const [email, setEmail] = useState(true);
  const [result, setResult] = useState<{ url: string; emailed: boolean } | null>(null);
  const defaultPick = (reqs.data ?? []).filter((r) => r.missing && r.required).map((r) => r.id);
  const selected = picked ?? defaultPick;
  const toggle = (id: string) => setPicked(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  const close = () => {
    setResult(null);
    setPicked(null);
    setNote('');
    onClose();
  };
  const create = useMutation({
    mutationFn: async () => (await api.post<{ url: string; emailed: boolean }>(`/admin/cases/${caseId}/upload-links`, { requirementIds: selected, days, note: note.trim() || null, email })).data,
    onSuccess: (r) => {
      setResult({ url: r.url, emailed: r.emailed });
      toast.success(u('created'));
      onCreated();
    },
    onError: (e) => toastError(e),
  });
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(u('copied'));
    } catch {
      /* clipboard blocked: the field stays selectable */
    }
  };
  return (
    <Modal
      open={open}
      onClose={close}
      title={u('dialogTitle')}
      as={result ? 'div' : 'form'}
      busy={create.isPending}
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        if (selected.length) create.mutate();
      }}
      footer={
        result ? (
          <button type="button" className="btn-secondary btn-sm" onClick={close}>
            {u('close')}
          </button>
        ) : (
          <button type="submit" className="btn-primary btn-sm" disabled={create.isPending || !selected.length}>
            {u('create')}
          </button>
        )
      }
    >
      {result ? (
        <div className="space-y-3">
          <p className="text-sm text-ink">{u('linkOnce')}</p>
          <input readOnly className="input font-mono text-xs" value={result.url} aria-label={u('created')} onFocus={(e) => e.currentTarget.select()} />
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-secondary btn-sm" onClick={() => void copy(result.url)}>
              <Copy className="size-3.5" aria-hidden /> {u('copy')}
            </button>
            <a className="btn-secondary btn-sm" href={`https://wa.me/?text=${encodeURIComponent(u('whatsappText', { url: result.url }))}`} target="_blank" rel="noopener noreferrer">
              <MessageCircle className="size-3.5" aria-hidden /> {u('whatsapp')}
            </a>
          </div>
          {result.emailed && <p className="text-xs text-success-fg">{u('emailed')}</p>}
        </div>
      ) : (
        <div className="space-y-4">
          <fieldset>
            <legend className="label">{u('pick')}</legend>
            <ul className="max-h-64 space-y-1 overflow-y-auto">
              {(reqs.data ?? []).map((r) => (
                <li key={r.id}>
                  <label className="flex min-h-9 items-center gap-2 text-sm">
                    <input type="checkbox" checked={selected.includes(r.id)} onChange={() => toggle(r.id)} />
                    <span className="min-w-0 flex-1 truncate">{tr(r.title)}</span>
                    {r.missing && <span className="badge bg-warning-bg text-warning-fg">{u('missing')}</span>}
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
          <label className="block">
            <span className="label">{u('days')}</span>
            <input type="number" min={1} max={30} className="input w-24" value={days} onChange={(e) => setDays(Math.max(1, Math.min(30, Number(e.target.value) || 7)))} />
          </label>
          <label className="block">
            <span className="label">{u('note')}</span>
            <textarea className="input min-h-20" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={email} onChange={(e) => setEmail(e.target.checked)} /> {u('email')}
          </label>
        </div>
      )}
    </Modal>
  );
};

export default UploadLinkPanel;
