import { useState } from 'react';
import { STATUS_TONES, toneClasses } from '@/components/ui/status';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { CalendarPlus, ExternalLink, Mail, Pencil, Trash2, Users } from 'lucide-react';
import { Chip, EmptyState, LoadingBlock, PageHead, Panel } from '@/components/admin/ui';
import { Modal } from '@/components/admin/Modal';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { L10nInput, emptyL10n, fillFromAz } from '@/components/admin/L10nInput';
import { bakuTime } from '@/components/growth/api';
import { registerCopy } from '@/i18n';
import { pagesGrowthPlus } from '@/i18n/pagesGrowthPlus';
import { api, errorCode } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useL10n } from '@/lib/l10n';
import { hasMinRole, type L10n } from '@/lib/types';
import { usePageTitle } from '@/lib/usePageTitle';

registerCopy(pagesGrowthPlus);

type Status = 'DRAFT' | 'PUBLISHED' | 'CANCELLED';
type Attendance = 'REGISTERED' | 'CHECKED_IN' | 'NO_SHOW';
interface AdminEvent {
  id: string;
  slug: string;
  title: L10n;
  description: L10n;
  mode: 'ONLINE' | 'OFFLINE';
  meetingUrl: string | null;
  address: string | null;
  startsAt: string;
  endsAt: string;
  capacity: number | null;
  language: 'az' | 'de' | 'en' | 'ru';
  status: Status;
  followUpNote: L10n | null;
  followUpSentAt: string | null;
  counts?: { total: number; CHECKED_IN: number; NO_SHOW: number; REGISTERED: number };
}
interface Registration {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  locale: string;
  attendance: Attendance;
  inquiryId: string | null;
  followUpSentAt: string | null;
  createdAt: string;
}

const HOUR = 60 * 60 * 1000;
/** Asia/Baku is UTC+4 all year (no DST since 2016). */
const toBaku = (iso: string) => {
  const d = new Date(new Date(iso).getTime() + 4 * HOUR).toISOString();
  return { date: d.slice(0, 10), time: d.slice(11, 16) };
};

type Form = {
  title: L10n;
  description: L10n;
  mode: 'ONLINE' | 'OFFLINE';
  meetingUrl: string;
  address: string;
  date: string;
  time: string;
  durationMin: number;
  capacity: string;
  language: AdminEvent['language'];
  status: Status;
  followUpNote: L10n;
};

const formOf = (e: AdminEvent | null, defaultAddress: string): Form => {
  if (!e) {
    const tomorrow = toBaku(new Date(Date.now() + 7 * 24 * HOUR).toISOString());
    return { title: emptyL10n(), description: emptyL10n(), mode: 'ONLINE', meetingUrl: '', address: defaultAddress, date: tomorrow.date, time: '18:00', durationMin: 60, capacity: '', language: 'az', status: 'DRAFT', followUpNote: emptyL10n() };
  }
  const b = toBaku(e.startsAt);
  return {
    title: e.title,
    description: e.description,
    mode: e.mode,
    meetingUrl: e.meetingUrl ?? '',
    address: e.address ?? defaultAddress,
    date: b.date,
    time: b.time,
    durationMin: Math.round((new Date(e.endsAt).getTime() - new Date(e.startsAt).getTime()) / 60000),
    capacity: e.capacity == null ? '' : String(e.capacity),
    language: e.language,
    status: e.status,
    followUpNote: e.followUpNote ?? emptyL10n(),
  };
};

const STATUS_TONE: Record<Status, string> = toneClasses(STATUS_TONES.publication);

