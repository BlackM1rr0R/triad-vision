import { useEffect, useId, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { AlertTriangle, AtSign, KeyRound, Mail, Pencil, Plus, RefreshCw, Reply, Search, ShieldAlert, Trash2, Unplug, User } from 'lucide-react';
import { api, formatBytes } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesMailAdmin } from '@/i18n/pagesMailAdmin';
import { Spinner } from '@/components/ui/Spinner';
import { Modal } from '@/components/admin/Modal';
import { EmptyState, LoadingBlock, PageHead } from '@/components/admin/ui';
import { fmtDate } from '@/components/admin/labels';
import { AutoReplyForm, ClientSettingsTable, Field, SecretOnce, mailboxErrorText, passwordOk, toastMailboxError, type AutoReply, type ServerSettings } from '@/components/mailboxes/shared';

registerCopy(pagesMailAdmin);

type Protection = 'SITE_SENDER' | 'MAIL_ADMIN' | null;

interface LinkedUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

interface Mailbox {
  id: string;
  address: string;
  localPart: string;
  displayName: string | null;
  usedBytes: number;
  quotaBytes: number | null;
  createdAt: string | null;
  aliases: string[];
  isAdmin: boolean;
  protection: Protection;
  canDelete: boolean;
  canResetPassword: boolean;
  linkedUser: LinkedUser | null;
  workspaceUsers: LinkedUser[];
}

interface ListResponse extends ServerSettings {
  configured: boolean;
  domain: string;
  mailboxes: Mailbox[];
}

const KEY = ['admin-mailboxes'] as const;
const MB = 1024 * 1024;

const splitAliases = (s: string) =>
  s
    .split(/[,\s;]+/)
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);

const localAliases = (m: Mailbox, domain: string) => m.aliases.filter((a) => a.endsWith(`@${domain}`)).map((a) => a.slice(0, -domain.length - 1));

// ─── Row ───────────────────────────────────────────────────────────────

const UsageBar = ({ used, quota }: { used: number; quota: number | null }) => {
  const { t } = useTranslation();
  const pct = quota ? Math.min(100, Math.round((used / quota) * 100)) : null;
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted tabular-nums">{t('mailAdmin.usageOf', { used: formatBytes(used), quota: quota ? formatBytes(quota) : t('mailAdmin.unlimited') })}</div>
      {pct !== null && (
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className={clsx('h-full rounded-full', pct >= 90 ? 'bg-danger' : pct >= 75 ? 'bg-amber-500' : 'bg-brand-600')} style={{ width: `${Math.max(pct, 2)}%` }} />
        </div>
      )}
    </div>
  );
};

const IconAction = ({ icon: Icon, label, onClick, disabled, danger, hint }: { icon: typeof Pencil; label: string; onClick: () => void; disabled?: boolean; danger?: boolean; hint?: string }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    title={disabled && hint ? hint : label}
    aria-label={label}
    className={clsx(
      'grid size-9 place-items-center rounded-lg border border-line transition disabled:cursor-not-allowed disabled:opacity-40',
      danger ? 'text-danger hover:bg-red-50' : 'text-ink/70 hover:bg-surface hover:text-navy-900',
    )}
  >
    <Icon className="size-4" aria-hidden />
  </button>
);

type DialogState = { kind: 'edit' | 'reset' | 'delete' | 'autoReply'; mailbox: Mailbox } | null;

