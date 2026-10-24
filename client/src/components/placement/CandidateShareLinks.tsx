import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { Ban, Copy, Eye, Link2, Mail, Plus, ThumbsDown, ThumbsUp } from 'lucide-react';
import { api } from '@/lib/api';
import { useL10n } from '@/lib/l10n';
import { registerCopy } from '@/i18n';
import { pagesPlacement } from '@/i18n/pagesPlacement';
import { Spinner } from '@/components/ui/Spinner';
import { Modal } from '@/components/admin/Modal';
import { Panel } from '@/components/admin/ui';
import { fmtDate, fmtDateTime } from '@/components/admin/labels';
import { TONE_CLASS } from '@/components/ui/status';
import { copyText } from '@/components/ops/shared';
import { toastPlacementError, type ShareLinkRow } from './api';

registerCopy(pagesPlacement);

const STATUS_TONE = { active: TONE_CLASS.success, expired: TONE_CLASS.neutral, revoked: TONE_CLASS.danger } as const;

/**
 * Candidate card panel: employer share links (no login). Staff create one — optionally for one of the
 * candidate's applications — copy it or open an e-mail draft, see views and the employer's answer, revoke.
 */
export const CandidateShareLinks = ({ candidateId, applications }: { candidateId: string; applications: { id: string; label: string }[] }) => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const qc = useQueryClient();
  const key = ['placement-share-links', candidateId];
  const { data, isLoading } = useQuery({
    queryKey: key,
    queryFn: async () => (await api.get<{ items: ShareLinkRow[]; sharingAllowed: boolean; maxDays: number }>(`/admin/placement/candidates/${candidateId}/share-links`)).data,
  });
  const [creating, setCreating] = useState(false);
  const [applicationId, setApplicationId] = useState('');
  const [days, setDays] = useState(14);
  const [created, setCreated] = useState<{ url: string; expiresAt: string } | null>(null);

  const create = useMutation({
    mutationFn: async () => (await api.post<{ url: string; expiresAt: string }>(`/admin/placement/candidates/${candidateId}/share-links`, { applicationId: applicationId || null, days })).data,
    onSuccess: (r) => {
      setCreated(r);
      void qc.invalidateQueries({ queryKey: key });
    },
    onError: toastPlacementError,
  });
  const revoke = useMutation({
    mutationFn: (id: string) => api.post(`/admin/placement/share-links/${id}/revoke`),
    onSuccess: () => {
      toast.success(t('placement.share.revoked'));
      void qc.invalidateQueries({ queryKey: key });
    },
    onError: toastPlacementError,
  });
  const close = () => {
    setCreating(false);
    setCreated(null);
    setApplicationId('');
    setDays(14);
  };
  const copy = async (url: string) => {
    if (await copyText(url)) toast.success(t('placement.share.copied'));
  };
  const mailto = (url: string, expiresAt: string) =>
    `mailto:?subject=${encodeURIComponent(t('placement.share.mailSubject'))}&body=${encodeURIComponent(t('placement.share.mailBody', { url, date: fmtDate(expiresAt) }))}`;

  return (
    <Panel
      title={t('placement.share.title')}
      icon={Link2}
      actions={
        <button type="button" className="btn-secondary btn-sm" disabled={!data?.sharingAllowed} onClick={() => setCreating(true)}>
          <Plus className="size-3.5" /> {t('placement.share.create')}
        </button>
      }
    >
      <p className="-mt-1 mb-3 text-xs text-muted">{t('placement.share.intro')}</p>
      {data && !data.sharingAllowed && <p className="mb-3 rounded-md bg-warning-bg px-3 py-2 text-xs text-warning-fg">{t('placement.share.declined')}</p>}
      {isLoading ? (
        <Spinner className="size-5 text-brand-600" />
      ) : !data?.items.length ? (
        <p className="text-sm text-muted">{t('placement.share.empty')}</p>
      ) : (
        <ul className="divide-y divide-line">
          {data.items.map((l) => (
            <li key={l.id} className="py-2.5 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-navy-900">
                    {[l.company?.name, l.vacancy ? tr(l.vacancy.title) : null].filter(Boolean).join(' · ') || t('placement.share.noApplication')}
                  </p>
                  <p className="text-muted">
                    {[fmtDateTime(l.createdAt), l.createdBy ? t('placement.share.by', { name: l.createdBy }) : null, t('placement.share.expires', { date: fmtDate(l.expiresAt) })].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 text-muted" title={l.lastViewedAt ? t('placement.share.lastViewed', { date: fmtDateTime(l.lastViewedAt) }) : undefined}>
                    <Eye className="size-3.5" aria-hidden /> {t('placement.share.views', { count: l.viewCount })}
                  </span>
                  <span className={clsx('badge', STATUS_TONE[l.status])}>{t(`placement.share.status.${l.status}`)}</span>
                  {l.status === 'active' && (
                    <button type="button" className="btn-ghost btn-sm text-danger" disabled={revoke.isPending} onClick={() => revoke.mutate(l.id)} aria-label={t('placement.share.revoke')}>
                      <Ban className="size-3.5" /> <span className="hidden sm:inline">{t('placement.share.revoke')}</span>
                    </button>
                  )}
                </div>
              </div>
              {l.decision && (
                <p className={clsx('mt-1.5 rounded-md px-2.5 py-1.5', l.decision === 'INTERESTED' ? TONE_CLASS.success : TONE_CLASS.neutral)}>
                  {l.decision === 'INTERESTED' ? <ThumbsUp className="mr-1 inline size-3.5" aria-hidden /> : <ThumbsDown className="mr-1 inline size-3.5" aria-hidden />}
                  <strong>{t(`placement.share.decision.${l.decision}`)}</strong> — {t('placement.share.decidedBy', { name: l.decidedByName ?? '—', date: l.decidedAt ? fmtDateTime(l.decidedAt) : '' })}
                  {l.decisionNote && <span className="mt-0.5 block whitespace-pre-line">“{l.decisionNote}”</span>}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={creating}
        onClose={close}
        size="sm"
        title={t('placement.share.createTitle')}
        footer={
          created ? (
            <button type="button" className="btn-primary btn-sm" onClick={close}>
              {t('placement.share.close')}
            </button>
          ) : (
            <>
              <button type="button" className="btn-secondary btn-sm" onClick={close}>
                {t('admin.common.cancel')}
              </button>
              <button type="button" className="btn-primary btn-sm" disabled={create.isPending} onClick={() => create.mutate()}>
                {create.isPending ? <Spinner className="size-3.5" /> : <Link2 className="size-3.5" />} {t('placement.share.create')}
              </button>
            </>
          )
        }
      >
        {created ? (
          <div className="space-y-3">
            <p className="text-sm font-semibold text-success-fg">{t('placement.share.created')}</p>
            <input readOnly className="input font-mono text-xs" value={created.url} onFocus={(e) => e.currentTarget.select()} aria-label={t('placement.share.title')} />
            <p className="text-xs text-muted">{t('placement.share.onceHint')}</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-secondary btn-sm" onClick={() => void copy(created.url)}>
                <Copy className="size-3.5" /> {t('placement.share.copy')}
              </button>
              <a className="btn-secondary btn-sm" href={mailto(created.url, created.expiresAt)}>
                <Mail className="size-3.5" /> {t('placement.share.mail')}
              </a>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="label" htmlFor="sl-app">
                {t('placement.share.application')}
              </label>
              <select id="sl-app" data-autofocus className="input" value={applicationId} onChange={(e) => setApplicationId(e.target.value)}>
                <option value="">{t('placement.share.noApplication')}</option>
                {applications.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="sl-days">
                {t('placement.share.days')}
              </label>
              <input id="sl-days" type="number" min={1} max={data?.maxDays ?? 60} className="input w-32" value={days} onChange={(e) => setDays(Math.max(1, Math.min(data?.maxDays ?? 60, Number(e.target.value) || 1)))} />
            </div>
          </div>
        )}
      </Modal>
    </Panel>
  );
};
