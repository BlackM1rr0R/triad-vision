import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { ArrowLeft, Check, ChevronRight, ExternalLink } from 'lucide-react';
import { api } from '@/lib/api';
import type { CaseStatus } from '@/lib/types';
import { delayedCommit } from '@/lib/undo';
import { statusLabel } from '@/components/admin/labels';
import { StatusBadge } from '@/components/admin/StatusBadge';
import { BottomSheet } from './BottomSheet';
import { NOTE_REQUIRED, actionBody, nextStatusOf, quickActionsFor, type QuickAction } from './pure';

const DANGER: QuickAction[] = ['REJECT', 'REJECT_SIGNATURE'];
const NOTE_OPTIONAL: QuickAction[] = ['APPROVE', 'REJECT'];

/**
 * Phone status sheet: the quick transitions the current status allows (pure.quickActionsFor, the lib/caseFlow rules),
 * sent through POST /admin/cases/:id/actions. They notify the client and have no reverse step, so — like the inline
 * status cell of the cases list — the request waits out the "Geri al" undo window (lib/undo delayedCommit).
 * Everything else (appointment, cancel, reopen) stays on the case page.
 */
export const StatusSheet = ({ open, onClose, caseId, number, status }: { open: boolean; onClose: () => void; caseId: string | null; number?: string; status?: CaseStatus }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [picked, setPicked] = useState<QuickAction | null>(null);
  const [note, setNote] = useState('');
  useEffect(() => {
    if (!open) {
      setPicked(null);
      setNote('');
    }
  }, [open]);
  const actions = status ? quickActionsFor(status) : [];
  const needsNote = !!picked && NOTE_REQUIRED.includes(picked);
  const canSend = !!picked && (!needsNote || note.trim().length >= 3);

  const run = (a: QuickAction) => {
    if (!caseId || !status) return;
    const body = actionBody(a, note);
    const url = `/admin/cases/${caseId}/actions`;
    delayedCommit({
      message: t('smob.status.queued', { number: number ?? '', action: t(`smob.status.actions.${a}`) }),
      commit: () => api.post(url, body),
      keepalive: { method: 'POST', url, body },
      successMessage: `${number ?? ''} · ${statusLabel(nextStatusOf(status, a) as CaseStatus)}`,
      onCommitted: () => {
        void qc.invalidateQueries({ queryKey: ['admin-cases'] });
        void qc.invalidateQueries({ queryKey: ['admin-case', caseId] });
        void qc.invalidateQueries({ queryKey: ['admin-inbox'] });
        void qc.invalidateQueries({ queryKey: ['admin-dashboard'] });
      },
    });
    onClose();
  };

  const choose = (a: QuickAction) => {
    if (NOTE_REQUIRED.includes(a) || NOTE_OPTIONAL.includes(a)) setPicked(a);
    else run(a);
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={t('smob.status.title')}
      subtitle={number}
      footer={
        picked ? (
          <>
            <button type="button" className="btn-secondary min-h-12 flex-1 justify-center" onClick={() => setPicked(null)}>
              <ArrowLeft className="size-4" aria-hidden /> {t('smob.status.back')}
            </button>
            <button type="button" className={clsx('min-h-12 flex-1 justify-center', DANGER.includes(picked) ? 'btn-danger' : 'btn-primary')} disabled={!canSend} onClick={() => run(picked)}>
              <Check className="size-4" aria-hidden /> {t('smob.status.confirm')}
            </button>
          </>
        ) : caseId ? (
          <Link to={`/admin/cases/${caseId}`} onClick={onClose} className="btn-secondary min-h-12 flex-1 justify-center">
            <ExternalLink className="size-4" aria-hidden /> {t('smob.status.openCase')}
          </Link>
        ) : undefined
      }
    >
      <div className="space-y-4 p-4">
        {status && (
          <p className="flex items-center justify-between gap-2 text-sm text-muted">
            {t('smob.status.current')} <StatusBadge status={status} />
          </p>
        )}
        {picked ? (
          <div className="space-y-3">
            <p className="text-base font-semibold text-ink">{t(`smob.status.actions.${picked}`)}</p>
            <label className="block">
              <span className="label">{needsNote ? t('smob.status.note') : t('smob.status.reason')}</span>
              <textarea data-autofocus className="input min-h-24 w-full text-base" maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
          </div>
        ) : actions.length === 0 ? (
          <p className="rounded-xl border border-line bg-sunken px-4 py-3 text-sm text-ink/80">{t('smob.status.none')}</p>
        ) : (
          <ul className="space-y-2">
            {actions.map((a) => (
              <li key={a}>
                <button
                  type="button"
                  onClick={() => choose(a)}
                  className={clsx(
                    'flex min-h-14 w-full items-center justify-between gap-3 rounded-xl border px-4 text-left text-base font-medium transition active:scale-[0.99] motion-reduce:active:scale-100',
                    DANGER.includes(a) ? 'border-danger-border text-danger-fg hover:bg-danger-bg' : 'border-line text-ink hover:bg-sunken',
                  )}
                >
                  <span>
                    {t(`smob.status.actions.${a}`)}
                    <span className="block text-xs font-normal text-muted">→ {statusLabel(nextStatusOf(status!, a) as CaseStatus)}</span>
                  </span>
                  <ChevronRight className="size-5 shrink-0 text-muted" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </BottomSheet>
  );
};
