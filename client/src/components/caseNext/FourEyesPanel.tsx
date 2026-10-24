import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, ScanEye, ShieldAlert, XCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { hasMinRole, type CaseDetail } from '@/lib/types';
import { registerCopy } from '@/i18n';
import { pagesPostArrival } from '@/i18n/pagesPostArrival';
import { Panel, Switch } from '@/components/admin/ui';
import { Modal } from '@/components/admin/Modal';
import { fmtDateTime, toastError } from '@/components/admin/labels';
import { TONE_CLASS, type BadgeTone } from '@/components/ui/status';

registerCopy(pagesPostArrival);

// GET /api/admin/cases/:id/four-eyes (server lib/caseNext/fourEyes.ts fourEyesState)
type State = 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'OVERRIDDEN' | 'STALE';
interface Person {
  id: string;
  name: string;
}
interface Approval {
  id: string;
  status: Exclude<State, 'NONE' | 'STALE'>;
  requestedBy: Person;
  requestedAt: string;
  reviewer: Person | null;
  reviewedAt: string | null;
  comment: string | null;
  checklist: { key: string; ok: boolean; note: string | null }[];
}
interface FourEyes {
  enabled: boolean;
  state: State;
  cleared: boolean;
  current: { packageBuilt: boolean; changedSinceRequest: boolean; documents: number };
  latest: Approval | null;
  history: Approval[];
  checklistKeys: string[];
  canReview: boolean;
  canOverride: boolean;
}
interface StaffMember {
  id: string;
  firstName: string;
  lastName: string;
}

const STATE_TONE: Record<State, BadgeTone> = { NONE: 'neutral', PENDING: 'info', APPROVED: 'success', REJECTED: 'danger', OVERRIDDEN: 'accent', STALE: 'warning' };

/** Fingerprint of the case documents: the panel refetches when a document / the package changes. */
const docsSignature = (c: CaseDetail) =>
  [...c.requirements.flatMap((r) => r.documents.map((d) => `${d.id}:${d.status}`)), ...c.otherDocuments.map((d) => d.id)].sort().join('|');

/**
 * "4 göz yoxlaması" next to the embassy package: the builder asks a second staff member, who approves with a
 * short checklist or sends the package back; "Səfirliyə təqdim edildi" (and the drive stage "Səfirliyə
 * göndərildi") stay locked until then. SUPER_ADMIN can override with a reason; ADMIN+ switch the gate.
 */
