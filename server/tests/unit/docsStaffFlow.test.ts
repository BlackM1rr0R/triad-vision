import { describe, expect, it } from 'vitest';
import { holderMatches } from '../../src/lib/uploadAi/proposals.js';
import { isTypeFolderName, TYPE_FOLDERS, typeOfRequirement, VAULT_KIND_TYPE } from '../../src/lib/drive/typeFolders.js';
import { findingItemText } from '../../src/lib/ai/features/caseAi/findingTasks.js';
import { parseKinds } from '../../src/lib/applicationUploads.js';
import { DOC_TYPES } from '../../src/lib/uploadAi/types.js';

describe('name check of uploads (holderMatches)', () => {
  const client = { firstName: 'Əli', lastName: 'Məmmədov' };

  it('tolerates Azerbaijani / Latin / Russian spellings of the same person', () => {
    expect(holderMatches('MAMMADOV ALI', { firstName: 'Ali', lastName: 'Mammadov' }, client)).toBe(true);
    expect(holderMatches('Mamedov Ali', {}, client)).toBe(true);
    expect(holderMatches('Мамедов Али', {}, client)).toBe(true);
    expect(holderMatches('Shahin Aliyev', {}, { firstName: 'Şahin', lastName: 'Əliyev' })).toBe(true);
    expect(holderMatches('Ilkin Qasimov', {}, { firstName: 'İlkin', lastName: 'Qasımov' })).toBe(true);
  });

  it('flags another person', () => {
    expect(holderMatches('HUSEYNOV RASHAD', {}, client)).toBe(false);
  });

  it('family member case: the first name must fit too (relatives share the last name)', () => {
    const member = { firstName: 'Leyla', lastName: 'Məmmədova' };
    expect(holderMatches('MAMMADOVA LEYLA', { firstName: 'Leyla', lastName: 'Mammadova' }, member, { member: true })).toBe(true);
    // The main applicant's passport in the wife's case: same family name, other first name.
    expect(holderMatches('MAMMADOV ALI', { firstName: 'Ali', lastName: 'Mammadov' }, member, { member: true })).toBe(false);
    // Without the member rule the last name alone would pass.
    expect(holderMatches('MAMMADOV ALI', { firstName: 'Ali', lastName: 'Mammadov' }, member)).toBe(true);
    // Holder name only (no separate first name): any word may carry the first name.
    expect(holderMatches('Leyla Mammadova', {}, member, { member: true })).toBe(true);
  });
});

describe('type folders', () => {
  it('every recogniser type has a German folder or falls back to the stage folder', () => {
    for (const t of DOC_TYPES) if (t !== 'OTHER') expect(TYPE_FOLDERS[t]?.length).toBeGreaterThan(0);
    expect(TYPE_FOLDERS.OTHER).toBeNull();
    expect(TYPE_FOLDERS.PASSPORT![0]).toBe('Reisepass');
    expect(TYPE_FOLDERS.CV![0]).toBe('Lebenslauf');
    expect(TYPE_FOLDERS.DIPLOMA![0]).toBe('Diplom');
  });

  it('maps requirement keys and vault kinds onto types', () => {
    expect(typeOfRequirement('PASSPORT')).toBe('PASSPORT');
    expect(typeOfRequirement('GERMAN_CERT')).toBe('LANGUAGE_CERT');
    expect(typeOfRequirement('VIDEX')).toBeNull();
    expect(typeOfRequirement(null)).toBeNull();
    expect(VAULT_KIND_TYPE.POLICE_CLEARANCE).toBe('POLICE_CERT');
    expect(VAULT_KIND_TYPE.CV).toBe('CV');
  });

  it('template folders count as the type folder (no second folder next to them)', () => {
    expect(isTypeFolderName('DIPLOMA', 'Abschlüsse & Zeugnisse')).toBe(true);
    expect(isTypeFolderName('DIPLOMA', 'diplom')).toBe(true);
    expect(isTypeFolderName('PASSPORT', 'Erstdokumente')).toBe(false);
  });
});

describe('AI findings → checklist items', () => {
  it('puts the document names first and caps the length', () => {
    expect(findingItemText('Name passt nicht', [{ name: 'pass.pdf' }, { name: 'pass.pdf' }, { name: 'diplom.pdf' }])).toBe('pass.pdf, diplom.pdf: Name passt nicht');
    expect(findingItemText('Nur Profil', [])).toBe('Nur Profil');
    expect(findingItemText('x'.repeat(500), []).length).toBe(300);
  });
});

describe('application upload kinds', () => {
  it('one kind per file, unknown → OTHER', () => {
    expect(parseKinds(['passport', 'CV', 'nonsense'], 4)).toEqual(['PASSPORT', 'CV', 'OTHER', 'OTHER']);
    expect(parseKinds('DIPLOMA', 1)).toEqual(['DIPLOMA']);
    expect(parseKinds(undefined, 2)).toEqual(['OTHER', 'OTHER']);
  });
});
