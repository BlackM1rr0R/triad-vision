import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { CheckCircle2, ExternalLink, Package, XCircle, CheckCheck, Bot } from 'lucide-react';
import { api } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesExternalApps } from '@/i18n/pagesExternalApps';
import { pagesExternalAuto } from '@/i18n/pagesExternalAuto';
import { Badge } from '@/components/ui/Badge';
import type { BadgeTone } from '@/components/ui/status';
import { Button } from '@/components/ui/Button';
import { fmtDateTime } from '@/components/admin/labels';
import { useBlobDownload } from '@/components/cv/CvDownloadButton';
import { xappError } from './externalApps';

registerCopy(pagesExternalApps);
registerCopy(pagesExternalAuto);

/**
 * Staff side of an earlier "apply via Triad Vision" application (server routes/admin/externalApplications.ts): what
 * the automatic check / sending recorded, read-only. The automation is retired (owner decision: for external
 * listings the candidate applies to the employer directly), so there is no queue, no kill switch, no employer
 * address, "send now" or "resume" any more — only "sent outside the system" and the package download stay.
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

/** Per application (inside ExternalJobStatus): what the former automation recorded (read-only) + manual "sent". */
export const ExternalAutoSection = <T extends { auto: AutoView; status: string }>({ inquiryId, view, onUpdate }: { inquiryId: string; view: T; onUpdate: (v: T) => void }) => {
  const { t } = useTranslation();
  const base = `/admin/external-applications/${inquiryId}`;
  const a = view.auto;
  const pkg = useBlobDownload();

  const act = useMutation({
    mutationFn: async (v: { path: string }) => (await api.post<T>(`${base}${v.path}`)).data,
    onSuccess: (data) => {
      onUpdate(data);
      toast.success(t('xauto.admin.done'));
    },
    onError: (err) => toast.error(xappError(err)),
  });

  const sent = !!a.sentAt;
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
      <p className="text-muted">{t('xauto.admin.retired')}</p>
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

      <div className="flex flex-wrap gap-2">
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
