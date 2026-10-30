import { Navigate, useParams } from 'react-router-dom';
import { captureRefFromUrl, normaliseRef } from '@/lib/referralCookie';

/**
 * /p/:code — a referral partner's short sign-up link. Keeps the code in the 60-day referral cookie (so a
 * later inquiry or booking is attributed too) and opens the sign-up form with it.
 */
export default function PartnerLink() {
  const code = normaliseRef(useParams().code);
  if (!code) return <Navigate to="/register" replace />;
  captureRefFromUrl(`?ref=${encodeURIComponent(code)}`);
  return <Navigate to={`/register?ref=${encodeURIComponent(code)}`} replace />;
}
