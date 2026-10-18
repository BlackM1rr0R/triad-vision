import { describe, expect, it } from 'vitest';
import type { User } from '@prisma/client';
import { prisma } from '../helpers/db';
import { createClient, createStaff, createSuperAdmin } from '../helpers/factories';
import { adminTools } from '../../src/lib/ai/admin/index.js';
import type { AiToolContext, AnyAiTool } from '../../src/lib/ai/types.js';
import { ensureRoots } from '../../src/lib/drive/roots.js';
import { acquireLock } from '../../src/lib/driveCollab/lock.js';
import { indexNode } from '../../src/lib/driveIntel/indexer.js';
import { createCase } from '../../src/lib/caseFlow.js';
import { HttpError } from '../../src/lib/http.js';

/**
 * The super-admin AI tools called directly (no model, no OpenRouter): each `run` acts as the super admin
 * through the modules' own services — drive permission engine, sheets store, settlement and register saves.
 */

const ctxOf = (u: User, context: AiToolContext['context'] = null, locale = 'az'): AiToolContext => ({
  user: { id: u.id, role: u.role, firstName: u.firstName, lastName: u.lastName, email: u.email, locale },
  scope: 'ADMIN',
  conversationId: 'test-conversation',
  context,
});

const tool = (name: string): AnyAiTool => {
  const t = adminTools.find((x) => x.name === name);
  if (!t) throw new Error(`no tool ${name}`);
  return t;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const run = async <T = any>(name: string, args: unknown, ctx: AiToolContext): Promise<T> => {
  const t = tool(name);
  return (await t.run(t.schema.parse(args), ctx)) as T;
};

const superCtx = async (context: AiToolContext['context'] = null) => {
  const { user } = await createSuperAdmin({ firstName: 'Xalid', lastName: 'Boss' });
  await ensureRoots();
  return ctxOf(user, context);
};

describe('ai admin tools: drive', () => {
  it('lists, creates, renames, moves, deletes and restores by Azerbaijani paths, writing journal and audit rows', async () => {
    const ctx = await superCtx();
    const root = await run('drive_list', {}, ctx);
    expect(root.folder.name).toBe('Gemeinsame Dokumente');
    expect(root.items.map((i: { name: string }) => i.name)).toEqual(expect.arrayContaining(['Anträge', 'Partner', 'Mitarbeiter', 'Vorlagen']));

    const made = await run('drive_create_folder', { parent: 'Partner', name: 'Məmmədov İlqar/Müqavilələr' }, ctx);
    expect(made.path).toBe('Gemeinsame Dokumente/Partner/Məmmədov İlqar/Müqavilələr');
    expect(made.created).toEqual(['Məmmədov İlqar', 'Müqavilələr']);
    // Folded matching: "memmedov ilqar" finds "Məmmədov İlqar"; the real name comes back.
    const listed = await run('drive_list', { folder: 'partner/memmedov ilqar' }, ctx);
    expect(listed.folder.name).toBe('Məmmədov İlqar');
    expect(listed.items.map((i: { name: string }) => i.name)).toEqual(['Müqavilələr']);

    const renamed = await run('drive_rename', { node: 'Partner/Memmedov Ilqar/Muqavileler', newName: 'Verträge' }, ctx);
    expect(renamed).toMatchObject({ renamed: true, name: 'Verträge', from: 'Müqavilələr' });
    const moved = await run('drive_move', { nodes: ['Partner/Məmmədov İlqar/Verträge'], target: 'Vorlagen' }, ctx);
    expect(moved).toMatchObject({ ok: 1, failed: 0 });
    const vertraege = await prisma.driveNode.findFirstOrThrow({ where: { name: 'Verträge' } });
    expect((await run('drive_info', { node: vertraege.id }, ctx)).path).toBe('Gemeinsame Dokumente/Vorlagen/Verträge');

    const del = await run('drive_delete', { nodes: ['Vorlagen/Verträge', 'Partner/Məmmədov İlqar'] }, ctx);
    expect(del).toMatchObject({ ok: 2, failed: 0 });
    const trash = await run('drive_trash', {}, ctx);
    expect(trash.items.map((i: { name: string }) => i.name).sort()).toEqual(['Məmmədov İlqar', 'Verträge']);
    const restored = await run('drive_restore', { ids: [vertraege.id] }, ctx);
    expect(restored).toMatchObject({ ok: 1 });
    expect((await prisma.driveNode.findUniqueOrThrow({ where: { id: vertraege.id } })).deletedAt).toBeNull();

    const actions = (await prisma.driveActivity.findMany({ where: { actorId: ctx.user.id }, select: { action: true } })).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['CREATE_FOLDER', 'RENAME', 'MOVE', 'DELETE', 'RESTORE']));
    const audits = (await prisma.auditLog.findMany({ where: { actorId: ctx.user.id }, select: { action: true } })).map((a) => a.action);
    expect(audits).toEqual(expect.arrayContaining(['DRIVE_RENAMED', 'DRIVE_MOVED', 'DRIVE_TRASHED', 'DRIVE_BULK_TRASHED', 'DRIVE_RESTORED']));

    // A system section is protected from the path resolver's typos: an unknown segment is an error, ambiguity asks.
    await expect(run('drive_list', { folder: 'Partner/Nobody' }, ctx)).rejects.toMatchObject({ status: 404 });
    await run('drive_create_folder', { parent: 'Partner', name: 'Aysel A' }, ctx);
    await run('drive_create_folder', { parent: 'Partner', name: 'Aysel B' }, ctx);
    await expect(run('drive_list', { folder: 'Partner/Aysel' }, ctx)).rejects.toMatchObject({ status: 409 });
  });

  it('creates a PDF and an Excel file, reads text, and finds both by name and content', async () => {
    const ctx = await superCtx();
    const { templatesId } = await ensureRoots();
    const pdf = await run('drive_create_pdf', { folder: templatesId, name: 'Bəyannamə', title: 'Erklärung', text: '# Erklärung\n\nDer Antragsteller **Aysel Məmmədova** bestätigt.\n\n| Feld | Wert |\n|---|---|\n| Pass | C1234567 |' }, ctx);
    expect(pdf).toMatchObject({ name: 'Bəyannamə.pdf', path: 'Gemeinsame Dokumente/Vorlagen/Bəyannamə.pdf' });
    const node = await prisma.driveNode.findUniqueOrThrow({ where: { id: pdf.id } });
    expect(node.mimeType).toBe('application/pdf');

    const text = await run('drive_read_text', { node: 'Vorlagen/Beyanname.pdf' }, ctx);
    expect(text.untrusted_document_text).toContain('Antragsteller');
    expect(text.untrusted_document_text).toContain('C1234567');

    const xlsx = await run('drive_text_to_excel', { folder: 'Vorlagen', name: 'Kunden', text: 'Name\tBetrag\nAysel\t10\nMurad\t32' }, ctx);
    expect(xlsx).toMatchObject({ name: 'Kunden.xlsx', rows: 3 });
    const read = await run('sheet_read', { file: xlsx.id }, ctx);
    expect(read.rows).toEqual([
      { row: 1, values: ['Name', 'Betrag'] },
      { row: 2, values: ['Aysel', 10] },
      { row: 3, values: ['Murad', 32] },
    ]);

    await indexNode(pdf.id);
    const byName = await run('drive_search', { query: 'beyanname' }, ctx);
    expect(byName.items.map((i: { id: string }) => i.id)).toContain(pdf.id);
    const byContent = await run('drive_search', { query: 'memmedova', type: 'pdf' }, ctx);
    const hit = byContent.items.find((i: { id: string }) => i.id === pdf.id);
    expect(hit.snippet).toContain('[Məmmədova]');
    expect(hit.path).toBe('Vorlagen/Bəyannamə.pdf');

    const acts = await prisma.driveActivity.findMany({ where: { nodeId: { in: [pdf.id, xlsx.id] } }, select: { action: true } });
    expect(acts.map((a) => a.action)).toEqual(['CREATE', 'CREATE']);
  });
});

