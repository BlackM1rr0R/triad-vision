import { useEffect, useId, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { Check, Copy, KeyRound } from 'lucide-react';
import i18n from '@/i18n';
import { errorCode } from '@/lib/api';
import { Spinner } from '@/components/ui/Spinner';
import { toLocalInput } from '@/components/admin/labels';

/** Shapes and widgets shared by Admin → Mailboxes and the workspace "Mailbox security" tab. */

export interface AutoReply {
  enabled: boolean;
  subject: string | null;
  text: string | null;
  fromDate: string | null;
  toDate: string | null;
}

export interface ServerSettings {
  imap: { host: string; port: number; security: string };
  smtp: { host: string; port: number; security: string };
}

/** Translated message for a mailbox API error. */
export const mailboxErrorText = (err: unknown) => {
  const code = errorCode(err);
  const key = `mailAdmin.errors.${code}`;
  return i18n.exists(key) ? i18n.t(key) : i18n.t('mailAdmin.errors.fallback');
};
export const toastMailboxError = (err: unknown) => toast.error(mailboxErrorText(err));

/** Same rule as the server: ≥ 10 characters with a letter and a digit. */
export const passwordOk = (p: string) => p.length >= 10 && p.length <= 128 && /\p{L}/u.test(p) && /\d/.test(p);

export const Field = ({ label, hint, children, htmlFor }: { label: string; hint?: ReactNode; children: ReactNode; htmlFor?: string }) => (
  <div>
    <label className="label" htmlFor={htmlFor}>
      {label}
    </label>
    {children}
    {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
  </div>
);

export const CopyButton = ({ value, className }: { value: string; className?: string }) => {
  const { t } = useTranslation();
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!done) return;
    const id = window.setTimeout(() => setDone(false), 1800);
    return () => window.clearTimeout(id);
  }, [done]);
  return (
    <button
      type="button"
      className={clsx('inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg border border-line px-3 text-xs font-semibold text-ink hover:bg-sunken', className)}
      onClick={() => {
        void navigator.clipboard?.writeText(value).then(
          () => setDone(true),
          () => toast.error(t('mailAdmin.errors.fallback')),
        );
      }}
    >
      {done ? <Check className="size-3.5 text-success-fg" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
      {done ? t('mailAdmin.actions.copied') : t('mailAdmin.actions.copy')}
    </button>
  );
};

/** A password shown exactly once, with a copy button. */
export const SecretOnce = ({ value, note }: { value: string; note?: string }) => (
  <div className="rounded-lg border border-warning-border bg-warning-bg p-3 text-warning-fg dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
    <div className="flex flex-wrap items-center gap-2">
      <KeyRound className="size-4 shrink-0" aria-hidden />
      <code className="min-w-0 flex-1 font-mono text-base font-semibold break-all select-all" data-testid="secret-once">
        {value}
      </code>
      <CopyButton value={value} className="bg-white/70 dark:bg-transparent" />
    </div>
    {note && <p className="mt-2 text-xs">{note}</p>}
  </div>
);

/** IMAP / SMTP settings for a mail app. */
export const ClientSettingsTable = ({ settings, address }: { settings: ServerSettings; address: string }) => {
  const { t } = useTranslation();
  const rows = [
    { title: t('mailAdmin.settings.incoming'), s: settings.imap },
    { title: t('mailAdmin.settings.outgoing'), s: settings.smtp },
  ];
  return (
    <div className="rounded-lg border border-line">
      <p className="border-b border-line px-3 py-2 text-xs font-bold tracking-wide text-muted uppercase">{t('mailAdmin.settings.title')}</p>
      <dl className="grid gap-3 p-3 text-sm sm:grid-cols-2">
        {rows.map((r) => (
          <div key={r.title}>
            <dt className="font-semibold text-ink">{r.title}</dt>
            <dd className="mt-1 space-y-0.5 text-muted">
              <div>
                {t('mailAdmin.settings.server')}: <span className="font-mono text-ink">{r.s.host}</span>
              </div>
              <div>
                {t('mailAdmin.settings.port')}: <span className="font-mono text-ink">{r.s.port}</span> · {t('mailAdmin.settings.security')}: <span className="text-ink">{r.s.security}</span>
              </div>
            </dd>
          </div>
        ))}
        <div className="sm:col-span-2">
          <dt className="font-semibold text-ink">{t('mailAdmin.settings.username')}</dt>
          <dd className="mt-1 flex flex-wrap items-center gap-2">
            <span className="font-mono break-all text-ink">{address}</span>
            <CopyButton value={address} />
          </dd>
        </div>
      </dl>
    </div>
  );
};

