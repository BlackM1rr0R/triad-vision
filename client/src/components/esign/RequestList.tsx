import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { ChevronRight } from 'lucide-react';
import { fmtDate } from '@/components/admin/labels';
import { SIGNER_TONE, STATUS_TONE, type StaffRequest } from './api';

/** Compact rows of signature requests with each party's progress (cards on phones, a grid row from md). */
export const RequestRows = ({ items, onOpen, showCase = true }: { items: StaffRequest[]; onOpen: (id: string) => void; showCase?: boolean }) => {
  const { t } = useTranslation();
  return (
    <ul className="divide-y divide-line">
      {items.map((r) => {
        const done = r.signers.filter((s) => s.status === 'SIGNED').length;
        return (
          <li key={r.id}>
            <button type="button" onClick={() => onOpen(r.id)} className="group grid w-full grid-cols-1 gap-2 px-1 py-3 text-left transition hover:bg-surface/60 md:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_auto_auto] md:items-center md:gap-4 md:px-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink group-hover:text-link">{r.title}</p>
                <p className="truncate text-xs text-muted">
                  {showCase && r.case ? `${r.case.number} · ` : ''}
                  {r.company ? `${r.company.name} · ` : ''}
                  {r.createdBy?.name ?? ''} · {fmtDate(r.createdAt)}
                </p>
              </div>
              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                {r.signers.map((s) => (
                  <span key={s.id} className={clsx('badge max-w-40 truncate', SIGNER_TONE[s.status], r.currentTurn.includes(s.id) && 'ring-2 ring-focus')} title={`${s.name} · ${t(`esign.signerStatus.${s.status}`)}`}>
                    <span className="truncate">{s.name}</span>
                  </span>
                ))}
                <span className="text-[11px] text-muted tabular-nums">
                  {done}/{r.signers.length}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className={clsx('badge', STATUS_TONE[r.status])}>{t(`esign.status.${r.status}`)}</span>
                {r.status === 'SENT' && r.expiresAt && <span className="text-[11px] whitespace-nowrap text-muted">→ {fmtDate(r.expiresAt)}</span>}
              </div>
              <ChevronRight className="hidden size-4 text-muted md:block" aria-hidden />
            </button>
          </li>
        );
      })}
    </ul>
  );
};
