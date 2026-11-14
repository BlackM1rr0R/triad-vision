import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { LucideIcon } from 'lucide-react';
import { BookOpen, ChevronRight, Gift, Home, ListChecks, PartyPopper, PlaneLanding } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button, buttonClass } from '@/components/ui/Button';
import { Success } from '@/components/illustrations';
import { celebrateOnce } from '@/components/motion/celebrate';
import { useOverview } from '@/components/portal/useOverview';
import { useAuth } from '@/lib/auth';
import { getImpersonation } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesPortalMoments } from '@/i18n/pagesPortalMoments';
import { caseToCelebrate } from './celebration';

registerCopy(pagesPortalMoments);

const seenKey = (caseId: string) => `tv_approved_screen:${caseId}`;

const wasSeen = (caseId: string) => {
  try {
    return localStorage.getItem(seenKey(caseId)) === '1';
  } catch {
    return true; // without storage we cannot keep it one-time: rather never than on every visit
  }
};
const markSeen = (caseId: string) => {
  try {
    localStorage.setItem(seenKey(caseId), '1');
  } catch {
    // ignore
  }
};


const STEPS: { key: 'arrival' | 'housing' | 'onboarding' | 'german'; to: string; icon: LucideIcon }[] = [
  { key: 'arrival', to: '/account/arrival', icon: PlaneLanding },
  { key: 'housing', to: '/account/housing', icon: Home },
  { key: 'onboarding', to: '/account/onboarding', icon: ListChecks },
  { key: 'german', to: '/account/german', icon: BookOpen },
];

/**
 * Visa approved: a one-time celebration screen (per case and device) — confetti (skipped with reduced motion),
 * congratulations, the next steps for the arrival and "Invite a friend" (referral programme). Mounted once in
 * the portal layout, so it greets the client on whichever portal page they open first after the decision.
 * Staff looking at the portal as the client (impersonation) never use it up.
 */
export function ApprovedCelebration() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isClient = user?.role === 'CLIENT' && getImpersonation() === null;
  const { data } = useOverview(!!user && user.role === 'CLIENT');
  const [shown, setShown] = useState<{ id: string; number: string } | null>(null);

  const target = isClient && data ? caseToCelebrate(data.cases) : null;
  const targetId = target?.id ?? null;
  const targetNumber = target?.number ?? '';
  useEffect(() => {
    if (!targetId || wasSeen(targetId)) return;
    markSeen(targetId);
    setShown({ id: targetId, number: targetNumber });
  }, [targetId, targetNumber]);
  // Same key as the case page's burst, so the confetti never plays twice for one approval (no-op for reduced motion).
  const shownId = shown?.id ?? null;
  useEffect(() => {
    if (!shownId) return;
    const timer = window.setTimeout(() => celebrateOnce(`visa-approved:${shownId}`, { count: 120 }), 350);
    return () => window.clearTimeout(timer);
  }, [shownId]);

  if (!shown) return null;
  const close = () => setShown(null);

  return (
    <Modal
      open
      onClose={close}
      size="md"
      eyebrow={t('pmom.approved.eyebrow')}
      title={t('pmom.approved.title')}
      icon={
        <span className="grid size-11 place-items-center rounded-xl bg-success-bg text-success-fg">
          <PartyPopper className="size-5" aria-hidden />
        </span>
      }
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            {t('pmom.approved.close')}
          </Button>
          <Link to="/account/arrival" className={buttonClass({ className: 'w-full sm:w-auto' })} onClick={close} data-autofocus>
            {t('pmom.approved.plan')}
          </Link>
        </>
      }
    >
      <div className="space-y-5">
        <div className="flex items-center gap-4">
          <Success className="hidden w-28 shrink-0 sm:block" />
          <p className="text-ink/85">{t('pmom.approved.text', { number: shown.number })}</p>
        </div>

        <section aria-labelledby="approved-next-title">
          <h3 id="approved-next-title" className="type-overline text-muted">
            {t('pmom.approved.nextTitle')}
          </h3>
          <ul className="mt-2 divide-y divide-line rounded-2xl border border-line bg-card">
            {STEPS.map(({ key, to, icon: Icon }) => (
              <li key={key}>
                <Link to={to} onClick={close} className="group flex min-h-12 items-center gap-3 px-3 py-2.5 outline-none hover:bg-sunken focus-visible:bg-sunken">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg chip-soft">
                    <Icon className="size-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-ink">{t(`pmom.approved.steps.${key}.title`)}</span>
                    <span className="block text-xs text-muted">{t(`pmom.approved.steps.${key}.text`)}</span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="flex flex-col gap-3 rounded-2xl border border-highlight/40 bg-highlight-bg p-4 sm:flex-row sm:items-center" aria-labelledby="approved-invite-title">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-card text-ink">
            <Gift className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h3 id="approved-invite-title" className="text-sm font-semibold text-ink">
              {t('pmom.approved.inviteTitle')}
            </h3>
            <p className="text-xs text-ink/75">{t('pmom.approved.inviteText')}</p>
          </div>
          <Link to="/account/referral" onClick={close} className={buttonClass({ variant: 'secondary', size: 'sm', className: 'w-full sm:w-auto' })}>
            {t('pmom.approved.invite')}
          </Link>
        </section>
      </div>
    </Modal>
  );
}
