import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { CARD_FORMATS, successCardPng, successCardSvg, type CardInput } from '../../src/lib/successShare/card.js';
import { displayNameOf } from '../../src/lib/successShare/service.js';
import { firstNameInitial } from '../../src/lib/arrivalCertificate/service.js';

const input = (over: Partial<CardInput> = {}): CardInput => ({
  format: 'post',
  displayName: 'Aynur',
  kicker: 'Uğur hekayəsi',
  headline: 'Vizam təsdiqləndi!',
  visaLine: '§18b · Peşəkar sürücü (LKW-Fahrer)',
  destination: 'Hamburg, Almaniya',
  subline: 'Almaniyaya yolum başlayır',
  withUs: 'Triad Vision ilə',
  scanLabel: 'Sən də başla',
  codeLine: 'Kod: TVABC234',
  qrUrl: 'https://triad-vision.de/success/abcdefghijklmnopqrstuv?ref=TVABC234',
  lang: 'az',
  ...over,
});

describe('success share card renderer', () => {
  it('renders a 1080×1350 portrait PNG for feeds', async () => {
    const png = await successCardPng(input());
    const meta = await sharp(png).metadata();
    expect(meta.format).toBe('png');
    expect([meta.width, meta.height]).toEqual([CARD_FORMATS.post.w, CARD_FORMATS.post.h]);
    expect([meta.width, meta.height]).toEqual([1080, 1350]);
  });

  it('renders a 1080×1920 story PNG (Cyrillic text, no referral code)', async () => {
    const png = await successCardPng(input({ format: 'story', displayName: 'Ш. А.', headline: 'Моя виза одобрена!', codeLine: null, lang: 'ru' }));
    const meta = await sharp(png).metadata();
    expect([meta.width, meta.height]).toEqual([1080, 1920]);
  });

  it('draws text as outlines only (nothing readable or injectable in the SVG)', async () => {
    const svg = await successCardSvg(input({ displayName: '<script>alert(1)</script>' }));
    expect(svg).not.toContain('<script');
    expect(svg).not.toContain('<text');
    expect(svg).not.toContain('Aynur');
    expect(svg).toContain('<path'); // glyph outlines + the QR code
  });

  it('display names are the first name or the initials, never the surname', () => {
    const u = { firstName: 'Aynur Leyla', lastName: 'Qasımova' };
    expect(displayNameOf(u, 'first', 'az')).toBe('Aynur');
    expect(displayNameOf(u, 'initials', 'az')).toBe('A. Q.');
    expect(displayNameOf({ firstName: 'ilkin', lastName: 'İsmayılov' }, 'initials', 'az')).toBe('İ. İ.');
    for (const style of ['first', 'initials'] as const) expect(displayNameOf(u, style, 'az')).not.toContain('Qasımova');
  });

  it('anonymous style shows a label in the card language, never a name', () => {
    const u = { firstName: 'Aynur Leyla', lastName: 'Qasımova' };
    expect(displayNameOf(u, 'anonymous', 'az')).toBe('Triad Vision müştərisi');
    expect(displayNameOf(u, 'anonymous', 'de')).toBe('Ein Triad Vision Kunde');
    expect(displayNameOf(u, 'anonymous', 'en')).toBe('A Triad Vision client');
    expect(displayNameOf(u, 'anonymous', 'ru')).toBe('Клиент Triad Vision');
    expect(displayNameOf(u, 'anonymous', 'tr')).toBe('A Triad Vision client'); // non-card language → English
    for (const part of ['Aynur', 'Leyla', 'Qasımova', 'A.']) expect(displayNameOf(u, 'anonymous', 'az')).not.toContain(part);
  });

  it('edge cases: empty first name falls back to initials, blank names give an empty string', () => {
    expect(displayNameOf({ firstName: '  ', lastName: 'Əliyev' }, 'first', 'az')).toBe('Ə.');
    expect(displayNameOf({ firstName: '', lastName: '' }, 'initials', 'az')).toBe('');
  });

  it('certificate check name: first given name + surname initial', () => {
    expect(firstNameInitial('Kamran Vüqar', 'Əliyev')).toBe('Kamran Ə.');
    expect(firstNameInitial('ilkin', 'ismayılov')).toBe('ilkin İ.');
    expect(firstNameInitial('Aynur', '')).toBe('Aynur');
  });

  it('renders a 1080×1080 square card with a profession line and the ✈ headline', async () => {
    const png = await successCardPng(input({ format: 'square', headline: 'Viza təsdiqləndi ✈', profession: 'Peşəkar sürücü (LKW-Fahrer)', displayName: 'Triad Vision müştərisi' }));
    const meta = await sharp(png).metadata();
    expect([meta.width, meta.height]).toEqual([1080, 1080]);
  });

  it('is deterministic (same input → same SVG)', async () => {
    const a = await successCardSvg(input({ format: 'story', profession: 'Pflegekraft' }));
    const b = await successCardSvg(input({ format: 'story', profession: 'Pflegekraft' }));
    expect(a).toBe(b);
  });
});
