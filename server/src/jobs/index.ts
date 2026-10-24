// Importing these modules registers their jobs with the scheduler.
import './retention.js'; // DSGVO document retention
import './reminders.js'; // appointment / missing-documents / passport / staff-SLA reminders, review invitations
import './booking.js'; // consultation reminders
import './clientProcess.js'; // client task reminders (2 d / due day / overdue Ã—3), office visit reminders (24 h / 2 h)
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
import './aiBriefing.js'; // daily AI briefing e-mail for opted-in admins (08:00 Baku)
import './originals.js'; // overdue physical originals (given out / apostille / courier) → assigned staff
import './retention-drive.js'; // DSGVO retention of drive client folders (archive, warnings, recycle bin)
import './aiMgmt.js'; // weekly management report (Monday 08:00 Baku) + security alert rules (every 10 min)
import './uploadAi.js'; // smart uploads: finish recognitions left pending by a restart
import './quotes.js'; // quotes (Angebote): expiry + reminder to the employer before expiry
import './campaigns.js'; // campaigns: scheduled start + throttled sending of the queue (every 10 s)
import './duplicates.js'; // duplicate client detection (nightly full scan)
import './reports.js'; // scheduled report e-mails (report builder)
import './german.js'; // German language: exam registration deadline, exam day-before, course start
import './growth.js'; // info-session reminders (24 h / 1 h) + client referral stages / rewards
import './jobAlerts.js'; // job alert digests (≤ 1 per alert per day) + purge of unconfirmed / unsubscribed alerts
import './timeCare.js'; // staff timer idle protection (10 / 12 h) + post-arrival check-ins (1 / 3 / 6 months)
import './postArrivalCare.js'; // churn risk (twice a day), residence-title renewal cases + probation-end reminders
import './calls.js'; // callback reminders (10 min before) + live chats nobody accepted in 2 min
import './automation.js'; // automation rules (event queue, delayed actions, time triggers) + absence handover
import './clientData.js'; // reminders for unsubmitted questionnaires and open data confirmations
import './clientBilling.js'; // client invoices: DATE instalments, overdue + reminders (3 / 10 days) + staff task, package order activation retries
import './employerReports.js'; // monthly employer PDF report (1st of the month, 08:00 Baku) to the company's portal users
import './recognition.js'; // Anerkennung + § 81a deadline reminders / escalation, signed Vollmacht pick-up
