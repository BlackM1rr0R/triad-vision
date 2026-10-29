import fs from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { asStaff, type Agent } from '../helpers/api';
import { prisma } from '../helpers/db';
import { binaryParser } from '../helpers/files';
import { asCandidate, asCompany, createVacancy } from './vacancies.fixtures';
import { cleanOps } from './ops.fixtures';
import { runRetention } from '../../src/jobs/retention.js';
import { SKILL_VIDEO_DIR, SKILL_VIDEO_MAX_BYTES, skillVideoPath } from '../../src/lib/skillVideos/media.js';

beforeEach(async () => {
  await cleanOps();
  for (const f of fs.readdirSync(SKILL_VIDEO_DIR)) fs.rmSync(skillVideoPath(f), { force: true });
});

// ─── Fixtures: tiny but well-formed containers ──────────────────────────

const box = (type: string, body: Buffer) => {
  const h = Buffer.alloc(8);
  h.writeUInt32BE(8 + body.length, 0);
  h.write(type, 4, 'latin1');
  return Buffer.concat([h, body]);
};

/** MP4: ftyp + moov/mvhd (version 0) with the given duration, padded with a "free" box. */
const mp4 = (seconds = 30) => {
  const ftyp = box('ftyp', Buffer.concat([Buffer.from('isom'), Buffer.from([0, 0, 2, 0]), Buffer.from('isomiso2')]));
  const mvhd = Buffer.alloc(100);
  mvhd.writeUInt32BE(1000, 12); // timescale
  mvhd.writeUInt32BE(seconds * 1000, 16); // duration
  return Buffer.concat([ftyp, box('free', Buffer.alloc(4096, 1)), box('moov', box('mvhd', mvhd))]);
};

const ebml = (id: number[], body: Buffer) => Buffer.concat([Buffer.from(id), Buffer.from([0x80 | body.length]), body]);

/** WebM: EBML header (DocType webm) + Segment (unknown size) + Info (+ Duration in ms when given) + a cluster. */
const webm = (seconds?: number) => {
  const header = ebml([0x1a, 0x45, 0xdf, 0xa3], ebml([0x42, 0x82], Buffer.from('webm')));
  const scale = ebml([0x2a, 0xd7, 0xb1], Buffer.from([0x0f, 0x42, 0x40]));
  const dur = Buffer.alloc(8);
  if (seconds != null) dur.writeDoubleBE(seconds * 1000);
  const info = ebml([0x15, 0x49, 0xa9, 0x66], Buffer.concat([scale, ...(seconds != null ? [ebml([0x44, 0x89], dur)] : [])]));
  const segment = Buffer.concat([Buffer.from([0x18, 0x53, 0x80, 0x67, 0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]), info]);
  return Buffer.concat([header, segment, Buffer.from([0x1f, 0x43, 0xb6, 0x75, 0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]), Buffer.alloc(4096, 2)]);
};

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 3)]);

const upload = (agent: Agent, opts: { file?: Buffer; name?: string; type?: string; title?: string; skill?: string; consent?: boolean; source?: string; durationSec?: number; poster?: Buffer } = {}) => {
  let r = agent
    .post('/api/skill-videos')
    .field('title', opts.title ?? 'Fahrzeugkontrolle')
    .field('skill', opts.skill ?? 'driver')
    .field('source', opts.source ?? 'UPLOADED')
    .field('consent', String(opts.consent ?? true));
  if (opts.durationSec != null) r = r.field('durationSec', String(opts.durationSec));
  r = r.attach('file', opts.file ?? mp4(), { filename: opts.name ?? 'check.mp4', contentType: opts.type ?? 'video/mp4' });
  if (opts.poster) r = r.attach('poster', opts.poster, { filename: 'poster.jpg', contentType: 'image/jpeg' });
  return r;
};

/** Candidate presented to an employer (PROPOSED application), plus an unrelated second employer. */
const setup = async () => {
  const staff = await asStaff();
  const employer = await asCompany();
  const other = await asCompany();
  const candidate = await asCandidate({ profession: 'LKW-Fahrer' });
  const vacancy = await createVacancy({ companyId: employer.company.id });
  const application = await prisma.vacancyApplication.create({ data: { vacancyId: vacancy.id, userId: candidate.user.id, status: 'PROPOSED' } });
  return { staff, employer, other, candidate, vacancy, application };
};