const Row = ({ m, onOpen }: { m: Mailbox; onOpen: (d: NonNullable<DialogState>) => void }) => {
  const { t } = useTranslation();
  const hint = m.protection ? t(`mailAdmin.protectedHint.${m.protection}`) : undefined;
  return (
    <li className="grid gap-3 px-4 py-4 sm:px-5 lg:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1.4fr)_auto] lg:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold break-all text-navy-900">{m.address}</span>
          {m.protection && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900" title={hint}>
              <ShieldAlert className="size-3" aria-hidden /> {t(`mailAdmin.badge.${m.protection}`)}
            </span>
          )}
        </div>
        <div className="mt-0.5 text-sm text-muted">{m.displayName || '—'}</div>
        {(m.linkedUser || m.workspaceUsers.length > 0) && (
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink/70">
            {m.linkedUser && (
              <span className="inline-flex items-center gap-1">
                <User className="size-3" aria-hidden /> {m.linkedUser.name}
              </span>
            )}
            {m.workspaceUsers.length > 0 && <span>{t('mailAdmin.workspaceUsers', { names: m.workspaceUsers.map((u) => u.name).join(', ') })}</span>}
          </div>
        )}
      </div>
      <UsageBar used={m.usedBytes} quota={m.quotaBytes} />
      <div className="flex min-w-0 flex-wrap gap-1">
        {m.aliases.length ? (
          m.aliases.map((a) => (
            <span key={a} className="inline-flex max-w-full items-center gap-1 truncate rounded-md bg-surface px-2 py-0.5 text-xs text-ink/80">
              <AtSign className="size-3 shrink-0" aria-hidden />
              {a}
            </span>
          ))
        ) : (
          <span className="text-xs text-muted">{t('mailAdmin.noAliases')}</span>
        )}
        {m.createdAt && <span className="w-full text-[11px] text-muted lg:hidden">{`${t('mailAdmin.col.created')}: ${fmtDate(m.createdAt)}`}</span>}
      </div>
      <div className="flex flex-wrap gap-1.5 lg:justify-end">
        <IconAction icon={Pencil} label={t('mailAdmin.actions.edit')} onClick={() => onOpen({ kind: 'edit', mailbox: m })} />
        <IconAction icon={Reply} label={t('mailAdmin.actions.autoReply')} onClick={() => onOpen({ kind: 'autoReply', mailbox: m })} />
        <IconAction icon={KeyRound} label={t('mailAdmin.actions.password')} onClick={() => onOpen({ kind: 'reset', mailbox: m })} disabled={!m.canResetPassword} hint={hint} />
        <IconAction icon={Trash2} label={t('mailAdmin.actions.delete')} onClick={() => onOpen({ kind: 'delete', mailbox: m })} disabled={!m.canDelete} hint={hint} danger />
      </div>
    </li>
  );
};

// ─── Dialogs ───────────────────────────────────────────────────────────

const CancelButton = ({ onClick, disabled, label }: { onClick: () => void; disabled?: boolean; label?: string }) => {
  const { t } = useTranslation();
  return (
    <button type="button" className="btn-white btn-sm border border-line" onClick={onClick} disabled={disabled}>
      {label ?? t('mailAdmin.actions.cancel')}
    </button>
  );
};

interface Created {
  mailbox: Mailbox;
  password: string;
  generated: boolean;
  settings: ServerSettings;
}

