import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Award, Download, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { useL10n } from '@/lib/l10n';
import type { CaseStatus } from '@/lib/types';
import { statusLabel } from '@/components/admin/labels';
import { ErrorBlock } from '@/components/admin/ui';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusPill } from '@/components/ui/Badge';
import { Table } from '@/components/ui/Table';
import { buttonClass } from '@/components/ui/Button';
import { useAdminCourses, type ReportRow } from '../api';

const STATUSES: CaseStatus[] = ['DOCUMENTS_PENDING', 'DOCUMENTS_REVIEW', 'CONTRACT_SENT', 'CONTRACT_SIGNED', 'EMBASSY_DOCUMENTS', 'EMBASSY_REVIEW', 'APPOINTMENT_SCHEDULED', 'DECISION_PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'];

interface StaffMember {
  id: string;
  firstName: string;
  lastName: string;
}

const Bar = ({ percent }: { percent: number }) => (
  <span className="flex items-center gap-2">
    <span className="h-1.5 w-16 overflow-hidden rounded-full bg-sunken sm:w-24" aria-hidden>
      <span className={`block h-full ${percent === 100 ? 'bg-success' : 'bg-primary'}`} style={{ width: `${percent}%` }} />
    </span>
    <span className="num text-sm">{percent}%</span>
  </span>
);

/** Who is enrolled, % complete, quiz scores, certificate yes / no — filters by course, case status, staff; CSV. */
export function ProgressReport() {
  const { t } = useTranslation();
  const { tr, date } = useL10n();
  const courses = useAdminCourses();
  const staff = useQuery({ queryKey: ['staff-list'], queryFn: async () => (await api.get<{ staff: StaffMember[] }>('/admin/users/staff')).data.staff, staleTime: 300_000 });
  const [courseId, setCourseId] = useState('');
  const [status, setStatus] = useState('');
  const [staffId, setStaffId] = useState('');
  const [search, setSearch] = useState('');
  const params = useMemo(() => {
    const p = new URLSearchParams();
    if (courseId) p.set('courseId', courseId);
    if (status) p.set('status', status);
    if (staffId) p.set('staffId', staffId);
    if (search.trim()) p.set('q', search.trim());
    return p.toString();
  }, [courseId, status, staffId, search]);
  const q = useQuery({ queryKey: ['admin-course', 'report', params], queryFn: async () => (await api.get<{ rows: ReportRow[] }>(`/admin/course/report?${params}`)).data.rows, placeholderData: (prev) => prev });

  const select = 'input w-full py-2 text-sm sm:w-auto';
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <label className="w-full sm:w-auto">
          <span className="label">{t('courseAdmin.report.course')}</span>
          <select className={select} value={courseId} onChange={(e) => setCourseId(e.target.value)}>
            <option value="">{t('courseAdmin.report.all')}</option>
            {courses.data?.courses.map((c) => (
              <option key={c.id} value={c.id}>
                {tr(c.title)}
              </option>
            ))}
          </select>
        </label>
        <label className="w-full sm:w-auto">
          <span className="label">{t('courseAdmin.report.status')}</span>
          <select className={select} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">{t('courseAdmin.report.all')}</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {statusLabel(s)}
              </option>
            ))}
          </select>
        </label>
        <label className="w-full sm:w-auto">
          <span className="label">{t('courseAdmin.report.staff')}</span>
          <select className={select} value={staffId} onChange={(e) => setStaffId(e.target.value)}>
            <option value="">{t('courseAdmin.report.all')}</option>
            {staff.data?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.firstName} {s.lastName}
              </option>
            ))}
          </select>
        </label>
        <label className="w-full min-w-0 flex-1 sm:w-auto">
          <span className="label">{t('courseAdmin.report.search')}</span>
          <input className="input py-2 text-sm" type="search" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <a href={`/api/admin/course/report.csv?${params}`} download className={buttonClass({ variant: 'secondary', size: 'sm' })}>
          <Download className="size-4" aria-hidden />
          {t('courseAdmin.report.export')}
        </a>
      </div>
      {q.isError ? (
        <ErrorBlock error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <>
          <p className="type-small" aria-live="polite">
            {t('courseAdmin.report.count', { count: q.data?.length ?? 0 })}
          </p>
          <Table
            rows={q.data}
            loading={q.isLoading}
            rowKey={(r) => r.enrollmentId}
            stackOnMobile
            empty={<EmptyState compact icon={Users} title={t('courseAdmin.report.empty')} />}
            columns={[
              {
                key: 'client',
                header: t('courseAdmin.report.client'),
                primary: true,
                cell: (r) => (
                  <span>
                    <span className="block font-medium text-ink">
                      {r.user.firstName} {r.user.lastName}
                    </span>
                    <span className="block text-xs text-muted">{courseId ? r.user.email : tr(r.course.title)}</span>
                  </span>
                ),
              },
              {
                key: 'case',
                header: t('courseAdmin.report.case'),
                cell: (r) =>
                  r.case ? (
                    <span className="flex flex-col items-start gap-1">
                      <Link to={`/admin/cases/${r.case.id}`} className="link code-id text-sm">
                        {r.case.number}
                      </Link>
                      <StatusPill domain="case" status={r.case.status} label={statusLabel(r.case.status)} size="sm" />
                    </span>
                  ) : (
                    '—'
                  ),
              },
              { key: 'staff', header: t('courseAdmin.report.staff'), hideBelow: 'md', cell: (r) => r.case?.staff?.name ?? '—' },
              { key: 'progress', header: t('courseAdmin.report.progress'), cell: (r) => <Bar percent={r.percent} /> },
              { key: 'quiz', header: t('courseAdmin.report.quiz'), numeric: true, cell: (r) => (r.avgQuiz === null ? '—' : `${r.avgQuiz}%`) },
              {
                key: 'cert',
                header: t('courseAdmin.report.certificate'),
                cell: (r) =>
                  r.certificate ? (
                    <span className="inline-flex items-center gap-1 text-sm font-semibold text-success-fg">
                      <Award className="size-4" aria-hidden />
                      {t('courseAdmin.report.yes')}
                    </span>
                  ) : (
                    <span className="text-sm text-muted">{t('courseAdmin.report.no')}</span>
                  ),
              },
              { key: 'activity', header: t('courseAdmin.report.lastActivity'), hideBelow: 'lg', cell: (r) => (r.lastActivityAt ? date(r.lastActivityAt) : t('courseAdmin.report.never')) },
            ]}
          />
        </>
      )}
    </div>
  );
}
