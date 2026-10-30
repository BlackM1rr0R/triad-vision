import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { api } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesAdminUx } from '@/i18n/pagesAdminUx';
import { useJobLabels } from '@/components/jobs/labels';
import { VACANCY_STATUS_TONE, type VacancyStatus } from '@/components/jobs/types';
import { InlineSelect, type InlineOption } from './InlineSelect';
import { optimisticListEdit } from './optimistic';

registerCopy(pagesAdminUx);

type Page = { items: { id: string; status: VacancyStatus }[] };

/**
 * Vacancy status in the list, editable in place through the existing transition endpoints only:
 * publish (POST /approve → OPEN) and close (POST /close → CLOSED). Sending back with a reason stays in the drawer.
 */
export const VacancyStatusCell = ({ id, status }: { id: string; status: VacancyStatus }) => {
  const { t } = useTranslation();
  const L = useJobLabels();
  const qc = useQueryClient();
  const moves: { to: VacancyStatus; path: 'approve' | 'close'; hint: string }[] = [];
  if (status !== 'OPEN') moves.push({ to: 'OPEN', path: 'approve', hint: t('ux.inline.vacancyPublish') });
  if (status !== 'CLOSED') moves.push({ to: 'CLOSED', path: 'close', hint: t('ux.inline.vacancyClose') });
  const options: InlineOption[] = [
    { value: status, text: L.vacancyStatus(status), label: L.vacancyStatus(status), hint: t('ux.inline.current') },
    ...moves.map((m) => ({ value: m.to, text: L.vacancyStatus(m.to), label: L.vacancyStatus(m.to), hint: m.hint })),
  ];
  const save = (value: string) => {
    const m = moves.find((x) => x.to === value);
    if (!m) return;
    return optimisticListEdit<Page>({
      qc,
      queryKey: ['admin-vacancies'],
      update: (old) => ({ ...old, items: old.items.map((v) => (v.id === id ? { ...v, status: m.to } : v)) }),
      request: () => api.post(`/admin/vacancies/${id}/${m.path}`),
      success: t('ux.inline.statusChanged', { status: L.vacancyStatus(m.to) }),
      // "Geri al" only between published and closed (the reverse transition exists); a draft is not sent back.
      undo: status === 'OPEN' || status === 'CLOSED' ? () => api.post(`/admin/vacancies/${id}/${status === 'OPEN' ? 'approve' : 'close'}`) : undefined,
      invalidate: [['admin-vacancy', id]],
    });
  };
  return (
    <InlineSelect
      label={t('ux.inline.status')}
      value={status}
      options={options}
      rowId={id}
      field="status"
      primary
      onSave={save}
      display={<span className={clsx('badge', VACANCY_STATUS_TONE[status])}>{L.vacancyStatus(status)}</span>}
    />
  );
};
