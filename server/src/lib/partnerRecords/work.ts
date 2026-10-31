import type { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import type { WorkAction } from '../myWork.js';
import { dayOf, todayOf } from './contracts.js';
import { reminderDue } from './reminders.js';
import { ownerLink, ownerOfRow } from './owner.js';

/**
 * "My work today" source (lib/myWork.ts kind `partner_contract`): active employer / partner contracts whose end
 * date — or notice deadline — is within their reminder lead time (or past). Mine = contracts the viewer created;
 * ADMIN+ also see contracts without a creator; scope=all shows every contract. Items only link to the profile.
 */

const DAY = 24 * 60 * 60 * 1000;
const LIMIT = 25;

export const partnerContractWork = async (scope: { team: boolean; viewerId: string; isAdmin: boolean }, now: Date) => {
  const today = todayOf(now);
  const where: Prisma.PartnerContractWhereInput = {
    status: 'ACTIVE',
    endDate: { not: null, lte: new Date(today.getTime() + 400 * DAY) },
    ...(scope.team ? {} : scope.isAdmin ? { OR: [{ createdById: scope.viewerId }, { createdById: null }] } : { createdById: scope.viewerId }),
  };
  const rows = await prisma.partnerContract.findMany({ where, orderBy: { endDate: 'asc' }, take: 500 });
  const due = rows
    .map((c) => ({ c, d: reminderDue({ ...c, reminderSentAt: null }) }))
    .filter((x): x is { c: (typeof rows)[number]; d: NonNullable<ReturnType<typeof reminderDue>> } => !!x.d && x.d.remindFrom <= today)
    .sort((a, b) => a.d.deadline.getTime() - b.d.deadline.getTime());
  const companyIds = [...new Set(due.map((x) => x.c.companyId).filter((x): x is string => !!x))];
  const partnerIds = [...new Set(due.map((x) => x.c.referralPartnerId).filter((x): x is string => !!x))];
  const [companies, partners] = await Promise.all([
    companyIds.length ? prisma.company.findMany({ where: { id: { in: companyIds } }, select: { id: true, name: true } }) : [],
    partnerIds.length ? prisma.referralPartner.findMany({ where: { id: { in: partnerIds } }, select: { id: true, name: true, companyName: true } }) : [],
  ]);
  const nameOf = new Map<string, string>([...companies.map((c) => [c.id, c.name] as const), ...partners.map((p) => [p.id, p.companyName?.trim() || p.name] as const)]);
  return {
    kind: 'partner_contract' as const,
    total: due.length,
    items: due.slice(0, LIMIT).map(({ c, d }) => {
      const owner = ownerOfRow(c);
      const href = ownerLink(owner, 'contracts');
      const left = Math.round((d.deadline.getTime() - today.getTime()) / DAY);
      return {
        id: `partner_contract:${c.id}`,
        kind: 'partner_contract' as const,
        title: nameOf.get(owner.companyId ?? owner.referralPartnerId!) ?? c.title,
        subtitle: [c.title, dayOf(c.endDate)?.split('-').reverse().join('.')].filter(Boolean).join(' · ') || null,
        note: { key: `partnerContract.${d.kind}`, params: { days: left, autoRenew: c.autoRenew ? 1 : 0 } },
        priority: (left <= 7 ? 'HIGH' : 'NORMAL') as 'HIGH' | 'NORMAL',
        dueAt: d.deadline,
        since: d.remindFrom,
        link: href,
        refs: { contractId: c.id, companyId: c.companyId, referralPartnerId: c.referralPartnerId },
        assignee: null,
        actions: [{ key: 'open', label: 'open', type: 'link', href, primary: true } satisfies WorkAction],
      };
    }),
  };
};
