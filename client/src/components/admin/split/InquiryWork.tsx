import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { Building2, CheckCircle2, Handshake, ShieldOff, UserCheck, UserPlus } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { registerCopy } from '@/i18n';
import { pagesInquiries } from '@/i18n/pagesInquiries';
import { fmtDate, fullName, toastError } from '@/components/admin/labels';
import type { Inquiry } from '@/components/admin/types';
import { useStaffOptions } from '@/components/inline/CaseInlineCells';
import { useCompanyOptions } from '@/components/admin/case/caseLinks';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { SECTORS } from '@/components/jobs/types';

registerCopy(pagesInquiries);

/** Root query keys of the leads page (list pages + one lead); every change here refreshes both. */
export const INQUIRY_LIST_ROOT = ['admin-inquiries'] as const;
export const inquiryItemKey = (id: string) => ['admin-inquiry', id] as const;

const useRefresh = (id: string) => {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: INQUIRY_LIST_ROOT });
    void qc.invalidateQueries({ queryKey: inquiryItemKey(id) });
    void qc.invalidateQueries({ queryKey: ['my-work'] });
  };
};

/** Small badges of a lead: agent / partner who brought it, converted, anonymised. */
export const InquiryBadges = ({ i, className }: { i: Inquiry; className?: string }) => {
  const { t } = useTranslation();
  if (!i.agent && !i.partner && !i.convertedAt && !i.anonymizedAt) return null;
  return (
    <span className={clsx('inline-flex flex-wrap items-center gap-1', className)}>
      {i.agent && (
        <span className="badge bg-accent-bg text-accent-fg" title={i.agent.code}>
          <Handshake className="size-3" aria-hidden /> {t('inq.badge.agent', { name: i.agent.name })}
        </span>
      )}
      {i.partner && <span className="badge bg-sunken text-ink/80">{t('inq.badge.partner', { name: i.partner.name })}</span>}
      {i.convertedAt && (
        <span className="badge bg-success-bg text-success-fg">
          <CheckCircle2 className="size-3" aria-hidden /> {t('inq.badge.converted')}
        </span>
      )}
      {i.anonymizedAt && (
        <span className="badge bg-sunken text-muted">
          <ShieldOff className="size-3" aria-hidden /> {t('inq.badge.anonymized')}
        </span>
      )}
    </span>
  );
};

/** Owner of the lead: staff picker + "Mənə götür". The new owner gets a notification (server). */
export const InquiryOwner = ({ i }: { i: Inquiry }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data: staff } = useStaffOptions();
  const refresh = useRefresh(i.id);
  const [busy, setBusy] = useState(false);
  const save = async (staffId: string | null, okText: string) => {
    setBusy(true);
    try {
      await api.put(`/admin/inquiries/${i.id}/assignee`, { staffId });
      toast.success(okText);
      refresh();
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  };
  const mine = !!user && i.assignedStaffId === user.id;
  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="min-w-0 flex-1 text-sm sm:max-w-xs">
        <span className="mb-1 block text-[11px] text-muted">{t('inq.owner.label')}</span>
        <select
          className="input"
          value={i.assignedStaffId ?? ''}
          disabled={busy}
          onChange={(e) => {
            const id = e.target.value || null;
            const s = staff?.find((x) => x.id === id);
            void save(id, id ? t('inq.owner.assigned', { name: s ? fullName(s) : '' }) : t('inq.owner.unassigned'));
          }}
        >
          <option value="">{t('inq.owner.none')}</option>
          {i.assignedStaff && !staff?.some((s) => s.id === i.assignedStaffId) && <option value={i.assignedStaff.id}>{i.assignedStaff.name}</option>}
          {(staff ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {fullName(s)}
            </option>
          ))}
        </select>
      </label>
      {!mine && user && (
        <button type="button" className="btn-secondary btn-sm" disabled={busy} onClick={() => void save('me', t('inq.owner.took'))}>
          <UserCheck className="size-3.5" aria-hidden /> {t('inq.owner.take')}
        </button>
      )}
    </div>
  );
};

