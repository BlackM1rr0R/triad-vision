import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { AlertCircle, Briefcase, CheckCircle2, Pencil, Play, Plus, RefreshCw, Share2, Trash2, X } from 'lucide-react';
import { api } from '@/lib/api';
import { fmtDateTime } from '@/components/admin/labels';
import { Spinner } from '@/components/ui/Spinner';
import { mailKeys, syncAccount, useFolders, useLabels, useProviders, useRules, useTemplates } from './api';
import { Confirm, Dialog } from './Dialog';
import { CasePickerDialog } from './menus';
import { folderLabel } from './Sidebar';
import type { CaseRef, MailAccount, MailLabel, MailProvider, MailRule, MailTemplate, RuleActions, RuleConditions } from './types';
import { PROVIDERS } from './types';
import { errorText } from './utils';
import { MailboxSecurityTab, useMyMailboxes } from './MailboxSecurity';

export type SettingsTab = 'accounts' | 'signatures' | 'labels' | 'rules' | 'templates' | 'security';
const TABS: SettingsTab[] = ['accounts', 'signatures', 'labels', 'rules', 'templates'];

const Field = ({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) => (
  <label className="block">
    <span className="label">{label}</span>
    {children}
    {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
  </label>
);

const Toggle = ({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) => (
  <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-ink">
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-4 accent-brand-600" />
    {label}
  </label>
);

const Secondary = ({ onClick, children, disabled, className }: { onClick: () => void; children: ReactNode; disabled?: boolean; className?: string }) => (
  <button type="button" onClick={onClick} disabled={disabled} className={clsx('inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-xs font-semibold text-ink hover:bg-surface disabled:opacity-50', className)}>
    {children}
  </button>
);

// ─── Accounts ─────────────────────────────────────────────────────────

interface AccountForm {
  email: string;
  displayName: string;
  provider: MailProvider;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  username: string;
  password: string;
  isDefault: boolean;
  syncEnabled: boolean;
}

const emptyForm = (): AccountForm => ({ email: '', displayName: '', provider: 'CUSTOM', imapHost: '', imapPort: 993, imapSecure: true, smtpHost: '', smtpPort: 465, smtpSecure: true, username: '', password: '', isDefault: false, syncEnabled: true });

const AccountDialog = ({ open, onClose, account }: { open: boolean; onClose: () => void; account: MailAccount | null }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const providers = useProviders(open);
  const [form, setForm] = useState<AccountForm>(emptyForm);
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<{ imap: { ok: boolean; error?: string }; smtp: { ok: boolean; error?: string } } | null>(null);
  const set = (patch: Partial<AccountForm>) => setForm((f) => ({ ...f, ...patch }));

  useEffect(() => {
    if (!open) return;
    setTest(null);
    setForm(account ? { ...emptyForm(), ...account, displayName: account.displayName ?? '', password: '' } : emptyForm());
  }, [open, account]);

  const applyPreset = (provider: MailProvider, email = form.email) => {
    const p = providers.data?.find((x) => x.provider === provider);
    if (!p) return set({ provider });
    set({ provider, imapHost: p.imapHost || form.imapHost, imapPort: p.imapPort, imapSecure: p.imapSecure, smtpHost: p.smtpHost || form.smtpHost, smtpPort: p.smtpPort, smtpSecure: p.smtpSecure, username: form.username || email });
  };

  const onEmail = (email: string) => {
    const domain = email.split('@')[1]?.toLowerCase();
    const p = domain ? providers.data?.find((x) => x.domains.includes(domain)) : undefined;
    set({ email, username: form.username && form.username !== form.email ? form.username : email });
    if (p && p.provider !== form.provider && !account) applyPreset(p.provider, email);
  };

  const body = () => ({ ...form, displayName: form.displayName || null, password: form.password || undefined });

  const runTest = async () => {
    if (!form.password && account) {
      toast.error(t('mail.settings.accounts.passwordKeep'));
      return;
    }
    setTesting(true);
    try {
      const res = await api.post<{ ok: boolean; imap: { ok: boolean; error?: string }; smtp: { ok: boolean; error?: string } }>('/mail/accounts/test', { ...form, displayName: undefined, isDefault: undefined, syncEnabled: undefined });
      setTest(res.data);
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setTesting(false);
    }
  };

  const save = useMutation({
    mutationFn: async () => (account ? api.patch(`/mail/accounts/${account.id}`, body()) : api.post('/mail/accounts', body())),
    onSuccess: () => {
      toast.success(t('mail.settings.accounts.saved'));
      void qc.invalidateQueries({ queryKey: ['mail'] });
      onClose();
    },
    onError: (err) => toast.error(errorText(err)),
  });

  const valid = form.email && form.imapHost && form.smtpHost && form.username && (form.password || account);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title={account ? t('mail.settings.accounts.edit') : t('mail.settings.accounts.add')}
      footer={
        <>
          <Secondary onClick={() => void runTest()} disabled={testing || !form.imapHost || !form.smtpHost || !form.username}>
            {testing ? <Spinner className="size-3.5" /> : <RefreshCw className="size-3.5" />} {testing ? t('mail.settings.accounts.testing') : t('mail.settings.accounts.test')}
          </Secondary>
          <span className="flex-1" />
          <Secondary onClick={onClose}>{t('mail.actions.cancel')}</Secondary>
          <button type="button" className="btn-primary btn-sm" disabled={!valid || save.isPending} onClick={() => save.mutate()}>
            {save.isPending && <Spinner className="size-3.5" />} {t('mail.actions.save')}
          </button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('mail.settings.accounts.provider')}>
          <select value={form.provider} onChange={(e) => applyPreset(e.target.value as MailProvider)} className="input">
            {PROVIDERS.map((p) => (
              <option key={p} value={p}>
                {p === 'CUSTOM' ? 'IMAP/SMTP' : p === 'MAILRU' ? 'Mail.ru' : p === 'GMAIL' ? 'Gmail' : p === 'OUTLOOK' ? 'Outlook / Microsoft 365' : 'Yandex'}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('mail.settings.accounts.email')}>
          <input type="email" value={form.email} onChange={(e) => onEmail(e.target.value)} className="input" autoComplete="off" data-autofocus />
        </Field>
        <div className="sm:col-span-2 flex items-start gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-xs text-muted">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-brand-600" aria-hidden />
          <span>{t(`mail.settings.accounts.hint.${form.provider}`)}</span>
        </div>
        <Field label={t('mail.settings.accounts.displayName')}>
          <input value={form.displayName} onChange={(e) => set({ displayName: e.target.value })} className="input" />
        </Field>
        <Field label={t('mail.settings.accounts.username')}>
          <input value={form.username} onChange={(e) => set({ username: e.target.value })} className="input" autoComplete="off" />
        </Field>
        <Field label={t('mail.settings.accounts.password')} hint={account ? t('mail.settings.accounts.passwordKeep') : undefined}>
          <input type="password" value={form.password} onChange={(e) => set({ password: e.target.value })} className="input" autoComplete="new-password" />
        </Field>
        <div className="flex flex-col justify-end gap-2 pb-1">
          <Toggle checked={form.isDefault} onChange={(v) => set({ isDefault: v })} label={t('mail.settings.accounts.isDefault')} />
          <Toggle checked={form.syncEnabled} onChange={(v) => set({ syncEnabled: v })} label={t('mail.settings.accounts.syncEnabled')} />
        </div>
        <fieldset className="rounded-xl border border-line p-3">
          <legend className="px-1 text-xs font-bold text-muted">{t('mail.settings.accounts.imap')}</legend>
          <div className="grid grid-cols-[1fr_5rem] gap-2">
            <Field label={t('mail.settings.accounts.host')}>
              <input value={form.imapHost} onChange={(e) => set({ imapHost: e.target.value })} className="input" />
            </Field>
            <Field label={t('mail.settings.accounts.port')}>
              <input type="number" value={form.imapPort} onChange={(e) => set({ imapPort: Number(e.target.value) })} className="input" />
            </Field>
          </div>
          <div className="mt-2">
            <Toggle checked={form.imapSecure} onChange={(v) => set({ imapSecure: v, imapPort: v ? 993 : 143 })} label={t('mail.settings.accounts.secure')} />
          </div>
        </fieldset>
        <fieldset className="rounded-xl border border-line p-3">
          <legend className="px-1 text-xs font-bold text-muted">{t('mail.settings.accounts.smtp')}</legend>
          <div className="grid grid-cols-[1fr_5rem] gap-2">
            <Field label={t('mail.settings.accounts.host')}>
              <input value={form.smtpHost} onChange={(e) => set({ smtpHost: e.target.value })} className="input" />
            </Field>
            <Field label={t('mail.settings.accounts.port')}>
              <input type="number" value={form.smtpPort} onChange={(e) => set({ smtpPort: Number(e.target.value) })} className="input" />
            </Field>
          </div>
          <div className="mt-2 flex gap-4">
            <Toggle checked={form.smtpSecure} onChange={(v) => set({ smtpSecure: v, smtpPort: v ? 465 : 587 })} label={t('mail.settings.accounts.secure')} />
            <span className="text-xs text-muted">{!form.smtpSecure && t('mail.settings.accounts.starttls')}</span>
          </div>
        </fieldset>
        {test && (
          <div className="sm:col-span-2 space-y-1 text-sm">
            {test.imap.ok && test.smtp.ok ? (
              <p className="inline-flex items-center gap-1.5 text-success">
                <CheckCircle2 className="size-4" /> {t('mail.settings.accounts.testOk')}
              </p>
            ) : (
              <>
                {!test.imap.ok && (
                  <p className="inline-flex items-start gap-1.5 text-danger">
                    <AlertCircle className="mt-0.5 size-4 shrink-0" /> {t('mail.settings.accounts.testImapFailed', { error: test.imap.error ?? '' })}
                  </p>
                )}
                {!test.smtp.ok && (
                  <p className="inline-flex items-start gap-1.5 text-danger">
                    <AlertCircle className="mt-0.5 size-4 shrink-0" /> {t('mail.settings.accounts.testSmtpFailed', { error: test.smtp.error ?? '' })}
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
};

const AccountsTab = ({ accounts }: { accounts: MailAccount[] }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [edit, setEdit] = useState<MailAccount | null | 'new'>(null);
  const [del, setDel] = useState<MailAccount | null>(null);
  const [syncing, setSyncing] = useState<string | null>(null);
  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`/mail/accounts/${id}`),
    onSuccess: () => {
      toast.success(t('mail.settings.accounts.deleted'));
      void qc.invalidateQueries({ queryKey: ['mail'] });
      setDel(null);
    },
    onError: (err) => toast.error(errorText(err)),
  });
  const sync = async (a: MailAccount) => {
    setSyncing(a.id);
    try {
      const r = await syncAccount(a.id);
      if (r.ok) toast.success(t('mail.toast.synced'));
      else toast.error(t('mail.toast.syncFailed', { error: r.error ?? '' }));
      void qc.invalidateQueries({ queryKey: ['mail'] });
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setSyncing(null);
    }
  };
  return (
    <div className="space-y-3">
      {accounts.map((a) => (
        <div key={a.id} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5">
          <span className={clsx('size-2.5 shrink-0 rounded-full', a.syncStatus === 'OK' ? 'bg-success' : a.syncStatus === 'ERROR' ? 'bg-danger' : a.syncStatus === 'SYNCING' ? 'animate-pulse bg-brand-500' : 'bg-slate-300')} title={t(`mail.settings.accounts.status.${a.syncStatus}`)} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ink">
              {a.email} {a.isDefault && <span className="ml-1 rounded-md bg-brand-100 px-1.5 text-[0.65rem] text-brand-700">{t('mail.settings.accounts.isDefault')}</span>}
            </p>
            <p className="truncate text-xs text-muted">
              {a.displayName ? `${a.displayName} · ` : ''}
              {t('mail.settings.accounts.lastSync', { date: a.lastSyncAt ? fmtDateTime(a.lastSyncAt) : t('mail.settings.accounts.never') })}
              {a.syncError ? ` · ${a.syncError}` : ''}
            </p>
          </div>
          <Secondary onClick={() => void sync(a)} disabled={syncing === a.id}>
            <RefreshCw className={clsx('size-3.5', syncing === a.id && 'animate-spin')} />
          </Secondary>
          <Secondary onClick={() => setEdit(a)}>
            <Pencil className="size-3.5" />
          </Secondary>
          <Secondary onClick={() => setDel(a)} className="hover:text-danger">
            <Trash2 className="size-3.5" />
          </Secondary>
        </div>
      ))}
      {!accounts.length && <p className="py-6 text-center text-sm text-muted">{t('mail.settings.accounts.none')}</p>}
      <button type="button" className="btn-primary btn-sm" onClick={() => setEdit('new')}>
        <Plus className="size-3.5" /> {t('mail.settings.accounts.add')}
      </button>
      <AccountDialog open={edit !== null} onClose={() => setEdit(null)} account={edit === 'new' ? null : edit} />
      <Confirm open={!!del} onClose={() => setDel(null)} onConfirm={() => del && remove.mutate(del.id)} title={t('mail.actions.delete')} message={t('mail.settings.accounts.deleteConfirm', { email: del?.email ?? '' })} loading={remove.isPending} />
    </div>
  );
};

// ─── Signatures ───────────────────────────────────────────────────────

const SignaturesTab = ({ accounts }: { accounts: MailAccount[] }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [values, setValues] = useState<Record<string, string>>({});
  useEffect(() => {
    setValues(Object.fromEntries(accounts.map((a) => [a.id, (a.signatureHtml ?? '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')])));
  }, [accounts]);
  const save = useMutation({
    mutationFn: async (a: MailAccount) => {
      const text = values[a.id] ?? '';
      const html = text.trim() ? `<div>${text.split('\n').map((l) => l.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!)).join('<br>')}</div>` : null;
      return api.patch(`/mail/accounts/${a.id}`, { signatureHtml: html });
    },
    onSuccess: () => {
      toast.success(t('mail.settings.signatures.saved'));
      void qc.invalidateQueries({ queryKey: ['mail', 'folders'] });
    },
    onError: (err) => toast.error(errorText(err)),
  });
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted">{t('mail.settings.signatures.hint')}</p>
      {accounts.map((a) => (
        <div key={a.id}>
          <Field label={a.email}>
            <textarea value={values[a.id] ?? ''} onChange={(e) => setValues((v) => ({ ...v, [a.id]: e.target.value }))} rows={4} className="input font-mono text-xs" placeholder={t('mail.settings.signatures.placeholder')} />
          </Field>
          <div className="mt-2 flex justify-end">
            <button type="button" className="btn-primary btn-sm" onClick={() => save.mutate(a)} disabled={save.isPending}>
              {t('mail.actions.save')}
            </button>
          </div>
        </div>
      ))}
      {!accounts.length && <p className="py-6 text-center text-sm text-muted">{t('mail.settings.accounts.none')}</p>}
    </div>
  );
};

// ─── Labels ───────────────────────────────────────────────────────────

const COLORS = ['#1565e8', '#12a150', '#e08a00', '#d92d3a', '#7c3aed', '#0891b2', '#db2777', '#4b5563'];

const LabelsTab = () => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const labels = useLabels();
  const [name, setName] = useState('');
  const [color, setColor] = useState(COLORS[0]!);
  const [del, setDel] = useState<MailLabel | null>(null);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: mailKeys.labels });
    void qc.invalidateQueries({ queryKey: ['mail', 'folders'] });
  };
  const create = useMutation({
    mutationFn: async () => api.post('/mail/labels', { name: name.trim(), color }),
    onSuccess: () => {
      setName('');
      refresh();
    },
    onError: (err) => toast.error(errorText(err)),
  });
  const update = useMutation({ mutationFn: async (l: MailLabel) => api.patch(`/mail/labels/${l.id}`, { name: l.name, color: l.color }), onSuccess: refresh, onError: (err) => toast.error(errorText(err)) });
  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`/mail/labels/${id}`),
    onSuccess: () => {
      setDel(null);
      refresh();
      void qc.invalidateQueries({ queryKey: mailKeys.lists });
    },
    onError: (err) => toast.error(errorText(err)),
  });
  return (
    <div className="space-y-3">
      {(labels.data ?? []).map((l) => (
        <div key={l.id} className="flex items-center gap-2 rounded-xl border border-line px-3 py-2">
          <input type="color" value={l.color} onChange={(e) => update.mutate({ ...l, color: e.target.value })} className="size-7 cursor-pointer rounded border-0 bg-transparent p-0" aria-label={t('mail.settings.labels.color')} />
          <input defaultValue={l.name} onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== l.name && update.mutate({ ...l, name: e.target.value.trim() })} className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none" aria-label={t('mail.settings.labels.name')} />
          <Secondary onClick={() => setDel(l)} className="hover:text-danger">
            <Trash2 className="size-3.5" />
          </Secondary>
        </div>
      ))}
      {labels.isFetched && !labels.data?.length && <p className="py-4 text-center text-sm text-muted">{t('mail.settings.labels.none')}</p>}
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) create.mutate();
        }}
      >
        <div className="flex gap-1">
          {COLORS.map((c) => (
            <button key={c} type="button" onClick={() => setColor(c)} className={clsx('size-5 rounded-full border-2', color === c ? 'border-ink' : 'border-transparent')} style={{ background: c }} aria-label={c} />
          ))}
        </div>
        <input value={name} onChange={(e) => setName(e.target.value)} className="input min-w-0 flex-1 py-2" placeholder={t('mail.settings.labels.name')} maxLength={60} />
        <button type="submit" className="btn-primary btn-sm" disabled={!name.trim() || create.isPending}>
          <Plus className="size-3.5" /> {t('mail.settings.labels.add')}
        </button>
      </form>
      <Confirm open={!!del} onClose={() => setDel(null)} onConfirm={() => del && remove.mutate(del.id)} title={t('mail.actions.delete')} message={t('mail.settings.labels.deleteConfirm', { name: del?.name ?? '' })} loading={remove.isPending} />
    </div>
  );
};

