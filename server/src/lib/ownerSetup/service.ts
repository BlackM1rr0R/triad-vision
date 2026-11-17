import { prisma } from '../../db.js';
import { badRequest, notFound } from '../http.js';
import { getGoogleReviewSettings } from '../googleReview/service.js';
import { avvApproved, getAvvSettings, getTrustSettings } from '../trust/settings.js';
import { EMPLOYER_FORM_KEY } from '../officialForms/service.js';
import { listFreshness } from '../dataFreshness/service.js';
import { gscConfig } from '../searchConsole.js';
import { SETUP_ITEMS, evaluateSetup, type SetupSignal } from './items.js';

/**
 * Owner setup checklist (/api/admin/setup-checklist, ADMIN+): auto signals read from the settings and the database
 * (each one isolated: a failing check is just "open"), manual marks in OwnerSetupMark.
 */

const safe = async (fn: () => Promise<SetupSignal>): Promise<SetupSignal> => {
  try {
    return await fn();
  } catch {
    return { ok: false };
  }
};

export const setupSignals = async (now = new Date()): Promise<Record<string, SetupSignal>> => {
  const [googleReview, avv, trust, past, ezb, tv, study, fresh, gsc] = await Promise.all([
    safe(async () => {
      const s = await getGoogleReviewSettings();
      const link = !!(s.url || s.placeId);
      return { ok: link && s.enabled, detail: { link, enabled: s.enabled } };
    }),
    safe(async () => ({ ok: avvApproved(await getAvvSettings()) })),
    safe(async () => {
      const t = await getTrustSettings();
      const missing = [
        !t.dataLocation || !t.dataLocationConfirmed ? 'dataLocation' : null,
        !t.backupLocation ? 'backupLocation' : null,
        !t.securityEmail ? 'securityEmail' : null,
      ].filter((x): x is string => !!x);
      return { ok: missing.length === 0, detail: { missing: missing.join(',') } };
    }),
    safe(async () => {
      const n = await prisma.pastPlacement.count();
      return { ok: n > 0, detail: { count: n } };
    }),
    safe(async () => {
      const n = await prisma.officialFormTemplate.count({ where: { key: EMPLOYER_FORM_KEY, active: true } });
      return { ok: n > 0 };
    }),
    safe(async () => {
      const n = await prisma.tvDisplayToken.count({ where: { revokedAt: null } });
      return { ok: n > 0, detail: { count: n } };
    }),
    safe(async () => {
      const [drafts, total] = await Promise.all([prisma.studyProgramme.count({ where: { published: false } }), prisma.studyProgramme.count()]);
      return { ok: drafts === 0, detail: { drafts, total } };
    }),
    safe(async () => {
      const { items } = await listFreshness(now);
      const overdue = items.filter((i) => i.status === 'overdue').length;
      return { ok: overdue === 0, detail: { overdue } };
    }),
    safe(async () => {
      const c = gscConfig();
      return c.configured ? { ok: true } : { ok: false, detail: { reason: c.reason } };
    }),
  ]);
  return { googleReview, avvApproved: avv, trustCenter: trust, pastPlacements: past, ezbPdf: ezb, tvToken: tv, studyProgrammes: study, dataFreshness: fresh, searchConsole: gsc };
};

export const setupChecklist = async (now = new Date()) => {
  const [signals, marks] = await Promise.all([setupSignals(now), prisma.ownerSetupMark.findMany()]);
  return evaluateSetup(signals, marks);
};

/** state: 'done' (manual items only) | 'notNeeded' | null (remove the mark). */
export const markSetupItem = async (itemId: string, state: 'done' | 'notNeeded' | null, note: string | null, by: { id: string; name: string }) => {
  const item = SETUP_ITEMS.find((i) => i.id === itemId);
  if (!item) throw notFound('ITEM_NOT_FOUND');
  if (state === 'done' && item.kind === 'auto') throw badRequest('AUTO_ITEM');
  if (state === null) await prisma.ownerSetupMark.deleteMany({ where: { itemId } });
  else
    await prisma.ownerSetupMark.upsert({
      where: { itemId },
      create: { itemId, state, note, markedById: by.id, markedByName: by.name },
      update: { state, note, markedById: by.id, markedByName: by.name, markedAt: new Date() },
    });
  return setupChecklist();
};
