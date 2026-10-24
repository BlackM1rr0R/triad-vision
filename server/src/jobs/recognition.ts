import { registerJob } from '../lib/scheduler.js';
import { runRecognitionDeadlines } from '../lib/recognition/deadlines.js';

/**
 * Recognition (Anerkennung) and § 81a deadlines: reminders `leadDays` before a deadline, escalation once it
 * has passed, and the signed Vollmacht picked up from the e-signature module. Runs every 6 hours; the
 * ReminderLog keys (deadline date included) make every reminder go out once.
 */
registerJob({ name: 'recognition-deadlines', everyMs: 6 * 60 * 60 * 1000, firstRunAfterMs: 4 * 60 * 1000, run: async () => void (await runRecognitionDeadlines()) });