/** Internal notes: autosaved 1 s after the last keystroke and on blur (PUT /admin/inquiries/:id/notes, audited). */
export const InquiryNotes = ({ i }: { i: Inquiry }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [value, setValue] = useState(i.staffNotes ?? '');
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  const saved = useRef(i.staffNotes ?? '');
  const timer = useRef<number | null>(null);
  const latest = useRef(value);
  latest.current = value;

  const flush = async () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    const text = latest.current;
    if (text === saved.current) return;
    setState('saving');
    try {
      await api.put(`/admin/inquiries/${i.id}/notes`, { staffNotes: text });
      saved.current = text;
      setState('saved');
      // Keep cached rows in sync without a refetch that could reset the textarea.
      qc.setQueriesData<{ items?: Inquiry[] }>({ queryKey: INQUIRY_LIST_ROOT }, (old) =>
        old?.items ? { ...old, items: old.items.map((x) => (x.id === i.id ? { ...x, staffNotes: text.trim() ? text : null } : x)) } : old,
      );
    } catch {
      setState('failed');
    }
  };
  // Save what is left when the panel closes.
  useEffect(
    () => () => {
      if (timer.current) {
        window.clearTimeout(timer.current);
        if (latest.current !== saved.current) void api.put(`/admin/inquiries/${i.id}/notes`, { staffNotes: latest.current }).catch(() => undefined);
      }
    },
    [i.id],
  );
  const onChange = (v: string) => {
    setValue(v);
    setState('idle');
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flush(), 1000);
  };
  return (
    <div>
      <label className="block text-sm" htmlFor={`inq-notes-${i.id}`}>
        <span className="flex items-baseline justify-between gap-2">
          <span className="text-[11px] font-semibold text-muted">{t('inq.notes.label')}</span>
          <span className={clsx('text-[11px]', state === 'failed' ? 'text-danger-fg' : 'text-muted')} aria-live="polite">
            {state === 'saving' ? t('inq.notes.saving') : state === 'saved' ? t('inq.notes.saved') : state === 'failed' ? t('inq.notes.failed') : ''}
          </span>
        </span>
      </label>
      <textarea
        id={`inq-notes-${i.id}`}
        className="input mt-1 min-h-24"
        rows={4}
        maxLength={20000}
        value={value}
        placeholder={t('inq.notes.placeholder')}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => void flush()}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      />
      <p className="mt-1 text-[11px] text-muted">{t('inq.notes.hint')}</p>
    </div>
  );
};

const LOCALES = ['az', 'de', 'en', 'ru'] as const;
const splitName = (n: string) => {
  const p = n.trim().split(/\s+/);
  return { first: p[0] ?? '', last: p.slice(1).join(' ') };
};

