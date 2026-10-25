import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ExternalLink, Link2, Link2Off, Loader2, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { Modal } from './Modal';
import type { Row } from './types';

interface Suggestion {
  caseId: string;
  number: string;
  status: string;
  clientName: string;
  score: number;
}

interface CaseItem {
  id: string;
  number: string;
  status: string;
  client?: { firstName: string; lastName: string };
}

/** Link a ledger row to a case: name suggestions, search, unlink. */
export const LinkDialog = ({ row, onClose, onLinked }: { row: Row; onClose: () => void; onLinked: (row: Row) => void }) => {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const sug = useQuery({
    queryKey: ['settlements', 'suggestions', row.id],
    queryFn: async () => (await api.get<{ suggestions: Suggestion[] }>(`/admin/settlements/${row.id}/suggestions`)).data.suggestions,
  });
  const search = useQuery({
    queryKey: ['settlements', 'case-search', q],
    enabled: q.trim().length >= 2,
    queryFn: async () => (await api.get<{ items: CaseItem[] }>('/admin/cases', { params: { search: q.trim() } })).data.items.slice(0, 8),
  });

  const link = async (caseId: string | null) => {
    setBusy(true);
    try {
      const { data } = await api.post<{ row: Row }>(`/admin/settlements/${row.id}/link`, { caseId });
      toast.success(t(caseId ? 'settlement.link.linked' : 'settlement.link.unlinked'));
      onLinked(data.row);
      onClose();
    } catch {
      toast.error(t('settlement.errors.generic'));
    } finally {
      setBusy(false);
    }
  };

  const item = (id: string, number: string, name: string, status: string, score?: number) => (
    <li key={id} className="flex items-center gap-3 border-b border-line py-2 last:border-0">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold">{name}</div>
        <div className="text-xs text-muted">
          {number} · {status}
          {score != null && ` · ${Math.round(score * 100)}%`}
        </div>
      </div>
      <button type="button" className="btn-secondary btn-sm" disabled={busy || row.caseId === id} onClick={() => void link(id)}>
        <Link2 className="size-4" /> {t('settlement.link.link')}
      </button>
    </li>
  );

  return (
    <Modal title={`${t('settlement.link.title')}: ${row.clientName}`} onClose={onClose}>
      <p className="text-xs text-muted">{t('settlement.link.followHint')}</p>
      <div className="mt-3 rounded-xl border border-line bg-sunken p-3 text-sm">
        {row.case ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{t('settlement.link.linkedTo', { number: row.case.number })}</span>
            <span className="text-muted">
              {row.case.clientName} · {row.case.status}
            </span>
            <span className="ml-auto flex gap-1">
              <Link to={`/admin/cases/${row.case.id}`} className="btn-secondary btn-sm">
                <ExternalLink className="size-4" /> {t('settlement.link.open')}
              </Link>
              <button type="button" className="btn-danger btn-sm" disabled={busy} onClick={() => void link(null)}>
                <Link2Off className="size-4" /> {t('settlement.link.unlink')}
              </button>
            </span>
          </div>
        ) : (
          <span className="text-muted">{t('settlement.link.notLinked')}</span>
        )}
      </div>
      <h3 className="mt-4 text-sm font-semibold">{t('settlement.link.suggestions')}</h3>
      {sug.isLoading ? (
        <Loader2 className="mt-2 size-4 animate-spin text-muted" />
      ) : sug.data?.length ? (
        <ul className="mt-1">{sug.data.map((s) => item(s.caseId, s.number, s.clientName, s.status, s.score))}</ul>
      ) : (
        <p className="mt-1 text-sm text-muted">{t('settlement.link.noSuggestions')}</p>
      )}
      <label className="relative mt-4 block">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
        <input className="input pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('settlement.link.search')} />
      </label>
      {search.data && search.data.length > 0 && (
        <ul className="mt-1">{search.data.map((c) => item(c.id, c.number, c.client ? `${c.client.firstName} ${c.client.lastName}` : c.number, c.status))}</ul>
      )}
    </Modal>
  );
};
