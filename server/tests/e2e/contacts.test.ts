import { describe, expect, it } from 'vitest';
import { anon, asAdmin, asClient, asStaff } from '../helpers/api';
import { prisma } from '../helpers/db';
import { createClient, createUser, uniq } from '../helpers/factories';

const contact = (over: Record<string, unknown> = {}) => ({
  firstName: 'Aysel',
  lastName: 'Mammadova',
  // Digits only after the name: a random letter suffix could contain "mu" and match the "Mü" search below.
  email: `aysel-${Date.now()}${Math.floor(Math.random() * 1e6)}@example.com`,
  phone: '+994 50 123 45 67',
  company: 'Baku Logistics',
  position: 'HR manager',
  tags: ['hr', 'Logistics'],
  ...over,
});

describe('contacts: access', () => {
  it('requires a staff session', async () => {
    expect((await anon().get('/api/contacts')).status).toBe(401);
    const client = await asClient();
    expect((await client.agent.get('/api/contacts')).status).toBe(403);
  });
});

describe('contacts: CRUD and visibility', () => {
  it('creates, reads, updates and deletes a contact; e-mails and tags are normalised', async () => {
    const staff = await asStaff();
    const res = await staff.agent.post('/api/contacts').send(contact({ email: '  Aysel@Example.COM ', emails: ['aysel@Example.com', 'second@example.com', 'bad'], tags: ['hr', ' hr ', 'Logistics'] }));
    expect(res.status).toBe(201);
    const c = res.body.contact;
    expect(c).toMatchObject({ firstName: 'Aysel', lastName: 'Mammadova', email: 'aysel@example.com', shared: true, source: 'MANUAL', canEdit: true, canDelete: true, createdById: staff.user.id });
    expect(c.emails).toEqual(['second@example.com']);
    expect(c.tags).toEqual(['hr', 'Logistics']);

    const detail = await staff.agent.get(`/api/contacts/${c.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.contact.id).toBe(c.id);
    expect(detail.body.cases).toEqual([]);

    const patched = await staff.agent.patch(`/api/contacts/${c.id}`).send({ position: 'Head of HR', tags: ['vip'], email: null });
    expect(patched.status).toBe(200);
    expect(patched.body.contact).toMatchObject({ position: 'Head of HR', tags: ['vip'], email: null, firstName: 'Aysel' });

    expect((await staff.agent.delete(`/api/contacts/${c.id}`)).status).toBe(200);
    expect((await staff.agent.get(`/api/contacts/${c.id}`)).status).toBe(404);
  });

  it('rejects invalid e-mails and empty names', async () => {
    const staff = await asStaff();
    expect((await staff.agent.post('/api/contacts').send(contact({ email: 'nope' }))).status).toBe(400);
    expect((await staff.agent.post('/api/contacts').send(contact({ firstName: '  ' }))).status).toBe(400);
  });

  it('private contacts are visible and editable only by their creator; shared ones by everyone', async () => {
    const a = await asStaff();
    const b = await asStaff();
    const admin = await asAdmin();
    const priv = (await a.agent.post('/api/contacts').send(contact({ firstName: 'Secret', shared: false }))).body.contact;
    const shared = (await a.agent.post('/api/contacts').send(contact({ firstName: 'Public' }))).body.contact;

    const listB = await b.agent.get('/api/contacts');
    expect(listB.body.items.map((c: { id: string }) => c.id)).toEqual([shared.id]);
    expect((await b.agent.get(`/api/contacts/${priv.id}`)).status).toBe(404);
    expect((await b.agent.patch(`/api/contacts/${priv.id}`).send({ position: 'x' })).status).toBe(404);
    // Admins do not see private contacts of others either.
    expect((await admin.agent.get(`/api/contacts/${priv.id}`)).status).toBe(404);

    // Shared: any staff may edit, but only the creator or an admin may delete.
    expect((await b.agent.patch(`/api/contacts/${shared.id}`).send({ position: 'Edited by B' })).status).toBe(200);
    expect((await b.agent.delete(`/api/contacts/${shared.id}`)).status).toBe(403);
    expect((await admin.agent.delete(`/api/contacts/${shared.id}`)).status).toBe(200);

    // The ?shared= filter and the creator's own private list.
    const mine = await a.agent.get('/api/contacts?shared=false');
    expect(mine.body.items.map((c: { id: string }) => c.id)).toEqual([priv.id]);
    // Only the creator may flip private → shared (staff B cannot even see it; an admin cannot either).
    expect((await a.agent.patch(`/api/contacts/${priv.id}`).send({ shared: true })).body.contact.shared).toBe(true);
  });
});

describe('contacts: search, filters, tags', () => {
  it('finds contacts by fulltext (prefix words) and falls back to LIKE for short fragments', async () => {
    const staff = await asStaff();
    await staff.agent.post('/api/contacts').send(contact({ firstName: 'Aysel', lastName: 'Mammadova', company: 'Baku Logistics' }));
    await staff.agent.post('/api/contacts').send(contact({ firstName: 'Kamran', lastName: 'Aliyev', company: 'Caspian Transport', email: 'kamran@caspian.az' }));
    await staff.agent.post('/api/contacts').send(contact({ firstName: 'Hans', lastName: 'Müller', company: 'Müller Spedition GmbH', email: 'hans@mueller.de' }));

    const full = await staff.agent.get('/api/contacts?q=mamm');
    expect(full.status).toBe(200);
    expect(full.body.items.map((c: { firstName: string }) => c.firstName)).toEqual(['Aysel']);
    expect(['fulltext', 'like']).toContain(full.body.mode);

    const byCompany = await staff.agent.get('/api/contacts?q=caspian');
    expect(byCompany.body.items.map((c: { firstName: string }) => c.firstName)).toEqual(['Kamran']);

    // Two characters are below the fulltext token size: LIKE answers.
    const short = await staff.agent.get('/api/contacts?q=Mü');
    expect(short.body.mode).toBe('like');
    expect(short.body.items.map((c: { firstName: string }) => c.firstName)).toEqual(['Hans']);

    // E-mail fragment with limit (the Mail compose autocomplete shape).
    const auto = await staff.agent.get('/api/contacts?q=mueller.de&limit=8');
    expect(auto.body.items).toHaveLength(1);
    expect(auto.body.items[0]).toMatchObject({ firstName: 'Hans', email: 'hans@mueller.de', emails: [], tags: ['hr', 'Logistics'], shared: true, userId: null });
    expect(auto.body.pageSize).toBe(8);

    expect((await staff.agent.get('/api/contacts?q=zzzz-nothing')).body.items).toEqual([]);
  });

  it('filters by tag (case-insensitive), company and first letter; lists distinct tags with counts', async () => {
    const staff = await asStaff();
    await staff.agent.post('/api/contacts').send(contact({ firstName: 'Aysel', lastName: 'Mammadova', tags: ['HR'] }));
    await staff.agent.post('/api/contacts').send(contact({ firstName: 'Kamran', lastName: 'Aliyev', tags: ['hr', 'driver'], company: 'Other' }));
    await staff.agent.post('/api/contacts').send(contact({ firstName: 'Zaur', lastName: 'Bagirov', tags: [], company: 'Other' }));

    const byTag = await staff.agent.get('/api/contacts?tag=hr');
    expect(byTag.body.total).toBe(2);
    expect(byTag.body.items.map((c: { lastName: string }) => c.lastName)).toEqual(['Aliyev', 'Mammadova']);

    const byCompany = await staff.agent.get(`/api/contacts?company=${encodeURIComponent('Other')}&sort=company`);
    expect(byCompany.body.items.map((c: { lastName: string }) => c.lastName)).toEqual(['Aliyev', 'Bagirov']);

    const byLetter = await staff.agent.get('/api/contacts?letter=B');
    expect(byLetter.body.items.map((c: { lastName: string }) => c.lastName)).toEqual(['Bagirov']);

    const tags = await staff.agent.get('/api/contacts/tags');
    expect(tags.body.tags).toEqual([
      { tag: 'HR', count: 2 },
      { tag: 'driver', count: 1 },
    ]);

    const paged = await staff.agent.get('/api/contacts?limit=2&page=2');
    expect(paged.body).toMatchObject({ total: 3, page: 2, pageSize: 2 });
    expect(paged.body.items).toHaveLength(1);
  });

  it('touch sets lastContactAt and sort=lastContact puts it first', async () => {
    const staff = await asStaff();
    const a = (await staff.agent.post('/api/contacts').send(contact({ firstName: 'Aaa', lastName: 'Aaa' }))).body.contact;
    const b = (await staff.agent.post('/api/contacts').send(contact({ firstName: 'Bbb', lastName: 'Bbb' }))).body.contact;
    const touched = await staff.agent.patch(`/api/contacts/${b.id}/touch`);
    expect(touched.status).toBe(200);
    expect(touched.body.contact.lastContactAt).toBeTruthy();
    const list = await staff.agent.get('/api/contacts?sort=lastContact');
    expect(list.body.items.map((c: { id: string }) => c.id)).toEqual([b.id, a.id]);
  });
});

describe('contacts: import / export', () => {
  it('imports CSV with localised headers, dedupes by e-mail and round-trips through export', async () => {
    const staff = await asStaff();
    const csv = [
      'Vorname;Nachname;E-Mail;Telefon;Unternehmen;Position;Schlagwörter',
      'Hans;Müller;hans@mueller.de;+49 30 1234;Müller GmbH;Geschäftsführer;"partner, logistik"',
      'Anna;Schmidt;ANNA@schmidt.de;;Schmidt AG;;',
      'Hans;Doppelt;hans@mueller.de;;;;',
      ';;;;;;',
    ].join('\r\n');
    const res = await staff.agent.post('/api/contacts/import').set('Content-Type', 'text/csv').send(csv);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ created: 2, updated: 0, skipped: 1, total: 3, unmapped: [] });
    expect(res.body.columns).toEqual(['firstName', 'lastName', 'email', 'phone', 'company', 'position', 'tags']);

    const list = await staff.agent.get('/api/contacts');
    expect(list.body.items.map((c: { email: string; source: string }) => [c.email, c.source])).toEqual([
      ['hans@mueller.de', 'IMPORT'],
      ['anna@schmidt.de', 'IMPORT'],
    ]);
    expect(list.body.items[0].tags).toEqual(['partner', 'logistik']);

    // Importing again: existing e-mails are skipped; with update=1 blanks are filled.
    const again = await staff.agent.post('/api/contacts/import').send({ csv: 'first name,email,phone\nAnna,anna@schmidt.de,+49 1\n' });
    expect(again.body).toMatchObject({ created: 0, skipped: 1 });
    const upd = await staff.agent.post('/api/contacts/import').send({ csv: 'first name,email,phone\nAnna,anna@schmidt.de,+49 1\n', update: true });
    expect(upd.body).toMatchObject({ created: 0, updated: 1, skipped: 0 });
    expect((await staff.agent.get('/api/contacts?q=schmidt')).body.items[0].phone).toBe('+49 1');

    // Azerbaijani and Russian headers are understood as well.
    const az = await staff.agent.post('/api/contacts/import').send({ csv: 'Ad,Soyad,E-poçt,Telefon nömrəsi,Şirkət,Vəzifə,Etiketlər\nAysel,Mammadova,aysel@x.az,,Baku Co,HR,vip\n' });
    expect(az.body).toMatchObject({ created: 1, unmapped: [] });
    const ru = await staff.agent.post('/api/contacts/import').send({ csv: 'Имя,Фамилия,Эл. почта,Телефон,Компания,Должность,Теги,Unknown\nИван,Петров,ivan@x.ru,,,,,x\n' });
    expect(ru.body).toMatchObject({ created: 1, unmapped: ['Unknown'] });

    const exp = await staff.agent.get('/api/contacts/export.csv');
    expect(exp.status).toBe(200);
    expect(exp.headers['content-type']).toContain('text/csv');
    const text = exp.text.replace(/^﻿/, '');
    const lines = text.trim().split('\r\n');
    expect(lines[0]).toBe('firstName,lastName,email,phone,company,position,tags,address,notes');
    expect(lines).toHaveLength(5);
    expect(text).toContain('Hans,Müller,hans@mueller.de,+49 30 1234,Müller GmbH,Geschäftsführer,"partner, logistik",,');

    // Round trip: export → fresh import by another staff member creates the same contacts.
    await prisma.contact.deleteMany();
    const back = await staff.agent.post('/api/contacts/import').set('Content-Type', 'text/csv').send(exp.text);
    expect(back.body).toMatchObject({ created: 4, skipped: 0, unmapped: [] });
    expect((await staff.agent.get('/api/contacts?q=mueller')).body.items[0]).toMatchObject({ firstName: 'Hans', lastName: 'Müller', tags: ['partner', 'logistik'] });
  });

  it('rejects empty or unrecognised CSV', async () => {
    const staff = await asStaff();
    expect((await staff.agent.post('/api/contacts/import').send({ csv: '   ' })).status).toBe(400);
    expect((await staff.agent.post('/api/contacts/import').send({ csv: 'foo,bar\n1,2\n' })).body.error).toBe('NO_KNOWN_COLUMNS');
  });
});

describe('contacts: merge', () => {
  it('merges duplicates into one contact (blanks filled, e-mails and tags unioned, newest lastContactAt)', async () => {
    const staff = await asStaff();
    const keep = (await staff.agent.post('/api/contacts').send(contact({ firstName: 'Hans', lastName: null, email: 'hans@a.de', phone: null, company: null, tags: ['a'] }))).body.contact;
    const dup1 = (await staff.agent.post('/api/contacts').send(contact({ firstName: 'Hans', lastName: 'Müller', email: 'hans@b.de', phone: '+49 1', company: null, tags: ['b'] }))).body.contact;
    const dup2 = (await staff.agent.post('/api/contacts').send(contact({ firstName: 'H.', lastName: 'M.', email: 'hans@a.de', company: 'Müller GmbH', tags: ['a', 'c'] }))).body.contact;
    await staff.agent.patch(`/api/contacts/${dup1.id}/touch`);

    const res = await staff.agent.post('/api/contacts/merge').send({ keepId: keep.id, mergeIds: [dup1.id, dup2.id, keep.id] });
    expect(res.status).toBe(200);
    expect(res.body.merged).toBe(2);
    expect(res.body.contact).toMatchObject({ id: keep.id, firstName: 'Hans', lastName: 'Müller', email: 'hans@a.de', phone: '+49 1', company: 'Müller GmbH' });
    expect(res.body.contact.emails).toEqual(['hans@b.de']);
    expect(res.body.contact.tags).toEqual(['a', 'b', 'c']);
    expect(res.body.contact.lastContactAt).toBeTruthy();
    expect(await prisma.contact.count()).toBe(1);
  });

  it('refuses to merge contacts the actor may not delete', async () => {
    const a = await asStaff();
    const b = await asStaff();
    const keep = (await b.agent.post('/api/contacts').send(contact({ firstName: 'K' }))).body.contact;
    const other = (await a.agent.post('/api/contacts').send(contact({ firstName: 'O' }))).body.contact;
    expect((await b.agent.post('/api/contacts/merge').send({ keepId: keep.id, mergeIds: [other.id] })).status).toBe(403);
    expect((await b.agent.post('/api/contacts/merge').send({ keepId: keep.id, mergeIds: [keep.id] })).status).toBe(400);
    expect((await b.agent.post('/api/contacts/merge').send({ keepId: keep.id, mergeIds: ['missing'] })).status).toBe(404);
  });
});

describe('contacts: platform suggestions', () => {
  it('suggests clients with cases, employer users and companies, and links them on add', async () => {
    const staff = await asStaff();
    const { user: client } = await createClient({ firstName: 'Aysel', lastName: 'Mammadova' });
    await prisma.case.create({ data: { number: uniq('TV-'), clientId: client.id, profession: 'Driver' } });
    await createClient({ firstName: 'NoCase', lastName: 'Client' });
    const company = await prisma.company.create({ data: { name: 'Müller Spedition GmbH', contactName: 'Hans Müller', email: 'info@mueller.de', city: 'Berlin' } });
    const { user: employer } = await createUser({ role: 'COMPANY', firstName: 'Hans', lastName: 'Müller' });
    await prisma.user.update({ where: { id: employer.id }, data: { companyId: company.id } });

    const s1 = await staff.agent.get('/api/contacts/suggest');
    expect(s1.status).toBe(200);
    expect(s1.body.clients.map((c: { userId: string }) => c.userId)).toEqual([client.id]);
    expect(s1.body.clients[0]).toMatchObject({ kind: 'client', firstName: 'Aysel', cases: 1 });
    expect(s1.body.employers.map((c: { userId: string }) => c.userId)).toEqual([employer.id]);
    expect(s1.body.employers[0]).toMatchObject({ kind: 'employer', company: 'Müller Spedition GmbH', companyId: company.id });
    expect(s1.body.companies.map((c: { companyId: string }) => c.companyId)).toEqual([company.id]);

    const fromUser = await staff.agent.post(`/api/contacts/from-user/${client.id}`);
    expect(fromUser.status).toBe(201);
    expect(fromUser.body.contact).toMatchObject({ firstName: 'Aysel', lastName: 'Mammadova', email: client.email, userId: client.id, tags: ['client'], shared: true });
    expect((await staff.agent.post(`/api/contacts/from-user/${client.id}`)).status).toBe(409);
    expect((await staff.agent.post(`/api/contacts/from-user/${staff.user.id}`)).status).toBe(404);

    const fromCompany = await staff.agent.post(`/api/contacts/from-company/${company.id}`);
    expect(fromCompany.status).toBe(201);
    expect(fromCompany.body.contact).toMatchObject({ firstName: 'Hans', lastName: 'Müller', company: 'Müller Spedition GmbH', companyId: company.id, email: 'info@mueller.de', tags: ['employer'] });
    expect((await staff.agent.post(`/api/contacts/from-company/${company.id}`)).status).toBe(409);
    expect((await staff.agent.post('/api/contacts/from-company/missing')).status).toBe(404);

    const fromEmployer = await staff.agent.post(`/api/contacts/from-user/${employer.id}`);
    expect(fromEmployer.body.contact).toMatchObject({ userId: employer.id, companyId: company.id, company: 'Müller Spedition GmbH', tags: ['employer'] });

    // Linked people disappear from the suggestions; the detail shows the linked account and its cases.
    const s2 = await staff.agent.get('/api/contacts/suggest');
    expect(s2.body.clients).toEqual([]);
    expect(s2.body.employers).toEqual([]);
    expect(s2.body.companies).toEqual([]);
    const detail = await staff.agent.get(`/api/contacts/${fromUser.body.contact.id}`);
    expect(detail.body.user).toMatchObject({ id: client.id, role: 'CLIENT' });
    expect(detail.body.cases).toHaveLength(1);
    expect((await staff.agent.get('/api/contacts/suggest?q=zzz')).body.companies).toEqual([]);
  });
});
