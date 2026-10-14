import { useSyncExternalStore } from 'react';

/**
 * Read-aloud mode built on the Web Speech API (speechSynthesis). Module-level controller so the
 * hover/focus listeners run outside React; a tiny store exposes the status to the panel.
 */

export type SpeechStatus = 'idle' | 'reading' | 'paused';

interface SpeechState {
  status: SpeechStatus;
  /** First characters of the text being read, for the "now reading" line. */
  current: string;
  /** True when no voice matches the UI language and a fallback is used. */
  fallbackVoice: boolean;
}

export const speechSupported = typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;

let state: SpeechState = { status: 'idle', current: '', fallbackVoice: false };
const listeners = new Set<() => void>();
const set = (patch: Partial<SpeechState>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
export const useSpeechState = () => useSyncExternalStore(subscribe, () => state, () => state);

// ─── Voice selection ────────────────────────────────────────────────────────

/** Preferred voice languages per UI language; Azerbaijani has no voice in most browsers. */
const FALLBACKS: Record<string, string[]> = {
  az: ['az', 'tr', 'en'],
  de: ['de', 'en'],
  en: ['en'],
  ru: ['ru', 'en'],
};

let voices: SpeechSynthesisVoice[] = [];
const loadVoices = () => {
  if (!speechSupported) return;
  voices = window.speechSynthesis.getVoices();
};
if (speechSupported) {
  loadVoices();
  window.speechSynthesis.addEventListener?.('voiceschanged', loadVoices);
}

const pickVoice = (lang: string): { voice: SpeechSynthesisVoice | null; lang: string; fallback: boolean } => {
  if (!voices.length) loadVoices();
  const order = FALLBACKS[lang] ?? [lang, 'en'];
  for (const l of order) {
    const match = voices.filter((v) => v.lang.toLowerCase().startsWith(l));
    if (match.length) {
      const v = match.find((m) => m.default) ?? match.find((m) => m.localService) ?? match[0];
      return { voice: v, lang: v.lang, fallback: l !== lang };
    }
  }
  return { voice: null, lang: order[1] ?? 'en', fallback: lang !== 'en' };
};

// ─── Speaking ───────────────────────────────────────────────────────────────

let rate = 1;
let uiLang = 'az';
let highlighted: Element | null = null;
let queue: { el: Element | null; text: string }[] = [];
let queueActive = false;

const highlight = (el: Element | null) => {
  highlighted?.classList.remove('a11y-reading');
  highlighted = el;
  el?.classList.add('a11y-reading');
};

const clear = () => {
  highlight(null);
  queue = [];
  queueActive = false;
  set({ status: 'idle', current: '' });
};

const utter = (text: string, el: Element | null, onEnd?: () => void) => {
  const u = new SpeechSynthesisUtterance(text);
  const { voice, lang, fallback } = pickVoice(uiLang);
  if (voice) u.voice = voice;
  u.lang = lang;
  u.rate = rate;
  u.onstart = () => {
    highlight(el);
    set({ status: 'reading', current: text.slice(0, 90), fallbackVoice: fallback });
  };
  u.onend = () => {
    if (onEnd) onEnd();
    else clear();
  };
  u.onerror = (e) => {
    if (e.error === 'interrupted' || e.error === 'canceled') return; // we cancelled it ourselves
    if (onEnd) onEnd();
    else clear();
  };
  window.speechSynthesis.speak(u);
};

/** Reads one text, interrupting anything else. */
export const speak = (text: string, el: Element | null = null) => {
  if (!speechSupported) return;
  const t = text.replace(/\s+/g, ' ').trim();
  if (!t) return;
  window.speechSynthesis.cancel();
  queue = [];
  queueActive = false;
  utter(t.slice(0, 1200), el);
};

export const stop = () => {
  if (!speechSupported) return;
  window.speechSynthesis.cancel();
  clear();
};

export const pause = () => {
  if (!speechSupported || state.status !== 'reading') return;
  window.speechSynthesis.pause();
  set({ status: 'paused' });
};

export const resume = () => {
  if (!speechSupported || state.status !== 'paused') return;
  window.speechSynthesis.resume();
  set({ status: 'reading' });
};

export const setRate = (r: number) => {
  rate = r;
};
export const setLang = (l: string) => {
  uiLang = l.slice(0, 2);
};

const runQueue = () => {
  const next = queue.shift();
  if (!next) {
    clear();
    return;
  }
  next.el?.scrollIntoView?.({ block: 'center', behavior: 'auto' });
  utter(next.text, next.el, runQueue);
};

const BLOCKS = 'h1,h2,h3,h4,h5,h6,p,li,blockquote,dt,dd,figcaption,th,td,summary,label';

const visible = (el: Element) => {
  const r = el.getClientRects();
  if (!r.length) return false;
  const cs = getComputedStyle(el);
  return cs.visibility !== 'hidden' && cs.display !== 'none';
};

/** Reads the main content block by block (one utterance per block: Chrome stops long utterances). */
export const readPage = (root: Element | null) => {
  if (!speechSupported || !root) return;
  window.speechSynthesis.cancel();
  const all = Array.from(root.querySelectorAll(BLOCKS)).filter((el) => !el.closest('[data-a11y-widget],[aria-hidden="true"]') && visible(el));
  // keep the outermost blocks only (an <li> that contains <p>s is read once)
  const outer = all.filter((el) => !all.some((o) => o !== el && o.contains(el)));
  queue = outer
    .map((el) => ({ el, text: ((el as HTMLElement).innerText ?? el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 1200) }))
    .filter((x) => x.text.length > 1);
  queueActive = true;
  runQueue();
};

// ─── Hover / focus reading ──────────────────────────────────────────────────

const READABLE = 'h1,h2,h3,h4,h5,h6,p,a,button,li,label,summary,th,td,dt,dd,figcaption,blockquote,[role="button"],input,textarea,select,option';

const textOf = (el: Element): string => {
  const h = el as HTMLElement;
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
    const label = el.id ? document.querySelector<HTMLElement>(`label[for="${el.id}"]`)?.innerText : el.closest('label')?.textContent;
    return [label, el.getAttribute('aria-label'), el.getAttribute('placeholder'), el.value].filter(Boolean).join('. ');
  }
  const aria = el.getAttribute('aria-label');
  const text = (h.innerText ?? el.textContent ?? '').trim();
  return text || aria || el.getAttribute('title') || '';
};

