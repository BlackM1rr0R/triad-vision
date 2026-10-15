import { describe, expect, it } from 'vitest';
import { asAdmin, asStaff } from '../helpers/api';
import { prisma } from '../helpers/db';

const contact = (over: Record<string, unknown> = {}) => ({ firstName: 'Aysel', lastName: 'Mammadova', ...over });

describe('contacts: list sorting and paging', () => {
  it('sorts by name, recent and company and validates paging parameters', async () => {
    const staff = await asStaff();
    const a = (await staff.agent.post('/api/contacts').send(contact({ firstName: 'Zaur', lastName: 'Bagirov', company: 'Beta' }))).body.contact;
    const b = (await staff.agent.post('/api/contacts').send(contact({ firstName: 'Aysel', lastName: 'Mammadova', company: 'Alpha' }))).body.contact;
    await prisma.contact.update({ where: { id: a.id }, data: { updatedAt: new Date(Date.now() - 60_000) } });
    await staff.agent.patch(`/api/contacts/${a.id}`).send({ position: 'x' });

    expect((await staff.agent.get('/api/contacts')).body.items.map((c: { id: string }) => c.id)).toEqual([a.id, b.id]);
    expect((await staff.agent.get('/api/contacts?sort=recent')).body.items.map((c: { id: string }) => c.id)).toEqual([a.id, b.id]);
    expect((await staff.agent.get('/api/contacts?sort=company')).body.items.map((c: { company: string }) => c.company)).toEqual(['Alpha', 'Beta']);
    expect((await staff.agent.get('/api/contacts?page=0')).status).toBe(400);
    expect((await staff.agent.get('/api/contacts?limit=500')).status).toBe(400);
    expect((await staff.agent.get('/api/contacts?sort=weird')).status).toBe(400);
  });

  it('combines a search with tag and visibility filters', async () => {
    const staff = await asStaff();
    await staff.agent.post('/api/contacts').send(contact({ firstName: 'Hans', lastName: 'Müller', tags: ['partner'] }));
    await staff.agent.post('/api/contacts').send(contact({ firstName: 'Hans', lastName: 'Schmidt', tags: ['client'], shared: false }));
    await staff.agent.post('/api/contacts').send(contact({ firstName: 'Hans', lastName: 'Weber' }));
    const r = await staff.agent.get('/api/contacts?q=hans&tag=partner');
    expect(r.body.items.map((c: { lastName: string }) => c.lastName)).toEqual(['Müller']);
    const priv = await staff.agent.get('/api/contacts?q=hans&shared=false');
    expect(priv.body.items.map((c: { lastName: string }) => c.lastName)).toEqual(['Schmidt']);
    expect((await staff.agent.get('/api/contacts?q=hans')).body.total).toBe(3);
  });
});

describe('contacts: import variants', () => {
  it('accepts text/plain bodies with ?shared=false (private import) and a tab-separated file', async () => {
    const staff = await asStaff();
    const other = await asStaff();
    const res = await staff.agent.post('/api/contacts/import?shared=false').set('Content-Type', 'text/plain').send('first name\tlast name\temail\nAysel\tMammadova\taysel@x.az\n');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ created: 1, columns: ['firstName', 'lastName', 'email'] });
    const mine = await staff.agent.get('/api/contacts');
    expect(mine.body.items[0]).toMatchObject({ shared: false, email: 'aysel@x.az', source: 'IMPORT' });
    expect((await other.agent.get('/api/contacts')).body.items).toEqual([]);
  });

  it('import rows without an e-mail are always created; exports carry a BOM even when empty', async () => {
    const staff = await asStaff();
    const res = await staff.agent.post('/api/contacts/import').send({ csv: 'Name,Company\nHans,A GmbH\nHans,A GmbH\n' });
    expect(res.body).toMatchObject({ created: 2, skipped: 0 });
    await prisma.contact.deleteMany();
    const exp = await staff.agent.get('/api/contacts/export.csv');
    expect(exp.text.startsWith('﻿firstName,')).toBe(true);
    expect(exp.text.trim().split('\r\n')).toHaveLength(1);
  });
});

describe('contacts: permissions on edit', () => {
  it('only the creator (or an admin) may flip a shared contact to private; validates company links', async () => {
    const creator = await asStaff();
    const other = await asStaff();
    const admin = await asAdmin();
    const c = (await creator.agent.post('/api/contacts').send(contact())).body.contact;
    expect((await other.agent.patch(`/api/contacts/${c.id}`).send({ shared: false })).status).toBe(403);
    expect((await admin.agent.patch(`/api/contacts/${c.id}`).send({ shared: false })).status).toBe(200);
    // Now private to the creator: the admin (not creator) loses sight of it.
    expect((await admin.agent.get(`/api/contacts/${c.id}`)).status).toBe(404);
    expect((await creator.agent.patch(`/api/contacts/${c.id}`).send({ shared: true })).status).toBe(200);
    expect((await creator.agent.patch(`/api/contacts/${c.id}`).send({ companyId: 'missing' })).status).toBe(400);
    expect((await creator.agent.post('/api/contacts').send(contact({ companyId: 'missing' }))).status).toBe(400);
    const company = await prisma.company.create({ data: { name: 'Linked GmbH' } });
    const linked = await creator.agent.patch(`/api/contacts/${c.id}`).send({ companyId: company.id });
    expect(linked.body.contact.companyId).toBe(company.id);
    expect((await creator.agent.get(`/api/contacts/${c.id}`)).body.companyRef).toMatchObject({ id: company.id, name: 'Linked GmbH' });
  });

  it('touch and detail are limited to visible contacts; delete of a missing id is 404', async () => {
    const a = await asStaff();
    const b = await asStaff();
    const priv = (await a.agent.post('/api/contacts').send(contact({ shared: false }))).body.contact;
    expect((await b.agent.patch(`/api/contacts/${priv.id}/touch`)).status).toBe(404);
    expect((await b.agent.delete(`/api/contacts/${priv.id}`)).status).toBe(404);
    expect((await a.agent.delete('/api/contacts/nope')).status).toBe(404);
  });
});
