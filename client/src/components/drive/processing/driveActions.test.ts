import { describe, expect, it } from 'vitest';
import { needsPartner } from '@/components/caseProcessing/flow';
import { driveFlowActions } from './icons';

describe('drive workflow actions', () => {
  it('never offers "Götür" (claim) in the documents section', () => {
    expect(driveFlowActions('WRITTEN', null, 'me')).toEqual(['work', 'return']);
    expect(driveFlowActions('WRITTEN', 'other', 'me')).toEqual(['work', 'return']);
    expect(driveFlowActions('IN_PROGRESS', 'me', 'me')).toEqual(['finish', 'back', 'return']);
    expect(driveFlowActions(null, null, 'me')).toEqual(['send', 'work']);
  });

  it('"return" (Anträge-yə qaytar) is offered from Schon geschrieben and In Bearbeitung', () => {
    expect(driveFlowActions('WRITTEN', null, 'me')).toContain('return');
    expect(driveFlowActions('IN_PROGRESS', null, 'me')).toContain('return');
  });

  it('entering the workflow needs a partner; a case already in it does not', () => {
    expect(needsPartner({ stage: null, hasPartner: false }, 'send')).toBe(true);
    expect(needsPartner({ stage: null, hasPartner: false }, 'work')).toBe(true);
    expect(needsPartner({ stage: null, hasPartner: true }, 'send')).toBe(false);
    expect(needsPartner({ stage: null }, 'send')).toBe(false); // unknown: the server decides
    expect(needsPartner({ stage: 'WRITTEN', hasPartner: false }, 'work')).toBe(false);
    expect(needsPartner({ stage: 'DONE', hasPartner: false }, 'return')).toBe(false);
  });
});
