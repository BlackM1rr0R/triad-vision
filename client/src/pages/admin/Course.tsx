import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { BarChart3, GraduationCap, Layers, Plus, Sparkles } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useL10n } from '@/lib/l10n';
import { usePageTitle } from '@/lib/usePageTitle';
import { hasMinRole } from '@/lib/types';
import { registerCopy } from '@/i18n';
import { pagesCourseAdmin } from '@/i18n/pagesCourseAdmin';
import { ErrorBlock, LoadingBlock, PageHead } from '@/components/admin/ui';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Tabs, useTabParam } from '@/components/ui/Tabs';
import { ADMIN_COURSES_KEY, useAdminCourses } from '@/components/course/api';
import { CourseBuilder } from '@/components/course/admin/CourseBuilder';
import { useCourseError } from '@/components/course/admin/errors';
import { ProgressReport } from '@/components/course/admin/ProgressReport';

registerCopy(pagesCourseAdmin);

const TABS = ['courses', 'report'] as const;

const CourseList = ({ onOpen }: { onOpen: (id: string) => void }) => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const { user } = useAuth();
  const canEdit = hasMinRole(user?.role, 'ADMIN');
  const qc = useQueryClient();
  const onError = useCourseError();
  const q = useAdminCourses();
  const [busy, setBusy] = useState<'new' | 'starter' | null>(null);

  const create = async () => {
    setBusy('new');
    try {
      const r = await api.post<{ course: { id: string } }>('/admin/course/courses', { title: { az: t('courseAdmin.list.new'), de: '', en: '', ru: '' } });
      void qc.invalidateQueries({ queryKey: ADMIN_COURSES_KEY });
      onOpen(r.data.course.id);
    } catch (err) {
      onError(err);
    } finally {
      setBusy(null);
    }
  };
  const starter = async () => {
    setBusy('starter');
    try {
      const r = (await api.post<{ created: boolean; courseId: string }>('/admin/course/courses/starter')).data;
      toast.success(r.created ? t('courseAdmin.list.starterDone') : t('courseAdmin.list.starterExists'));
      void qc.invalidateQueries({ queryKey: ADMIN_COURSES_KEY });
      onOpen(r.courseId);
    } catch (err) {
      onError(err);
    } finally {
      setBusy(null);
    }
  };

  if (q.isLoading) return <LoadingBlock />;
  if (q.isError) return <ErrorBlock error={q.error} onRetry={() => void q.refetch()} />;
  const courses = q.data?.courses ?? [];
  const hasStarter = courses.some((c) => c.slug === 'pre-departure');

  return (
    <div className="space-y-4">
      {canEdit ? (
        <div className="flex flex-wrap gap-2">
          <Button icon={Plus} size="sm" loading={busy === 'new'} onClick={() => void create()}>
            {t('courseAdmin.list.new')}
          </Button>
          {!hasStarter && (
            <Button icon={Sparkles} size="sm" variant="secondary" loading={busy === 'starter'} onClick={() => void starter()}>
              {t('courseAdmin.list.starter')}
            </Button>
          )}
        </div>
      ) : (
        <p className="type-small">{t('courseAdmin.list.readOnly')}</p>
      )}
      {courses.length === 0 ? (
        <EmptyState icon={GraduationCap} title={t('courseAdmin.list.empty')} text={t('courseAdmin.list.emptyText')} />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {courses.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => onOpen(c.id)} className="card-interactive flex h-full w-full flex-col items-start gap-2 rounded-xl border border-line bg-card p-4 text-left">
                <span className="flex w-full items-start justify-between gap-2">
                  <span className="font-semibold text-ink">{tr(c.title)}</span>
                  <Badge tone={c.published ? 'success' : 'neutral'}>{c.published ? t('courseAdmin.list.published') : t('courseAdmin.list.draft')}</Badge>
                </span>
                <span className="text-xs text-muted">
                  {t('courseAdmin.list.lessons', { count: c.lessons })} · {t('courseAdmin.list.enrolled', { count: c.enrolled })} · {t('courseAdmin.list.completed', { count: c.completed })}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

/** Admin → Hazırlıq kursu: course builder (ADMIN+ edits, STAFF reads) and the progress report (STAFF+). */
export default function AdminCourse() {
  const { t } = useTranslation();
  usePageTitle(t('courseAdmin.pageTitle'));
  const [tab, setTab] = useTabParam('tab', TABS, 'courses');
  const [params, setParams] = useSearchParams();
  const open = params.get('course');
  const setOpen = (id: string | null) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        if (id) n.set('course', id);
        else n.delete('course');
        return n;
      },
      { replace: false },
    );

  return (
    <div className="space-y-4">
      <PageHead title={t('courseAdmin.pageTitle')} subtitle={t('courseAdmin.pageSubtitle')} />
      <Tabs
        label={t('courseAdmin.pageTitle')}
        items={TABS.map((k) => ({ key: k, label: t(`courseAdmin.tabs.${k}`), icon: k === 'courses' ? Layers : BarChart3 }))}
        value={tab}
        onChange={setTab}
      />
      {tab === 'courses' && (open ? <CourseBuilder key={open} courseId={open} onBack={() => setOpen(null)} /> : <CourseList onOpen={setOpen} />)}
      {tab === 'report' && <ProgressReport />}
    </div>
  );
}
