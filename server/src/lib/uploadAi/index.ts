/** Smart uploads: scan quality check + automatic recognition with one-click proposals (see pipeline.ts). */
export { analyzeQuality, type QualityReport, type QualityReason, type QualityLevel } from './quality.js';
export {
  REALTIME_EVENT,
  analyzeInsight,
  changeInsightType,
  chipView,
  clientView,
  prepareCaseDocument,
  prepareDriveFile,
  scheduleUploadAnalysis,
  staffView,
  sweepPendingInsights,
  uploadAiDeps,
  waitForUploadAi,
} from './pipeline.js';
export { applyInsight, rejectInsight, requestReupload } from './apply.js';
export { getUploadAiSettings, saveUploadAiSettings, clearUploadAiSettingsCache, uploadAiSettingsUpdate } from './settings.js';
export { DOC_TYPES, type DocType } from './types.js';

import type { QualityReport } from './quality.js';

/** The part of a quality report sent to the uploader (no internal metrics). */
export const publicQuality = (q: QualityReport | null) => (q ? { level: q.level, reasons: q.reasons, kind: q.kind } : null);
