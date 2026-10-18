import { prisma } from '../../db.js';
import { readLegal } from '../invoicePdf.js';
import type { Letterhead } from './pdf.js';

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/**
 * The company letterhead of documents made in the drive: name and address from the 'legal' setting,
 * phone / e-mail / website from 'legal' or else from 'contact' (first office address as a fallback).
 */
export const loadLetterhead = async (): Promise<Letterhead> => {
  const rows = await prisma.setting.findMany({ where: { key: { in: ['legal', 'contact'] } } });
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const { seller } = readLegal(byKey.get('legal'));
  const contact = (byKey.get('contact') ?? {}) as Record<string, unknown>;
  const offices = Array.isArray(contact.offices) ? (contact.offices as Record<string, unknown>[]) : [];
  const lines = [seller.street, [seller.zipCity, seller.zipCity && seller.country !== 'Deutschland' ? seller.country : ''].filter(Boolean).join(', ')].filter(Boolean);
  if (!lines.length) for (const o of offices.slice(0, 2)) if (str(o.address)) lines.push(str(o.address));
  const contactLines = [seller.phone || str(contact.phone), seller.email || str(contact.email), seller.website].filter(Boolean);
  return { name: seller.name || 'Triad Vision', lines: lines.slice(0, 3), contact: contactLines.slice(0, 3) };
};