const CreateDialog = ({ open, onClose, domain }: { open: boolean; onClose: () => void; domain: string }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const id = useId();
  const [form, setForm] = useState({ localPart: '', displayName: '', password: '', quotaMb: '', aliases: '' });
  const [created, setCreated] = useState<Created | null>(null);
  useEffect(() => {
    if (open) {
      setForm({ localPart: '', displayName: '', password: '', quotaMb: '', aliases: '' });
      setCreated(null);
    }
  }, [open]);

  const m = useMutation({
    mutationFn: async () =>
      (
        await api.post<Created>('/admin/mailboxes', {
          localPart: form.localPart.trim().toLowerCase(),
          displayName: form.displayName.trim() || null,
          ...(form.password ? { password: form.password } : {}),
          ...(form.quotaMb ? { quotaMb: Number(form.quotaMb) } : {}),
          aliases: splitAliases(form.aliases),
        })
      ).data,
    onSuccess: (r) => {
      setCreated(r);
      void qc.invalidateQueries({ queryKey: KEY });
    },
    onError: toastMailboxError,
  });

  const localOk = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/.test(form.localPart.trim().toLowerCase());
  const pwOk = !form.password || passwordOk(form.password);
  const close = () => !m.isPending && onClose();

  return (
    <Modal
      open={open}
      onClose={close}
      title={created ? t('mailAdmin.created.title') : t('mailAdmin.newMailbox')}
      footer={
        created ? (
          <button type="button" className="btn-primary btn-sm" onClick={onClose}>
            {t('mailAdmin.actions.done')}
          </button>
        ) : (
          <>
            <CancelButton onClick={close} disabled={m.isPending} />
            <button type="submit" form={`${id}-form`} className="btn-primary btn-sm" disabled={!localOk || !pwOk || m.isPending}>
              {m.isPending ? <Spinner className="size-3.5" /> : <Plus className="size-3.5" aria-hidden />} {t('mailAdmin.actions.create')}
            </button>
          </>
        )
      }
    >
      {created ? (
        <div className="space-y-4 text-sm">
          <p className="text-ink/80">{t('mailAdmin.created.body', { address: created.mailbox.address })}</p>
          {created.generated ? <SecretOnce value={created.password} note={t('mailAdmin.created.passwordOnce')} /> : <p className="text-muted">{t('mailAdmin.created.passwordChosen')}</p>}
          <ClientSettingsTable settings={created.settings} address={created.mailbox.address} />
        </div>
      ) : (
        <form
          id={`${id}-form`}
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (localOk && pwOk && !m.isPending) m.mutate();
          }}
        >
          <Field label={t('mailAdmin.form.localPart')} htmlFor={`${id}-lp`}>
            <div className="flex items-stretch">
              <input id={`${id}-lp`} className="input rounded-r-none" autoComplete="off" spellCheck={false} maxLength={64} value={form.localPart} onChange={(e) => setForm((f) => ({ ...f, localPart: e.target.value }))} required data-autofocus />
              <span className="grid shrink-0 place-items-center rounded-r-lg border border-l-0 border-line bg-surface px-3 text-sm text-muted">@{domain}</span>
            </div>
          </Field>
          <Field label={t('mailAdmin.form.displayName')} htmlFor={`${id}-dn`}>
            <input id={`${id}-dn`} className="input" maxLength={120} value={form.displayName} onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))} />
          </Field>
          <Field label={t('mailAdmin.form.password')} hint={t('mailAdmin.form.passwordHint')} htmlFor={`${id}-pw`}>
            <input id={`${id}-pw`} type="password" className={clsx('input', !pwOk && 'border-danger')} autoComplete="new-password" maxLength={128} value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('mailAdmin.form.quota')} hint={t('mailAdmin.form.quotaHint')} htmlFor={`${id}-q`}>
              <input id={`${id}-q`} type="number" min={1} inputMode="numeric" className="input" value={form.quotaMb} onChange={(e) => setForm((f) => ({ ...f, quotaMb: e.target.value }))} />
            </Field>
            <Field label={t('mailAdmin.form.aliases')} hint={t('mailAdmin.form.aliasesHint')} htmlFor={`${id}-al`}>
              <input id={`${id}-al`} className="input" spellCheck={false} value={form.aliases} onChange={(e) => setForm((f) => ({ ...f, aliases: e.target.value }))} />
            </Field>
          </div>
        </form>
      )}
    </Modal>
  );
};

