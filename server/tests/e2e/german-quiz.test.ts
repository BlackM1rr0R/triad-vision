import { describe, expect, it } from 'vitest';
import { asClient, asStaff } from '../helpers/api';
import { prisma } from '../helpers/db';
import { expectStatus } from '../helpers/workflow';
import { germanVocabulary, seedGermanVocabulary } from '../../prisma/seed/germanVocabulary.js';

type Question = { wordId: string; word: string; options: string[]; answer: number };

describe('German vocabulary quiz per profession', () => {
  it('10 multiple-choice questions from the ELECTRICAL words, in the asked language; clients only', async () => {
    await seedGermanVocabulary(prisma);
    const electrical = germanVocabulary.filter((w) => w.field === 'ELECTRICAL');
    expect(await prisma.germanWord.count({ where: { field: 'ELECTRICAL' } })).toBe(electrical.length);

    const client = await asClient();
    const body = expectStatus(await client.agent.get('/api/german/vocab/quiz?field=ELECTRICAL&lang=az'), 200).body as { field: string; lang: string; questions: Question[] };
    expect(body).toMatchObject({ field: 'ELECTRICAL', lang: 'az' });
    expect(body.questions).toHaveLength(10);
    const words = await prisma.germanWord.findMany({ where: { id: { in: body.questions.map((q) => q.wordId) } } });
    expect(words).toHaveLength(10);
    for (const q of body.questions) {
      const w = words.find((x) => x.id === q.wordId)!;
      expect(w.field).toBe('ELECTRICAL');
      expect(q.options).toHaveLength(4);
      expect(q.options[q.answer]).toBe((w.translations as { az: string }).az);
    }

    // The ELECTRICAL field shows up in the trainer summary too.
    const summary = expectStatus(await client.agent.get('/api/german/vocab'), 200).body as { fields: { key: string; total: number }[] };
    expect(summary.fields.find((f) => f.key === 'ELECTRICAL')?.total).toBe(electrical.length);

    expect((await client.agent.get('/api/german/vocab/quiz?field=ROCKET')).status).toBe(400);
    expect((await client.agent.get('/api/german/vocab/quiz')).status).toBe(400);
    const staff = await asStaff();
    expect((await staff.agent.get('/api/german/vocab/quiz?field=ELECTRICAL')).status).toBe(403);
  });
});
