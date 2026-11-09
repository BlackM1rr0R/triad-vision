import fs from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { asAdmin, asStaff, asSuperAdmin } from '../helpers/api';
import { prisma } from '../helpers/db';
import { makePdf, PDF } from '../helpers/files';
import { asCandidate, cleanJobs, createVacancy } from './vacancies.fixtures';
import { storagePath } from '../../src/lib/drive/storage';
import { waitForVacancyFolders } from '../../src/lib/drive/vacancyFolders';
import { waitForApplicationUploads } from '../../src/lib/applicationUploads';

type Agent = Awaited<ReturnType<typeof asStaff>>['agent'];

const children = async (agent: Agent, id: string) =>
  (await agent.get(`/api/drive/nodes/${encodeURIComponent(id)}/children`)).body as { items: { id: string; name: string; kind: string; size: number | null }[]; path: { id: string; name: string }[] };

const sharedRoot = async (agent: Agent) => (await agent.get('/api/drive/roots')).body.shared.id as string;

beforeEach(cleanJobs);

describe('vacancy ↔ drive folder', () => {
  it('creates the vacancy folder on create (default "Stellenangebote") or links an existing one, and never for old vacancies', async () => {
    const { agent } = await asAdmin();
    const old = await createVacancy({ title: { az: 'Köhnə', de: 'Alt', en: 'Old', ru: 'Старая' } });

    // New vacancy with a new folder under "Stellenangebote" (default name: title – city).
    const created = await agent.post('/api/admin/vacancies').send({ title: { de: 'Pflegekraft' }, description: { de: 'Text' }, city: 'Köln', newFolder: {} });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const folderId = created.body.vacancy.driveFolderId as string;
    expect(folderId).toBeTruthy();
    const detail = (await agent.get(`/api/admin/vacancies/${created.body.vacancy.id}`)).body.vacancy;
    expect(detail.folder).toMatchObject({ id: folderId, name: 'Pflegekraft – Köln', path: 'Gemeinsame Dokumente / Stellenangebote / Pflegekraft – Köln' });

    // The old vacancy got nothing on its own.
    expect((await prisma.vacancy.findUniqueOrThrow({ where: { id: old.id } })).driveFolderId).toBeNull();

    // A folder the admin made elsewhere (drive API), linked to the old vacancy.
    const shared = await sharedRoot(agent);
    const mine = (await agent.post(`/api/drive/nodes/${shared}/folders`).send({ name: 'Pflege 2026' })).body.item.id as string;
    const link = await agent.put(`/api/admin/vacancies/${old.id}/folder`).send({ driveFolderId: mine });
    expect(link.status, JSON.stringify(link.body)).toBe(200);
    expect(link.body.folder).toMatchObject({ id: mine, path: 'Gemeinsame Dokumente / Pflege 2026' });

    // New folder in a chosen parent, with a chosen name; a file id is refused; unlink.
    const sub = await agent.put(`/api/admin/vacancies/${old.id}/folder`).send({ newFolder: { parentId: mine, name: 'Alt-Stelle' } });
    expect(sub.body.folder.path).toBe('Gemeinsame Dokumente / Pflege 2026 / Alt-Stelle');
    expect((await agent.put(`/api/admin/vacancies/${old.id}/folder`).send({ driveFolderId: 'nope' })).status).toBe(404);
    expect((await agent.put(`/api/admin/vacancies/${old.id}/folder`).send({ driveFolderId: null })).body.driveFolderId).toBeNull();
    expect((await agent.put(`/api/admin/vacancies/${old.id}/folder`).send({ newFolder: { name: '???' } })).status).toBe(400);
  });

  it('collects a public application in a per-applicant folder: summary, files (hard-linked), case folder inside', async () => {
    const staff = await asStaff();
    const v = await createVacancy();
    const folder = (await staff.agent.put(`/api/admin/vacancies/${v.id}/folder`).send({ newFolder: { name: 'LKW Hamburg' } })).body.folder;
    const cand = await asCandidate({ firstName: 'Ali', lastName: 'Məmmədov' });

    const res = await cand.agent
      .post(`/api/vacancies/${v.slug}/apply`)
      .field('message', 'Salam')
      .field('kinds', 'PASSPORT,CV')
      .attach('files', await makePdf('pass'), { filename: 'pass.pdf', ...PDF })
      .attach('files', await makePdf('cv'), { filename: 'cv.pdf', ...PDF });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    await waitForApplicationUploads();
    await vi.waitFor(async () => {
      await waitForVacancyFolders();
      expect((await prisma.vacancyApplication.findUniqueOrThrow({ where: { id: res.body.application.id } })).driveFolderId).toBeTruthy();
    });
    const app = await prisma.vacancyApplication.findUniqueOrThrow({ where: { id: res.body.application.id } });
    const inVacancy = await children(staff.agent, folder.id);
    const day = app.createdAt.toISOString().slice(0, 10);
    expect(inVacancy.items).toEqual([expect.objectContaining({ id: app.driveFolderId, name: `Məmmədov Ali – ${day}`, kind: 'FOLDER' })]);
    const files = (await children(staff.agent, app.driveFolderId!)).items.map((i) => i.name).sort();
    expect(files).toEqual(['Bewerbung.pdf', 'Lebenslauf – cv.pdf', 'Reisepass – pass.pdf']);

    // Same bytes as the vault file — a hard link, not a second copy (where the file system allows it).
    const pass = await prisma.driveNode.findFirstOrThrow({ where: { parentId: app.driveFolderId!, name: 'Reisepass – pass.pdf' } });
    const vault = await prisma.vaultDocument.findFirstOrThrow({ where: { userId: cand.user.id, kind: 'PASSPORT' } });
    expect(pass.size).toBe(vault.size);
    expect(fs.statSync(storagePath(pass.storageKey!)).nlink).toBe(2);

    // Detail shows the applicant folder on the application.
    const detail = (await staff.agent.get(`/api/admin/vacancies/${v.id}`)).body.vacancy;
    expect(detail.applications[0].folder).toMatchObject({ id: app.driveFolderId, path: `Gemeinsame Dokumente / Stellenangebote / LKW Hamburg / Məmmədov Ali – ${day}` });

    // Re-running the sync does not duplicate anything.
    await staff.agent.put(`/api/admin/vacancies/applications/${app.id}/folder`).send({ folderId: null });
    await waitForVacancyFolders();
    expect((await children(staff.agent, app.driveFolderId!)).items).toHaveLength(3);

    // Accepted → case opened from the application: the client folder goes inside the applicant folder.
    await prisma.vacancyApplication.update({ where: { id: app.id }, data: { status: 'ACCEPTED' } });
    const kase = await staff.agent.post(`/api/admin/candidates/applications/${app.id}/case`).send({});
    expect(kase.status, JSON.stringify(kase.body)).toBe(201);
    await vi.waitFor(async () => {
      expect((await prisma.case.findUniqueOrThrow({ where: { id: kase.body.case.id } })).driveFolderId).toBeTruthy();
    });
    const c = await prisma.case.findUniqueOrThrow({ where: { id: kase.body.case.id } });
    expect(c).toMatchObject({ vacancyId: v.id, driveParentId: app.driveFolderId, profession: 'LKW-Fahrer' });
    expect((await prisma.driveNode.findUniqueOrThrow({ where: { id: c.driveFolderId! } })).parentId).toBe(app.driveFolderId);
    const caseView = (await staff.agent.get(`/api/admin/cases/${c.id}`)).body.case;
    expect(caseView.driveFolders.parent).toMatchObject({ id: app.driveFolderId });
    expect(caseView.driveFolders.folder).toMatchObject({ id: c.driveFolderId });
    // The client never sees the internal placement.
    expect((await cand.agent.get(`/api/cases/${c.id}`)).body.case.driveParentId).toBeUndefined();
  });

  it('staff override the folder of one application; linking a folder later pulls in existing applications', async () => {
    const staff = await asStaff();
    const v = await createVacancy();
    const cand = await asCandidate({ firstName: 'Nigar', lastName: 'Əliyeva' });
    const applied = await cand.agent.post(`/api/vacancies/${v.slug}/apply`).send({ message: 'Hi' });
    expect(applied.status).toBe(201);
    await waitForVacancyFolders();
    // No folder for the vacancy: nothing was created.
    expect((await prisma.vacancyApplication.findUniqueOrThrow({ where: { id: applied.body.application.id } })).driveFolderId).toBeNull();

    const vf = (await staff.agent.put(`/api/admin/vacancies/${v.id}/folder`).send({ newFolder: {} })).body.folder;
    expect(vf.name).toBe('LKW-Fahrer de – Hamburg'); // fixture title: l10n('LKW-Fahrer') = "LKW-Fahrer de"
    await vi.waitFor(async () => {
      await waitForVacancyFolders();
      expect((await prisma.vacancyApplication.findUniqueOrThrow({ where: { id: applied.body.application.id } })).driveFolderId).toBeTruthy();
    });
    const appFolder = (await prisma.vacancyApplication.findUniqueOrThrow({ where: { id: applied.body.application.id } })).driveFolderId!;
    expect((await prisma.driveNode.findUniqueOrThrow({ where: { id: appFolder } })).parentId).toBe(vf.id);

    // Override: the applicant folder moves (same folder, files kept).
    const shared = await sharedRoot(staff.agent);
    const other = (await staff.agent.post(`/api/drive/nodes/${shared}/folders`).send({ name: 'Sonderfälle' })).body.item.id as string;
    const put = await staff.agent.put(`/api/admin/vacancies/applications/${applied.body.application.id}/folder`).send({ folderId: other });
    expect(put.status, JSON.stringify(put.body)).toBe(200);
    expect(put.body.targetFolder).toMatchObject({ id: other });
    expect(put.body.folder).toMatchObject({ id: appFolder, path: expect.stringContaining('Sonderfälle / Əliyeva Nigar') });
    expect((await children(staff.agent, appFolder)).items.map((i) => i.name)).toEqual(['Bewerbung.pdf']);

    // Staff add another candidate with a folder override right away.
    const second = await asCandidate({ firstName: 'Rəşad', lastName: 'Quliyev' });
    const add = await staff.agent.post(`/api/admin/candidates/${second.user.id}/applications`).send({ vacancyId: v.id, folderId: other });
    expect(add.status, JSON.stringify(add.body)).toBe(201);
    await vi.waitFor(async () => {
      await waitForVacancyFolders();
      expect((await prisma.vacancyApplication.findUniqueOrThrow({ where: { id: add.body.application.id } })).driveFolderId).toBeTruthy();
    });
    const names = (await children(staff.agent, other)).items.map((i) => i.name);
    expect(names.some((n) => n.startsWith('Quliyev Rəşad – '))).toBe(true);
  });

  it('new applications pick the profession from our vacancies; the client folder lands in the vacancy folder', async () => {
    const su = await asSuperAdmin();
    const v = await createVacancy({ profession: null, title: { az: 'Aşpaz', de: 'Koch', en: 'Cook', ru: 'Повар' } });
    const vf = (await su.agent.put(`/api/admin/vacancies/${v.id}/folder`).send({ newFolder: { name: 'Köche' } })).body.folder;
    const closed = await createVacancy({ status: 'CLOSED' });

    // Client portal: only open vacancies, listed by /vacancies/options.
    const opts = (await su.agent.get('/api/vacancies/options')).body.items.map((i: { id: string }) => i.id);
    expect(opts).toContain(v.id);
    expect(opts).not.toContain(closed.id);

    const cand = await asCandidate({ profession: 'Sürücü' });
    expect((await cand.agent.post('/api/cases').send({ visaType: 'WORK', vacancyId: closed.id })).status).toBe(400);
    const res = await cand.agent.post('/api/cases').send({ visaType: 'WORK', vacancyId: v.id, profession: 'free text is ignored' });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.case).toMatchObject({ profession: 'Koch', vacancyId: v.id, driveParentId: vf.id });
    await vi.waitFor(async () => {
      const c = await prisma.case.findUniqueOrThrow({ where: { id: res.body.case.id } });
      expect(c.driveFolderId).toBeTruthy();
      expect((await prisma.driveNode.findUniqueOrThrow({ where: { id: c.driveFolderId! } })).parentId).toBe(vf.id);
    });

    // Without a vacancy: the old behaviour (profile profession, Anträge).
    const other = await asCandidate({ profession: 'Kuryer' });
    const plain = await other.agent.post('/api/cases').send({ visaType: 'WORK' });
    expect(plain.body.case).toMatchObject({ profession: 'Kuryer', vacancyId: null, driveParentId: null });

    // Admin: changing the vacancy sets the profession and moves the client folder; an override wins; null = default place.
    const v2 = await createVacancy({ title: { az: 'Sürücü', de: 'Fahrer', en: 'Driver', ru: 'Водитель' }, profession: 'Berufskraftfahrer' });
    const v2f = (await su.agent.put(`/api/admin/vacancies/${v2.id}/folder`).send({ newFolder: {} })).body.folder;
    const patched = await su.agent.patch(`/api/admin/cases/${plain.body.case.id}`).send({ vacancyId: v2.id });
    expect(patched.status, JSON.stringify(patched.body)).toBe(200);
    expect(patched.body.case).toMatchObject({ profession: 'Berufskraftfahrer', driveParentId: v2f.id });
    await vi.waitFor(async () => {
      const c = await prisma.case.findUniqueOrThrow({ where: { id: plain.body.case.id } });
      expect((await prisma.driveNode.findUniqueOrThrow({ where: { id: c.driveFolderId! } })).parentId).toBe(v2f.id);
    });
    const c2 = await prisma.case.findUniqueOrThrow({ where: { id: plain.body.case.id } });
    // A client folder cannot go into itself.
    expect((await su.agent.patch(`/api/admin/cases/${c2.id}`).send({ driveParentId: c2.driveFolderId })).body.error).toBe('FOLDER_INSIDE_ITSELF');
    expect((await su.agent.patch(`/api/admin/cases/${c2.id}`).send({ driveParentId: null })).body.case.driveParentId).toBeNull();
    await vi.waitFor(async () => {
      const node = await prisma.driveNode.findUniqueOrThrow({ where: { id: c2.driveFolderId! }, include: { parent: true } });
      expect(node.parent?.name).not.toBe(v2f.name);
    });

    // Old free-text professions stay readable.
    const legacy = await prisma.case.create({ data: { number: 'TV-2026-0999', clientId: cand.user.id, profession: 'Freitext-Beruf', status: 'CANCELLED' } });
    expect((await su.agent.get(`/api/admin/cases/${legacy.id}`)).body.case.profession).toBe('Freitext-Beruf');
  });
});
