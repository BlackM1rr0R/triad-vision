import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { toast } from 'sonner';
import { AlertTriangle, Clock, FileText, PenLine, Settings2, Signature as SignatureIcon } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { EmptyState, ErrorBlock, LoadingBlock, PageHead, Panel, Switch } from '@/components/admin/ui';
import { Tabs } from '@/components/ui/Tabs';
import { Modal } from '@/components/admin/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { fmtDate } from '@/components/admin/labels';
import { SignaturePad, type SignaturePadHandle } from '@/components/portal/SignaturePad';
import { acctErrText, type CountersignItem, type CountersignSettings, type SignatoryCandidate } from '@/components/accounting/api';

const KEY = ['admin', 'countersign'] as const;

/** Admin → Countersignature: service contracts signed by the client that wait for Triad Vision (server lib/esign/countersign.ts). */
export default function AdminCountersign() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'settings' ? 'settings' : 'list';
  const setTab = (v: 'list' | 'settings') => {
    const next = new URLSearchParams(params);
    if (v === 'settings') next.set('tab', 'settings');
    else next.delete('tab');
    setParams(next, { replace: true });
  };
  return (
    <div>
      <PageHead title={t('admin.nav.countersign')} subtitle={t('cs.subtitle')} />
      <Tabs
        className="mb-5"
        label={t('cs.tabs.list')}
        items={(['list', 'settings'] as const).map((v) => ({ key: v, icon: v === 'list' ? SignatureIcon : Settings2, label: t(`cs.tabs.${v}`) }))}
        value={tab}
        onChange={setTab}
      />
      {tab === 'list' ? <PendingList /> : <SettingsTab />}
    </div>
  );
}