export const FourEyesPanel = ({ c }: { c: CaseDetail }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const sig = useMemo(() => docsSignature(c), [c]);
  const key = ['four-eyes', c.id];
  const q = useQuery({ queryKey: [...key, sig], queryFn: async () => (await api.get<{ fourEyes: FourEyes }>(`/admin/cases/${c.id}/four-eyes`)).data.fourEyes });
  const staff = useQuery({ queryKey: ['staff-list'], queryFn: async () => (await api.get<{ staff: StaffMember[] }>('/admin/users/staff')).data.staff, staleTime: 300_000 });
  const [reviewerId, setReviewerId] = useState('');
  const [note, setNote] = useState('');
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [comment, setComment] = useState('');
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [reason, setReason] = useState('');
  const done = (data: FourEyes) => {
    qc.setQueryData([...key, sig], data);
    void qc.invalidateQueries({ queryKey: key });
    void qc.invalidateQueries({ queryKey: ['my-work'] });
  };
  const request = useMutation({
    mutationFn: async () => (await api.post<{ fourEyes: FourEyes }>(`/admin/cases/${c.id}/four-eyes/request`, { reviewerId: reviewerId || null, note: note.trim() || null })).data.fourEyes,
    onSuccess: (d) => (done(d), setNote(''), toast.success(t('postArrival.fourEyes.requested'))),
    onError: (e) => toastError(e),
  });
  const review = useMutation({
    mutationFn: async (decision: 'APPROVE' | 'REJECT') =>
      (
        await api.post<{ fourEyes: FourEyes }>(`/admin/four-eyes/${q.data!.latest!.id}/review`, {
          decision,
          comment: comment.trim() || null,
          checklist: (q.data?.checklistKeys ?? []).map((k) => ({ key: k, ok: !!checks[k] })),
        })
      ).data.fourEyes,
    onSuccess: (d, decision) => (done(d), setComment(''), setChecks({}), toast.success(t(decision === 'APPROVE' ? 'postArrival.fourEyes.approved' : 'postArrival.fourEyes.rejected'))),
    onError: (e) => toastError(e),
  });
  const override = useMutation({
    mutationFn: async () => (await api.post<{ fourEyes: FourEyes }>(`/admin/cases/${c.id}/four-eyes/override`, { reason: reason.trim() })).data.fourEyes,
    onSuccess: (d) => (done(d), setOverrideOpen(false), setReason(''), toast.success(t('postArrival.fourEyes.overridden'))),
    onError: (e) => toastError(e),
  });
  const toggle = useMutation({
    mutationFn: async (enabled: boolean) => api.put('/admin/four-eyes/settings', { enabled }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: key }),
    onError: (e) => toastError(e),
  });

  const d = q.data;
  if (!d) return null;
  const latest = d.latest;
  const pending = latest?.status === 'PENDING';
  const allTicked = d.checklistKeys.every((k) => checks[k]);
  const isAdmin = hasMinRole(user?.role, 'ADMIN');

  return (
    <Panel
      id="case-four-eyes"
      title={
        <>
          {t('postArrival.fourEyes.title')}
          {d.enabled && <span className={clsx('badge', TONE_CLASS[STATE_TONE[d.state]])}>{t(`postArrival.fourEyes.states.${d.state}`)}</span>}
        </>
      }
      icon={ScanEye}
      bodyClassName="p-4 sm:p-5 space-y-4"
      actions={isAdmin && <Switch checked={d.enabled} onChange={(v) => toggle.mutate(v)} label={t('postArrival.fourEyes.enabled')} disabled={toggle.isPending} />}
    >
      <p className="text-xs text-muted">{t('postArrival.fourEyes.subtitle')}</p>
      {!d.enabled ? (
        <p className="rounded-lg bg-surface px-3 py-2 text-xs text-muted">{t('postArrival.fourEyes.off')}</p>
      ) : (
        <p className={clsx('flex items-start gap-2 rounded-lg px-3 py-2 text-xs', d.cleared ? TONE_CLASS.success : TONE_CLASS.warning)}>
          {d.cleared ? <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" aria-hidden /> : <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />}
          {d.cleared ? t('postArrival.fourEyes.gateOk') : t('postArrival.fourEyes.gateBlocked')}
        </p>
      )}

      {latest && (
        <div className="rounded-lg border border-line px-3 py-2.5 text-sm">
          <p className="text-xs text-muted">{t('postArrival.fourEyes.requestedBy', { name: latest.requestedBy.name, date: fmtDateTime(latest.requestedAt) })}</p>
          {latest.reviewer && (
            <p className="mt-0.5 text-xs text-muted">
              {t('postArrival.fourEyes.reviewer')}: {latest.reviewedAt ? t('postArrival.fourEyes.reviewedBy', { name: latest.reviewer.name, date: fmtDateTime(latest.reviewedAt) }) : latest.reviewer.name}
            </p>
          )}
          {latest.comment && <p className="mt-1 break-words whitespace-pre-line">“{latest.comment}”</p>}
          {pending && <p className="mt-1 text-xs font-semibold text-brand-700">{d.canReview ? t('postArrival.fourEyes.waitingYou') : t('postArrival.fourEyes.waitingOther')}</p>}
          {d.current.changedSinceRequest && <p className="mt-1 text-xs text-amber-700">{t('postArrival.fourEyes.changed')}</p>}
        </div>
      )}

      {/* Review form: a different staff member than the requester. */}
      {d.enabled && d.canReview && (
        <form
          className="space-y-3 rounded-lg bg-surface p-3"
          onSubmit={(e) => {
            e.preventDefault();
            review.mutate('APPROVE');
          }}
        >
          <fieldset>
            <legend className="mb-1.5 text-xs font-semibold text-muted">{t('postArrival.fourEyes.checklistTitle')}</legend>
            <ul className="space-y-1.5">
              {d.checklistKeys.map((k) => (
                <li key={k}>
                  <label className="flex min-h-9 items-center gap-2 text-sm">
                    <input type="checkbox" className="size-4" checked={!!checks[k]} onChange={(e) => setChecks((s) => ({ ...s, [k]: e.target.checked }))} />
                    {t(`postArrival.fourEyes.checklist.${k}`)}
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
          <label className="block">
            <span className="label">{t('postArrival.fourEyes.comment')}</span>
            <textarea className="input" rows={2} maxLength={2000} value={comment} onChange={(e) => setComment(e.target.value)} />
            <span className="mt-1 block text-[11px] text-muted">{t('postArrival.fourEyes.commentHint')}</span>
          </label>
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className="btn-secondary btn-sm text-red-700" disabled={review.isPending || !comment.trim()} onClick={() => review.mutate('REJECT')}>
              <XCircle className="size-3.5" aria-hidden /> {t('postArrival.fourEyes.reject')}
            </button>
            <button type="submit" className="btn-primary btn-sm" disabled={review.isPending || !allTicked}>
              <CheckCircle2 className="size-3.5" aria-hidden /> {t('postArrival.fourEyes.approve')}
            </button>
          </div>
        </form>
      )}

      {/* Request form: whenever the gate is not cleared and no up-to-date request is open. */}
      {d.enabled && !d.cleared && !(pending && !d.current.changedSinceRequest) && (
        <div className="space-y-2">
          {!d.current.packageBuilt ? (
            <p className="text-xs text-muted">{t('postArrival.fourEyes.packageMissing')}</p>
          ) : (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <label className="block min-w-0 flex-1">
                <span className="label">{t('postArrival.fourEyes.reviewer')}</span>
                <select className="input" value={reviewerId} onChange={(e) => setReviewerId(e.target.value)}>
                  <option value="">{t('postArrival.fourEyes.anyReviewer')}</option>
                  {(staff.data ?? [])
                    .filter((s) => s.id !== user?.id)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.firstName} {s.lastName}
                      </option>
                    ))}
                </select>
              </label>
              <label className="block min-w-0 flex-1">
                <span className="label">{t('postArrival.fourEyes.note')}</span>
                <input className="input" maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
              </label>
              <button type="button" className="btn-primary btn-sm shrink-0" disabled={request.isPending} onClick={() => request.mutate()}>
                <ScanEye className="size-3.5" aria-hidden /> {pending ? t('postArrival.fourEyes.rerequest') : t('postArrival.fourEyes.request')}
              </button>
            </div>
          )}
        </div>
      )}

      {d.enabled && d.canOverride && !d.cleared && (
        <button type="button" className="inline-flex min-h-9 items-center gap-1.5 text-xs font-semibold text-red-700 hover:underline" onClick={() => setOverrideOpen(true)}>
          <ShieldAlert className="size-3.5" aria-hidden /> {t('postArrival.fourEyes.override')}
        </button>
      )}

      {d.history.length > 1 && (
        <details className="text-xs">
          <summary className="cursor-pointer font-semibold text-muted">{t('postArrival.fourEyes.history')}</summary>
          <ul className="mt-2 space-y-1.5">
            {d.history.slice(1).map((h) => (
              <li key={h.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className={clsx('badge', TONE_CLASS[STATE_TONE[h.status]])}>{t(`postArrival.fourEyes.states.${h.status}`)}</span>
                <span className="text-muted">{t('postArrival.fourEyes.requestedBy', { name: h.requestedBy.name, date: fmtDateTime(h.requestedAt) })}</span>
                {h.reviewer && h.reviewedAt && <span className="text-muted">→ {t('postArrival.fourEyes.reviewedBy', { name: h.reviewer.name, date: fmtDateTime(h.reviewedAt) })}</span>}
                {h.comment && <span className="w-full break-words text-ink/80">“{h.comment}”</span>}
              </li>
            ))}
          </ul>
        </details>
      )}

      <Modal open={overrideOpen} onClose={() => setOverrideOpen(false)} title={t('postArrival.fourEyes.overrideTitle')} description={t('postArrival.fourEyes.overrideHint')}>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            override.mutate();
          }}
        >
          <label className="block">
            <span className="label">{t('postArrival.fourEyes.reason')}</span>
            <textarea className="input" rows={3} minLength={5} maxLength={2000} required value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost btn-sm" onClick={() => setOverrideOpen(false)}>
              {t('postArrival.fourEyes.cancel')}
            </button>
            <button type="submit" className="btn-primary btn-sm" disabled={override.isPending || reason.trim().length < 5}>
              {t('postArrival.fourEyes.override')}
            </button>
          </div>
        </form>
      </Modal>
    </Panel>
  );
};

export default FourEyesPanel;
