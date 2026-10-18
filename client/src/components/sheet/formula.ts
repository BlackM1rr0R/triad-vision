import FormulaParser from 'fast-formula-parser';
import { DATE_FMT, isDateFormat, type Cell, type CellValue, type Sheet } from './model';

/**
 * Formula evaluation on top of fast-formula-parser. Values are computed lazily (only what is on screen,
 * in the status bar or referenced) and cached. The engine lives as long as the workbook: `sync(sheets)`
 * diffs the new snapshot against the previous one (untouched rows are shared, so this is cheap) and
 * drops only the cached values of the changed cells and of the formulas that depend on them, found
 * through a dependency graph recorded while evaluating (cell → formulas reading it, ranges → formulas,
 * transitively). Renaming, adding, removing or reordering sheets resets everything.
 *
 * The parser keeps per-parse state, so nested evaluations (a formula reading another formula) use one
 * parser per nesting depth. Chains deeper than MAX_DEPTH are not recursed: the inner cell is evaluated
 * first at top level and the outer one retried, so long chains (A2=A1+1 … A5000) still work.
 */

type Result = CellValue | InstanceType<typeof FormulaParser.FormulaError>;

const MAX_DEPTH = 24;
const FormulaError = FormulaParser.FormulaError;
const CYCLE = new FormulaError('#CYCLE!');

class Deferred {
  constructor(readonly key: number) {}
}

let active: Engine | null = null;
const pool: FormulaParser[] = [];

// fast-formula-parser flattens every range argument (SUM, AVERAGE, COUNT…) with a reduce + concat,
// which is quadratic: SUM(A1:A5000) copied ~12 million array slots. A linear flatten is equivalent.
const helpers = (FormulaParser as unknown as { FormulaHelpers?: { flattenDeep(a: unknown[]): unknown[] } }).FormulaHelpers;
if (helpers) helpers.flattenDeep = (arr: unknown[]) => arr.flat(Infinity);

type Arg = { value: unknown; isArray?: boolean; isRangeRef?: boolean; isCellRef?: boolean };

/** Numbers of the arguments: ranges contribute their numbers only, direct values are coerced. */
const numbersOf = (args: Arg[]) => {
  const out: number[] = [];
  for (const a of args) {
    if (Array.isArray(a.value)) {
      for (const row of a.value as unknown[][]) for (const v of row) {
        if (v instanceof FormulaError) throw v;
        if (typeof v === 'number') out.push(v);
      }
    } else if (a.value instanceof FormulaError) throw a.value;
    else if (typeof a.value === 'number') out.push(a.value);
    else if (typeof a.value === 'boolean' && !a.isCellRef) out.push(Number(a.value));
    else if (typeof a.value === 'string' && !a.isCellRef && a.value.trim() !== '' && Number.isFinite(Number(a.value))) out.push(Number(a.value));
    else if (typeof a.value === 'string' && !a.isCellRef && a.value.trim() !== '') throw FormulaError.VALUE;
  }
  return out;
};
const valuesOf = (args: Arg[]) => args.flatMap((a) => (Array.isArray(a.value) ? (a.value as unknown[][]).flat() : [a.value]));

/** Functions fast-formula-parser does not implement. */
const EXTRA_FUNCTIONS: Record<string, (...args: Arg[]) => unknown> = {
  MIN: (...args) => {
    const n = numbersOf(args);
    return n.length ? Math.min(...n) : 0;
  },
  MAX: (...args) => {
    const n = numbersOf(args);
    return n.length ? Math.max(...n) : 0;
  },
  MEDIAN: (...args) => {
    const n = numbersOf(args).sort((a, b) => a - b);
    if (!n.length) return FormulaError.NUM;
    const m = Math.floor(n.length / 2);
    return n.length % 2 ? n[m] : (n[m - 1] + n[m]) / 2;
  },
  COUNTA: (...args) => valuesOf(args).filter((v) => v !== null && v !== undefined && v !== '').length,
  COUNTBLANK: (...args) => valuesOf(args).filter((v) => v === null || v === undefined || v === '').length,
};

const parserAt = (depth: number) => {
  let p = pool[depth];
  if (!p) {
    p = new FormulaParser({
      functions: EXTRA_FUNCTIONS as unknown as Record<string, (...args: unknown[]) => unknown>,
      onCell: (ref) => active!.cellRef(ref.sheet, ref.row - 1, ref.col - 1, depth + 1),
      onRange: (ref) => active!.rangeRef(ref.sheet, ref.from.row - 1, ref.from.col - 1, ref.to.row - 1, ref.to.col - 1, depth + 1),
    });
    pool[depth] = p;
  }
  return p;
};

