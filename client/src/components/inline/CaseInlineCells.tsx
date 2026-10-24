import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api';
import type { CaseStatus } from '@/lib/types';
import { StatusBadge } from '@/components/admin/StatusBadge';
import { fullName, statusLabel } from '@/components/admin/labels';
import type { AdminCaseListItem, AdminCasesResponse, StaffMember } from '@/components/admin/types';
import { caseKey } from '@/components/admin/case/shared';
import { InlineSelect, type InlineOption } from './InlineSelect';
import { optimisticListEdit } from './optimistic';

/** The list answer carries the scalar assignedStaffId too (server spreads the case row). */
type Row = AdminCaseListItem & { assignedStaffId?: string | null };

const LIST_KEY = ['admin-cases'] as const;

const patchRows = (old: AdminCasesResponse, id: string, fn: (r: Row) => Row): AdminCasesResponse => ({
  ...old,
  items: old.items.map((r) => (r.id === id ? fn(r as Row) : r)),
});

export const useStaffOptions = () =>
  useQuery({
    queryKey: ['admin-staff'],
    queryFn: async () => (await api.get<{ staff: StaffMember[] }>('/admin/users/staff')).data.staff,
    staleTime: 5 * 60 * 1000,
  });

/** Responsible staff member, editable in place (PATCH /admin/cases/:id { assignedStaffId }). */
export const CaseAssigneeCell = ({ c, className }: { c: Row; className?: string }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: staff } = useStaffOptions();
  const current = c.assignedStaffId ?? '';
  const options: InlineOption[] = [
    { value: '', text: t('ux.inline.unassigned'), label: <span className="text-muted">{t('ux.inline.unassigned')}</span> },
    ...(staff ?? []).map((s) => ({ value: s.id, text: fullName(s), label: fullName(s) })),
  ];
  const save = (value: string) => {
    const member = staff?.find((s) => s.id === value) ?? null;
    return optimisticListEdit<AdminCasesResponse>({
      qc,
      queryKey: LIST_KEY,
      update: (old) => patchRows(old, c.id, (r) => ({ ...r, assignedStaffId: value || null, assignedStaff: member ? { firstName: member.firstName, lastName: member.lastName } : null })),
      request: () => api.patch(`/admin/cases/${c.id}`, { assignedStaffId: value || null }),
      success: member ? t('ux.inline.assigned', { name: fullName(member) }) : t('ux.inline.unassignedToast'),
      invalidate: [caseKey(c.id), ['admin-dashboard']],
    });
  };
  return (
    <InlineSelect
      label={t('ux.inline.assignee')}
      value={current}
      options={staff ? options : []}
      rowId={c.id}
      field="assignee"
      primary
      className={className}
      onSave={save}
      display={<span className="whitespace-nowrap text-ink/80">{c.assignedStaff ? fullName(c.assignedStaff) : <span className="text-muted">{t('admin.cases.unassigned')}</span>}</span>}
    />
  );
};

/** Status changes that need no extra input, via the existing transition endpoint (POST /admin/cases/:id/actions). */
const QUICK_TRANSITIONS: Partial<Record<CaseStatus, { to: CaseStatus; action: 'CONFIRM_CONTRACT' | 'MARK_LODGED'; hintKey: string }[]>> = {
  CONTRACT_SIGNED: [{ to: 'EMBASSY_DOCUMENTS', action: 'CONFIRM_CONTRACT', hintKey: 'ux.inline.confirmContract' }],
  APPOINTMENT_SCHEDULED: [{ to: 'DECISION_PENDING', action: 'MARK_LODGED', hintKey: 'ux.inline.markLodged' }],
};

/** Case status: the allowed one-click transition in place; everything else stays on the case page. */
export const CaseStatusCell = ({ c }: { c: Row }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const moves = QUICK_TRANSITIONS[c.status] ?? [];
  const options: InlineOption[] = moves.length
    ? [
        { value: c.status, text: statusLabel(c.status), label: statusLabel(c.status), hint: t('ux.inline.current') },
        ...moves.map((m) => ({ value: m.to, text: statusLabel(m.to), label: statusLabel(m.to), hint: t(m.hintKey) })),
      ]
    : [];
  const save = (value: string) => {
    const m = moves.find((x) => x.to === value);
    if (!m) return;
    return optimisticListEdit<AdminCasesResponse>({
      qc,
      queryKey: LIST_KEY,
      update: (old) => patchRows(old, c.id, (r) => ({ ...r, status: m.to, daysInStatus: 0, statusSince: new Date().toISOString() })),
      request: () => api.post(`/admin/cases/${c.id}/actions`, { action: m.action }),
      success: t('ux.inline.statusChanged', { status: statusLabel(m.to) }),
      invalidate: [caseKey(c.id), ['admin-dashboard']],
    });
  };
  return (
    <InlineSelect
      label={t('ux.inline.status')}
      value={c.status}
      options={options}
      rowId={c.id}
      field="status"
      disabledHint={t('ux.inline.noTransition')}
      onSave={save}
      display={<StatusBadge status={c.status} />}
    />
  );
};
