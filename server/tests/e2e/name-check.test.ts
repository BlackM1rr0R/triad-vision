import type { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { asClient, asStaff } from '../helpers/api';
import { prisma } from '../helpers/db';
import { clientCase, createCaseVia, expectStatus, uploadDoc } from '../helpers/workflow';

describe('name transliteration checker', () => {
  it('typed Azerbaijani name → MRZ / other spellings, compared with the passport MRZ on file (client and staff)', async () => {
    const client = await asClient({ firstName: 'Elvin', lastName: 'Mamedov' });
    const c = await createCaseVia(client.agent);

    // Nothing on file yet: the forms only.
    const before = expectStatus(await client.agent.post('/api/name-check').send({ firstName: 'Elvin', lastName: 'Məmmədov' }), 200).body;
    expect(before.onFile).toBeNull();
    expect(before.analysis.lastName[0]).toMatchObject({ variant: 'mrz', display: 'MAMMADOV' });
    expect(before.analysis.mrzField.field.startsWith('MAMMADOV<<ELVIN<')).toBe(true);
    expect(before.analysis.comparison).toBeNull();

    const req = (await clientCase(client.agent, c.id)).requirements.find((r) => (r as unknown as { key: string }).key === 'PASSPORT')!;
    const doc = expectStatus(await uploadDoc(client.agent, c.id, req.id, 'passport.pdf'), 201).body.document as { id: string };
    const mrz = { surname: 'MAMMADOV', givenNames: 'ELVIN', valid: true, documentNumber: 'C01234567' };
    await prisma.document.update({ where: { id: doc.id }, data: { ocr: { mrz, raw: 'x', confidence: 90, at: new Date().toISOString() } as unknown as Prisma.InputJsonValue, ocrAt: new Date() } });

    const ok = expectStatus(await client.agent.post('/api/name-check').send({ firstName: 'Elvin', lastName: 'Məmmədov' }), 200).body;
    expect(ok.onFile).toMatchObject({ surname: 'MAMMADOV', givenNames: 'ELVIN', valid: true });
    expect(ok.analysis.comparison.status).toBe('exact');
    // The profile says "Mamedov": same person, different spelling → warning.
    expect(ok.profileComparison).toMatchObject({ status: 'spelling', surname: 'spelling' });

    const wrong = expectStatus(await client.agent.post('/api/name-check').send({ firstName: 'Rəşad', lastName: 'Hüseynov', caseId: c.id }), 200).body;
    expect(wrong.analysis.comparison.status).toBe('mismatch');

    // Someone else's case is not visible; staff see the case.
    const stranger = await asClient();
    expect((await stranger.agent.post('/api/name-check').send({ firstName: 'Elvin', lastName: 'Məmmədov', caseId: c.id })).status).toBe(404);
    const staff = await asStaff();
    const s = expectStatus(await staff.agent.post('/api/name-check').send({ firstName: 'Elvin', lastName: 'Məmmədov', caseId: c.id }), 200).body;
    expect(s.onFile.surname).toBe('MAMMADOV');
    expect(s.profile).toMatchObject({ firstName: 'Elvin', lastName: 'Mamedov' });
    expect((await staff.agent.post('/api/name-check').send({ firstName: 'x'.repeat(200) })).status).toBe(400);
  });
});