const EditDialog = ({ mailbox, onClose, domain }: { mailbox: Mailbox | null; onClose: () => void; domain: string }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const id = useId();
  const [form, setForm] = useState({ displayName: '', quotaMb: '', aliases: '' });
  useEffect(() => {
    if (mailbox) setForm({ displayName: mailbox.displayName ?? '', quotaMb: mailbox.quotaBytes ? String(Math.round(mailbox.quotaBytes / MB)) : '', aliases: localAliases(mailbox, domain).join(', ') });
  }, [mailbox, domain]);

  const m = useMutation({
    mutationFn: async (mb: Mailbox) =>
      (await api.patch(`/admin/mailboxes/${mb.id}`, { displayName: form.displayName.trim() || null, quotaMb: form.quotaMb ? Number(form.quotaMb) : null, aliases: splitAliases(form.aliases) })).data,
    onSuccess: () => {
      toast.success(t('mailAdmin.edit.saved'));
      void qc.invalidateQueries({ queryKey: KEY });
      onClose();
    },
    onError: toastMailboxError,
  });
  const close = () => !m.isPending && onClose();

  return (
    <Modal
      open={!!mailbox}
      onClose={close}
      title={t('mailAdmin.edit.title')}
      description={mailbox?.address}
      footer={
        <>
          <CancelButton onClick={close} disabled={m.isPending} />
          <button type="submit" form={`${id}-form`} className="btn-primary btn-sm" disabled={m.isPending}>
            {m.isPending && <Spinner className="size-3.5" />} {t('mailAdmin.actions.save')}
          </button>
        </>
      }
    >
      {mailbox && (
        <form
          id={`${id}-form`}
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!m.isPending) m.mutate(mailbox);
          }}
        >
          <Field label={t('mailAdmin.form.displayName')} htmlFor={`${id}-dn`}>
            <input id={`${id}-dn`} className="input" maxLength={120} value={form.displayName} onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))} />
          </Field>
          <Field label={t('mailAdmin.form.quota')} hint={t('mailAdmin.form.quotaHint')} htmlFor={`${id}-q`}>
            <input id={`${id}-q`} type="number" min={1} inputMode="numeric" className="input" value={form.quotaMb} onChange={(e) => setForm((f) => ({ ...f, quotaMb: e.target.value }))} />
          </Field>
          <Field label={t('mailAdmin.form.aliases')} hint={t('mailAdmin.form.aliasesHint')} htmlFor={`${id}-al`}>
            <input id={`${id}-al`} className="input" spellCheck={false} value={form.aliases} onChange={(e) => setForm((f) => ({ ...f, aliases: e.target.value }))} />
          </Field>
        </form>
      )}
    </Modal>
  );
};

interface ResetResult {
  password: string;
  generated: boolean;
  workspaceAccountsUpdated: number;
}

const ResetDialog = ({ mailbox, onClose }: { mailbox: Mailbox | null; onClose: () => void }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const id = useId();
  const [own, setOwn] = useState('');
  const [result, setResult] = useState<ResetResult | null>(null);
  useEffect(() => {
    setOwn('');
    setResult(null);
  }, [mailbox?.id]);

  const m = useMutation({
    mutationFn: async (mb: Mailbox) => (await api.post<ResetResult>(`/admin/mailboxes/${mb.id}/password`, own ? { password: own } : {})).data,
    onSuccess: (r) => {
      setResult(r);
      void qc.invalidateQueries({ queryKey: KEY });
    },
    onError: toastMailboxError,
  });
  const ok = !own || passwordOk(own);
  const close = () => !m.isPending && onClose();

  return (
    <Modal
      open={!!mailbox}
      onClose={close}
      title={t('mailAdmin.reset.title')}
      description={mailbox?.address}
      footer={
        result ? (
          <button type="button" className="btn-primary btn-sm" onClick={onClose}>
            {t('mailAdmin.actions.done')}
          </button>
        ) : (
          <>
            <CancelButton onClick={close} disabled={m.isPending} />
            <button type="submit" form={`${id}-form`} className="btn-primary btn-sm" disabled={!ok || m.isPending}>
              {m.isPending ? <Spinner className="size-3.5" /> : <KeyRound className="size-3.5" aria-hidden />} {t('mailAdmin.reset.confirm')}
            </button>
          </>
        )
      }
    >
      {mailbox &&
        (result ? (
          <div className="space-y-3 text-sm">
            <p className="font-semibold text-ink">{t('mailAdmin.reset.done', { address: mailbox.address })}</p>
            {result.generated ? <SecretOnce value={result.password} note={t('mailAdmin.created.passwordOnce')} /> : <p className="text-muted">{t('mailAdmin.created.passwordChosen')}</p>}
            <p className="text-muted">{t('mailAdmin.reset.workspaceUpdated', { count: result.workspaceAccountsUpdated })}</p>
          </div>
        ) : (
          <form
            id={`${id}-form`}
            className="space-y-4 text-sm"
            onSubmit={(e) => {
              e.preventDefault();
              if (ok && !m.isPending) m.mutate(mailbox);
            }}
          >
            <p className="text-ink/80">{t('mailAdmin.reset.body', { address: mailbox.address })}</p>
            <Field label={t('mailAdmin.reset.own')} hint={t('mailAdmin.security.policy')} htmlFor={`${id}-pw`}>
              <input id={`${id}-pw`} type="password" autoComplete="new-password" maxLength={128} className={clsx('input', !ok && 'border-danger')} value={own} onChange={(e) => setOwn(e.target.value)} />
            </Field>
          </form>
        ))}
    </Modal>
  );
};