const employerIds = async (agent: Agent) =>
  ((await agent.get('/api/company/skill-videos')).body.items as { videos: { id: string }[] }[]).flatMap((i) => i.videos.map((v) => v.id)).sort();

describe('skill videos: upload validation', () => {
  it('accepts real MP4 / WebM, refuses fake MIME, wrong types, long videos and a sixth video', async () => {
    const { candidate: c } = await setup();
    const empty = await c.agent.get('/api/skill-videos');
    expect(empty.status).toBe(200);
    expect(empty.body).toMatchObject({ items: [], limits: { maxCount: 5, maxBytes: SKILL_VIDEO_MAX_BYTES, maxSeconds: 180, maxRecordSeconds: 90 }, suggestedSkill: 'driver' });

    // Fake MIME: bytes of a PDF / random data claimed to be a video.
    const fake = await upload(c.agent, { file: Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(4096, 7)]) });
    expect(fake.status).toBe(400);
    expect(fake.body.error).toBe('FILE_CONTENT_MISMATCH');
    expect((await upload(c.agent, { file: webm(10), name: 'x.mp4', type: 'video/mp4' })).body.error).toBe('FILE_CONTENT_MISMATCH');
    expect((await upload(c.agent, { file: Buffer.from('hello'), name: 'x.txt', type: 'text/plain' })).body.error).toBe('UNSUPPORTED_FILE_TYPE');
    // Nothing unverified stays on disk.
    expect(fs.readdirSync(SKILL_VIDEO_DIR)).toEqual([]);

    // Duration from the container: 200 s MP4 is over the 3-minute limit.
    expect((await upload(c.agent, { file: mp4(200) })).body.error).toBe('VIDEO_TOO_LONG');
    // A browser recording without a container duration: the browser's measurement counts (90 s for recordings).
    expect((await upload(c.agent, { file: webm(), name: 'rec.webm', type: 'video/webm', source: 'RECORDED', durationSec: 95 })).body.error).toBe('VIDEO_TOO_LONG');
    // Bad form fields.
    expect((await upload(c.agent, { skill: 'juggling' })).status).toBe(400);
    expect((await upload(c.agent, { title: ' ' })).status).toBe(400);

    const a = await upload(c.agent, { file: mp4(42), poster: JPEG });
    expect(a.status).toBe(201);
    expect(a.body.video).toMatchObject({ title: 'Fahrzeugkontrolle', skill: 'driver', mimeType: 'video/mp4', durationSec: 42, hasPoster: true, status: 'PENDING', consent: true, visibleToEmployers: false });
    const b = await upload(c.agent, { file: webm(12.4), name: 'weld.webm', type: 'video/webm;codecs=vp9', skill: 'welder', poster: Buffer.from('not an image at all, just text....') });
    expect(b.status).toBe(201);
    expect(b.body.video).toMatchObject({ mimeType: 'video/webm', durationSec: 12, hasPoster: false });
    const rec = await upload(c.agent, { file: webm(), name: 'rec.webm', type: 'video/webm', source: 'RECORDED', durationSec: 61.6 });
    expect(rec.body.video).toMatchObject({ source: 'RECORDED', durationSec: 62 });
    // iPhone .mov sent as octet-stream: the extension decides, the bytes confirm.
    expect((await upload(c.agent, { name: 'IMG_0001.MOV', type: 'application/octet-stream' })).body.video).toMatchObject({ mimeType: 'video/quicktime' });
    expect((await upload(c.agent)).status).toBe(201);
    const sixth = await upload(c.agent);
    expect(sixth.status).toBe(409);
    expect(sixth.body.error).toBe('SKILL_VIDEO_LIMIT');
    expect((await c.agent.get('/api/skill-videos')).body.items).toHaveLength(5);

    // Poster served to the owner; not another candidate's video.
    const poster = await c.agent.get(`/api/skill-videos/${a.body.video.id}/poster`).buffer(true).parse(binaryParser);
    expect(poster.status).toBe(200);
    expect(poster.headers['content-type']).toBe('image/jpeg');
    const stranger = await asCandidate();
    expect((await stranger.agent.get(`/api/skill-videos/${a.body.video.id}/file`)).status).toBe(404);
    expect((await stranger.agent.delete(`/api/skill-videos/${a.body.video.id}`)).status).toBe(404);
    // Staff cannot upload as a candidate.
    const staff = await asStaff();
    expect((await upload(staff.agent)).status).toBe(403);
  });

  it('refuses files over 150 MB', async () => {
    const { candidate: c } = await setup();
    const big = Buffer.concat([mp4(), Buffer.alloc(SKILL_VIDEO_MAX_BYTES + 1024)]);
    const res = await upload(c.agent, { file: big });
    expect(res.status).toBe(413);
    expect(res.body.error).toBe('FILE_TOO_LARGE');
    expect(await prisma.skillVideo.count()).toBe(0);
  }, 120_000);
});