// ─── Rules ────────────────────────────────────────────────────────────

interface RuleForm {
  name: string;
  enabled: boolean;
  accountId: string;
  conditions: RuleConditions & { hasAttachment?: boolean };
  attachmentMode: 'any' | 'yes' | 'no';
  actions: RuleActions;
  caseRef: CaseRef | null;
}

const emptyRule = (): RuleForm => ({ name: '', enabled: true, accountId: '', conditions: { match: 'all', from: '', to: '', subject: '' }, attachmentMode: 'any', actions: {}, caseRef: null });

const RuleDialog = ({ open, onClose, rule, accounts }: { open: boolean; onClose: () => void; rule: MailRule | null; accounts: MailAccount[] }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const folders = useFolders();
  const labels = useLabels();
  const [form, setForm] = useState<RuleForm>(emptyRule);
  const [casePicker, setCasePicker] = useState(false);
  useEffect(() => {
    if (!open) return;
    setForm(
      rule
        ? {
            name: rule.name,
            enabled: rule.enabled,
            accountId: rule.accountId ?? '',
            conditions: { match: rule.conditions.match ?? 'all', from: rule.conditions.from ?? '', to: rule.conditions.to ?? '', subject: rule.conditions.subject ?? '' },
            attachmentMode: rule.conditions.hasAttachment === undefined ? 'any' : rule.conditions.hasAttachment ? 'yes' : 'no',
            actions: { ...rule.actions },
            caseRef: rule.actions.caseId ? { id: rule.actions.caseId, number: '…', clientName: '' } : null,
          }
        : emptyRule(),
    );
  }, [open, rule]);
  const set = (patch: Partial<RuleForm>) => setForm((f) => ({ ...f, ...patch }));
  const setC = (patch: Partial<RuleForm['conditions']>) => setForm((f) => ({ ...f, conditions: { ...f.conditions, ...patch } }));
  const setA = (patch: Partial<RuleActions>) => setForm((f) => ({ ...f, actions: { ...f.actions, ...patch } }));

  const body = () => {
    const conditions: RuleConditions = { match: form.conditions.match ?? 'all' };
    if (form.conditions.from?.trim()) conditions.from = form.conditions.from.trim();
    if (form.conditions.to?.trim()) conditions.to = form.conditions.to.trim();
    if (form.conditions.subject?.trim()) conditions.subject = form.conditions.subject.trim();
    if (form.attachmentMode !== 'any') conditions.hasAttachment = form.attachmentMode === 'yes';
    const actions: RuleActions = {};
    if (form.actions.addLabelId) actions.addLabelId = form.actions.addLabelId;
    if (form.actions.markRead) actions.markRead = true;
    if (form.actions.flag) actions.flag = true;
    if (form.actions.moveToFolderId) actions.moveToFolderId = form.actions.moveToFolderId;
    if (form.caseRef) actions.caseId = form.caseRef.id;
    return { name: form.name.trim(), enabled: form.enabled, accountId: form.accountId || null, conditions, actions };
  };
  const hasCondition = !!(form.conditions.from?.trim() || form.conditions.to?.trim() || form.conditions.subject?.trim() || form.attachmentMode !== 'any');
  const hasAction = !!(form.actions.addLabelId || form.actions.markRead || form.actions.flag || form.actions.moveToFolderId || form.caseRef);
  const save = useMutation({
    mutationFn: async () => (rule ? api.patch(`/mail/rules/${rule.id}`, body()) : api.post('/mail/rules', body())),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: mailKeys.rules });
      onClose();
    },
    onError: (err) => toast.error(errorText(err)),
  });
  const accountFolders = (folders.data?.folders ?? []).filter((f) => !form.accountId || f.accountId === form.accountId);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title={rule ? t('mail.settings.rules.edit') : t('mail.settings.rules.add')}
      footer={
        <>
          {!(hasCondition && hasAction) && <span className="mr-auto self-center text-xs text-muted">{t('mail.settings.rules.needCondition')}</span>}
          <Secondary onClick={onClose}>{t('mail.actions.cancel')}</Secondary>
          <button type="button" className="btn-primary btn-sm" disabled={!form.name.trim() || !hasCondition || !hasAction || save.isPending} onClick={() => save.mutate()}>
            {t('mail.actions.save')}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
          <Field label={t('mail.settings.rules.name')}>
            <input value={form.name} onChange={(e) => set({ name: e.target.value })} className="input" data-autofocus maxLength={80} />
          </Field>
          <Field label={t('mail.settings.rules.account')}>
            <select value={form.accountId} onChange={(e) => set({ accountId: e.target.value })} className="input">
              <option value="">{t('mail.settings.rules.anyAccount')}</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.email}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <fieldset className="rounded-xl border border-line p-3">
          <legend className="px-1 text-xs font-bold text-muted">{t('mail.settings.rules.when')}</legend>
          <div className="mb-2 flex gap-4 text-sm">
            <label className="inline-flex items-center gap-1.5">
              <input type="radio" checked={form.conditions.match !== 'any'} onChange={() => setC({ match: 'all' })} className="accent-brand-600" /> {t('mail.settings.rules.matchAll')}
            </label>
            <label className="inline-flex items-center gap-1.5">
              <input type="radio" checked={form.conditions.match === 'any'} onChange={() => setC({ match: 'any' })} className="accent-brand-600" /> {t('mail.settings.rules.matchAny')}
            </label>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label={t('mail.settings.rules.from')}>
              <input value={form.conditions.from ?? ''} onChange={(e) => setC({ from: e.target.value })} className="input py-2" />
            </Field>
            <Field label={t('mail.settings.rules.to')}>
              <input value={form.conditions.to ?? ''} onChange={(e) => setC({ to: e.target.value })} className="input py-2" />
            </Field>
            <Field label={t('mail.settings.rules.subject')}>
              <input value={form.conditions.subject ?? ''} onChange={(e) => setC({ subject: e.target.value })} className="input py-2" />
            </Field>
            <Field label={t('mail.settings.rules.hasAttachment')}>
              <select value={form.attachmentMode} onChange={(e) => set({ attachmentMode: e.target.value as RuleForm['attachmentMode'] })} className="input py-2">
                <option value="any">{t('mail.settings.rules.hasAttachmentAny')}</option>
                <option value="yes">{t('mail.settings.rules.hasAttachmentYes')}</option>
                <option value="no">{t('mail.settings.rules.hasAttachmentNo')}</option>
              </select>
            </Field>
          </div>
        </fieldset>
        <fieldset className="rounded-xl border border-line p-3">
          <legend className="px-1 text-xs font-bold text-muted">{t('mail.settings.rules.then')}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label={t('mail.settings.rules.addLabel')}>
              <select value={form.actions.addLabelId ?? ''} onChange={(e) => setA({ addLabelId: e.target.value || undefined })} className="input py-2">
                <option value="">{t('mail.settings.rules.noAction')}</option>
                {(labels.data ?? []).map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('mail.settings.rules.moveTo')}>
              <select value={form.actions.moveToFolderId ?? ''} onChange={(e) => setA({ moveToFolderId: e.target.value || undefined })} className="input py-2">
                <option value="">{t('mail.settings.rules.noAction')}</option>
                {accountFolders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {accounts.length > 1 ? `${accounts.find((a) => a.id === f.accountId)?.email ?? ''} · ` : ''}
                    {folderLabel(f, t)}
                  </option>
                ))}
              </select>
            </Field>
            <div className="flex flex-col gap-2 pt-1">
              <Toggle checked={!!form.actions.markRead} onChange={(v) => setA({ markRead: v || undefined })} label={t('mail.settings.rules.markRead')} />
              <Toggle checked={!!form.actions.flag} onChange={(v) => setA({ flag: v || undefined })} label={t('mail.settings.rules.flag')} />
            </div>
            <div>
              <span className="label">{t('mail.settings.rules.linkCase')}</span>
              {form.caseRef ? (
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2 py-1.5 text-sm">
                  <Briefcase className="size-3.5 text-brand-600" /> {form.caseRef.number}
                  <button type="button" onClick={() => set({ caseRef: null })} className="text-muted hover:text-danger" aria-label={t('mail.actions.delete')}>
                    <X className="size-3.5" />
                  </button>
                </span>
              ) : (
                <Secondary onClick={() => setCasePicker(true)}>
                  <Briefcase className="size-3.5" /> {t('mail.actions.selectCase')}
                </Secondary>
              )}
            </div>
          </div>
        </fieldset>
        <Toggle checked={form.enabled} onChange={(v) => set({ enabled: v })} label={t('mail.settings.rules.enabled')} />
      </div>
      <CasePickerDialog
        open={casePicker}
        onClose={() => setCasePicker(false)}
        onPick={(c) => {
          setCasePicker(false);
          set({ caseRef: c });
        }}
      />
    </Dialog>
  );
};

