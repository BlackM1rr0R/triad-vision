import { hasAllPerms, type CompanyPerms } from './permissions.js';

/**
 * "My workers" CSV / Excel export of a restricted employer member (pure, no database).
 *
 * The export needs `viewWorkers` (rules.ts). Beyond that it shows only what the member could see in the portal:
 *   - open items (documents to sign, forms to fill) only of the kinds the panel shows them (guard.ts trimWorkerItems):
 *     signatures with `viewContracts`, forms with `fillEzb`; the "open items" count and the next action follow that,
 *   - document columns (visa / residence title valid until, visa valid from) only with `viewPersonalDocuments`,
 *   - contract columns (probation end) only with `viewContracts`,
 *   - pay figures only with `viewSalaries` (neither sheet has a pay column today; any added later must check `pay`).
 * Hidden columns are left out of the sheet entirely (header and cells), not blanked. STANDARD members (no role)
 * and members with every permission keep the full export.
 */
export interface WorkerExportPolicy {
  /** May an open item of this kind (SIGNATURE / FORM / CHECKIN / ACCELERATED) be listed or counted? */
  item: (kind: string) => boolean;
  documents: boolean;
  contracts: boolean;
  pay: boolean;
}

export const FULL_EXPORT: WorkerExportPolicy = { item: () => true, documents: true, contracts: true, pay: true };

export const workerExportPolicy = (access: { role: string | null; perms: CompanyPerms } | null | undefined): WorkerExportPolicy => {
  if (!access || access.role === null || hasAllPerms(access.perms)) return FULL_EXPORT;
  const p = access.perms;
  return {
    item: (kind) => (kind === 'SIGNATURE' ? p.viewContracts : kind === 'FORM' ? p.fillEzb : true),
    documents: p.viewPersonalDocuments,
    contracts: p.viewContracts,
    pay: p.viewSalaries,
  };
};

/** Next actions that point at an open item / column the member may not see (shown as an empty cell). */
export const nextActionAllowed = (action: string, policy: WorkerExportPolicy, visibleKinds: Set<string>) => {
  if (action === 'SIGN_DOCUMENT') return visibleKinds.has('SIGNATURE');
  if (action === 'COMPLETE_FORM') return visibleKinds.has('FORM');
  if (action === 'PROBATION_REVIEW') return policy.contracts;
  if (action === 'CONFIRM_EMPLOYMENT') return policy.documents; // triggered by the title expiry
  return true;
};

/** Milestones that come from a document or a contract the member may not see. */
export const milestoneAllowed = (code: string, policy: WorkerExportPolicy) =>
  code === 'TITLE_EXPIRY' ? policy.documents : code === 'PROBATION_END' ? policy.contracts : true;

/** Keeps the columns whose `need` the policy allows; returns headers and rows of the same shape. */
export const pickColumns = <C>(columns: { need?: keyof Omit<WorkerExportPolicy, 'item'> }[], policy: WorkerExportPolicy, headers: string[], rows: C[][]) => {
  const keep = columns.map((c, i) => (!c.need || policy[c.need] ? i : -1)).filter((i) => i >= 0);
  return { headers: keep.map((i) => headers[i]), rows: rows.map((r) => keep.map((i) => r[i])), keep };
};
