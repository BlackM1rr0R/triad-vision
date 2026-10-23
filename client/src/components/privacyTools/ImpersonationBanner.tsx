import { useEffect, useState, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Eye, LogOut } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { pagesPrivacyTools } from '@/i18n/pagesPrivacyTools';
import { api, getImpersonation, onImpersonationEnded, onReadOnlyBlocked, setImpersonation, subscribeImpersonation } from '@/lib/api';
import { useAuth } from '@/lib/auth';

registerCopy(pagesPrivacyTools);

/** The running "view as client" session (null when the admin is not viewing a client's portal). */
export const useImpersonation = () => useSyncExternalStore(subscribeImpersonation, getImpersonation, getImpersonation);

const READ_ONLY_TOAST = 'impersonation-read-only';

/** Drops every cached private query and reloads /auth/me (the admin is the admin again). */
const useLeave = () => {
  const qc = useQueryClient();
  const navigate = useNavigate();
  return async (returnTo: string | null) => {
    setImpersonation(null);
    qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
    await qc.refetchQueries({ queryKey: ['me'] });
    navigate(returnTo && returnTo.startsWith('/admin') ? returnTo : '/admin', { replace: true });
  };
};

/**
 * Persistent amber bar while an admin views a client's portal (read-only). It cannot be dismissed; "Exit"
 * ends the view and goes back to the admin page it was started from. Also blocks every form submit and
 * shows the read-only toast for writes stopped in the API helper.
 */
export const ImpersonationBanner = () => {
  const { t } = useTranslation();
  const imp = useImpersonation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const leave = useLeave();
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    onReadOnlyBlocked(() => toast.warning(t('privacyTools.imp.readOnly'), { id: READ_ONLY_TOAST }));
    onImpersonationEnded(() => {
      toast.info(t('privacyTools.imp.ended'));
      setImpersonation(null);
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
      void qc.refetchQueries({ queryKey: ['me'] });
    });
    return () => {
      onReadOnlyBlocked(null);
      onImpersonationEnded(null);
    };
  }, [t, qc]);

  const active = !!imp;
  useEffect(() => {
    if (!active) return;
    document.documentElement.dataset.impersonating = '1';
    // No form leaves the page while viewing (buttons that call the API are stopped in lib/api.ts).
    const onSubmit = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      toast.warning(t('privacyTools.imp.readOnly'), { id: READ_ONLY_TOAST });
    };
    document.addEventListener('submit', onSubmit, true);
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => {
      delete document.documentElement.dataset.impersonating;
      document.removeEventListener('submit', onSubmit, true);
      window.clearInterval(timer);
    };
  }, [active, t]);

  // The server ends the view after 30 minutes; refresh /auth/me then so the bar disappears.
  const expiresAt = imp ? new Date(imp.expiresAt).getTime() : 0;
  useEffect(() => {
    if (!expiresAt) return;
    const ms = Math.max(1000, expiresAt - Date.now() + 1000);
    const timer = window.setTimeout(() => void qc.refetchQueries({ queryKey: ['me'] }), ms);
    return () => window.clearTimeout(timer);
  }, [expiresAt, qc]);

  if (!imp || !user) return null;
  const minutes = Math.max(0, Math.ceil((expiresAt - now) / 60_000));
  const name = `${user.firstName} ${user.lastName}`.trim();

  const exit = async () => {
    setBusy(true);
    try {
      const { data } = await api.post<{ ok: boolean; returnTo: string | null }>('/admin/impersonate/stop');
      await leave(data.returnTo ?? imp.returnTo);
    } catch {
      await leave(imp.returnTo);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {/* The site header is fixed at the top: move it (and the page) below the bar. */}
      <style>{`html[data-impersonating] body{padding-top:var(--imp-bar-h)}html[data-impersonating] .fixed.inset-x-0.top-0{top:var(--imp-bar-h)}:root{--imp-bar-h:2.75rem}@media (max-width:639px){:root{--imp-bar-h:3.5rem}}`}</style>
      <div
        role="status"
        aria-live="polite"
        className="fixed inset-x-0 top-0 z-[95] flex h-[var(--imp-bar-h)] items-center gap-2 px-4 text-sm font-semibold shadow-md sm:gap-3"
        style={{ background: 'var(--imp-bg, #f59e0b)', color: 'var(--imp-fg, #1f1402)' }}
      >
        <Eye className="size-4 shrink-0" aria-hidden />
        <p className="min-w-0 flex-1 leading-tight">
          <span className="line-clamp-2">{t('privacyTools.imp.banner', { name })}</span>
          <span className="hidden text-xs font-medium opacity-80 sm:inline"> · {t('privacyTools.imp.remaining', { min: minutes })}</span>
        </p>
        <button
          type="button"
          onClick={() => void exit()}
          disabled={busy}
          className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-md border border-current/30 bg-white/80 px-3 text-xs font-bold text-[#1f1402] transition hover:bg-white disabled:opacity-60"
        >
          <LogOut className="size-3.5" aria-hidden /> {t('privacyTools.imp.exit')}
        </button>
      </div>
    </>
  );
};
