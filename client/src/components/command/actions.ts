import type { LucideIcon } from 'lucide-react';
import { BookUser, Briefcase, Building2, FilePlus2, FolderPlus, ListPlus, Megaphone, Receipt, Upload, UserPlus } from 'lucide-react';

/**
 * "Actions" of the command palette. Each one opens the existing create flow of a page:
 *   ?new=1 where the page supports it, the vacancy editor via ?id=new, the campaign wizard route.
 * Role flags match the target page (adminOnly = ADMIN+, superOnly = SUPER_ADMIN).
 */
export interface PaletteAction {
  id: string;
  icon: LucideIcon;
  /** Target route; `area` is where the palette was opened (tasks open inside the current area). */
  href: (area: 'admin' | 'workspace') => string;
  adminOnly?: boolean;
  superOnly?: boolean;
  /** Has a cmd.actionHints.<id> line. */
  hint?: boolean;
}

export const PALETTE_ACTIONS: PaletteAction[] = [
  // Cases are opened from a candidate (vacancy application → case); the candidates list is that flow.
  { id: 'newCase', icon: FolderPlus, href: () => '/admin/candidates', hint: true },
  { id: 'newTask', icon: ListPlus, href: (area) => `/${area}/tasks?new=1` },
  { id: 'newVacancy', icon: Briefcase, href: () => '/admin/vacancies?id=new' },
  { id: 'newCompany', icon: Building2, href: () => '/admin/companies?new=1' },
  { id: 'newQuote', icon: FilePlus2, href: () => '/admin/quotes?new=1', adminOnly: true },
  { id: 'newInvoice', icon: Receipt, href: () => '/admin/invoices?new=1', adminOnly: true },
  { id: 'newCampaign', icon: Megaphone, href: () => '/admin/campaigns/new', adminOnly: true },
  { id: 'newContact', icon: BookUser, href: () => '/workspace/contacts?new=1' },
  { id: 'newClient', icon: UserPlus, href: () => '/admin/users?new=1', superOnly: true },
  { id: 'uploadDrive', icon: Upload, href: () => '/workspace/drive', hint: true },
];
