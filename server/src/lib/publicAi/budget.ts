import { getAiSettings } from '../ai/settings.js';
import { monthSpentUsd } from '../ai/limits.js';
import { publicUsageMonth, publicUsageToday } from './usage.js';

export type PublicAiBusy = 'DISABLED' | 'DAILY_CAP' | 'MONTHLY_BUDGET';

/**
 * Null when anonymous AI (site advisor, quiz explanation, the offline live-chat answers) may be used now:
 * the advisor is switched on, today's public spend is below settings.publicDailyUsd and the public spend
 * plus the rest of the month stays inside the monthly budget.
 */
export const publicBudget = async (): Promise<PublicAiBusy | null> => {
  const s = await getAiSettings();
  if (!s.publicAdvisorEnabled) return 'DISABLED';
  const [today, month, spent] = await Promise.all([publicUsageToday(), publicUsageMonth(), monthSpentUsd()]);
  if (today.usd >= s.publicDailyUsd) return 'DAILY_CAP';
  if (spent + month.usd >= s.monthlyBudgetUsd) return 'MONTHLY_BUDGET';
  return null;
};
