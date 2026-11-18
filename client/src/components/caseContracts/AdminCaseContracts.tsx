import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, Circle, Download, ExternalLink, FileSignature, FolderOpen, Info, Lock, PenLine, Send } from 'lucide-react';
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
import { PreviewText } from '@/components/contracts/FromTemplateDialog';
import { placeholderLabelKey, usePlaceholders, type Preview } from '@/components/contracts/shared';
import { ccError, staffKey, type StaffOverview, type StaffStep, type Step, type StepState } from './api';

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

const StepCard = ({ s, onSend, onSign, onApprove }: { s: StaffStep; onSend: () => void; onSign: () => void; onApprove: () => void }) => {
  const { t } = useTranslation();
  const r = s.request;
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

      {r && (
        <ol className="space-y-1" aria-label={t('caseContracts.title')}>
          <TimelineRow done={!!r.sentAt} label={t('caseContracts.timeline.sent')} detail={r.sentAt ? fmtDateTime(r.sentAt) : null} />
          <TimelineRow done={!!r.triad?.signedAt} label={t('caseContracts.timeline.triad')} detail={r.triad ? [r.triad.name, r.triad.signedAt ? fmtDateTime(r.triad.signedAt) : null].filter(Boolean).join(' · ') : null} />
          <TimelineRow done={!!r.client?.signedAt} label={t('caseContracts.timeline.client')} detail={r.client ? [r.client.name, r.client.signedAt ? fmtDateTime(r.client.signedAt) : null].filter(Boolean).join(' · ') : null} />
          <TimelineRow done={!!r.approvedAt} label={t('caseContracts.timeline.approved')} detail={r.approvedAt ? [r.approvedBy, fmtDateTime(r.approvedAt)].filter(Boolean).join(' · ') : null} />
        </ol>
      )}
      {r && r.others.length > 0 && <p className="text-[11px] text-muted">{t('caseContracts.otherParties', { names: r.others.map((o) => o.name).join(', ') })}</p>}

      {blocked && <Hint tone="info">{t(`caseContracts.blocked.${blocked}`)}</Hint>}
      {resendApproved && <Hint tone="warning">{t('caseContracts.approvedOutsideStep')}</Hint>}
      {s.state === 'TRIAD_TO_SIGN' && !s.canTriadSign && r?.triad && <Hint tone="warning">{t('caseContracts.triadWaitOther', { name: r.triad.name })}</Hint>}

      <div className="mt-auto flex flex-wrap items-center gap-2">
        {s.canTriadSign && (
          <button type="button" className="btn-primary btn-sm" onClick={onSign}>
            <PenLine className="size-3.5" aria-hidden /> {t('caseContracts.triadSign')}
          </button>
        )}
        {s.canApprove && (
          <button type="button" className="btn-primary btn-sm" onClick={onApprove}>
            <CheckCircle2 className="size-3.5" aria-hidden /> {t('caseContracts.approve')}
          </button>
        )}
        {(s.state !== 'APPROVED' || resendApproved) && (
          <button type="button" className={s.state === 'NOT_SENT' ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'} disabled={!!blocked} onClick={onSend}>
            <Send className="size-3.5" aria-hidden /> {s.state === 'NOT_SENT' ? t('caseContracts.send') : t('caseContracts.resend')}
          </button>
        )}
        {r?.finalDocumentId && (
          <a href={fileUrl(r.finalDocumentId)} target="_blank" rel="noreferrer" className="btn-ghost btn-sm">
            <Download className="size-3.5" aria-hidden /> {t('caseContracts.openSigned')}
          </a>
        )}
        {r?.driveFolderNodeId && (
          <Link to={`/workspace/drive/f/${encodeURIComponent(r.driveFolderNodeId)}`} className="btn-ghost btn-sm">
            <FolderOpen className="size-3.5" aria-hidden /> {t('caseContracts.openDrive')}
          </Link>
        )}
        {r && (
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

/** Send dialog: template of the step, input fields found in the preview, live preview, optional note. */
const SendDialog = ({ c, s, data, onClose, onSent }: { c: CaseDetail; s: StaffStep; data: StaffOverview; onClose: () => void; onSent: () => void }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data: defs } = usePlaceholders();
  const [templateId, setTemplateId] = useState(() => (s.templates.find((x) => x.isDefault) ?? s.templates[0])?.id ?? '');
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const clean = useMemo(() => Object.fromEntries(Object.entries(inputs).filter(([, v]) => v.trim())), [inputs]);
  const preview = useQuery({
    queryKey: ['case-contracts', 'preview', templateId, c.id, clean],
    queryFn: async () => (await api.post<Preview>(`/admin/contract-templates/${templateId}/preview`, { caseId: c.id, inputs: clean })).data,
    enabled: !!templateId,
    placeholderData: (prev) => prev,
  });
  const used = new Set((preview.data?.segments ?? []).flatMap((x) => ('key' in x ? [x.key] : [])));
  const inputDefs = (defs ?? []).filter((d) => d.input && (used.has(d.key) || inputs[d.key]));
  const send = useMutation({
    mutationFn: async () => (await api.post<{ caseContract: boolean }>(`/admin/case-contracts/cases/${c.id}/send`, { step: s.step, templateId, inputs: clean, message: message.trim() || null })).data,
    onSuccess: (res) => {
      toast.success(res.caseContract ? t('caseContracts.sendDialog.sentCaseContract') : t('caseContracts.sendDialog.sent'));
      onSent();
    },
    onError: (err) => toast.error(ccError(t, err)),
  });
  const name = t(`caseContracts.steps.${s.step}.name`);
  const triad = data.triadSignatory ? (data.triadSignatory.id === user?.id ? t('caseContracts.sendDialog.you') : data.triadSignatory.name) : t('caseContracts.sendDialog.you');
  const missing = preview.data?.missing ?? [];

  return (
    <Modal
      open
      onClose={() => !send.isPending && onClose()}
      size="lg"
      title={t('caseContracts.sendDialog.title', { name })}
      description={t(`caseContracts.steps.${s.step}.what`)}
      footer={
        <>
          <button type="button" className="btn-secondary btn-sm" onClick={onClose} disabled={send.isPending}>
            {t('caseContracts.cancel')}
          </button>
          <button type="button" className="btn-primary btn-sm" disabled={!templateId || send.isPending} onClick={() => send.mutate()}>
            {send.isPending ? <Spinner className="size-3.5" /> : <Send className="size-3.5" aria-hidden />} {t('caseContracts.send')}
          </button>
        </>
      }
    >
      {!s.templates.length ? (
        <p className="py-4 text-sm text-muted">
          {t('caseContracts.sendDialog.noTemplates')}{' '}
          <Link to="/admin/contract-templates" className="font-semibold text-link underline">
            {t('caseContracts.sendDialog.templatesLink')}
          </Link>
        </p>
      ) : (
        <div className="grid gap-4">
          <p className="flex items-start gap-2 rounded-lg bg-primary/[0.06] px-3 py-2 text-xs text-link">
            <FileSignature className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {t('caseContracts.sendDialog.order', { triad, client: `${c.client.firstName} ${c.client.lastName}`.trim() })}
          </p>
          <div>
            <label htmlFor="cc-template" className="label">
              {t('caseContracts.sendDialog.template')}
            </label>
            <select id="cc-template" className="input" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
              {s.templates.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name} · {x.language.toUpperCase()}
                </option>
              ))}
            </select>
          </div>
          {inputDefs.length > 0 && (
            <fieldset>
              <legend className="label">{t('caseContracts.sendDialog.inputs')}</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {inputDefs.map((d) => (
                  <div key={d.key}>
                    <label htmlFor={`cc-${d.key}`} className="mb-1 block text-xs text-muted">
                      {t(placeholderLabelKey(d.key))}
                    </label>
                    <input
                      id={`cc-${d.key}`}
                      className="input"
                      type={d.type === 'date' ? 'date' : d.type === 'number' ? 'number' : 'text'}
                      maxLength={500}
                      value={inputs[d.key] ?? ''}
                      onChange={(e) => setInputs((v) => ({ ...v, [d.key]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
            </fieldset>
          )}
          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="label mb-0">{t('caseContracts.sendDialog.preview')}</span>
              {preview.isFetching && <Spinner className="size-3.5 text-link" />}
            </div>
            {preview.data ? <PreviewText preview={preview.data} /> : <div className="grid min-h-24 place-items-center rounded-lg border border-line text-link">{preview.error ? <span className="text-sm text-danger-fg">{ccError(t, preview.error)}</span> : <Spinner className="size-5" />}</div>}
            {preview.data && (
              <p className={clsx('mt-2 text-xs', missing.length ? 'text-warning-fg' : 'text-success-fg')}>
                {missing.length ? t('caseContracts.sendDialog.missing', { keys: missing.map((k) => t(placeholderLabelKey(k), { defaultValue: k })).join(', ') }) : t('caseContracts.sendDialog.allFilled')}
              </p>
            )}
          </div>
          <div>
            <label htmlFor="cc-message" className="label">
              {t('caseContracts.sendDialog.message')}
            </label>
            <textarea id="cc-message" className="input" rows={2} maxLength={4000} value={message} onChange={(e) => setMessage(e.target.value)} />
          </div>
        </div>
      )}
    </Modal>
  );
};

/** Triad Vision signs first (drawn or typed signature). */
const SignDialog = ({ caseId, s, onClose, onDone }: { caseId: string; s: StaffStep; onClose: () => void; onDone: () => void }) => {
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
        <a href={`/api/admin/signatures/${s.request.id}/document`} target="_blank" rel="noreferrer" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-link underline">
          <ExternalLink className="size-3.5" aria-hidden /> {s.request.title}
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
  const [sending, setSending] = useState<Step | null>(null);
  const [signing, setSigning] = useState<Step | null>(null);
  const [approving, setApproving] = useState<Step | null>(null);
  const refresh = async () => {
    await Promise.all([qc.invalidateQueries({ queryKey: staffKey(c.id) }), qc.invalidateQueries({ queryKey: ['esign'] }), refreshCase()]);
  };
  const approve = useMutation({
    mutationFn: async (step: Step) => (await api.post<StaffOverview>(`/admin/case-contracts/cases/${c.id}/approve`, { step })).data,
    onSuccess: async () => {
      toast.success(t('caseContracts.approveDialog.done'));
      setApproving(null);
      await refresh();
    },
    onError: (err) => toast.error(ccError(t, err)),
  });

  const data = q.data;
  const stepOf = (k: Step | null) => (k && data ? data.steps.find((x) => x.step === k) : undefined);
  const flowIds = new Set((data?.steps ?? []).map((x) => x.request?.id).filter(Boolean));
  const showLegacy = !!c.contract && !(c.contract.signatureRequestId && flowIds.has(c.contract.signatureRequestId));
  const sendStep = stepOf(sending);
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
            <StepCard key={s.step} s={s} onSend={() => setSending(s.step)} onSign={() => setSigning(s.step)} onApprove={() => setApproving(s.step)} />
          ))}
        </div>
      )}
      {showLegacy && legacy && (
        <details className="mt-4 rounded-lg border border-line p-3">
          <summary className="cursor-pointer text-sm font-semibold text-ink">{t('caseContracts.legacyTitle')}</summary>
          <div className="mt-3">{legacy}</div>
        </details>
      )}
      {sendStep && data && (
        <SendDialog
          c={c}
          s={sendStep}
          data={data}
          onClose={() => setSending(null)}
          onSent={async () => {
            const step = sendStep.step;
            setSending(null);
            await refresh();
            // The sender usually signs for Triad Vision right away.
            const fresh = qc.getQueryData<StaffOverview>(staffKey(c.id))?.steps.find((x) => x.step === step);
            if (fresh?.canTriadSign) setSigning(step);
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
      <ConfirmDialog
        open={!!approveStep}
        onClose={() => setApproving(null)}
        onConfirm={() => approveStep && approve.mutate(approveStep.step)}
        tone="primary"
        loading={approve.isPending}
        title={approveStep ? t('caseContracts.approveDialog.title', { name: t(`caseContracts.steps.${approveStep.step}.name`) }) : ''}
        confirmLabel={t('caseContracts.approve')}
        message={
          <>
            {t('caseContracts.approveDialog.text')}
            {approveStep?.step === 'LABOUR' && <span className="mt-2 block">{t('caseContracts.approveDialog.labourNext')}</span>}
          </>
        }
      />
    </Panel>
  );
};

export default CaseContractsPanel;
