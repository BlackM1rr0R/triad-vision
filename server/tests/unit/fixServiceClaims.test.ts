import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  MIN_SUBSTRING,
  applyFixes,
  claimHits,
  deactivateQuoteTranslationItem,
  fixesFor,
  isSalesOnlySlug,
  replaceOutsideNew,
  reviewHits,
  type TextFix,
} from '../../prisma/fix-service-claims.rules.js';
import { TEXT_FIXES } from '../../prisma/fix-service-claims.data.js';

const LONG_OLD = 'We compile the embassy document package and book the appointment';
const LONG_NEW = 'We prepare and give you the complete embassy document set; you apply to the embassy yourself';

const FIXES: TextFix[] = [
  { model: 'Service', where: 'documents', old: 'Documents & translation', new: 'Documents & review' },
  { model: 'Service', where: 'documents', old: 'Sworn translation', new: 'Complete embassy document set' },
  { model: 'Service', where: 'documents', old: 'Notarisation and apostille', new: null },
  { model: 'Service', where: 'visa-support', old: LONG_OLD, new: LONG_NEW },
  { model: 'ContractTemplate', old: '- Prüfung der Unterlagen\n- Beratung', new: '- Prüfung der Unterlagen, die die Botschaft verlangt\n- Beratung' },
];

const all = (model: TextFix['model'], key?: string) => fixesFor(FIXES, model, key);