const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);

/**
 * Auto-reply editor (JMAP VacationResponse on the mail server). Loads the current values, so an
 * existing text (e.g. info@'s) is prefilled.
 */
export const AutoReplyForm = ({
  queryKey,
  load,
  save,
  onSaved,
  footer,
}: {
  queryKey: readonly unknown[];
  load: () => Promise<AutoReply>;
  save: (v: AutoReply) => Promise<AutoReply>;
  onSaved?: () => void;
  /** Renders extra buttons next to Save (e.g. Cancel). */
  footer?: ReactNode;
}) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const id = useId();
  const q = useQuery({ queryKey, queryFn: load, staleTime: 0 });
  const [form, setForm] = useState({ enabled: false, subject: '', text: '', from: '', to: '' });
  useEffect(() => {
    if (q.data) setForm({ enabled: q.data.enabled, subject: q.data.subject ?? '', text: q.data.text ?? '', from: toLocalInput(q.data.fromDate), to: toLocalInput(q.data.toDate) });
  }, [q.data]);

  const m = useMutation({
    mutationFn: () => save({ enabled: form.enabled, subject: form.subject.trim() || null, text: form.text.trim() || null, fromDate: fromLocalInput(form.from), toDate: fromLocalInput(form.to) }),
    onSuccess: (v) => {
      qc.setQueryData(queryKey, v);
      toast.success(t('mailAdmin.autoReply.saved'));
      onSaved?.();
    },
    onError: toastMailboxError,
  });

  if (q.isLoading) return <Spinner className="size-6 text-link" />;
  if (q.error) return <p className="text-sm text-danger-fg">{mailboxErrorText(q.error)}</p>;

  const datesBad = !!form.from && !!form.to && new Date(form.from) >= new Date(form.to);
  const invalid = (form.enabled && !form.text.trim()) || datesBad;

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!invalid && !m.isPending) m.mutate();
      }}
    >
      <label className="flex cursor-pointer items-center gap-3 text-sm font-semibold text-ink">
        <input type="checkbox" className="size-4 accent-primary" checked={form.enabled} onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))} />
        {t('mailAdmin.autoReply.enabled')}
      </label>
      <Field label={t('mailAdmin.autoReply.subject')} hint={t('mailAdmin.autoReply.subjectHint')} htmlFor={`${id}-s`}>
        <input id={`${id}-s`} className="input" maxLength={200} value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} />
      </Field>
      <Field label={t('mailAdmin.autoReply.text')} htmlFor={`${id}-t`}>
        <textarea id={`${id}-t`} className="input min-h-36 resize-y" maxLength={10000} required={form.enabled} value={form.text} onChange={(e) => setForm((f) => ({ ...f, text: e.target.value }))} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('mailAdmin.autoReply.from')} htmlFor={`${id}-f`}>
          <input id={`${id}-f`} type="datetime-local" className="input" value={form.from} onChange={(e) => setForm((f) => ({ ...f, from: e.target.value }))} />
        </Field>
        <Field label={t('mailAdmin.autoReply.to')} htmlFor={`${id}-to`}>
          <input id={`${id}-to`} type="datetime-local" className={clsx('input', datesBad && 'border-danger')} value={form.to} onChange={(e) => setForm((f) => ({ ...f, to: e.target.value }))} />
        </Field>
      </div>
      <p className="-mt-2 text-xs text-muted">{t('mailAdmin.autoReply.datesHint')}</p>
      <div className="flex flex-wrap justify-end gap-2">
        {footer}
        <button type="submit" className="btn-primary btn-sm" disabled={invalid || m.isPending}>
          {m.isPending && <Spinner className="size-3.5" />} {t('mailAdmin.actions.save')}
        </button>
      </div>
    </form>
  );
};
