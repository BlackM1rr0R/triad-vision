import { useQuery, type QueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { AttendeeStatus, EventDto, EventInput, FreeBusyUser, ListResponse, Person, Summary } from './types';

export const calendarKeys = {
  all: ['calendar'] as const,
  range: (from: string, to: string, users: string, mine: boolean) => ['calendar', 'range', from, to, users, mine] as const,
  event: (id: string) => ['calendar', 'event', id] as const,
  freeBusy: (from: string, to: string, users: string) => ['calendar', 'free-busy', from, to, users] as const,
  people: ['calendar', 'people'] as const,
  summary: ['calendar', 'summary'] as const,
};

const enc = encodeURIComponent;

export const useRange = (from: Date, to: Date, users: string[], mine: boolean) => {
  const f = from.toISOString();
  const t = to.toISOString();
  const u = users.join(',');
  return useQuery({
    queryKey: calendarKeys.range(f, t, u, mine),
    queryFn: async () => (await api.get<ListResponse>('/events', { params: { from: f, to: t, users: u || undefined, mine: mine ? '1' : undefined } })).data,
    placeholderData: (prev) => prev,
    staleTime: 20_000,
    refetchInterval: 120_000,
  });
};

export const useEvent = (id: string | null) =>
  useQuery({
    queryKey: calendarKeys.event(id ?? ''),
    queryFn: async () => (await api.get<{ event: EventDto }>(`/events/${enc(id!)}`)).data.event,
    enabled: !!id,
    retry: false,
  });

export const useFreeBusy = (from: Date | null, to: Date | null, users: string[]) =>
  useQuery({
    queryKey: calendarKeys.freeBusy(from?.toISOString() ?? '', to?.toISOString() ?? '', users.join(',')),
    queryFn: async () => (await api.get<{ users: FreeBusyUser[] }>('/events/free-busy', { params: { from: from!.toISOString(), to: to!.toISOString(), users: users.join(',') } })).data.users,
    enabled: !!from && !!to && users.length > 0,
    staleTime: 15_000,
  });

export const usePeople = () =>
  useQuery({
    queryKey: calendarKeys.people,
    queryFn: async () => (await api.get<{ people: Person[] }>('/tasks/people')).data.people,
    staleTime: 5 * 60_000,
  });

export const useSummary = () =>
  useQuery({
    queryKey: calendarKeys.summary,
    queryFn: async () => (await api.get<Summary>('/events/summary', { params: { tzOffset: -new Date().getTimezoneOffset() } })).data,
    staleTime: 60_000,
  });

export const calendarApi = {
  create: async (body: EventInput) => (await api.post<{ event: EventDto }>('/events', body)).data.event,
  update: async (id: string, body: Partial<EventInput> & { status?: AttendeeStatus }) => (await api.patch<{ event: EventDto }>(`/events/${enc(id)}`, body)).data.event,
  remove: (id: string) => api.delete(`/events/${enc(id)}`),
  respond: async (id: string, status: AttendeeStatus) => (await api.post<{ event: EventDto }>(`/events/${enc(id)}/respond`, { status })).data.event,
  quick: async (text: string, attendeeIds?: string[]) =>
    (await api.post<{ event: EventDto; parsed: { title: string; startsAt: string; endsAt: string; allDay: boolean; matched: Record<string, boolean> } }>('/events/quick', { text, tzOffset: -new Date().getTimezoneOffset(), attendeeIds })).data,
  preview: async (text: string) => (await api.post<{ parsed: { title: string; startsAt: string; endsAt: string; allDay: boolean; matched: Record<string, boolean> } }>('/events/quick', { text, tzOffset: -new Date().getTimezoneOffset(), dryRun: true })).data.parsed,
  icsUrl: (id: string) => `/api/events/${enc(id)}.ics`,
};

export const refreshCalendar = (qc: QueryClient) => {
  void qc.invalidateQueries({ queryKey: ['calendar', 'range'] });
  void qc.invalidateQueries({ queryKey: ['calendar', 'event'] });
  void qc.invalidateQueries({ queryKey: ['calendar', 'free-busy'] });
  void qc.invalidateQueries({ queryKey: calendarKeys.summary });
};
