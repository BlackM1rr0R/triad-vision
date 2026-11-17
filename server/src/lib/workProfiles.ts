import type { Role } from '@prisma/client';
import { hasMinRole } from '../middleware/auth.js';

/**
 * Work profiles of the simple admin sidebar (StaffPreferences.workProfile / navView). A profile only decides
 * which pages the "Simple view" lists; role guards and module toggles still decide what can be opened at all.
 * The page lists live in the client (client/src/components/command/workProfiles.ts, mirrored keys + defaults,
 * server/tests/unit/workProfiles.test.ts keeps both in step).
 */

export const WORK_PROFILES = ['SALES', 'CASES', 'FINANCE', 'EMPLOYERS', 'CONTENT', 'OWNER'] as const;
export type WorkProfile = (typeof WORK_PROFILES)[number];
export const isWorkProfile = (v: unknown): v is WorkProfile => typeof v === 'string' && (WORK_PROFILES as readonly string[]).includes(v);

export const NAV_VIEWS = ['simple', 'full'] as const;
export type NavView = (typeof NAV_VIEWS)[number];
export const isNavView = (v: unknown): v is NavView => v === 'simple' || v === 'full';

/** Profile from the old sidebar desk (when one was chosen). */
const DESK_PROFILE: Record<string, WorkProfile> = { MANAGER: 'CASES', FINANCE: 'FINANCE', MARKETING: 'SALES', ALL: 'OWNER' };

/** Profile until one is chosen: the chosen desk's, else admins → management, everyone else → case handling. */
export const defaultWorkProfile = (role: Role | undefined | null, desk?: string | null): WorkProfile =>
  (desk && DESK_PROFILE[desk]) || (hasMinRole(role ?? undefined, 'ADMIN') ? 'OWNER' : 'CASES');

/** Stored profile if valid, else the default. */
export const resolveWorkProfile = (stored: unknown, role: Role | undefined | null, desk?: string | null): WorkProfile =>
  isWorkProfile(stored) ? stored : defaultWorkProfile(role, desk);

/**
 * Sidebar view: the stored choice; without one, "simple" once a profile was assigned / picked (so assigning a
 * profile simplifies the menu), otherwise "full" (the menu staff knew before).
 */
export const resolveNavView = (stored: unknown, storedProfile: unknown): NavView => (isNavView(stored) ? stored : isWorkProfile(storedProfile) ? 'simple' : 'full');
