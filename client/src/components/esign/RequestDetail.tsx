import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { BellRing, Ban, Download, ExternalLink, Link2, Send } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Drawer } from '@/components/admin/Drawer';
import { fmtDateTime, shortUserAgent } from '@/components/admin/labels';
import { Spinner } from '@/components/ui/Spinner';
import { SIGNER_TONE, STATUS_TONE, useEsignError, type StaffRequestDetail, type StaffSigner } from './api';

export const requestKey = (id: string) => ['esign', 'request', id] as const;

/** Staff detail drawer: parties with progress, audit trail, remind / new link / cancel, PDFs. */
export const RequestDetail = ({ id, onClose }: { id: string | null; onClose: () => void }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const err = useEsignError();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [resendFor, setResendFor] = useState<StaffSigner | null>(null);
  const [newEmail, setNewEmail] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: requestKey(id ?? ''),
    queryFn: async () => (await api.get<{ request: StaffRequestDetail }>(`/admin/signatures/${id}`)).data.request,
    enabled: !!id,
  });
  const r = data;

  const run = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key);
    try {
      await fn();
      toast.success(ok);
      await qc.invalidateQueries({ queryKey: ['esign'] });
      if (r?.case) void qc.invalidateQueries({ queryKey: ['admin-case', r.case.id] });
      return true;
    } catch (e) {
      err.toast(e);
      return false;
    } finally {
      setBusy(null);
    }
  };

  const docUrl = (version: 'original' | 'final', download = false) => `/api/admin/signatures/${id}/document?version=${version}${download ? '&download=1' : ''}`;
  const active = r?.status === 'SENT';

  return (
    <Drawer
      open={!!id}
      onClose={onClose}
      title={r?.title ?? t('esign.admin.title')}
      footer={
        r && (
          <>
            {r.status === 'DRAFT' && (
              <button type="button" className="btn-primary btn-sm" disabled={!!busy} onClick={() => void run('send', () => api.post(`/admin/signatures/${r.id}/send`), t('esign.admin.form.created'))}>
                {busy === 'send' ? <Spinner className="size-3.5" /> : <Send className="size-3.5" aria-hidden />}
                {t('esign.admin.detail.send')}
              </button>
            )}
            {active && (
              <button type="button" className="btn-white btn-sm border border-line" disabled={!!busy} onClick={() => void run('remind', () => api.post(`/admin/signatures/${r.id}/remind`, {}), t('esign.admin.detail.reminded'))}>
                {busy === 'remind' ? <Spinner className="size-3.5" /> : <BellRing className="size-3.5" aria-hidden />}
                {t('esign.admin.detail.remind')}
              </button>
            )}
            {(active || r.status === 'DRAFT') && (
              <button type="button" className="btn btn-sm text-danger hover:bg-red-50" disabled={!!busy} onClick={() => setCancelOpen(true)}>
                <Ban className="size-3.5" aria-hidden />
                {t('esign.admin.detail.cancel')}
              </button>
            )}
          </>
        )
      }
    >
      {isLoading || !r ? (
        <div className="grid min-h-40 place-items-center text-brand-600">
          <Spinner className="size-6" />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className={clsx('badge', STATUS_TONE[r.status])}>{t(`esign.status.${r.status}`)}</span>
            <span className="badge bg-surface text-ink/80">{t(`esign.order.${r.order}`)}</span>
            {r.isCaseContract && <span className="badge bg-navy-900 text-white">{t('esign.admin.detail.caseContract')}</span>}
          </div>

          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            {r.case && (
              <Field label={t('esign.admin.detail.case')}>
                <Link to={`/admin/cases/${r.case.id}`} className="font-semibold text-brand-600 hover:underline">
                  {r.case.number}
                </Link>
              </Field>
            )}
            {r.company && <Field label={t('esign.admin.detail.company')}>{r.company.name}</Field>}
            <Field label={t('esign.admin.detail.createdBy')}>{r.createdBy?.name ?? '—'}</Field>
            <Field label={t('esign.admin.detail.sent')}>{fmtDateTime(r.sentAt)}</Field>
            <Field label={t('esign.admin.detail.expires')}>{fmtDateTime(r.expiresAt)}</Field>
            {r.completedAt && <Field label={t('esign.admin.detail.completed')}>{fmtDateTime(r.completedAt)}</Field>}
          </dl>
          {r.message && <p className="rounded-lg border border-line bg-surface p-3 text-sm whitespace-pre-line">{r.message}</p>}
          {r.cancelReason && <p className="rounded-lg border border-line bg-surface p-3 text-sm">{r.cancelReason}</p>}

          {/* PDFs */}
          <div className="grid gap-2 sm:grid-cols-2">
            <PdfRow label={t('esign.admin.detail.original')} sub={`${r.originalName} · ${r.originalPages} p.`} view={docUrl('original')} download={docUrl('original', true)} />
            {r.hasFinal && <PdfRow label={t('esign.admin.detail.final')} sub="+2 p." view={docUrl('final')} download={docUrl('final', true)} accent />}
          </div>
          <div className="rounded-lg border border-line p-3 text-[11px] leading-relaxed text-muted">
            <p className="mb-1 font-semibold text-ink/80">{t('esign.admin.detail.hashes')}</p>
            <p className="break-all">
              Original: <span className="font-mono">{r.originalSha256}</span>
            </p>
            {r.finalSha256 && (
              <p className="break-all">
                Final: <span className="font-mono">{r.finalSha256}</span>
              </p>
            )}
          </div>

          {/* Parties */}
          <section>
            <h3 className="mb-2 text-sm font-semibold text-navy-900">{t('esign.admin.detail.signers')}</h3>
            <ol className="space-y-2">
              {r.signers.map((s) => {
                const turn = r.currentTurn.includes(s.id);
                return (
                  <li key={s.id} className={clsx('rounded-xl border p-3', turn ? 'border-brand-400 bg-brand-50' : 'border-line')}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="grid size-6 place-items-center rounded-full bg-surface text-[11px] font-bold">{s.order}</span>
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-navy-900">{s.name}</span>
                      <span className="badge bg-surface text-ink/80">{t(`esign.role.${s.role}`)}</span>
                      <span className={clsx('badge', SIGNER_TONE[s.status])}>{t(`esign.signerStatus.${s.status}`)}</span>
                    </div>
                    <p className="mt-1 truncate pl-8 text-xs text-muted">{s.email}</p>
                    <div className="mt-1 grid gap-x-4 pl-8 text-[11px] text-muted sm:grid-cols-2">
                      {s.signedAt && <span>{t('esign.signerStatus.SIGNED')}: {fmtDateTime(s.signedAt)}</span>}
                      {s.viewedAt && !s.signedAt && <span>{t('esign.signerStatus.VIEWED')}: {fmtDateTime(s.viewedAt)}</span>}
                      {s.authMethod && <span>{t(`esign.admin.detail.auth.${s.authMethod}`)}</span>}
                      {s.ip && <span>IP {s.ip}</span>}
                      {s.userAgent && <span className="truncate">{shortUserAgent(s.userAgent)}</span>}
                    </div>
                    {s.declinedReason && (
                      <p className="mt-2 ml-8 rounded-lg bg-red-50 p-2 text-xs text-red-800">
                        {t('esign.admin.detail.declinedReason')}: {s.declinedReason}
                      </p>
                    )}
                    {turn && (
                      <div className="mt-2 flex flex-wrap gap-2 pl-8">
                        <button type="button" className="btn-white btn-sm border border-line" disabled={!!busy} onClick={() => void run(`remind-${s.id}`, () => api.post(`/admin/signatures/${r.id}/remind`, { signerId: s.id }), t('esign.admin.detail.reminded'))}>
                          <BellRing className="size-3.5" aria-hidden />
                          {t('esign.admin.detail.remind')}
                        </button>
                        <button
                          type="button"
                          className="btn-white btn-sm border border-line"
                          disabled={!!busy}
                          onClick={() => {
                            setResendFor(s);
                            setNewEmail('');
                          }}
                        >
                          <Link2 className="size-3.5" aria-hidden />
                          {t('esign.admin.detail.resend')}
                        </button>
                        {s.userId === user?.id && (
                          <Link to={`/admin/signatures/sign/${s.id}`} className="btn-primary btn-sm">
                            {t('esign.admin.detail.signNow')}
                          </Link>
                        )}
                      </div>
                    )}
                    {resendFor?.id === s.id && (
                      <form
                        className="mt-2 space-y-2 pl-8"
                        onSubmit={(e) => {
                          e.preventDefault();
                          void run(`resend-${s.id}`, () => api.post(`/admin/signatures/${r.id}/signers/${s.id}/resend`, newEmail.trim() ? { email: newEmail.trim() } : {}), t('esign.admin.detail.resent')).then((ok) => ok && setResendFor(null));
                        }}
                      >
                        <p className="text-[11px] text-muted">{t('esign.admin.detail.resendHint')}</p>
                        {!s.userId && (
                          <input className="input py-2 text-sm" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder={t('esign.admin.detail.newEmail')} aria-label={t('esign.admin.detail.newEmail')} />
                        )}
                        <div className="flex gap-2">
                          <button type="submit" className="btn-primary btn-sm" disabled={!!busy}>
                            {t('esign.admin.detail.send')}
                          </button>
                          <button type="button" className="btn-white btn-sm border border-line" onClick={() => setResendFor(null)}>
                            {t('esign.sign.cancel')}
                          </button>
                        </div>
                      </form>
                    )}
                  </li>
                );
              })}
            </ol>
          </section>

          {cancelOpen && (
            <section className="space-y-2 rounded-xl border border-red-200 bg-red-50 p-3">
              <label className="label" htmlFor="esign-cancel-reason">
                {t('esign.admin.detail.cancelReason')}
              </label>
              <input id="esign-cancel-reason" className="input" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} maxLength={1000} />
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn-danger btn-sm"
                  disabled={!!busy}
                  onClick={() => void run('cancel', () => api.post(`/admin/signatures/${r.id}/cancel`, { reason: cancelReason.trim() || null }), t('esign.admin.detail.cancelled')).then((ok) => ok && setCancelOpen(false))}
                >
                  {t('esign.admin.detail.cancelConfirm')}
                </button>
                <button type="button" className="btn-white btn-sm border border-line" onClick={() => setCancelOpen(false)}>
                  {t('esign.sign.cancel')}
                </button>
              </div>
            </section>
          )}

          {/* Audit trail */}
          <section>
            <h3 className="mb-2 text-sm font-semibold text-navy-900">{t('esign.admin.detail.timeline')}</h3>
            <ol className="relative space-y-3 border-l border-line pl-4">
              {r.events.map((e) => (
                <li key={e.id} className="relative">
                  <span className={clsx('absolute top-1.5 -left-[21px] size-2.5 rounded-full', e.type === 'SIGNED' || e.type === 'COMPLETED' ? 'bg-success' : e.type === 'DECLINED' || e.type === 'CANCELLED' || e.type === 'EXPIRED' ? 'bg-danger' : 'bg-brand-400')} aria-hidden />
                  <p className="text-sm">
                    <span className="font-semibold text-navy-900">{t(`esign.admin.event.${e.type}`)}</span>
                    {(e.signer || e.actor) && <span className="text-muted"> · {e.signer?.name ?? e.actor?.name}</span>}
                  </p>
                  <p className="text-[11px] text-muted">
                    {fmtDateTime(e.at)}
                    {e.ip && ` · IP ${e.ip}`}
                    {e.userAgent && ` · ${shortUserAgent(e.userAgent)}`}
                    {e.note && e.type !== 'CREATED' && ` · ${e.note}`}
                  </p>
                </li>
              ))}
            </ol>
          </section>
          <p className="text-xs text-muted">{t('esign.legal')}</p>
        </div>
      )}
    </Drawer>
  );
};

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="min-w-0">
    <dt className="text-[11px] text-muted">{label}</dt>
    <dd className="truncate text-sm text-ink">{children}</dd>
  </div>
);

const PdfRow = ({ label, sub, view, download, accent }: { label: string; sub: string; view: string; download: string; accent?: boolean }) => (
  <div className={clsx('flex items-center gap-2 rounded-lg border px-3 py-2', accent ? 'border-emerald-200 bg-emerald-50' : 'border-line bg-surface/60')}>
    <div className="min-w-0 flex-1">
      <p className="truncate text-sm font-semibold text-navy-900">{label}</p>
      <p className="truncate text-[11px] text-muted">{sub}</p>
    </div>
    <a href={view} target="_blank" rel="noreferrer" className="grid size-9 place-items-center rounded-lg text-muted hover:bg-white hover:text-navy-900" aria-label={label}>
      <ExternalLink className="size-4" />
    </a>
    <a href={download} className="grid size-9 place-items-center rounded-lg text-muted hover:bg-white hover:text-navy-900" aria-label={`${label} ↓`}>
      <Download className="size-4" />
    </a>
  </div>
);
