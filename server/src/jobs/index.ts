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
import './mail.js'; // mailbox sync (IMAP) and snooze wake-ups
import './calendar.js'; // event reminders
import './workspace.js'; // announcement expiry, poll closing, leave reminders
import './signatures.js'; // e-signature reminders (3 / 7 days), expiry, completion retries
import './agents.js'; // agent commission housekeeping
import './translations.js'; // translation order reminders
import './privacy.js'; // privacy request deadlines
import './vault.js'; // vault document expiry reminders
import './arrival.js'; // arrival / pickup reminders
import './clientsExcel.js'; // super admin's Excel of all clients
import './surveys.js'; // satisfaction surveys after visa approval / case closure
import './expiry.js'; // document expiry warnings (client, staff, daily admin digest)
import './driveIndex.js'; // drive full-text index (text layer, DOCX, XLSX, OCR)
