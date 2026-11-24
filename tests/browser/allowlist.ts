/**
 * console.error messages that are expected noise, not app bugs. Keep this list short and explain every entry:
 * a new entry hides a whole class of messages in every test.
 */
const ALLOWED: { re: RegExp; why: string }[] = [
  {
    // Chrome logs every non-2xx response and every aborted request as "Failed to load resource". 4xx answers are part
    // of normal flows (401 before login, 404 for optional data) and the fixtures block every third-party origin.
    // 5xx answers are still caught separately (fixtures.ts, "response" listener).
    re: /^Failed to load resource/,
    why: 'network status noise; 5xx are reported by the response listener',
  },
  {
    // EventSource (live updates) is cut when a test navigates or the context closes.
    re: /EventSource|net::ERR_ABORTED|net::ERR_BLOCKED_BY_CLIENT/,
    why: 'aborted live-update stream / blocked third-party request',
  },
  {
    // Playwright's addInitScript (fixtures: language, cookie consent, tours off) is injected into every frame, also the
    // sandboxed mail iframe (no allow-scripts by design), where Chrome blocks it and logs this.
    re: /Blocked script execution in 'about:srcdoc' because the document's frame is sandboxed/,
    why: 'test init script in the sandboxed mail frame',
  },
];

export const isAllowedConsoleError = (text: string) => ALLOWED.some((a) => a.re.test(text));
