import type { CaseDetail } from '@/lib/types';
import type { CaseStats } from '../../types';
import type { GoTo } from '../CaseTopBar';

/** Props every case tab gets from the page. */
export interface CaseTabProps {
  c: CaseDetail;
  stats: CaseStats;
  /** ADMIN or SUPER_ADMIN (profitability, access log). */
  isAdmin: boolean;
  goTo: GoTo;
}
