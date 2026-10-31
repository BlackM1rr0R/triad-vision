import { describe, expect, it } from 'vitest';
import { asAdmin, asClient, asStaff } from '../helpers/api';
import { prisma } from '../helpers/db';
import { uniq } from '../helpers/factories';
import { expectStatus } from '../helpers/workflow';

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);

const embassyBody = {
  type: 'EMBASSY',
  name: 'Deutsche Botschaft Baku',
  city: 'Baku',
  country: 'Azerbaijan',
  address: 'Mammad Amin Rasulzade küç. 15, Baku',
  website: 'https://baku.diplo.de',
  email: 'info@baku.diplo.de',
  phone: '+994 12 465 41 00',
  openingHours: 'Mo–Fr 8:30–12:00',
  requirements: 'Two biometric photos, original passport.',
  checklist: [{ label: 'Passport', required: true }, { label: 'Health insurance', required: false }],
  notes: 'Internal: call the visa section before 10:00.',
  waitingDaysManual: null,
  aliases: 'Botschaft Baku\nGerman Embassy Baku',
  contacts: [{ name: 'Frau Visa', role: 'Visa section', phone: '+994 12 000', email: 'visa@baku.diplo.de' }],
};

const newCase = (clientId: string, over: Record<string, unknown> = {}) =>
  prisma.case.create({ data: { clientId, number: uniq('TV-AU-'), profession: 'Pflegefachkraft', ...over } });

