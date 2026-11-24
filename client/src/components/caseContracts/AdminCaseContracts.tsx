import { useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, Circle, Download, ExternalLink, Eye, FilePlus2, FileSignature, FolderOpen, Info, Lock, PenLine, Undo2, Upload, X } from 'lucide-react';
import { api, fileUrl } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { registerCopy } from '@/i18n';
import { pagesCaseContracts } from '@/i18n/pagesCaseContracts';
import type { CaseDetail } from '@/lib/types';
import { Panel } from '@/components/admin/ui';
import { Modal } from '@/components/admin/Modal';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { Spinner } from '@/components/ui/Spinner';
import { fmtDateTime } from '@/components/admin/labels';
import { useCaseRefresh } from '@/components/admin/case/shared';
import { SignaturePad, type SignaturePadHandle } from '@/components/portal/SignaturePad';
import { ccError, staffKey, type StaffDoc, type StaffOverview, type StaffStep, type Step, type StepState } from './api';
import { UploadDialog } from './UploadDialog'; // V2: staff's own PDF + signature places

registerCopy(pagesCaseContracts);

export const STATE_TONE: Record<StepState, string> = {
  NOT_SENT: 'bg-sunken text-muted',
  TRIAD_TO_SIGN: 'bg-warning-bg text-warning-fg',
  CLIENT_TO_SIGN: 'bg-primary/10 text-link',
  SIGNED: 'bg-warning-bg text-warning-fg',
  APPROVED: 'bg-success-bg text-success-fg',
  DECLINED: 'bg-danger-bg text-danger-fg',
  EXPIRED: 'bg-danger-bg text-danger-fg',
  CANCELLED: 'bg-sunken text-muted',
  RETURNED: 'bg-danger-bg text-danger-fg',
};

const TimelineRow = ({ done, label, detail }: { done: boolean; label: string; detail?: string | null }) => (
  <li className="flex items-start gap-2 text-xs">
    {done ? <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden /> : <Circle className="mt-0.5 size-3.5 shrink-0 text-muted" aria-hidden />}
    <span className={clsx(done ? 'text-ink' : 'text-muted')}>
      {label}
      {detail && <span className="text-muted"> · {detail}</span>}
    </span>
  </li>
);

const Hint = ({ tone, children }: { tone: 'info' | 'warning'; children: ReactNode }) => (
  <p className={clsx('flex items-start gap-2 rounded-lg px-3 py-2 text-xs', tone === 'info' ? 'bg-primary/[0.06] text-link' : 'bg-warning-bg text-warning-fg')}>
    {tone === 'info' ? <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden /> : <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />}
    <span>{children}</span>
  </p>
);

/** One document of the V2 İş müqaviləsi set: state, open / signed PDF, return / replace / drop. */
const DocRow = ({ d, onReturn, onReplace, onDrop }: { d: StaffDoc; onReturn: () => void; onReplace: () => void; onDrop: () => void }) => {
  const { t } = useTranslation();
  const canReturn = !d.returnedAt && (d.status === 'SENT' || (d.status === 'COMPLETED' && !d.approvedAt));
  return (
    <li className="flex flex-wrap items-center gap-2 py-2 text-xs">
      <span className="min-w-0 flex-1 truncate font-semibold text-ink" title={d.originalName}>
        {d.originalName}
      </span>
      <span className={clsx('badge', STATE_TONE[d.state])}>{t(`caseContracts.states.${d.state}`)}</span>
      {d.returnReason && <span className="basis-full text-danger-fg">{t('caseContracts.v2.returnedReason', { reason: d.returnReason })}</span>}
      <span className="flex basis-full flex-wrap gap-1">
        <a href={d.finalDocumentId ? fileUrl(d.finalDocumentId) : `/api/admin/signatures/${d.id}/document?version=current`} target="_blank" rel="noreferrer" className="btn-ghost btn-sm">
          <ExternalLink className="size-3.5" aria-hidden /> {d.finalDocumentId ? t('caseContracts.openSigned') : t('caseContracts.v2.open')}
        </a>
        {canReturn && (
          <button type="button" className="btn-ghost btn-sm text-danger-fg" onClick={onReturn}>
            <Undo2 className="size-3.5" aria-hidden /> {t('caseContracts.v2.return')}
          </button>
        )}
        {d.returnedAt && (
          <>
            <button type="button" className="btn-secondary btn-sm" onClick={onReplace}>
              <Upload className="size-3.5" aria-hidden /> {t('caseContracts.v2.replace')}
            </button>
            <button type="button" className="btn-ghost btn-sm" onClick={onDrop}>
              <X className="size-3.5" aria-hidden /> {t('caseContracts.v2.drop')}
            </button>
          </>
        )}
      </span>
    </li>
  );
};

