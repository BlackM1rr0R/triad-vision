import zlib from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { ROLE_TEMPLATES, type CompanyPerms } from '../../src/lib/companyAccess/permissions';
import { FULL_EXPORT, workerExportPolicy } from '../../src/lib/companyAccess/workerExport';
import { trimPipelineBlockers } from '../../src/lib/companyAccess/guard';
import { workersCsv } from '../../src/lib/employerWorkers/csv';
import { PANEL_TEXTS } from '../../src/lib/employerWorkers/texts';
import { workersXlsx, type WorkerRow } from '../../src/lib/requests/workers';
import type { PanelRow } from '../../src/lib/employerWorkers/panel';

/**
 * Employer portal "my workers" export (lib/companyAccess/workerExport.ts): restricted members get only the
 * open items and columns their permissions allow; STANDARD / full-permission members keep the full sheet.
 */

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const row = (over: Partial<PanelRow> = {}) =>
  ({
    id: 'case1',
    name: 'Elvin Məmmədov',
    position: 'Berufskraftfahrer',
    phase: 'WORKING',
    stage: 'ARRIVED',
    next: { code: 'PROBATION_END', at: d('2027-01-31') },
    arrivedAt: d('2026-08-01'),
    arrival: null,
    title: { kind: 'RESIDENCE', validUntil: d('2027-08-01'), warn: 'OK', daysLeft: 300 },
    probation: { endsAt: d('2027-01-31'), warn: 'OK' },
    checkIn: { employer: null, worker: null },
    risk: null,
    openItems: [
      { kind: 'SIGNATURE', id: 's1', title: 'Arbeitsvertrag Elvin', link: '/company/contracts/x', since: d('2026-10-01') },
      { kind: 'FORM', id: 'f1', title: 'Erklärung zum Beschäftigungsverhältnis', link: '/company/forms/f1', since: d('2026-10-02') },
      { kind: 'CHECKIN', id: 'c1', title: 'Check-in 30', link: '/check-in/c1', since: d('2026-10-03') },
    ],
    nextAction: 'SIGN_DOCUMENT',
    manager: { name: 'Leyla Hüseynova', email: 'l@example.com' },
    ...over,
  }) as unknown as PanelRow;

const parse = (csv: string) =>
  csv
    .replace(/^﻿/, '')
    .trim()
    .split('\r\n')
    .map((l) => l.split(';'));

/** Every entry of a zip (the .xlsx) inflated and joined — enough to look for a header text. */
const zipText = (zip: Buffer) => {
  const out: string[] = [];
  let i = 0;
  while (i < zip.length - 30 && zip.readUInt32LE(i) === 0x04034b50) {
    const method = zip.readUInt16LE(i + 8);
    const size = zip.readUInt32LE(i + 18);
    const start = i + 30 + zip.readUInt16LE(i + 26) + zip.readUInt16LE(i + 28);
    const data = zip.subarray(start, start + size);
    out.push((method === 8 ? zlib.inflateRawSync(data) : data).toString('utf8'));
    i = start + size;
  }
  return out.join(' ');
};

const access = (perms: CompanyPerms, role: string | null = 'VIEWER') => ({ role, perms });