const DeleteDialog = ({ mailbox, onClose }: { mailbox: Mailbox | null; onClose: () => void }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const id = useId();
  const [typed, setTyped] = useState('');
  useEffect(() => setTyped(''), [mailbox?.id]);
  const m = useMutation({
    mutationFn: async (mb: Mailbox) => (await api.delete(`/admin/mailboxes/${mb.id}`, { data: { confirmAddress: typed.trim() } })).data,
    onSuccess: (_r, mb) => {
      toast.success(t('mailAdmin.del.deleted', { address: mb.address }));
      void qc.invalidateQueries({ queryKey: KEY });
      onClose();
    },
    onError: toastMailboxError,
  });
  const matches = !!mailbox && typed.trim().toLowerCase() === mailbox.address;
  const close = () => !m.isPending && onClose();
  return (
    <Modal
      open={!!mailbox}
      onClose={close}
      size="sm"
      title={
        <span className="flex items-center gap-2">
          <AlertTriangle className="size-4 text-danger" aria-hidden /> {t('mailAdmin.del.title')}
        </span>
      }
      footer={
        <>
          <CancelButton onClick={close} disabled={m.isPending} />
          <button type="submit" form={`${id}-form`} className="btn-danger btn-sm" disabled={!matches || m.isPending}>
            {m.isPending ? <Spinner className="size-3.5" /> : <Trash2 className="size-3.5" aria-hidden />} {t('mailAdmin.del.confirm')}
          </button>
        </>
      }
    >
      {mailbox && (
        <form
          id={`${id}-form`}
          className="space-y-4 text-sm text-ink/80"
          onSubmit={(e) => {
            e.preventDefault();
            if (matches && !m.isPending) m.mutate(mailbox);
          }}
        >
          <p className="rounded-lg border border-red-200 bg-red-50/60 p-3 text-red-900">{t('mailAdmin.del.body', { address: mailbox.address })}</p>
          {(mailbox.linkedUser || mailbox.workspaceUsers.length > 0) && <p>{t('mailAdmin.del.linked')}</p>}
          <Field label={t('mailAdmin.del.typeToConfirm', { address: mailbox.address })} htmlFor={`${id}-c`}>
            <input id={`${id}-c`} className="input" autoComplete="off" spellCheck={false} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={mailbox.address} data-autofocus />
          </Field>
        </form>
      )}
    </Modal>
  );
};

const AutoReplyDialog = ({ mailbox, onClose }: { mailbox: Mailbox | null; onClose: () => void }) => {
  const { t } = useTranslation();
  return (
    <Modal open={!!mailbox} onClose={onClose} size="lg" title={t('mailAdmin.autoReply.title')} description={mailbox?.address}>
      {mailbox && (
        <AutoReplyForm
          queryKey={['admin-mailbox-auto-reply', mailbox.id]}
          load={async () => (await api.get<{ autoReply: AutoReply }>(`/admin/mailboxes/${mailbox.id}/auto-reply`)).data.autoReply}
          save={async (v) => (await api.put<{ autoReply: AutoReply }>(`/admin/mailboxes/${mailbox.id}/auto-reply`, v)).data.autoReply}
          onSaved={onClose}
          footer={<CancelButton onClick={onClose} />}
        />
      )}
    </Modal>
  );
};