interface StepActions {
  onUpload: () => void;
  onSign: () => void;
  onApprove: () => void;
  onReturn: (doc?: StaffDoc) => void;
  onReplace: (doc: StaffDoc) => void;
  onDrop: (doc: StaffDoc) => void;
}

const StepCard = ({ s, onUpload, onSign, onApprove, onReturn, onReplace, onDrop }: { s: StaffStep } & StepActions) => {
  const { t } = useTranslation();
  const r = s.request;
  const v2 = s.flow === 'V2';
  const workSet = s.step === 'WORK' && v2;
  const name = t(`caseContracts.steps.${s.step}.name`);
  const blocked = s.blockedReason && s.state !== 'APPROVED' ? s.blockedReason : null;
  // An Əmək müqaviləsi approved outside the contract step (early / before a reopen): the server allows a new version.
  const resendApproved = s.state === 'APPROVED' && !s.blockedReason;
  return (
    <article className={clsx('flex flex-col gap-3 rounded-xl border p-4', blocked === 'LABOUR_NOT_APPROVED' ? 'border-dashed border-line bg-surface/40' : 'border-line bg-card')} aria-label={name}>
      <header className="flex flex-wrap items-start gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-sm font-bold text-primary-contrast" aria-hidden>
          {t(`caseContracts.steps.${s.step}.number`)}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-sans text-base font-semibold text-ink">{name}</h3>
          <p className="text-xs text-muted">{t(`caseContracts.steps.${s.step}.what`)}</p>
        </div>
        <span className={clsx('badge', STATE_TONE[s.state])}>{t(`caseContracts.states.${s.state}`)}</span>
      </header>

      <p className="text-[11px] text-muted">{s.step === 'LABOUR' ? (r && !v2 ? t('caseContracts.v2.oldFlow') : t('caseContracts.v2.labourInfo')) : t('caseContracts.v2.workInfo')}</p>

      {r && !workSet && (
        <ol className="space-y-1" aria-label={t('caseContracts.title')}>
          <TimelineRow done={!!r.sentAt} label={t('caseContracts.timeline.sent')} detail={r.sentAt ? fmtDateTime(r.sentAt) : null} />
          {/* V2: the client signs first, then Triad Vision (old flow: the other way round). */}
          {(v2 ? (['client', 'triad'] as const) : (['triad', 'client'] as const)).map((k) => {
            const sg = r[k];
            return <TimelineRow key={k} done={!!sg?.signedAt} label={t(`caseContracts.timeline.${k}`)} detail={sg ? [sg.name, sg.signedAt ? fmtDateTime(sg.signedAt) : null].filter(Boolean).join(' · ') : null} />;
          })}
          <TimelineRow done={!!r.approvedAt} label={t('caseContracts.timeline.approved')} detail={r.approvedAt ? [r.approvedBy, fmtDateTime(r.approvedAt)].filter(Boolean).join(' · ') : null} />
        </ol>
      )}
      {r?.returnReason && !workSet && <Hint tone="warning">{t('caseContracts.v2.returnedReason', { reason: r.returnReason })}</Hint>}
      {workSet && s.documents.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted">{t('caseContracts.v2.documents', { count: s.documents.length })}</p>
          <ul className="divide-y divide-line">
            {s.documents.map((d) => (
              <DocRow key={d.id} d={d} onReturn={() => onReturn(d)} onReplace={() => onReplace(d)} onDrop={() => onDrop(d)} />
            ))}
          </ul>
        </div>
      )}
      {r && r.others.length > 0 && <p className="text-[11px] text-muted">{t('caseContracts.otherParties', { names: r.others.map((o) => o.name).join(', ') })}</p>}

      {blocked && <Hint tone="info">{t(`caseContracts.blocked.${blocked}`)}</Hint>}
      {resendApproved && <Hint tone="warning">{t('caseContracts.approvedOutsideStep')}</Hint>}
      {s.state === 'TRIAD_TO_SIGN' && !s.canTriadSign && r?.triad && <Hint tone="warning">{t('caseContracts.triadWaitOther', { name: r.triad.name })}</Hint>}

      <div className="mt-auto flex flex-wrap items-center gap-2">
        {s.canTriadSign && (
          <button type="button" className="btn-primary btn-sm" onClick={onSign}>
            <PenLine className="size-3.5" aria-hidden /> {v2 ? t('caseContracts.v2.agreeSign') : t('caseContracts.triadSign')}
          </button>
        )}
        {s.canReturn && s.step === 'LABOUR' && (
          <button type="button" className="btn-ghost btn-sm text-danger-fg" onClick={() => onReturn()}>
            <Undo2 className="size-3.5" aria-hidden /> {t('caseContracts.v2.return')}
          </button>
        )}
        {s.canApprove && (
          <button type="button" className="btn-primary btn-sm" onClick={onApprove}>
            <CheckCircle2 className="size-3.5" aria-hidden /> {t('caseContracts.approve')}
          </button>
        )}
        {(s.state !== 'APPROVED' || resendApproved) && !(workSet && s.documents.length >= 10) && (
          <button type="button" className={s.state === 'NOT_SENT' ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'} disabled={!!blocked} onClick={onUpload}>
            {workSet ? <FilePlus2 className="size-3.5" aria-hidden /> : <Upload className="size-3.5" aria-hidden />}{' '}
            {s.state === 'NOT_SENT' ? t('caseContracts.v2.upload') : workSet ? t('caseContracts.v2.uploadMore') : t('caseContracts.resend')}
          </button>
        )}
        {r && !workSet && (
          <a href={`/api/admin/signatures/${r.id}/document?version=original`} target="_blank" rel="noreferrer" className="btn-ghost btn-sm">
            <Eye className="size-3.5" aria-hidden /> {t('caseContracts.v2.openSent')}
          </a>
        )}
        {/* V2: the client signed, Triad Vision not yet — the PDF with the client's signature in its place. */}
        {r && !workSet && v2 && r.status === 'SENT' && r.client?.status === 'SIGNED' && (
          <a href={`/api/admin/signatures/${r.id}/document?version=current`} target="_blank" rel="noreferrer" className="btn-secondary btn-sm">
            <Eye className="size-3.5" aria-hidden /> {t('caseContracts.v2.openClientSigned')}
          </a>
        )}
        {r?.finalDocumentId && !workSet && (
          <a href={fileUrl(r.finalDocumentId)} target="_blank" rel="noreferrer" className="btn-ghost btn-sm">
            <Download className="size-3.5" aria-hidden /> {t('caseContracts.openSigned')}
          </a>
        )}
        {r?.driveFolderNodeId && (
          <Link to={`/workspace/drive/f/${encodeURIComponent(r.driveFolderNodeId)}`} className="btn-ghost btn-sm">
            <FolderOpen className="size-3.5" aria-hidden /> {t('caseContracts.openDrive')}
          </Link>
        )}
        {r && !workSet && (
          <Link to={`/admin/signatures?open=${r.id}`} className="btn-ghost btn-sm">
            <ExternalLink className="size-3.5" aria-hidden /> {t('caseContracts.openRequest')}
          </Link>
        )}
      </div>
      <p className="flex items-start gap-1.5 text-[11px] text-muted">
        <Info className="mt-0.5 size-3 shrink-0" aria-hidden />
        {t('caseContracts.driveNote', { folder: s.driveFolder })}
      </p>
    </article>
  );
};

