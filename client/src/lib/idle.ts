type IdleWindow = Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number };

/** Runs `fn` when the browser is idle (falls back to a timeout where requestIdleCallback is missing, e.g. Safari). */
export const whenIdle = (fn: () => void, timeout = 2000) => {
  const w = window as IdleWindow;
  if (w.requestIdleCallback) w.requestIdleCallback(fn, { timeout });
  else window.setTimeout(fn, Math.min(timeout, 1200));
};

/** Whether this device should get heavy decorative effects (WebGL globe etc.). */
export const canAffordHeavyEffects = () => {
  const nav = navigator as Navigator & { connection?: { saveData?: boolean }; deviceMemory?: number };
  if (nav.connection?.saveData) return false;
  if (nav.deviceMemory !== undefined && nav.deviceMemory < 4) return false;
  if ((nav.hardwareConcurrency ?? 8) < 4) return false;
  return window.matchMedia('(min-width: 768px)').matches;
};
