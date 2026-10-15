import { describe, expect, it } from 'vitest';
import { contactsToCsv, csvToRecords, fulltextQuery, mapHeader, normaliseEmails, normaliseTags, parseCsv, type ContactOut } from '../../src/lib/workspace/contacts.js';
import { parseLeaveDate, weekdaysBetween } from '../../src/lib/workspace/team.js';
import { excerptOf, formatLeaveDay, workspaceTexts } from '../../src/lib/workspace/texts.js';

describe('workspace: CSV codec', () => {
  it('parses quoted fields, doubled quotes, embedded newlines, CRLF and detects the delimiter', () => {
    expect(parseCsv('a,b\r\n"x, y","say ""hi"""\r\n')).toEqual([
      ['a', 'b'],
      ['x, y', 'say "hi"'],
    ]);
    expect(parseCsv('﻿a;b\n"multi\nline";2\n\n')).toEqual([
      ['a', 'b'],
      ['multi\nline', '2'],
    ]);
    expect(parseCsv('a\tb\n1\t2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
    expect(parseCsv('')).toEqual([]);
  });

  it('maps localised header names (az/de/en/ru) onto contact columns', () => {
    expect(['First name', 'Vorname', 'Ad', 'Имя', 'firstName', 'given_name'].map(mapHeader)).toEqual(Array(6).fill('firstName'));
    expect(['Last Name', 'Nachname', 'Soyad', 'Фамилия', 'surname'].map(mapHeader)).toEqual(Array(5).fill('lastName'));
    expect(['E-Mail', 'email', 'E-poçt', 'Эл. почта', 'E-Mail-Adresse'].map(mapHeader)).toEqual(Array(5).fill('email'));
    expect(['Phone', 'Telefon', 'Telefon nömrəsi', 'Телефон', 'Mobile'].map(mapHeader)).toEqual(Array(5).fill('phone'));
    expect(['Company', 'Unternehmen', 'Şirkət', 'Компания'].map(mapHeader)).toEqual(Array(4).fill('company'));
    expect(['Position', 'Vəzifə', 'Должность', 'Job title'].map(mapHeader)).toEqual(Array(4).fill('position'));
    expect(['Tags', 'Schlagwörter', 'Etiketlər', 'Теги'].map(mapHeader)).toEqual(Array(4).fill('tags'));
    expect(['Address', 'Adresse', 'Ünvan', 'Адрес'].map(mapHeader)).toEqual(Array(4).fill('address'));
    expect(['Notes', 'Notizen', 'Qeydlər', 'Заметки'].map(mapHeader)).toEqual(Array(4).fill('notes'));
    expect(mapHeader('Something else')).toBeNull();
    expect(mapHeader('')).toBeNull();
  });

  it('turns rows into records: name fallbacks, e-mail validation, tag splitting, trimming', () => {
    const { records, columns, unmapped } = csvToRecords('Name,Surname,E-mail,Tags,Foo\n Hans , Müller ,HANS@X.DE,"a; b, a",zz\n,,bad-email,,\n,,,,\nOnlyName,,,,\n,Smith,,,\n,,x@y.de,,');
    expect(columns).toEqual(['firstName', 'lastName', 'email', 'tags']);
    expect(unmapped).toEqual(['Foo']);
    expect(records).toEqual([
      { firstName: 'Hans', lastName: 'Müller', email: 'hans@x.de', phone: null, company: null, position: null, tags: ['a', 'b'], address: null, notes: null },
      { firstName: 'bad-email', lastName: null, email: null, phone: null, company: null, position: null, tags: [], address: null, notes: null },
      { firstName: 'OnlyName', lastName: null, email: null, phone: null, company: null, position: null, tags: [], address: null, notes: null },
      { firstName: 'Smith', lastName: null, email: null, phone: null, company: null, position: null, tags: [], address: null, notes: null },
      { firstName: 'x', lastName: null, email: 'x@y.de', phone: null, company: null, position: null, tags: [], address: null, notes: null },
    ]);
  });

  it('exports with quoting and re-imports to the same values', () => {
    const base = {
      id: '1',
      emails: [] as string[],
      phone: null,
      company: null,
      companyId: null,
      position: null,
      address: null,
      notes: null,
      shared: true,
      source: 'MANUAL' as const,
      lastContactAt: null,
      userId: null,
      createdById: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      canEdit: true,
      canDelete: true,
    };
    const rows: ContactOut[] = [
      { ...base, firstName: 'Hans', lastName: 'Müller, Jr.', email: 'h@x.de', tags: ['a', 'b'], notes: 'Line 1\nLine "2"' },
      { ...base, id: '2', firstName: 'Anna', lastName: null, email: null, tags: [], company: 'Schmidt; AG' },
    ];
    const csv = contactsToCsv(rows);
    expect(csv.startsWith('﻿firstName,lastName,email,phone,company,position,tags,address,notes\r\n')).toBe(true);
    const back = csvToRecords(csv).records;
    expect(back[0]).toMatchObject({ firstName: 'Hans', lastName: 'Müller, Jr.', email: 'h@x.de', tags: ['a', 'b'], notes: 'Line 1\nLine "2"' });
    expect(back[1]).toMatchObject({ firstName: 'Anna', lastName: null, email: null, company: 'Schmidt; AG' });
  });
});

describe('workspace: contact normalisation and search', () => {
  it('normalises tags and extra e-mails', () => {
    expect(normaliseTags(['HR', ' hr', 'Logistics  Team', ''])).toEqual(['HR', 'Logistics Team']);
    expect(normaliseTags('a, b;c')).toEqual(['a', 'b', 'c']);
    expect(normaliseTags(null)).toEqual([]);
    expect(normaliseEmails(['A@x.de', 'a@x.de', 'b@x.de', 'nope', 'c@x.de'], 'c@x.de')).toEqual(['a@x.de', 'b@x.de']);
    expect(normaliseEmails('a@x.de b@x.de', null)).toEqual(['a@x.de', 'b@x.de']);
  });

  it('builds a boolean-mode fulltext query from words of 3+ characters', () => {
    expect(fulltextQuery('Aysel Mammadova')).toBe('+Aysel* +Mammadova*');
    expect(fulltextQuery('ay')).toBeNull();
    expect(fulltextQuery('hans@mueller.de')).toBe('+hans* +mueller.de*');
    expect(fulltextQuery('+(evil) -"query"')).toBe('+evil* +query*');
  });
});

describe('workspace: leave helpers', () => {
  it('parses day strings as UTC spans and counts weekdays', () => {
    expect(parseLeaveDate('2030-06-03')?.toISOString()).toBe('2030-06-03T00:00:00.000Z');
    expect(parseLeaveDate('2030-06-03', true)?.toISOString()).toBe('2030-06-03T23:59:59.999Z');
    expect(parseLeaveDate('2030-06-03T10:00:00.000Z')?.toISOString()).toBe('2030-06-03T10:00:00.000Z');
    expect(parseLeaveDate('nope')).toBeNull();
    // Mon 3 Jun 2030 – Sun 9 Jun 2030: five weekdays.
    expect(weekdaysBetween(new Date('2030-06-03T00:00:00Z'), new Date('2030-06-09T23:59:59Z'))).toBe(5);
    // Saturday only: none.
    expect(weekdaysBetween(new Date('2030-06-08T00:00:00Z'), new Date('2030-06-08T23:59:59Z'))).toBe(0);
    expect(weekdaysBetween(new Date('2030-06-07T00:00:00Z'), new Date('2030-06-10T23:59:59Z'))).toBe(2);
  });
});

describe('workspace: texts', () => {
  it('has every catalogue in four languages and formats leave days per locale', () => {
    for (const locale of ['az', 'de', 'en', 'ru'] as const) {
      const tx = workspaceTexts(locale);
      const msg = tx.leaveRequested({ actor: 'Kamran Aliyev', type: tx.leaveType.VACATION, from: '01.01.2030', to: '02.01.2030', note: 'n' });
      expect(msg.title).toContain('Kamran Aliyev');
      expect(msg.body).toContain(tx.leaveType.VACATION);
      expect(tx.announcement({ actor: 'A', title: 'T', excerpt: 'E' }).title).toContain('T');
    }
    expect(formatLeaveDay(new Date('2030-06-03T00:00:00Z'), 'de')).toBe('03.06.2030');
    expect(formatLeaveDay(new Date('2030-06-03T23:59:59Z'), 'en')).toBe('03/06/2030');
    expect(excerptOf('# Title\n\nSome **bold** [link](https://x) text\n```\ncode\n```')).toBe('Title Some bold link text');
    expect(excerptOf('x'.repeat(300)).length).toBe(160);
  });
});
