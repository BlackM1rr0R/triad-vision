import { describe, expect, it } from 'vitest';
import { anon, asAdmin, asClient, asStaff } from '../helpers/api';
import { prisma } from '../helpers/db';
import { expectStatus } from '../helpers/workflow';

/** Guided-tour progress per user (routes/tours.ts, lib/tours.ts). */
describe('guided tours', () => {
  it('needs a session', async () => {
    expect((await anon().get('/api/tours')).status).toBe(401);
  });

  it('progress is per user, resumable and survives devices (stored server-side)', async () => {
    const a = await asClient();
    const b = await asStaff();
    expect(expectStatus(await a.agent.get('/api/tours'), 200).body.tours).toEqual({});

    expectStatus(await a.agent.put('/api/tours/client').send({ status: 'progress', step: 2 }), 200);
    expect(expectStatus(await a.agent.get('/api/tours'), 200).body.tours.client).toMatchObject({ status: 'progress', step: 2 });
    expect(expectStatus(await b.agent.get('/api/tours'), 200).body.tours).toEqual({});

    const done = expectStatus(await a.agent.put('/api/tours/client').send({ status: 'done', step: 4 }), 200).body.tours;
    expect(done.client).toMatchObject({ status: 'done', step: 4 });
    // a late "progress" from another tab keeps it finished; a restart from the help menu reopens it
    expect(expectStatus(await a.agent.put('/api/tours/client').send({ status: 'progress', step: 1 }), 200).body.tours.client.status).toBe('done');
    expect(expectStatus(await a.agent.put('/api/tours/client').send({ status: 'progress', step: 0, restart: true }), 200).body.tours.client).toMatchObject({ status: 'progress', step: 0 });

    expectStatus(await a.agent.put('/api/tours/client').send({ status: 'reset' }), 200);
    expect(expectStatus(await a.agent.get('/api/tours'), 200).body.tours).toEqual({});
    expect(await prisma.setting.findUnique({ where: { key: `tours:${a.user.id}` } })).not.toBeNull();
  });

  it('parallel writes from two tabs are both applied', async () => {
    const s = await asStaff();
    const r = await Promise.all([
      s.agent.put('/api/tours/admin').send({ status: 'done', step: 5 }),
      s.agent.put('/api/tours/sp-review').send({ status: 'never' }),
      s.agent.put('/api/tours/staff').send({ status: 'progress', step: 1 }),
    ]);
    for (const x of r) expect(x.status).toBe(200);
    const tours = expectStatus(await s.agent.get('/api/tours'), 200).body.tours;
    expect(Object.keys(tours).sort()).toEqual(['admin', 'sp-review', 'staff']);
  });

  it('rejects bad ids and bodies', async () => {
    const s = await asClient();
    expect((await s.agent.put('/api/tours/Not_Valid').send({ status: 'done' })).status).toBe(400);
    expect((await s.agent.put('/api/tours/client').send({ status: 'finished' })).status).toBe(400);
    expect((await s.agent.put('/api/tours/client').send({ status: 'progress', step: -1 })).status).toBe(400);
  });

  it('the generic settings listing never shows the per-user rows', async () => {
    const s = await asClient();
    expectStatus(await s.agent.put('/api/tours/client').send({ status: 'done' }), 200);
    const admin = await asAdmin();
    const settings = expectStatus(await admin.agent.get('/api/admin/settings'), 200).body.settings;
    expect(Object.keys(settings).some((k) => k.startsWith('tours:'))).toBe(false);
  });
});