describe('ai admin tools: spreadsheets', () => {
  it('creates, reads, updates, appends, inserts and deletes rows as new versions; respects locks', async () => {
    const ctx = await superCtx();
    const created = await run('sheet_create', { folder: 'Vorlagen', name: 'Ödənişlər', headers: ['Name', 'Betrag'], rows: [['Aysel', 10], ['Murad', 32]] }, ctx);
    expect(created).toMatchObject({ name: 'Ödənişlər.xlsx', version: 1 });
    const fileCtx = { ...ctx, context: { nodeId: created.id } };

    const up = await run('sheet_update_cells', { changes: [{ cell: 'B4', value: '=SUM(B2:B3)' }, { cell: 'A4', value: 'Cəmi' }, { cell: 'C1', value: 'Qeyd' }], baseVersion: 1 }, fileCtx);
    expect(up).toMatchObject({ version: 2, cells: 3 });
    expect(await prisma.driveFileVersion.count({ where: { nodeId: created.id } })).toBe(1);
    let read = await run('sheet_read', { range: 'A1:C4' }, fileCtx);
    expect(read.file.version).toBe(2);
    expect(read.formulas).toEqual({ B4: '=SUM(B2:B3)' });
    expect(read.rows[3]).toEqual({ row: 4, values: ['Cəmi', '=SUM(B2:B3)', null] });

    // Stale base version → conflict, nothing saved.
    await expect(run('sheet_update_cells', { changes: [{ cell: 'A2', value: 'x' }], baseVersion: 1 }, fileCtx)).rejects.toMatchObject({ status: 409 });

    const app = await run('sheet_append_rows', { rows: [['Leyla', 5]] }, fileCtx);
    expect(app).toMatchObject({ version: 3, firstRow: 5, lastRow: 5 });

    const ins = await run('sheet_insert_rows', { row: 3, count: 1, rows: [['Nigar', 7]] }, fileCtx);
    expect(ins.version).toBe(4);
    read = await run('sheet_read', {}, fileCtx);
    expect(read.rows.map((r: { values: unknown[] }) => r.values[0])).toEqual(['Name', 'Aysel', 'Nigar', 'Murad', 'Cəmi', 'Leyla']);
    expect(read.formulas).toEqual({ B5: '=SUM(B2:B4)' });

    const del = await run('sheet_delete_rows', { row: 2, count: 1 }, fileCtx);
    expect(del.version).toBe(5);
    read = await run('sheet_read', {}, fileCtx);
    expect(read.rows.map((r: { values: unknown[] }) => r.values[0])).toEqual(['Name', 'Nigar', 'Murad', 'Cəmi', 'Leyla']);
    expect(read.formulas).toEqual({ B4: '=SUM(B2:B3)' });

    expect((await run('sheet_find', { text: 'cemi' }, fileCtx)).hits).toEqual([{ sheet: 'Tabelle1', cell: 'A4', value: 'Cəmi' }]);
    expect(await run('sheet_stats', { range: 'B2:B3' }, fileCtx)).toMatchObject({ numbers: 2, sum: 39, average: 19.5 });

    await run('sheet_add_sheet', { name: 'Notizen', rows: [['Hallo']] }, fileCtx);
    await run('sheet_rename_sheet', { from: 'tabelle1', to: 'Kunden' }, fileCtx);
    read = await run('sheet_read', { sheet: 'Notizen' }, fileCtx);
    expect(read.sheets.map((s: { name: string }) => s.name)).toEqual(['Kunden', 'Notizen']);
    expect(read.file.version).toBe(7);

    const saves = await prisma.driveActivity.count({ where: { nodeId: created.id, action: 'SHEET_SAVE' } });
    expect(saves).toBe(6);
    expect(await prisma.auditLog.count({ where: { target: `drive:${created.id}`, action: 'DRIVE_FILE_VERSION_ADDED' } })).toBe(6);

    // Locked by another user → 423 with who holds it, no new version.
    const { user: other } = await createStaff({ firstName: 'Aysel', lastName: 'Editor' });
    await acquireLock(created.id, other.id);
    const err = await run('sheet_update_cells', { changes: [{ cell: 'A2', value: 'x' }] }, fileCtx).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).status).toBe(423);
    expect((err as HttpError).code).toContain('Aysel Editor');
    expect((await prisma.driveNode.findUniqueOrThrow({ where: { id: created.id } })).version).toBe(7);
  });
});