describe('skill videos: review, consent and employer visibility', () => {
  it('only approved + consented videos of presented candidates reach the employer', async () => {
    const { staff, employer, other, candidate: c, application } = await setup();
    const v = (await upload(c.agent, { consent: false })).body.video;
    const w = (await upload(c.agent, { title: 'Sicherheitsausrüstung', skill: 'safety', consent: true })).body.video;

    // Pending: nobody outside sees it.
    expect(await employerIds(employer.agent)).toEqual([]);
    expect((await employer.agent.get(`/api/company/skill-videos/${w.id}/file`)).status).toBe(404);

    // Review queue.
    const queue = await staff.agent.get('/api/admin/skill-videos');
    expect(queue.status).toBe(200);
    expect(queue.body.items.map((i: { id: string }) => i.id).sort()).toEqual([v.id, w.id].sort());
    expect(queue.body.counts).toEqual({ PENDING: 2 });
    expect((await c.agent.get('/api/admin/skill-videos')).status).toBe(403);

    // Approve both: only the consented one is visible.
    expect((await staff.agent.post(`/api/admin/skill-videos/${v.id}/approve`)).status).toBe(200);
    expect((await staff.agent.post(`/api/admin/skill-videos/${w.id}/approve`)).body.video).toMatchObject({ status: 'APPROVED', visibleToEmployers: true });
    expect((await staff.agent.post(`/api/admin/skill-videos/${w.id}/approve`)).status).toBe(409);
    const listed = await employer.agent.get('/api/company/skill-videos');
    expect(listed.body.items).toEqual([{ applicationId: application.id, videos: [expect.objectContaining({ id: w.id, title: 'Sicherheitsausrüstung', skill: 'safety' })] }]);
    expect(listed.body.items[0].videos[0]).not.toHaveProperty('status');
    expect(listed.body.items[0].videos[0]).not.toHaveProperty('storedName');
    expect((await employer.agent.get(`/api/company/skill-videos/${v.id}/file`)).status).toBe(404);

    // Another employer (candidate not presented there) sees nothing.
    expect(await employerIds(other.agent)).toEqual([]);
    expect((await other.agent.get(`/api/company/skill-videos/${w.id}/file`)).status).toBe(404);
    expect((await other.agent.post(`/api/company/skill-videos/${w.id}/view`).send({})).status).toBe(404);

    // Consent given later → visible; withdrawn → hidden at once.
    expect((await c.agent.patch(`/api/skill-videos/${v.id}`).send({ consent: true })).body.video).toMatchObject({ consent: true, visibleToEmployers: true });
    expect(await employerIds(employer.agent)).toEqual([v.id, w.id].sort());
    const off = await c.agent.patch(`/api/skill-videos/${w.id}`).send({ consent: false });
    expect(off.body.video).toMatchObject({ consent: false, visibleToEmployers: false });
    expect(off.body.video.consentWithdrawnAt).not.toBeNull();
    expect(await employerIds(employer.agent)).toEqual([v.id]);
    expect((await employer.agent.get(`/api/company/skill-videos/${w.id}/file`)).status).toBe(404);
    const consents = await prisma.consentRecord.findMany({ where: { userId: c.user.id, type: 'SKILL_VIDEO' }, orderBy: { createdAt: 'asc' } });
    expect(consents.map((r) => r.granted)).toEqual([true, true, false]);

    // A renamed approved video goes back to review (employers read the title).
    expect((await c.agent.patch(`/api/skill-videos/${v.id}`).send({ title: 'Neuer Titel' })).body.video.status).toBe('PENDING');
    expect(await employerIds(employer.agent)).toEqual([]);

    // Application no longer employer-visible (staff took it back to NEW) → hidden.
    await staff.agent.post(`/api/admin/skill-videos/${v.id}/approve`);
    expect(await employerIds(employer.agent)).toEqual([v.id]);
    await prisma.vacancyApplication.update({ where: { id: application.id }, data: { status: 'NEW' } });
    expect(await employerIds(employer.agent)).toEqual([]);
    expect((await employer.agent.get(`/api/company/skill-videos/${v.id}/file`)).status).toBe(404);
  });

  it('a rejection carries the reason and notifies the candidate; replacing sends it back to review', async () => {
    const { staff, candidate: c } = await setup();
    await prisma.user.update({ where: { id: c.user.id }, data: { locale: 'de' } });
    const v = (await upload(c.agent)).body.video;
    expect((await staff.agent.post(`/api/admin/skill-videos/${v.id}/reject`).send({ reason: '' })).status).toBe(400);
    const rej = await staff.agent.post(`/api/admin/skill-videos/${v.id}/reject`).send({ reason: 'Gesicht und Kennzeichen eines Dritten sichtbar' });
    expect(rej.status).toBe(200);
    expect(rej.body.video).toMatchObject({ status: 'REJECTED', rejectReason: 'Gesicht und Kennzeichen eines Dritten sichtbar' });

    const n = await prisma.notification.findFirstOrThrow({ where: { userId: c.user.id, type: 'SKILL_VIDEO_REJECTED' } });
    expect(n.title).toBe('Kompetenzvideo nicht angenommen');
    expect(n.body).toContain('Gesicht und Kennzeichen eines Dritten sichtbar');
    const own = (await c.agent.get('/api/skill-videos')).body.items[0];
    expect(own).toMatchObject({ status: 'REJECTED', rejectReason: 'Gesicht und Kennzeichen eines Dritten sichtbar' });

    const oldFile = (await prisma.skillVideo.findUniqueOrThrow({ where: { id: v.id } })).storedName;
    const rep = await c.agent
      .post(`/api/skill-videos/${v.id}/replace`)
      .field('title', 'Fahrzeugkontrolle 2')
      .field('skill', 'driver')
      .field('consent', 'true')
      .attach('file', mp4(20), { filename: 'new.mp4', contentType: 'video/mp4' });
    expect(rep.status).toBe(200);
    expect(rep.body.video).toMatchObject({ id: v.id, status: 'PENDING', rejectReason: null, durationSec: 20, consent: true });
    expect(fs.existsSync(skillVideoPath(oldFile))).toBe(false);
    // Fake content on replace keeps the old video.
    const bad = await c.agent
      .post(`/api/skill-videos/${v.id}/replace`)
      .field('title', 'x')
      .field('skill', 'driver')
      .attach('file', Buffer.alloc(4096, 9), { filename: 'new.mp4', contentType: 'video/mp4' });
    expect(bad.status).toBe(400);
    expect((await c.agent.get(`/api/skill-videos/${v.id}/file`)).status).toBe(200);

    // Delete removes row + file.
    const file = (await prisma.skillVideo.findUniqueOrThrow({ where: { id: v.id } })).storedName;
    expect((await c.agent.delete(`/api/skill-videos/${v.id}`)).status).toBe(200);
    expect(fs.existsSync(skillVideoPath(file))).toBe(false);
    expect(await prisma.skillVideo.count()).toBe(0);
  });
});

