import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KpiCard } from './KpiCard';
import { bakuMonth, useStaffKpi } from './api';

/** Workspace → Komanda → KPI-m: the signed-in staff member's own KPI card (with the team average for context). */
export default function MyKpi() {
  const { t } = useTranslation();
  const [month, setMonth] = useState(bakuMonth());
  const q = useStaffKpi('me', month);
  return <KpiCard title={t('team.kpi.myTitle')} data={q.data} isLoading={q.isLoading} error={q.error} onRetry={() => q.refetch()} month={month} onMonth={setMonth} />;
}
