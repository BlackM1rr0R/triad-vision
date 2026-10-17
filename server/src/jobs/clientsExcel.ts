import { registerJob } from '../lib/scheduler.js';
import { clientsExcelDirty, refreshClientsExcel } from '../lib/clientsExcel.js';

const MIN = 60 * 1000;
let lastFull = 0;

/** Rebuilds the super admins' "Bütün müştərilər.xlsx" within a minute of a new registration, and hourly. */
export const runClientsExcel = async (now = Date.now()) => {
  if (!clientsExcelDirty() && now - lastFull < 60 * MIN) return;
  lastFull = now;
  await refreshClientsExcel();
};

registerJob({ name: 'clients-excel', everyMs: MIN, firstRunAfterMs: 30 * 1000, run: () => runClientsExcel() });
