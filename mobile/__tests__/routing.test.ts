import { apiOrigin, resolveApiUrl, resolveMediaUrl } from '@/lib/apiUrl';
import { buildIcs, toIcsDate } from '@/lib/ics';
import { routeForNotification } from '@/lib/links';

describe('notification → screen', () => {
  it('opens the client case screen', () => {
    expect(routeForNotification({ link: '/account/cases/abc', caseId: 'abc', type: 'CONTRACT_SENT' }, 'CLIENT')).toBe('/cases/abc');
  });

  it('opens the chat for new messages', () => {
    expect(routeForNotification({ link: '/account/cases/abc', type: 'NEW_MESSAGE' }, 'CLIENT')).toBe('/chat/abc');
  });

  it('opens the staff case screen for staff and admins', () => {
    expect(routeForNotification({ link: '/admin/cases/xyz', caseId: 'xyz' }, 'STAFF')).toBe('/staff/cases/xyz');
    expect(routeForNotification({ link: '', caseId: 'xyz' }, 'ADMIN')).toBe('/staff/cases/xyz');
    expect(routeForNotification({ link: '', caseId: 'xyz' }, 'SUPER_ADMIN')).toBe('/staff/cases/xyz');
  });

  it('falls back sensibly without a case', () => {
    expect(routeForNotification({ link: '/admin/inquiries' }, 'ADMIN')).toBe('/dashboard');
    expect(routeForNotification({ link: null }, 'CLIENT')).toBe('/notifications');
    expect(routeForNotification({ caseId: 'x' }, null)).toBeNull();
  });
});

describe('API base URL', () => {
  it('prefers EXPO_PUBLIC_API_URL and strips trailing slashes', () => {
    expect(resolveApiUrl({ envUrl: 'https://triad-vision.de/api/', hostUri: '192.168.1.5:8081', platform: 'ios' })).toBe('https://triad-vision.de/api');
  });

  it('reuses the dev server LAN IP for Expo Go on a phone', () => {
    expect(resolveApiUrl({ hostUri: '192.168.1.5:8081', platform: 'android' })).toBe('http://192.168.1.5:4000/api');
  });

  it('uses 10.0.2.2 on the Android emulator and localhost on iOS', () => {
    expect(resolveApiUrl({ hostUri: 'localhost:8081', platform: 'android' })).toBe('http://10.0.2.2:4000/api');
    expect(resolveApiUrl({ platform: 'ios' })).toBe('http://localhost:4000/api');
  });

  it('resolves CMS media paths against the API origin', () => {
    expect(apiOrigin('http://10.0.2.2:4000/api')).toBe('http://10.0.2.2:4000');
    expect(resolveMediaUrl('http://h:4000/api', '/uploads/a.jpg')).toBe('http://h:4000/uploads/a.jpg');
    expect(resolveMediaUrl('http://h:4000/api', 'https://images.example/x.jpg')).toBe('https://images.example/x.jpg');
    expect(resolveMediaUrl('http://h:4000/api', '')).toBeUndefined();
  });
});

describe('calendar file', () => {
  it('formats UTC timestamps', () => {
    expect(toIcsDate(new Date(Date.UTC(2026, 9, 14, 7, 5, 0)))).toBe('20261014T070500Z');
  });

  it('builds a valid single-event calendar with escaped text', () => {
    const ics = buildIcs({
      uid: 'case1',
      title: 'Embassy; appointment',
      start: new Date(Date.UTC(2026, 10, 3, 6, 0)),
      end: new Date(Date.UTC(2026, 10, 3, 7, 0)),
      location: 'Baku, Mammadaliyev 15',
      now: new Date(Date.UTC(2026, 9, 14)),
    });
    const lines = ics.split('\r\n');
    expect(lines[0]).toBe('BEGIN:VCALENDAR');
    expect(lines.at(-1)).toBe('END:VCALENDAR');
    expect(ics).toContain('DTSTART:20261103T060000Z');
    expect(ics).toContain('SUMMARY:Embassy\\; appointment');
    expect(ics).toContain('LOCATION:Baku\\, Mammadaliyev 15');
    expect(ics).not.toContain('DESCRIPTION:undefined');
  });
});
