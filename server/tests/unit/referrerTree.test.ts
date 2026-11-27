import { describe, expect, it } from 'vitest';
import {
  MAX_DEPTH,
  aggregateSubtree,
  ancestorIds,
  canAddChild,
  depthOf,
  descendantIds,
  emptyStats,
  isInSubtree,
  moveError,
  subtreeHeight,
  subtreeIds,
  type NodeStats,
  type TreeNode,
} from '../../src/lib/referrers/tree';

// a ─ b ─ d
//   └ c
// e (other top-level branch)
const nodes: TreeNode[] = [
  { id: 'a', parentPartnerId: null },
  { id: 'b', parentPartnerId: 'a' },
  { id: 'c', parentPartnerId: 'a' },
  { id: 'd', parentPartnerId: 'b' },
  { id: 'e', parentPartnerId: null },
];

const chain = (n: number): TreeNode[] => Array.from({ length: n }, (_, i) => ({ id: `n${i + 1}`, parentPartnerId: i ? `n${i}` : null }));

describe('referrer tree: subtree', () => {
  it('lists the node and everything below it, never parents or siblings', () => {
    expect(subtreeIds(nodes, 'a')).toEqual(['a', 'b', 'c', 'd']);
    expect(subtreeIds(nodes, 'b')).toEqual(['b', 'd']);
    expect(descendantIds(nodes, 'b')).toEqual(['d']);
    expect(isInSubtree(nodes, 'b', 'c')).toBe(false); // sibling
    expect(isInSubtree(nodes, 'b', 'a')).toBe(false); // parent
    expect(isInSubtree(nodes, 'a', 'e')).toBe(false); // other branch
    expect(subtreeIds(nodes, 'zz')).toEqual([]);
  });

  it('does not loop on a cycle in broken data', () => {
    const broken: TreeNode[] = [
      { id: 'x', parentPartnerId: 'y' },
      { id: 'y', parentPartnerId: 'x' },
    ];
    expect(subtreeIds(broken, 'x')).toEqual(['x', 'y']);
    expect(ancestorIds(broken, 'x')).toEqual(['y']);
    expect(subtreeHeight(broken, 'x')).toBe(2);
  });
});

describe('referrer tree: depth', () => {
  it('counts levels from the top (1) and the height of a subtree', () => {
    expect(depthOf(nodes, 'a')).toBe(1);
    expect(depthOf(nodes, 'd')).toBe(3);
    expect(depthOf(nodes, 'zz')).toBe(0);
    expect(subtreeHeight(nodes, 'a')).toBe(3);
    expect(subtreeHeight(nodes, 'd')).toBe(1);
  });

  it('allows a new child only while the tree stays within MAX_DEPTH', () => {
    const c = chain(MAX_DEPTH);
    expect(canAddChild(c, `n${MAX_DEPTH - 1}`)).toBe(true);
    expect(canAddChild(c, `n${MAX_DEPTH}`)).toBe(false);
    expect(canAddChild(c, 'unknown')).toBe(false);
  });
});

describe('referrer tree: moves', () => {
  it('refuses cycles (under itself or its own descendant)', () => {
    expect(moveError(nodes, 'a', 'a')).toBe('REFERRER_CYCLE');
    expect(moveError(nodes, 'a', 'd')).toBe('REFERRER_CYCLE');
    expect(moveError(nodes, 'b', 'c')).toBeNull();
    expect(moveError(nodes, 'b', null)).toBeNull();
  });

  it('refuses unknown nodes and moves that make the tree too deep', () => {
    expect(moveError(nodes, 'zz', 'a')).toBe('REFERRER_NOT_FOUND');
    expect(moveError(nodes, 'b', 'zz')).toBe('PARENT_NOT_FOUND');
    // chain of 4 below e (depth 1) → 5 levels: fine; under a 2-level node → 6: too deep.
    const c = [...chain(4), { id: 'top', parentPartnerId: null }, { id: 'mid', parentPartnerId: 'top' }];
    expect(moveError(c, 'n1', 'top')).toBeNull();
    expect(moveError(c, 'n1', 'mid')).toBe('REFERRER_TOO_DEEP');
    expect(moveError(nodes, 'b', 'e', 2)).toBe('REFERRER_TOO_DEEP');
  });
});

describe('referrer tree: KPI aggregation', () => {
  it('sums each node with its whole subtree; nodes without figures count as zero', () => {
    const s = (clients: number, paidCents = 0): NodeStats => ({ ...emptyStats(), clients, activeCases: clients, approvedVisas: 1, paidCents, outstandingCents: 10 });
    const own = new Map<string, NodeStats>([
      ['a', s(1, 100)],
      ['b', s(2, 200)],
      ['d', s(3, 300)],
      ['e', s(5)],
    ]);
    const total = aggregateSubtree(nodes, own);
    expect(total.get('a')).toEqual({ clients: 6, activeCases: 6, approvedVisas: 3, paidCents: 600, outstandingCents: 30 });
    expect(total.get('b')).toEqual({ clients: 5, activeCases: 5, approvedVisas: 2, paidCents: 500, outstandingCents: 20 });
    expect(total.get('c')).toEqual(emptyStats());
    expect(total.get('e')?.clients).toBe(5); // other branch not mixed in
  });
});
