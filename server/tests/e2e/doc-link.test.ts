import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { asAdmin, asClient } from '../helpers/api';
import { prisma } from '../helpers/db';
import { createClient, l10n } from '../helpers/factories';
import { makePdf } from '../helpers/files';
import { clientCase, expectStatus, uploadDoc } from '../helpers/workflow';
import { config } from '../../src/config.js';
import { createCase } from '../../src/lib/caseFlow.js';
import { createRequirements } from '../../src/lib/docsIntel/requirementTemplates.js';
import { copyDocumentToDrive } from '../../src/lib/drive/caseFolders.js';
import { backfillLinkedDocuments } from '../../src/lib/docLink/service.js';

/**
 * Linked case documents (lib/docLink): a document both the initial and the embassy list ask for is uploaded once and
 * attached to both. The copy follows the staff review of its source (unless reviewed on its own), a replacement and
 * a deletion carry over, a requirement added later is filled at once, the backfill links existing cases, and the
 * drive client folder gets no second file.
 */

const fileExists = (storedName: string) =>
  fs.access(path.join(config.uploads.privateDir, storedName)).then(
    () => true,
    () => false,
  );

const embassyReq = (caseId: string, key: string) =>
  prisma.documentRequirement.create({ data: { caseId, stage: 'EMBASSY', key, title: l10n(key), required: true, sortOrder: 50 } });

const docsOf = (requirementId: string) => prisma.document.findMany({ where: { requirementId }, orderBy: { createdAt: 'asc' } });

const review = (admin: Awaited<ReturnType<typeof asAdmin>>, caseId: string, docId: string, status: 'ACCEPTED' | 'REJECTED' | 'PENDING', note?: string) =>
  admin.agent.post(`/api/admin/cases/${caseId}/documents/${docId}/review`).send({ status, ...(note ? { note } : {}) });

