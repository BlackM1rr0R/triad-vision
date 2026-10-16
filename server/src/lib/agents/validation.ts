import { z } from 'zod';

/** IBAN: spaces removed, upper-case, basic shape + ISO 7064 mod-97 check. */
export const ibanField = z
  .string()
  .trim()
  .max(64)
  .nullable()
  .optional()
  .transform((v, ctx) => {
    if (v === undefined) return undefined;
    const s = (v ?? '').replace(/\s+/g, '').toUpperCase();
    if (!s) return null;
    const rearranged = s.slice(4) + s.slice(0, 4);
    const digits = rearranged.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
    let rem = 0;
    for (const d of digits) rem = (rem * 10 + Number(d)) % 97;
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s) || rem !== 1) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'INVALID_IBAN' });
      return z.NEVER;
    }
    return s;
  });
