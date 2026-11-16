import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../helpers/db';
import { asAdmin, asStaff } from '../helpers/api';
import { uniq } from '../helpers/factories';
import { asCandidate, asCompany, cleanJobs } from './vacancies.fixtures';

beforeEach(cleanJobs);

const DAY = 24 * 60 * 60 * 1000;
const day = (d: Date) => d.toISOString().slice(0, 10);

const placed = async (employer?: Awaited<ReturnType<typeof asCompany>>) => {
  const e = employer ?? (await asCompany());
  const worker = await asCandidate({ firstName: 'Rəşad', lastName: 'Quliyev' });
  const c = await prisma.case.create({ data: { number: uniq('TV-'), clientId: worker.user.id, profession: 'Elektroniker', companyId: e.company.id, status: 'APPROVED' } });
  return { employer: e, worker, c };
};

type Item = { id: string; key: string | null; dueDate: string | null; dueAuto: boolean; dueState: string; labels: Record<string, string | null> | null };
const byKey = (items: Item[], key: string) => items.find((i) => i.key === key)!;

describe('employer arrival checklist: templates and due dates', () => {
  it('sets due dates relative to the arrival and the first work day and follows changes until the company sets its own date', async () => {
    const { employer, worker, c } = await placed();
    const arrival = new Date(Date.UTC(2027, 2, 10, 15, 0));
    const start = new Date(Date.UTC(2027, 2, 16));
    const plan = await prisma.arrivalPlan.create({ data: { caseId: c.id, clientId: worker.user.id, status: 'CONFIRMED', arrivalTime: arrival } });
    await prisma.employmentContract.create({ data: { caseId: c.id, companyId: employer.company.id, startDate: start } });

    let res = await employer.agent.get(`/api/company/workers/${c.id}/checklist`);
    expect(res.status).toBe(200);
    let items = res.body.items as Item[];
    expect(items).toHaveLength(11);
    expect(byKey(items, 'HOUSING')).toMatchObject({ dueAuto: true });
    expect(byKey(items, 'HOUSING').dueDate!.slice(0, 10)).toBe('2027-02-24');
    expect(byKey(items, 'WOHNUNGSGEBER').dueDate!.slice(0, 10)).toBe('2027-03-07');
    expect(byKey(items, 'ANMELDUNG').dueDate!.slice(0, 10)).toBe('2027-03-17');
    expect(byKey(items, 'FIRST_DAY').dueDate!.slice(0, 10)).toBe('2027-03-16');
    expect(byKey(items, 'BUDDY').dueDate!.slice(0, 10)).toBe('2027-03-09');
    expect(byKey(items, 'LANGUAGE_SUPPORT').dueDate!.slice(0, 10)).toBe('2027-03-30');

    // The company fixes its own housing date; then the flight moves by two days.
    const housing = byKey(items, 'HOUSING');
    await employer.agent.patch(`/api/company/workers/${c.id}/checklist/${housing.id}`).send({ dueDate: '2027-02-20' }).expect(200);
    await prisma.arrivalPlan.update({ where: { id: plan.id }, data: { arrivalTime: new Date(arrival.getTime() + 2 * DAY) } });
    items = (await employer.agent.get(`/api/company/workers/${c.id}/checklist`)).body.items;
    expect(byKey(items, 'HOUSING')).toMatchObject({ dueAuto: false });
    expect(byKey(items, 'HOUSING').dueDate!.slice(0, 10)).toBe('2027-02-20');
    expect(byKey(items, 'ANMELDUNG').dueDate!.slice(0, 10)).toBe('2027-03-19');

    // Moving the first work day moves the items that count from it.
    const first = byKey(items, 'FIRST_DAY');
    await employer.agent.patch(`/api/company/workers/${c.id}/checklist/${first.id}`).send({ dueDate: '2027-03-23' }).expect(200);
    items = (await employer.agent.get(`/api/company/workers/${c.id}/checklist`)).body.items;
    expect(byKey(items, 'WORKWEAR').dueDate!.slice(0, 10)).toBe('2027-03-22');
    expect(byKey(items, 'SAFETY_BRIEFING').dueDate!.slice(0, 10)).toBe('2027-03-23');
  });

  it('marks overdue items in the company overview and for staff on the case', async () => {
    const { employer, worker, c } = await placed();
    await prisma.arrivalPlan.create({ data: { caseId: c.id, clientId: worker.user.id, status: 'COMPLETED', arrivalTime: new Date(Date.now() - 30 * DAY) } });
    const ov = await employer.agent.get('/api/company/workers/checklists/overview');
    expect(ov.body.items).toHaveLength(1);
    expect(ov.body.items[0].overdue).toBeGreaterThan(0);

    const staff = await asStaff();
    const card = await staff.agent.get(`/api/admin/employer-checklist/case/${c.id}`);
    expect(card.status).toBe(200);
    expect(card.body.checklist.progress).toEqual({ done: 0, total: 11 });
    expect(card.body.checklist.overdue).toBeGreaterThan(0);
    expect(card.body.checklist.company.id).toBe(employer.company.id);
    expect(byKey(card.body.checklist.items, 'HOUSING').dueState).toBe('overdue');
    // Not for the employer itself.
    expect((await employer.agent.get(`/api/admin/employer-checklist/case/${c.id}`)).status).toBe(403);
  });

  it('a company sees and edits only its own workers', async () => {
    const a = await placed();
    const b = await placed();
    await a.employer.agent.get(`/api/company/workers/${a.c.id}/checklist`).expect(200);
    const bList = await b.employer.agent.get(`/api/company/workers/${b.c.id}/checklist`).expect(200);
    const bItem = bList.body.items[0] as Item;

    const ov = await a.employer.agent.get('/api/company/workers/checklists/overview');
    expect(ov.body.items.map((r: { caseId: string }) => r.caseId)).toEqual([a.c.id]);
    expect((await a.employer.agent.get(`/api/company/workers/${b.c.id}/checklist`)).status).toBe(404);
    expect((await a.employer.agent.patch(`/api/company/workers/${b.c.id}/checklist/${bItem.id}`).send({ done: true })).status).toBe(404);
    expect((await a.employer.agent.patch(`/api/company/workers/${a.c.id}/checklist/${bItem.id}`).send({ done: true })).status).toBe(404);
    expect((await a.employer.agent.post(`/api/company/workers/${b.c.id}/checklist`).send({ label: 'x' })).status).toBe(404);
    expect((await prisma.employerArrivalItem.findUniqueOrThrow({ where: { id: bItem.id } })).done).toBe(false);
  });

  it('admins edit templates: overrides, new items, switched-off items, reset; staff may only read', async () => {
    const admin = await asAdmin();
    const staff = await asStaff();
    expect((await staff.agent.get('/api/admin/employer-checklist/templates')).body.templates).toHaveLength(11);
    expect((await staff.agent.put('/api/admin/employer-checklist/templates/PARKING').send({ labelDe: 'Parkausweis' })).status).toBe(403);

    await admin.agent
      .put('/api/admin/employer-checklist/templates/HOUSING')
      .send({ labelDe: 'Unterkunft (WG) reserviert', labelEn: 'Shared flat booked', anchor: 'ARRIVAL', offsetDays: -21, sortOrder: 10 })
      .expect(200);
    await admin.agent.put('/api/admin/employer-checklist/templates/LANGUAGE_SUPPORT').send({ labelDe: 'Sprachhilfe', active: false, sortOrder: 90 }).expect(200);
    const added = await admin.agent
      .put('/api/admin/employer-checklist/templates/parking')
      .send({ labelDe: 'Parkausweis', labelAz: 'Parkinq kartı', anchor: 'FIRST_DAY', offsetDays: 0, visibleToWorker: false, sortOrder: 95 });
    expect(added.status).toBe(200);
    expect(added.body.templates.find((t: { key: string }) => t.key === 'PARKING')).toMatchObject({ builtIn: false, visibleToWorker: false });
    expect((await admin.agent.put('/api/admin/employer-checklist/templates/x').send({ labelDe: 'X' })).status).toBe(400);
    expect((await admin.agent.put('/api/admin/employer-checklist/templates/HOUSING').send({ labelDe: 'X', offsetDays: 999 })).status).toBe(400);

    const { employer, worker, c } = await placed();
    await prisma.employmentContract.create({ data: { caseId: c.id, companyId: employer.company.id, startDate: new Date(Date.UTC(2027, 4, 3)) } });
    const items = (await employer.agent.get(`/api/company/workers/${c.id}/checklist`)).body.items as Item[];
    expect(items.map((i) => i.key)).not.toContain('LANGUAGE_SUPPORT');
    expect(byKey(items, 'HOUSING').labels).toMatchObject({ de: 'Unterkunft (WG) reserviert', en: 'Shared flat booked' });
    expect(byKey(items, 'PARKING')).toMatchObject({ labels: { de: 'Parkausweis', az: 'Parkinq kartı' } });
    expect(day(new Date(byKey(items, 'PARKING').dueDate!))).toBe('2027-05-03');
    // Not shared with the worker.
    const w = await prisma.employerArrivalItem.findFirstOrThrow({ where: { caseId: c.id, key: 'PARKING' } });
    expect(w.visibleToWorker).toBe(false);
    expect(worker.user.id).toBeTruthy();

    // Reset a built-in; new keys cannot be reset (switch them off instead).
    const reset = await admin.agent.delete('/api/admin/employer-checklist/templates/HOUSING');
    expect(reset.status).toBe(200);
    expect(reset.body.templates.find((t: { key: string }) => t.key === 'HOUSING').labels).toBeNull();
    expect((await admin.agent.delete('/api/admin/employer-checklist/templates/PARKING')).status).toBe(400);
    expect((await prisma.auditLog.count({ where: { action: 'EMPLOYER_CHECKLIST_TEMPLATE_SAVED' } }))).toBe(3);
  });
});
