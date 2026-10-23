import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { Plus, Trash2 } from 'lucide-react';
import { api, errorCode } from '@/lib/api';
import { Modal } from '@/components/admin/Modal';
import { SignaturePad } from './SignaturePad';
import { ACT_ACTIONS, CARRIERS, KINDS, allowedActions, originalsKey, type Action, type ActBody, type ActResult, type Kind, type Original } from './api';

export const useOriginalError = () => {
  const { t } = useTranslation();
  return (err: unknown) => {
    const code = errorCode(err);
    toast.error(t(`originals.errors.${code}`, { defaultValue: t('originals.error') }));
  };
};

const actToast = (t: (k: string) => string, act: ActResult | null | undefined) => {
  if (!act) return toast.success(t('originals.saved'));
  toast.success(act.emailed ? `${t('originals.act.created')} · ${t('originals.act.emailed')}` : t('originals.act.created'));
};

/** Act options: create act, condition, signature pads (client + staff), e-mail to the client. */
const ActFields = ({ value, onChange, optional }: { value: ActBody; onChange: (v: ActBody) => void; optional?: boolean }) => {
  const { t } = useTranslation();
  const on = value.act !== false;
  return (
    <div className="space-y-3 rounded-xl border border-line bg-surface/40 p-3">
      {optional && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={on} onChange={(e) => onChange({ ...value, act: e.target.checked })} />
          {t('originals.form.act')}
        </label>
      )}
      {on && (
        <>
          <label className="block">
            <span className="label mb-1 block">{t('originals.form.condition')}</span>
            <input className="input" value={value.condition ?? ''} maxLength={2000} placeholder={t('originals.form.conditionPlaceholder')} onChange={(e) => onChange({ ...value, condition: e.target.value })} />
          </label>
          <p className="text-xs font-semibold text-muted">{t('originals.form.signatures')}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <SignaturePad label={t('originals.form.signClient')} onChange={(png) => onChange({ ...value, signatures: { ...value.signatures, client: png } })} />
            <SignaturePad label={t('originals.form.signStaff')} onChange={(png) => onChange({ ...value, signatures: { ...value.signatures, staff: png } })} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={!!value.email} onChange={(e) => onChange({ ...value, email: e.target.checked })} />
            {t('originals.form.email')}
          </label>
        </>
      )}
    </div>
  );
};

interface Row {
  title: string;
  kind: Kind;
  note: string;
}

