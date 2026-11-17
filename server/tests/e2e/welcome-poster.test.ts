import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Test } from 'supertest';
import { PDFDocument } from 'pdf-lib';
import { prisma } from '../helpers/db';
import { uniq } from '../helpers/factories';
import { binaryParser } from '../helpers/files';
import { cvPdfText } from '../unit/cvPdfText';
import { publicDir } from '../../src/lib/publicImages.js';
import { asCandidate, asCompany, cleanJobs } from './vacancies.fixtures';

beforeEach(cleanJobs);

const bin = async (req: Test) => {
  const res = await req.buffer(true).parse(binaryParser);
  return res as typeof res & { body: Buffer };
};

const placed = async () => {
  const employer = await asCompany();
  const worker = await asCandidate({ firstName: 'Nicat', lastName: 'Kərimov' });
  const c = await prisma.case.create({ data: { number: uniq('TV-'), clientId: worker.user.id, profession: 'LKW-Fahrer', companyId: employer.company.id, status: 'APPROVED' } });
  return { employer, worker, c };
};

/** Company portal: bilingual A3 welcome poster for an incoming worker (GET /api/company/workers/:caseId/welcome-poster.pdf). */
describe('welcome poster', () => {
  it('renders the first name, company, logo, buddy from the checklist and the first work day', async () => {
    const { employer, c } = await placed();
    // Company logo as stored by the public image pipeline (/uploads/logos/<hex32>.webp).
    const hex = crypto.randomBytes(16).toString('hex');
    await fs.mkdir(path.join(publicDir(), 'logos'), { recursive: true });
    await fs.writeFile(path.join(publicDir(), 'logos', `${hex}.webp`), await sharp({ create: { width: 240, height: 90, channels: 4, background: '#0b3e7e' } }).webp().toBuffer());
    await prisma.company.update({ where: { id: employer.company.id }, data: { name: 'Muster Logistik GmbH', logo: { url: `/uploads/logos/${hex}.webp`, w: 240, h: 90 } } });

    // The checklist creates BUDDY / FIRST_DAY; the company notes the buddy and sets the first day.
    const list = await employer.agent.get(`/api/company/workers/${c.id}/checklist`);
    expect(list.status).toBe(200);
    const buddy = list.body.items.find((i: { key: string }) => i.key === 'BUDDY');
    const firstDay = list.body.items.find((i: { key: string }) => i.key === 'FIRST_DAY');
    await employer.agent.patch(`/api/company/workers/${c.id}/checklist/${buddy.id}`).send({ note: 'Jana Schulz\nTel. intern 12' }).expect(200);
    await employer.agent.patch(`/api/company/workers/${c.id}/checklist/${firstDay.id}`).send({ dueDate: '2027-02-01' }).expect(200);

    const res = await bin(employer.agent.get(`/api/company/workers/${c.id}/welcome-poster.pdf`));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    const doc = await PDFDocument.load(res.body);
    expect(doc.getPageCount()).toBe(1);
    expect(Math.round(doc.getPage(0).getSize().height)).toBe(1191); // A3 portrait
    const text = await cvPdfText(res.body);
    expect(text).toContain('Xoş gəlmisiniz, Nicat!');
    expect(text).toContain('Herzlich willkommen, Nicat!');
    expect(text).toContain('Muster Logistik GmbH');
    expect(text).toContain('Jana Schulz');
    expect(text).not.toContain('Tel. intern');
    expect(text).toContain('01.02.2027');
    expect(text).not.toContain('Kərimov'); // first name only
    expect(await prisma.auditLog.count({ where: { action: 'EMPLOYER_WELCOME_POSTER', target: `case:${c.id}` } })).toBe(1);
  });

  it('is limited to the company’s own approved, not-left workers', async () => {
    const { employer, worker, c } = await placed();
    const other = await asCompany();
    expect((await other.agent.get(`/api/company/workers/${c.id}/welcome-poster.pdf`)).status).toBe(404);
    expect((await worker.agent.get(`/api/company/workers/${c.id}/welcome-poster.pdf`)).status).toBe(403);
    await prisma.case.update({ where: { id: c.id }, data: { status: 'DECISION_PENDING' } });
    expect((await employer.agent.get(`/api/company/workers/${c.id}/welcome-poster.pdf`)).status).toBe(404);
    expect((await employer.agent.get('/api/company/workers/not-a-case!/welcome-poster.pdf')).status).toBe(404);
  });
});
