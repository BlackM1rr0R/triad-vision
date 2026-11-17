import { describe, expect, it } from 'vitest';
import type { CaseStatus } from '@prisma/client';
import {
  buildOverview,
  countItems,
  requirementStatus,
  stageShare,
  visibleProcessingStage,
  waitingForContract,
  type OverviewInput,
  type RequirementFact,
} from '../../src/lib/docProgress/build.js';
import { PROCESSING_COPY, processingLabel } from '../../src/lib/docProgress/texts.js';

const D = (s: string) => new Date(`2026-${s}T09:00:00Z`);
const t = (s: string) => ({ az: `${s} az`, de: `${s} de`, en: `${s} en`, ru: `${s} ru` });
const req = (id: string, stage: 'INITIAL' | 'EMBASSY', docs: ('PENDING' | 'ACCEPTED' | 'REJECTED')[], over: Partial<RequirementFact> = {}): RequirementFact => ({
  id,
  stage,
  key: id.toUpperCase(),
  title: t(id),
  required: true,
  documents: docs.map((status, i) => ({ status, createdAt: D(`10-0${i + 1}`) })),
  uploadable: false,
  ...over,
});

const STEP_FOR: Record<string, number> = { DOCUMENTS_PENDING: 0, DOCUMENTS_REVIEW: 0, CONTRACT_SENT: 1, CONTRACT_SIGNED: 1, EMBASSY_DOCUMENTS: 2, EMBASSY_REVIEW: 2, APPOINTMENT_SCHEDULED: 3, DECISION_PENDING: 4 };
const steps = (status: CaseStatus): OverviewInput['steps'] => {
  const cur = STEP_FOR[status] ?? (status === 'CANCELLED' ? -1 : 5);
  return (['DOCUMENTS', 'CONTRACT', 'EMBASSY', 'APPOINTMENT', 'DECISION'] as const).map((key, i) => ({
    key,
    status: i < cur ? 'done' : i === cur ? 'current' : 'upcoming',
    enteredAt: i <= cur ? D(`09-${10 + i}`) : null,
    leftAt: i < cur ? D(`09-${11 + i}`) : null,
    expectedFrom: null,
    expectedTo: null,
  }));
};

const input = (status: CaseStatus, over: Partial<OverviewInput> = {}): OverviewInput => ({
  caseId: 'c1',
  number: 'TV-2026-0001',
  status,
  visaType: 'WORK',
  steps: steps(status),
  closedAt: null,
  decisionAt: null,
  requirements: [],
  embassyPreview: null,
  processing: { stage: null, at: null },
  ...over,
});

describe('docProgress: requirement status and counts', () => {
  it('derives one status per requirement from its files', () => {
    expect(requirementStatus([])).toBe('MISSING');
    expect(requirementStatus([{ status: 'REJECTED' }, { status: 'ACCEPTED' }])).toBe('ACCEPTED');
    expect(requirementStatus([{ status: 'REJECTED' }, { status: 'PENDING' }])).toBe('PENDING');
    expect(requirementStatus([{ status: 'REJECTED' }])).toBe('REJECTED');
  });

  it('counts per status and the required / accepted pair', () => {
    const c = countItems([
      { status: 'MISSING', required: true },
      { status: 'PENDING', required: true },
      { status: 'ACCEPTED', required: true },
      { status: 'ACCEPTED', required: false },
      { status: 'REJECTED', required: true },
    ]);
    expect(c).toEqual({ total: 5, missing: 1, pending: 1, accepted: 2, rejected: 1, required: 4, requiredAccepted: 1 });
    expect(stageShare([{ status: 'ACCEPTED', required: true }, { status: 'MISSING', required: true }, { status: 'ACCEPTED', required: false }])).toBe(0.5);
    expect(stageShare([])).toBe(0);
  });
});

