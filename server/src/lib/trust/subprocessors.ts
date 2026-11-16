import { getAiSettings, resolveApiKey } from '../ai/settings.js';
import { getCallsSettings } from '../calls/settings.js';
import { smsProvider, whatsappConfigured } from '../messaging/providers.js';
import { config } from '../../config.js';

/**
 * Sub-processors (Unterauftragsverarbeiter) — ONE source for the Trust Center and the AVV annex. Derived from the
 * code: an entry is listed when the integration is wired AND configured on this installation (env / settings);
 * optional ones are marked. What the code cannot know (the data centre region) comes from the owner setting.
 *
 *   hosting     Akamai Technologies (Linode) — servers, database, uploaded documents (deploy/, privacy policy)
 *   cloudflare  reverse proxy / DDoS / WAF in front of the server (deploy/cloudflare-firewall.sh)
 *   expo        push notifications of the mobile app (lib/push.ts → exp.host), only for app users
 *   whatsapp    Meta WhatsApp Cloud API (lib/messaging/providers.ts), when WHATSAPP_* is configured
 *   sms         Twilio or an HTTP SMS gateway (SMS_PROVIDER), signing codes / reminders
 *   calls       telephony provider (Setting `calls`: twilio | sipgate)
 *   openrouter  optional AI features (lib/ai, OpenRouter), only with an API key; candidate data only if staff use them
 *   smtp        an external SMTP relay — not listed when mail goes through the own server (Stalwart, deploy/)
 */

export type SubKey = 'hosting' | 'cloudflare' | 'expo' | 'whatsapp' | 'sms' | 'calls' | 'openrouter' | 'smtp';

export interface SubProcessor {
  key: SubKey;
  name: string;
  /** German purpose (AVV annex); the client translates by key. */
  purposeDe: string;
  /** Seat / transfer basis (German). */
  locationDe: string;
  optional: boolean;
}

export interface SubState {
  dataLocation: string;
  whatsapp: boolean;
  sms: 'twilio' | 'http' | null;
  calls: string;
  ai: boolean;
  smtpHost: string;
}

const LOCAL_SMTP = /^(|localhost|127\.0\.0\.1|::1|mail|stalwart|src-mail-1|.*\.internal)$/i;
const USA_DPF = 'Sitz USA; Übermittlung auf Grundlage des EU-US Data Privacy Framework (Art. 45 DSGVO) bzw. Standardvertragsklauseln';

/** Pure: the list for a given configuration (tests). */
export const subprocessorList = (s: SubState): SubProcessor[] => {
  const out: SubProcessor[] = [
    {
      key: 'hosting',
      name: 'Akamai Technologies, Inc. (Linode), 145 Broadway, Cambridge, MA 02142, USA',
      purposeDe: 'Hosting: Server, Datenbank, gespeicherte Dokumente, Backups',
      locationDe: `Rechenzentrum: ${s.dataLocation.trim() || '[vom Auftragnehmer zu bestätigen]'}; ${USA_DPF}`,
      optional: false,
    },
    {
      key: 'cloudflare',
      name: 'Cloudflare, Inc., 101 Townsend St., San Francisco, CA 94107, USA',
      purposeDe: 'Content Delivery, DDoS-Schutz und Web Application Firewall (Durchleitung des Datenverkehrs, keine dauerhafte Speicherung von Dokumenten)',
      locationDe: USA_DPF,
      optional: false,
    },
    {
      key: 'expo',
      name: '650 Industries, Inc. (Expo), USA',
      purposeDe: 'Zustellung von Push-Benachrichtigungen an die Mobile App (nur für Nutzer der App)',
      locationDe: USA_DPF,
      optional: true,
    },
  ];
  if (s.whatsapp) out.push({ key: 'whatsapp', name: 'Meta Platforms Ireland Ltd. (WhatsApp Business Cloud API)', purposeDe: 'Versand von WhatsApp-Nachrichten an Kandidaten (wenn genutzt)', locationDe: 'Irland / USA; Standardvertragsklauseln bzw. EU-US Data Privacy Framework', optional: true });
  if (s.sms === 'twilio') out.push({ key: 'sms', name: 'Twilio Inc., USA', purposeDe: 'SMS-Versand (Signatur-Codes, Erinnerungen)', locationDe: USA_DPF, optional: true });
  else if (s.sms === 'http') out.push({ key: 'sms', name: 'SMS-Gateway (vom Auftragnehmer konfiguriert)', purposeDe: 'SMS-Versand (Signatur-Codes, Erinnerungen)', locationDe: '[vom Auftragnehmer zu benennen]', optional: true });
  if (s.calls === 'twilio') out.push({ key: 'calls', name: 'Twilio Inc., USA', purposeDe: 'Telefonie (Anrufe aus dem System)', locationDe: USA_DPF, optional: true });
  else if (s.calls === 'sipgate') out.push({ key: 'calls', name: 'sipgate GmbH, Düsseldorf, Deutschland', purposeDe: 'Telefonie (Anrufe aus dem System)', locationDe: 'Deutschland', optional: true });
  if (s.ai) out.push({ key: 'openrouter', name: 'OpenRouter, Inc., USA (Weiterleitung an KI-Modellanbieter)', purposeDe: 'Optionale KI-Funktionen (z. B. Textentwürfe); Kandidatendaten nur, wenn Mitarbeitende die Funktion im Einzelfall nutzen', locationDe: USA_DPF, optional: true });
  if (!LOCAL_SMTP.test(s.smtpHost.trim())) out.push({ key: 'smtp', name: 'Externer E-Mail-Versanddienst (SMTP-Relay)', purposeDe: 'Versand von System-E-Mails', locationDe: '[vom Auftragnehmer zu benennen]', optional: false });
  return out;
};

/** The list for this installation (reads env and settings; never throws). */
export const currentSubprocessors = async (dataLocation: string): Promise<SubProcessor[]> => {
  const [ai, calls] = await Promise.all([getAiSettings().catch(() => null), getCallsSettings().catch(() => null)]);
  return subprocessorList({
    dataLocation,
    whatsapp: whatsappConfigured(),
    sms: smsProvider() as SubState['sms'],
    calls: calls?.provider ?? 'none',
    ai: !!(ai && resolveApiKey(ai)),
    smtpHost: config.smtp.host ?? '',
  });
};
