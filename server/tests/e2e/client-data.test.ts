import { describe, expect, it } from 'vitest';
import { asAdmin, asClient, asStaff, type Agent } from '../helpers/api';
import { prisma } from '../helpers/db';
import { makePdf, PDF } from '../helpers/files';
import { createCaseVia, driveCaseTo, expectStatus } from '../helpers/workflow';
import { runClientDataReminders } from '../../src/jobs/clientData.js';
import { confirmationState } from '../../src/lib/clientData/confirmation.js';

type Template = { id: string; key: string | null; builtIn: boolean; fields: { key: string; target?: string | null }[] };

const templates = async (agent: Agent) => expectStatus(await agent.get('/api/admin/case-forms/templates'), 200).body.templates as Template[];
const tpl = async (agent: Agent, key: string) => (await templates(agent)).find((t) => t.key === key)!;
const send = async (agent: Agent, caseId: string, templateId: string) => expectStatus(await agent.post(`/api/admin/cases/${caseId}/forms`).send({ templateId }), 201).body.form as { id: string; status: string };

describe('smart questionnaires', () => {
  it('seeds the built-in templates and exposes the mapping registry', async () => {
    const { agent } = await asStaff();
    const list = await templates(agent);
    expect(list.map((t) => t.key).sort()).toEqual(['ADDRESS_HISTORY', 'EDUCATION', 'FAMILY', 'HEALTH_INSURANCE', 'PREVIOUS_VISAS', 'WORK_HISTORY']);
    expect(list.every((t) => t.builtIn)).toBe(true);
    const targets = expectStatus(await agent.get('/api/admin/case-forms/targets'), 200).body.targets as { target: string }[];
    expect(targets.map((t) => t.target)).toEqual(expect.arrayContaining(['profile.passportNumber', 'profile.birthDate', 'case.profession', 'videx.maritalStatus', 'videx.previousSchengen']));
    // Second read does not duplicate them.
    expect((await templates(agent)).length).toBe(6);
  });

  it('client fills a form (draft, required check, submit); staff see the diff and apply it with field history', async () => {
    const client = await asClient({ firstName: 'Elvin', lastName: 'Mammadov', locale: 'az' });
    const admin = await asAdmin();
    const c = await createCaseVia(client.agent);
    const family = await tpl(admin.agent, 'FAMILY');
    const work = await tpl(admin.agent, 'WORK_HISTORY');
    const f1 = await send(admin.agent, c.id, family.id);
    expect(f1.status).toBe('SENT');
    expectStatus(await admin.agent.post(`/api/admin/cases/${c.id}/forms`).send({ templateId: family.id }), 409); // already open
    const n = await prisma.notification.findFirst({ where: { userId: client.user.id, type: 'CASE_FORM_SENT' } });
    expect(n?.title).toBe('Yeni anket');
    expect(n?.link).toBe(`/account/cases/${c.id}/forms/${f1.id}`);

    const tasks = expectStatus(await client.agent.get(`/api/client-data/cases/${c.id}/tasks`), 200).body;
    expect(tasks.forms).toHaveLength(1);

    // Draft: unknown keys / invalid options are dropped.
    const draft = expectStatus(await client.agent.put(`/api/client-data/cases/${c.id}/forms/${f1.id}`).send({ answers: { maritalStatus: 'verheiratet', bogus: 'x', hasChildren: 'maybe' } }), 200).body.form;
    expect(draft.status).toBe('DRAFT');
    expect(draft.answers).toEqual({ maritalStatus: 'verheiratet' });

    // Submit: spouse name (show-if married) and children question are required.
    const missing = expectStatus(await client.agent.post(`/api/client-data/cases/${c.id}/forms/${f1.id}/submit`).send({ answers: { maritalStatus: 'verheiratet' } }), 400).body;
    expect(missing.error).toBe('REQUIRED_MISSING');
    expect(missing.missing.map((m: { key: string }) => m.key)).toEqual(expect.arrayContaining(['spouseName', 'hasChildren']));
    const answers = { maritalStatus: 'verheiratet', spouseName: 'Aysel Mammadova', birthName: 'Mammadli', hasChildren: true, children: [{ name: 'Ali', birthDate: '2019-05-02' }] };
    expect(expectStatus(await client.agent.post(`/api/client-data/cases/${c.id}/forms/${f1.id}/submit`).send({ answers }), 200).body.form.status).toBe('SUBMITTED');
    expectStatus(await client.agent.put(`/api/client-data/cases/${c.id}/forms/${f1.id}`).send({ answers }), 409); // no edits after submit

    // Another client cannot see it.
    const other = await asClient();
    expectStatus(await other.agent.get(`/api/client-data/cases/${c.id}/forms/${f1.id}`), 404);
    expectStatus(await client.agent.get(`/api/admin/cases/${c.id}/forms`), 403);

    const detail = expectStatus(await admin.agent.get(`/api/admin/cases/${c.id}/forms/${f1.id}`), 200).body.form;
    const diff = Object.fromEntries((detail.diff as { target: string; after: { value: string }; changed: boolean }[]).map((d) => [d.target, d]));
    expect(diff['videx.maritalStatus'].after.value).toBe('verheiratet');
    expect(diff['videx.birthName'].after.value).toBe('Mammadli');
    const applied = expectStatus(await admin.agent.post(`/api/admin/cases/${c.id}/forms/${f1.id}/apply`).send({}), 200).body;
    expect(applied.form.status).toBe('APPLIED');
    expect((await prisma.caseDataValue.findUnique({ where: { caseId_key: { caseId: c.id, key: 'maritalStatus' } } }))?.value).toBe('verheiratet');

    // VIDEX sheet uses the client's answer.
    const videx = expectStatus(await admin.agent.post(`/api/admin/cases/${c.id}/ai/videx`).send({}), 201).body.run;
    const marital = (videx.result.fields as { key: string; value: string; source: string }[]).find((f) => f.key === 'maritalStatus')!;
    expect(marital).toMatchObject({ value: 'verheiratet', source: 'manual' });

    // Profile targets go through the normal update path → field history.
    const f2 = await send(admin.agent, c.id, work.id);
    expectStatus(
      await client.agent.post(`/api/client-data/cases/${c.id}/forms/${f2.id}/submit`).send({ answers: { currentPosition: 'Berufskraftfahrer', experienceYears: 7, employers: [{ employer: 'Kaya Transport', position: 'Fahrer', from: '2018-01-01' }] } }),
      200,
    );
    const out = expectStatus(await admin.agent.post(`/api/admin/cases/${c.id}/forms/${f2.id}/apply`).send({ targets: ['profile.experienceYears'] }), 200).body;
    expect(out.applied.map((a: { target: string }) => a.target)).toEqual(['profile.experienceYears']);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: client.user.id } });
    expect(user.experienceYears).toBe(7);
    expect(user.profession).not.toBe('Berufskraftfahrer'); // not selected
    const change = await prisma.fieldChange.findFirst({ where: { entity: 'USER', entityId: client.user.id, field: 'experienceYears' } });
    expect(change).toMatchObject({ actorId: admin.user.id, source: 'admin' });
    expect(await prisma.auditLog.count({ where: { action: 'CASE_FORM_APPLIED', target: c.id } })).toBe(2);
  });

  it('form builder: admins only, validated fields and mapping targets', async () => {
    const admin = await asAdmin();
    const staff = await asStaff();
    const L = (s: string) => ({ az: s, de: s, en: s, ru: s });
    const body = {
      title: L('Pasport'),
      fields: [
        { key: 'hasPassport', type: 'yesno', label: L('Pass?'), required: true },
        { key: 'passportNumber', type: 'text', label: L('Nr'), required: true, showIf: { field: 'hasPassport', equals: true }, target: 'profile.passportNumber' },
      ],
    };
    expectStatus(await staff.agent.post('/api/admin/case-forms/templates').send(body), 403);
    expectStatus(await admin.agent.post('/api/admin/case-forms/templates').send({ ...body, fields: [{ ...body.fields[1], target: 'profile.passwordHash' }] }), 400);
    expectStatus(await admin.agent.post('/api/admin/case-forms/templates').send({ ...body, fields: [{ key: 'kids', type: 'group', label: L('x'), fields: [{ key: 'a', type: 'text', label: L('a') }], target: 'profile.birthDate' }] }), 400);
    expectStatus(await admin.agent.post('/api/admin/case-forms/templates').send({ ...body, fields: [body.fields[1]] }), 400); // show-if references an unknown field
    const t = expectStatus(await admin.agent.post('/api/admin/case-forms/templates').send(body), 201).body.template;

    const client = await asClient();
    const c = await createCaseVia(client.agent);
    const f = await send(staff.agent, c.id, t.id);
    expectStatus(await client.agent.post(`/api/client-data/cases/${c.id}/forms/${f.id}/submit`).send({ answers: { hasPassport: true, passportNumber: 'c 0123 4567' } }), 200);
    // STAFF see the passport number masked in the diff, the real value is still written.
    const d = expectStatus(await staff.agent.get(`/api/admin/cases/${c.id}/forms/${f.id}`), 200).body.form.diff[0];
    expect(d.after.value).toMatch(/•/);
    expectStatus(await staff.agent.post(`/api/admin/cases/${c.id}/forms/${f.id}/apply`).send({}), 200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: client.user.id } })).passportNumber).toBe('C01234567');

    // Built-ins are switched off, own templates deleted.
    const fam = await tpl(admin.agent, 'FAMILY');
    expect(expectStatus(await admin.agent.delete(`/api/admin/case-forms/templates/${fam.id}`), 200).body.deactivated).toBe(true);
    expectStatus(await admin.agent.post(`/api/admin/cases/${c.id}/forms`).send({ templateId: fam.id }), 404);
  });

  it('reopen, cancel and reminders (ReminderLog, at most once per step)', async () => {
    const client = await asClient({ locale: 'de' });
    const admin = await asAdmin();
    const c = await createCaseVia(client.agent);
    const f = await send(admin.agent, c.id, (await tpl(admin.agent, 'HEALTH_INSURANCE')).id);
    await prisma.caseForm.update({ where: { id: f.id }, data: { sentAt: new Date(Date.now() - 4 * 24 * 3600 * 1000) } });
    expect((await runClientDataReminders()).forms).toBe(1);
    expect((await runClientDataReminders()).forms).toBe(0);
    expect((await prisma.notification.findFirst({ where: { userId: client.user.id, type: 'CASE_FORM_REMINDER' } }))?.title).toBe('Erinnerung: Fragebogen');

    expectStatus(await client.agent.post(`/api/client-data/cases/${c.id}/forms/${f.id}/submit`).send({ answers: { hasInsurance: false } }), 200);
    expect(expectStatus(await admin.agent.post(`/api/admin/cases/${c.id}/forms/${f.id}/reopen`).send({ note: 'Bitte Police hochladen' }), 200).body.form.status).toBe('DRAFT');
    // File answer: own upload of the case only.
    const doc = expectStatus(await client.agent.post(`/api/client-data/cases/${c.id}/files`).attach('file', await makePdf('Police'), { filename: 'police.pdf', ...PDF }), 201).body.document;
    const saved = expectStatus(await client.agent.put(`/api/client-data/cases/${c.id}/forms/${f.id}`).send({ answers: { hasInsurance: true, policyFile: [doc.id, 'foreign-id'] } }), 200).body.form;
    expect(saved.answers.policyFile).toEqual([doc.id]);
    expectStatus(await admin.agent.delete(`/api/admin/cases/${c.id}/forms/${f.id}`), 200);
    expectStatus(await client.agent.get(`/api/client-data/cases/${c.id}/forms/${f.id}`), 404);
  });
});

