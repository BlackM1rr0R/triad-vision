import { describe, expect, it } from 'vitest';
import { excerpt, mentionedUserIds, mentionsAll } from '../../src/lib/chat/mentions.js';

const people = [
  { id: 'u1', firstName: 'Kamran', lastName: 'Aliyev' },
  { id: 'u2', firstName: 'Aysel', lastName: 'Mammadova' },
  { id: 'u3', firstName: 'Aysel', lastName: 'Quliyeva' },
  { id: 'u4', firstName: 'Hans', lastName: 'Müller' },
];

describe('chat mentions', () => {
  it('resolves "@First Last" case-insensitively and in any position', () => {
    expect(mentionedUserIds('@Kamran Aliyev can you check?', people)).toEqual(['u1']);
    expect(mentionedUserIds('ping @kamran aliyev and @Hans Müller!', people).sort()).toEqual(['u1', 'u4']);
    expect(mentionedUserIds('(@Aysel Quliyeva)', people)).toEqual(['u3']);
  });

  it('resolves a first name only when it is unambiguous', () => {
    expect(mentionedUserIds('@Kamran please', people)).toEqual(['u1']);
    expect(mentionedUserIds('@Aysel please', people)).toEqual([]);
    expect(mentionedUserIds('@Aysel Mammadova please', people)).toEqual(['u2']);
  });

  it('ignores e-mail addresses and partial words', () => {
    expect(mentionedUserIds('mail kamran@aliyev.com', people)).toEqual([]);
    expect(mentionedUserIds('@Kamranov', people)).toEqual([]);
    expect(mentionedUserIds('no mentions here', people)).toEqual([]);
  });

  it('detects @all / @channel / localised variants', () => {
    expect(mentionsAll('@all lunch at 13:00')).toBe(true);
    expect(mentionsAll('hey @channel')).toBe(true);
    expect(mentionsAll('@hamı salam')).toBe(true);
    expect(mentionsAll('@alle hallo')).toBe(true);
    expect(mentionsAll('@все привет')).toBe(true);
    expect(mentionsAll('@allan is here')).toBe(false);
    expect(mentionsAll('nothing')).toBe(false);
  });

  it('builds single-line excerpts', () => {
    expect(excerpt('  line one\n\nline   two  ')).toBe('line one line two');
    expect(excerpt('x'.repeat(300), 20)).toHaveLength(20);
    expect(excerpt('x'.repeat(300), 20).endsWith('…')).toBe(true);
  });
});
