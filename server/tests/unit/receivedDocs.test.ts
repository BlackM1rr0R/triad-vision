import { describe, expect, it } from 'vitest';
import { groupReceived, isReceivedDoc, newCountOf, type RawDoc } from '../../src/lib/receivedDocs/logic.js';

const isAppointment = (n: string) => n.startsWith('Səfirlik görüşü — təsdiq');
let seq = 0;
const doc = (over: Partial<RawDoc> = {}): RawDoc => ({
  id: `d${++seq}`,
  originalName: `file${seq}.pdf`,
  mimeType: 'application/pdf',
  size: 100,
  createdAt: new Date('2026-11-26T10:00:00Z'),
  stage: 'OTHER',
  requirementId: null,
  uploaderRole: 'STAFF',
  ...over,
});

describe('isReceivedDoc (what may reach the client)', () => {
  it('accepts staff files without a requirement in the client stages', () => {
    for (const stage of ['OTHER', 'VISA', 'EMBASSY', 'CONTRACT']) expect(isReceivedDoc(doc({ stage }))).toBe(true);
    expect(isReceivedDoc(doc({ stage: 'CONTRACT_SIGNED', uploaderRole: 'CLIENT' }))).toBe(true);
  });
  it('rejects requirement files, client uploads, unknown stages and the internal embassy package', () => {
    expect(isReceivedDoc(doc({ requirementId: 'r1' }))).toBe(false);
    expect(isReceivedDoc(doc({ uploaderRole: 'CLIENT' }))).toBe(false);
    expect(isReceivedDoc(doc({ uploaderRole: null }))).toBe(false);
    expect(isReceivedDoc(doc({ stage: 'INITIAL' }))).toBe(false);
    expect(isReceivedDoc(doc({ originalName: 'TV-1_Botschaft_2026.pdf', stage: 'EMBASSY' }))).toBe(false);
  });
});

describe('groupReceived', () => {
  it('groups by send / contract file / appointment day / other day, newest first', () => {
    const a = doc({ id: 'a', createdAt: new Date('2026-11-26T10:00:00Z') });
    const b = doc({ id: 'b', createdAt: new Date('2026-11-26T10:00:01Z') });
    const appt = doc({ id: 'p', originalName: 'Səfirlik görüşü — təsdiq.pdf', createdAt: new Date('2026-12-11T08:00:00Z') });
    const signed = doc({ id: 's', stage: 'CONTRACT_SIGNED', uploaderRole: 'CLIENT', createdAt: new Date('2026-11-20T08:00:00Z') });
    const loose = doc({ id: 'o', createdAt: new Date('2026-11-25T08:00:00Z') });
    const groups = groupReceived({
      docs: [a, b, appt, signed, loose],
      sends: [{ id: 'send1', createdAt: new Date('2026-11-26T10:00:05Z'), documentIds: ['a', 'b'] }],
      seen: new Set(['s']),
      isAppointment,
    });
    expect(groups.map((g) => [g.kind, g.files.length])).toEqual([
      ['APPOINTMENT', 1],
      ['READY_DOCS', 2],
      ['OTHER', 1],
      ['CONTRACT_SIGNED', 1],
    ]);
    expect(groups[1].id).toBe('send:send1');
    expect(groups[3].newCount).toBe(0); // seen
    expect(newCountOf(groups)).toBe(4);
  });
  it('leaves out internal documents even when a send lists them', () => {
    const internal = doc({ id: 'i', requirementId: 'r' });
    const mine = doc({ id: 'm', uploaderRole: 'CLIENT' });
    const g = groupReceived({ docs: [internal, mine], sends: [{ id: 's', createdAt: new Date(), documentIds: ['i', 'm'] }], seen: new Set(), isAppointment });
    expect(g).toEqual([]);
  });
});