describe('client confirms their data', () => {
  it('next step asks for it; client confirms with a correction + proof; staff accept; stale after a later change', async () => {
    const client = await asClient({ firstName: 'Elvin', lastName: 'Mammadov', locale: 'en' });
    const admin = await asAdmin();
    const staff = await asStaff();
    await prisma.user.update({ where: { id: client.user.id }, data: { passportNumber: 'C01234567', birthDate: new Date('1990-04-12T00:00:00Z'), city: 'Baku', nationality: 'Azerbaijan' } });
    const c = await driveCaseTo('EMBASSY_DOCUMENTS', { client: client.agent, admin: admin.agent });

    const ns = expectStatus(await admin.agent.get(`/api/admin/cases/${c.id}/next-step`), 200).body.nextStep;
    const all = [...ns.steps, ...ns.rest] as { code: string; actions: { id: string; kind: string; request?: { path: string; body: Record<string, unknown> } }[] }[];
    const step = all.find((s) => s.code === 'CONFIRM_DATA')!;
    expect(step).toBeTruthy();
    const ask = step.actions.find((a) => a.id === 'ASK_CONFIRM_DATA')!;
    const asked = expectStatus(await admin.agent.post(`/api/${ask.request!.path.replace(/^\//, '')}`).send(ask.request!.body), 201).body;
    expect(asked.requested).toHaveLength(1);
    expect(asked.state.state).toBe('PENDING');
    expect((await prisma.notification.findFirst({ where: { userId: client.user.id, type: 'DATA_CONFIRM_REQUESTED' } }))?.title).toBe('Please confirm your data');
    // While pending the next step does not ask again.
    const ns2 = expectStatus(await admin.agent.get(`/api/admin/cases/${c.id}/next-step`), 200).body.nextStep;
    expect([...ns2.steps, ...ns2.rest].some((s: { code: string }) => s.code === 'CONFIRM_DATA')).toBe(false);

    const conf = expectStatus(await client.agent.get(`/api/client-data/cases/${c.id}/confirmation`), 200).body.confirmation;
    const byKey = Object.fromEntries((conf.fields as { key: string; value: string }[]).map((f) => [f.key, f.value]));
    expect(byKey.passportNumber).toBe('C01234567'); // the client sees their own data unmasked
    expect(byKey.surname).toBe('MAMMADOV');
    expect(byKey.birthDate).toBe('12.04.1990');

    const allOk = Object.fromEntries((conf.fields as { key: string }[]).map((f) => [f.key, { ok: true }]));
    expect(expectStatus(await client.agent.post(`/api/client-data/cases/${c.id}/confirmation/submit`).send({ answers: { surname: { ok: true } } }), 400).body.error).toBe('ANSWER_EVERY_LINE');
    const proof = expectStatus(await client.agent.post(`/api/client-data/cases/${c.id}/files`).attach('file', await makePdf('ID card'), { filename: 'id.pdf', ...PDF }), 201).body.document;
    const sent = expectStatus(
      await client.agent.post(`/api/client-data/cases/${c.id}/confirmation/submit`).send({ answers: { ...allOk, placeOfBirth: { ok: false, value: 'Ganja', proofDocumentId: proof.id }, birthDate: { ok: false, value: '13.04.1990' } } }),
      200,
    ).body.confirmation;
    expect(sent.status).toBe('SUBMITTED');
    const row = await prisma.dataConfirmation.findUniqueOrThrow({ where: { id: sent.id } });
    expect(row.submittedAt).toBeTruthy();
    expect(row.submitIp).toBeTruthy();

    // Staff view: masked passport number, corrections with proof.
    const view = expectStatus(await staff.agent.get(`/api/admin/cases/${c.id}/data-confirmation`), 200).body;
    expect(view.state.state).toBe('REVIEW');
    const items = Object.fromEntries((view.confirmation.items as { key: string }[]).map((i) => [i.key, i])) as unknown as Record<string, { value: string; answer: { ok: boolean; correction?: { value: string }; proof?: { id: string } | null } }>;
    expect(items.passportNumber.value).toMatch(/•/);
    expect(items.placeOfBirth.answer.correction!.value).toBe('Ganja');
    expect(items.placeOfBirth.answer.proof!.id).toBe(proof.id);

    // Package preview warns while not confirmed.
    expect(expectStatus(await admin.agent.get(`/api/admin/cases/${c.id}/embassy-package`), 200).body.dataConfirmation.state).toBe('REVIEW');

    const decided = expectStatus(
      await admin.agent.post(`/api/admin/cases/${c.id}/data-confirmation/${sent.id}/decide`).send({ decisions: [{ key: 'placeOfBirth', decision: 'ACCEPT' }, { key: 'birthDate', decision: 'ACCEPT' }] }),
      200,
    ).body;
    expect(decided.state.state).toBe('CONFIRMED');
    expect((await prisma.caseDataValue.findUnique({ where: { caseId_key: { caseId: c.id, key: 'placeOfBirth' } } }))?.value).toBe('Ganja');
    expect((await prisma.user.findUniqueOrThrow({ where: { id: client.user.id } })).birthDate?.toISOString().slice(0, 10)).toBe('1990-04-13');
    const final = await prisma.dataConfirmation.findUniqueOrThrow({ where: { id: sent.id } });
    expect((final.snapshot as { key: string; value: string; by: string }[]).find((s) => s.key === 'placeOfBirth')).toMatchObject({ value: 'Ganja', by: 'correction' });
    expect(expectStatus(await admin.agent.get(`/api/admin/cases/${c.id}/embassy-package`), 200).body.dataConfirmation.state).toBe('CONFIRMED');
    const ns3 = expectStatus(await admin.agent.get(`/api/admin/cases/${c.id}/next-step`), 200).body.nextStep;
    expect([...ns3.steps, ...ns3.rest].some((s: { code: string }) => s.code === 'CONFIRM_DATA')).toBe(false);

    // A later change of confirmed data makes it stale (warning + next step again).
    await new Promise((r) => setTimeout(r, 15));
    await prisma.user.update({ where: { id: client.user.id }, data: { passportNumber: 'C07654321' } });
    const st = await confirmationState(c.id);
    expect(st.state).toBe('STALE');
    expect(st.changedKeys).toContain('passportNumber');
    const ns4 = expectStatus(await admin.agent.get(`/api/admin/cases/${c.id}/next-step`), 200).body.nextStep;
    expect([...ns4.steps, ...ns4.rest].some((s: { code: string }) => s.code === 'CONFIRM_DATA')).toBe(true);
  });

  it('all lines correct → confirmed at once; reminders for open requests', async () => {
    const client = await asClient({ locale: 'ru' });
    const admin = await asAdmin();
    const c = await createCaseVia(client.agent);
    const asked = expectStatus(await admin.agent.post(`/api/admin/cases/${c.id}/data-confirmation`).send({}), 201).body;
    await prisma.dataConfirmation.update({ where: { id: asked.confirmation.id }, data: { requestedAt: new Date(Date.now() - 3 * 24 * 3600 * 1000) } });
    expect((await runClientDataReminders()).confirmations).toBe(1);
    expect((await runClientDataReminders()).confirmations).toBe(0);
    const conf = expectStatus(await client.agent.get(`/api/client-data/cases/${c.id}/confirmation`), 200).body.confirmation;
    const answers = Object.fromEntries((conf.fields as { key: string }[]).map((f) => [f.key, { ok: true }]));
    expect(expectStatus(await client.agent.post(`/api/client-data/cases/${c.id}/confirmation/submit`).send({ answers }), 200).body.confirmation.status).toBe('CONFIRMED');
    expectStatus(await client.agent.post(`/api/client-data/cases/${c.id}/confirmation/submit`).send({ answers }), 409);
    expect((await confirmationState(c.id)).state).toBe('CONFIRMED');
    expect(await prisma.notification.count({ where: { userId: admin.user.id, type: 'DATA_CONFIRM_SUBMITTED' } })).toBe(1);
  });
});