/** Triad Vision signs first (drawn or typed signature). */
export const SignDialog = ({ caseId, s, onClose, onDone }: { caseId: string; s: StaffStep; onClose: () => void; onDone: () => void }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const padRef = useRef<SignaturePadHandle>(null);
  const [mode, setMode] = useState<'DRAW' | 'TYPE'>('DRAW');
  const [padEmpty, setPadEmpty] = useState(true);
  const [typed, setTyped] = useState(user ? `${user.firstName} ${user.lastName}`.trim() : '');
  const [agree, setAgree] = useState(false);
  const sign = useMutation({
    mutationFn: async () => {
      const body = mode === 'DRAW' ? { step: s.step, mode, signature: padRef.current?.toDataURL() ?? '', agree: true } : { step: s.step, mode, typedName: typed.trim(), agree: true };
      return (await api.post(`/admin/case-contracts/cases/${caseId}/triad-sign`, body)).data;
    },
    onSuccess: () => {
      toast.success(t('caseContracts.signDialog.done'));
      onDone();
    },
    onError: (err) => toast.error(ccError(t, err)),
  });
  const ready = agree && (mode === 'DRAW' ? !padEmpty : typed.trim().length >= 2);
  const name = t(`caseContracts.steps.${s.step}.name`);
  return (
    <Modal
      open
      onClose={() => !sign.isPending && onClose()}
      title={t('caseContracts.signDialog.title', { name })}
      footer={
        <>
          <button type="button" className="btn-secondary btn-sm" onClick={onClose} disabled={sign.isPending}>
            {t('caseContracts.cancel')}
          </button>
          <button type="button" className="btn-primary btn-sm" disabled={!ready || sign.isPending} onClick={() => sign.mutate()}>
            {sign.isPending && <Spinner className="size-3.5" />}
            {t('caseContracts.signDialog.sign')}
          </button>
        </>
      }
    >
      {s.request && (
        // "current": with the signatures given so far (V2: the client's) — Triad Vision sees them before signing.
        <a href={`/api/admin/signatures/${s.request.id}/document?version=current`} target="_blank" rel="noreferrer" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-link underline">
          <ExternalLink className="size-3.5" aria-hidden /> {s.request.client?.status === 'SIGNED' ? `${t('caseContracts.v2.openClientSigned')} · ${s.request.title}` : s.request.title}
        </a>
      )}
      <div className="mb-3 inline-flex rounded-lg border border-line p-0.5" role="group">
        {(['DRAW', 'TYPE'] as const).map((m) => (
          <button key={m} type="button" aria-pressed={mode === m} className={clsx('rounded-md px-3 py-1.5 text-sm font-semibold', mode === m ? 'bg-primary text-primary-contrast' : 'text-ink hover:bg-sunken')} onClick={() => setMode(m)}>
            {m === 'DRAW' ? t('caseContracts.signDialog.draw') : t('caseContracts.signDialog.type')}
          </button>
        ))}
      </div>
      {mode === 'DRAW' ? (
        <SignaturePad ref={padRef} onChange={setPadEmpty} label={t('caseContracts.signDialog.title', { name })} />
      ) : (
        <div>
          <label className="label" htmlFor="cc-typed">
            {t('caseContracts.signDialog.typed')}
          </label>
          <input id="cc-typed" className="input font-[cursive] text-lg" maxLength={160} value={typed} onChange={(e) => setTyped(e.target.value)} />
        </div>
      )}
      <label className="mt-4 flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-0.5" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
        <span>{t('caseContracts.signDialog.agree')}</span>
      </label>
      <p className="mt-2 text-[11px] text-muted">{t('caseContracts.signDialog.legal')}</p>
    </Modal>
  );
};

