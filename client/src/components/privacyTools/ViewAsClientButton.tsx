import { useId, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { Eye } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { pagesPrivacyTools } from '@/i18n/pagesPrivacyTools';
import { api, errorCode } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { hasMinRole, type Role } from '@/lib/types';
import { Modal } from '@/components/admin/Modal';

registerCopy(pagesPrivacyTools);

const REASONS = ['SUPPORT_REQUEST', 'BUG_CHECK', 'OTHER'] as const;
type Reason = (typeof REASONS)[number];
const KNOWN_ERRORS = ['NOT_IMPERSONATABLE', 'USER_INACTIVE', 'WEB_SESSION_REQUIRED', 'COMPANY_MISSING'];

/** Path + query of the admin page, as far as the server accepts it for the way back. */
const returnPath = (pathname: string, search: string) => {
  const full = `${pathname}${search}`;
  return /^\/admin(\/[\w\-./?=&%]*)?$/.test(full) ? full.slice(0, 300) : pathname.slice(0, 300);
};

/**
 * "Müştəri kimi bax": opens a CLIENT's / COMPANY user's portal read-only in this tab (ADMIN+ only, so it
 * renders nothing for staff and for other roles). A reason is asked first; the view lasts 30 minutes.
 */
export const ViewAsClientButton = ({
  user,
  className,
  compact,
}: {
  user: { id: string; role: Role; firstName: string; lastName: string; isActive?: boolean };
  className?: string;
  compact?: boolean;
}) => {
  const { t } = useTranslation();
  const { user: me } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<Reason>('SUPPORT_REQUEST');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const ids = { reason: useId(), note: useId() };

  if (!hasMinRole(me?.role, 'ADMIN') || (user.role !== 'CLIENT' && user.role !== 'COMPANY') || user.isActive === false) return null;
  const name = `${user.firstName} ${user.lastName}`.trim();
  const noteMissing = reason === 'OTHER' && note.trim().length < 3;

  const start = async () => {
    if (noteMissing) return;
    setBusy(true);
    try {
      const { data } = await api.post<{ landing: string }>(`/admin/impersonate/${user.id}`, {
        reason,
        note: note.trim() || null,
        returnTo: returnPath(location.pathname, location.search),
      });
      setOpen(false);
      // The admin's cached data must not leak into the client view (and vice versa).
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
      await qc.refetchQueries({ queryKey: ['me'] });
      navigate(data.landing, { replace: false });
    } catch (err) {
      const code = errorCode(err);
      toast.error(t(KNOWN_ERRORS.includes(code) ? `privacyTools.imp.errors.${code}` : 'privacyTools.imp.errors.generic'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={t('privacyTools.imp.buttonTitle')}
        className={clsx(
          'inline-flex items-center gap-1.5 rounded-md border border-warning-border bg-warning-bg px-2.5 text-xs font-semibold whitespace-nowrap text-warning-fg transition hover:bg-warning-bg',
          compact ? 'min-h-8 py-1' : 'min-h-9 py-1.5',
          className,
        )}
      >
        <Eye className="size-3.5" aria-hidden /> {t('privacyTools.imp.button')}
      </button>
      <Modal
        open={open}
        onClose={() => !busy && setOpen(false)}
        title={t('privacyTools.imp.dialogTitle', { name })}
        description={t('privacyTools.imp.dialogIntro')}
        size="sm"
        footer={
          <>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setOpen(false)} disabled={busy}>
              {t('privacyTools.imp.cancel')}
            </button>
            <button type="button" className="btn-primary btn-sm" onClick={() => void start()} disabled={busy || noteMissing}>
              <Eye className="size-4" aria-hidden /> {t('privacyTools.imp.start')}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label htmlFor={ids.reason} className="label">
              {t('privacyTools.imp.reason')}
            </label>
            <select id={ids.reason} className="input" value={reason} onChange={(e) => setReason(e.target.value as Reason)}>
              {REASONS.map((r) => (
                <option key={r} value={r}>
                  {t(`privacyTools.imp.reasons.${r}`)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={ids.note} className="label">
              {t('privacyTools.imp.note')}
            </label>
            <textarea
              id={ids.note}
              className="input min-h-20"
              maxLength={500}
              value={note}
              placeholder={t('privacyTools.imp.notePlaceholder')}
              onChange={(e) => setNote(e.target.value)}
              aria-invalid={noteMissing || undefined}
            />
            {noteMissing && <p className="mt-1 text-xs text-danger-fg">{t('privacyTools.imp.noteRequired')}</p>}
          </div>
        </div>
      </Modal>
    </>
  );
};
