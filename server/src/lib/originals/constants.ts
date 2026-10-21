import type { OriginalStatus } from '@prisma/client';

/**
 * Physical originals the office holds for a client (passport, diploma …): kinds, the movement actions and
 * the state machine behind them, courier tracking links and the "overdue" limits per status.
 */

export const ORIGINAL_KINDS = ['PASSPORT', 'DIPLOMA', 'CERTIFICATE', 'BIRTH', 'MARRIAGE', 'OTHER'] as const;
export type OriginalKind = (typeof ORIGINAL_KINDS)[number];

export const ORIGINAL_STATUSES: OriginalStatus[] = ['IN_OFFICE', 'GIVEN_OUT', 'AT_APOSTILLE', 'IN_TRANSIT', 'DELIVERED', 'RETURNED_TO_CLIENT'];

export const ORIGINAL_ACTIONS = [
  'RECEIVED',
  'STORED',
  'GIVEN_OUT',
  'RETURNED_TO_OFFICE',
  'SENT_TO_APOSTILLE',
  'APOSTILLE_BACK',
  'SENT_BY_COURIER',
  'DELIVERED',
  'RETURNED_TO_CLIENT',
] as const;
export type OriginalAction = (typeof ORIGINAL_ACTIONS)[number];

interface ActionRule {
  /** Statuses the original may be in for this action (RECEIVED also creates new originals). */
  from: OriginalStatus[];
  to: OriginalStatus;
  /** Fields the action needs. */
  needs?: ('location' | 'holder' | 'carrier')[];
}

export const ACTION_RULES: Record<OriginalAction, ActionRule> = {
  // A client brings an original (again, after it had been returned).
  RECEIVED: { from: ['RETURNED_TO_CLIENT'], to: 'IN_OFFICE' },
  // Moved inside the office (safe, shelf).
  STORED: { from: ['IN_OFFICE'], to: 'IN_OFFICE', needs: ['location'] },
  // Handed to a translator, an authority or a colleague.
  GIVEN_OUT: { from: ['IN_OFFICE'], to: 'GIVEN_OUT', needs: ['holder'] },
  RETURNED_TO_OFFICE: { from: ['GIVEN_OUT', 'IN_TRANSIT', 'DELIVERED'], to: 'IN_OFFICE' },
  SENT_TO_APOSTILLE: { from: ['IN_OFFICE', 'GIVEN_OUT'], to: 'AT_APOSTILLE' },
  APOSTILLE_BACK: { from: ['AT_APOSTILLE'], to: 'IN_OFFICE' },
  SENT_BY_COURIER: { from: ['IN_OFFICE'], to: 'IN_TRANSIT', needs: ['carrier'] },
  DELIVERED: { from: ['IN_TRANSIT'], to: 'DELIVERED' },
  RETURNED_TO_CLIENT: { from: ['IN_OFFICE', 'GIVEN_OUT', 'DELIVERED'], to: 'RETURNED_TO_CLIENT' },
};

/** Actions that produce a hand-over act (Qəbul-təhvil aktı / Übergabeprotokoll). */
export const ACT_ACTIONS: OriginalAction[] = ['RECEIVED', 'GIVEN_OUT', 'RETURNED_TO_CLIENT'];

export const canApply = (status: OriginalStatus, action: OriginalAction) => ACTION_RULES[action].from.includes(status);

/** Days in a status after which an original counts as overdue. */
export const OVERDUE_DAYS: Partial<Record<OriginalStatus, number>> = { GIVEN_OUT: 7, AT_APOSTILLE: 21, IN_TRANSIT: 10 };

export const CARRIERS = ['DHL', 'UPS', 'FEDEX', 'AZERPOST', 'OTHER'] as const;