const RulesTab = ({ accounts }: { accounts: MailAccount[] }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const rules = useRules();
  const [edit, setEdit] = useState<MailRule | null | 'new'>(null);
  const [del, setDel] = useState<MailRule | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const refresh = () => void qc.invalidateQueries({ queryKey: mailKeys.rules });
  const toggle = useMutation({ mutationFn: async (r: MailRule) => api.patch(`/mail/rules/${r.id}`, { enabled: !r.enabled }), onSuccess: refresh, onError: (err) => toast.error(errorText(err)) });
  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`/mail/rules/${id}`),
    onSuccess: () => {
      setDel(null);
      refresh();
    },
    onError: (err) => toast.error(errorText(err)),
  });
  const run = async (r: MailRule) => {
    setRunning(r.id);
    try {
      const res = await api.post<{ matched: number }>(`/mail/rules/${r.id}/run`);
      toast.success(t('mail.settings.rules.runResult', { count: res.data.matched }));
      void qc.invalidateQueries({ queryKey: ['mail'] });
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setRunning(null);
    }
  };
  const describe = (r: MailRule) => {
    const c: string[] = [];
    if (r.conditions.from) c.push(`${t('mail.settings.rules.from')} "${r.conditions.from}"`);
    if (r.conditions.to) c.push(`${t('mail.settings.rules.to')} "${r.conditions.to}"`);
    if (r.conditions.subject) c.push(`${t('mail.settings.rules.subject')} "${r.conditions.subject}"`);
    if (r.conditions.hasAttachment !== undefined) c.push(`${t('mail.settings.rules.hasAttachment')}: ${r.conditions.hasAttachment ? t('mail.settings.rules.hasAttachmentYes') : t('mail.settings.rules.hasAttachmentNo')}`);
    const a: string[] = [];
    if (r.actions.addLabelId) a.push(t('mail.settings.rules.addLabel'));
    if (r.actions.markRead) a.push(t('mail.settings.rules.markRead'));
    if (r.actions.flag) a.push(t('mail.settings.rules.flag'));
    if (r.actions.moveToFolderId) a.push(t('mail.settings.rules.moveTo'));
    if (r.actions.caseId) a.push(t('mail.settings.rules.linkCase'));
    return `${c.join(r.conditions.match === 'any' ? ' | ' : ' & ')} → ${a.join(', ')}`;
  };
  return (
    <div className="space-y-3">
      {(rules.data ?? []).map((r) => (
        <div key={r.id} className={clsx('flex items-center gap-2 rounded-xl border border-line px-3 py-2', !r.enabled && 'opacity-60')}>
          <input type="checkbox" checked={r.enabled} onChange={() => toggle.mutate(r)} className="size-4 accent-brand-600" aria-label={t('mail.settings.rules.enabled')} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ink">{r.name}</p>
            <p className="truncate text-xs text-muted">{describe(r)}</p>
          </div>
          <Secondary onClick={() => void run(r)} disabled={running === r.id}>
            {running === r.id ? <Spinner className="size-3.5" /> : <Play className="size-3.5" />} <span className="hidden sm:inline">{t('mail.settings.rules.run')}</span>
          </Secondary>
          <Secondary onClick={() => setEdit(r)}>
            <Pencil className="size-3.5" />
          </Secondary>
          <Secondary onClick={() => setDel(r)} className="hover:text-danger">
            <Trash2 className="size-3.5" />
          </Secondary>
        </div>
      ))}
      {rules.isFetched && !rules.data?.length && <p className="py-4 text-center text-sm text-muted">{t('mail.settings.rules.none')}</p>}
      <button type="button" className="btn-primary btn-sm" onClick={() => setEdit('new')}>
        <Plus className="size-3.5" /> {t('mail.settings.rules.add')}
      </button>
      <RuleDialog open={edit !== null} onClose={() => setEdit(null)} rule={edit === 'new' ? null : edit} accounts={accounts} />
      <Confirm open={!!del} onClose={() => setDel(null)} onConfirm={() => del && remove.mutate(del.id)} title={t('mail.actions.delete')} message={t('mail.settings.rules.deleteConfirm', { name: del?.name ?? '' })} loading={remove.isPending} />
    </div>
  );
};

