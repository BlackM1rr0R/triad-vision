import { useEffect, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { CheckCircle2, ExternalLink, Package, PauseCircle, RefreshCw, Send, SendHorizontal, XCircle, CheckCheck, Bot } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { hasMinRole } from '@/lib/types';
import { registerCopy } from '@/i18n';
import { pagesExternalApps } from '@/i18n/pagesExternalApps';
import { pagesExternalAuto } from '@/i18n/pagesExternalAuto';
import { pagesEmailDelivery } from '@/i18n/pagesEmailDelivery';
import { Panel } from '@/components/admin/ui';
import { Badge } from '@/components/ui/Badge';
import type { BadgeTone } from '@/components/ui/status';
import { Button } from '@/components/ui/Button';
import { Switch } from '@/components/ui/Switch';
import { Spinner } from '@/components/ui/Spinner';
import { confirmDialog } from '@/components/ui/ConfirmHost';
import { fmtDateTime } from '@/components/admin/labels';
import { useBlobDownload } from '@/components/cv/CvDownloadButton';
import { xappError } from './externalApps';

registerCopy(pagesExternalApps);
registerCopy(pagesExternalAuto);
registerCopy(pagesEmailDelivery); // automatic limit after bounces (adminDelivery.health.*)

/**
 * Staff side of the automatic sending of "apply via Triad Vision" applications (server lib/germanyJobs/autoSend.ts,
 * routes/admin/externalApplications.ts): the check result and state of one application with the overrides, and
 * the "Göndərməyə hazır" queue with the kill switch, limits and today's count (Admin › Job channels).
 */

export const AUTO_CHECKS = ['ACCOUNT', 'CV', 'GERMAN_LEVEL', 'PROFESSION', 'PASSPORT', 'PHONE', 'EMAIL'] as const;

export interface AutoView {
  state: 'NO_CONSENT' | 'NEEDS_DATA' | 'SEARCHING' | 'CLIENT_SEND' | 'READY' | 'QUEUED' | 'SENDING' | 'SENT' | 'STOPPED' | 'DUPLICATE' | null;
  missing: string[];
  checkedAt: string | null;
  reason: string | null;
  nextAt: string | null;
  sentAt: string | null;
  sentMode: 'AUTO' | 'STAFF' | 'MANUAL' | 'CLIENT' | null;
  employerEmail: string | null;
  employerEmailSource: 'listing' | 'staff' | 'DISCOVERED' | null;
  /** Employer e-mail discovery (server lib/germanyJobs/discovery). */
  employerEmailEvidence: string | null;
  employerEmailEvidenceUrl: string | null;
  employerPageUrl: string | null;
  discoveryState: 'FOUND' | 'NOT_FOUND' | 'ROBOTS' | 'FAILED' | 'SKIPPED' | null;
  discoveryAt: string | null;
  /** The client sends the package themselves. */
  clientSendAt: string | null;
  clientRemindedAt: string | null;
  clientHelpAt: string | null;
  forwardConsentAt: string | null;
  requiredGerman: string | null;
}

export const STATE_TONE: Record<NonNullable<AutoView['state']>, BadgeTone> = {
  NO_CONSENT: 'neutral',
  NEEDS_DATA: 'warning',
  SEARCHING: 'info',
  CLIENT_SEND: 'info',
  READY: 'warning',
  QUEUED: 'info',
  SENDING: 'info',
  SENT: 'success',
  STOPPED: 'neutral',
  DUPLICATE: 'neutral',
};

const extLink = (href: string, label: string) => (
  <a href={href} target="_blank" rel="nofollow noopener noreferrer" className="inline-flex items-center gap-1 text-link hover:underline">
    {label} <ExternalLink className="size-3" aria-hidden />
  </a>
);

/** "E-poçt tapıldı: x@y.de (mənbə: səhifə)" with the page it was found on, or why nothing was found. */
const DiscoveryInfo = ({ a }: { a: AutoView }) => {
  const { t } = useTranslation();
  if (a.employerEmailSource === 'DISCOVERED' && a.employerEmail) {
    return (
      <div className="rounded-md border border-line bg-surface px-2 py-1.5">
        <p className="flex flex-wrap items-center gap-x-2 text-ink">
          <span className="font-semibold">{t('xauto.admin.discovered', { email: a.employerEmail })}</span>
          {a.employerEmailEvidenceUrl && extLink(a.employerEmailEvidenceUrl, t('xauto.admin.evidencePage'))}
        </p>
        {a.employerEmailEvidence && <p className="mt-0.5 line-clamp-2 break-words text-muted">{a.employerEmailEvidence}</p>}
      </div>
    );
  }
  if (!a.discoveryState && !a.employerPageUrl) return null;
  return (
    <p className="flex flex-wrap items-center gap-x-2 text-muted">
      {a.discoveryState && <span>{t(`xauto.admin.discoveryResult.${a.discoveryState}`)}</span>}
      {a.employerPageUrl && extLink(a.employerPageUrl, t('xauto.admin.employerPage'))}
    </p>
  );
};

/** Per application (inside ExternalJobStatus): check, state, employer address and overrides. */
export const ExternalAutoSection = <T extends { auto: AutoView; status: string }>({ inquiryId, view, onUpdate }: { inquiryId: string; view: T; onUpdate: (v: T) => void }) => {
  const { t } = useTranslation();
  const uid = useId();
  const base = `/admin/external-applications/${inquiryId}`;
  const a = view.auto;
  const [email, setEmail] = useState(a.employerEmail ?? '');
  const pkg = useBlobDownload();
  useEffect(() => setEmail(a.employerEmail ?? ''), [a.employerEmail]);

  const act = useMutation({
    mutationFn: async (v: { path: string; method?: 'post' | 'put'; body?: unknown }) => (await api[v.method ?? 'post']<T>(`${base}${v.path}`, v.body)).data,
    onSuccess: (data) => {
      onUpdate(data);
      toast.success(t('xauto.admin.done'));
    },
    onError: (err) => toast.error(xappError(err)),
  });

  const sendNow = async () => {
    if (!(await confirmDialog({ tone: 'primary', message: t('xauto.admin.sendNowConfirm', { email: a.employerEmail ?? '' }), confirmLabel: t('xauto.admin.sendNow') }))) return;
    act.mutate({ path: '/auto/send' });
  };

  const sent = !!a.sentAt;
  const open = !sent && view.status === 'SUBMITTED';
  return (
    <section className="space-y-2 rounded-lg border border-line bg-sunken/40 px-3 py-2.5 text-xs" aria-label={t('xauto.admin.title')}>
      <p className="flex flex-wrap items-center gap-2 text-muted">
        <Bot className="size-3.5" aria-hidden /> <span className="font-semibold text-ink">{t('xauto.admin.title')}</span>
        {a.state && (
          <Badge tone={STATE_TONE[a.state]} dot>
            {t(`xauto.admin.states.${a.state}`)}
          </Badge>
        )}
        {a.reason && <span>· {t(`xauto.admin.reasons.${a.reason}`, { defaultValue: a.reason })}</span>}
        {a.nextAt && a.state === 'QUEUED' && <span>· {t('xauto.admin.nextAt', { date: fmtDateTime(a.nextAt) })}</span>}
      </p>
      {sent && <p className="text-success-fg">{t('xauto.admin.sentAt', { date: fmtDateTime(a.sentAt!), mode: t(`xauto.admin.modes.${a.sentMode ?? 'AUTO'}`) })}</p>}
      <p className="text-muted">{a.forwardConsentAt ? t('xauto.admin.consentAt', { date: fmtDateTime(a.forwardConsentAt) }) : t('xauto.admin.noConsent')}</p>
      <DiscoveryInfo a={a} />
      {(a.clientSendAt || a.clientHelpAt) && (
        <p className="text-muted">
          {[
            a.clientSendAt && t('xauto.admin.clientSendAt', { date: fmtDateTime(a.clientSendAt) }),
            a.clientRemindedAt && t('xauto.admin.clientRemindedAt', { date: fmtDateTime(a.clientRemindedAt) }),
            a.clientHelpAt && t('xauto.admin.clientHelpAt', { date: fmtDateTime(a.clientHelpAt) }),
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      )}

      <div>
        <p className="font-semibold text-ink">{t('xauto.admin.checkTitle')}</p>
        {a.checkedAt ? (
          <>
            <ul className="mt-1 grid gap-x-4 gap-y-0.5 sm:grid-cols-2">
              {AUTO_CHECKS.map((c) => {
                const bad = a.missing.includes(c);
                return (
                  <li key={c} className={bad ? 'flex items-center gap-1.5 text-danger-fg' : 'flex items-center gap-1.5 text-success-fg'}>
                    {bad ? <XCircle className="size-3.5" aria-hidden /> : <CheckCircle2 className="size-3.5" aria-hidden />}
                    {t(`xauto.admin.checks.${c}`)}
                  </li>
                );
              })}
            </ul>
            <p className="mt-1 text-muted">
              {t('xauto.admin.checkedAt', { date: fmtDateTime(a.checkedAt) })}
              {a.requiredGerman ? ` · ${t('xauto.admin.requiredGerman', { level: a.requiredGerman })}` : ''}
            </p>
          </>
        ) : (
          <p className="text-muted">{t('xauto.admin.notChecked')}</p>
        )}
      </div>

      {open && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            act.mutate({ path: '/auto/employer-email', method: 'put', body: { email: email.trim() || null } });
          }}
        >
          <div className="min-w-0 flex-1">
            <label className="label" htmlFor={`${uid}-email`}>
              {t('xauto.admin.employerEmail')}
              {a.employerEmailSource ? ` (${t(`xauto.admin.source.${a.employerEmailSource}`)})` : ''}
            </label>
            <input id={`${uid}-email`} type="email" maxLength={190} className="input" value={email} onChange={(e) => setEmail(e.target.value)} aria-describedby={`${uid}-email-hint`} />
            <p id={`${uid}-email-hint`} className="mt-1 text-[11px] text-muted">
              {t('xauto.admin.employerEmailHint')}
            </p>
          </div>
          <Button type="submit" size="sm" variant="secondary" loading={act.isPending} disabled={email.trim() === (a.employerEmail ?? '')}>
            {t('xauto.admin.saveEmail')}
          </Button>
        </form>
      )}

      <div className="flex flex-wrap gap-2">
        {open && a.employerEmail && a.forwardConsentAt && (
          <Button size="sm" icon={Send} loading={act.isPending} onClick={() => void sendNow()}>
            {t('xauto.admin.sendNow')}
          </Button>
        )}
        {open && a.state !== 'STOPPED' && (
          <Button size="sm" variant="ghost" icon={PauseCircle} loading={act.isPending} onClick={() => act.mutate({ path: '/auto/stop' })}>
            {t('xauto.admin.stop')}
          </Button>
        )}
        {open && a.forwardConsentAt && (
          <Button size="sm" variant="ghost" icon={RefreshCw} loading={act.isPending} onClick={() => act.mutate({ path: '/auto/resume' })}>
            {t('xauto.admin.resume')}
          </Button>
        )}
        {!sent && (
          <Button size="sm" variant="ghost" icon={CheckCheck} loading={act.isPending} onClick={() => act.mutate({ path: '/auto/mark-sent' })}>
            {t('xauto.admin.markSent')}
          </Button>
        )}
        <Button size="sm" variant="ghost" icon={Package} loading={pkg.busy} onClick={() => void pkg.run(`${base}/package.zip`, 'Bewerbung.zip')}>
          {t('xauto.admin.package')}
        </Button>
      </div>
    </section>
  );
};