describe('workers export policy', () => {
  it('STANDARD, OWNER-like and missing access keep the full export', () => {
    expect(workerExportPolicy(null)).toBe(FULL_EXPORT);
    expect(workerExportPolicy(access(ROLE_TEMPLATES.VIEWER, null))).toBe(FULL_EXPORT);
    expect(workerExportPolicy(access(ROLE_TEMPLATES.ADMIN, 'ADMIN'))).toBe(FULL_EXPORT);
  });

  it('the full CSV is unchanged: every header, open items counted, next action shown', () => {
    const [head, cells] = parse(workersCsv([row()], 'en'));
    expect(head).toEqual(PANEL_TEXTS.en.csvHeaders);
    expect(cells[head.indexOf('Open items')]).toBe('3');
    expect(cells).toContain(PANEL_TEXTS.en.action.SIGN_DOCUMENT);
    expect(cells).toContain(PANEL_TEXTS.en.milestone.PROBATION_END);
  });

  it('VIEWER (viewWorkers only): no document / contract columns, hidden open items neither counted nor named', () => {
    const csv = workersCsv([row()], 'en', workerExportPolicy(access(ROLE_TEMPLATES.VIEWER)));
    const [head, cells] = parse(csv);
    const full = PANEL_TEXTS.en.csvHeaders;
    expect(head).toEqual(full.filter((_, i) => i !== 7 && i !== 8)); // title valid until, probation end
    expect(cells).toHaveLength(head.length);
    expect(cells[head.indexOf('Open items')]).toBe('1'); // the check-in only
    expect(csv).not.toContain('Arbeitsvertrag');
    expect(csv).not.toContain('Erklärung');
    expect(cells).not.toContain(PANEL_TEXTS.en.action.SIGN_DOCUMENT);
    expect(cells).not.toContain(PANEL_TEXTS.en.milestone.PROBATION_END); // milestone from the contract
    expect(csv).not.toContain('2027-01-31');
    expect(csv).not.toContain('2027-08-01');
  });

  it('HR (documents, contracts, EzB) sees every column and every item', () => {
    const [head, cells] = parse(workersCsv([row()], 'de', workerExportPolicy(access(ROLE_TEMPLATES.HR, 'HR'))));
    expect(head).toEqual(PANEL_TEXTS.de.csvHeaders);
    expect(cells[head.indexOf('Offene Punkte')]).toBe('3');
  });

  it('per-permission columns: contracts without personal documents keeps probation, drops the title column', () => {
    const perms = { ...ROLE_TEMPLATES.VIEWER, viewContracts: true };
    const [head] = parse(workersCsv([row()], 'en', workerExportPolicy(access(perms))));
    expect(head).toContain(PANEL_TEXTS.en.csvHeaders[8]);
    expect(head).not.toContain(PANEL_TEXTS.en.csvHeaders[7]);
  });

  it('Excel: the visa-valid-from column only with viewPersonalDocuments', () => {
    const w = { name: 'A', profession: 'P', vacancy: null, visaType: 'WORK', visa: null, stage: 'ARRIVED', daysInStage: 1, startedAt: d('2026-01-01'), appointmentAt: null, decisionAt: null, visaValidFrom: d('2026-07-01'), arrival: null, nextInterview: null } as unknown as WorkerRow;
    const full = zipText(Buffer.from(workersXlsx([w], 'en')));
    const cut = zipText(Buffer.from(workersXlsx([w], 'en', workerExportPolicy(access(ROLE_TEMPLATES.VIEWER)))));
    expect(full).toContain('Visa valid from');
    expect(full).toContain('2026-07-01');
    expect(cut).not.toContain('Visa valid from');
    expect(cut).not.toContain('2026-07-01');
    expect(cut).toContain('Planned arrival');
  });
});

describe('pipeline blockers of a restricted member', () => {
  const body = {
    cards: [
      { id: 'a', blockers: [{ code: 'CONTRACT_UNSIGNED', title: 'Arbeitsvertrag' }, { code: 'COMPLETE_FORM', title: 'EzB' }, { code: 'ANSWER_CHECKIN', title: 'Check-in 30' }] },
      { id: 'b', blockers: [{ code: 'SIGN_DOCUMENT', title: 'Vollmacht' }] },
    ],
    summary: { total: 2, withBlockers: 2, blockers: 4 },
  };

  it('drops document / form blockers without the permission and recounts the summary', () => {
    const out = trimPipelineBlockers(body, ROLE_TEMPLATES.VIEWER) as typeof body;
    expect(out.cards.map((c) => c.blockers.map((b) => b.code))).toEqual([['ANSWER_CHECKIN'], []]);
    expect(out.summary).toMatchObject({ total: 2, withBlockers: 1, blockers: 1 });
    expect(JSON.stringify(out)).not.toContain('Arbeitsvertrag');
  });

  it('keeps everything with the permissions', () => {
    const out = trimPipelineBlockers(body, ROLE_TEMPLATES.HR) as typeof body;
    expect(out.cards.flatMap((c) => c.blockers)).toHaveLength(4);
    expect(out.summary.blockers).toBe(4);
  });
});
