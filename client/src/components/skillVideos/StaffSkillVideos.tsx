import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Check, Eye, Film, ShieldAlert, X } from 'lucide-react';
import { api, formatBytes } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Field, Textarea } from '@/components/ui/Field';
import { StatusPill } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { fmtDate, fmtDateTime } from '@/components/admin/labels';
import { fmtDuration, toastSkillVideoError, type StaffSkillVideo } from './api';

/** Query key prefix of every staff skill-video list (queue page, case Documents tab). */
export const STAFF_KEY = ['admin-skill-videos'] as const;

interface ViewRow {
  id: string;
  at: string;
  companyId: string;
  company: string | null;
  viewer: string | null;
}

const ViewsModal = ({ video, onClose }: { video: StaffSkillVideo; onClose: () => void }) => {
  const { t } = useTranslation();
  const { data, isLoading } = useQuery({
    queryKey: [...STAFF_KEY, 'views', video.id],
    queryFn: async () => (await api.get<{ items: ViewRow[]; employers: number }>(`/admin/skill-videos/${video.id}/views`)).data,
  });
  return (
    <Modal open onClose={onClose} title={t('skillVideos.staff.viewsTitle')} description={video.title} size="md">
      {isLoading ? (
        <Spinner className="size-5" />
      ) : !data?.items.length ? (
        <p className="text-sm text-muted">{t('skillVideos.staff.viewsNone')}</p>
      ) : (
        <ul className="divide-y divide-line text-sm">
          {data.items.map((r) => (
            <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
              <span className="min-w-0">
                <span className="font-semibold text-ink">{r.company ?? r.companyId}</span>
                {r.viewer && <span className="text-muted"> · {r.viewer}</span>}
              </span>
              <span className="text-xs text-muted tabular-nums">{fmtDateTime(r.at)}</span>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
};

const RejectModal = ({ video, onClose }: { video: StaffSkillVideo; onClose: () => void }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [reason, setReason] = useState('');
  const m = useMutation({
    mutationFn: () => api.post(`/admin/skill-videos/${video.id}/reject`, { reason: reason.trim() }),
    onSuccess: () => {
      toast.success(t('skillVideos.staff.rejected'));
      void qc.invalidateQueries({ queryKey: STAFF_KEY });
      onClose();
    },
    onError: toastSkillVideoError,
  });
  return (
    <Modal
      open
      onClose={onClose}
      busy={m.isPending}
      title={t('skillVideos.staff.rejectTitle')}
      description={video.title}
      size="md"
      as="form"
      onSubmit={(e) => {
        e.preventDefault();
        if (reason.trim().length >= 3) m.mutate();
      }}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={m.isPending}>
            {t('skillVideos.form.cancel')}
          </Button>
          <Button type="submit" variant="danger" loading={m.isPending} disabled={reason.trim().length < 3}>
            {t('skillVideos.staff.reject')}
          </Button>
        </>
      }
    >
      <Field label={t('skillVideos.staff.rejectReason')} required>
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} rows={3} placeholder={t('skillVideos.staff.rejectPh')} />
      </Field>
    </Modal>
  );
};

/** One video for staff: player, status, consent, views, approve / reject. */
export const StaffSkillVideoCard = ({ v, showCandidate = false }: { v: StaffSkillVideo; showCandidate?: boolean }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [rejecting, setRejecting] = useState(false);
  const [views, setViews] = useState(false);
  const approve = useMutation({
    mutationFn: () => api.post(`/admin/skill-videos/${v.id}/approve`),
    onSuccess: () => {
      toast.success(t('skillVideos.staff.approved'));
      void qc.invalidateQueries({ queryKey: STAFF_KEY });
    },
    onError: toastSkillVideoError,
  });
  const q = encodeURIComponent(v.updatedAt);
  return (
    <li className="min-w-0 rounded-lg border border-line bg-card p-3">
      <video
        key={v.updatedAt}
        controls
        preload="metadata"
        playsInline
        controlsList="nodownload"
        className="aspect-video w-full rounded-md bg-navy-900"
        poster={v.hasPoster ? `/api/admin/skill-videos/${v.id}/poster?v=${q}` : undefined}
        src={`/api/admin/skill-videos/${v.id}/file?v=${q}`}
      />
      <div className="mt-2 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">{v.title}</p>
          <p className="text-xs text-muted">
            {t(`skillVideos.skills.${v.skill}`)} · {fmtDuration(v.durationSec)} · {formatBytes(v.size)} · {t('skillVideos.staff.uploadedAt', { date: fmtDate(v.updatedAt) })}
          </p>
          {showCandidate && v.candidate && (
            <p className="mt-0.5 text-xs">
              <span className="text-muted">{t('skillVideos.staff.candidate')}: </span>
              <Link className="link" to={`/admin/candidates?id=${v.candidate.id}`}>
                {v.candidate.firstName} {v.candidate.lastName}
              </Link>
              {v.case && (
                <>
                  {' · '}
                  <Link className="link code-id" to={`/admin/cases/${v.case.id}?tab=documents`}>
                    {v.case.number}
                  </Link>
                </>
              )}
            </p>
          )}
        </div>
        <StatusPill domain="review" status={v.status} label={t(`skillVideos.status.${v.status}`)} />
      </div>
      {v.status === 'REJECTED' && v.rejectReason && (
        <p className="mt-2 rounded-md bg-danger-bg px-2.5 py-1.5 text-xs text-danger-fg">
          <span className="font-semibold">{t('skillVideos.reason')}: </span>
          {v.rejectReason}
        </p>
      )}
      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span className={v.consent ? 'text-success-fg' : 'text-warning-fg'}>{v.consent ? t('skillVideos.consentOn') : t('skillVideos.consentOff')}</span>
        <button type="button" className="inline-flex items-center gap-1 text-link hover:underline" onClick={() => setViews(true)}>
          <Eye className="size-3.5" aria-hidden /> {t('skillVideos.staff.views')}: {v.employerViews}
        </button>
      </p>
      {!v.consent && v.status !== 'REJECTED' && (
        <p className="mt-1 flex items-start gap-1 text-xs text-muted">
          <ShieldAlert className="mt-px size-3.5 shrink-0" aria-hidden /> {t('skillVideos.staff.consentMissing')}
        </p>
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        {v.status !== 'APPROVED' && (
          <Button size="sm" icon={Check} loading={approve.isPending} onClick={() => approve.mutate()}>
            {t('skillVideos.staff.approve')}
          </Button>
        )}
        <Button size="sm" variant="secondary" icon={X} className="text-danger" onClick={() => setRejecting(true)}>
          {t('skillVideos.staff.reject')}
        </Button>
      </div>
      {rejecting && <RejectModal video={v} onClose={() => setRejecting(false)} />}
      {views && <ViewsModal video={v} onClose={() => setViews(false)} />}
    </li>
  );
};

/** Admin case page → Documents tab: compact list of the client's skill videos (hidden when there are none). */
export const CaseSkillVideos = ({ caseId }: { caseId: string }) => {
  const { t } = useTranslation();
  const { data } = useQuery({
    queryKey: [...STAFF_KEY, 'case', caseId],
    queryFn: async () => (await api.get<{ items: StaffSkillVideo[] }>('/admin/skill-videos', { params: { caseId } })).data.items,
  });
  if (!data?.length) return null;
  return (
    <section className="rounded-xl border border-line bg-card p-4 sm:p-5" aria-labelledby={`case-skill-videos-${caseId}`}>
      <h3 id={`case-skill-videos-${caseId}`} className="type-card-title flex items-center gap-1.5">
        <Film className="size-4 text-brand-600" aria-hidden /> {t('skillVideos.staff.sectionTitle')}
        <span className="code-id text-xs text-muted">{data.length}</span>
      </h3>
      <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {data.map((v) => (
          <StaffSkillVideoCard key={v.id} v={v} />
        ))}
      </ul>
    </section>
  );
};
