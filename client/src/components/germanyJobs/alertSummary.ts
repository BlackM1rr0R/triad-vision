import { useTranslation } from 'react-i18next';
import type { GermanyJobAlertView } from '@/lib/germanyJobs';

type AlertSearch = GermanyJobAlertView['search'];

/** One-line summary of an alert's search in the page language ("„Koch“, Berlin (+25 km), remote"). */
export const useAlertSummary = () => {
  const { t } = useTranslation();
  return (s: AlertSearch) => {
    const parts = [s.q ? `„${s.q}“` : t('gjAlert.summary.anyJob')];
    if (s.type === 'ausbildung') parts.push('Ausbildung');
    if (s.where) parts.push(s.radius ? `${s.where} (+${s.radius} km)` : s.where);
    if (s.time === 'full') parts.push(t('gjAlert.summary.full'));
    if (s.time === 'part') parts.push(t('gjAlert.summary.part'));
    if (s.remote) parts.push(t('gjAlert.summary.remote'));
    if (s.visa) parts.push(t('gjAlert.summary.visa'));
    return parts.join(', ');
  };
};