/** Bulk receive from the client: several originals, one act. */
export const ReceiveDialog = ({ caseId, open, onClose }: { caseId: string; open: boolean; onClose: () => void }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const onError = useOriginalError();
  const [rows, setRows] = useState<Row[]>([{ title: '', kind: 'PASSPORT', note: '' }]);
  const [location, setLocation] = useState('');
  const [act, setAct] = useState<ActBody>({ act: true });
  const reset = () => {
    setRows([{ title: '', kind: 'PASSPORT', note: '' }]);
    setLocation('');
    setAct({ act: true });
  };
  const save = useMutation({
    mutationFn: async () =>
      (
        await api.post<{ act: ActResult | null }>(`/originals/cases/${caseId}/receive`, {
          items: rows.filter((r) => r.title.trim()).map((r) => ({ title: r.title.trim(), kind: r.kind, note: r.note.trim() || null })),
          location: location.trim() || null,
          ...act,
        })
      ).data,
    onSuccess: (d) => {
      actToast(t, d.act);
      void qc.invalidateQueries({ queryKey: originalsKey });
      reset();
      onClose();
    },
    onError,
  });
  const valid = rows.some((r) => r.title.trim());
  const setRow = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...patch } : r)));

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={t('originals.receive.title')}
      description={t('originals.receive.hint')}
      footer={
        <>
          <button type="button" className="btn-secondary btn-sm" onClick={onClose}>
            {t('originals.form.cancel')}
          </button>
          <button type="button" className="btn-primary btn-sm" disabled={!valid || save.isPending} onClick={() => save.mutate()}>
            {t('originals.form.submit')}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-[10rem_minmax(0,1fr)_minmax(0,0.8fr)_auto]">
            <select className="input" value={r.kind} aria-label={t('originals.form.kind')} onChange={(e) => setRow(i, { kind: e.target.value as Kind })}>
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {t(`originals.kinds.${k}`)}
                </option>
              ))}
            </select>
            <input className="input" value={r.title} maxLength={160} aria-label={t('originals.form.title')} placeholder={t('originals.form.titlePlaceholder')} onChange={(e) => setRow(i, { title: e.target.value })} />
            <input className="input" value={r.note} maxLength={2000} aria-label={t('originals.form.note')} placeholder={t('originals.form.note')} onChange={(e) => setRow(i, { note: e.target.value })} />
            <button
              type="button"
              className="grid size-10 place-items-center rounded-lg text-muted hover:bg-surface hover:text-danger disabled:opacity-40"
              disabled={rows.length === 1}
              onClick={() => setRows((rs) => rs.filter((_, k) => k !== i))}
              aria-label={t('originals.form.removeRow')}
            >
              <Trash2 className="size-4" aria-hidden />
            </button>
          </div>
        ))}
        <button type="button" className="btn-ghost btn-sm" onClick={() => setRows((rs) => [...rs, { title: '', kind: 'DIPLOMA', note: '' }])}>
          <Plus className="size-4" aria-hidden /> {t('originals.form.addRow')}
        </button>
        <label className="block">
          <span className="label mb-1 block">{t('originals.form.location')}</span>
          <input className="input" value={location} maxLength={120} placeholder={t('originals.form.locationPlaceholder')} onChange={(e) => setLocation(e.target.value)} />
        </label>
        <ActFields value={act} onChange={setAct} optional />
      </div>
    </Modal>
  );
};

