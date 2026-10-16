import { checkDigit } from '../../src/lib/docsIntel/mrz.js';

/** YYMMDD of an ISO date. */
const yymmdd = (iso: string) => iso.slice(2, 4) + iso.slice(5, 7) + iso.slice(8, 10);

/** Builds a TD3 MRZ (two 44-character lines) with correct check digits. */
export const buildMrz = (o: { surname: string; given: string; docNo: string; nationality?: string; birth: string; sex?: 'M' | 'F'; expiry: string }) => {
  const nat = o.nationality ?? 'AZE';
  const line1 = `P<${nat}${o.surname.replace(/ /g, '<')}<<${o.given.replace(/ /g, '<')}`.padEnd(44, '<').slice(0, 44);
  const doc = o.docNo.padEnd(9, '<');
  const docPart = doc + checkDigit(doc);
  const birth = yymmdd(o.birth);
  const birthPart = birth + checkDigit(birth);
  const expiry = yymmdd(o.expiry);
  const expiryPart = expiry + checkDigit(expiry);
  const optional = '<'.repeat(14) + '0';
  const composite = checkDigit(docPart + birthPart + expiryPart + optional);
  const line2 = docPart + nat + birthPart + (o.sex ?? 'M') + expiryPart + optional + composite;
  return [line1, line2] as const;
};

/** ISO date `months` months from now (UTC). */
export const monthsFromNow = (months: number) => {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
};

/** A minimal PNG (signature + IHDR) of the given size: enough for the magic-byte and size checks. */
export const fakePng = (width = 1600, height = 1100, padTo = 0) => {
  const head = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(head, 0);
  head.writeUInt32BE(13, 8);
  head.write('IHDR', 12, 'latin1');
  head.writeUInt32BE(width, 16);
  head.writeUInt32BE(height, 20);
  head[24] = 8;
  head[25] = 2;
  return padTo > head.length ? Buffer.concat([head, Buffer.alloc(padTo - head.length)]) : head;
};

/** A minimal JPEG (SOI, APP0, SOF0) of the given size. */
export const fakeJpeg = (width: number, height: number) => {
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]);
  const sof = Buffer.alloc(19);
  sof.writeUInt16BE(0xffc0, 0);
  sof.writeUInt16BE(17, 2);
  sof[4] = 8;
  sof.writeUInt16BE(height, 5);
  sof.writeUInt16BE(width, 7);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof, Buffer.from([0xff, 0xd9])]);
};
