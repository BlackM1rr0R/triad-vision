import type { Run } from './api';

/**
 * Rich text of one editor block as runs ({ t, b, i, u }). The contentEditable element is rendered FROM the
 * runs and read back INTO runs after every input, so formatting never depends on document.execCommand:
 * B / I / U toggle marks on a character range of the runs and the element is rendered again, with the
 * selection restored by character offsets ("\n" = line break = one character).
 */

type Marks = Pick<Run, 'b' | 'i' | 'u'>;
const sameMarks = (a: Marks, b: Marks) => !!a.b === !!b.b && !!a.i === !!b.i && !!a.u === !!b.u;

/** Merges neighbours with the same marks and drops empty runs. */
export const normalize = (runs: Run[]): Run[] => {
  const out: Run[] = [];
  for (const r of runs) {
    if (!r.t) continue;
    const last = out[out.length - 1];
    if (last && sameMarks(last, r)) last.t += r.t;
    else out.push({ t: r.t, ...(r.b ? { b: true } : {}), ...(r.i ? { i: true } : {}), ...(r.u ? { u: true } : {}) });
  }
  return out;
};

export const runsLength = (runs: Run[]) => runs.reduce((n, r) => n + r.t.length, 0);
export const runsText = (runs: Run[]) => runs.map((r) => r.t).join('');

/** Runs of the character range [from, to). */
export const sliceRuns = (runs: Run[], from: number, to = Infinity): Run[] => {
  const out: Run[] = [];
  let pos = 0;
  for (const r of runs) {
    const end = pos + r.t.length;
    const a = Math.max(from, pos);
    const b = Math.min(to, end);
    if (b > a) out.push({ ...r, t: r.t.slice(a - pos, b - pos) });
    pos = end;
  }
  return normalize(out);
};

/** Marks of the character before `pos` (what typed text continues with). */
export const marksAt = (runs: Run[], pos: number): Marks => {
  let p = 0;
  for (const r of runs) {
    if (pos > p && pos <= p + r.t.length) return { b: r.b, i: r.i, u: r.u };
    p += r.t.length;
  }
  return runs[0] && pos === 0 ? { b: runs[0].b, i: runs[0].i, u: runs[0].u } : {};
};

/** Toggles one mark on [from, to): removed when the whole range has it, else added. */
export const toggleMark = (runs: Run[], from: number, to: number, mark: 'b' | 'i' | 'u'): Run[] => {
  if (to <= from) return runs;
  const mid = sliceRuns(runs, from, to);
  const all = mid.length > 0 && mid.every((r) => r[mark]);
  return normalize([...sliceRuns(runs, 0, from), ...mid.map((r) => ({ ...r, [mark]: !all })), ...sliceRuns(runs, to)]);
};

/** Replaces [from, to) with text carrying the marks found at `from`. */
export const insertText = (runs: Run[], from: number, to: number, text: string): Run[] =>
  normalize([...sliceRuns(runs, 0, from), { t: text, ...marksAt(runs, from) }, ...sliceRuns(runs, to)]);

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** HTML of runs for the contentEditable element (a trailing line break gets a filler <br>). */
export const runsToHtml = (runs: Run[]): string => {
  let html = '';
  for (const r of runs) {
    let h = esc(r.t).replace(/\n/g, '<br>');
    if (r.u) h = `<u>${h}</u>`;
    if (r.i) h = `<i>${h}</i>`;
    if (r.b) h = `<b>${h}</b>`;
    html += h;
  }
  if (runsText(runs).endsWith('\n')) html += '<br>';
  return html;
};

const BLOCK_TAGS = new Set(['DIV', 'P', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6']);

const walk = (node: Node, marks: Marks, out: Run[]) => {
  if (node.nodeType === Node.TEXT_NODE) {
    const t = (node.nodeValue ?? '').replace(/ /g, ' ').replace(/​/g, '');
    if (t) out.push({ t, ...marks });
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const el = node as HTMLElement;
  if (el.tagName === 'BR') {
    out.push({ t: '\n', ...marks });
    return;
  }
  const tag = el.tagName;
  const st = el.style;
  const next: Marks = {
    b: marks.b || tag === 'B' || tag === 'STRONG' || (st && (st.fontWeight === 'bold' || Number(st.fontWeight) >= 600)),
    i: marks.i || tag === 'I' || tag === 'EM' || (st && st.fontStyle === 'italic'),
    u: marks.u || tag === 'U' || (st && /underline/.test(st.textDecoration || '')),
  };
  // A block element the browser inserted starts on a new line.
  if (BLOCK_TAGS.has(tag) && out.length && !runsText(out).endsWith('\n')) out.push({ t: '\n', ...marks });
  el.childNodes.forEach((c) => walk(c, next, out));
};

/** Runs read back from the contentEditable element. */
export const domToRuns = (root: HTMLElement): Run[] => {
  const out: Run[] = [];
  root.childNodes.forEach((c) => walk(c, {}, out));
  const runs = normalize(out);
  // The filler <br> (or the one browsers put into an empty element) is not content.
  const last = runs[runs.length - 1];
  if (last && last.t.endsWith('\n')) {
    last.t = last.t.slice(0, -1);
    if (!last.t) runs.pop();
  }
  return runs;
};

/** Number of characters before (node, offset) inside root, counting <br> as one. */
const offsetOf = (root: HTMLElement, node: Node, offset: number) => {
  const range = document.createRange();
  range.selectNodeContents(root);
  try {
    range.setEnd(node, offset);
  } catch {
    return 0;
  }
  const frag = range.cloneContents();
  const out: Run[] = [];
  frag.childNodes.forEach((c) => walk(c, {}, out));
  return runsLength(out);
};

/** The selection inside root as character offsets (null when the selection is elsewhere). */
export const getOffsets = (root: HTMLElement): { start: number; end: number } | null => {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const r = sel.getRangeAt(0);
  if (!root.contains(r.startContainer) || !root.contains(r.endContainer)) return null;
  const start = offsetOf(root, r.startContainer, r.startOffset);
  const end = r.collapsed ? start : offsetOf(root, r.endContainer, r.endOffset);
  return { start: Math.min(start, end), end: Math.max(start, end) };
};

/** DOM position of a character offset inside root. */
const pointAt = (root: HTMLElement, target: number): [Node, number] => {
  let pos = 0;
  let result: [Node, number] | null = null;
  const visit = (node: Node): boolean => {
    if (node.nodeType === Node.TEXT_NODE) {
      const len = (node.nodeValue ?? '').length;
      if (target <= pos + len) {
        result = [node, target - pos];
        return true;
      }
      pos += len;
      return false;
    }
    if ((node as HTMLElement).tagName === 'BR') {
      const parent = node.parentNode!;
      const idx = Array.prototype.indexOf.call(parent.childNodes, node) as number;
      if (target <= pos) {
        result = [parent, idx];
        return true;
      }
      pos += 1;
      if (target === pos) {
        result = [parent, idx + 1];
        return true;
      }
      return false;
    }
    for (const c of Array.from(node.childNodes)) if (visit(c)) return true;
    return false;
  };
  visit(root);
  return result ?? [root, root.childNodes.length];
};

/** Puts the selection at character offsets inside root. */
export const setOffsets = (root: HTMLElement, start: number, end = start) => {
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  const [sn, so] = pointAt(root, start);
  const [en, eo] = end === start ? [sn, so] : pointAt(root, end);
  try {
    range.setStart(sn, so);
    range.setEnd(en, eo);
  } catch {
    range.selectNodeContents(root);
    range.collapse(false);
  }
  sel.removeAllRanges();
  sel.addRange(range);
};