describe('document guides', () => {
  it('built-in drafts, admin editing (4 languages, sample image), client view in their language with aliases', async () => {
    const admin = await asAdmin();
    const staff = await asStaff();
    const client = await asClient({ locale: 'de' });
    const list = expectStatus(await staff.agent.get('/api/admin/doc-guides'), 200).body.guides as { key: string; guide: { builtIn: boolean; verified: boolean } | null }[];
    const police = list.find((g) => g.key === 'POLICE_CERT')!;
    expect(police.guide).toMatchObject({ builtIn: true, verified: false });
    expect(list.filter((g) => g.guide?.builtIn).length).toBeGreaterThanOrEqual(10);

    const got = expectStatus(await client.agent.get('/api/client-data/guides?keys=PASSPORT,PHOTO_2,UNKNOWN_KEY'), 200).body.guides;
    expect(Object.keys(got).sort()).toEqual(['PASSPORT', 'PHOTO_2']);
    expect(got.PASSPORT.text.where).toContain('ASAN');
    expect(got.PHOTO_2.text.summary).toContain('35×45');
    expect(got.PASSPORT.verified).toBe(false);

    const text = { summary: 'S', where: 'W', duration: 'D', cost: 'ca.', apostille: 'A', translation: 'T', mistakes: 'M1\nM2', tips: '' };
    const body = { content: { az: text, de: { ...text, where: 'Wo' }, en: text, ru: text }, links: [{ label: 'e-gov', url: 'https://www.e-gov.az' }], sampleImage: '/uploads/sample.png', verified: true, published: true };
    expectStatus(await staff.agent.put('/api/admin/doc-guides/PASSPORT').send(body), 403);
    expectStatus(await admin.agent.put('/api/admin/doc-guides/PASSPORT').send({ ...body, links: [{ label: 'x', url: 'javascript:alert(1)' }] }), 400);
    expectStatus(await admin.agent.put('/api/admin/doc-guides/PASSPORT').send({ ...body, sampleImage: 'https://evil.example/x.png' }), 400);
    expect(expectStatus(await admin.agent.put('/api/admin/doc-guides/PASSPORT').send(body), 200).body.guide).toMatchObject({ builtIn: false, verified: true });
    const after = expectStatus(await client.agent.get('/api/client-data/guides?keys=PASSPORT'), 200).body.guides.PASSPORT;
    expect(after).toMatchObject({ verified: true, sampleImage: '/uploads/sample.png', text: { where: 'Wo' } });

    expectStatus(await admin.agent.put('/api/admin/doc-guides/PASSPORT').send({ ...body, published: false }), 200);
    expect(expectStatus(await client.agent.get('/api/client-data/guides?keys=PASSPORT'), 200).body.guides.PASSPORT).toBeUndefined();
    expect(expectStatus(await admin.agent.delete('/api/admin/doc-guides/PASSPORT'), 200).body.guide.builtIn).toBe(true);
    expect(await prisma.auditLog.count({ where: { action: 'DOC_GUIDE_SAVED' } })).toBe(2);
  });
});
