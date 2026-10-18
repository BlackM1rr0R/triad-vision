import { describe, expect, it } from 'vitest';
import { diffStats, diffText, diffTokens, lineTokens, wordTokens, type DiffOp } from '../../src/lib/driveIntel/diff.js';
import { MARKER, foldQuery, foldText, originalOf, snippetOf, storedText, tidyText } from '../../src/lib/driveIntel/normalize.js';
import { fillXml, findPlaceholders, placeholdersInXml } from '../../src/lib/driveIntel/placeholders.js';
import { keyFor } from '../../src/lib/driveIntel/template.js';

const side = (ops: DiffOp[], which: 'a' | 'b') => ops.filter((o) => o.t === 'eq' || o.t === (which === 'a' ? 'del' : 'ins')).map((o) => o.s).join('');

describe('driveIntel diff (Myers)', () => {
  it('reproduces both sides and finds a minimal edit', () => {
    const a = 'Der Vertrag beginnt am 1. Mai und endet am 30. April.';
    const b = 'Der Arbeitsvertrag beginnt am 1. Juni und endet am 30. April 2027.';
    const ops = diffTokens(wordTokens(a), wordTokens(b));
    expect(side(ops, 'a')).toBe(a);
    expect(side(ops, 'b')).toBe(b);
    expect(ops.filter((o) => o.t === 'del').map((o) => o.s.trim())).toEqual(['Vertrag', 'Mai', 'April.']);
    expect(ops.filter((o) => o.t === 'ins').map((o) => o.s.trim())).toEqual(['Arbeitsvertrag', 'Juni', 'April 2027.']);
    expect(diffStats(ops)).toEqual({ added: 4, removed: 3 });
  });

  it('handles empty sides, identical input and random edits', () => {
    expect(diffTokens([], ['a', 'b'])).toEqual([{ t: 'ins', s: 'ab' }]);
    expect(diffTokens(['a'], [])).toEqual([{ t: 'del', s: 'a' }]);
    expect(diffTokens(['x', 'y'], ['x', 'y'])).toEqual([{ t: 'eq', s: 'xy' }]);
    let seed = 7;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let round = 0; round < 40; round++) {
      const a = Array.from({ length: Math.floor(rnd() * 40) }, () => 'abcde'[Math.floor(rnd() * 5)]);
      const b = Array.from({ length: Math.floor(rnd() * 40) }, () => 'abcde'[Math.floor(rnd() * 5)]);
      const ops = diffTokens(a, b);
      expect(side(ops, 'a')).toBe(a.join(''));
      expect(side(ops, 'b')).toBe(b.join(''));
      // edit size never exceeds a full replacement
      const edits = ops.filter((o) => o.t !== 'eq').reduce((n, o) => n + o.s.length, 0);
      expect(edits).toBeLessThanOrEqual(a.length + b.length);
    }
  });

  it('gives up gracefully above maxD and switches to lines for long texts', () => {
    const a = Array.from({ length: 50 }, (_, i) => `a${i}`);
    const b = Array.from({ length: 50 }, (_, i) => `b${i}`);
    const ops = diffTokens(a, b, 10);
    expect(ops).toEqual([{ t: 'del', s: a.join('') }, { t: 'ins', s: b.join('') }]);
    const long = Array.from({ length: 300 }, (_, i) => `line ${i} with some words`).join('\n');
    const r = diffText(long, long.replace('line 150', 'LINE 150'), { maxWordTokens: 100 });
    expect(r.mode).toBe('lines');
    expect(r.ops.filter((o) => o.t !== 'eq')).toHaveLength(2);
    expect(lineTokens('a\nb\nc')).toEqual(['a\n', 'b\n', 'c']);
  });
});

