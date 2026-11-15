import crypto from 'node:crypto';
import { config } from '../../config.js';
import { prisma } from '../../db.js';

/**
 * Public verification of a hand-over receipt (Übergabeprotokoll / Qəbul-təhvil aktı).
 *
 * Every act PDF carries a QR code → <CLIENT_URL>/originals/verify/<code>. The code is random (16 characters
 * from a 32-letter alphabet = 80 bits), not derived from any id, so it cannot be guessed or enumerated. The
 * page shows ONLY a snapshot stored when the act was made: receipt number, date, number of documents, the kind
 * of hand-over (received from the client / given out / returned to the client), the staff member's first name
 * and the client's initials — never passport numbers, full names, document titles or contact data.
 */

export const RECEIPT_CODE_RE = /^[A-Z2-9]{16}$/;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 letters: b % 32 has no modulo bias
export const randomReceiptCode = () => Array.from(crypto.randomBytes(16), (b) => ALPHABET[b % ALPHABET.length]).join('');

export const receiptVerifyUrl = (code: string) => `${config.clientUrl.replace(/\/+$/, '')}/originals/verify/${code}`;

/** "Əli Məmmədov" → "Ə. M." (first letters only, upper-cased in the person's own script). */
export const initialsOf = (firstName: string | null | undefined, lastName: string | null | undefined) =>
  [firstName, lastName]
    .map((n) => (n ?? '').trim())
    .filter(Boolean)
    .map((n) => `${[...n][0].toLocaleUpperCase('az')}.`)
    .join(' ')
    .slice(0, 8) || '—';

/** First word of the staff member's first name (no surname). */
export const staffFirstNameOf = (firstName: string | null | undefined) => (firstName ?? '').trim().split(/\s+/)[0]?.slice(0, 80) || null;

export interface ReceiptSnapshot {
  code: string;
  actNodeId: string;
  number: string;
  caseId: string;
  action: string;
  at: Date;
  itemCount: number;
  staffFirstName: string | null;
  clientInitials: string;
}

export const saveReceipt = (s: ReceiptSnapshot) =>
  prisma.originalReceipt.upsert({
    where: { actNodeId: s.actNodeId },
    create: s,
    update: { number: s.number, action: s.action, at: s.at, itemCount: s.itemCount, staffFirstName: s.staffFirstName, clientInitials: s.clientInitials },
  });

/** The existing code of an act (re-rendering after signing keeps the same QR). */
export const receiptCodeFor = async (actNodeId: string) => (await prisma.originalReceipt.findUnique({ where: { actNodeId }, select: { code: true } }))?.code ?? null;

/** Public answer: the snapshot only. `returned` is true once the act's documents were given back to the client. */
export const verifyReceipt = async (code: string) => {
  if (!RECEIPT_CODE_RE.test(code)) return null;
  const r = await prisma.originalReceipt.findUnique({ where: { code } });
  if (!r) return null;
  // The act file must still exist (a deleted act is no longer a valid receipt).
  const node = await prisma.driveNode.findUnique({ where: { id: r.actNodeId }, select: { deletedAt: true } });
  if (!node || node.deletedAt) return null;
  return {
    valid: true as const,
    number: r.number,
    date: r.at.toISOString(),
    documents: r.itemCount,
    status: r.action === 'RETURNED_TO_CLIENT' ? ('RETURNED' as const) : r.action === 'GIVEN_OUT' ? ('GIVEN_OUT' as const) : ('HANDED_OVER' as const),
    staff: r.staffFirstName,
    client: r.clientInitials,
  };
};