const PendingList = () => {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const q = useQuery({
    queryKey: [...KEY, 'list'],
    queryFn: async () => (await api.get<{ items: CountersignItem[]; enabled: boolean; authorised: boolean; reminderDays: number }>('/admin/countersign')).data,
  });
  const [signing, setSigning] = useState<CountersignItem | null>(null);
  const openId = params.get('open');
  useEffect(() => {
    if (!openId || !q.data) return;
    const item = q.data.items.find((i) => i.signerId === openId);
    if (item?.canSign) setSigning(item);
    const next = new URLSearchParams(params);
    next.delete('open');
    setParams(next, { replace: true });
  }, [openId, q.data, params, setParams]);

  if (q.isLoading) return <LoadingBlock />;
  if (q.error || !q.data) return <ErrorBlock error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data;

  return (
    <>
      {!d.enabled && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-warning-border bg-warning-bg p-3.5 text-sm text-warning-fg" role="status">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p className="min-w-0">{t('cs.disabled')}</p>
        </div>
      )}
      {d.items.length === 0 ? (
        <div className="rounded-xl border border-line bg-card">
          <EmptyState icon={SignatureIcon} title={t('cs.empty')}>
            {t('cs.emptyText')}
          </EmptyState>
        </div>
      ) : (
        <ul className="space-y-3">
          {d.items.map((i) => (
            <li key={i.signerId} className="rounded-xl border border-line bg-card p-4">
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-ink">{i.title}</span>
                    <span className="badge bg-sunken text-muted">{t(`cs.kind.${i.kind}`)}</span>
                    {i.case && (
                      <Link to={`/admin/cases/${i.case.id}`} className="text-xs font-semibold text-link hover:underline">
                        {i.case.number}
                      </Link>
                    )}
                  </p>
                  <ul className="mt-1 space-y-0.5 text-xs text-muted">
                    {i.clientSigners.map((c) => (
                      <li key={`${c.name}-${c.signedAt}`}>{t('cs.clientSigned', { name: c.name, date: c.signedAt ? fmtDate(c.signedAt) : '—' })}</li>
                    ))}
                    <li>{t('cs.assigned', { name: i.mine ? t('cs.you') : i.assignedTo.name })}</li>
                  </ul>
                </div>
                <span className={clsx('inline-flex items-center gap-1 text-xs font-semibold', i.overdue ? 'text-danger-fg' : 'text-muted')}>
                  <Clock className="size-3.5" aria-hidden /> {t('cs.waiting', { count: i.waitingDays })}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap justify-end gap-2">
                <a className="btn-secondary btn-sm" href={`/api/admin/signatures/${i.requestId}/document?version=original`} target="_blank" rel="noreferrer">
                  <FileText className="size-3.5" aria-hidden /> {t('cs.preview')}
                </a>
                <button type="button" className="btn-primary btn-sm" disabled={!i.canSign} title={i.canSign ? undefined : t('cs.notAuthorised')} onClick={() => setSigning(i)}>
                  <PenLine className="size-3.5" aria-hidden /> {t('cs.countersign')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {signing && <SignDialog item={signing} onClose={() => setSigning(null)} />}
    </>
  );
};

const SignDialog = ({ item, onClose }: { item: CountersignItem; onClose: () => void }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { user } = useAuth();
  const padRef = useRef<SignaturePadHandle>(null);
  const [mode, setMode] = useState<'DRAW' | 'TYPE'>('DRAW');
  const [padEmpty, setPadEmpty] = useState(true);
  const [typed, setTyped] = useState(user ? `${user.firstName} ${user.lastName}`.trim() : '');
  const [agree, setAgree] = useState(false);
  const sign = useMutation({
    mutationFn: async () => {
      const body = mode === 'DRAW' ? { mode, signature: padRef.current?.toDataURL() ?? '', agree: true } : { mode, typedName: typed.trim(), agree: true };
      return (await api.post(`/admin/countersign/${item.signerId}`, body)).data;
    },
    onSuccess: () => {
      toast.success(t('cs.done'));
      void qc.invalidateQueries({ queryKey: KEY });
      void qc.invalidateQueries({ queryKey: ['my-work'] });
      onClose();
    },
    onError: (e) => toast.error(acctErrText(e)),
  });
  const ready = agree && (mode === 'DRAW' ? !padEmpty : typed.trim().length >= 2);

  return (
    <Modal
      open
      onClose={() => !sign.isPending && onClose()}
      title={t('cs.modal.title')}
      footer={
        <>
          <button type="button" className="btn-secondary btn-sm" onClick={onClose} disabled={sign.isPending}>
            {t('acct.cancel')}
          </button>
          <button type="button" className="btn-primary btn-sm" disabled={!ready || sign.isPending} onClick={() => sign.mutate()}>
            {sign.isPending && <Spinner className="size-3.5" />}
            {t('cs.modal.sign')}
          </button>
        </>
      }
    >
      <p className="mb-3 text-sm font-semibold text-ink">{item.title}</p>
      <div className="mb-3 inline-flex rounded-lg border border-line p-0.5" role="group">
        {(['DRAW', 'TYPE'] as const).map((m) => (
          <button key={m} type="button" aria-pressed={mode === m} className={clsx('rounded-md px-3 py-1.5 text-sm font-semibold', mode === m ? 'bg-primary text-primary-contrast' : 'text-ink hover:bg-sunken')} onClick={() => setMode(m)}>
            {m === 'DRAW' ? t('cs.modal.draw') : t('cs.modal.type')}
          </button>
        ))}
      </div>
      {mode === 'DRAW' ? (
        <SignaturePad ref={padRef} onChange={setPadEmpty} label={t('cs.modal.title')} />
      ) : (
        <div>
          <label className="label" htmlFor="cs-typed">
            {t('cs.modal.typed')}
          </label>
          <input id="cs-typed" className="input font-[cursive] text-lg" maxLength={160} value={typed} onChange={(e) => setTyped(e.target.value)} />
        </div>
      )}
      <label className="mt-4 flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-0.5" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
        <span>{t('cs.modal.agree')}</span>
      </label>
      <p className="mt-2 text-[11px] text-muted">{t('cs.modal.legal')}</p>
    </Modal>
  );
};

const SettingsTab = () => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: [...KEY, 'settings'],
    queryFn: async () => (await api.get<{ settings: CountersignSettings; candidates: SignatoryCandidate[] }>('/admin/countersign/settings')).data,
  });
  const [form, setForm] = useState<CountersignSettings | null>(null);
  useEffect(() => {
    if (q.data) setForm(q.data.settings);
  }, [q.data]);
  const save = useMutation({
    mutationFn: async (s: CountersignSettings) => (await api.put('/admin/countersign/settings', s)).data,
    onSuccess: () => {
      toast.success(t('acct.saved'));
      void qc.invalidateQueries({ queryKey: KEY });
    },
    onError: (e) => toast.error(acctErrText(e)),
  });
  if (q.isLoading || !form) return q.error ? <ErrorBlock error={q.error} onRetry={() => q.refetch()} /> : <LoadingBlock />;
  const set = (patch: Partial<CountersignSettings>) => setForm((f) => (f ? { ...f, ...patch } : f));
  const toggle = (id: string) => set({ signatoryIds: form.signatoryIds.includes(id) ? form.signatoryIds.filter((x) => x !== id) : [...form.signatoryIds, id] });
  const chosen = (q.data?.candidates ?? []).filter((c) => form.signatoryIds.includes(c.id));

  return (
    <Panel title={t('cs.tabs.settings')} icon={Settings2}>
      <div className="space-y-5">
        <div>
          <Switch checked={form.enabled} onChange={(v) => set({ enabled: v })} label={t('cs.settings.enabled')} />
          <p className="mt-2 text-xs text-muted">{t('cs.settings.flow')}</p>
        </div>
        <fieldset>
          <legend className="label">{t('cs.settings.signatories')}</legend>
          <ul className="grid gap-2 sm:grid-cols-2">
            {(q.data?.candidates ?? []).map((c) => (
              <li key={c.id}>
                <label className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm">
                  <input type="checkbox" checked={form.signatoryIds.includes(c.id)} onChange={() => toggle(c.id)} />
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-ink">
                      {c.firstName} {c.lastName}
                    </span>
                    <span className="block truncate text-xs text-muted">{c.email}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="cs-default">
              {t('cs.settings.defaultSigner')}
            </label>
            <select id="cs-default" className="input" value={form.defaultSignerId ?? ''} onChange={(e) => set({ defaultSignerId: e.target.value || null })}>
              <option value="">—</option>
              {chosen.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.firstName} {c.lastName}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="cs-days">
              {t('cs.settings.reminderDays')}
            </label>
            <input id="cs-days" type="number" min={1} max={14} className="input" value={form.reminderDays} onChange={(e) => set({ reminderDays: Math.max(1, Math.min(14, Number(e.target.value) || 2)) })} />
          </div>
        </div>
        <div className="space-y-2">
          <Switch checked={form.packageOrders} onChange={(v) => set({ packageOrders: v })} label={t('cs.settings.packageOrders')} />
          <Switch checked={form.caseContracts} onChange={(v) => set({ caseContracts: v })} label={t('cs.settings.caseContracts')} />
        </div>
        <div className="flex justify-end">
          <button type="button" className="btn-primary btn-sm" disabled={save.isPending} onClick={() => save.mutate(form)}>
            {save.isPending && <Spinner className="size-3.5" />}
            {t('acct.save')}
          </button>
        </div>
      </div>
    </Panel>
  );
};