/** V2: send a document back with a reason (the client sees it). */
export const ReturnDialog = ({ caseId, step, doc, onClose, onDone }: { caseId: string; step: Step; doc: StaffDoc | null; onClose: () => void; onDone: () => void }) => {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  const send = useMutation({
    mutationFn: async () => (await api.post(`/admin/case-contracts/cases/${caseId}/return`, { step, requestId: doc?.id ?? null, reason: reason.trim() })).data,
    onSuccess: () => {
      toast.success(t('caseContracts.v2.returnDialog.done'));
      onDone();
    },
    onError: (err) => toast.error(ccError(t, err)),
  });
  const name = doc ? doc.originalName : t(`caseContracts.steps.${step}.name`);
  return (
    <Modal
      open
      onClose={() => !send.isPending && onClose()}
      title={t('caseContracts.v2.returnDialog.title', { name })}
      footer={
        <>
          <button type="button" className="btn-secondary btn-sm" onClick={onClose} disabled={send.isPending}>
            {t('caseContracts.cancel')}
          </button>
          <button type="button" className="btn-danger btn-sm" disabled={reason.trim().length < 3 || send.isPending} onClick={() => send.mutate()}>
            {send.isPending && <Spinner className="size-3.5" />} {t('caseContracts.v2.return')}
          </button>
        </>
      }
    >
      <label htmlFor="cc-return-reason" className="label">
        {t('caseContracts.v2.returnDialog.reason')}
      </label>
      <textarea id="cc-return-reason" className="input" rows={3} maxLength={2000} value={reason} onChange={(e) => setReason(e.target.value)} />
    </Modal>
  );
};

/** Staff approval of a signed contract step (confirm dialog + endpoint); shared by the case page and the quick drawer. */
export const ApproveDialog = ({ caseId, s, onClose, onDone }: { caseId: string; s: StaffStep | undefined; onClose: () => void; onDone: () => void | Promise<void> }) => {
  const { t } = useTranslation();
  const approve = useMutation({
    mutationFn: async (step: Step) => (await api.post<StaffOverview>(`/admin/case-contracts/cases/${caseId}/approve`, { step })).data,
    onSuccess: async () => {
      toast.success(t('caseContracts.approveDialog.done'));
      onClose();
      await onDone();
    },
    onError: (err) => toast.error(ccError(t, err)),
  });
  return (
    <ConfirmDialog
      open={!!s}
      onClose={onClose}
      onConfirm={() => s && approve.mutate(s.step)}
      tone="primary"
      loading={approve.isPending}
      title={s ? t('caseContracts.approveDialog.title', { name: t(`caseContracts.steps.${s.step}.name`) }) : ''}
      confirmLabel={t('caseContracts.approve')}
      message={
        <>
          {t('caseContracts.approveDialog.text')}
          {s?.step === 'LABOUR' && <span className="mt-2 block">{t('caseContracts.approveDialog.labourNext')}</span>}
          {s?.step === 'WORK' && s.flow === 'V2' && <span className="mt-2 block">{t('caseContracts.v2.approveWork')}</span>}
        </>
      }
    />
  );
};

