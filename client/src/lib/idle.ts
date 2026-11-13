type IdleWindow = Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number };

/** Runs `fn` when the browser is idle (falls back to a timeout where requestIdleCallback is missing, e.g. Safari). */
export const whenIdle = (fn: () => void, timeout = 2000) => {
  const w = window as IdleWindow;
  if (w.requestIdleCallback) w.requestIdleCallback(fn, { timeout });
  else window.setTimeout(fn, Math.min(timeout, 1200));
};

/**
 * Runs `fn` once the page has loaded (window `load`: the page's images and files are in) and the browser is
 * idle. For work nobody needs for the first view — it must not compete with the Largest Contentful Paint.
 */
export const afterLoad = (fn: () => void, timeout = 3000) => {
  if (document.readyState === 'complete') whenIdle(fn, timeout);
  else window.addEventListener('load', () => whenIdle(fn, timeout), { once: true });
};
