import { describe, expect, it } from 'vitest';
import { DEFAULT_QUOTE_SETTINGS, readQuoteSettings, type CatalogueItem } from '../../src/lib/quotes/settings.js';
import { configuratorCatalogue, priceConfiguration, tierDiscount } from '../../src/lib/packageConfigurator/pricing.js';

const VAT = { defaultRate: 19, smallBusiness: false };
const item = (over: Partial<CatalogueItem>): CatalogueItem => ({ id: 'x', name: 'Leistung', unit: 'PERSON', unitPriceCents: 10000, vatRate: null, active: true, service: null, professions: [], volumeTiers: [], ...over });

describe('package configurator: catalogue', () => {
  it('maps the shipped default catalogue to the six services', () => {
    const o = configuratorCatalogue(DEFAULT_QUOTE_SETTINGS.catalogue);
    expect(o.RECRUITMENT.map((x) => x.catalogueId)).toEqual(['placement-ce', 'placement-skilled']);
    expect(o.RECRUITMENT[0].professions).toEqual(['truck_driver']);
    expect(o.VISA_DOCUMENTS[0].catalogueId).toBe('visa-service');
    expect(o.ONBOARDING[0].unit).toBe('MONTH');
    expect(Object.keys(o)).toEqual(['RECRUITMENT', 'RECOGNITION', 'VISA_DOCUMENTS', 'RELOCATION', 'LANGUAGE_COURSE', 'ONBOARDING']);
  });

  it('recognises the default lines of a catalogue stored before the configurator (no tags)', () => {
    const legacy = readQuoteSettings({ catalogue: DEFAULT_QUOTE_SETTINGS.catalogue.map(({ id, name, unit, unitPriceCents, vatRate, active }) => ({ id, name, unit, unitPriceCents, vatRate, active })) });
    const o = configuratorCatalogue(legacy.catalogue);
    expect(o.RECRUITMENT).toHaveLength(2);
    expect(o.RELOCATION[0].unitPriceCents).toBe(50000);
  });

  it('never offers apostille, translation or appointment booking, inactive lines or untagged extras', () => {
    const o = configuratorCatalogue([
      item({ id: 'a', name: 'Apostille und Beglaubigung', service: 'VISA_DOCUMENTS' }),
      item({ id: 'b', name: 'Übersetzung der Dokumente', service: 'VISA_DOCUMENTS' }),
      item({ id: 'c', name: 'Buchung Botschaftstermin', service: 'VISA_DOCUMENTS' }),
      item({ id: 'd', name: 'Visa-Unterlagen', service: 'VISA_DOCUMENTS', active: false }),
      item({ id: 'translation', name: 'Fachübersetzungen' }),
      item({ id: 'e', name: 'Sonderprojekt' }),
    ]);
    expect(Object.values(o).flat()).toEqual([]);
  });

  it('a line without price is on request', () => {
    const o = configuratorCatalogue([item({ id: 'r', service: 'RECOGNITION', unitPriceCents: 0 })]);
    expect(o.RECOGNITION[0].unitPriceCents).toBeNull();
  });
});

describe('package configurator: price', () => {
  const catalogue = configuratorCatalogue([
    item({ id: 'ce', name: 'Vermittlung LKW', service: 'RECRUITMENT', professions: ['truck_driver'], unitPriceCents: 450000, volumeTiers: [{ minQty: 5, discountBp: 500 }, { minQty: 10, discountBp: 1000 }] }),
    item({ id: 'gen', name: 'Vermittlung allgemein', service: 'RECRUITMENT', unitPriceCents: 350000 }),
    item({ id: 'visa', name: 'Visa-Unterlagen', service: 'VISA_DOCUMENTS', unitPriceCents: 90000 }),
    item({ id: 'care', name: 'Betreuung', service: 'ONBOARDING', unit: 'MONTH', unitPriceCents: 15000 }),
    item({ id: 'flat', name: 'Wohnungssuche pauschal', service: 'RELOCATION', unit: 'FLAT', unitPriceCents: 100000, vatRate: 7 }),
  ]);

  it('picks the profession line, else the general one, and multiplies by the unit', () => {
    const p = priceConfiguration(
      { positions: [{ profession: 'truck_driver', count: 2 }, { profession: 'cook', count: 1 }], services: ['RECRUITMENT', 'VISA_DOCUMENTS', 'ONBOARDING', 'RELOCATION'], months: 4 },
      catalogue,
      VAT,
    );
    expect(p.workers).toBe(3);
    const by = (id: string) => p.lines.find((l) => l.catalogueId === id)!;
    expect(by('ce')).toMatchObject({ quantity: 2, totalCents: 900000, discountBp: 0, profession: 'truck_driver' });
    expect(by('gen')).toMatchObject({ quantity: 1, totalCents: 350000, profession: 'cook' });
    expect(by('visa')).toMatchObject({ quantity: 3, totalCents: 270000 });
    expect(by('care')).toMatchObject({ quantity: 12, totalCents: 180000 });
    expect(by('flat')).toMatchObject({ quantity: 1, totalCents: 100000 });
    expect(p.totals.netCents).toBe(900000 + 350000 + 270000 + 180000 + 100000);
    expect(p.totals.vatCents).toBe(Math.round(1700000 * 0.19) + 7000);
    expect(p.onRequest).toBe(false);
  });

  it('applies the volume tier of the total number of workers', () => {
    const p = priceConfiguration({ positions: [{ profession: 'truck_driver', count: 10 }], services: ['RECRUITMENT'], months: 1 }, catalogue, VAT);
    expect(p.lines[0]).toMatchObject({ discountBp: 1000, discountCents: 450000 });
    expect(p.totals).toMatchObject({ subtotalCents: 4500000, discountCents: 450000, netCents: 4050000 });
    expect(tierDiscount([{ minQty: 5, discountBp: 500 }], 4)).toBe(0);
  });

  it('services without a catalogue price are on request and add nothing', () => {
    const p = priceConfiguration({ positions: [{ profession: 'nurse', count: 2 }], services: ['RECRUITMENT', 'LANGUAGE_COURSE'], months: 1 }, catalogue, VAT);
    const lang = p.lines.find((l) => l.service === 'LANGUAGE_COURSE')!;
    expect(lang).toMatchObject({ onRequest: true, unitPriceCents: null, totalCents: null });
    expect(p.onRequest).toBe(true);
    expect(p.complete).toBe(false);
    expect(p.totals.netCents).toBe(700000);
  });

  it('merges positions of one profession and charges no VAT for a small business', () => {
    const p = priceConfiguration({ positions: [{ profession: 'cook', count: 1 }, { profession: 'cook', count: 2 }], services: ['RECRUITMENT'], months: 1 }, catalogue, { defaultRate: 19, smallBusiness: true });
    expect(p.lines).toHaveLength(1);
    expect(p.lines[0].quantity).toBe(3);
    expect(p.totals.vatCents).toBe(0);
  });
});