let hoverTimer = 0;
let lastEl: Element | null = null;

const target = (t: EventTarget | null): Element | null => {
  const el = (t as Element | null)?.closest?.(READABLE) ?? null;
  if (!el || el.closest('[data-a11y-widget]')) return null;
  return el;
};

const onMouseOver = (e: MouseEvent) => {
  const el = target(e.target);
  window.clearTimeout(hoverTimer);
  if (!el || el === lastEl || queueActive) return;
  hoverTimer = window.setTimeout(() => {
    lastEl = el;
    speak(textOf(el), el);
  }, 300);
};
const onMouseOut = () => window.clearTimeout(hoverTimer);
const onFocusIn = (e: FocusEvent) => {
  const el = target(e.target);
  if (!el || queueActive) return;
  window.clearTimeout(hoverTimer);
  lastEl = el;
  speak(textOf(el), el);
};

let listening = false;
/** Turns hover/focus reading on or off. */
export const setHoverReading = (on: boolean) => {
  if (!speechSupported || listening === on) return;
  listening = on;
  if (on) {
    document.addEventListener('mouseover', onMouseOver, true);
    document.addEventListener('mouseout', onMouseOut, true);
    document.addEventListener('focusin', onFocusIn, true);
  } else {
    document.removeEventListener('mouseover', onMouseOver, true);
    document.removeEventListener('mouseout', onMouseOut, true);
    document.removeEventListener('focusin', onFocusIn, true);
    window.clearTimeout(hoverTimer);
    lastEl = null;
    stop();
  }
};

/** True when the UI language has no matching voice (hint shown in the panel). */
export const voiceIsFallback = (lang: string) => pickVoice(lang.slice(0, 2)).fallback;
