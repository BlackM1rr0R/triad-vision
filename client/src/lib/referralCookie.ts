/**
 * First-party referral attribution: `?ref=CODE` on any page is kept for 60 days in the cookie `tv_ref`
 * (no third parties, documented in the privacy policy's cookie section). The register form sends it and
 * the server also reads it; agent codes and client "bring a friend" codes share the same parameter.
 * Also: `/register?visa=<slug>` remembers the chosen visa category for the "start your application" card.
 */
export const REF_COOKIE = 'tv_ref';
/** Public vacancy API apply links (`?src=<key prefix>`): which partner key an application came through. */
export const SRC_COOKIE = 'tv_src';
const REF_DAYS = 60;
const VISA_KEY = 'tv_visa';

export const normaliseRef = (v: string | null | undefined) => (v ?? '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 32);

export const readRefCookie = () => {
  try {
    const m = document.cookie.match(/(?:^|;\s*)tv_ref=([^;]*)/);
    return m ? normaliseRef(decodeURIComponent(m[1])) : '';
  } catch {
    return '';
  }
};

export const clearRefCookie = () => {
  try {
    document.cookie = `${REF_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`;
  } catch {
    // cookies blocked
  }
};

/** Stores `?ref=` (or a partner's `?p=`) from the current URL (call once at start-up). */
export const captureRefFromUrl = (search = window.location.search) => {
  try {
    const params = new URLSearchParams(search);
    // ?p=CODE is the referral partner's link (/p/CODE redirects to /register?ref=CODE); same cookie.
    const code = normaliseRef(params.get('ref') ?? params.get('p'));
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    // ?src=tvp_xxxxxxxx: apply link of a partner's public vacancy API key (/developers); the apply route records it.
    const src = params.get('src') ?? '';
    if (/^tvp_[A-Za-z0-9_-]{8}$/.test(src)) document.cookie = `${SRC_COOKIE}=${src}; Max-Age=${REF_DAYS * 24 * 60 * 60}; Path=/; SameSite=Lax${secure}`;
    if (!code) return;
    document.cookie = `${REF_COOKIE}=${encodeURIComponent(code)}; Max-Age=${REF_DAYS * 24 * 60 * 60}; Path=/; SameSite=Lax${secure}`;
  } catch {
    // cookies blocked: the register page still reads ?ref= from its own URL
  }
};

/** The remembered visa choice lasts this long (also across tabs: the verification link opens a new one). */
export const VISA_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const normaliseVisa = (slug: string | null | undefined) => (slug ?? '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 120);

/** Pure: the stored visa choice ({"s":slug,"at":ms}) if still fresh, else ''. */
export const parseRememberedVisa = (raw: string | null | undefined, now = Date.now()): string => {
  if (!raw) return '';
  try {
    const v = JSON.parse(raw) as { s?: unknown; at?: unknown };
    if (typeof v.s !== 'string' || typeof v.at !== 'number' || now - v.at > VISA_TTL_MS || v.at - now > 60_000) return '';
    return normaliseVisa(v.s);
  } catch {
    return '';
  }
};

export const rememberVisa = (slug: string | null) => {
  const s = normaliseVisa(slug);
  if (!s) return;
  try {
    localStorage.setItem(VISA_KEY, JSON.stringify({ s, at: Date.now() }));
  } catch {
    // storage unavailable
  }
};

/** The visa slug picked before registering (calculator / visa page), or ''. Kept until a case was started. */
export const rememberedVisa = () => {
  try {
    const fresh = parseRememberedVisa(localStorage.getItem(VISA_KEY));
    if (!fresh) localStorage.removeItem(VISA_KEY);
    // Older builds kept it for the tab only.
    return fresh || normaliseVisa(sessionStorage.getItem(VISA_KEY));
  } catch {
    return '';
  }
};

export const forgetVisa = () => {
  try {
    localStorage.removeItem(VISA_KEY);
    sessionStorage.removeItem(VISA_KEY);
  } catch {
    // storage unavailable
  }
};
