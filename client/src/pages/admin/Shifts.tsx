import { useTranslation } from 'react-i18next';
import { usePageTitle } from '@/lib/usePageTitle';
import { registerCopy } from '@/i18n';
import { pagesTeam } from '@/i18n/pagesTeam';
import { PageHead } from '@/components/admin/ui';
import { ShiftCalendar } from '@/components/team/ShiftCalendar';

registerCopy(pagesTeam);

/** Admin → Növbələr: the team calendar (shifts, leave, handovers, coverage). Same component as the workspace tab. */
export default function AdminShifts() {
  const { t } = useTranslation();
  usePageTitle(t('team.shifts.pageTitle'));
  return (
    <div className="space-y-4">
      <PageHead title={t('team.shifts.pageTitle')} subtitle={t('team.shifts.pageSubtitle')} />
      <ShiftCalendar />
    </div>
  );
}
