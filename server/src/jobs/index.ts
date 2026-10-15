// Importing these modules registers their jobs with the scheduler.
import './retention.js'; // DSGVO document retention
import './reminders.js'; // appointment / missing-documents / passport / staff-SLA reminders, review invitations
import './booking.js'; // consultation reminders
import './invoices.js'; // overdue invoices
import './drive.js'; // recycle-bin purge
import './tasks.js'; // task deadline reminders
import './messaging.js'; // WhatsApp/SMS outbound retries and log pruning
import './ocr.js'; // passport OCR (MRZ) for new uploads
import './webhooks.js'; // partner webhook deliveries with retry
import './interviews.js'; // interview reminders (24 h / 1 h)
