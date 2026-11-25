import { describe, expect, it } from 'vitest';
import { aggregateLeaderboard, type LeaderEvent } from '../../src/lib/tvDisplay/leaderboard.js';

const ev = (actorId: string | null, type: string, from: string | null = null, to: string | null = null): LeaderEvent => ({ actorId, type, fromStatus: from, toStatus: to });
const names = new Map([
  ['a', 'Aysel'],
  ['b', 'Bəhruz'],
]);

describe('TV staff leaderboard aggregation', () => {
  it('counts reviews, moves and approvals per staff member and sorts by score', () => {
    const rows = aggregateLeaderboard(
      [
        ev('a', 'DOCUMENT_ACCEPTED'),
        ev('a', 'DOCUMENT_REJECTED'),
        ev('b', 'STATUS_CHANGED', 'DOCUMENTS_REVIEW', 'CONTRACT_SENT'),
        ev('b', 'DECISION', 'DECISION_PENDING', 'APPROVED'),
      ],
      names,
    );
    expect(rows).toEqual([
      { name: 'Bəhruz', reviewed: 0, moved: 2, approvals: 1, score: 5 },
      { name: 'Aysel', reviewed: 2, moved: 0, approvals: 0, score: 2 },
    ]);
  });

  it('ignores unknown actors (clients, system), reopen / cancel and empty rows; limits the list', () => {
    const rows = aggregateLeaderboard(
      [ev(null, 'DOCUMENT_ACCEPTED'), ev('client', 'DOCUMENT_ACCEPTED'), ev('a', 'REOPENED', 'REJECTED', 'DOCUMENTS_PENDING'), ev('a', 'STATUS_CHANGED', 'APPROVED', 'CANCELLED'), ev('b', 'CASE_UPDATED')],
      names,
    );
    expect(rows).toEqual([]);
    const many = new Map(Array.from({ length: 8 }, (_, i) => [`s${i}`, `N${i}`]));
    const events = [...many.keys()].map((id) => ev(id, 'DOCUMENT_ACCEPTED'));
    expect(aggregateLeaderboard(events, many, 5)).toHaveLength(5);
  });

  it('ties are ordered by name', () => {
    const rows = aggregateLeaderboard([ev('b', 'DOCUMENT_ACCEPTED'), ev('a', 'DOCUMENT_ACCEPTED')], names);
    expect(rows.map((r) => r.name)).toEqual(['Aysel', 'Bəhruz']);
  });
});
