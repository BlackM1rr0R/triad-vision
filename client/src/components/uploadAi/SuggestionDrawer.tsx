import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { toast } from 'sonner';
import { AlertTriangle, ArrowRight, CalendarClock, Check, FolderInput, Link2, PencilLine, RefreshCw, Undo2, X } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { pagesUploadAi } from '@/i18n/pagesUploadAi';
import { errorCode } from '@/lib/api';
import { useL10n } from '@/lib/l10n';
import type { L10n } from '@/lib/types';
import { Drawer } from '@/components/admin/Drawer';
import { Spinner } from '@/components/ui/Spinner';
import { DOC_TYPES, acceptInsight, changeInsightType, reanalyzeInsight, rejectInsight, requestReupload, type DocType, type InsightAction, type StaffInsight } from './api';

registerCopy(pagesUploadAi);

const ACTION_ICON = { rename: PencilLine, link: Link2, move: FolderInput, expiry: CalendarClock } as const;
const FIELD_ORDER = ['holderName', 'documentNumber', 'birthDate', 'issueDate', 'expiryDate', 'issuingCountry', 'issuingAuthority', 'language'] as const;

/**
 * The suggestion card of one upload (staff): what was recognised, the proposals with one "Accept", a type
 * select ("Change type" rebuilds the proposals immediately), "Reject", and for case documents of poor quality
 * or the wrong type "Ask client to re-upload". All clicks, no typing.
 */
