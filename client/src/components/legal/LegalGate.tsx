import { useId, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ExternalLink, FileText, LogOut, ScrollText, ShieldCheck } from 'lucide-react';
import { api, getImpersonation } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useL10n } from '@/lib/l10n';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { registerCopy } from '@/i18n';
import { pagesLegalDocs } from '@/i18n/pagesLegalDocs';
import { LEGAL_PATH, PENDING_KEY, versionPath, type PendingAcceptance } from './api';

registerCopy(pagesLegalDocs);

type PendingResponse = { pending: PendingAcceptance[]; blocking: boolean };

/** Pages the user can still open without accepting: the legal texts and the privacy centre (DSGVO rights). */
const OPEN_PATHS = [/^\/account\/privacy/, /^\/(agb|terms|privacy|cookies|impressum)$/, /^\/legal\//];

/**
 * Re-acceptance of updated legal texts (a published version flagged "requires re-acceptance" that the
 * user has not accepted yet). Clients, employers and agents get a blocking dialog with the change
 * summary; "Not now" leaves them only the privacy centre, the legal pages and logout. Staff are never
 * locked out: they see a banner with a one-click confirmation. Mounted once in App.tsx for signed-in users.
 */
export default function LegalGate() {
  const { t } = useTranslation();
  const { tr, date } = useL10n();
  const { user, logout } = useAuth();
  // Clients have the privacy centre; employers / agents get the public policy (with the request form).
  const privacyPath = user?.role === 'CLIENT' ? '/account/privacy' : '/privacy';
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const uid = useId();
  const [checked, setChecked] = useState(false);
  const [declined, setDeclined] = useState(false);
  // "View as client": an admin must never accept on the client's behalf.
  const impersonating = getImpersonation() !== null;

  const { data } = useQuery({
    queryKey: PENDING_KEY,
    queryFn: async () => (await api.get<PendingResponse>('/legal/me/pending')).data,
    staleTime: 5 * 60_000,
    enabled: !impersonating,
    retry: false,
  });

  const accept = useMutation({
    mutationFn: async (ids: string[]) => (await api.post<PendingResponse>('/legal/me/accept', { ids })).data,
    onSuccess: (res) => {
      qc.setQueryData(PENDING_KEY, { pending: res.pending, blocking: res.blocking });
      void qc.invalidateQueries({ queryKey: ['privacy-center'] });
      setChecked(false);
      setDeclined(false);
      toast.success(t('legalDocs.reaccept.accepted'));
    },
    onError: () => toast.error(t('common.error')),
  });

  if (impersonating || !data?.pending.length) return null;
  const pending = data.pending;
  const ids = pending.map((p) => p.id);
  const names = pending.map((p) => t(`legalDocs.reaccept.kinds.${p.kind}`)).join(', ');

  // Staff: banner only, never locked out.
  if (!data.blocking) {
    return (
      <div role="region" aria-label={t('legalDocs.reaccept.title')} className="fixed inset-x-3 bottom-3 z-[65] mx-auto flex max-w-3xl flex-col gap-3 rounded-2xl border border-warning-border bg-warning-bg p-3 text-sm text-warning-fg shadow-xl sm:flex-row sm:items-center sm:p-4">
        <ScrollText className="hidden size-5 shrink-0 sm:block" aria-hidden />
        <p className="min-w-0 flex-1">
          {t('legalDocs.reaccept.staffBanner', { docs: names })}{' '}
          {pending.map((p) => (
            <a key={p.id} href={versionPath(p.kind, p.version)} target="_blank" rel="noopener" className="mr-2 font-semibold underline">
              {t(`legalDocs.reaccept.kinds.${p.kind}`)} {p.version}
            </a>
          ))}
        </p>
        <Button size="sm" onClick={() => accept.mutate(ids)} loading={accept.isPending}>
          {t('legalDocs.reaccept.staffAccept')}
        </Button>
      </div>
    );
  }

  const onOpenPath = OPEN_PATHS.some((re) => re.test(pathname));
  // Declined, or reading the texts / privacy centre: a slim bar instead of the dialog.
  if (declined || onOpenPath) {
    return (
      <div role="region" aria-label={t('legalDocs.reaccept.title')} className="fixed inset-x-3 bottom-3 z-[65] mx-auto flex max-w-3xl flex-col gap-3 rounded-2xl border border-warning-border bg-card p-4 text-sm shadow-2xl">
        <p className="font-semibold text-ink">{t('legalDocs.reaccept.declinedTitle')}</p>
        <p className="text-muted">{t('legalDocs.reaccept.declinedText')}</p>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            icon={ScrollText}
            onClick={() => {
              setDeclined(false);
              // On a legal page / the privacy centre the dialog stays hidden: go back to the portal to show it.
              if (onOpenPath) navigate(pathname.startsWith('/account') ? '/account' : '/');
            }}
          >
            {t('legalDocs.reaccept.review')}
          </Button>
          <Button size="sm" variant="secondary" icon={ShieldCheck} onClick={() => navigate(privacyPath)}>
            {t('legalDocs.reaccept.privacyCenter')}
          </Button>
          <Button size="sm" variant="ghost" icon={LogOut} onClick={() => void logout()}>
            {t('legalDocs.reaccept.logout')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Modal
      open
      onClose={() => setDeclined(true)}
      closeOnBackdrop={false}
      hideClose
      role="alertdialog"
      size="lg"
      zIndex={90}
      icon={<ScrollText className="size-5" aria-hidden />}
      title={t('legalDocs.reaccept.title')}
      description={t('legalDocs.reaccept.intro')}
      footer={
        <>
          <Button variant="secondary" onClick={() => setDeclined(true)} disabled={accept.isPending}>
            {t('legalDocs.reaccept.later')}
          </Button>
          <Button onClick={() => accept.mutate(ids)} disabled={!checked} loading={accept.isPending}>
            {t('legalDocs.reaccept.accept')}
          </Button>
        </>
      }
    >
      <ul className="space-y-3">
        {pending.map((p) => {
          const summary = tr(p.changeSummary);
          return (
            <li key={p.id} className="rounded-xl border border-line bg-surface p-4">
              <p className="flex items-center gap-2 font-semibold text-ink">
                <FileText className="size-4 shrink-0 text-brand-600" aria-hidden />
                {tr(p.title) || t(`legalDocs.reaccept.kinds.${p.kind}`)}
              </p>
              <p className="mt-0.5 text-xs text-muted">
                {t('legalDocs.reaccept.version', { version: p.version, date: date(p.effectiveAt ?? p.publishedAt ?? new Date()) })}
              </p>
              {summary && (
                <div className="mt-3">
                  <p className="text-xs font-bold tracking-wide text-muted uppercase">{t('legalDocs.reaccept.summary')}</p>
                  <p className="mt-1 text-sm whitespace-pre-line text-ink/85">{summary}</p>
                </div>
              )}
              <Link to={LEGAL_PATH[p.kind]} target="_blank" rel="noopener" className="mt-3 inline-flex min-h-9 items-center gap-1.5 text-sm font-semibold text-brand-600 hover:underline">
                {t('legalDocs.reaccept.readFull')}
                <ExternalLink className="size-3.5" aria-hidden />
              </Link>
            </li>
          );
        })}
      </ul>
      <label htmlFor={`${uid}-ok`} className="mt-4 flex items-start gap-2.5 text-sm text-ink">
        <input id={`${uid}-ok`} type="checkbox" className="mt-0.5 size-4 shrink-0 accent-brand-600" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
        <span>{t('legalDocs.reaccept.checkbox')}</span>
      </label>
    </Modal>
  );
}