const Field = ({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) => (
  <label className={clsx('block text-sm', className)}>
    <span className="mb-1 block text-xs font-semibold text-muted">{label}</span>
    {children}
  </label>
);

const ConvertClientDialog = ({ i, open, onClose }: { i: Inquiry; open: boolean; onClose: () => void }) => {
  const { t } = useTranslation();
  const refresh = useRefresh(i.id);
  const guess = splitName(i.contactName);
  const [f, setF] = useState({ firstName: guess.first, lastName: guess.last, email: i.email, phone: i.phone ?? '', locale: (LOCALES as readonly string[]).includes(i.locale) ? i.locale : 'az', invite: true, createCase: false, profession: i.sector ?? '' });
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const submit = async () => {
    setBusy(true);
    try {
      const r = (
        await api.post<{ created: boolean; caseNumber: string | null }>(`/admin/inquiries/${i.id}/convert-client`, {
          firstName: f.firstName,
          lastName: f.lastName,
          email: f.email,
          phone: f.phone.trim() || null,
          locale: f.locale,
          invite: f.invite,
          createCase: f.createCase,
          ...(f.createCase ? { profession: f.profession } : {}),
        })
      ).data;
      toast.success(r.created ? t('inq.convert.clientCreated') : t('inq.convert.clientLinked'), { description: r.caseNumber ? t('inq.convert.caseCreated', { number: r.caseNumber }) : undefined });
      refresh();
      onClose();
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  };
  const valid = f.firstName.trim() && f.lastName.trim() && /\S+@\S+\.\S+/.test(f.email) && (!f.createCase || f.profession.trim().length >= 2);
  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={busy}
      title={t('inq.convert.clientTitle')}
      description={t('inq.convert.clientIntro')}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {t('admin.common.cancel')}
          </Button>
          <Button onClick={() => void submit()} loading={busy} disabled={!valid}>
            {t('inq.convert.submit')}
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('inq.convert.firstName')}>
          <input className="input" value={f.firstName} onChange={(e) => set('firstName', e.target.value)} maxLength={80} data-autofocus />
        </Field>
        <Field label={t('inq.convert.lastName')}>
          <input className="input" value={f.lastName} onChange={(e) => set('lastName', e.target.value)} maxLength={80} />
        </Field>
        <Field label={t('inq.convert.email')}>
          <input className="input" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} maxLength={191} />
        </Field>
        <Field label={t('inq.convert.phone')}>
          <input className="input" value={f.phone} onChange={(e) => set('phone', e.target.value)} maxLength={40} />
        </Field>
        <Field label={t('inq.convert.locale')}>
          <select className="input" value={f.locale} onChange={(e) => set('locale', e.target.value)}>
            {LOCALES.map((l) => (
              <option key={l} value={l}>
                {l.toUpperCase()}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="mt-4 space-y-2 text-sm">
        <label className="flex items-start gap-2">
          <input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={f.invite} onChange={(e) => set('invite', e.target.checked)} />
          <span>{t('inq.convert.invite')}</span>
        </label>
        <label className="flex items-start gap-2">
          <input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={f.createCase} onChange={(e) => set('createCase', e.target.checked)} />
          <span>{t('inq.convert.createCase')}</span>
        </label>
        {f.createCase && (
          <Field label={t('inq.convert.profession')}>
            <input className="input" value={f.profession} onChange={(e) => set('profession', e.target.value)} maxLength={120} />
          </Field>
        )}
        {i.agent && <p className="text-xs text-muted">{t('inq.convert.agentNote', { name: i.agent.name })}</p>}
        {i.partner && <p className="text-xs text-muted">{t('inq.convert.partnerNote', { name: i.partner.name })}</p>}
      </div>
    </Modal>
  );
};

const ConvertCompanyDialog = ({ i, open, onClose }: { i: Inquiry; open: boolean; onClose: () => void }) => {
  const { t } = useTranslation();
  const refresh = useRefresh(i.id);
  const guess = splitName(i.contactName);
  const [mode, setMode] = useState<'new' | 'existing'>('new');
  const { data: companies } = useCompanyOptions(open && mode === 'existing');
  const [f, setF] = useState({ name: i.companyName ?? '', sector: '', city: '', companyId: '', invite: true, firstName: guess.first, lastName: guess.last, email: i.email, locale: (LOCALES as readonly string[]).includes(i.locale) ? i.locale : 'de' });
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const submit = async () => {
    setBusy(true);
    try {
      const r = (
        await api.post<{ createdCompany: boolean }>(`/admin/inquiries/${i.id}/convert-company`, {
          ...(mode === 'existing' ? { companyId: f.companyId } : { company: { name: f.name, sector: f.sector || null, city: f.city.trim() || null } }),
          invite: f.invite ? { firstName: f.firstName, lastName: f.lastName, email: f.email, locale: f.locale } : null,
        })
      ).data;
      toast.success(r.createdCompany ? t('inq.convert.companyCreated') : t('inq.convert.companyLinked'));
      refresh();
      onClose();
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  };
  const valid = (mode === 'new' ? f.name.trim().length >= 2 : !!f.companyId) && (!f.invite || (f.firstName.trim() && f.lastName.trim() && /\S+@\S+\.\S+/.test(f.email)));
  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={busy}
      title={t('inq.convert.companyTitle')}
      description={t('inq.convert.companyIntro')}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {t('admin.common.cancel')}
          </Button>
          <Button onClick={() => void submit()} loading={busy} disabled={!valid}>
            {t('inq.convert.submit')}
          </Button>
        </>
      }
    >
      <div className="mb-3 inline-flex rounded-lg border border-line p-0.5 text-xs font-semibold" role="radiogroup">
        {(['new', 'existing'] as const).map((m) => (
          <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)} className={clsx('rounded-md px-3 py-1.5', mode === m ? 'bg-sunken text-ink' : 'text-muted hover:text-ink')}>
            {m === 'new' ? t('inq.convert.newCompany') : t('inq.convert.existingCompany')}
          </button>
        ))}
      </div>
      {mode === 'new' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('inq.convert.companyName')} className="sm:col-span-2">
            <input className="input" value={f.name} onChange={(e) => set('name', e.target.value)} maxLength={160} />
          </Field>
          <Field label={t('inq.convert.sector')}>
            <select className="input" value={f.sector} onChange={(e) => set('sector', e.target.value)}>
              <option value="">{t('inq.convert.noSector')}</option>
              {SECTORS.map((s) => (
                <option key={s} value={s}>
                  {t(`admin.content.sector.${s}`)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('inq.convert.city')}>
            <input className="input" value={f.city} onChange={(e) => set('city', e.target.value)} maxLength={80} />
          </Field>
        </div>
      ) : (
        <Field label={t('inq.convert.pickCompany')}>
          <select className="input" value={f.companyId} onChange={(e) => set('companyId', e.target.value)}>
            <option value="">—</option>
            {(companies ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      <label className="mt-4 flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={f.invite} onChange={(e) => set('invite', e.target.checked)} />
        <span>{t('inq.convert.inviteUser')}</span>
      </label>
      {f.invite && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label={t('inq.convert.firstName')}>
            <input className="input" value={f.firstName} onChange={(e) => set('firstName', e.target.value)} maxLength={80} />
          </Field>
          <Field label={t('inq.convert.lastName')}>
            <input className="input" value={f.lastName} onChange={(e) => set('lastName', e.target.value)} maxLength={80} />
          </Field>
          <Field label={t('inq.convert.email')}>
            <input className="input" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} maxLength={200} />
          </Field>
          <Field label={t('inq.convert.locale')}>
            <select className="input" value={f.locale} onChange={(e) => set('locale', e.target.value)}>
              {LOCALES.map((l) => (
                <option key={l} value={l}>
                  {l.toUpperCase()}
                </option>
              ))}
            </select>
          </Field>
        </div>
      )}
      {i.agent && <p className="mt-3 text-xs text-muted">{t('inq.convert.agentNote', { name: i.agent.name })}</p>}
    </Modal>
  );
};

/** Conversion buttons (or the links to what the lead became). */
export const InquiryConvert = ({ i }: { i: Inquiry }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState<null | 'client' | 'company'>(null);
  const canClient = !i.convertedUserId;
  const canCompany = i.kind === 'company' && !i.convertedCompanyId;
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold text-muted">{t('inq.convert.section')}</p>
      {(i.convertedUser || i.convertedCompany) && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {i.convertedAt && <span className="text-xs text-muted">{t('inq.convert.convertedOn', { date: fmtDate(i.convertedAt) })}</span>}
          {i.convertedUser && (
            <Link to={i.convertedUser.role === 'CLIENT' ? `/admin/users?search=${encodeURIComponent(i.convertedUser.email)}` : `/admin/companies${i.convertedCompany ? `?id=${i.convertedCompany.id}` : ''}`} className="badge bg-success-bg text-success-fg hover:underline">
              <UserPlus className="size-3" aria-hidden /> {t('inq.convert.openClient', { name: i.convertedUser.name })}
            </Link>
          )}
          {i.convertedCompany && (
            <Link to={`/admin/companies?id=${i.convertedCompany.id}`} className="badge bg-success-bg text-success-fg hover:underline">
              <Building2 className="size-3" aria-hidden /> {t('inq.convert.openCompany', { name: i.convertedCompany.name })}
            </Link>
          )}
        </div>
      )}
      {(canClient || canCompany) && (
        <div className="flex flex-wrap gap-2">
          {canClient && (
            <button type="button" className="btn-secondary btn-sm" onClick={() => setOpen('client')}>
              <UserPlus className="size-3.5" aria-hidden /> {t('inq.convert.toClient')}
            </button>
          )}
          {canCompany && (
            <button type="button" className="btn-secondary btn-sm" onClick={() => setOpen('company')}>
              <Building2 className="size-3.5" aria-hidden /> {t('inq.convert.toCompany')}
            </button>
          )}
        </div>
      )}
      {open === 'client' && <ConvertClientDialog i={i} open onClose={() => setOpen(null)} />}
      {open === 'company' && <ConvertCompanyDialog i={i} open onClose={() => setOpen(null)} />}
    </div>
  );
};

/** Work area of a lead in the expanded row / split panel: owner, notes, conversion (or the GDPR notice). */
export const InquiryWork = ({ i }: { i: Inquiry }) => {
  const { t } = useTranslation();
  if (i.anonymizedAt) {
    return (
      <p className="flex items-start gap-2 rounded-lg border border-line bg-sunken px-3.5 py-3 text-sm text-ink/80" role="note">
        <ShieldOff className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden /> {t('inq.anonymized', { date: fmtDate(i.anonymizedAt) })}
      </p>
    );
  }
  return (
    <div className="space-y-4 rounded-lg border border-line bg-card px-3.5 py-3">
      <InquiryOwner i={i} />
      <InquiryNotes key={i.id} i={i} />
      <InquiryConvert i={i} />
    </div>
  );
};
