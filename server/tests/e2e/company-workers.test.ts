import { beforeEach, describe, expect, it } from 'vitest';
import zlib from 'node:zlib';
import { prisma } from '../helpers/db';
import { binaryParser } from '../helpers/files';
import { uniq } from '../helpers/factories';
import { asCandidate, asCompany, cleanJobs } from './vacancies.fixtures';

beforeEach(cleanJobs);

/** Reads one entry of a zip buffer (deflated or stored) — enough to look inside an .xlsx. */
const zipEntry = (zip: Buffer, name: string) => {
  let i = 0;
  while (i < zip.length - 30 && zip.readUInt32LE(i) === 0x04034b50) {
    const method = zip.readUInt16LE(i + 8);
    const size = zip.readUInt32LE(i + 18);
    const nameLen = zip.readUInt16LE(i + 26);
    const extra = zip.readUInt16LE(i + 28);
    const entry = zip.subarray(i + 30, i + 30 + nameLen).toString('utf8');
    const start = i + 30 + nameLen + extra;
    const data = zip.subarray(start, start + size);
    if (entry === name) return (method === 8 ? zlib.inflateRawSync(data) : data).toString('utf8');
    i = start + size;
  }
  return null;
};

const DAY = 24 * 60 * 60 * 1000;

const setup = async () => {
  const employer = await asCompany();
  const other = await asCompany();
  const inDocs = await asCandidate({ firstName: 'Orxan', lastName: 'Həsənov', passportNumber: 'C7654321' });
  const atEmbassy = await asCandidate({ firstName: 'Samir', lastName: 'Babayev' });
  const approved = await asCandidate({ firstName: 'Elvin', lastName: 'Rzayev' });
  const landed = await asCandidate({ firstName: 'Nicat', lastName: 'Kərimov' });
  const foreign = await asCandidate({ firstName: 'Fremd', lastName: 'Person' });
  const now = Date.now();
  const mk = (clientId: string, data: Record<string, unknown>) =>
    prisma.case.create({ data: { number: uniq('TV-'), clientId, profession: 'LKW-Fahrer', companyId: employer.company.id, ...data } });

  const c1 = await mk(inDocs.user.id, { createdAt: new Date(now - 10 * DAY) });
  const c2 = await mk(atEmbassy.user.id, { status: 'APPOINTMENT_SCHEDULED', visaType: 'AUSBILDUNG', appointmentAt: new Date(now + 5 * DAY), createdAt: new Date(now - 60 * DAY) });
  await prisma.caseEvent.create({ data: { caseId: c2.id, type: 'STATUS_CHANGED', fromStatus: 'DOCUMENTS_REVIEW', toStatus: 'CONTRACT_SENT', createdAt: new Date(now - 40 * DAY) } });
  await prisma.caseEvent.create({ data: { caseId: c2.id, type: 'STATUS_CHANGED', fromStatus: 'EMBASSY_REVIEW', toStatus: 'APPOINTMENT_SCHEDULED', createdAt: new Date(now - 3 * DAY) } });
  const c3 = await mk(approved.user.id, { status: 'APPROVED', decisionAt: new Date(now - 2 * DAY), visaValidFrom: new Date(now + 10 * DAY) });
  await prisma.arrivalPlan.create({ data: { caseId: c3.id, clientId: approved.user.id, status: 'SUBMITTED', flightDate: new Date(now + 12 * DAY), arrivalTime: new Date(now + 12 * DAY + 3600_000), flightNumber: 'J2 123', pickupDetails: 'Abholung +49 170 000' } });
  const c4 = await mk(landed.user.id, { status: 'APPROVED', decisionAt: new Date(now - 40 * DAY) });
  await prisma.arrivalPlan.create({ data: { caseId: c4.id, clientId: landed.user.id, status: 'COMPLETED', arrivalTime: new Date(now - 5 * DAY) } });
  await prisma.case.create({ data: { number: uniq('TV-'), clientId: foreign.user.id, profession: 'Koch', companyId: other.company.id } });
  await prisma.interview.create({
    data: { companyId: employer.company.id, candidateId: inDocs.user.id, startsAt: new Date(now + 2 * DAY), endsAt: new Date(now + 2 * DAY + 1800_000), status: 'CONFIRMED' },
  });
  return { employer, c1, c2, c3, c4, inDocs };
};

describe('employer worker tracking panel', () => {
  it('returns stage, dates, arrival, next interview and summary for own workers only', async () => {
    const { employer, c1, c2, c3, c4 } = await setup();
    const res = await employer.agent.get('/api/company/workers');
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(4);
    const by = (id: string) => res.body.items.find((w: { id: string }) => w.id === id);

    expect(by(c1.id)).toMatchObject({ name: 'Orxan H.', stage: 'DOCUMENTS', daysInStage: 10, visaType: 'WORK' });
    expect(by(c1.id).nextInterview).toMatchObject({ status: 'CONFIRMED' });
    expect(by(c2.id)).toMatchObject({ stage: 'APPOINTMENT', daysInStage: 3, visaType: 'AUSBILDUNG' });
    expect(by(c2.id).appointmentAt).toBeTruthy();
    expect(by(c2.id).timeline.map((t: { stage: string }) => t.stage)).toEqual(['DOCUMENTS', 'CONTRACT', 'APPOINTMENT']);
    expect(by(c3.id)).toMatchObject({ stage: 'APPROVED', arrival: { status: 'SUBMITTED' } });
    expect(by(c3.id).arrival.arrivalTime).toBeTruthy();
    expect(by(c4.id)).toMatchObject({ stage: 'ARRIVED' });
    expect(res.body.summary).toMatchObject({ inProcess: 2, approved: 1, arrived: 1 });
    expect(typeof res.body.summary.arrivingThisMonth).toBe('number');

    // Privacy: no contact data, passport numbers, flight numbers or pickup details.
    const raw = JSON.stringify(res.body);
    for (const secret of ['+994501112233', 'C7654321', 'Həsənov', 'J2 123', '+49 170', 'Nizami', 'Fremd']) expect(raw).not.toContain(secret);
    expect(raw).not.toContain('@');
  });

  it('exports the panel as an Excel sheet', async () => {
    const { employer } = await setup();
    const res = await employer.agent.get('/api/company/workers/export.xlsx?lang=de').buffer(true).parse(binaryParser);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('spreadsheetml');
    expect(res.headers['content-disposition']).toContain('.xlsx');
    const buf = res.body as Buffer;
    expect(buf.subarray(0, 2).toString()).toBe('PK');
    const sheet = zipEntry(buf, 'xl/worksheets/sheet1.xml')!;
    expect(sheet).toContain('Botschaftstermin');
    expect(sheet).toContain('Orxan H.');
    expect(sheet).toContain('Angekommen');
    expect(sheet).toContain('Ausbildung');
    expect(sheet).not.toContain('Fremd');
    expect(sheet).not.toContain('C7654321');
    expect(sheet).not.toContain('+994501112233');

    const en = await employer.agent.get('/api/company/workers/export.xlsx?lang=en').buffer(true).parse(binaryParser);
    expect(zipEntry(en.body as Buffer, 'xl/worksheets/sheet1.xml')).toContain('Embassy appointment');
  });

  it('keeps the export to employers', async () => {
    const { inDocs } = await setup();
    expect((await inDocs.agent.get('/api/company/workers/export.xlsx')).status).toBe(403);
  });
});
