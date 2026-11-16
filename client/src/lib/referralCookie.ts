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

export const rememberVisa = (slug: string | null) => {
  const s = (slug ?? '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 120);
  if (!s) return;
  try {
    sessionStorage.setItem(VISA_KEY, s);
  } catch {
    // storage unavailable
  }
};

/** The visa slug picked before registering (calculator / visa page), or ''. */
export const rememberedVisa = () => {
  try {
    return sessionStorage.getItem(VISA_KEY) ?? '';
  } catch {
    return '';
  }
};

export const forgetVisa = () => {
  try {
    sessionStorage.removeItem(VISA_KEY);
  } catch {
    // storage unavailable
  }
};
