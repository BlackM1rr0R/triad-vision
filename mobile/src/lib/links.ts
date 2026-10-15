import { isStaffRole, type Role } from '@/types';

export interface NotificationTarget {
  link?: string | null;
  caseId?: string | null;
  type?: string | null;
}

/**
 * Converts a server notification link (a web path such as /account/cases/:id or /admin/cases/:id)
 * into an app route for the logged-in role.
 */
export const routeForNotification = (target: NotificationTarget, role?: Role | null): string | null => {
  const link = target.link ?? '';
  const fromLink = /\/(?:account|admin)\/cases\/([^/?#]+)/.exec(link)?.[1];
  const caseId = fromLink || target.caseId || null;

  if (isStaffRole(role)) {
    if (caseId) return `/staff/cases/${caseId}`;
    return '/dashboard';
  }
  if (!role) return null;
  // Interview notifications link to the portal's interview page (no case involved).
  if (/\/account\/interviews/.test(link) || target.type?.startsWith('INTERVIEW_')) return '/interviews';
  if (caseId) {
    if (target.type === 'NEW_MESSAGE') return `/chat/${caseId}`;
    return `/cases/${caseId}`;
  }
  return '/notifications';
};
