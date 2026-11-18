import type { DocumentLevel } from './api';

/**
 * The info line above a case's document checklist in the partner portal (pure; i18n key):
 *   status       → only "complete / missing" per requirement
 *   list         → read-only access (never "upload is closed for now": it will not open for this login)
 *   upload+      → "you can upload" while the step is open or a requirement takes an upload (replacement of a
 *                  rejected document after the hand-in, early embassy documents), else "closed at this stage"
 */
export const documentHintKey = (level: DocumentLevel, uploadStage: string | null, requirements: { canUpload: boolean }[]) => {
  if (level === 'status') return 'partnerAccess.docs.statusOnly';
  if (level === 'list') return 'partnerAccess.docs.readOnly';
  return uploadStage || requirements.some((r) => r.canUpload) ? 'partnerPortal.detail.uploadHint' : 'partnerPortal.detail.uploadClosed';
};