/** Public tracking pages of the known carriers (no API calls — only links for staff and clients). */
const TRACKING_TEMPLATES: Record<string, string> = {
  DHL: 'https://www.dhl.com/global-en/home/tracking/tracking-express.html?submit=1&tracking-id={n}',
  UPS: 'https://www.ups.com/track?loc=en_US&tracknum={n}',
  FEDEX: 'https://www.fedex.com/fedextrack/?trknbr={n}',
  // Azərpoçt has no stable deep link; 17TRACK follows UPU (EMS / registered mail) numbers of every postal operator.
  AZERPOST: 'https://t.17track.net/en#nums={n}',
};

const carrierKey = (carrier: string) => {
  const k = carrier.trim().toUpperCase().replace(/Ə/g, 'E').normalize('NFD').replace(/[^A-Z]/g, '');
  if (k.startsWith('AZER') || k === 'AZPOST') return 'AZERPOST';
  if (k.startsWith('FEDEX')) return 'FEDEX';
  return k;
};

/** Tracking URL for a known carrier and number, else null. */
export const trackingUrl = (carrier: string | null | undefined, trackingNo: string | null | undefined) => {
  if (!carrier || !trackingNo?.trim()) return null;
  const tpl = TRACKING_TEMPLATES[carrierKey(carrier)];
  return tpl ? tpl.replace('{n}', encodeURIComponent(trackingNo.trim())) : null;
};

/** Labels for PDFs (acts, labels): Azerbaijani / German. */
export const KIND_LABEL: Record<string, { az: string; de: string }> = {
  PASSPORT: { az: 'Pasport', de: 'Reisepass' },
  DIPLOMA: { az: 'Diplom', de: 'Diplom / Zeugnis' },
  CERTIFICATE: { az: 'Sertifikat / arayış', de: 'Zertifikat / Bescheinigung' },
  BIRTH: { az: 'Doğum şəhadətnaməsi', de: 'Geburtsurkunde' },
  MARRIAGE: { az: 'Nikah şəhadətnaməsi', de: 'Heiratsurkunde' },
  OTHER: { az: 'Digər', de: 'Sonstiges' },
};

export const ACTION_LABEL: Record<OriginalAction, { az: string; de: string }> = {
  RECEIVED: { az: 'Müştəridən qəbul', de: 'Entgegennahme vom Kunden' },
  STORED: { az: 'Saxlanc yeri', de: 'Ablage' },
  GIVEN_OUT: { az: 'Təhvil verildi', de: 'Ausgehändigt' },
  RETURNED_TO_OFFICE: { az: 'Ofisə qaytarıldı', de: 'Zurück im Büro' },
  SENT_TO_APOSTILLE: { az: 'Apostilə göndərildi', de: 'Zur Apostille' },
  APOSTILLE_BACK: { az: 'Apostildən qayıtdı', de: 'Von der Apostille zurück' },
  SENT_BY_COURIER: { az: 'Kuryerlə göndərildi', de: 'Per Kurier versandt' },
  DELIVERED: { az: 'Çatdırıldı', de: 'Zugestellt' },
  RETURNED_TO_CLIENT: { az: 'Müştəriyə qaytarıldı', de: 'An den Kunden zurückgegeben' },
};

export const VISA_TYPE_LABEL: Record<string, { az: string; de: string }> = {
  WORK: { az: 'İş vizası', de: 'Arbeitsvisum' },
  AUSBILDUNG: { az: 'Ausbildung', de: 'Ausbildung' },
  WEITERBILDUNG: { az: 'Weiterbildung', de: 'Weiterbildung' },
  JOB_SEEKER: { az: 'İş axtarışı', de: 'Arbeitssuche' },
  STUDY: { az: 'Təhsil', de: 'Studium' },
  FAMILY: { az: 'Ailə birləşməsi', de: 'Familiennachzug' },
  TOURIST: { az: 'Turist', de: 'Tourismus' },
};

/** Name of the sub-folder in the client folder that holds the acts. */
export const ACTS_FOLDER_NAME = 'Übergabeprotokolle';