describe('skill videos: streaming and view log', () => {
  it('streams with HTTP Range, logs employer views (deduplicated) and shows them to staff and the candidate', async () => {
    const { staff, employer, candidate: c, application } = await setup();
    const body = mp4(30);
    const v = (await upload(c.agent, { file: body })).body.video;
    await staff.agent.post(`/api/admin/skill-videos/${v.id}/approve`);

    const full = await employer.agent.get(`/api/company/skill-videos/${v.id}/file`).buffer(true).parse(binaryParser);
    expect(full.status).toBe(200);
    expect(full.headers['content-type']).toBe('video/mp4');
    expect(full.headers['accept-ranges']).toBe('bytes');
    expect(full.headers['cache-control']).toBe('private, no-store');
    expect(full.headers['content-disposition']).toBe('inline');
    expect((full.body as Buffer).equals(body)).toBe(true);
    const part = await employer.agent.get(`/api/company/skill-videos/${v.id}/file`).set('Range', 'bytes=4-11').buffer(true).parse(binaryParser);
    expect(part.status).toBe(206);
    expect(part.headers['content-range']).toBe(`bytes 4-11/${body.length}`);
    expect((part.body as Buffer).toString('latin1')).toBe('ftypisom');
    expect((await c.agent.get(`/api/skill-videos/${v.id}/file`).set('Range', 'bytes=0-0')).status).toBe(206);
    expect((await staff.agent.get(`/api/admin/skill-videos/${v.id}/file`).set('Range', 'bytes=0-0')).status).toBe(206);

    // Views: counted once per viewer within 30 minutes.
    expect((await employer.agent.post(`/api/company/skill-videos/${v.id}/view`).send({ applicationId: application.id })).body).toEqual({ ok: true, counted: true });
    expect((await employer.agent.post(`/api/company/skill-videos/${v.id}/view`).send({ applicationId: application.id })).body.counted).toBe(false);
    // A second employer the candidate is presented to.
    const second = await asCompany();
    const vac2 = await createVacancy({ companyId: second.company.id });
    await prisma.vacancyApplication.create({ data: { vacancyId: vac2.id, userId: c.user.id, status: 'INTERVIEW' } });
    expect((await second.agent.post(`/api/company/skill-videos/${v.id}/view`).send({ applicationId: application.id })).body.counted).toBe(true);
    const rows = await prisma.skillVideoView.findMany({ orderBy: { createdAt: 'asc' } });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ companyId: employer.company.id, viewerId: employer.user.id, applicationId: application.id });
    expect(rows[1]).toMatchObject({ companyId: second.company.id, applicationId: null }); // another company's application id is not kept

    const log = await staff.agent.get(`/api/admin/skill-videos/${v.id}/views`);
    expect(log.body.employers).toBe(2);
    expect(log.body.items.map((i: { company: string }) => i.company).sort()).toEqual([employer.company.name, second.company.name].sort());
    expect(log.body.items.find((i: { company: string }) => i.company === employer.company.name).viewer).toBe('Hans Becker');

    // The candidate only sees the aggregate.
    const mine = await c.agent.get('/api/skill-videos');
    expect(mine.body.items[0].employerViews).toBe(2);
    expect(mine.body.employersTotal).toBe(2);
    expect(JSON.stringify(mine.body)).not.toContain(employer.company.name);

    // Case page (Documents tab): the candidate's videos by case.
    const kase = await prisma.case.create({ data: { number: 'TV-2026-8101', clientId: c.user.id, profession: 'LKW-Fahrer' } });
    const byCase = await staff.agent.get(`/api/admin/skill-videos?caseId=${kase.id}`);
    expect(byCase.body.items).toHaveLength(1);
    expect(byCase.body.items[0]).toMatchObject({ id: v.id, employerViews: 2, candidate: { id: c.user.id } });
  });
});