export const SuggestionDrawer = ({
  insight,
  open,
  onClose,
  onChanged,
}: {
  insight: StaffInsight | null;
  open: boolean;
  onClose: () => void;
  onChanged: (next?: StaffInsight) => unknown;
}) => {
  const { t } = useTranslation();
  const { tr, date } = useL10n();
  const [skip, setSkip] = useState<Set<InsightAction>>(new Set());
  const fail = (err: unknown) => toast.error(`${t('uploadAi.staff.error')} (${errorCode(err)})`);

  const accept = useMutation({
    mutationFn: () => acceptInsight(insight!.id, insight!.proposals.actions.filter((a) => !skip.has(a))),
    onSuccess: (r) => {
      toast.success(t('uploadAi.staff.accepted'));
      void onChanged(r);
      onClose();
    },
    onError: fail,
  });
  const reject = useMutation({
    mutationFn: () => rejectInsight(insight!.id),
    onSuccess: (r) => {
      toast.success(t('uploadAi.staff.rejected'));
      void onChanged(r);
      onClose();
    },
    onError: fail,
  });
  const retype = useMutation({
    mutationFn: (docType: DocType) => changeInsightType(insight!.id, docType),
    onSuccess: (r) => {
      setSkip(new Set());
      toast.success(t('uploadAi.staff.typeChanged'));
      void onChanged(r);
    },
    onError: fail,
  });
  const reanalyze = useMutation({ mutationFn: () => reanalyzeInsight(insight!.id), onSuccess: (r) => void onChanged(r), onError: fail });
  const reupload = useMutation({
    mutationFn: () => requestReupload(insight!.documentId!),
    onSuccess: () => {
      toast.success(t('uploadAi.staff.reuploadDone'));
      void onChanged();
      onClose();
    },
    onError: fail,
  });

  const busy = accept.isPending || reject.isPending || retype.isPending || reanalyze.isPending || reupload.isPending;
  const i = insight;
  const openActions = i?.status === 'PROPOSED' ? i.proposals.actions : [];
  const chosen = openActions.filter((a) => !skip.has(a));
  const toggle = (a: InsightAction) =>
    setSkip((s) => {
      const n = new Set(s);
      if (n.has(a)) n.delete(a);
      else n.add(a);
      return n;
    });

  const target = (a: InsightAction) => {
    if (!i) return '';
    if (a === 'rename') return i.proposedName ?? '';
    if (a === 'link') return i.proposals.requirement ? tr(i.proposals.requirement.title as unknown as L10n) : '';
    if (a === 'move') return i.proposals.folder ? `${i.proposals.folder.name}${i.proposals.folder.id ? '' : ` ${t('uploadAi.staff.newFolder')}`}` : '';
    return i.expiryDate ? date(i.expiryDate) : '';
  };

  const canReupload = !!i?.documentId && !i.driveNodeId && (i.qualityLevel === 'BAD' || i.flags.includes('WRONG_REQUIREMENT'));

  return (
    <Drawer
      open={open && !!i}
      onClose={onClose}
      title={t('uploadAi.staff.title')}
      footer={
        i && (
          <div className="flex flex-wrap items-center gap-2">
            {openActions.length > 0 && (
              <button type="button" className="btn-primary btn-sm" disabled={busy || !chosen.length} onClick={() => accept.mutate()}>
                {accept.isPending ? <Spinner className="size-3.5" /> : <Check className="size-4" aria-hidden />} {t('uploadAi.staff.accept')}
              </button>
            )}
            {i.status === 'PROPOSED' && (
              <button type="button" className="btn-secondary btn-sm" disabled={busy} onClick={() => reject.mutate()}>
                <X className="size-4" aria-hidden /> {t('uploadAi.staff.reject')}
              </button>
            )}
            {canReupload && (
              <button type="button" className="btn-secondary btn-sm border border-danger-border text-danger-fg dark:border-red-900/60" disabled={busy} onClick={() => reupload.mutate()}>
                {reupload.isPending ? <Spinner className="size-3.5" /> : <Undo2 className="size-4" aria-hidden />} {t('uploadAi.staff.reupload')}
              </button>
            )}
            <button type="button" className="ml-auto btn-secondary btn-sm" disabled={busy} onClick={onClose}>
              {t('uploadAi.staff.close')}
            </button>
          </div>
        )
      }
    >
      {i && (
        <div className="space-y-4 text-sm">
          <p className="truncate text-xs text-muted" title={i.proposals.currentName}>
            {i.proposals.currentName}
          </p>

          <div className="rounded-lg border border-line bg-sunken p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-muted">{t('uploadAi.staff.detected')}</span>
              <span className="text-xs text-muted">
                {t('uploadAi.staff.confidence')}: {Math.round(i.confidence * 100)}% · {t(`uploadAi.staff.source.${i.source}`, { defaultValue: i.source })}
              </span>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <select
                className="input h-9 min-w-0 flex-1 py-1 text-sm"
                value={i.docType}
                disabled={busy || i.status === 'PENDING'}
                aria-label={t('uploadAi.staff.changeType')}
                title={t('uploadAi.staff.changeType')}
                onChange={(e) => retype.mutate(e.target.value as DocType)}
              >
                {DOC_TYPES.map((d) => (
                  <option key={d} value={d}>
                    {t(`uploadAi.types.${d}`)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="grid size-9 place-items-center rounded-lg border border-line text-muted hover:bg-primary/[0.06] hover:text-link disabled:opacity-50 dark:hover:bg-white/5"
                disabled={busy}
                onClick={() => reanalyze.mutate()}
                title={t('uploadAi.staff.reanalyze')}
                aria-label={t('uploadAi.staff.reanalyze')}
              >
                {reanalyze.isPending ? <Spinner className="size-3.5" /> : <RefreshCw className="size-4" aria-hidden />}
              </button>
            </div>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
              {FIELD_ORDER.filter((k) => i.fields[k]).map((k) => (
                <div key={k} className="contents">
                  <dt className="text-muted">{t(`uploadAi.staff.fields.${k}`)}</dt>
                  <dd className="min-w-0 break-words text-ink">{k.endsWith('Date') && /^\d{4}-\d{2}-\d{2}$/.test(i.fields[k]!) ? date(i.fields[k]!) : i.fields[k]}</dd>
                </div>
              ))}
            </dl>
          </div>

          {(i.flags.length > 0 || (i.quality && i.quality.level !== 'OK')) && (
            <ul className="space-y-1">
              {i.flags.map((f) => (
                <li key={f} className="flex items-start gap-1.5 text-xs text-warning-fg">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {t(`uploadAi.staff.flags.${f}`, { defaultValue: f })}
                </li>
              ))}
              {i.quality && i.quality.level !== 'OK' && (
                <li className={clsx('flex items-start gap-1.5 text-xs', i.quality.level === 'BAD' ? 'text-danger-fg' : 'text-warning-fg')}>
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  {t('uploadAi.staff.lowQuality')}: {[...new Set(i.quality.reasons.map((r) => t(`uploadAi.quality.reasons.${r.code}`, { defaultValue: r.code })))].join(' · ')}
                </li>
              )}
            </ul>
          )}

          <div>
            {openActions.length ? (
              <ul className="space-y-1.5">
                {openActions.map((a) => {
                  const Icon = ACTION_ICON[a];
                  return (
                    <li key={a}>
                      <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-line p-2.5 hover:bg-sunken">
                        <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-primary" checked={!skip.has(a)} onChange={() => toggle(a)} disabled={busy} />
                        <Icon className="mt-0.5 size-4 shrink-0 text-link" aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="block text-xs text-muted">{t(`uploadAi.staff.actions.${a}`)}</span>
                          <span className="flex min-w-0 items-center gap-1 font-medium break-all text-ink">
                            {a === 'rename' && (
                              <>
                                <span className="truncate text-muted line-through decoration-1">{i.proposals.currentName}</span>
                                <ArrowRight className="size-3 shrink-0 text-muted" aria-hidden />
                              </>
                            )}
                            <span className="break-all">{target(a)}</span>
                          </span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-xs text-muted">
                {i.status === 'PROPOSED' ? t('uploadAi.staff.nothing') : t(`uploadAi.staff.status.${i.status}`)}
              </p>
            )}
          </div>
          <p className="text-[11px] text-muted">{t('uploadAi.staff.note')}</p>
        </div>
      )}
    </Drawer>
  );
};

export default SuggestionDrawer;