// ─── Templates ────────────────────────────────────────────────────────

const TemplateDialog = ({ open, onClose, template }: { open: boolean; onClose: () => void; template: MailTemplate | null }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: '', subject: '', body: '', shared: false });
  useEffect(() => {
    if (open) setForm(template ? { name: template.name, subject: template.subject ?? '', body: template.html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>\s*<p>/gi, '\n').replace(/<[^>]+>/g, ''), shared: template.shared } : { name: '', subject: '', body: '', shared: false });
  }, [open, template]);
  const save = useMutation({
    mutationFn: async () => {
      const html = `<div>${form.body
        .split('\n')
        .map((l) => l.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!))
        .join('<br>')}</div>`;
      const body = { name: form.name.trim(), subject: form.subject.trim() || null, html, shared: form.shared };
      return template ? api.patch(`/mail/templates/${template.id}`, body) : api.post('/mail/templates', body);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: mailKeys.templates });
      onClose();
    },
    onError: (err) => toast.error(errorText(err)),
  });
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title={template ? t('mail.settings.templates.edit') : t('mail.settings.templates.add')}
      footer={
        <>
          <Secondary onClick={onClose}>{t('mail.actions.cancel')}</Secondary>
          <button type="button" className="btn-primary btn-sm" disabled={!form.name.trim() || !form.body.trim() || save.isPending} onClick={() => save.mutate()}>
            {t('mail.actions.save')}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label={t('mail.settings.templates.name')}>
          <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="input" data-autofocus maxLength={80} />
        </Field>
        <Field label={t('mail.settings.templates.subject')}>
          <input value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} className="input" maxLength={300} />
        </Field>
        <Field label={t('mail.settings.templates.body')}>
          <textarea value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} rows={8} className="input text-sm" />
        </Field>
        <Toggle checked={form.shared} onChange={(v) => setForm((f) => ({ ...f, shared: v }))} label={t('mail.settings.templates.shared')} />
      </div>
    </Dialog>
  );
};

