import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Award, Download, GraduationCap, UserMinus, UserPlus } from 'lucide-react';
import { api } from '@/lib/api';
import { useL10n } from '@/lib/l10n';
import { registerCopy } from '@/i18n';
import { pagesCourseAdmin } from '@/i18n/pagesCourseAdmin';
import { Panel } from '@/components/admin/ui';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { userCoursesKey, useUserCourses } from './api';
import { useCourseError } from './admin/errors';

registerCopy(pagesCourseAdmin);

/** Admin case page → Ümumi: the client's pre-departure course progress (compact), enroll / remove, certificate. */
export default function CaseCourseCard({ userId }: { userId: string }) {
  const { t } = useTranslation();
  const { tr, date } = useL10n();
  const qc = useQueryClient();
  const onError = useCourseError();
  const q = useUserCourses(userId);
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const data = q.data;
  if (!data || (!data.enrollments.length && !data.available.length)) return null;

  const refresh = () => void qc.invalidateQueries({ queryKey: userCoursesKey(userId) });
  const enroll = async () => {
    const courseId = pick || data.available[0]?.id;
    if (!courseId) return;
    setBusy(true);
    try {
      await api.post('/admin/course/enrollments', { courseId, userId });
      toast.success(t('courseAdmin.card.enrolled'));
      setPick('');
      refresh();
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!removing) return;
    setBusy(true);
    try {
      await api.delete(`/admin/course/enrollments/${removing}`);
      toast.success(t('courseAdmin.card.removed'));
      refresh();
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
      setRemoving(null);
    }
  };

  return (
    <Panel
      id="case-course"
      title={t('courseAdmin.card.title')}
      icon={GraduationCap}
      actions={
        <Link to="/admin/course?tab=report" className="link text-xs">
          {t('courseAdmin.card.openReport')}
        </Link>
      }
    >
      <div className="space-y-4">
        {data.enrollments.length === 0 && <p className="text-sm text-muted">{t('courseAdmin.card.none')}</p>}
        {data.enrollments.map((e) => (
          <div key={e.enrollmentId} className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-ink">
                {tr(e.course.title)} <span className="font-normal text-muted">· {t(`courseAdmin.card.source.${e.source}`)}</span>
              </p>
              <span className="num text-sm font-semibold text-ink">{e.progress.percent}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-sunken" role="progressbar" aria-valuenow={e.progress.percent} aria-valuemin={0} aria-valuemax={100} aria-label={tr(e.course.title)}>
              <div className={`h-full ${e.progress.percent === 100 ? 'bg-success' : 'bg-primary'}`} style={{ width: `${e.progress.percent}%` }} />
            </div>
            <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
              <div>
                <dt className="inline text-muted">{t('courseAdmin.card.lastActivity')}: </dt>
                <dd className="inline text-ink">{e.lastActivityAt ? date(e.lastActivityAt) : t('courseAdmin.card.notStarted')}</dd>
              </div>
              <div>
                <dt className="inline text-muted">{t('courseAdmin.card.quizzes')}: </dt>
                <dd className="inline text-ink">{e.quizzes.map((x) => (x.best === null ? '—' : `${x.best}%`)).join(' · ') || '—'}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="inline text-muted">{t('courseAdmin.card.certificate')}: </dt>
                <dd className="inline text-ink">
                  {e.certificate ? (
                    <span className="inline-flex flex-wrap items-center gap-2">
                      <Award className="size-3.5 text-success-fg" aria-hidden />
                      <span className="code-id">{e.certificate.number}</span> · {date(e.certificate.issuedAt)}
                      <a className="link inline-flex items-center gap-1" href={`/api/admin/course/certificates/${e.certificate.id}.pdf`} download>
                        <Download className="size-3.5" aria-hidden />
                        PDF
                      </a>
                    </span>
                  ) : (
                    '—'
                  )}
                </dd>
              </div>
            </dl>
            <Button variant="ghost" size="sm" icon={UserMinus} onClick={() => setRemoving(e.enrollmentId)}>
              {t('courseAdmin.card.remove')}
            </Button>
          </div>
        ))}
        {data.isClient && data.available.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
            {data.available.length > 1 && (
              <select className="input w-auto min-w-0 py-2 text-sm" value={pick} onChange={(ev) => setPick(ev.target.value)} aria-label={t('courseAdmin.report.course')}>
                {data.available.map((c) => (
                  <option key={c.id} value={c.id}>
                    {tr(c.title)}
                  </option>
                ))}
              </select>
            )}
            <Button size="sm" variant="secondary" icon={UserPlus} loading={busy} onClick={() => void enroll()}>
              {data.available.length === 1 ? `${t('courseAdmin.card.enroll')}: ${tr(data.available[0].title)}` : t('courseAdmin.card.enroll')}
            </Button>
          </div>
        )}
      </div>
      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={() => void remove()}
        loading={busy}
        title={t('courseAdmin.card.remove')}
        message={t('courseAdmin.card.removeConfirm')}
        confirmLabel={t('courseAdmin.card.remove')}
      />
    </Panel>
  );
}
