/**
 * Technical and organisational measures that are IMPLEMENTED in this repository — each with the place in the code
 * / deploy scripts that proves it (shown to admins, used for the AVV TOMs annex and the public Trust Center).
 * Nothing here is a certification or a promise beyond the code: hosting-side physical security, data-at-rest
 * encryption of the database disk and certifications are NOT claimed (owner placeholders in the AVV annex).
 *
 * The client translates `key` (trust.measures.<key>); `de` is the AVV wording.
 */
export type TomCategory = 'access' | 'authorisation' | 'transfer' | 'input' | 'availability' | 'separation' | 'encryption';

export interface Measure {
  key: string;
  category: TomCategory;
  de: string;
  evidence: string;
}

export const MEASURES: Measure[] = [
  { key: 'tls', category: 'transfer', de: 'Übertragung ausschließlich verschlüsselt über HTTPS/TLS; HSTS ist aktiviert.', evidence: 'deploy/Caddyfile (Strict-Transport-Security), server/src/app.ts (helmet hsts)' },
  { key: 'cloudflareOnly', category: 'access', de: 'Der Webserver nimmt HTTP(S)-Verbindungen nur über Cloudflare an (Firewall-Regeln); Schutz vor DDoS-Angriffen.', evidence: 'deploy/cloudflare-firewall.sh' },
  { key: 'passwords', category: 'access', de: 'Passwörter werden nur als bcrypt-Hash gespeichert.', evidence: 'server/src/routes/auth.ts (bcryptjs)' },
  { key: 'staff2fa', category: 'access', de: 'Zwei-Faktor-Authentifizierung (TOTP) ist für alle Mitarbeitenden verpflichtend; Arbeitgeber und Kandidaten können einen E-Mail-Code als zweiten Schritt aktivieren.', evidence: 'server/src/lib/twoFactor.ts (isTwoFactorRequired), lib/emailOtp.ts' },
  { key: 'lockout', category: 'access', de: 'Schutz gegen Passwort-Raten: Sperre des Kontos nach wiederholten Fehlversuchen und Begrenzung der Anfragen je IP-Adresse.', evidence: 'server/src/lib/loginGuard.ts, authLimiter in server/src/routes/auth.ts (lib/http.ts limiter)' },
  { key: 'roles', category: 'authorisation', de: 'Rollenbasierte Berechtigungen (Kandidat, Arbeitgeber, Mitarbeitende, Administration); Arbeitgeber sehen ausschließlich Daten ihres eigenen Unternehmens.', evidence: 'server/src/middleware/auth.ts (requireRole / requireMinRole), company-scoped routes (routes/company*.ts)' },
  { key: 'masking', category: 'authorisation', de: 'Sensible Felder (z. B. Passnummer) werden je Rolle maskiert; jedes Aufdecken wird protokolliert.', evidence: 'server/src/routes/admin/privacyTools.ts (/sensitive/*)' },
  { key: 'audit', category: 'input', de: 'Protokollierung sicherheitsrelevanter Aktionen (Audit-Log) und Änderungshistorie wichtiger Felder mit Benutzer und Zeitpunkt.', evidence: 'server/src/lib/audit.ts, FieldChange (lib/history)' },
  { key: 'esign', category: 'transfer', de: 'Elektronische Signatur mit Prüfpfad (Zeitstempel, SHA-256-Prüfsumme des Dokuments, Bestätigungscode).', evidence: 'server/src/lib/esign (service.ts, pdf.ts)' },
  { key: 'secretBox', category: 'encryption', de: 'Geheimnisse wie TOTP-Schlüssel und API-Schlüssel werden in der Datenbank mit AES-256-GCM verschlüsselt gespeichert.', evidence: 'server/src/lib/secretBox.ts' },
  { key: 'backups', category: 'availability', de: 'Nächtliche, mit AES-256 verschlüsselte Sicherung von Datenbank und Dokumenten; jede Sicherung wird nach dem Erstellen auf Lesbarkeit geprüft, Aufbewahrung 14 Tage; regelmäßiger Wiederherstellungstest.', evidence: 'deploy/backup.sh, deploy/backup-verify.sh' },
  { key: 'status', category: 'availability', de: 'Öffentliche Statusseite zur Verfügbarkeit der Dienste.', evidence: 'client /status' },
  { key: 'separation', category: 'separation', de: 'Logische Trennung der Daten je Arbeitgeber (Mandant) und je Bewerbungsverfahren (Akte).', evidence: 'companyId / caseId scoping in server/src/routes' },
  { key: 'pseudonymPool', category: 'separation', de: 'Kandidatenprofile werden Arbeitgebern im Kandidatenpool nur pseudonymisiert und nur mit Einwilligung gezeigt.', evidence: 'server/src/lib/pool/anonymous.ts (whitelist card)' },
];

export const TOM_CATEGORY_DE: Record<TomCategory, string> = {
  access: 'Zutritts- und Zugangskontrolle',
  authorisation: 'Zugriffskontrolle',
  transfer: 'Weitergabekontrolle',
  input: 'Eingabekontrolle',
  availability: 'Verfügbarkeitskontrolle und Belastbarkeit',
  separation: 'Trennungskontrolle und Pseudonymisierung',
  encryption: 'Verschlüsselung',
};
