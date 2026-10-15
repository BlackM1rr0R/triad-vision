/**
 * @mentions in chat messages. The composer inserts plain "@First Last" text (no markup), so the
 * server resolves names against the people who could be mentioned (channel members, or all staff
 * for public channels). "@all" / "@channel" / "@here" address everyone in the channel.
 */

export interface MentionPerson {
  id: string;
  firstName: string;
  lastName: string;
}

export const ALL_TOKENS = ['all', 'channel', 'here', 'hamı', 'alle', 'все'];

const norm = (s: string) => s.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const hasToken = (lowerBody: string, name: string) =>
  new RegExp(`(^|[^\\p{L}\\p{N}_])@${escapeRe(name)}(?![\\p{L}\\p{N}_])`, 'u').test(lowerBody);

/** True when the text contains "@all" (or one of its localised equivalents) as a standalone token. */
export const mentionsAll = (body: string) => {
  const lower = norm(body);
  return ALL_TOKENS.some((t) => hasToken(lower, t));
};

/**
 * User ids mentioned in `body` as "@First Last" (full name) or "@First" when the first name is
 * unambiguous among `people`. Matching is case-insensitive.
 */
export const mentionedUserIds = (body: string, people: MentionPerson[]): string[] => {
  if (!body.includes('@') || !people.length) return [];
  const lower = norm(body);
  const found = new Set<string>();
  const byFirst = new Map<string, MentionPerson[]>();
  for (const p of people) {
    const f = norm(p.firstName);
    if (f) byFirst.set(f, [...(byFirst.get(f) ?? []), p]);
    const full = norm(`${p.firstName} ${p.lastName}`);
    if (full && hasToken(lower, full)) found.add(p.id);
  }
  for (const [first, list] of byFirst) {
    if (list.length === 1 && !found.has(list[0].id) && hasToken(lower, first)) found.add(list[0].id);
  }
  return [...found];
};

/** Short, single-line excerpt of a message body for notifications and previews. */
export const excerpt = (body: string, max = 200) => {
  const s = body.replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
};
