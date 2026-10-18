import FormulaParser from 'fast-formula-parser';
import { DATE_FMT, isDateFormat, type CellValue, type Sheet } from './model';

/**
 * Formula evaluation on top of fast-formula-parser. Values are computed lazily (only what is on screen,
 * in the status bar or referenced) and memoised per workbook snapshot: every edit produces a new
 * snapshot, so a new Engine with an empty cache — recalculation is simply "forget and recompute".
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
  constructor(readonly key: string) {}
}

let active: Engine | null = null;
const pool: FormulaParser[] = [];

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

export class Engine {
  private cache = new Map<string, Result>();
  private computing = new Set<string>();
  private byName = new Map<string, number>();

  constructor(readonly sheets: Sheet[]) {
    sheets.forEach((s, i) => this.byName.set(s.name.toLocaleLowerCase(), i));
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
    const key = `${si}:${r}:${c}`;
    if (this.cache.has(key)) return this.cache.get(key)!;
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

  private compute(key: string, depth: number): Result {
    const [si, r, c] = key.split(':').map(Number);
    const cell = this.sheets[si]?.rows[r]?.[c];
    if (!cell?.f) return cell?.v ?? null;
    if (this.computing.has(key)) return CYCLE;
    this.computing.add(key);
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
      this.computing.delete(key);
    }
  }

  /** onCell: value of a referenced cell (computing formulas, nested). */
  cellRef(sheet: string | undefined, r: number, c: number, depth: number): Result {
    const si = this.sheetIndex(sheet, -1);
    if (si < 0) return FormulaError.REF;
    const cell = this.sheets[si].rows[r]?.[c];
    if (!cell) return null;
    if (!cell.f) return cell.v ?? null;
    const key = `${si}:${r}:${c}`;
    if (this.cache.has(key)) return this.cache.get(key)!;
    if (this.computing.has(key)) return CYCLE;
    if (depth >= MAX_DEPTH) throw new Deferred(key);
    const v = this.compute(key, depth);
    this.cache.set(key, v);
    return v;
  }

  private used = new Map<number, [number, number]>();
  private usedOf(si: number): [number, number] {
    let u = this.used.get(si);
    if (!u) {
      let maxR = -1;
      let maxC = -1;
      const rows = this.sheets[si].rows;
      for (const rk of Object.keys(rows)) {
        const rr = Number(rk);
        if (rr > maxR) maxR = rr;
        for (const ck of Object.keys(rows[rr])) if (Number(ck) > maxC) maxC = Number(ck);
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
    const s = this.sheets[si];
    const [maxR, maxC] = this.usedOf(si);
    const toR = Math.min(r1, maxR);
    const toC = Math.min(c1, maxC);
    const out: unknown[][] = [];
    for (let r = r0; r <= toR; r++) {
      const line: unknown[] = [];
      const row = s.rows[r];
      for (let c = c0; c <= toC; c++) line.push(row?.[c] ? this.cellRef(sheet, r, c, depth) : null);
      out.push(line);
    }
    return out.length ? out : [[null]];
  }
}

/** Suggested display format of a formula without its own (TODAY() and friends show dates). */
export const impliedFormat = (formula: string | undefined) => (formula && /\b(TODAY|NOW|DATE|EDATE|EOMONTH|WORKDAY)\s*\(/i.test(formula) ? DATE_FMT : undefined);

export { isDateFormat };