/** One movement for one or several originals (same case, same status). */
export const EventDialog = ({ originals, open, onClose, initial }: { originals: Original[]; open: boolean; onClose: () => void; initial?: Action }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const onError = useOriginalError();
  const status = originals[0]?.status;
  const options = status ? allowedActions(status).filter((a) => originals.every((o) => allowedActions(o.status).includes(a))) : [];
  const [action, setAction] = useState<Action | ''>(initial && options.includes(initial) ? initial : '');
  const [form, setForm] = useState({ location: '', holder: '', carrier: 'DHL', trackingNo: '', note: '' });
  const [act, setAct] = useState<ActBody>({ act: true });
  const current = action || options[0];
  const save = useMutation({
    mutationFn: async () => {
      const body = {
        action: current,
        location: form.location.trim() || null,
        holder: form.holder.trim() || null,
        carrier: current === 'SENT_BY_COURIER' ? form.carrier : null,
        trackingNo: form.trackingNo.trim() || null,
        note: form.note.trim() || null,
        ...(ACT_ACTIONS.includes(current) ? act : { act: false }),
      };
      if (originals.length === 1) return (await api.post<{ act: ActResult | null }>(`/originals/${originals[0].id}/events`, body)).data;
      return (await api.post<{ act: ActResult | null }>('/originals/events/bulk', { ...body, ids: originals.map((o) => o.id) })).data;
    },
    onSuccess: (d) => {
      actToast(t, d.act);
      void qc.invalidateQueries({ queryKey: originalsKey });
      onClose();
    },
    onError,
  });
  if (!current) return null;
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const needsLocation = current === 'STORED' || current === 'RETURNED_TO_OFFICE' || current === 'APOSTILLE_BACK' || current === 'RECEIVED';
  const needsHolder = current === 'GIVEN_OUT' || current === 'SENT_TO_APOSTILLE' || current === 'SENT_BY_COURIER';
  const valid = (current !== 'STORED' || form.location.trim()) && (current !== 'GIVEN_OUT' || form.holder.trim());

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={t('originals.event.title')}
      description={originals.length === 1 ? `${originals[0].title} · ${originals[0].case.client.name}` : t('originals.event.several', { count: originals.length })}
      footer={
        <>
          <button type="button" className="btn-secondary btn-sm" onClick={onClose}>
            {t('originals.form.cancel')}
          </button>
          <button type="button" className="btn-primary btn-sm" disabled={!valid || save.isPending} onClick={() => save.mutate()}>
            {t('originals.form.submit')}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <fieldset>
          <legend className="label mb-1.5">{t('originals.event.choose')}</legend>
          <div className="flex flex-wrap gap-1.5">
            {options.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setAction(a)}
                aria-pressed={current === a}
                className={clsx('min-h-9 rounded-full border px-3 text-xs font-semibold transition', current === a ? 'border-brand-600 bg-brand-600 text-white' : 'border-line bg-white text-ink hover:border-brand-300')}
              >
                {t(`originals.actions.${a}`)}
              </button>
            ))}
          </div>
        </fieldset>
        {needsLocation && (
          <label className="block">
            <span className="label mb-1 block">{t('originals.form.location')}</span>
            <input className="input" value={form.location} maxLength={120} placeholder={t('originals.form.locationPlaceholder')} onChange={set('location')} />
          </label>
        )}
        {needsHolder && (
          <label className="block">
            <span className="label mb-1 block">{t('originals.form.holder')}</span>
            <input className="input" value={form.holder} maxLength={160} placeholder={t('originals.form.holderPlaceholder')} onChange={set('holder')} />
          </label>
        )}
        {current === 'SENT_BY_COURIER' && (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="label mb-1 block">{t('originals.form.carrier')}</span>
              <select className="input" value={form.carrier} onChange={set('carrier')}>
                {CARRIERS.map((c) => (
                  <option key={c} value={c}>
                    {t(`originals.carriers.${c}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="label mb-1 block">{t('originals.form.trackingNo')}</span>
              <input className="input font-mono" value={form.trackingNo} maxLength={80} onChange={set('trackingNo')} />
            </label>
          </div>
        )}
        {!ACT_ACTIONS.includes(current) && (
          <label className="block">
            <span className="label mb-1 block">{t('originals.form.note')}</span>
            <input className="input" value={form.note} maxLength={2000} onChange={set('note')} />
          </label>
        )}
        {ACT_ACTIONS.includes(current) && <ActFields key={current} value={act} onChange={setAct} optional />}
      </div>
    </Modal>
  );
};

/** Sign an existing act on screen (saved as a new version of the act file). */
export const SignActDialog = ({ eventId, open, onClose }: { eventId: string | null; open: boolean; onClose: () => void }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const onError = useOriginalError();
  const [sig, setSig] = useState<{ client?: string | null; staff?: string | null }>({});
  const [email, setEmail] = useState(false);
  const save = useMutation({
    mutationFn: async () => (await api.post<{ emailed: boolean }>(`/originals/events/${eventId}/sign`, { ...sig, email })).data,
    onSuccess: (d) => {
      toast.success(d.emailed ? `${t('originals.act.signed')} · ${t('originals.act.emailed')}` : t('originals.act.signed'));
      void qc.invalidateQueries({ queryKey: originalsKey });
      setSig({});
      onClose();
    },
    onError,
  });
  return (
    <Modal
      open={open && !!eventId}
      onClose={onClose}
      size="lg"
      title={t('originals.act.signTitle')}
      footer={
        <>
          <button type="button" className="btn-secondary btn-sm" onClick={onClose}>
            {t('originals.form.cancel')}
          </button>
          <button type="button" className="btn-primary btn-sm" disabled={(!sig.client && !sig.staff) || save.isPending} onClick={() => save.mutate()}>
            {t('originals.form.save')}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <SignaturePad label={t('originals.form.signClient')} onChange={(png) => setSig((s) => ({ ...s, client: png }))} />
          <SignaturePad label={t('originals.form.signStaff')} onChange={(png) => setSig((s) => ({ ...s, staff: png }))} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={email} onChange={(e) => setEmail(e.target.checked)} />
          {t('originals.form.email')}
        </label>
      </div>
    </Modal>
  );
};