describe('authorities catalogue', () => {
  it('catalogue CRUD: STAFF reads, ADMIN writes (audited), contacts replaced, filters, delete blocked while linked', async () => {
    const staff = await asStaff();
    const admin = await asAdmin();
    const client = await asClient();

    // Clients have no access; STAFF may read but not write.
    expect((await client.agent.get('/api/admin/authorities')).status).toBe(403);
    expect((await staff.agent.post('/api/admin/authorities').send(embassyBody)).status).toBe(403);
    expect(expectStatus(await staff.agent.get('/api/admin/authorities'), 200).body.items).toEqual([]);

    // Validation: website must be http(s), e-mail valid.
    expect((await admin.agent.post('/api/admin/authorities').send({ ...embassyBody, website: 'javascript:alert(1)' })).status).toBe(400);
    expect((await admin.agent.post('/api/admin/authorities').send({ ...embassyBody, email: 'nope' })).status).toBe(400);

    const created = expectStatus(await admin.agent.post('/api/admin/authorities').send(embassyBody), 201).body;
    expect(created.authority).toMatchObject({ type: 'EMBASSY', name: 'Deutsche Botschaft Baku', city: 'Baku', active: true });
    expect(created.authority.checklist).toEqual(embassyBody.checklist);
    expect(created.authority.contacts).toHaveLength(1);
    expect(created.waiting).toMatchObject({ manualDays: null, computed: null, effectiveDays: null });
    const id = created.authority.id as string;

    const abh = expectStatus(
      await admin.agent.post('/api/admin/authorities').send({ type: 'AUSLAENDERBEHOERDE', name: 'Ausländerbehörde München', city: 'München', country: 'Deutschland', waitingDaysManual: 42 }),
      201,
    ).body.authority;

    // List: search, type and city filters, cities for the filter, counts per type.
    const all = expectStatus(await staff.agent.get('/api/admin/authorities'), 200).body;
    expect(all.items).toHaveLength(2);
    expect(all.cities).toEqual(['Baku', 'München']);
    expect(all.counts).toMatchObject({ EMBASSY: 1, AUSLAENDERBEHOERDE: 1 });
    expect(all.items.find((i: { id: string }) => i.id === abh.id).waiting.effectiveDays).toBe(42);
    expect(expectStatus(await staff.agent.get('/api/admin/authorities?type=EMBASSY'), 200).body.items.map((i: { id: string }) => i.id)).toEqual([id]);
    expect(expectStatus(await staff.agent.get('/api/admin/authorities?city=M%C3%BCnchen'), 200).body.items.map((i: { id: string }) => i.id)).toEqual([abh.id]);
    expect(expectStatus(await staff.agent.get('/api/admin/authorities?q=German%20Embassy'), 200).body.items.map((i: { id: string }) => i.id)).toEqual([id]);
    expect(expectStatus(await staff.agent.get('/api/admin/authorities/options?type=AUSLAENDERBEHOERDE'), 200).body.items.map((i: { id: string }) => i.id)).toEqual([abh.id]);

    // Update: contacts replaced, changed fields audited.
    const updated = expectStatus(
      await admin.agent.put(`/api/admin/authorities/${id}`).send({ ...embassyBody, waitingDaysManual: 30, contacts: [{ name: 'Herr Konsul', role: 'Head of visa' }, { name: 'Frau Visa' }] }),
      200,
    ).body;
    expect(updated.authority.contacts.map((c: { name: string }) => c.name)).toEqual(['Herr Konsul', 'Frau Visa']);
    expect(updated.waiting.effectiveDays).toBe(30);
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: 'AUTHORITY_UPDATED', target: id } });
    expect((log.details as { changed: string[] }).changed).toEqual(expect.arrayContaining(['waitingDaysManual', 'contacts']));
    expect(await prisma.auditLog.count({ where: { action: 'AUTHORITY_CREATED' } })).toBe(2);

    // A linked authority cannot be deleted; an unused one can.
    const kase = await newCase(client.user.id, { embassyAuthorityId: id });
    expect(expectStatus(await admin.agent.delete(`/api/admin/authorities/${id}`), 409).body.error).toBe('AUTHORITY_IN_USE');
    expect((await staff.agent.delete(`/api/admin/authorities/${abh.id}`)).status).toBe(403);
    expectStatus(await admin.agent.delete(`/api/admin/authorities/${abh.id}`), 204);
    expect((await staff.agent.get(`/api/admin/authorities/${abh.id}`)).status).toBe(404);

    // Detail lists the linked case.
    const detail = expectStatus(await staff.agent.get(`/api/admin/authorities/${id}`), 200).body;
    expect(detail.cases).toEqual([expect.objectContaining({ id: kase.id, role: 'EMBASSY' })]);
    expect(detail.totalCases).toBe(1);
  });

  it('case links: STAFF sets embassy + ABH (type checked), adds further authorities; waiting time computed from cases; client sees public data only', async () => {
    const staff = await asStaff();
    const admin = await asAdmin();
    const client = await asClient();
    const embassy = expectStatus(await admin.agent.post('/api/admin/authorities').send(embassyBody), 201).body.authority;
    const abh = expectStatus(await admin.agent.post('/api/admin/authorities').send({ type: 'AUSLAENDERBEHOERDE', name: 'Ausländerbehörde Berlin (LEA)', city: 'Berlin' }), 201).body.authority;
    const ba = expectStatus(await admin.agent.post('/api/admin/authorities').send({ type: 'AGENTUR_FUER_ARBEIT', name: 'ZAV Bonn', city: 'Bonn', notes: 'secret' }), 201).body.authority;
    const kase = await newCase(client.user.id);

    // Wrong type for the slot is refused.
    expect(expectStatus(await staff.agent.put(`/api/admin/authorities/cases/${kase.id}`).send({ embassyAuthorityId: abh.id }), 400).body.error).toBe('AUTHORITY_TYPE_MISMATCH');

    const card = expectStatus(await staff.agent.put(`/api/admin/authorities/cases/${kase.id}`).send({ embassyAuthorityId: embassy.id, abhAuthorityId: abh.id }), 200).body;
    expect(card.embassy).toMatchObject({ id: embassy.id, address: embassyBody.address, requirements: embassyBody.requirements });
    expect(card.abh).toMatchObject({ id: abh.id });
    expect(await prisma.caseEvent.count({ where: { caseId: kase.id, type: 'CASE_UPDATED', visibleToClient: false } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: 'CASE_AUTHORITIES_SET', target: kase.id } })).toBe(1);

    // Further authority, duplicate refused, removable.
    const withBa = expectStatus(await staff.agent.post(`/api/admin/authorities/cases/${kase.id}/links`).send({ authorityId: ba.id, note: 'Zustimmung' }), 201).body;
    expect(withBa.others).toEqual([expect.objectContaining({ id: ba.id, note: 'Zustimmung' })]);
    expect((await staff.agent.post(`/api/admin/authorities/cases/${kase.id}/links`).send({ authorityId: ba.id })).status).toBe(409);

    // Client portal: own case only, public fields only (no notes, aliases, contact persons).
    const mine = expectStatus(await client.agent.get(`/api/account/authorities/cases/${kase.id}`), 200).body.items;
    expect(mine.map((a: { id: string }) => a.id)).toEqual([embassy.id, abh.id, ba.id]);
    expect(mine[0]).toMatchObject({ name: 'Deutsche Botschaft Baku', address: embassyBody.address, checklist: embassyBody.checklist });
    for (const a of mine) {
      expect(a).not.toHaveProperty('notes');
      expect(a).not.toHaveProperty('aliases');
      expect(a).not.toHaveProperty('contacts');
    }
    const stranger = await asClient();
    expect((await stranger.agent.get(`/api/account/authorities/cases/${kase.id}`)).status).toBe(404);
    expect((await staff.agent.get(`/api/account/authorities/cases/${kase.id}`)).status).toBe(403);

    expectStatus(await staff.agent.delete(`/api/admin/authorities/cases/${kase.id}/links/${ba.id}`), 200);
    expect(await prisma.caseAuthority.count({ where: { caseId: kase.id } })).toBe(0);

    // Computed waiting time: appointment → decision of decided cases at this embassy, plus the appointment lead time.
    for (const [lead, decision] of [
      [20, 10],
      [40, 20],
    ]) {
      const c = await newCase(client.user.id, { embassyAuthorityId: embassy.id, appointmentAt: daysAgo(decision + 5), decisionAt: daysAgo(5), status: 'APPROVED' });
      await prisma.caseEvent.create({ data: { caseId: c.id, type: 'STATUS_CHANGED', toStatus: 'APPOINTMENT_SCHEDULED', createdAt: daysAgo(decision + 5 + lead) } });
    }
    // § 81a at the Ausländerbehörde: submitted → pre-approval.
    await prisma.acceleratedProcedure.create({ data: { caseId: kase.id, submittedAt: daysAgo(30), preApprovalAt: daysAgo(16) } });
    const list = expectStatus(await staff.agent.get('/api/admin/authorities'), 200).body.items as { id: string; waiting: Record<string, unknown>; linkedCases: number }[];
    const e = list.find((i) => i.id === embassy.id)!;
    expect(e.waiting).toMatchObject({ manualDays: null, computed: { days: 15, samples: 2, basis: 'EMBASSY_DECISION' }, appointmentLead: { days: 30, samples: 2 }, effectiveDays: 15 });
    expect(e.linkedCases).toBe(3);
    expect(list.find((i) => i.id === abh.id)!.waiting).toMatchObject({ computed: { days: 14, samples: 1, basis: 'ABH_PRE_APPROVAL' } });
    const forClient = expectStatus(await client.agent.get(`/api/account/authorities/cases/${kase.id}`), 200).body.items;
    expect(forClient[0].waitingDays).toBe(15);

    // Clearing the embassy.
    const cleared = expectStatus(await staff.agent.put(`/api/admin/authorities/cases/${kase.id}`).send({ embassyAuthorityId: null }), 200).body;
    expect(cleared.embassy).toBeNull();
    expect(cleared.abh).toMatchObject({ id: abh.id });
  });

  it('free-text matches: cases naming the authority are linked on request, never overwriting an existing link', async () => {
    const staff = await asStaff();
    const admin = await asAdmin();
    const client = await asClient();
    const embassy = expectStatus(await admin.agent.post('/api/admin/authorities').send(embassyBody), 201).body.authority;
    const other = expectStatus(await admin.agent.post('/api/admin/authorities').send({ ...embassyBody, name: 'Deutsches Generalkonsulat Tiflis', aliases: null, city: 'Tbilisi', contacts: [] }), 201).body.authority;
    const a = await newCase(client.user.id, { appointmentPlace: 'Deutsche Botschaft Baku, Visa section, window 3' });
    const b = await newCase(client.user.id, { appointmentPlace: 'german embassy baku' }); // alias, other case
    const linkedElsewhere = await newCase(client.user.id, { appointmentPlace: 'Deutsche Botschaft Baku', embassyAuthorityId: other.id });
    await newCase(client.user.id, { appointmentPlace: 'VFS Global Baku' });

    expect((await staff.agent.get(`/api/admin/authorities/${embassy.id}/matches`)).status).toBe(403);
    const matches = expectStatus(await admin.agent.get(`/api/admin/authorities/${embassy.id}/matches`), 200).body.items;
    expect(matches.map((m: { caseId: string }) => m.caseId).sort()).toEqual([a.id, b.id].sort());

    // Only the chosen (and still matching) cases are linked; a foreign id is ignored.
    const res = expectStatus(await admin.agent.post(`/api/admin/authorities/${embassy.id}/matches`).send({ caseIds: [a.id, linkedElsewhere.id] }), 200).body;
    expect(res.linked).toBe(1);
    expect((await prisma.case.findUniqueOrThrow({ where: { id: a.id } })).embassyAuthorityId).toBe(embassy.id);
    expect((await prisma.case.findUniqueOrThrow({ where: { id: a.id } })).appointmentPlace).toBe('Deutsche Botschaft Baku, Visa section, window 3');
    expect((await prisma.case.findUniqueOrThrow({ where: { id: linkedElsewhere.id } })).embassyAuthorityId).toBe(other.id);
    expect(expectStatus(await admin.agent.get(`/api/admin/authorities/${embassy.id}/matches`), 200).body.items.map((m: { caseId: string }) => m.caseId)).toEqual([b.id]);

    // Ausländerbehörde: matched through the § 81a procedure's free-text authority.
    const abh = expectStatus(await admin.agent.post('/api/admin/authorities').send({ type: 'AUSLAENDERBEHOERDE', name: 'Landesamt für Einwanderung', aliases: 'LEA Berlin' }), 201).body.authority;
    const c = await newCase(client.user.id);
    await prisma.acceleratedProcedure.create({ data: { caseId: c.id, authority: 'LEA Berlin – Business Immigration Service' } });
    expect(expectStatus(await admin.agent.get(`/api/admin/authorities/${abh.id}/matches`), 200).body.items).toEqual([expect.objectContaining({ caseId: c.id })]);
    expect(expectStatus(await admin.agent.post(`/api/admin/authorities/${abh.id}/matches`).send({ caseIds: [c.id] }), 200).body.linked).toBe(1);
    expect((await prisma.case.findUniqueOrThrow({ where: { id: c.id } })).abhAuthorityId).toBe(abh.id);
  });
});