const TemplatesTab = () => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const templates = useTemplates();
  const [edit, setEdit] = useState<MailTemplate | null | 'new'>(null);
  const [del, setDel] = useState<MailTemplate | null>(null);
  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`/mail/templates/${id}`),
    onSuccess: () => {
      setDel(null);
      void qc.invalidateQueries({ queryKey: mailKeys.templates });
    },
    onError: (err) => toast.error(errorText(err)),
  });
  return (
    <div className="space-y-3">
      {(templates.data ?? []).map((tpl) => (
        <div key={tpl.id} className="flex items-center gap-2 rounded-xl border border-line px-3 py-2">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-ink">
              {tpl.name}
              {tpl.shared && (
                <span className="inline-flex items-center gap-1 rounded-md bg-brand-100 px-1.5 text-[0.65rem] text-brand-700">
                  <Share2 className="size-3" /> {t('mail.settings.templates.sharedBadge')}
                </span>
              )}
            </p>
            <p className="truncate text-xs text-muted">
              {tpl.subject ? `${tpl.subject} · ` : ''}
              {!tpl.mine && tpl.author ? t('mail.settings.templates.by', { name: tpl.author }) : ''}
            </p>
          </div>
          {tpl.canEdit && (
            <>
              <Secondary onClick={() => setEdit(tpl)}>
                <Pencil className="size-3.5" />
              </Secondary>
              <Secondary onClick={() => setDel(tpl)} className="hover:text-danger">
                <Trash2 className="size-3.5" />
              </Secondary>
            </>
          )}
        </div>
      ))}
      {templates.isFetched && !templates.data?.length && <p className="py-4 text-center text-sm text-muted">{t('mail.settings.templates.none')}</p>}
      <button type="button" className="btn-primary btn-sm" onClick={() => setEdit('new')}>
        <Plus className="size-3.5" /> {t('mail.settings.templates.add')}
      </button>
      <TemplateDialog open={edit !== null} onClose={() => setEdit(null)} template={edit === 'new' ? null : edit} />
      <Confirm open={!!del} onClose={() => setDel(null)} onConfirm={() => del && remove.mutate(del.id)} title={t('mail.actions.delete')} message={t('mail.settings.templates.deleteConfirm', { name: del?.name ?? '' })} loading={remove.isPending} />
    </div>
  );
};

