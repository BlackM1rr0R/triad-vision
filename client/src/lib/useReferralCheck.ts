import { useEffect, useState } from 'react';
import { api } from './api';
import { normaliseRef } from './referralCookie';

export type ReferralKind = 'AGENT' | 'CLIENT' | 'PARTNER';
export type ReferralState = 'empty' | 'checking' | 'valid' | 'invalid' | 'unverified';

/**
 * Live check of an optional "Referral code" field (GET /api/auth/referral-code, rate-limited, debounced
 * 350 ms). `unverified`: the check itself failed (network / rate limit) — the form may still be sent, the
 * server checks the code again.
 */
export const useReferralCheck = (raw: string) => {
  const code = normaliseRef(raw);
  const [check, setCheck] = useState<{ code: string; kind: ReferralKind | null; partnerName?: string; failed?: boolean } | null>(null);
  useEffect(() => {
    if (!code) return;
    let alive = true;
    const timer = window.setTimeout(() => {
      api
        .get<{ valid: boolean; kind: ReferralKind | null; partnerName?: string }>('/auth/referral-code', { params: { code } })
        .then(({ data }) => {
          if (alive) setCheck({ code, kind: data.kind, partnerName: data.partnerName });
        })
        .catch(() => {
          if (alive) setCheck({ code, kind: null, failed: true });
        });
    }, 350);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [code]);
  const state: ReferralState = !code ? 'empty' : check?.code !== code ? 'checking' : check.kind ? 'valid' : check.failed ? 'unverified' : 'invalid';
  return {
    code,
    state,
    kind: check?.code === code ? check.kind : null,
    /** After the server refused the code (REFERRAL_CODE_UNKNOWN). */
    markInvalid: () => setCheck({ code, kind: null }),
  };
};
