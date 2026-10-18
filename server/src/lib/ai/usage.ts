import { prisma } from '../../db.js';
import { getAiSettings, resolveApiKey } from './settings.js';
import { getKeyInfo } from './openrouter.js';
import { monthSpentUsd } from './limits.js';

/** Data for the usage dashboard on /admin/ai/settings (UTC days). */
export const usageReport = async (days = 30) => {
  const since = new Date(Date.now() - (days - 1) * 86_400_000);
  since.setUTCHours(0, 0, 0, 0);

  const perDay = await prisma.$queryRaw<{ d: Date | string; scope: 'CLIENT' | 'ADMIN'; cost: unknown; msgs: unknown; tin: unknown; tout: unknown }[]>`
    SELECT DATE(m.createdAt) AS d, c.scope AS scope, SUM(m.costMicros) AS cost, SUM(m.role = 'user') AS msgs,
           SUM(m.tokensIn) AS tin, SUM(m.tokensOut) AS tout
    FROM AiMessage m JOIN AiConversation c ON c.id = m.conversationId
    WHERE m.createdAt >= ${since}
    GROUP BY DATE(m.createdAt), c.scope`;

  const top = await prisma.$queryRaw<{ userId: string; scope: 'CLIENT' | 'ADMIN'; cost: unknown; msgs: unknown }[]>`
    SELECT c.userId AS userId, c.scope AS scope, SUM(m.costMicros) AS cost, SUM(m.role = 'user') AS msgs
    FROM AiMessage m JOIN AiConversation c ON c.id = m.conversationId
    WHERE m.createdAt >= ${since}
    GROUP BY c.userId, c.scope
    ORDER BY cost DESC
    LIMIT 10`;

  const n = (v: unknown) => Number(v ?? 0) || 0;
  const dayKey = (d: Date | string) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));

  const dayMap = new Map<string, { date: string; clientUsd: number; adminUsd: number; messages: number }>();
  for (let i = 0; i < days; i++) {
    const date = new Date(since.getTime() + i * 86_400_000).toISOString().slice(0, 10);
    dayMap.set(date, { date, clientUsd: 0, adminUsd: 0, messages: 0 });
  }
  const byScope = { CLIENT: { costUsd: 0, messages: 0, tokensIn: 0, tokensOut: 0 }, ADMIN: { costUsd: 0, messages: 0, tokensIn: 0, tokensOut: 0 } };
  for (const r of perDay) {
    const row = dayMap.get(dayKey(r.d));
    const usd = n(r.cost) / 1e6;
    if (row) {
      if (r.scope === 'ADMIN') row.adminUsd += usd;
      else row.clientUsd += usd;
      row.messages += n(r.msgs);
    }
    const s = byScope[r.scope] ?? byScope.CLIENT;
    s.costUsd += usd;
    s.messages += n(r.msgs);
    s.tokensIn += n(r.tin);
    s.tokensOut += n(r.tout);
  }

  const users = await prisma.user.findMany({
    where: { id: { in: [...new Set(top.map((t) => t.userId))] } },
    select: { id: true, firstName: true, lastName: true, email: true, role: true },
  });
  const byId = new Map(users.map((u) => [u.id, u]));

  const settings = await getAiSettings();
  const key = await getKeyInfo(resolveApiKey(settings));
  return {
    days: [...dayMap.values()],
    byScope,
    topUsers: top.map((t) => {
      const u = byId.get(t.userId);
      return { userId: t.userId, name: u ? `${u.firstName} ${u.lastName}`.trim() : '—', email: u?.email ?? null, role: u?.role ?? null, scope: t.scope, costUsd: n(t.cost) / 1e6, messages: n(t.msgs) };
    }),
    month: { spentUsd: await monthSpentUsd(), budgetUsd: settings.monthlyBudgetUsd },
    key: key ? { limitUsd: key.limit, remainingUsd: key.limitRemaining, usageUsd: key.usage, usageMonthlyUsd: key.usageMonthly } : null,
  };
};
