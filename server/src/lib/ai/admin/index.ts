import type { AnyAiTool } from '../types.js';
import { driveTools } from './driveTools.js';
import { sheetTools } from './sheetTools.js';
import { settlementTools } from './settlementTools.js';
import { registerTools } from './registerTools.js';
import { statsTools } from './statsTools.js';
import { adminSystemPrompt } from './prompt.js';

/**
 * Super-admin tools of the AI assistant (scope ADMIN). Read-only tools run at once; every tool that
 * changes something has `confirm: true` and a localized `summary` for the confirm card. Each tool runs as
 * the logged-in super admin through the modules' own services (drive permission engine, sheets store,
 * settlement save, register save, partners), so audit log, activity journal, locks and syncs keep working.
 */
export const adminTools: AnyAiTool[] = [...driveTools, ...sheetTools, ...settlementTools, ...registerTools, ...statsTools];

export { adminSystemPrompt };
/** Same text under the name the core's registry reads. */
export const adminPrompt = adminSystemPrompt;