describe('ai admin tools: settlements', () => {
  it('adds, queries, updates and marks shares paid through the ledger service', async () => {
    const ctx = await superCtx();
    const partner = await run('partner_create', { name: 'Ənvər', commission: 0 }, ctx);
    const added = await run('settlement_add_row', { project: 'Proyekt 1', clientName: 'Niftaliyev Elvin (CE)', amount: '3000 manat', partner: 'envar', partnerShare: 0 }, ctx);
    expect(added.row).toMatchObject({ client: 'Niftaliyev Elvin', licence: 'CE', amount: '3000 AZN', partner: 'Ənvər' });
    expect(added.row.shares).toEqual({ Xalid: '1000 AZN PENDING', Tofig: '900 AZN PENDING', Abdulla: '900 AZN PENDING', Team: '200 AZN PENDING' });

    const upd = await run('settlement_update', { changes: [{ id: added.row.id, field: 'expenses', value: 300 }, { id: added.row.id, field: 'partnerShare', value: 150 }, { id: added.row.id, field: 'partnerShareCurrency', value: 'AZN' }, { id: added.row.id, field: 'stage', value: 'NOPE' }] }, ctx);
    expect(upd).toMatchObject({ saved: 3, failed: 1 });
    expect(upd.errors[0]).toMatchObject({ field: 'stage', error: 'INVALID_STAGE' });
    // net = 3000 − 150 − 300 = 2550 → Xalid 850, Team 200, Tofig = Abdulla = 750
    expect(upd.rows[0].shares).toEqual({ Xalid: '850 AZN PENDING', Tofig: '750 AZN PENDING', Abdulla: '750 AZN PENDING', Team: '200 AZN PENDING' });
    const commission = await prisma.partnerCommission.findFirstOrThrow({ where: { settlementEntryId: added.row.id } });
    expect(commission).toMatchObject({ partnerId: partner.id, amountCents: 15000, status: 'PENDING' });

    const paid = await run('settlement_mark_paid', { items: [{ id: added.row.id, beneficiary: 'xalid' }, { id: added.row.id, beneficiary: 'partner' }] }, ctx);
    expect(paid.rows[0].shares.Xalid).toBe('850 AZN PAID');
    expect((await prisma.partnerCommission.findUniqueOrThrow({ where: { id: commission.id } })).status).toBe('PAID');

    const q = await run('settlement_query', { unpaid: true, partner: 'Ənvər' }, ctx);
    expect(q.count).toBe(1);
    expect(q.totals.shares.Xalid).toEqual({ total: '850 AZN', pending: '0', paid: '850 AZN' });
    expect((await run('settlement_query', { q: 'elvin' }, ctx)).count).toBe(1);
    const summary = await run('settlement_summary', {}, ctx);
    expect(summary.beneficiaries.find((b: { name: string }) => b.name === 'Tofig').owed).toBe('750 AZN');

    const audits = (await prisma.auditLog.findMany({ where: { actorId: ctx.user.id }, select: { action: true } })).map((a) => a.action);
    expect(audits).toEqual(expect.arrayContaining(['SETTLEMENT_CREATED', 'SETTLEMENT_SAVED', 'SETTLEMENT_SHARE_PAID']));
  });
});

