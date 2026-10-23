/**
 * Automatic staff assignment for new cases — moved to lib/assignment (eligibility, weighted load, round-robin
 * tie-break, absence handover). This module keeps the older import path.
 */
export { AUTO_ASSIGN_KEY, pickAssignee, readAutoAssign, type AutoAssignConfig } from '../assignment/index.js';
