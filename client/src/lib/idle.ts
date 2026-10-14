type IdleWindow = Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number };

/** Runs `fn` when the browser is idle (falls back to a timeout where requestIdleCallback is missing, e.g. Safari). */
export const whenIdle = (fn: () => void, timeout = 2000) => {
  const w = window as IdleWindow;
  if (w.requestIdleCallback) w.requestIdleCallback(fn, { timeout });
  else window.setTimeout(fn, Math.min(timeout, 1200));
};