/**
 * "Müqavilələr" on the case's documents tab: 1) Əmək müqaviləsi, 2) İş müqaviləsi (locked until 1 is approved).
 * Triad Vision signs first, then the client, then staff approve; the employer is not part of either contract.
 * `legacy`: the old single-contract box, shown only for a case contract that was not sent through this flow.
 */
export const CaseContractsPanel = ({ c, legacy }: { c: CaseDetail; legacy?: ReactNode }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const refreshCase = useCaseRefresh(c.id);
  const q = useQuery({ queryKey: staffKey(c.id), queryFn: async () => (await api.get<StaffOverview>(`/admin/case-contracts/cases/${c.id}`)).data });
  const [uploading, setUploading] = useState<{ step: Step; replacesId?: string } | null>(null);
  const [returning, setReturning] = useState<{ step: Step; doc: StaffDoc | null } | null>(null);
  const [signing, setSigning] = useState<Step | null>(null);
  const [approving, setApproving] = useState<Step | null>(null);
  const refresh = async () => {
    await Promise.all([qc.invalidateQueries({ queryKey: staffKey(c.id) }), qc.invalidateQueries({ queryKey: ['esign'] }), refreshCase()]);
  };
  const drop = useMutation({
    mutationFn: async (requestId: string) => (await api.post<StaffOverview>(`/admin/case-contracts/cases/${c.id}/drop`, { requestId })).data,
    onSuccess: refresh,
    onError: (err) => toast.error(ccError(t, err)),
  });

  const data = q.data;
  const stepOf = (k: Step | null) => (k && data ? data.steps.find((x) => x.step === k) : undefined);
  const flowIds = new Set((data?.steps ?? []).map((x) => x.request?.id).filter(Boolean));
  const showLegacy = !!c.contract && !(c.contract.signatureRequestId && flowIds.has(c.contract.signatureRequestId));
  const signStep = stepOf(signing);
  const approveStep = stepOf(approving);

  return (
    <Panel title={t('caseContracts.title')} icon={FileSignature}>
      <p className="mb-4 text-sm text-ink/80">{t('caseContracts.intro')}</p>
      {q.isLoading ? (
        <div className="grid min-h-32 place-items-center text-link">
          <Spinner className="size-5" />
        </div>
      ) : q.error || !data ? (
        <p className="text-sm text-danger-fg">{ccError(t, q.error)}</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {data.steps.map((s) => (
            <StepCard
              key={s.step}
              s={s}
              onUpload={() => setUploading({ step: s.step })}
              onSign={() => setSigning(s.step)}
              onApprove={() => setApproving(s.step)}
              onReturn={(doc) => setReturning({ step: s.step, doc: doc ?? null })}
              onReplace={(doc) => setUploading({ step: s.step, replacesId: doc.id })}
              onDrop={(doc) => drop.mutate(doc.id)}
            />
          ))}
        </div>
      )}
      {showLegacy && legacy && (
        <details className="mt-4 rounded-lg border border-line p-3">
          <summary className="cursor-pointer text-sm font-semibold text-ink">{t('caseContracts.legacyTitle')}</summary>
          <div className="mt-3">{legacy}</div>
        </details>
      )}
      {uploading && (
        <UploadDialog
          caseId={c.id}
          step={uploading.step}
          replacesId={uploading.replacesId}
          onClose={() => setUploading(null)}
          onDone={async () => {
            setUploading(null);
            await refresh();
          }}
        />
      )}
      {returning && (
        <ReturnDialog
          caseId={c.id}
          step={returning.step}
          doc={returning.doc}
          onClose={() => setReturning(null)}
          onDone={async () => {
            setReturning(null);
            await refresh();
          }}
        />
      )}
      {signStep && (
        <SignDialog
          caseId={c.id}
          s={signStep}
          onClose={() => setSigning(null)}
          onDone={async () => {
            setSigning(null);
            await refresh();
          }}
        />
      )}
      <ApproveDialog caseId={c.id} s={approveStep} onClose={() => setApproving(null)} onDone={refresh} />
    </Panel>
  );
};

export default CaseContractsPanel;
