/**
 * Small image helpers for the embassy package (no image library on the server: sharp is not a dependency).
 * Detects the real format from the bytes and reads the EXIF orientation of JPEG photos so phone pictures
 * are drawn upright.
 */

export type ImageKind = 'jpeg' | 'png' | null;

export const imageKind = (buf: Buffer): ImageKind => {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  return null;
};

export const isPdfBytes = (buf: Buffer) => buf.subarray(0, 1024).includes('%PDF');

/**
 * EXIF orientation (1–8) of a JPEG, 1 when absent or unreadable. Only the first APP1 "Exif" segment is
 * parsed (IFD0, tag 0x0112).
 */
export const jpegOrientation = (buf: Buffer): number => {
  try {
    if (imageKind(buf) !== 'jpeg') return 1;
    let p = 2;
    while (p + 4 <= buf.length) {
      if (buf[p] !== 0xff) return 1;
      const marker = buf[p + 1];
      if (marker === 0xd9 || marker === 0xda) return 1; // end of image / start of scan: no EXIF before the data
      const len = buf.readUInt16BE(p + 2);
      if (len < 2) return 1;
      if (marker === 0xe1 && buf.toString('latin1', p + 4, p + 10) === 'Exif\0\0') {
        const tiff = p + 10;
        const little = buf.toString('latin1', tiff, tiff + 2) === 'II';
        const u16 = (o: number) => (little ? buf.readUInt16LE(o) : buf.readUInt16BE(o));
        const u32 = (o: number) => (little ? buf.readUInt32LE(o) : buf.readUInt32BE(o));
        const ifd = tiff + u32(tiff + 4);
        const count = u16(ifd);
        for (let i = 0; i < count; i++) {
          const e = ifd + 2 + i * 12;
          if (e + 12 > buf.length) return 1;
          if (u16(e) === 0x0112) {
            const v = u16(e + 8);
            return v >= 1 && v <= 8 ? v : 1;
          }
        }
        return 1;
      }
      p += 2 + len;
    }
  } catch {
    /* malformed EXIF: draw as stored */
  }
  return 1;
};

/** Clockwise rotation (degrees) that makes an image with this EXIF orientation upright (mirroring is ignored). */
export const orientationRotation = (o: number): 0 | 90 | 180 | 270 => {
  if (o === 3 || o === 4) return 180;
  if (o === 6 || o === 5) return 90;
  if (o === 8 || o === 7) return 270;
  return 0;
};