describe('skill videos: retention', () => {
  it('deletes the videos once all of the candidate\'s cases are closed longer than the retention period', async () => {
    const { candidate: c } = await setup();
    const keep = await asCandidate({ firstName: 'Leyla' });
    const v = (await upload(c.agent, { poster: JPEG })).body.video;
    const k = (await upload(keep.agent)).body.video;
    const row = await prisma.skillVideo.findUniqueOrThrow({ where: { id: v.id } });
    const longAgo = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000);
    // Candidate 1: one case closed 13 months ago. Candidate 2: an old closed case but also an open one.
    await prisma.case.create({ data: { number: 'TV-2026-8201', clientId: c.user.id, profession: 'LKW-Fahrer', status: 'APPROVED', closedAt: longAgo } });
    await prisma.case.create({ data: { number: 'TV-2026-8202', clientId: keep.user.id, profession: 'LKW-Fahrer', status: 'CANCELLED', closedAt: longAgo } });
    await prisma.case.create({ data: { number: 'TV-2026-8203', clientId: keep.user.id, profession: 'LKW-Fahrer', status: 'DOCUMENTS_PENDING' } });

    const r = await runRetention();
    expect(r.skillVideos).toBe(1);
    expect(await prisma.skillVideo.findUnique({ where: { id: v.id } })).toBeNull();
    expect(fs.existsSync(skillVideoPath(row.storedName))).toBe(false);
    expect(fs.existsSync(skillVideoPath(row.posterName!))).toBe(false);
    expect(await prisma.skillVideo.findUnique({ where: { id: k.id } })).not.toBeNull();
    expect(await prisma.auditLog.findFirst({ where: { action: 'RETENTION_PURGE' } })).toMatchObject({ details: expect.objectContaining({ skillVideos: 1 }) });
    expect((await runRetention()).skillVideos).toBeUndefined();
  });
});
