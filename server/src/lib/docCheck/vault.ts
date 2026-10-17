import type { VaultDocKind, VaultDocument } from '@prisma/client';

/** Requirement key (DocumentRequirement.key) → vault kinds that can satisfy it, best match first. */
export const REQUIREMENT_VAULT_KINDS: Record<string, VaultDocKind[]> = {
  PASSPORT: ['PASSPORT'],
  ID_CARD: ['ID_CARD'],
  PHOTO: ['PHOTO'],
  PHOTO_2: ['PHOTO'],
  CV: ['CV'],
  DIPLOMA: ['DIPLOMA', 'TRANSCRIPT', 'CERTIFICATE'],
  ANERKENNUNG: ['CERTIFICATE'],
  EMPLOYMENT_REF: ['EMPLOYMENT_REF'],
  LANGUAGE_CERT: ['LANGUAGE_CERT'],
  GERMAN_CERT: ['LANGUAGE_CERT'],
  DRIVING_LICENCE: ['DRIVING_LICENCE'],
  BIRTH_CERT: ['BIRTH_CERT'],
  MARRIAGE_CERT: ['MARRIAGE_CERT'],
  POLICE_CLEARANCE: ['POLICE_CLEARANCE'],
};

export const vaultKindsFor = (requirementKey: string | null | undefined): VaultDocKind[] =>
  (requirementKey && REQUIREMENT_VAULT_KINDS[requirementKey]) || [];

/** Expiry thresholds (days) for the "expires soon" badge and the reminder job. */
export const VAULT_REMINDER_DAYS = [90, 30] as const;

const DAY = 24 * 60 * 60 * 1000;

export type ExpiryStatus = 'none' | 'valid' | 'soon' | 'expired';

/** Expiry status and whole days left (negative when expired). */
export const expiryOf = (expiresAt: Date | null, now = new Date()): { status: ExpiryStatus; daysLeft: number | null } => {
  if (!expiresAt) return { status: 'none', daysLeft: null };
  const daysLeft = Math.ceil((expiresAt.getTime() - now.getTime()) / DAY);
  if (expiresAt.getTime() <= now.getTime()) return { status: 'expired', daysLeft };
  return { status: daysLeft <= VAULT_REMINDER_DAYS[0] ? 'soon' : 'valid', daysLeft };
};

/** Public shape of a vault document (the storage key never leaves the server). */
export const vaultDto = (d: VaultDocument, now = new Date()) => ({
  id: d.id,
  kind: d.kind,
  title: d.title,
  ownerName: d.ownerName,
  filename: d.filename,
  mimeType: d.mimeType,
  size: d.size,
  issuedAt: d.issuedAt,
  expiresAt: d.expiresAt,
  checks: d.checks,
  createdAt: d.createdAt,
  updatedAt: d.updatedAt,
  expiry: expiryOf(d.expiresAt, now),
});