// ─── Queue + settings (Admin › Job channels) ───────────────────────────────

interface AutoSettings {
  enabled: boolean;
  dailyLimit: number;
  perDomainLimit: number;
  replyTo: string;
  replyToEffective: string;
  discovery: boolean;
}

interface QueueItem {
  inquiryId: string;
  name: string;
  listingTitle: string | null;
  listingCompany: string | null;
  listingUrl: string;
  createdAt: string;
  state: 'READY' | 'QUEUED';
  reason: string | null;
  nextAt: string | null;
  employerEmail: string | null;
  employerPageUrl: string | null;
  clientHelpAt: string | null;
  hasCoverLetter: boolean;
}

interface Overview {
  settings: AutoSettings;
  /** limit = what applies today (lowered automatically after bounces); configured = the setting. */
  today: { sent: number; limit: number; configured?: number };
  health?: { factor: number; reason: 'BOUNCES' | null; changedAt: string | null; last: { rate: number } | null };
  counts: Record<string, number>;
  queue: QueueItem[];
}

const OVERVIEW_KEY = ['admin', 'external-auto-overview'];

export const ExternalAutoQueuePanel = () => {
  const { t } = useTranslation();
  const uid = useId();
  const qc = useQueryClient();
  const canEdit = hasMinRole(useAuth().user?.role, 'ADMIN');
  const q = useQuery({ queryKey: OVERVIEW_KEY, queryFn: async () => (await api.get<Overview>('/admin/external-applications/auto/overview')).data, staleTime: 30_000 });
  const [form, setForm] = useState<{ dailyLimit: string; perDomainLimit: string; replyTo: string } | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const pkg = useBlobDownload();

  useEffect(() => {
    if (q.data) setForm({ dailyLimit: String(q.data.settings.dailyLimit), perDomainLimit: String(q.data.settings.perDomainLimit), replyTo: q.data.settings.replyTo });
  }, [q.data?.settings.dailyLimit, q.data?.settings.perDomainLimit, q.data?.settings.replyTo]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = useMutation({
    mutationFn: async (patch: Partial<Omit<AutoSettings, 'replyToEffective'>>) => (await api.put('/admin/external-applications/auto/settings', patch)).data,
    onSuccess: async () => {
      toast.success(t('xauto.admin.saved'));
      await qc.invalidateQueries({ queryKey: OVERVIEW_KEY });
    },
    onError: (err) => toast.error(xappError(err)),
  });
  const markSent = useMutation({
    mutationFn: async (ids: string[]) => (await api.post<{ done: number }>('/admin/external-applications/auto/mark-sent', { ids })).data,
    onSuccess: async (r) => {
      toast.success(t('xauto.admin.markedSent', { n: r.done }));
      setSelected([]);
      await qc.invalidateQueries({ queryKey: OVERVIEW_KEY });
    },
    onError: (err) => toast.error(xappError(err)),
  });

  if (!q.data || !form) return null;
  const d = q.data;
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <Panel title={t('xauto.admin.title')} icon={SendHorizontal}>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Badge tone={d.settings.enabled ? 'success' : 'neutral'} dot>
          {d.settings.enabled ? t('xauto.admin.on') : t('xauto.admin.off')}
        </Badge>
        <span className="font-semibold text-ink">{t('xauto.admin.today', { n: d.today.sent, limit: d.today.limit })}</span>
        {d.health && d.health.factor < 1 && (
          <Badge tone="warning" dot>
            {t('adminDelivery.health.limit', { effective: d.today.limit, configured: d.today.configured ?? d.settings.dailyLimit })} · {t('adminDelivery.health.lowered', { rate: `${Math.round((d.health.last?.rate ?? 0) * 1000) / 10} %` })}
          </Badge>
        )}
        <span className="text-xs text-muted">{t('xauto.admin.counts', { needs: d.counts.NEEDS_DATA ?? 0, consent: d.counts.NO_CONSENT ?? 0, queued: d.counts.QUEUED ?? 0, client: d.counts.CLIENT_SEND ?? 0 })}</span>
      </div>

      <form
        className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))_auto] md:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate({ dailyLimit: Number(form.dailyLimit) || 0, perDomainLimit: Math.max(1, Number(form.perDomainLimit) || 1), replyTo: form.replyTo.trim() });
        }}
      >
        <Switch checked={d.settings.enabled} onChange={(v) => save.mutate({ enabled: v })} label={t('xauto.admin.switchLabel')} hint={t('xauto.admin.switchHint')} showLabel disabled={!canEdit || save.isPending} />
        <div>
          <label className="label" htmlFor={`${uid}-daily`}>{t('xauto.admin.dailyLimit')}</label>
          <input id={`${uid}-daily`} type="number" min={0} max={500} className="input" value={form.dailyLimit} disabled={!canEdit} onChange={(e) => setForm({ ...form, dailyLimit: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor={`${uid}-domain`}>{t('xauto.admin.perDomainLimit')}</label>
          <input id={`${uid}-domain`} type="number" min={1} max={50} className="input" value={form.perDomainLimit} disabled={!canEdit} onChange={(e) => setForm({ ...form, perDomainLimit: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor={`${uid}-reply`}>{t('xauto.admin.replyTo')}</label>
          <input id={`${uid}-reply`} type="email" maxLength={190} className="input" value={form.replyTo} disabled={!canEdit} placeholder={d.settings.replyToEffective} onChange={(e) => setForm({ ...form, replyTo: e.target.value })} />
          {!form.replyTo && d.settings.replyToEffective && <p className="mt-1 text-[11px] text-muted">{t('xauto.admin.replyToHint', { email: d.settings.replyToEffective })}</p>}
        </div>
        <Button type="submit" size="sm" variant="secondary" loading={save.isPending} disabled={!canEdit}>
          {t('xauto.admin.save')}
        </Button>
      </form>
      <div className="mt-3">
        <Switch checked={d.settings.discovery} onChange={(v) => save.mutate({ discovery: v })} label={t('xauto.admin.discoveryLabel')} hint={t('xauto.admin.discoveryHint')} showLabel disabled={!canEdit || save.isPending} />
      </div>
      {!canEdit && <p className="mt-2 text-xs text-muted">{t('xauto.admin.adminOnly')}</p>}

      <div className="mt-5 border-t border-line pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="type-card-title">
            {t('xauto.admin.queueTitle')} ({d.queue.length})
          </h3>
          <Button size="sm" icon={CheckCheck} disabled={!selected.length} loading={markSent.isPending} onClick={() => markSent.mutate(selected)}>
            {t('xauto.admin.markSentSelected', { n: selected.length })}
          </Button>
        </div>
        <p className="mt-1 text-xs text-muted">{t('xauto.admin.queueIntro')}</p>
        {d.queue.length === 0 ? (
          <p className="mt-3 text-sm text-muted">{t('xauto.admin.queueEmpty')}</p>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {d.queue.map((r) => (
              <li key={r.inquiryId} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                <input type="checkbox" className="size-4 accent-primary" checked={selected.includes(r.inquiryId)} onChange={() => toggle(r.inquiryId)} aria-label={`${t('xauto.admin.select')}: ${r.name}`} />
                <div className="min-w-0 flex-1">
                  <Link to={`/admin/inquiries?open=${r.inquiryId}`} className="font-semibold text-link hover:underline">
                    {r.name}
                  </Link>
                  <p className="truncate text-xs text-muted">
                    {[r.listingTitle, r.listingCompany].filter(Boolean).join(' · ') || r.listingUrl} · {fmtDateTime(r.createdAt)}
                  </p>
                </div>
                <Badge tone={STATE_TONE[r.state]} dot>
                  {t(`xauto.admin.states.${r.state}`)}
                  {r.reason ? ` · ${t(`xauto.admin.reasons.${r.reason}`, { defaultValue: r.reason })}` : ''}
                </Badge>
                <a href={r.employerPageUrl ?? r.listingUrl} target="_blank" rel="nofollow noopener noreferrer" className="btn-ghost btn-sm">
                  {t('xauto.admin.listing')} <ExternalLink className="size-3.5" aria-hidden />
                </a>
                <Button size="sm" variant="ghost" icon={Package} loading={pkg.busy} onClick={() => void pkg.run(`/admin/external-applications/${r.inquiryId}/package.zip`, 'Bewerbung.zip')}>
                  {t('xauto.admin.package')}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {q.isFetching && <Spinner className="mt-2 size-4 text-link" />}
    </Panel>
  );
};