const unwrapDeferred = (err: unknown): Deferred | null => {
  if (err instanceof Deferred) return err;
  if (err && typeof err === 'object' && 'details' in err) {
    const d = (err as { details?: unknown }).details;
    if (d instanceof Deferred) return d;
    if (d && typeof d === 'object' && 'details' in d && (d as { details?: unknown }).details instanceof Deferred) return (d as { details: Deferred }).details;
  }
  return null;
};

/** Numeric cell key: sheet index, row (< 2^20) and column (< 2^14) packed into one safe integer. */
type Key = number;
const ROWS = 1_048_576;
const COLS = 16_384;
export const cellKey = (si: number, r: number, c: number): Key => (si * ROWS + r) * COLS + c;
const unkey = (k: Key): [number, number, number] => {
  const c = k % COLS;
  const rest = (k - c) / COLS;
  const r = rest % ROWS;
  return [(rest - r) / ROWS, r, c];
};

/** Re-evaluated whenever anything changes (as Excel does). */
const VOLATILE = /\b(TODAY|NOW|RAND|RANDBETWEEN|OFFSET|INDIRECT)\s*\(/i;
/** Ranges taller than this many row blocks are kept in a per-sheet list instead of the block index. */
const BLOCK = 64;
const MAX_BLOCKS = 256;
/** A diff larger than this resets the whole cache (structural changes, big pastes): cheaper than tracing. */
const RESET_ABOVE = 20_000;

interface RangeDep {
  owner: Key;
  r0: number;
  c0: number;
  r1: number;
  c1: number;
  /** Row blocks the dependency is indexed under; null = in the sheet's "wide" list. */
  blocks: number[] | null;
  si: number;
}

interface RangeIndex {
  blocks: Map<number, Set<RangeDep>>;
  wide: Set<RangeDep>;
}

/** Shallow test whether two cells hold the same value / formula (styles do not affect results). */
const sameContent = (a: Cell | undefined, b: Cell | undefined) => a === b || (!!a && !!b && a.f === b.f && (a.f ? true : a.v === b.v));

export class Engine {
  private cache = new Map<Key, Result>();
  private computing = new Set<Key>();
  private byName = new Map<string, number>();
  /** Formula → what it read during its last evaluation. */
  private deps = new Map<Key, { cells: Key[]; ranges: RangeDep[] }>();
  /** Cell → formulas that read it directly. */
  private users = new Map<Key, Set<Key>>();
  private ranges = new Map<number, RangeIndex>();
  private volatile = new Set<Key>();
  /** Formulas being evaluated (innermost last): dependencies are recorded for the top one. */
  private evalStack: Key[] = [];
  private used = new Map<number, [number, number]>();
  /** Increments whenever cached values may have changed (for memoised consumers). */
  rev = 0;
  /** Formula evaluations so far (tests / diagnostics). */
  evaluations = 0;

  constructor(public sheets: Sheet[]) {
    this.reset(sheets);
  }

  private reset(sheets: Sheet[]) {
    this.sheets = sheets;
    this.cache.clear();
    this.deps.clear();
    this.users.clear();
    this.ranges.clear();
    this.volatile.clear();
    this.used.clear();
    this.byName.clear();
    sheets.forEach((s, i) => this.byName.set(s.name.toLocaleLowerCase(), i));
    this.rev++;
  }

  /**
   * Moves the engine to a new workbook snapshot, invalidating only what changed. Returns true when
   * cached values may differ (consumers re-read), false when nothing value-relevant changed.
   */
  sync(next: Sheet[]): boolean {
    const prev = this.sheets;
    if (next === prev) return false;
    if (prev.length !== next.length || prev.some((s, i) => s.name !== next[i].name)) {
      this.reset(next);
      return true;
    }
    this.sheets = next;
    const changed: Key[] = [];
    for (let si = 0; si < next.length; si++) {
      const a = prev[si].rows;
      const b = next[si].rows;
      if (a === b) continue;
      let removed = false;
      const before = changed.length;
      for (const rk in b) {
        const rb = b[rk];
        const ra = a[rk];
        if (ra === rb) continue;
        const r = Number(rk);
        for (const ck in rb) if (!sameContent(ra?.[ck as unknown as number], rb[ck as unknown as number])) changed.push(cellKey(si, r, Number(ck)));
        if (ra) {
          for (const ck in ra) {
            if (!(ck in rb)) {
              changed.push(cellKey(si, r, Number(ck)));
              removed = true;
            }
          }
        }
      }
      for (const rk in a) {
        if (rk in b) continue;
        const r = Number(rk);
        for (const ck in a[rk]) changed.push(cellKey(si, r, Number(ck)));
        removed = true;
      }
      if (changed.length > RESET_ABOVE) {
        this.reset(next);
        return true;
      }
      // Used area: grows with new cells; recomputed lazily when cells were removed.
      const u = this.used.get(si);
      if (u && changed.length > before) {
        if (removed) this.used.delete(si);
        else
          for (let i = before; i < changed.length; i++) {
            const [, r, c] = unkey(changed[i]);
            if (r > u[0]) u[0] = r;
            if (c > u[1]) u[1] = c;
          }
      }
    }
    if (!changed.length) return false;
    for (const k of changed) this.clearDeps(k);
    this.invalidate([...changed, ...this.volatile]);
    this.rev++;
    return true;
  }

  /** Drops the cached values of `keys` and of every formula depending on them (transitively). */
  private invalidate(keys: Key[]) {
    const seen = new Set<Key>(keys);
    const queue = keys.slice();
    while (queue.length) {
      const k = queue.pop()!;
      this.cache.delete(k);
      const direct = this.users.get(k);
      if (direct) for (const u of direct) if (!seen.has(u)) (seen.add(u), queue.push(u));
      const [si, r, c] = unkey(k);
      const idx = this.ranges.get(si);
      if (!idx) continue;
      const visit = (d: RangeDep) => {
        if (r >= d.r0 && r <= d.r1 && c >= d.c0 && c <= d.c1 && !seen.has(d.owner)) {
          seen.add(d.owner);
          queue.push(d.owner);
        }
      };
      idx.blocks.get(Math.floor(r / BLOCK))?.forEach(visit);
      idx.wide.forEach(visit);
    }
  }

  /** Forgets what a formula read (before re-evaluating it, or when the cell changed). */
  private clearDeps(owner: Key) {
    const d = this.deps.get(owner);
    this.volatile.delete(owner);
    if (!d) return;
    this.deps.delete(owner);
    for (const k of d.cells) {
      const set = this.users.get(k);
      if (set) {
        set.delete(owner);
        if (!set.size) this.users.delete(k);
      }
    }
    for (const rd of d.ranges) {
      const idx = this.ranges.get(rd.si);
      if (!idx) continue;
      if (rd.blocks) for (const b of rd.blocks) idx.blocks.get(b)?.delete(rd);
      else idx.wide.delete(rd);
    }
  }

  private depsOf(owner: Key) {
    let d = this.deps.get(owner);
    if (!d) this.deps.set(owner, (d = { cells: [], ranges: [] }));
    return d;
  }

  private recordCell(k: Key) {
    const owner = this.evalStack[this.evalStack.length - 1];
    if (owner === undefined) return;
    let set = this.users.get(k);
    if (!set) this.users.set(k, (set = new Set()));
    if (set.has(owner)) return;
    set.add(owner);
    this.depsOf(owner).cells.push(k);
  }

  private recordRange(si: number, r0: number, c0: number, r1: number, c1: number) {
    const owner = this.evalStack[this.evalStack.length - 1];
    if (owner === undefined) return;
    let idx = this.ranges.get(si);
    if (!idx) this.ranges.set(si, (idx = { blocks: new Map(), wide: new Set() }));
    const b0 = Math.floor(r0 / BLOCK);
    const b1 = Math.floor(r1 / BLOCK);
    const rd: RangeDep = { owner, si, r0, c0, r1, c1, blocks: b1 - b0 < MAX_BLOCKS ? [] : null };
    if (rd.blocks) {
      for (let b = b0; b <= b1; b++) {
        let set = idx.blocks.get(b);
        if (!set) idx.blocks.set(b, (set = new Set()));
        set.add(rd);
        rd.blocks.push(b);
      }
    } else idx.wide.add(rd);
    this.depsOf(owner).ranges.push(rd);
  }

  private sheetIndex(name: string | undefined, fallback: number) {
    if (!name) return fallback;
    return this.byName.get(name.toLocaleLowerCase()) ?? -1;
  }

  /** Computed value of a cell (formulas evaluated, errors as FormulaError). */
  result(si: number, r: number, c: number): Result {
    const cell = this.sheets[si]?.rows[r]?.[c];
    if (!cell) return null;
    if (!cell.f) return cell.v ?? null;
    const key = cellKey(si, r, c);
    const hit = this.cache.get(key);
    if (hit !== undefined || this.cache.has(key)) return hit!;
    const prev = active;
    active = this;
    try {
      // Top level: evaluate, deferring deep dependencies onto an explicit stack.
      const stack = [key];
      let guard = 0;
      while (stack.length && guard++ < 200_000) {
        const k = stack[stack.length - 1];
        if (this.cache.has(k)) {
          stack.pop();
          continue;
        }
        try {
          this.cache.set(k, this.compute(k, 0));
          stack.pop();
        } catch (err) {
          const d = unwrapDeferred(err);
          if (!d) throw err;
          if (stack.includes(d.key)) {
            this.cache.set(d.key, CYCLE);
          } else stack.push(d.key);
        }
      }
      return this.cache.get(key) ?? CYCLE;
    } finally {
      active = prev;
    }
  }

  /** Display-ready value: errors become their text ("#DIV/0!"). */
  value(si: number, r: number, c: number): CellValue {
    const v = this.result(si, r, c);
    if (v instanceof FormulaError) return v.error;
    if (Array.isArray(v)) return null;
    return v;
  }

  private compute(key: Key, depth: number): Result {
    const [si, r, c] = unkey(key);
    const cell = this.sheets[si]?.rows[r]?.[c];
    if (!cell?.f) return cell?.v ?? null;
    if (this.computing.has(key)) return CYCLE;
    this.clearDeps(key);
    if (VOLATILE.test(cell.f)) this.volatile.add(key);
    this.computing.add(key);
    this.evalStack.push(key);
    this.evaluations++;
    try {
      const out = parserAt(depth).parse(cell.f, { row: r + 1, col: c + 1, sheet: this.sheets[si].name });
      if (out === undefined || out === null) return 0;
      if (Array.isArray(out)) return (out[0]?.[0] as CellValue) ?? 0;
      return out as Result;
    } catch (err) {
      const deferred = unwrapDeferred(err);
      if (deferred) throw deferred;
      if (err instanceof FormulaError) {
        const code = err.error;
        return /^#[A-Z/0!?]+$/.test(code) && code.length < 10 ? err : new FormulaError('#ERROR!');
      }
      return new FormulaError('#ERROR!');
    } finally {
      this.evalStack.pop();
      this.computing.delete(key);
    }
  }

  /** onCell: value of a referenced cell (computing formulas, nested); recorded as a dependency. */
  cellRef(sheet: string | undefined, r: number, c: number, depth: number): Result {
    const si = this.sheetIndex(sheet, -1);
    if (si < 0) return FormulaError.REF;
    this.recordCell(cellKey(si, r, c));
    return this.refValue(si, r, c, depth);
  }

  private refValue(si: number, r: number, c: number, depth: number): Result {
    const cell = this.sheets[si].rows[r]?.[c];
    if (!cell) return null;
    if (!cell.f) return cell.v ?? null;
    const key = cellKey(si, r, c);
    const hit = this.cache.get(key);
    if (hit !== undefined || this.cache.has(key)) return hit!;
    if (this.computing.has(key)) return CYCLE;
    if (depth >= MAX_DEPTH) throw new Deferred(key);
    const v = this.compute(key, depth);
    this.cache.set(key, v);
    return v;
  }

  private usedOf(si: number): [number, number] {
    let u = this.used.get(si);
    if (!u) {
      let maxR = -1;
      let maxC = -1;
      const rows = this.sheets[si].rows;
      for (const rk in rows) {
        const rr = Number(rk);
        const line = rows[rr];
        let any = false;
        for (const ck in line) {
          any = true;
          const cc = Number(ck);
          if (cc > maxC) maxC = cc;
        }
        if (any && rr > maxR) maxR = rr;
      }
      u = [maxR, maxC];
      this.used.set(si, u);
    }
    return u;
  }

  /** onRange: 2-D values, clamped to the used part of the sheet (whole-column refs stay cheap). */
  rangeRef(sheet: string | undefined, r0: number, c0: number, r1: number, c1: number, depth: number): unknown[][] {
    const si = this.sheetIndex(sheet, -1);
    if (si < 0) return [[FormulaError.REF]];
    // The unclamped range is the dependency: a value typed below the used area must still invalidate.
    this.recordRange(si, r0, c0, r1, c1);
    const s = this.sheets[si];
    const [maxR, maxC] = this.usedOf(si);
    const toR = Math.min(r1, maxR);
    const toC = Math.min(c1, maxC);
    const out: unknown[][] = [];
    for (let r = r0; r <= toR; r++) {
      const line: unknown[] = [];
      const row = s.rows[r];
      for (let c = c0; c <= toC; c++) line.push(row?.[c] ? this.refValue(si, r, c, depth) : null);
      out.push(line);
    }
    return out.length ? out : [[null]];
  }
}

/** Suggested display format of a formula without its own (TODAY() and friends show dates). */
export const impliedFormat = (formula: string | undefined) => (formula && /\b(TODAY|NOW|DATE|EDATE|EOMONTH|WORKDAY)\s*\(/i.test(formula) ? DATE_FMT : undefined);

export { isDateFormat };
