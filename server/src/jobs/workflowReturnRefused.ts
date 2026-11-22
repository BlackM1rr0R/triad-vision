import { prisma } from '../db.js';
import { audit } from '../lib/audit.js';
import { registerJob } from '../lib/scheduler.js';
import { HttpError } from '../lib/http.js';
import { returnCaseFromWorkflow } from '../lib/drive/workflowReturn.js';
import { legacyRefusedFolderId } from '../lib/drive/workflowFolders.js';

/**
 * Data migration, idempotent: the "Ablehnung" stage (processingStage REFUSED) was removed. Every case still stored
 * as REFUSED is returned the same way as "Geri qaytar" (lib/drive/workflowReturn: its workflow documents go back to
 * the client folder, the stage is cleared); afterwards the empty legacy "Ablehnung" folder goes to the recycle bin.
 * Runs shortly after every start and then daily; with nothing left to return it is one cheap query.
 */
registerJob({
  name: 'workflow-return-refused',
  everyMs: 24 * 60 * 60 * 1000,
  firstRunAfterMs: 2 * 60 * 1000,
  run: async () => {
    const cases = await prisma.case.findMany({ where: { processingStage: 'REFUSED' }, select: { id: true }, take: 500 });
    let returned = 0;
    for (const c of cases) {
      try {
        await returnCaseFromWorkflow(c.id, null, { note: 'Ablehnung entfernt: automatisch zurückgegeben' });
        returned++;
      } catch (err) {
        if (!(err instanceof HttpError)) throw err;
        if (err.code === 'NOT_IN_WORKFLOW') continue;
        console.warn(`[workflow] REFUSED case ${c.id} not returned: ${err.code}`);
      }
    }
    // The legacy folder: removed once nothing is left in it.
    const folderId = await legacyRefusedFolderId();
    if (folderId && !(await prisma.case.count({ where: { processingStage: 'REFUSED' } })) && !(await prisma.driveNode.count({ where: { parentId: folderId, deletedAt: null } }))) {
      await prisma.driveNode.updateMany({ where: { id: folderId, deletedAt: null }, data: { deletedAt: new Date(), system: false } });
    }
    if (!returned) return;
    await audit({ user: undefined, ip: undefined }, 'CASE_WORKFLOW_REFUSED_RETURNED', undefined, { returned });
    console.log(`[workflow] ${returned} case(s) of the removed "Ablehnung" stage returned to the client folders`);
  },
});
