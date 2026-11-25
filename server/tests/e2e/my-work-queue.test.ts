import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { asAdmin, asStaff, asSuperAdmin, type Agent } from '../helpers/api';
import { prisma } from '../helpers/db';
import { createClient, uniq } from '../helpers/factories';
import { expectStatus } from '../helpers/workflow';
import type { WorkItem } from '../../src/lib/myWork.js';

/** "Bu günün işləri" queue (GET /api/admin/my-work): case contracts, vacancy requests, scope=team (external applications are no longer queued). */

const DAY = 24 * 60 * 60 * 1000;
const ago = (ms: number) => new Date(Date.now() - ms);

type Body = { items: WorkItem[]; counts: { byKind: Record<string, number> }; scope: string };
const work = async (agent: Agent, scope = 'mine') => expectStatus(await agent.get(`/api/admin/my-work?fresh=1&scope=${scope}`), 200).body as Body;
const ofKind = (b: Body, kind: string) => b.items.filter((i) => i.kind === kind);

const makeCase = async (staffId: string | null, status = 'CONTRACT_SENT') => {
  const { user: client } = await createClient({ firstName: 'Aysel', lastName: 'Queue' });
  const c = await prisma.case.create({ data: { number: uniq('TV-'), clientId: client.id, profession: 'Driver', assignedStaffId: staffId, status: status as never } });
  return { c, client };
};

const contractRequest = async (caseId: string, clientId: string, o: { status: 'SENT' | 'COMPLETED'; clientSigned: boolean; triadSigned: boolean; kind?: 'LABOUR' | 'WORK' }) =>
  prisma.signatureRequest.create({
    data: {
      title: o.kind === 'WORK' ? 'Arbeitsvertrag' : 'Əmək müqaviləsi',
      caseId,
      contractKind: o.kind ?? 'LABOUR',
      contractFlow: 'V2',
      status: o.status,
      order: 'SEQUENTIAL',
      sentAt: ago(3 * DAY),
      completedAt: o.status === 'COMPLETED' ? ago(DAY) : null,
      originalName: 'contract.pdf',
      originalKey: uniq('sig-'),
      originalSha256: crypto.randomBytes(32).toString('hex'),
      originalSize: 100,
      originalPages: 1,
      signers: {
        create: [
          { role: 'CANDIDATE', order: 1, name: 'Aysel Queue', email: `${uniq('c')}@example.com`, userId: clientId, status: o.clientSigned ? 'SIGNED' : 'PENDING', signedAt: o.clientSigned ? ago(2 * DAY) : null },
          { role: 'STAFF', order: 2, name: 'Triad Vision', email: `${uniq('s')}@example.com`, status: o.triadSigned ? 'SIGNED' : 'PENDING', signedAt: o.triadSigned ? ago(DAY) : null },
        ],
      },
    } as never,
  });

describe('my work queue: scope', () => {
  it('scope=team is open to every staff member; scope=all stays ADMIN+', async () => {
    const staff = await asStaff();
    expect((await work(staff.agent, 'team')).scope).toBe('team');
    expect((await staff.agent.get('/api/admin/my-work?scope=all')).status).toBe(403);
    const admin = await asAdmin();
    expect((await work(admin.agent, 'all')).scope).toBe('all');
  });
});