describe('driveIntel text normalisation', () => {
  it('folds az / de / ru letters one-to-one', () => {
    const s = 'Şəhla Əliyeva İSMAYILLI Größe Ölçü Ёлка';
    const f = foldText(s);
    expect(f).toHaveLength(s.length);
    expect(f).toBe('sehla eliyeva ismayilli grose olcu елка');
    expect(foldQuery('  ŞƏHLA   əliyeva ')).toBe('sehla eliyeva');
    expect(foldText('a\tb\nc')).toBe('a b c');
  });

  it('stores original + folded copy and cuts a snippet around the hit', () => {
    const text = `${'Vorwort '.repeat(20)}\nHörmətli Şəhla xanım, Ihr Arbeitsvertrag liegt bei.\n${'Ende '.repeat(30)}`;
    const stored = storedText(text);
    expect(stored).toContain(MARKER);
    expect(originalOf(stored)).toBe(tidyText(text));
    expect(stored.split(MARKER)[1]).toBe(foldText(tidyText(text)));
    const snip = snippetOf(originalOf(stored), foldQuery('sehla xanim'))!;
    expect(snip.match).toBe('Şəhla xanım');
    expect(snip.before.startsWith('…')).toBe(true);
    expect(snip.after.endsWith('…')).toBe(true);
    expect(snip.before.length).toBeLessThanOrEqual(62);
    expect(snippetOf('abc', 'zzz')).toBeNull();
    expect(storedText('   ')).toBe('');
  });
});

describe('driveIntel placeholders', () => {
  it('finds {{ }}, [[ ]] and « » placeholders', () => {
    expect(findPlaceholders('Name: {{ client.fullName }}, Pass [[client.passportNumber]], «Ad Soyad»').map((h) => [h.raw, h.style])).toEqual([
      ['client.fullName', 'braces'],
      ['client.passportNumber', 'brackets'],
      ['Ad Soyad', 'guillemets'],
    ]);
    expect(keyFor('Ad Soyad')).toEqual({ key: 'client.fullName', known: true });
    expect(keyFor('client_birthDate')).toEqual({ key: 'client.birthDate', known: true });
    expect(keyFor('Geburtsdatum')).toEqual({ key: 'client.birthDate', known: true });
    expect(keyFor('Lieblingsfarbe')).toEqual({ key: 'Lieblingsfarbe', known: false });
  });

  it('replaces a placeholder Word split over several runs, keeping the first run formatting', () => {
    const xml =
      '<w:body><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Sehr geehrte(r) {{cli</w:t></w:r><w:r><w:t>ent.full</w:t></w:r><w:r><w:t xml:space="preserve">Name}}, willkommen &amp; </w:t></w:r><w:r><w:t>[[unknown.key]]</w:t></w:r></w:p>' +
      '<w:p><w:r><w:t>«Ad </w:t></w:r><w:r><w:t>Soyad»</w:t></w:r></w:p></w:body>';
    expect(placeholdersInXml(xml).map((h) => h.raw)).toEqual(['client.fullName', 'unknown.key', 'Ad Soyad']);
    const res = fillXml(xml, (h) => (h.raw === 'unknown.key' ? null : 'Şəhla <Əliyeva>'));
    expect(res.replaced.sort()).toEqual(['Ad Soyad', 'client.fullName']);
    expect(res.left).toEqual(['unknown.key']);
    expect(res.xml).toContain('<w:rPr><w:b/></w:rPr><w:t xml:space="preserve">Sehr geehrte(r) Şəhla &lt;Əliyeva&gt;</w:t>');
    expect(res.xml).toContain('<w:t xml:space="preserve">, willkommen &amp; </w:t>');
    expect(res.xml).toContain('[[unknown.key]]');
    expect(res.xml).not.toContain('{{');
    expect(res.xml).not.toContain('Soyad»');
    // the placeholder ends exactly at a run boundary
    const edge = fillXml('<w:p><w:r><w:t>{{today</w:t></w:r><w:r><w:t>}}</w:t></w:r><w:r><w:t> Ende</w:t></w:r></w:p>', () => '18.10.2026');
    expect(edge.xml.replace(/<[^>]+>/g, '')).toBe('18.10.2026 Ende');
  });
});
