import type { Role } from '@/lib/types';

export type Source = 'event' | 'case' | 'booking' | 'interview' | 'task';
export type Visibility = 'PRIVATE' | 'TEAM';
export type AttendeeStatus = 'NEEDS_ACTION' | 'ACCEPTED' | 'DECLINED' | 'TENTATIVE';
export type EventColor = 'blue' | 'green' | 'amber' | 'red' | 'violet' | 'pink' | 'teal' | 'slate';
export const EVENT_COLORS: EventColor[] = ['blue', 'green', 'amber', 'red', 'violet', 'pink', 'teal', 'slate'];
export type View = 'month' | 'week' | 'day' | 'agenda';
export const VIEWS: View[] = ['month', 'week', 'day', 'agenda'];

export interface Person {
  id: string;
  firstName: string;
  lastName: string;
  role?: Role;
  email?: string;
}

export interface Attendee extends Person {
  status: AttendeeStatus;
}

export interface EventDto {
  id: string;
  source: 'event';
  title: string;
  description: string | null;
  location: string | null;
  meetingUrl: string | null;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  color: EventColor | null;
  visibility: Visibility;
  rrule: string | null;
  reminderMinutes: number | null;
  caseId: string | null;
  case: { id: string; number: string } | null;
  ownerId: string;
  owner: Person;
  attendees: Attendee[];
  myStatus: AttendeeStatus | null;
  isOwner: boolean;
  isAttendee: boolean;
  canEdit: boolean;
  busy: false;
  occurrence?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BusyDto {
  id: string;
  source: 'event';
  title: null;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  ownerId: string;
  owner: Person;
  attendees: { id: string }[];
  visibility: Visibility;
  busy: true;
  canEdit: false;
  color: null;
  rrule: string | null;
  occurrence?: string | null;
}

export interface SystemDto {
  id: string;
  source: Exclude<Source, 'event'>;
  title: string;
  description: string | null;
  location: string | null;
  meetingUrl: string | null;
  startsAt: string;
  endsAt: string;
  allDay: false;
  cancelled: boolean;
  link: string | null;
  ownerId: string;
  busy: false;
  canEdit: false;
  color: null;
}

export interface ListResponse {
  events: (EventDto | BusyDto)[];
  system: SystemDto[];
}

/** One rendered item (an occurrence) in any view. */
export interface CalItem {
  key: string;
  id: string;
  source: Source;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  busy: boolean;
  ownerId: string | null;
  /** which calendar toggle it belongs to */
  calendar: 'mine' | 'team' | 'user' | 'case' | 'booking' | 'interview' | 'task';
  tone: Tone;
  raw: EventDto | BusyDto | SystemDto;
}

export interface Tone {
  bg: string;
  text: string;
  border: string;
  dot: string;
}

export interface BusyBlock {
  start: string;
  end: string;
  source: Source;
  title: string | null;
  id: string;
}

export interface FreeBusyUser {
  userId: string;
  firstName: string;
  lastName: string;
  busy: BusyBlock[];
}

export interface EventInput {
  title: string;
  description?: string | null;
  location?: string | null;
  meetingUrl?: string | null;
  startsAt: string;
  endsAt: string;
  allDay?: boolean;
  color?: EventColor | null;
  visibility?: Visibility;
  rrule?: string | null;
  reminderMinutes?: number | null;
  caseId?: string | null;
  attendeeIds?: string[];
}

export interface Summary {
  today: number;
  next: { id: string; title: string; startsAt: string; endsAt: string; source: Source; link?: string | null } | null;
}