describe('my work queue: case contracts', () => {
  it('Triad Vision to sign (client signed first) → contract_triad with a link to the case contract panel', async () => {
    const staff = await asStaff();
    const { c, client } = await makeCase(staff.user.id);
    const r = await contractRequest(c.id, client.id, { status: 'SENT', clientSigned: true, triadSigned: false });
    const items = ofKind(await work(staff.agent), 'contract_triad').filter((i) => i.refs.caseId === c.id);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ category: 'signatures', priority: 'HIGH', refs: { requestId: r.id, step: 'LABOUR' } });
    expect(items[0].actions[0]).toMatchObject({ key: 'signContract', type: 'link', href: `/admin/cases/${c.id}#case-contract` });
  });

  it('client still to sign → no staff item', async () => {
    const staff = await asStaff();
    const { c, client } = await makeCase(staff.user.id);
    await contractRequest(c.id, client.id, { status: 'SENT', clientSigned: false, triadSigned: false });
    expect(ofKind(await work(staff.agent), 'contract_triad').filter((i) => i.refs.caseId === c.id)).toHaveLength(0);
  });

  it('fully signed, not approved → contract_approve calling the existing approve endpoint', async () => {
    const staff = await asStaff();
    const { c, client } = await makeCase(staff.user.id, 'CONTRACT_SIGNED');
    await contractRequest(c.id, client.id, { status: 'COMPLETED', clientSigned: true, triadSigned: true });
    const [item] = ofKind(await work(staff.agent), 'contract_approve').filter((i) => i.refs.caseId === c.id);
    expect(item).toBeTruthy();
    expect(item.actions[0]).toMatchObject({ key: 'approveContract', type: 'api', method: 'POST', endpoint: `/admin/case-contracts/cases/${c.id}/approve`, body: { step: 'LABOUR' }, confirm: true });
  });

  it('mine = assigned cases; team = every case of the access scope; ASSIGNED scope keeps others out', async () => {
    const owner = await asStaff();
    const other = await asStaff();
    const { c, client } = await makeCase(owner.user.id);
    await contractRequest(c.id, client.id, { status: 'SENT', clientSigned: true, triadSigned: false });
    const has = (b: Body) => ofKind(b, 'contract_triad').some((i) => i.refs.caseId === c.id);
    expect(has(await work(other.agent))).toBe(false);
    expect(has(await work(other.agent, 'team'))).toBe(true); // default scope ALL
    const sup = await asSuperAdmin();
    expectStatus(await sup.agent.put(`/api/admin/access/scope/users/${other.user.id}`).send({ caseScope: 'ASSIGNED' }), 200);
    expect(has(await work(other.agent, 'team'))).toBe(false);
  });
});

describe('my work queue: vacancy requests (no external applications)', () => {
  it('external applications are no longer queued (external apply retired): an old READY row gives no item', async () => {
    const staff = await asStaff();
    const inquiry = await prisma.inquiry.create({ data: { kind: 'contact', contactName: `Ext ${uniq('n')}`, email: `${uniq('e')}@example.com`, message: 'apply', locale: 'az' } as never });
    await prisma.externalJobApplication.create({
      data: { inquiryId: inquiry.id, provider: 'link', listingUrl: 'https://example.com/job', autoState: 'READY', autoReason: 'CLIENT_HELP', clientHelpAt: ago(2 * DAY) },
    });
    const b = await work(staff.agent, 'team');
    expect(b.items.some((i) => i.refs.inquiryId === inquiry.id)).toBe(false);
  });

  it('NEW vacancy request → vacancy_request; "take" (existing endpoint) removes it', async () => {
    const staff = await asStaff();
    const req = await prisma.vacancyRequest.create({ data: { type: 'WORK', profession: 'Pflegefachkraft', city: 'Berlin', contactName: 'Guest Name', email: `${uniq('g')}@example.com` } });
    const item = ofKind(await work(staff.agent), 'vacancy_request').find((i) => i.refs.vacancyRequestId === req.id)!;
    expect(item).toMatchObject({ title: 'Pflegefachkraft', category: 'leads' });
    const take = item.actions.find((a) => a.key === 'take')!;
    expectStatus(await staff.agent.patch(`/api/${take.endpoint!.replace(/^\//, '')}`).send(take.body), 200);
    expect((await prisma.vacancyRequest.findUniqueOrThrow({ where: { id: req.id } })).assignedStaffId).toBe(staff.user.id);
    expect(ofKind(await work(staff.agent), 'vacancy_request').some((i) => i.refs.vacancyRequestId === req.id)).toBe(false);
  });

  it('kinds of an area the viewer may not see are left out', async () => {
    const sup = await asSuperAdmin();
    const staff = await asStaff();
    const templates = expectStatus(await sup.agent.get('/api/admin/access/staff/templates'), 200).body.templates as { id: string; key: string | null }[];
    const legacy = templates.find((t) => t.key === 'legacy_staff')!.id;
    expectStatus(
      await sup.agent.put(`/api/admin/access/staff/users/${staff.user.id}`).send({ templateId: legacy, overrides: [{ area: 'employers', action: 'view', effect: 'deny' }] }),
      200,
    );
    const req = await prisma.vacancyRequest.create({ data: { type: 'WORK', profession: 'Koch' } });
    expect(ofKind(await work(staff.agent), 'vacancy_request').some((i) => i.refs.vacancyRequestId === req.id)).toBe(false);
  });
});
