/**
 * Shapes and query keys of the staff onboarding endpoints (server/src/routes/admin/staffOnboarding.ts):
 * /admin/whats-new, /admin/training-checklist, /admin/setup-checklist.
 */
export type Text4 = Partial<Record<'az' | 'ru' | 'en' | 'de', string>>;

export interface WhatsNewItem {
  id: string;
  date: string;
  source: 'code' | 'custom' | 'legacy';
  /** null → texts from the client i18n sp.whatsNew.items.<id> (older notes) */
  title: Text4 | null;
  body: Text4 | null;
  roles: string[];
  link: string | null;
  tour?: string;
  seen: boolean;
}
export interface WhatsNewFeedV2 {
  items: WhatsNewItem[];
  unseen: number;
  /** ids for the login modal (unseen, newest first, capped) */
  modal: string[];
}
export interface ManagedEntry extends Omit<WhatsNewItem, 'seen'> {
  hidden: boolean;
}

export interface TrainingTask {
  id: string;
  done: boolean;
  auto: boolean;
  manual: boolean;
  count: number;
  target: number;
  link: string;
  title: Text4;
  how: Text4;
}
export interface TrainingChecklist {
  tasks: TrainingTask[];
  done: number;
  total: number;
  percent: number;
  complete: boolean;
}
export interface TeamMember {
  id: string;
  name: string;
  role: string;
  createdAt: string;
  done: number;
  total: number;
  percent: number;
  complete: boolean;
  open: string[];
}

export type SetupState = 'done' | 'notNeeded' | 'open';
export interface SetupItem {
  id: string;
  kind: 'auto' | 'manual';
  optional?: boolean;
  link?: string;
  externalUrl?: string;
  title: Text4;
  explain: Text4;
  state: SetupState;
  detail: Record<string, string | number | boolean> | null;
  mark: { state: string; note: string | null; by: string; at: string } | null;
}
export interface SetupChecklist {
  items: SetupItem[];
  resolved: number;
  total: number;
  percent: number;
  complete: boolean;
}

export const whatsNewFeedKey = ['admin-whats-new-feed'] as const;
export const whatsNewManageKey = ['admin-whats-new-manage'] as const;
export const trainingChecklistKey = ['admin-training-checklist'] as const;
export const trainingTeamKey = ['admin-training-checklist-team'] as const;
export const setupChecklistKey = ['admin-setup-checklist'] as const;

/** Picks the text of the UI language (az fallback). */
export const pick = (t: Text4 | null | undefined, lang: string) => {
  if (!t) return '';
  const l = (lang || 'az').slice(0, 2) as keyof Text4;
  return t[l] || t.az || t.en || '';
};
