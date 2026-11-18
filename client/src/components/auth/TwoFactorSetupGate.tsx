import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { LogOut, ShieldCheck } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { pagesPartnerAccess } from '@/i18n/pagesPartnerAccess';
import { useAuth } from '@/lib/auth';
import { useBrand } from '@/lib/brand';
import { Spinner } from '@/components/ui/Spinner';
import { EmailOtpCard } from './EmailOtpCard';
import { VerifyBanner } from './VerifyBanner'; // unverified e-mail: the set-up needs it, so the resend link is offered here

registerCopy(pagesPartnerAccess);

/**
 * Shown instead of a portal (client, employer, partner) when the Access Center requires two-step login for this
 * account and none is set up yet (server: lib/loginSecurity — the user is never locked out, the portal API answers
 * 403 TWO_FACTOR_ENROLLMENT_REQUIRED until a factor exists). The e-mail code is the factor offered here.
 */
export default function TwoFactorSetupGate() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const brand = useBrand();
  const [busy, setBusy] = useState(false);

  const recheck = async () => {
    setBusy(true);
    try {
      await qc.invalidateQueries({ queryKey: ['me'] });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-canvas pt-24 pb-16 sm:pt-28">
      <div className="container-x max-w-2xl space-y-5">
        <div className="rounded-3xl border border-line bg-card p-5 shadow-[var(--tv-shadow-card)] sm:p-7">
          <div className="flex items-start gap-4">
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-accent-bg text-accent-fg">
              <ShieldCheck className="size-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <h1 className="type-section-title text-ink">{t('loginSecurityGate.title')}</h1>
              <p className="mt-1 text-sm text-muted">{t('loginSecurityGate.text')}</p>
            </div>
          </div>
        </div>
        {/* The e-mail code needs a confirmed address: without this the only "send the link again" was right after sign-up. */}
        <VerifyBanner />
        <EmailOtpCard />
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn-primary" onClick={recheck} disabled={busy}>
            {busy && <Spinner className="size-4" />} {t('loginSecurityGate.done')}
          </button>
          <button
            type="button"
            className="btn-ghost"
            onClick={async () => {
              await logout();
              navigate('/login', { replace: true });
            }}
          >
            <LogOut className="size-4" aria-hidden /> {t('loginSecurityGate.logout')}
          </button>
        </div>
        <p className="text-xs text-muted">{t('loginSecurityGate.help', { phone: brand.phone })}</p>
      </div>
    </div>
  );
}