describe('ai admin tools: register, cases and partners', () => {
  it('register update assigns the partner (commission + folder follow); partner create and bulk assign', async () => {
    const ctx = await superCtx();
    const { user: client } = await createClient({ firstName: 'Aysel', lastName: 'Məmmədova' });
    const kase = await createCase(client.id, { profession: 'Pflege', visaType: 'WORK' });
    const { user: client2 } = await createClient({ firstName: 'Murad', lastName: 'Əliyev' });
    const kase2 = await createCase(client2.id, { profession: 'Fahrer', visaType: 'WORK' });

    const p = await run('partner_create', { name: 'İlqar', phone: '+994501112233', commission: 100, currency: 'EUR' }, ctx);
    expect(p.folderId).toBeTruthy();
    expect((await prisma.driveNode.findUniqueOrThrow({ where: { id: p.folderId } })).name).toBe('İlqar');

    const found = await run('case_lookup', { query: 'memmedova' }, ctx);
    expect(found.cases.map((c: { number: string }) => c.number)).toEqual([kase.number]);

    const res = await run('register_update', { changes: [{ case: kase.number, field: 'partner', value: 'ilqar' }, { case: kase.number, field: 'note', value: 'VIP' }, { case: kase.number, field: 'birthDate', value: 'bad' }] }, ctx);
    expect(res).toMatchObject({ saved: 2, failed: 1, commissionsCreated: 1 });
    expect((await prisma.case.findUniqueOrThrow({ where: { id: kase.id } })).partnerId).toBe(p.id);
    expect(await prisma.partnerCommission.findFirst({ where: { partnerId: p.id, caseId: kase.id, status: 'PENDING', amountCents: 10000 } })).toBeTruthy();
    // The client folder moved below "Partner/İlqar".
    const folderId = (await prisma.case.findUniqueOrThrow({ where: { id: kase.id } })).driveFolderId!;
    expect((await prisma.driveNode.findUniqueOrThrow({ where: { id: folderId } })).parentId).toBe(p.folderId);
    const reg = await run('register_query', { partner: 'İlqar' }, ctx);
    expect(reg.rows).toEqual([expect.objectContaining({ number: kase.number, partner: 'İlqar', note: 'VIP' })]);

    const assigned = await run('partner_assign_cases', { cases: [kase2.number, kase.number], partner: 'Ilqar' }, ctx);
    expect(assigned).toMatchObject({ updated: 1, unchanged: 1, commissionsCreated: 1 });
    const info = await run('partner_info', { partner: 'ilqar' }, ctx);
    expect(info.totalCases).toBe(2);
    expect(info.commissions).toMatchObject({ pending: '200 EUR' });
    const list = await run('partner_list', {}, ctx);
    expect(list.partners[0]).toMatchObject({ name: 'İlqar', counts: { clients: 2 } });

    const stats = await run('stats_overview', {}, ctx);
    expect(stats.cases.open).toBe(2);
    expect(stats.cases.newByVisaType.WORK).toBe(2);
  });
});

