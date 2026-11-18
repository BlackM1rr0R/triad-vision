import { describe, expect, it } from 'vitest';
import { dropMasked, isMasked, maskedKeys } from './maskedInput';

describe('masked form values', () => {
  it('recognises the server masks', () => {
    expect(isMasked('••••')).toBe(true);
    expect(isMasked('•••• 3456')).toBe(true);
    expect(isMasked('Musterstraße 12')).toBe(false);
    expect(isMasked(null)).toBe(false);
    expect(isMasked(12)).toBe(false);
  });

  it('leaves unchanged masked fields out of the save, keeps everything else (also cleared fields)', () => {
    const body = { name: 'Wohnung Mitte', address: '••••', contactName: '••••', contactPhone: '+49 30 1234', contactEmail: '', priceMin: 500, active: true };
    expect(dropMasked(body)).toEqual({ name: 'Wohnung Mitte', contactPhone: '+49 30 1234', contactEmail: '', priceMin: 500, active: true });
    expect(maskedKeys(body)).toEqual(['address', 'contactName']);
  });
});
