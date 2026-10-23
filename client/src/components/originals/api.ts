import { api } from '@/lib/api';
import { STATUS_TONES, toneClasses } from '@/components/ui/status';

export const KINDS = ['PASSPORT', 'DIPLOMA', 'CERTIFICATE', 'BIRTH', 'MARRIAGE', 'OTHER'] as const;
export type Kind = (typeof KINDS)[number];
export const STATUSES = ['IN_OFFICE', 'GIVEN_OUT', 'AT_APOSTILLE', 'IN_TRANSIT', 'DELIVERED', 'RETURNED_TO_CLIENT'] as const;
export type OriginalStatus = (typeof STATUSES)[number];
export const ACTIONS = ['RECEIVED', 'STORED', 'GIVEN_OUT', 'RETURNED_TO_OFFICE', 'SENT_TO_APOSTILLE', 'APOSTILLE_BACK', 'SENT_BY_COURIER', 'DELIVERED', 'RETURNED_TO_CLIENT'] as const;
export type Action = (typeof ACTIONS)[number];
export const CARRIERS = ['DHL', 'UPS', 'FEDEX', 'AZERPOST', 'OTHER'] as const;

/** Same state machine as the server (lib/originals/constants.ts) — only offers what the server accepts. */
export const ACTION_FROM: Record<Action, OriginalStatus[]> = {
  RECEIVED: ['RETURNED_TO_CLIENT'],
  STORED: ['IN_OFFICE'],
  GIVEN_OUT: ['IN_OFFICE'],
  RETURNED_TO_OFFICE: ['GIVEN_OUT', 'IN_TRANSIT', 'DELIVERED'],
  SENT_TO_APOSTILLE: ['IN_OFFICE', 'GIVEN_OUT'],
  APOSTILLE_BACK: ['AT_APOSTILLE'],
  SENT_BY_COURIER: ['IN_OFFICE'],
  DELIVERED: ['IN_TRANSIT'],
  RETURNED_TO_CLIENT: ['IN_OFFICE', 'GIVEN_OUT', 'DELIVERED'],
};
export const ACT_ACTIONS: Action[] = ['RECEIVED', 'GIVEN_OUT', 'RETURNED_TO_CLIENT'];
export const allowedActions = (status: OriginalStatus) => ACTIONS.filter((a) => ACTION_FROM[a].includes(status));

export const STATUS_TONE: Record<OriginalStatus, string> = toneClasses(STATUS_TONES.original);

export interface OriginalEvent {
  id: string;
  action: Action;
  status: OriginalStatus;
  location: string | null;
  holder: string | null;
  carrier: string | null;
  trackingNo: string | null;
  trackingUrl: string | null;
  note: string | null;
  actNodeId: string | null;
  actorId: string | null;
  at: string;
}

export interface Original {
  id: string;
  caseId: string;
  title: string;
  kind: Kind;
  status: OriginalStatus;
  location: string | null;
  holder: string | null;
  carrier: string | null;
  trackingNo: string | null;
  trackingUrl: string | null;
  note: string | null;
  receivedAt: string;
  statusSince: string;
  daysInStatus: number;
  overdue: boolean;
  overdueLimit: number | null;
  case: {
    id: string;
    number: string;
    visaType: string;
    driveFolderId: string | null;
    client: { id: string; name: string };
    staff: { id: string; name: string } | null;
  };
  events: OriginalEvent[];
}

export interface ActResult {
  nodeId: string;
  name: string;
  emailed: boolean;
}

export interface ActBody {
  act?: boolean;
  condition?: string | null;
  signatures?: { client?: string | null; staff?: string | null };
  email?: boolean;
}

export const originalsKey = ['originals'] as const;
export const caseOriginalsKey = (caseId: string) => ['originals', 'case', caseId] as const;

export const fetchCaseOriginals = async (caseId: string) => (await api.get<{ items: Original[] }>(`/originals/cases/${caseId}`)).data.items;

export const labelUrl = (caseId: string, layout: 'a4-1' | 'a4-8' | '62mm') => `/api/originals/cases/${encodeURIComponent(caseId)}/label.pdf?layout=${layout}`;
export const actUrl = (eventId: string, download = false) => `/api/originals/events/${encodeURIComponent(eventId)}/act${download ? '?download=1' : ''}`;
export const myActUrl = (eventId: string, download = false) => `/api/originals/my/acts/${encodeURIComponent(eventId)}${download ? '?download=1' : ''}`;
export const driveFolderHref = (id: string) => `/workspace/drive/f/${encodeURIComponent(id)}`;