describe('ai admin tools: guard rails', () => {
  it('only super admins run them; confirm tools give a localized summary, read tools have none', async () => {
    const ctx = await superCtx();
    const { user: staff } = await createStaff();
    await expect(run('drive_list', {}, ctxOf(staff))).rejects.toMatchObject({ status: 403 });

    const confirmTools = adminTools.filter((t) => t.confirm);
    expect(confirmTools.length).toBeGreaterThan(20);
    for (const t of adminTools) expect(!!t.confirm, t.name).toBe(typeof t.summary === 'function');
    const samples: Record<string, unknown> = {
      drive_create_folder: { parent: 'Partner', name: 'Neu' },
      drive_rename: { node: 'Vorlagen', newName: 'Muster' },
      drive_delete: { nodes: ['Vorlagen'] },
      sheet_update_cells: { changes: [{ cell: 'B2', value: 5 }] },
      settlement_mark_paid: { items: [{ id: 'x', beneficiary: '*' }] },
      partner_create: { name: 'Ilqar' },
    };
    for (const locale of ['az', 'de', 'en', 'ru']) {
      const c = ctxOf((await prisma.user.findUniqueOrThrow({ where: { id: ctx.user.id } })) as User, null, locale);
      for (const [name, args] of Object.entries(samples)) {
        const t = tool(name);
        const s = await t.summary!(t.schema.parse(args), c);
        expect(typeof s, name).toBe('string');
        expect(s.length, name).toBeGreaterThan(5);
      }
    }
    const de = ctxOf((await prisma.user.findUniqueOrThrow({ where: { id: ctx.user.id } })) as User, null, 'de');
    expect(await tool('drive_delete').summary!({ nodes: ['Vorlagen'] }, de)).toBe('1 Element(e) in den Papierkorb: "Vorlagen"');
  });
});
