// Minimal typings for fast-formula-parser 1.0.19 (the package ships none).
declare module 'fast-formula-parser' {
  export interface CellRef {
    sheet?: string;
    row: number;
    col: number;
  }
  export interface RangeRef {
    sheet?: string;
    from: { row: number; col: number };
    to: { row: number; col: number };
  }
  export class FormulaError extends Error {
    constructor(error: string, msg?: string, details?: unknown);
    readonly error: string;
    details?: unknown;
    static DIV0: FormulaError;
    static NA: FormulaError;
    static NAME: FormulaError;
    static NULL: FormulaError;
    static NUM: FormulaError;
    static REF: FormulaError;
    static VALUE: FormulaError;
    static ERROR: (msg: string, details?: unknown) => FormulaError;
    toString(): string;
  }
  export interface ParserConfig {
    functions?: Record<string, (...args: unknown[]) => unknown>;
    functionsNeedContext?: Record<string, (ctx: unknown, ...args: unknown[]) => unknown>;
    onCell?: (ref: CellRef) => unknown;
    onRange?: (ref: RangeRef) => unknown[][];
    onVariable?: (name: string, sheet: string) => CellRef | RangeRef | null;
  }
  export interface Ssf {
    format(fmt: string | number, value: unknown, opts?: Record<string, unknown>): string;
    is_date(fmt: string): boolean;
  }
  export default class FormulaParser {
    constructor(config?: ParserConfig);
    parse(formula: string, position: { row: number; col: number; sheet: string }, allowReturnArray?: boolean): unknown;
    static MAX_ROW: number;
    static MAX_COLUMN: number;
    static SSF: Ssf;
    static FormulaError: typeof FormulaError;
  }
}