// ─── Page ──────────────────────────────────────────────────────────────

export default function Mailboxes() {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const [dialog, setDialog] = useState<DialogState>(null);
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: KEY,
    queryFn: async () => (await api.get<ListResponse>('/admin/mailboxes')).data,
  });

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    const all = data?.mailboxes ?? [];
    if (!s) return all;
    return all.filter((m) => [m.address, m.displayName ?? '', ...m.aliases, m.linkedUser?.name ?? ''].some((f) => f.toLowerCase().includes(s)));
  }, [data, q]);

  const domain = data?.domain ?? '';
  const close = () => setDialog(null);
  const pick = (kind: NonNullable<DialogState>['kind']) => (dialog?.kind === kind ? dialog.mailbox : null);

  return (
    <div>
      <PageHead
        title={t('admin.nav.mailboxes')}
        subtitle={t('mailAdmin.subtitle')}
        actions={
          data?.configured ? (
            <>
              <button type="button" className="btn-white btn-sm border border-line" onClick={() => void refetch()} disabled={isFetching} aria-label={t('mailAdmin.refresh')}>
                <RefreshCw className={clsx('size-3.5', isFetching && 'animate-spin')} aria-hidden /> <span className="hidden sm:inline">{t('mailAdmin.refresh')}</span>
              </button>
              <button type="button" className="btn-primary btn-sm" onClick={() => setCreating(true)}>
                <Plus className="size-3.5" aria-hidden /> {t('mailAdmin.newMailbox')}
              </button>
            </>
          ) : undefined
        }
      />

      {isLoading ? (
        <LoadingBlock />
      ) : error ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-10 text-center" role="alert">
          <Unplug className="size-6 text-danger" aria-hidden />
          <p className="text-sm font-medium text-red-800">{mailboxErrorText(error)}</p>
          <button type="button" className="btn-white btn-sm border border-line" onClick={() => void refetch()}>
            <RefreshCw className="size-3.5" aria-hidden /> {t('mailAdmin.refresh')}
          </button>
        </div>
      ) : !data?.configured ? (
        <div className="rounded-xl border border-line bg-white">
          <EmptyState icon={Unplug} title={t('mailAdmin.notConfigured.title')}>
            {t('mailAdmin.notConfigured.body')}
          </EmptyState>
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <label className="relative block w-full max-w-sm">
              <span className="sr-only">{t('mailAdmin.search')}</span>
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
              <input className="input pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('mailAdmin.search')} />
            </label>
            <span className="text-xs text-muted">{t('mailAdmin.count', { count: data.mailboxes.length })}</span>
          </div>
          <section className="overflow-hidden rounded-xl border border-line bg-white shadow-[0_1px_2px_rgba(11,31,68,0.04)]">
            <div className="hidden border-b border-line bg-surface/60 px-5 py-2.5 text-[11px] font-bold tracking-wide text-muted uppercase lg:grid lg:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1.4fr)_auto] lg:gap-3">
              <span>{t('mailAdmin.col.address')}</span>
              <span>{t('mailAdmin.col.usage')}</span>
              <span>{t('mailAdmin.col.aliases')}</span>
              <span className="w-[10.5rem]" />
            </div>
            {list.length ? (
              <ul className="divide-y divide-line">
                {list.map((m) => (
                  <Row key={m.id} m={m} onOpen={setDialog} />
                ))}
              </ul>
            ) : (
              <EmptyState icon={Mail} title={data.mailboxes.length ? t('mailAdmin.noMatch') : t('mailAdmin.empty')} />
            )}
          </section>
        </>
      )}

      <CreateDialog open={creating} onClose={() => setCreating(false)} domain={domain} />
      <EditDialog mailbox={pick('edit')} onClose={close} domain={domain} />
      <ResetDialog mailbox={pick('reset')} onClose={close} />
      <DeleteDialog mailbox={pick('delete')} onClose={close} />
      <AutoReplyDialog mailbox={pick('autoReply')} onClose={close} />
    </div>
  );
}