const EventForm = ({ event, onClose }: { event: AdminEvent | null; onClose: () => void }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [f, setF] = useState<Form>(() => formOf(event, t('gp.admin.form.addressDefault')));
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));
  const save = useMutation({
    mutationFn: async () => {
      const note = fillFromAz(f.followUpNote);
      const body = {
        title: fillFromAz(f.title),
        description: fillFromAz(f.description),
        mode: f.mode,
        meetingUrl: f.mode === 'ONLINE' && f.meetingUrl.trim() ? f.meetingUrl.trim() : null,
        address: f.mode === 'OFFLINE' ? f.address.trim() : null,
        date: f.date,
        time: f.time,
        durationMin: Number(f.durationMin) || 60,
        capacity: f.capacity.trim() ? Number(f.capacity) : null,
        language: f.language,
        status: f.status,
        followUpNote: note.az ? note : null,
      };
      return event ? api.patch(`/admin/growth/events/${event.id}`, body) : api.post('/admin/growth/events', body);
    },
    onSuccess: () => {
      toast.success(t('gp.common.saved'));
      void qc.invalidateQueries({ queryKey: ['admin', 'growth', 'events'] });
      onClose();
    },
    onError: (err) => toast.error(errorCode(err) === 'VALIDATION' ? t('gp.admin.errors.VALIDATION') : t('gp.common.error')),
  });
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={event ? t('gp.common.edit') : t('gp.admin.newEvent')}
      footer={
        <>
          <button type="button" className="btn-ghost btn-sm" onClick={onClose}>
            {t('gp.common.cancel')}
          </button>
          <button type="button" className="btn-primary btn-sm" disabled={save.isPending} onClick={() => save.mutate()}>
            {t('gp.common.save')}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <L10nInput label={t('gp.admin.form.title')} value={f.title} onChange={(v) => set('title', v)} required />
        <L10nInput label={t('gp.admin.form.description')} value={f.description} onChange={(v) => set('description', v)} multiline rows={4} />
        <fieldset>
          <legend className="label">{t('gp.admin.form.mode')}</legend>
          <div className="flex flex-wrap gap-2">
            {(['ONLINE', 'OFFLINE'] as const).map((m) => (
              <Chip key={m} active={f.mode === m} onClick={() => set('mode', m)}>
                {m === 'ONLINE' ? t('gp.admin.form.online') : t('gp.admin.form.offline')}
              </Chip>
            ))}
          </div>
        </fieldset>
        {f.mode === 'ONLINE' ? (
          <label className="block">
            <span className="label">{t('gp.admin.form.meetingUrl')}</span>
            <input className="input" type="url" placeholder="https://meet.jit.si/…" value={f.meetingUrl} onChange={(e) => set('meetingUrl', e.target.value)} />
          </label>
        ) : (
          <label className="block">
            <span className="label">{t('gp.admin.form.address')}</span>
            <input className="input" value={f.address} onChange={(e) => set('address', e.target.value)} />
          </label>
        )}
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block">
            <span className="label">{t('gp.admin.form.date')}</span>
            <input className="input" type="date" value={f.date} onChange={(e) => set('date', e.target.value)} />
          </label>
          <label className="block">
            <span className="label">{t('gp.admin.form.time')}</span>
            <input className="input" type="time" value={f.time} onChange={(e) => set('time', e.target.value)} />
          </label>
          <label className="block">
            <span className="label">{t('gp.admin.form.duration')}</span>
            <input className="input" type="number" min={15} max={480} step={15} value={f.durationMin} onChange={(e) => set('durationMin', Number(e.target.value))} />
          </label>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block">
            <span className="label">{t('gp.admin.form.capacity')}</span>
            <input className="input" type="number" min={1} value={f.capacity} onChange={(e) => set('capacity', e.target.value)} />
          </label>
          <label className="block">
            <span className="label">{t('gp.admin.form.language')}</span>
            <select className="input" value={f.language} onChange={(e) => set('language', e.target.value as Form['language'])}>
              {(['az', 'de', 'en', 'ru'] as const).map((l) => (
                <option key={l} value={l}>
                  {t(`gp.events.langNames.${l}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label">{t('gp.admin.form.status')}</span>
            <select className="input" value={f.status} onChange={(e) => set('status', e.target.value as Status)}>
              {(['DRAFT', 'PUBLISHED', 'CANCELLED'] as const).map((s) => (
                <option key={s} value={s}>
                  {t(`gp.admin.status.${s}`)}
                </option>
              ))}
            </select>
          </label>
        </div>
        {event && f.status === 'CANCELLED' && event.status !== 'CANCELLED' && <p className="text-xs text-warning">{t('gp.admin.cancelHint')}</p>}
        <L10nInput label={t('gp.admin.form.followUpNote')} value={f.followUpNote} onChange={(v) => set('followUpNote', v)} multiline rows={2} />
      </div>
    </Modal>
  );
};

const EventDetail = ({ id, onEdit }: { id: string; onEdit: (e: AdminEvent) => void }) => {
  const { t } = useTranslation();
  const { tr, locale } = useL10n();
  const qc = useQueryClient();
  const [audience, setAudience] = useState<'attended' | 'noShow' | 'all'>('attended');
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'growth', 'events', id],
    queryFn: async () => (await api.get<{ event: AdminEvent & { registrations: Registration[] } }>(`/admin/growth/events/${id}`)).data.event,
  });
  const { data: preview } = useQuery({
    queryKey: ['admin', 'growth', 'events', id, 'preview', locale],
    queryFn: async () => (await api.get<{ title: string; body: string; cta: string }>(`/admin/growth/events/${id}/follow-up/preview?locale=${locale}`)).data,
  });
  const mark = useMutation({
    mutationFn: ({ regId, attendance }: { regId: string; attendance: Attendance }) => api.patch(`/admin/growth/events/${id}/registrations/${regId}`, { attendance }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin', 'growth', 'events'] }),
    onError: () => toast.error(t('gp.common.error')),
  });
  const followUp = useMutation({
    mutationFn: async () => (await api.post<{ sent: number }>(`/admin/growth/events/${id}/follow-up`, { audience })).data,
    onSuccess: (r) => {
      toast.success(t('gp.admin.sent', { count: r.sent }));
      void qc.invalidateQueries({ queryKey: ['admin', 'growth', 'events'] });
    },
    onError: (err) => toast.error(errorCode(err) === 'EVENT_NOT_STARTED' ? t('gp.admin.errors.EVENT_NOT_STARTED') : t('gp.common.error')),
  });
  if (isLoading || !data) return <LoadingBlock />;
  const started = new Date(data.startsAt).getTime() <= Date.now();
  return (
    <div className="space-y-5">
      <Panel
        title={tr(data.title)}
        icon={CalendarPlus}
        actions={
          <>
            {data.status !== 'DRAFT' && (
              <a className="btn-ghost btn-sm" href={`/events/${data.slug}`} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="size-4" aria-hidden /> {t('gp.admin.publicPage')}
              </a>
            )}
            {data.meetingUrl && (
              <a className="btn-ghost btn-sm" href={data.meetingUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="size-4" aria-hidden /> {t('gp.admin.openLink')}
              </a>
            )}
            <button type="button" className="btn-ghost btn-sm" onClick={() => onEdit(data)}>
              <Pencil className="size-4" aria-hidden /> {t('gp.common.edit')}
            </button>
          </>
        }
      >
        <p className="text-sm text-muted">
          {bakuTime(data.startsAt, locale)} (Baku) · {data.mode === 'ONLINE' ? (data.meetingUrl ?? '') : (data.address ?? '')}
        </p>
      </Panel>

      <Panel title={`${t('gp.admin.registrations')} (${data.registrations.length}${data.capacity ? ` / ${data.capacity}` : ''})`} icon={Users} bodyClassName="p-0 sm:p-0">
        {data.registrations.length === 0 ? (
          <p className="p-5 text-sm text-muted">—</p>
        ) : (
          <ul className="divide-y divide-line">
            {data.registrations.map((r) => (
              <li key={r.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-semibold text-ink">
                    {r.name} <span className="text-xs font-normal text-muted uppercase">{r.locale}</span>
                    {r.inquiryId && <span className="ml-2 rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-bold text-brand-700">{t('gp.admin.lead')}</span>}
                  </p>
                  <p className="truncate text-xs text-muted">
                    {r.email}
                    {r.phone ? ` · ${r.phone}` : ''}
                    {r.followUpSentAt ? ' · ✉' : ''}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(['CHECKED_IN', 'NO_SHOW', 'REGISTERED'] as const).map((a) => (
                    <Chip key={a} active={r.attendance === a} onClick={() => mark.mutate({ regId: r.id, attendance: a })}>
                      {t(`gp.admin.attendance.${a}`)}
                    </Chip>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title={t('gp.admin.followUp')} icon={Mail}>
        <p className="text-sm text-muted">{t('gp.admin.followUpText')}</p>
        {preview && (
          <div className="mt-3 rounded-lg border border-line bg-surface p-3 text-sm">
            <p className="font-semibold text-ink">{preview.title}</p>
            <p className="mt-1 whitespace-pre-line text-muted">{preview.body}</p>
            <p className="mt-2 text-xs font-semibold text-brand-600">→ {preview.cta}</p>
          </div>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {(['attended', 'noShow', 'all'] as const).map((a) => (
            <Chip key={a} active={audience === a} onClick={() => setAudience(a)}>
              {t(`gp.admin.audience.${a}`)}
            </Chip>
          ))}
          <button type="button" className="btn-primary btn-sm" disabled={!started || followUp.isPending} onClick={() => followUp.mutate()}>
            {t('gp.admin.send')}
          </button>
          {!started && <span className="text-xs text-muted">{t('gp.admin.errors.EVENT_NOT_STARTED')}</span>}
        </div>
      </Panel>
    </div>
  );
};

export default function AdminGrowthEvents() {
  const { t } = useTranslation();
  const { tr, locale } = useL10n();
  const { user } = useAuth();
  usePageTitle(t('gp.admin.eventsTitle'));
  const qc = useQueryClient();
  const [scope, setScope] = useState<'upcoming' | 'past'>('upcoming');
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<AdminEvent | null | 'new'>(null);
  const [deleting, setDeleting] = useState<AdminEvent | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'growth', 'events', 'list', scope],
    queryFn: async () => (await api.get<{ events: AdminEvent[] }>(`/admin/growth/events?scope=${scope}`)).data.events,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/growth/events/${id}`),
    onSuccess: () => {
      setDeleting(null);
      setSelected(null);
      void qc.invalidateQueries({ queryKey: ['admin', 'growth', 'events'] });
    },
    onError: (err) => toast.error(errorCode(err) === 'HAS_REGISTRATIONS' ? t('gp.admin.errors.HAS_REGISTRATIONS') : t('gp.common.error')),
  });
  const isAdmin = hasMinRole(user?.role, 'ADMIN');

  return (
    <div>
      <PageHead
        title={t('gp.admin.eventsTitle')}
        subtitle={t('gp.admin.eventsSubtitle')}
        actions={
          <button type="button" className="btn-primary btn-sm" onClick={() => setEditing('new')}>
            <CalendarPlus className="size-4" aria-hidden /> {t('gp.admin.newEvent')}
          </button>
        }
      />
      <div className="mb-4 flex gap-2">
        {(['upcoming', 'past'] as const).map((s) => (
          <Chip key={s} active={scope === s} onClick={() => setScope(s)}>
            {t(`gp.admin.${s}`)}
          </Chip>
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <div>
          {isLoading ? (
            <LoadingBlock />
          ) : !data?.length ? (
            <EmptyState icon={CalendarPlus} title={t('gp.admin.none')} />
          ) : (
            <ul className="space-y-2">
              {data.map((e) => (
                <li key={e.id}>
                  <div
                    className={clsx(
                      'flex items-start gap-3 rounded-xl border bg-card p-4 transition-colors',
                      selected === e.id ? 'border-brand-500' : 'border-line hover:border-brand-400',
                    )}
                  >
                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setSelected(e.id)}>
                      <span className={clsx('rounded-full px-2 py-0.5 text-[11px] font-semibold', STATUS_TONE[e.status])}>{t(`gp.admin.status.${e.status}`)}</span>
                      <p className="mt-1.5 font-semibold text-ink">{tr(e.title)}</p>
                      <p className="text-xs text-muted">{bakuTime(e.startsAt, locale, { dateStyle: 'medium', timeStyle: 'short' })}</p>
                      {e.counts && (
                        <p className="mt-1 text-xs text-muted">
                          {t('gp.admin.registered')}: {e.counts.total}
                          {e.capacity ? ` / ${e.capacity}` : ''} · {t('gp.admin.attended')}: {e.counts.CHECKED_IN} · {t('gp.admin.noShow')}: {e.counts.NO_SHOW}
                        </p>
                      )}
                    </button>
                    {isAdmin && (
                      <button type="button" className="rounded-lg p-2 text-muted hover:bg-surface hover:text-danger" aria-label={t('gp.common.delete')} onClick={() => setDeleting(e)}>
                        <Trash2 className="size-4" aria-hidden />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>{selected && <EventDetail key={selected} id={selected} onEdit={(e) => setEditing(e)} />}</div>
      </div>
      {editing && <EventForm event={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        title={t('gp.admin.confirmDelete')}
        message={deleting ? tr(deleting.title) : undefined}
        loading={remove.isPending}
      />
    </div>
  );
}