// ─── Dialog shell ─────────────────────────────────────────────────────

export const MailSettingsDialog = ({ open, onClose, initialTab = 'accounts', accounts }: { open: boolean; onClose: () => void; initialTab?: SettingsTab; accounts: MailAccount[] }) => {
  const { t } = useTranslation();
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  useEffect(() => {
    if (open) setTab(initialTab);
  }, [open, initialTab]);
  // "Mailbox security" only for staff with a mailbox on our own mail server.
  const own = useMyMailboxes(open);
  const tabs: SettingsTab[] = own.data?.mailboxes.length ? [...TABS, 'security'] : TABS;
  const content = useMemo(() => {
    switch (tab) {
      case 'accounts':
        return <AccountsTab accounts={accounts} />;
      case 'signatures':
        return <SignaturesTab accounts={accounts} />;
      case 'labels':
        return <LabelsTab />;
      case 'rules':
        return <RulesTab accounts={accounts} />;
      case 'templates':
        return <TemplatesTab />;
      case 'security':
        return <MailboxSecurityTab />;
    }
  }, [tab, accounts]);
  return (
    <Dialog open={open} onClose={onClose} size="xl" title={t('mail.settings.title')}>
      <div className="-mt-1 mb-4 flex flex-wrap gap-1 border-b border-line">
        {tabs.map((x) => (
          <button key={x} type="button" onClick={() => setTab(x)} className={clsx('-mb-px border-b-2 px-3 py-2 text-sm font-semibold', tab === x ? 'border-brand-600 text-brand-700' : 'border-transparent text-muted hover:text-ink')}>
            {x === 'security' ? t('mailAdmin.security.tab') : t(`mail.settings.tabs.${x}`)}
          </button>
        ))}
      </div>
      {content}
    </Dialog>
  );
};

export { AccountDialog };