describe('linked documents (initial ↔ embassy)', () => {
  it('client upload appears in the embassy list; review, replacement and deletion carry over; no second drive file', async () => {
    const client = await asClient();
    const admin = await asAdmin();
    const c = expectStatus(await client.agent.post('/api/cases').send({ profession: 'LKW sürücüsü' }), 201).body.case as { id: string };
    // The embassy list exists early (staff listed a passport and a driving licence there).
    const embPassport = await embassyReq(c.id, 'PASSPORT');
    const embLicence = await embassyReq(c.id, 'DRIVING_LICENCE');
    const initial = (await clientCase(client.agent, c.id)).requirements as unknown as { id: string; stage: string; key: string | null; required: boolean }[];
    const iniPassport = initial.find((r) => r.stage === 'INITIAL' && r.key === 'PASSPORT')!;
    const iniLicence = initial.find((r) => r.stage === 'INITIAL' && r.key === 'DRIVING_LICENCE')!;

    // Upload the passport for the initial list → the same file is attached to the embassy passport.
    const src = expectStatus(await uploadDoc(client.agent, c.id, iniPassport.id, 'pasport.pdf'), 201).body.document as { id: string; storedName: string };
    let copies = await docsOf(embPassport.id);
    expect(copies).toHaveLength(1);
    expect(copies[0]).toMatchObject({ linkedFromId: src.id, linkedFromStage: 'INITIAL', stage: 'EMBASSY', status: 'PENDING', originalName: 'pasport.pdf', linkDetached: false });
    expect(copies[0].storedName).not.toBe(src.storedName); // own file: deleting one never removes the other's
    expect(await fileExists(copies[0].storedName)).toBe(true);
    // The client sees it in the embassy list with its origin.
    const seen = (await clientCase(client.agent, c.id)).requirements.find((r) => r.id === embPassport.id)!.documents as unknown as { linkedFromStage: string }[];
    expect(seen[0].linkedFromStage).toBe('INITIAL');

    // Drive: the linked copy gets no file of its own in the client folder (the source's copy is that file).
    expect(await copyDocumentToDrive(copies[0].id, { pending: true })).toBe('exists');
    expect(await prisma.driveNode.count({ where: { documentId: copies[0].id } })).toBe(0);

    // Deleting the own pending upload removes its pending copy (row and file) too.
    const licence = expectStatus(await uploadDoc(client.agent, c.id, iniLicence.id, 'vesiqe.pdf'), 201).body.document as { id: string };
    const licenceCopy = (await docsOf(embLicence.id))[0];
    expect(licenceCopy.linkedFromId).toBe(licence.id);
    expectStatus(await client.agent.delete(`/api/cases/${c.id}/documents/${licence.id}`), 200);
    expect(await docsOf(embLicence.id)).toHaveLength(0);
    expect(await fileExists(licenceCopy.storedName)).toBe(false);

    // Hand in the other required initial documents.
    for (const r of initial.filter((q) => q.stage === 'INITIAL' && q.required && q.id !== iniPassport.id)) expectStatus(await uploadDoc(client.agent, c.id, r.id), 201);
    expectStatus(await client.agent.post(`/api/cases/${c.id}/submit`), 200);

    // Reject the source → the copy is rejected with the same note.
    expectStatus(await review(admin, c.id, src.id, 'REJECTED', 'Surət oxunmur'), 200);
    copies = await docsOf(embPassport.id);
    expect(copies[0]).toMatchObject({ status: 'REJECTED', reviewNote: 'Surət oxunmur' });

    // Replacement upload → a new copy waits in the embassy list too.
    const replaced = expectStatus(await uploadDoc(client.agent, c.id, iniPassport.id, 'pasport-yeni.pdf'), 201).body.document as { id: string };
    copies = await docsOf(embPassport.id);
    expect(copies).toHaveLength(2);
    const fresh = copies.find((d) => d.linkedFromId === replaced.id)!;
    expect(fresh).toMatchObject({ status: 'PENDING', originalName: 'pasport-yeni.pdf' });

    // Accept the replacement → the copy is accepted.
    expectStatus(await review(admin, c.id, replaced.id, 'ACCEPTED'), 200);
    expect((await prisma.document.findUniqueOrThrow({ where: { id: fresh.id } })).status).toBe('ACCEPTED');

    // Staff review the copy on its own → it no longer follows its source.
    expectStatus(await review(admin, c.id, fresh.id, 'REJECTED', 'Səfirlik üçün rəngli surət lazımdır'), 200);
    expect((await prisma.document.findUniqueOrThrow({ where: { id: fresh.id } })).linkDetached).toBe(true);
    expectStatus(await review(admin, c.id, replaced.id, 'PENDING'), 200);
    expectStatus(await review(admin, c.id, replaced.id, 'ACCEPTED'), 200);
    expect(await prisma.document.findUniqueOrThrow({ where: { id: fresh.id } })).toMatchObject({ status: 'REJECTED', reviewNote: 'Səfirlik üçün rəngli surət lazımdır' });

    // A requirement staff add later (with its document type) gets the accepted initial document at once.
    const cvSource = (await prisma.document.findFirstOrThrow({ where: { caseId: c.id, stage: 'INITIAL', requirement: { key: 'CV' } } })).id;
    expectStatus(await review(admin, c.id, cvSource, 'ACCEPTED'), 200);
    const added = expectStatus(await admin.agent.post(`/api/admin/cases/${c.id}/requirements`).send({ stage: 'EMBASSY', title: l10n('CV'), key: 'CV' }), 201);
    expect(added.body.linked).toBe(1);
    expect(await docsOf(added.body.requirement.id)).toMatchObject([{ linkedFromId: cvSource, status: 'ACCEPTED', linkedFromStage: 'INITIAL' }]);
    // A requirement holding only automatic copies can still be removed (the copies go with it, the source stays).
    expectStatus(await admin.agent.delete(`/api/admin/cases/${c.id}/requirements/${added.body.requirement.id}`), 200);
    expect(await prisma.document.findUnique({ where: { id: cvSource } })).not.toBeNull();
  });

  it('backfill links accepted documents of existing cases once (idempotent)', async () => {
    const { user } = await createClient();
    const c = await createCase(user.id, { profession: 'Aşpaz', visaType: 'WORK' });
    await prisma.$transaction((tx) => createRequirements(tx, c.id, 'EMBASSY', null));
    await prisma.case.update({ where: { id: c.id }, data: { status: 'EMBASSY_DOCUMENTS' } });
    const embPassport = await embassyReq(c.id, 'PASSPORT');
    const iniPassport = await prisma.documentRequirement.findFirstOrThrow({ where: { caseId: c.id, stage: 'INITIAL', key: 'PASSPORT' } });
    const storedName = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}.pdf`;
    const buf = await makePdf('PASS');
    await fs.mkdir(config.uploads.privateDir, { recursive: true });
    await fs.writeFile(path.join(config.uploads.privateDir, storedName), buf);
    const src = await prisma.document.create({
      data: { caseId: c.id, requirementId: iniPassport.id, stage: 'INITIAL', originalName: 'pass.pdf', storedName, mimeType: 'application/pdf', size: buf.length, status: 'ACCEPTED', uploadedById: user.id },
    });

    const first = await backfillLinkedDocuments();
    expect(first.linked).toBeGreaterThanOrEqual(1);
    expect(await docsOf(embPassport.id)).toMatchObject([{ linkedFromId: src.id, status: 'ACCEPTED' }]);
    const before = await prisma.document.count({ where: { caseId: c.id } });
    await backfillLinkedDocuments();
    expect(await prisma.document.count({ where: { caseId: c.id } })).toBe(before);
  });
});
