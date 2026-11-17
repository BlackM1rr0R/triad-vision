import { prisma } from '../../db.js';
import { READY_TEXTS, PROFILE_TEXTS, type ReadyLocale } from './texts.js';
import { readinessBands, readinessProfile } from './service.js';

/**
 * Extra rows of the employer one-pager PDF (lib/onePager) — ONLY with the client's READINESS_PROFILE consent
 * (no consent → no rows). Own worker: the readiness card; pool candidate: the anonymous bands.
 */

type Row = { label: string; value: string };

export const workerReadinessRows = async (caseId: string, locale: ReadyLocale): Promise<Row[]> => {
  const c = await prisma.case.findUnique({ where: { id: caseId }, select: { clientId: true } });
  if (!c) return [];
  const p = await readinessProfile(c.clientId);
  if (!p) return [];
  const T = PROFILE_TEXTS[locale];
  const L = READY_TEXTS[locale];
  const rows: Row[] = [
    { label: T.readiness, value: `${p.readinessScore} / 100` },
    { label: T.german, value: [p.germanLevel ?? '—', p.mockExam ? T.mock(p.mockExam.level, p.mockExam.percent) : null].filter(Boolean).join(' · ') },
    { label: T.ready, value: p.germanyReady ? `${L.level[p.germanyReady]} (${L.kicker})` : T.readyNo },
  ];
  if (p.workScene) rows.push({ label: T.scene, value: p.workScene.percent !== null ? `${p.workScene.percent} %` : T.no });
  rows.push({ label: T.interview, value: p.interviewPractised ? T.yes : T.no });
  return rows;
};

export const poolReadinessRows = async (userId: string, locale: ReadyLocale): Promise<Row[]> => {
  const b = await readinessBands(userId);
  if (!b) return [];
  const T = PROFILE_TEXTS[locale];
  return [
    { label: T.band, value: b.readinessBand },
    { label: T.practice, value: b.practiceBand },
    { label: T.ready, value: b.germanyReady ? T.readyYes : T.readyNo },
  ];
};
