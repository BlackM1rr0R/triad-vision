import { useEffect, useState } from 'react';
import { AxiosError } from 'axios';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ShieldAlert } from 'lucide-react';
import { api, errorCode } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesAccess } from '@/i18n/pagesAccess';
import { Button, Field, Modal, Textarea } from '@/components/ui';

registerCopy(pagesAccess);

/**
 * Break-glass dialog: when the API answers 403 OUT_OF_SCOPE (lib/access: the case lies outside the staff
 * member's case scope) with a caseId, this host offers "Request emergency access". The reason (≥ 10 characters)
 * goes to POST /api/admin/access/break-glass; on success every query is refetched so the page loads. Mounted
 * once in the admin layout; the axios interceptor only listens, it never changes the response.
 */

const MIN_REASON = 10;
const HOURS = 8;
const EVENT = 'tv:out-of-scope';

let installed = false;
const installInterceptor = () => {
  if (installed) return;
  installed = true;
  api.interceptors.response.use(undefined, (err: unknown) => {
    if (err instanceof AxiosError && err.response?.status === 403) {
      const data = err.response.data as { error?: string; caseId?: string } | undefined;
      if (data?.error === 'OUT_OF_SCOPE' && data.caseId && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(EVENT, { detail: { caseId: data.caseId } }));
      }
    }
    return Promise.reject(err);
  });
};

export const BreakGlassHost = () => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [caseId, setCaseId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    installInterceptor();
    const onEvent = (e: Event) => {
      const id = (e as CustomEvent<{ caseId: string }>).detail?.caseId;
      if (id) setCaseId((cur) => cur ?? id); // one dialog at a time (a page may fire several requests)
    };
    window.addEventListener(EVENT, onEvent);
    return () => window.removeEventListener(EVENT, onEvent);
  }, []);

  const close = () => {
    setCaseId(null);
    setReason('');
  };

  const submit = async () => {
    if (!caseId || reason.trim().length < MIN_REASON) return;
    setBusy(true);
    try {
      const res = await api.post<{ hours: number }>('/admin/access/break-glass', { caseId, reason: reason.trim() });
      toast.success(t('breakGlass.granted', { hours: res.data.hours }));
      close();
      void qc.invalidateQueries();
    } catch (err) {
      toast.error(`${t('breakGlass.error')} (${errorCode(err)})`);
    } finally {
      setBusy(false);
    }
  };

  const tooShort = reason.trim().length < MIN_REASON;
  return (
    <Modal
      open={!!caseId}
      onClose={close}
      busy={busy}
      size="md"
      role="alertdialog"
      icon={<ShieldAlert className="size-6 text-amber-600 dark:text-amber-400" aria-hidden />}
      title={t('breakGlass.title')}
      description={t('breakGlass.body', { hours: HOURS })}
      as="form"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={busy}>
            {t('breakGlass.cancel')}
          </Button>
          <Button type="submit" variant="danger" loading={busy} disabled={tooShort}>
            {t('breakGlass.request')}
          </Button>
        </>
      }
    >
      <Field label={t('breakGlass.reason')} required>
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={2000} minLength={MIN_REASON} data-autofocus />
      </Field>
    </Modal>
  );
};