describe('docProgress: overview', () => {
  it('builds steps, documents per stage and a percentage for an early case', () => {
    const o = buildOverview(
      input('DOCUMENTS_PENDING', {
        requirements: [req('passport', 'INITIAL', ['ACCEPTED'], { uploadable: true }), req('photo', 'INITIAL', [], { uploadable: true }), req('cv', 'INITIAL', ['REJECTED'], { uploadable: true })],
        embassyPreview: [{ key: 'VIDEX', title: t('videx'), required: true }],
      }),
    );
    expect(o.steps.map((s) => [s.key, s.state])).toEqual([
      ['documents', 'current'],
      ['contract', 'upcoming'],
      ['embassyDocs', 'upcoming'],
      ['appointment', 'upcoming'],
      ['decision', 'upcoming'],
      ['result', 'upcoming'],
    ]);
    expect(o.documents.map((d) => [d.stage, d.preview, d.uploadOpen])).toEqual([
      ['INITIAL', false, true],
      ['EMBASSY', true, false],
    ]);
    expect(o.documents[0].counts).toMatchObject({ total: 3, missing: 1, accepted: 1, rejected: 1 });
    expect(o.documents[0].items[0]).toMatchObject({ id: 'passport', status: 'ACCEPTED', uploadedAt: D('10-01') });
    expect(o.documents[1].items[0]).toMatchObject({ id: null, key: 'VIDEX', status: 'MISSING', uploadable: false });
    // (0.1 + 0.5 * (1 + 0 + 0.2) / 3) / 6 → 5 %
    expect(o.percent).toBe(5);
    expect(o.processing).toBeNull();
    expect(o.embassyCollection).toBeNull();
  });

  it('shows the embassy collection card while the client waits for the contract (information only before the embassy step)', () => {
    const preview = [{ key: 'VIDEX', title: t('videx'), required: true }, { key: 'ACCOMMODATION', title: t('flat'), required: false }];
    const initial = [req('passport', 'INITIAL', ['ACCEPTED'])];
    for (const status of ['CONTRACT_SENT', 'CONTRACT_SIGNED'] as const) {
      const o = buildOverview(input(status, { requirements: initial, embassyPreview: preview }));
      expect(o.embassyCollection).toMatchObject({ uploadOpen: false, preview: true, counts: { total: 2, missing: 2, required: 1 } });
    }
    // Review with all required initial documents accepted: the contract is next.
    expect(buildOverview(input('DOCUMENTS_REVIEW', { requirements: initial, embassyPreview: preview })).embassyCollection).not.toBeNull();
    // Still in review with one pending: not yet.
    expect(buildOverview(input('DOCUMENTS_REVIEW', { requirements: [...initial, req('cv', 'INITIAL', ['PENDING'])], embassyPreview: preview })).embassyCollection).toBeNull();
    // The embassy step itself has its own upload list (no "collecting" card).
    expect(buildOverview(input('EMBASSY_DOCUMENTS', { requirements: [...initial, req('videx', 'EMBASSY', [], { uploadable: true })] })).embassyCollection).toBeNull();
    // Existing EMBASSY rows (a case sent back) are used instead of the preview; a rejected one may be replaced.
    const back = buildOverview(input('CONTRACT_SIGNED', { requirements: [...initial, req('videx', 'EMBASSY', ['REJECTED'], { uploadable: true })], embassyPreview: preview }));
    expect(back.embassyCollection).toMatchObject({ uploadOpen: true, preview: false, counts: { total: 1, rejected: 1 } });
    expect(waitingForContract('DOCUMENTS_PENDING', [{ status: 'ACCEPTED', required: true }])).toBe(false);
  });

  it('percentages grow along the way and end at 100', () => {
    const p = (s: CaseStatus) => buildOverview(input(s)).percent!;
    const order: CaseStatus[] = ['DOCUMENTS_PENDING', 'DOCUMENTS_REVIEW', 'CONTRACT_SENT', 'CONTRACT_SIGNED', 'EMBASSY_DOCUMENTS', 'EMBASSY_REVIEW', 'APPOINTMENT_SCHEDULED', 'DECISION_PENDING'];
    const values = order.map(p);
    for (let i = 1; i < values.length; i++) expect(values[i]).toBeGreaterThan(values[i - 1]);
    expect(values.at(-1)).toBeLessThan(100);
    const approved = buildOverview(input('APPROVED', { decisionAt: D('11-01') }));
    expect(approved.percent).toBe(100);
    expect(approved.steps.at(-1)).toMatchObject({ key: 'result', state: 'done', enteredAt: D('11-01') });
    expect(buildOverview(input('CANCELLED')).percent).toBeNull();
  });
});

describe('docProgress: team stage (informational)', () => {
  it('maps the stored stage to the German word + translation, without anything else', () => {
    const at = D('10-15');
    const o = buildOverview(input('EMBASSY_REVIEW', { processing: { stage: 'DONE', at } }));
    expect(o.processing).toEqual({
      stage: 'DONE',
      word: 'Fertig',
      label: processingLabel('DONE'),
      meaning: PROCESSING_COPY.DONE.meaning,
      explanation: PROCESSING_COPY.DONE.explanation,
      tone: 'success',
      at,
    });
    expect(processingLabel('DONE')).toEqual({ az: 'Fertig — hazırdır', de: 'Fertig', en: 'Fertig — ready', ru: 'Fertig — готово' });
    expect(processingLabel('WRITTEN').az).toBe('Schon geschrieben — artıq yazılıb');
    expect(processingLabel('REFUSED').az).toBe('Ablehnung — imtina');
  });

  it('a refused case shows Ablehnung, an approved one never does, unknown values are dropped', () => {
    expect(visibleProcessingStage('REJECTED', null)).toBe('REFUSED');
    expect(visibleProcessingStage('APPROVED', 'REFUSED')).toBeNull();
    expect(visibleProcessingStage('DECISION_PENDING', 'REFUSED')).toBe('REFUSED');
    expect(visibleProcessingStage('DOCUMENTS_REVIEW', 'WRITTEN')).toBe('WRITTEN');
    expect(visibleProcessingStage('DOCUMENTS_REVIEW', 'toString')).toBeNull();
    expect(visibleProcessingStage('DOCUMENTS_REVIEW', null)).toBeNull();
  });
});