describe('fix-service-claims rules', () => {
  it('replaces a long seeded sentence inside a longer text and leaves the rest alone', () => {
    const body = { en: `Intro.\n\n${LONG_OLD}.\n\nOutro.`, de: 'Unverändert.' };
    const r = applyFixes(body, all('Service', 'visa-support'));
    expect(r.changed).toBe(true);
    expect(r.value).toEqual({ en: `Intro.\n\n${LONG_NEW}.\n\nOutro.`, de: 'Unverändert.' });
    expect(r.changes).toEqual([{ path: 'en', fix: 3, action: 'replaced' }]);
  });

  it('replaces a short text only when the whole string is the old wording', () => {
    const r = applyFixes({ en: 'Documents & translation', de: 'Our documents & translation team' }, all('Service', 'documents'));
    expect(r.value).toEqual({ en: 'Documents & review', de: 'Our documents & translation team' });
    expect('Documents & translation'.length).toBeLessThan(MIN_SUBSTRING);
  });

  it('replaces and removes list items exactly', () => {
    const features = { en: ['Document checklist', 'Sworn translation', 'Notarisation and apostille', 'Online account'] };
    const r = applyFixes(features, all('Service', 'documents'));
    expect(r.value).toEqual({ en: ['Document checklist', 'Complete embassy document set', 'Online account'] });
    expect(r.changes.map((c) => c.action)).toEqual(['replaced', 'removed-item']);
  });

  it('flags a removal fix found inside a text instead of editing it', () => {
    const r = applyFixes({ en: 'Notarisation and apostille' }, all('Service', 'documents'));
    expect(r.changed).toBe(false);
    expect(r.flags).toHaveLength(1);
  });

  it('never touches owner-edited text', () => {
    const owner = { en: 'We book the embassy appointment for you (owner wrote this).' };
    const r = applyFixes(owner, all('Service', 'visa-support'));
    expect(r.changed).toBe(false);
    expect(r.value).toEqual(owner);
    expect(r.present.size).toBe(0);
  });

  it('is idempotent, also when the new wording extends the old one', () => {
    const fixes = all('ContractTemplate');
    const once = applyFixes('§ 2\n- Prüfung der Unterlagen\n- Beratung zu allem', fixes);
    expect(once.value).toBe('§ 2\n- Prüfung der Unterlagen, die die Botschaft verlangt\n- Beratung zu allem');
    const twice = applyFixes(once.value, fixes);
    expect(twice.changed).toBe(false);
    expect(twice.value).toBe(once.value);
    expect(twice.present.has(4)).toBe(true);
    expect(replaceOutsideNew('A-A', 'A', 'AB')).toBe('AB-AB');
    expect(replaceOutsideNew('AB-A', 'A', 'AB')).toBe('AB-AB');
  });

  it('selects fixes by model and where', () => {
    expect(all('Service', 'documents').map((f) => f.index)).toEqual([0, 1, 2]);
    expect(all('Service', 'other')).toEqual([]);
    expect(all('ContractTemplate', 'anything').map((f) => f.index)).toEqual([4]);
  });

  it('reports review categories and sales-only slugs', () => {
    expect(reviewHits({ az: 'Apostil lazımdır', de: ['Botschaftstermin buchen'] }).sort()).toEqual(['apostille', 'embassyAppointment']);
    expect(reviewHits({ en: 'Nothing here' })).toEqual([]);
    expect(isSalesOnlySlug('translation-apostille')).toBe(true);
    expect(isSalesOnlySlug('tercume')).toBe(true);
    expect(isSalesOnlySlug('visa-support')).toBe(false);
  });

  it('lists "we do it" sentences as likely claims, but not the client-does-it wording', () => {
    expect(claimHits({ en: 'We arrange the apostille for you.' })).toEqual(['apostille']);
    expect(claimHits({ az: 'Səfirlik üçün sənəd paketini tərtib edir və səfirlik görüşünü alırıq.' })).toEqual(['embassyAppointment']);
    expect(claimHits({ ru: 'Мы организуем перевод документов.' })).toEqual(['translation']);
    expect(claimHits({ en: 'We tell you which documents need an apostille – you have these done yourself.' })).toEqual([]);
    expect(claimHits({ ru: 'Мы готовим заявление (переводы вы оформляете самостоятельно).' })).toEqual([]);
    expect(claimHits({ en: 'The embassy requires an apostille.' })).toEqual([]);
  });

  it('deactivates the shipped translation item of the quote catalogue once', () => {
    const settings = {
      catalogue: [
        { id: 'visa-service', name: 'Visa', active: true },
        { id: 'translation', name: 'Übersetzung und Beglaubigung von Dokumenten', active: true },
      ],
    };
    const r = deactivateQuoteTranslationItem(settings);
    expect(r?.path).toBe('catalogue[1].active');
    expect((r?.value as typeof settings).catalogue[1].active).toBe(false);
    expect(deactivateQuoteTranslationItem(r?.value)).toBeNull();
    expect(deactivateQuoteTranslationItem({ catalogue: [{ id: 'translation', name: 'Renamed by the owner', active: true }] })).toBeNull();
  });
});

describe('fix-service-claims data', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const files: string[] = [];
  const collect = (p: string) => {
    if (statSync(p).isDirectory()) readdirSync(p).forEach((f) => collect(join(p, f)));
    else if (p.endsWith('.ts')) files.push(p);
  };
  ['prisma/seed', 'prisma/seed.ts', 'prisma/seedServices.ts', 'prisma/enrich-content.ts', 'src/lib/automation/examples.ts', 'src/lib/training/starter.ts', 'src/lib/quotes/settings.ts'].forEach((p) =>
    collect(join(root, p)),
  );
  const sources = files.map((f) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n').replace(/\\'/g, "'")).join('\n');

  it('every new wording is what the seeds now ship, and no old wording is left in the seeds', () => {
    for (const f of TEXT_FIXES) {
      if (f.new !== null) expect(sources.includes(f.new), `new wording of "${f.old.slice(0, 40)}"`).toBe(true);
      if (f.new === null || !f.new.includes(f.old)) expect(sources.includes(f.old), `old wording "${f.old.slice(0, 40)}"`).toBe(false);
    }
  });

  it('has no duplicate fixes and no empty old wording', () => {
    const keys = TEXT_FIXES.map((f) => `${f.model}|${f.where ?? ''}|${f.old}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(TEXT_FIXES.every((f) => f.old.trim().length > 0)).toBe(true);
  });
});
