import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { Copy, Eye, EyeOff } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { pagesPrivacyTools } from '@/i18n/pagesPrivacyTools';
import { api, errorCode } from '@/lib/api';
import { Modal } from '@/components/admin/Modal';

registerCopy(pagesPrivacyTools);

/** The server masks values as "•••• 3456" (lib/privacy/mask.ts on the server). */
export const isMaskedValue = (v: unknown): v is string => typeof v === 'string' && v.includes('•');

export type RevealEntity = 'user' | 'company' | 'agent' | 'invoiceSettings' | 'document' | 'insight' | 'familyMember';

const VISIBLE_SEC = 60;

/**
 * A sensitive value (passport number, IBAN, tax id …) as the API sent it. When it arrives masked, an eye
 * button asks for a reason, reveals the plaintext for 60 seconds (with a copy button) and masks it again.
 * Plain values are shown as they are.
 */
export const SensitiveValue = ({
  value,
  entity,
  id,
  field,
  className,
  empty = '—',
}: {
  value: string | null | undefined;
  entity: RevealEntity;
  id: string;
  field: string;
  className?: string;
  empty?: string;
}) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [plain, setPlain] = useState<string | null>(null);
  const [left, setLeft] = useState(0);
  const reasonId = useId();

  useEffect(() => {
    if (plain === null) return;
    setLeft(VISIBLE_SEC);
    const started = Date.now();
    const timer = window.setInterval(() => {
      const rest = VISIBLE_SEC - Math.floor((Date.now() - started) / 1000);
      if (rest <= 0) {
        setPlain(null);
        window.clearInterval(timer);
      } else setLeft(rest);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [plain]);

  if (!value) return <span className={className}>{empty}</span>;
  const fieldLabel = t(`privacyTools.sensitive.fields.${field}`, { defaultValue: field });
  if (!isMaskedValue(value)) return <span className={className}>{value}</span>;

  const reveal = async () => {
    if (reason.trim().length < 5) return;
    setBusy(true);
    try {
      const { data } = await api.post<{ value: string | null }>('/admin/reveal', { entity, id, field, reason: reason.trim() });
      setOpen(false);
      setReason('');
      if (data.value) setPlain(data.value);
      else toast.info(t('privacyTools.sensitive.empty'));
    } catch (err) {
      toast.error(t('privacyTools.sensitive.error'), { description: errorCode(err) });
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!plain) return;
    try {
      await navigator.clipboard.writeText(plain);
      toast.success(t('privacyTools.sensitive.copied'));
    } catch {
      // Clipboard blocked (insecure context): the value stays visible for manual copying.
    }
  };

  return (
    <span className={clsx('inline-flex flex-wrap items-center gap-1', className)}>
      {plain !== null ? (
        <>
          <span className="font-mono select-all">{plain}</span>
          <button type="button" onClick={() => void copy()} className="inline-flex size-7 items-center justify-center rounded-md text-link hover:bg-primary/[0.06]" title={t('privacyTools.sensitive.copy')} aria-label={t('privacyTools.sensitive.copy')}>
            <Copy className="size-3.5" aria-hidden />
          </button>
          <button type="button" onClick={() => setPlain(null)} className="inline-flex size-7 items-center justify-center rounded-md text-muted hover:bg-sunken" title={t('privacyTools.sensitive.hide')} aria-label={t('privacyTools.sensitive.hide')}>
            <EyeOff className="size-3.5" aria-hidden />
          </button>
          <span className="text-[11px] text-muted tabular-nums">{t('privacyTools.sensitive.visibleFor', { s: left })}</span>
        </>
      ) : (
        <>
          <span className="font-mono" title={t('privacyTools.sensitive.masked')}>
            {value}
          </span>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex size-7 items-center justify-center rounded-md text-link hover:bg-primary/[0.06]"
            title={t('privacyTools.sensitive.reveal')}
            aria-label={t('privacyTools.sensitive.revealAria', { field: fieldLabel })}
          >
            <Eye className="size-3.5" aria-hidden />
          </button>
        </>
      )}
      <Modal
        open={open}
        onClose={() => !busy && setOpen(false)}
        title={`${t('privacyTools.sensitive.revealTitle')}: ${fieldLabel}`}
        description={t('privacyTools.sensitive.revealIntro')}
        size="sm"
        footer={
          <>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setOpen(false)} disabled={busy}>
              {t('privacyTools.sensitive.cancel')}
            </button>
            <button type="button" className="btn-primary btn-sm" disabled={busy || reason.trim().length < 5} onClick={() => void reveal()}>
              <Eye className="size-4" aria-hidden /> {t('privacyTools.sensitive.confirm')}
            </button>
          </>
        }
      >
        <label htmlFor={reasonId} className="label">
          {t('privacyTools.sensitive.reason')}
        </label>
        <input
          id={reasonId}
          className="input"
          value={reason}
          maxLength={500}
          autoFocus
          placeholder={t('privacyTools.sensitive.reasonPlaceholder')}
          onChange={(e) => setReason(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void reveal();
            }
          }}
        />
        <p className="mt-1 text-xs text-muted">{t('privacyTools.sensitive.reasonHint')}</p>
      </Modal>
    </span>
  );
};
