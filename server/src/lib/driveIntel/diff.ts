/**
 * Myers O(ND) diff over token arrays (pure, unit tested) and the word / line tokenisers the version
 * comparison uses. Common prefix and suffix are stripped first; when the edit distance exceeds `maxD` the
 * middle part is reported as one removal + one addition instead of burning CPU.
 */

export type OpType = 'eq' | 'del' | 'ins';
export interface DiffOp {
  t: OpType;
  s: string;
}

const push = (out: DiffOp[], t: OpType, s: string) => {
  if (!s) return;
  const last = out[out.length - 1];
  if (last && last.t === t) last.s += s;
  else out.push({ t, s });
};

/** Edit script of two token arrays; tokens are joined back into strings per op. */
export const diffTokens = (a: string[], b: string[], maxD = 2000): DiffOp[] => {
  const out: DiffOp[] = [];
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  push(out, 'eq', a.slice(0, start).join(''));
  const mid = myers(a.slice(start, endA), b.slice(start, endB), maxD);
  for (const op of mid) push(out, op.t, op.s);
  push(out, 'eq', a.slice(endA).join(''));
  return out;
};

const myers = (a: string[], b: string[], maxD: number): DiffOp[] => {
  const n = a.length;
  const m = b.length;
  const out: DiffOp[] = [];
  if (!n && !m) return out;
  if (!n) return [{ t: 'ins', s: b.join('') }];
  if (!m) return [{ t: 'del', s: a.join('') }];
  const max = Math.min(n + m, maxD);
  const offset = max + 1;
  const v = new Int32Array(2 * max + 3);
  // trace[d] = V[-d-1 .. d+1] before step d (all that backtracking needs: O(D²) memory, not O(D·N)).
  const trace: Int32Array[] = [];
  let found = -1;
  for (let d = 0; d <= max; d++) {
    trace.push(v.slice(offset - d - 1, offset + d + 2));
    for (let k = -d; k <= d; k += 2) {
      let x: number;
      if (k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1])) x = v[offset + k + 1];
      else x = v[offset + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v[offset + k] = x;
      if (x >= n && y >= m) {
        found = d;
        break;
      }
    }
    if (found >= 0) break;
  }
  if (found < 0) return [{ t: 'del', s: a.join('') }, { t: 'ins', s: b.join('') }];

  // Backtrack: trace[d] holds V before step d.
  const rev: DiffOp[] = [];
  let x = n;
  let y = m;
  for (let d = found; d > 0; d--) {
    const w = trace[d];
    const at = (kk: number) => w[kk + d + 1];
    const k = x - y;
    const down = k === -d || (k !== d && at(k - 1) < at(k + 1));
    const prevK = down ? k + 1 : k - 1;
    const prevX = at(prevK);
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      rev.push({ t: 'eq', s: a[x - 1] });
      x--;
      y--;
    }
    if (down) rev.push({ t: 'ins', s: b[prevY] });
    else rev.push({ t: 'del', s: a[prevX] });
    x = prevX;
    y = prevY;
  }
  while (x > 0 && y > 0) {
    rev.push({ t: 'eq', s: a[x - 1] });
    x--;
    y--;
  }
  for (let i = rev.length - 1; i >= 0; i--) push(out, rev[i].t, rev[i].s);
  return out;
};

/** Words and the whitespace between them (joining the tokens gives the text back). */
export const wordTokens = (text: string) => text.match(/\s+|[^\s]+/g) ?? [];

/** Lines including their line break. */
export const lineTokens = (text: string) => text.match(/[^\n]*\n|[^\n]+$/g) ?? [];

/** Word diff for normal sizes, line diff when the text is long. */
export const diffText = (a: string, b: string, opts: { maxWordTokens?: number; maxD?: number } = {}): { ops: DiffOp[]; mode: 'words' | 'lines' } => {
  const wa = wordTokens(a);
  const wb = wordTokens(b);
  if (wa.length + wb.length <= (opts.maxWordTokens ?? 30_000)) return { ops: diffTokens(wa, wb, opts.maxD), mode: 'words' };
  return { ops: diffTokens(lineTokens(a), lineTokens(b), opts.maxD), mode: 'lines' };
};

/** Words added / removed in an edit script. */
export const diffStats = (ops: DiffOp[]) => {
  let added = 0;
  let removed = 0;
  for (const op of ops) {
    const words = (op.s.match(/[^\s]+/g) ?? []).length;
    if (op.t === 'ins') added += words;
    else if (op.t === 'del') removed += words;
  }
  return { added, removed };
};
