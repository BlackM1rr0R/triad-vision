import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ArrowRightLeft, History, Plus, Vault } from 'lucide-react';
import { api } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesOriginals } from '@/i18n/pagesOriginals';
import { useAuth } from '@/lib/auth';
import { hasMinRole } from '@/lib/types';
import { Panel, Switch } from '@/components/admin/ui';
import { caseOriginalsKey, fetchCaseOriginals, originalsKey, type Original } from './api';
import { EventDialog, ReceiveDialog, SignActDialog, useOriginalError } from './dialogs';
import { DaysChip, LabelMenu, StatusChip, TimelineDrawer, WhereCell } from './parts';

registerCopy(pagesOriginals);

/** Legal-hold toggle for the client folder (ADMIN+): the drive retention never archives or deletes it. */
const LegalHold = ({ caseId }: { caseId: string }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const onError = useOriginalError();
  const { data: folder } = useQuery({
    queryKey: [...originalsKey, 'qr', caseId],
    queryFn: async () => (await api.get<{ driveFolderId: string | null }>(`/originals/qr/${caseId}`)).data.driveFolderId,
  });
  const { data: holds } = useQuery({
    queryKey: [...originalsKey, 'legal-hold'],
    queryFn: async () => (await api.get<{ folderIds: string[] }>('/originals/retention/legal-hold')).data.folderIds,
  });
  const toggle = useMutation({
    mutationFn: async (hold: boolean) => api.put('/originals/retention/legal-hold', { folderId: folder, hold }),
    onSuccess: () => {
      toast.success(t('originals.saved'));
      void qc.invalidateQueries({ queryKey: [...originalsKey, 'legal-hold'] });
    },
    onError,
  });
  if (!folder || !holds) return null;
  return (
    <div className="mt-3 flex items-start justify-between gap-3 border-t border-line pt-3">
      <div className="min-w-0">
        <p className="text-xs font-semibold text-navy-900">{t('originals.panel.legalHold')}</p>
        <p className="text-[11px] text-muted">{t('originals.panel.legalHoldHint')}</p>
      </div>
      <Switch checked={holds.includes(folder)} onChange={(v: boolean) => toggle.mutate(v)} label={t('originals.panel.legalHold')} />
    </div>
  );
};

/** Compact "Originals" panel on the admin case page: list, receive, move, history, acts, QR label. */
export const CaseOriginalsPanel = ({ caseId }: { caseId: string }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [receiving, setReceiving] = useState(false);
  const [moving, setMoving] = useState<Original | null>(null);
  const [history, setHistory] = useState<string | null>(null);
  const [signing, setSigning] = useState<string | null>(null);
  const { data } = useQuery({ queryKey: caseOriginalsKey(caseId), queryFn: () => fetchCaseOriginals(caseId) });
  const items = data ?? [];
  const shown = items.find((o) => o.id === history) ?? null;

  return (
    <Panel
      title={t('originals.panel.title')}
      icon={Vault}
      bodyClassName="p-4 sm:p-5"
      actions={
        <>
          <LabelMenu caseId={caseId} compact />
          <button type="button" className="btn-primary btn-sm" onClick={() => setReceiving(true)}>
            <Plus className="size-4" aria-hidden /> {t('originals.receive.button')}
          </button>
        </>
      }
    >
      {items.length === 0 ? (
        <p className="text-sm text-muted">{t('originals.panel.empty')}</p>
      ) : (
        <ul className="divide-y divide-line">
          {items.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-navy-900">{o.title}</p>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                  <StatusChip status={o.status} />
                  <DaysChip o={o} />
                  <WhereCell o={o} />
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button type="button" className="grid size-9 place-items-center rounded-lg text-brand-600 hover:bg-brand-50" title={t('originals.event.title')} aria-label={`${t('originals.event.title')}: ${o.title}`} onClick={() => setMoving(o)}>
                  <ArrowRightLeft className="size-4" aria-hidden />
                </button>
                <button type="button" className="grid size-9 place-items-center rounded-lg text-muted hover:bg-surface hover:text-ink" title={t('originals.timelineOpen')} aria-label={`${t('originals.timelineOpen')}: ${o.title}`} onClick={() => setHistory(o.id)}>
                  <History className="size-4" aria-hidden />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {items.length > 0 && (
        <Link to={`/admin/originals?q=${encodeURIComponent(items[0].case.number)}`} className="mt-2 inline-block text-xs font-semibold text-brand-600 hover:underline">
          {t('originals.panel.all')} →
        </Link>
      )}
      {hasMinRole(user?.role, 'ADMIN') && <LegalHold caseId={caseId} />}

      <ReceiveDialog caseId={caseId} open={receiving} onClose={() => setReceiving(false)} />
      {moving && <EventDialog key={moving.id} originals={[moving]} open onClose={() => setMoving(null)} />}
      <TimelineDrawer original={shown} open={!!history} onClose={() => setHistory(null)} onSign={setSigning} />
      <SignActDialog key={signing ?? 'none'} eventId={signing} open={!!signing} onClose={() => setSigning(null)} />
    </Panel>
  );
};

export default CaseOriginalsPanel;
