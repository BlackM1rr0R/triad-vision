import { describe, expect, it } from 'vitest';
import { analyseName, compareWithMrz, lettersIn, mrzNameField, spellings, toMrz } from '../../src/lib/nameCheck/index.js';

const form = (name: string, variant: string) => spellings(name).find((s) => s.variant === variant)?.display;

describe('MRZ form (ICAO 9303 part 3 + Azerbaijani passport practice)', () => {
  it('maps Ə → A, Ş → S, Ç → C, Ğ → G, I / ı / İ → I, Ö → O, Ü → U and keeps X, Q', () => {
    expect(toMrz('Məmmədov')).toBe('MAMMADOV');
    expect(toMrz('Şükür')).toBe('SUKUR');
    expect(toMrz('Çingiz')).toBe('CINGIZ');
    expect(toMrz('Tuğrul')).toBe('TUGRUL');
    expect(toMrz('İlqar')).toBe('ILQAR');
    expect(toMrz('Qılınc')).toBe('QILINC');
    expect(toMrz('Xəlilov')).toBe('XALILOV');
    expect(toMrz('Gözəl')).toBe('GOZAL');
    expect(toMrz('ƏLİYEV')).toBe('ALIYEV');
  });

  it('ICAO alternative OE / UE only where Ö / Ü occur', () => {
    expect(toMrz('Gözəl', 'icaoAlt')).toBe('GOEZAL');
    expect(toMrz('Şükür', 'icaoAlt')).toBe('SUEKUER');
    // Same forms are listed once: "Elvin" only differs by ear (v → w).
    expect(spellings('Elvin').map((s) => s.display)).toEqual(['ELVIN', 'Elwin']);
    expect(form('Gözəl', 'icaoAlt')).toBe('GOEZAL');
  });

  it('hyphens / spaces become filler, the TD3 name field has 39 characters', () => {
    expect(toMrz('Əli-Ağa')).toBe('ALI AGA');
    expect(mrzNameField('Məmmədov', 'Elvin')).toEqual({ field: 'MAMMADOV<<ELVIN'.padEnd(39, '<'), truncated: false });
    expect(mrzNameField('Abdulrahmanzadəhüseynov', 'Məhəmmədəli Əbülfəz').truncated).toBe(true);
    expect(mrzNameField('Abdulrahmanzadəhüseynov', 'Məhəmmədəli Əbülfəz').field).toHaveLength(39);
  });
});

describe('other spellings', () => {
  it('English-style and German-by-ear forms', () => {
    expect(form('Şahin', 'english')).toBe('Shahin');
    expect(form('Şahin', 'german')).toBe('Schahin');
    expect(form('Çingiz', 'english')).toBe('Chingiz');
    expect(form('Çingiz', 'german')).toBe('Tschingiz');
    expect(form('Məmmədov', 'german')).toBe('Mämmädow');
    expect(form('Ağayev', 'english')).toBe('Aghayev');
    expect(form('Xəyal', 'german')).toBe('Chäjal');
  });

  it('lists the special letters of the name', () => {
    expect(lettersIn('Elvin Məmmədov').map((l) => l.letter)).toEqual(['ə']);
    const schwa = lettersIn('Məmmədov')[0];
    expect(schwa).toMatchObject({ mrz: 'A', notInIcao: true, german: 'Ä' });
    expect(lettersIn('Şükür Ağayev').map((l) => l.letter)).toEqual(['ş', 'ğ', 'ü', 'y']);
  });
});

describe('comparison with the passport MRZ', () => {
  it('exact when the expected MRZ form is in the passport', () => {
    expect(compareWithMrz({ firstName: 'Elvin', lastName: 'Məmmədov' }, { surname: 'MAMMADOV', givenNames: 'ELVIN' }).status).toBe('exact');
    expect(compareWithMrz({ firstName: 'Gözəl', lastName: 'Əliyeva' }, { surname: 'ALIYEVA', givenNames: 'GOEZAL' }).status).toBe('exact');
    // A middle name in the passport is fine.
    expect(compareWithMrz({ firstName: 'Elvin', lastName: 'Məmmədov' }, { surname: 'MAMMADOV', givenNames: 'ELVIN RASIM' }).status).toBe('exact');
  });

  it('spelling when it is the same name written differently (forms must follow the passport)', () => {
    const r = compareWithMrz({ firstName: 'Elvin', lastName: 'Mamedov' }, { surname: 'MAMMADOV', givenNames: 'ELVIN' });
    expect(r.status).toBe('spelling');
    expect(r.surname).toBe('spelling');
    expect(r.givenNames).toBe('exact');
    expect(compareWithMrz({ firstName: 'Shahin', lastName: 'Aliyev' }, { surname: 'ALIYEV', givenNames: 'SAHIN' }).status).toBe('spelling');
  });

  it('mismatch for a different person', () => {
    expect(compareWithMrz({ firstName: 'Elvin', lastName: 'Məmmədov' }, { surname: 'HUSEYNOV', givenNames: 'RASHAD' }).status).toBe('mismatch');
    expect(compareWithMrz({ firstName: 'Leyla', lastName: 'Məmmədova' }, { surname: 'MAMMADOVA', givenNames: 'NIGAR' }).status).toBe('mismatch');
  });

  it('analyseName combines everything; no comparison without an MRZ', () => {
    const a = analyseName({ firstName: 'Elvin', lastName: 'Məmmədov' });
    expect(a.comparison).toBeNull();
    expect(a.lastName[0]).toMatchObject({ variant: 'mrz', display: 'MAMMADOV' });
    expect(analyseName({ firstName: 'Elvin', lastName: 'Məmmədov' }, { surname: 'MAMMADOV', givenNames: 'ELVIN' }).comparison?.status).toBe('exact');
  });
});
