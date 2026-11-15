import { describe, expect, it } from 'vitest';
import { cleanPosition, COVER_JOB_TYPES, COVER_PLACEHOLDERS, detectJobType, fillTemplate, germanLongDate, germanMonthYear, PLACEHOLDER_HELP, startText, tidy } from '../../src/lib/coverLetters/fill.js';
import { DEFAULT_COVER_TEMPLATES } from '../../src/lib/coverLetters/defaults.js';
import { buildCoverValues, splitName } from '../../src/lib/coverLetters/values.js';
import { buildTimeline, statusMessage } from '../../src/lib/germanyJobs/applicationStatus.js';
import { emptyCv, readCv, cvDataSchema } from '../../src/lib/cv/schema.js';
import { fmtMonth, fmtRange } from '../../src/lib/cv/texts.js';

/** Anschreiben templates (no AI): placeholder filling, optional segments, German dates, job type detection. */

describe('fillTemplate', () => {
  it('replaces placeholders and reports missing / unknown ones', () => {
    const r = fillTemplate('Bewerbung als {{position}} bei {{firma}} – {{ gehalt }}', { position: 'Koch' });
    expect(r.text).toBe('Bewerbung als Koch bei – {{ gehalt }}');
    expect(r.missing).toEqual(['firma']);
    expect(r.unknown).toEqual(['gehalt']);
  });

  it('keeps optional segments only when every placeholder inside has a value', () => {
    const t = 'Ich bewerbe mich[[ bei {{firma}}]] um die Stelle[[ in {{ort}}]].';
    expect(fillTemplate(t, { firma: 'Muster GmbH', ort: 'Berlin' }).text).toBe('Ich bewerbe mich bei Muster GmbH um die Stelle in Berlin.');
    const r = fillTemplate(t, { ort: '  ' });
    expect(r.text).toBe('Ich bewerbe mich um die Stelle.');
    // placeholders inside a dropped segment are not "missing"
    expect(r.missing).toEqual([]);
  });

  it('tidies whitespace and blank lines', () => {
    expect(tidy('a  b ,c\n\n\n\n d \r\n e')).toBe('a b,c\n\nd\ne');
  });

  it('every built-in template only uses known placeholders and fills cleanly with sample data', () => {
    const sample = Object.fromEntries(COVER_PLACEHOLDERS.map((k) => [k, PLACEHOLDER_HELP[k].example]));
    for (const jt of COVER_JOB_TYPES) {
      const t = DEFAULT_COVER_TEMPLATES[jt];
      const body = fillTemplate(t.body, sample);
      expect(body.unknown, jt).toEqual([]);
      expect(body.missing, jt).toEqual([]);
      expect(body.text, jt).toMatch(/^Sehr geehrte Damen und Herren,\n\n/);
      expect(body.text, jt).toMatch(/Mit freundlichen Grüßen\n\nAysel Məmmədova$/);
      expect(body.text, jt).not.toMatch(/\{\{|\[\[|\]\]/);
      expect(fillTemplate(t.subject, sample).text, jt).toContain('Berufskraftfahrer CE');
    }
  });

  it('a template with almost nothing known still reads as a letter', () => {
    const r = fillTemplate(DEFAULT_COVER_TEMPLATES.GENERAL.body, { position: 'Lagerhelfer', name: 'Ali Aliyev', eintritt: 'nach Absprache' });
    expect(r.text).toContain('für die Position Lagerhelfer gelesen und bewerbe mich hiermit.');
    expect(r.text).toContain('Ich kann die Stelle nach Absprache antreten.');
    expect(r.text).not.toContain('Deutschkenntnisse entsprechen');
    expect(r.missing).toEqual([]);
  });
});

describe('German dates', () => {
  it('long date with German month names (Baku time by default)', () => {
    expect(germanLongDate(new Date('2026-11-15T10:00:00Z'))).toBe('15. November 2026');
    expect(germanLongDate(new Date('2026-03-01T08:00:00Z'))).toBe('1. März 2026');
    // 22:00 UTC on 31 Dec is already 1 Jan in Baku (UTC+4)
    expect(germanLongDate(new Date('2026-12-31T22:00:00Z'))).toBe('1. Januar 2027');
    expect(germanLongDate(new Date('2026-12-31T22:00:00Z'), 'Europe/Berlin')).toBe('31. Dezember 2026');
  });

  it('month / year and start date wording', () => {
    expect(germanMonthYear('2027-03')).toBe('März 2027');
    expect(germanMonthYear('2027-13')).toBe('');
    const now = new Date('2026-11-15T10:00:00Z');
    expect(startText('2027-03', now)).toBe('ab März 2027');
    expect(startText('2026-11', now)).toBe('ab sofort');
    expect(startText('2025-01', now)).toBe('ab sofort');
    expect(startText(null, now)).toBe('nach Absprache');
  });

  it('CV periods use MM/YYYY', () => {
    expect(fmtMonth('2019-04')).toBe('04/2019');
    expect(fmtRange('2019-04', null, 'de', true)).toBe('04/2019 – heute');
    expect(fmtRange('2019-04', '2023-10', 'de')).toBe('04/2019 – 10/2023');
  });
});

describe('job type and position', () => {
  it('detects the template from the listing', () => {
    expect(detectJobType({ title: 'Berufskraftfahrer CE (m/w/d)' })).toBe('FAHRER');
    expect(detectJobType({ title: 'Pflegefachkraft Intensivstation' })).toBe('PFLEGE');
    expect(detectJobType({ title: 'Elektriker für Gebäudetechnik' })).toBe('HANDWERK');
    expect(detectJobType({ title: 'Koch / Köchin à la carte' })).toBe('GASTRO');
    expect(detectJobType({ title: 'Software Developer Java' })).toBe('BUERO_IT');
    expect(detectJobType({ title: 'Kaufmann im Büromanagement', jobType: 'ausbildung' })).toBe('AUSBILDUNG');
    expect(detectJobType({ title: 'Ausbildung zum Koch 2026' })).toBe('AUSBILDUNG');
    expect(detectJobType({ title: 'Mitarbeiter Verwaltung' })).toBe('BUERO_IT');
    expect(detectJobType({ title: 'Lagerhelfer', profession: 'Sürücü' })).toBe('FAHRER');
    expect(detectJobType({ title: 'Produktionshelfer' })).toBe('GENERAL');
  });

  it('removes gender suffixes', () => {
    expect(cleanPosition('Koch (m/w/d)')).toBe('Koch');
    expect(cleanPosition('Pflegefachkraft (w/m/d) Station 3')).toBe('Pflegefachkraft Station 3');
    expect(cleanPosition('Fahrer [m|w|d]')).toBe('Fahrer');
    expect(cleanPosition('Monteur (all)')).toBe('Monteur (all)');
  });

  it('splits the single name field', () => {
    expect(splitName('Aysel  Məmmədova')).toEqual({ firstName: 'Aysel', lastName: 'Məmmədova' });
    expect(splitName('Ali')).toEqual({ firstName: 'Ali', lastName: '' });
    expect(splitName('Anna Maria Huseynova')).toEqual({ firstName: 'Anna Maria', lastName: 'Huseynova' });
  });
});

describe('buildCoverValues', () => {
  const now = new Date('2026-11-15T10:00:00Z');
  const cv = {
    ...emptyCv(),
    experience: [
      { title: 'Kraftfahrer', employer: 'Azərsun', city: 'Baku', country: 'AZ', from: '2018-01', to: null, tasks: [] },
      { title: 'Kurier', employer: '', city: '', country: '', from: '2015-01', to: '2017-12', tasks: [] },
    ],
    education: [{ degree: 'Berufsausbildung', field: 'Kfz-Technik', institution: '', city: '', country: '', from: '2012-09', to: '2014-06' }],
    languages: [
      { language: 'Aserbaidschanisch', level: 'native' as const },
      { language: 'Deutsch', level: 'A2' as const },
    ],
    skills: ['Ladungssicherung', 'Tachograph'],
    drivingLicences: ['B', 'C', 'CE'],
    availableFrom: '2027-03',
  };

  it('fills from profile, CV and listing; what the apply form says wins', () => {
    const v = buildCoverValues({
      person: { firstName: 'Əli', lastName: 'Məmmədov', email: 'ali@example.com', phone: '+994501112233', address: 'Nizami küç. 10', city: 'Baku', experienceYears: null },
      cv,
      listing: { title: 'Berufskraftfahrer CE (m/w/d)', company: 'Nord Logistik GmbH', location: 'Hamburg', germanLevel: 'B1', profession: 'Kraftfahrer' },
      now,
    });
    expect(v).toMatchObject({
      firma: 'Nord Logistik GmbH',
      position: 'Berufskraftfahrer CE',
      ort: 'Hamburg',
      datum: '15. November 2026',
      name: 'Əli Məmmədov',
      anschrift: 'Nizami küç. 10, Baku',
      beruf: 'Kraftfahrer',
      deutschniveau: 'B1',
      eintritt: 'ab März 2027',
      fuehrerschein: 'B, C, CE',
      letzte_taetigkeit: 'Kraftfahrer bei Azərsun',
      ausbildung: 'Berufsausbildung (Kfz-Technik)',
      kenntnisse: 'Ladungssicherung, Tachograph',
      sprachen: 'Aserbaidschanisch (Muttersprache), Deutsch (A2)',
    });
    // 2015-01..2017-12 (35 months) + 2018-01..2026-11 (106 months) = 141 months → 11 years
    expect(v.jahre).toBe('11');
    expect(v.berufserfahrung).toBe('elf Jahre');
  });

  it('typed years win; no German and no experience give empty values (segments drop)', () => {
    const v = buildCoverValues({ person: { firstName: 'Ali', lastName: '' }, cv: emptyCv(), listing: { title: 'Helfer', experienceYears: 0, germanLevel: 'none' }, now });
    expect(v.jahre).toBe('');
    expect(v.berufserfahrung).toBe('');
    expect(v.deutschniveau).toBe('');
    expect(v.eintritt).toBe('nach Absprache');
    expect(v.position).toBe('Helfer');
    const one = buildCoverValues({ person: { firstName: 'Ali', lastName: '' }, cv: emptyCv(), listing: { experienceYears: 1, profession: 'Aşpaz' }, now });
    expect(one.berufserfahrung).toBe('ein Jahr');
    expect(one.position).toBe('Aşpaz');
  });

  it('the CV keeps the earliest start date (YYYY-MM)', () => {
    expect(readCv({ availableFrom: '2027-03' }).availableFrom).toBe('2027-03');
    expect(readCv({ availableFrom: 'soon' }).availableFrom).toBeNull();
    expect(cvDataSchema.parse({}).availableFrom).toBeNull();
    expect(cvDataSchema.safeParse({ availableFrom: '03/2027' }).success).toBe(false);
  });
});

describe('application status', () => {
  const created = new Date('2026-11-01T10:00:00Z');
  const at = (d: string) => new Date(`2026-11-${d}T10:00:00Z`);

  it('timeline: submitted → forwarded → interview → answer', () => {
    expect(buildTimeline(created, 'SUBMITTED', []).map((s) => s.state)).toEqual(['current', 'todo', 'todo', 'todo']);
    const fw = buildTimeline(created, 'FORWARDED', [{ status: 'FORWARDED', createdAt: at('03') }]);
    expect(fw.map((s) => s.state)).toEqual(['done', 'current', 'todo', 'todo']);
    expect(fw[1].at).toEqual(at('03'));
    const ok = buildTimeline(created, 'ACCEPTED', [
      { status: 'FORWARDED', createdAt: at('03') },
      { status: 'INTERVIEW', createdAt: at('07') },
      { status: 'ACCEPTED', createdAt: at('10') },
    ]);
    expect(ok.map((s) => s.state)).toEqual(['done', 'done', 'done', 'done']);
    expect(ok[3]).toMatchObject({ key: 'ANSWER', outcome: 'ACCEPTED', at: at('10') });
  });

  it('steps staff skipped are marked as such', () => {
    const r = buildTimeline(created, 'REJECTED', [{ status: 'FORWARDED', createdAt: at('03') }, { status: 'REJECTED', createdAt: at('05') }]);
    expect(r.map((s) => s.state)).toEqual(['done', 'done', 'skipped', 'done']);
    expect(r[3].outcome).toBe('REJECTED');
  });

  it('localised notification text with the note', () => {
    const de = statusMessage('INTERVIEW', 'de', 'Koch (m/w/d)', 'Termin am 20.11.');
    expect(de.title).toBe('Bewerbung: Vorstellungsgespräch · Koch (m/w/d)');
    expect(de.body).toContain('Hinweis: Termin am 20.11.');
    expect(statusMessage('NO_REPLY', 'az', 'X').title).toBe('Müraciət: Cavab gəlmədi · X');
    expect(statusMessage('ACCEPTED', 'ru', 'X').body).not.toContain('Примечание');
  });
});
