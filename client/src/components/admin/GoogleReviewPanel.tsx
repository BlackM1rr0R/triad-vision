import { useEffect, useId, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Eye, MailOpen, MousePointerClick, Play, Send, ShieldCheck, Star, ThumbsDown, UserX } from 'lucide-react';
import { api, errorCode } from '@/lib/api';
import { Spinner } from '@/components/ui/Spinner';
import { Switch } from '@/components/ui/Switch';
import { Checkbox } from '@/components/ui/Field';
import { Panel, StatTile } from '@/components/admin/ui';
import { toastError } from '@/components/admin/labels';
import { registerCopy } from '@/i18n';
import { pagesGoogleReview } from '@/i18n/pagesGoogleReview';

registerCopy(pagesGoogleReview);

/*
 * Admin → Rəylər → "Google rəyləri": the automatic rating-first Google review requests (lib/googleReview on the
 * API): link / Place ID, triggers with delays, reminder, cooldown, low-score hold, e-mail preview + test, funnel
 * statistics, rating distribution and the recent invites. No review gating (see the policy note in the panel).
 */

const TRIGGERS = ['APPROVED', 'ARRIVAL', 'CLOSED'] as const;
type Trigger = (typeof TRIGGERS)[number];
const LOCALES = ['az', 'de', 'en', 'ru'] as const;

interface Settings {
  enabled: boolean;
  url: string;
  placeId: string;
  triggers: Record<Trigger, { enabled: boolean; delayDays: number }>;
  reminderDays: number;
  cooldownDays: number;
  channels: { inApp: boolean; whatsapp: boolean };
  lowScoreMax: number;
  lowScoreLookbackDays: number;
  holdDays: number;
  maxAgeDays: number;
}
interface Month {
  month: string;
  sent: number;
  opened: number;
  rated: number;
  low: number;
  googleClicked: number;
}
interface Totals {
  sent: number;
  reminded: number;
  opened: number;
  rated: number;
  googleClicked: number;
  googleClicks: number;
  feedback: number;
  held: number;
  lowRatings: number;
  optedOut: number;
  averageRating: number | null;
  openRate: number | null;
  clickRate: number | null;
}
interface Data {
  settings: Settings;
  googleUrl: string;
  stats: { months: Month[]; totals: Totals; distribution: number[]; legacy: { sent: number; clicked: number } };
}
interface Invite {
  id: string;
  trigger: Trigger;
  status: 'SENT' | 'HELD' | 'CANCELLED';
  client: { id: string; firstName: string; lastName: string; email: string } | null;
  case: { id: string; number: string } | null;
  createdAt: string;
  holdUntil: string | null;
  sentAt: string | null;
  remindedAt: string | null;
  openedAt: string | null;
  rating: number | null;
  feedback: string | null;
  googleClicks: number;
  staffTaskId: string | null;
}

const KEY = ['admin-reviews', 'google'];
const pct = (r: number | null) => (r === null ? '—' : `${Math.round(r * 100)}%`);
const BAR = ['bg-red-500', 'bg-orange-500', 'bg-amber-400', 'bg-lime-500', 'bg-green-600'];

const monthLabel = (m: string, lng: string) => {
  const [y, mo] = m.split('-').map(Number);
  try {
    return new Intl.DateTimeFormat(lng, { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, mo - 1, 1)));
  } catch {
    return m;
  }
};
const dateLabel = (d: string | null, lng: string) => {
  if (!d) return '—';
  try {
    return new Intl.DateTimeFormat(lng, { day: '2-digit', month: 'short' }).format(new Date(d));
  } catch {
    return d.slice(0, 10);
  }
};

const useG = () => {
  const { t } = useTranslation();
  return (k: string, o?: Record<string, unknown>) => String(t(`googleReview.${k}`, o));
};

const NumberField = ({ label, value, min, max, disabled, onChange }: { label: string; value: number; min: number; max: number; disabled: boolean; onChange: (n: number) => void }) => {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        className="input"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Math.min(max, Math.max(min, Math.round(Number(e.target.value) || 0))))}
      />
    </div>
  );
};

const Form = ({ initial, canEdit }: { initial: Settings; canEdit: boolean }) => {
  const g = useG();
  const qc = useQueryClient();
  const [s, setS] = useState<Settings>(initial);
  useEffect(() => setS(initial), [initial]);
  const ids = { url: useId(), urlHint: useId(), place: useId(), placeHint: useId() };
  const urlValid = s.url.trim() === '' || /^https:\/\/\S+$/i.test(s.url.trim());
  const placeValid = s.placeId.trim() === '' || /^[A-Za-z0-9_-]{10,200}$/.test(s.placeId.trim());
  const linkMissing = s.enabled && !s.url.trim() && !s.placeId.trim();

  const save = useMutation({
    mutationFn: async () => (await api.put<{ settings: Settings }>('/admin/reviews/google', { ...s, url: s.url.trim(), placeId: s.placeId.trim() })).data,
    onSuccess: () => {
      toast.success(g('saved'));
      void qc.invalidateQueries({ queryKey: KEY });
    },
    onError: (err) => (errorCode(err) === 'URL_REQUIRED' ? toast.error(g('urlRequired')) : toastError(err)),
  });
  const run = useMutation({
    mutationFn: async () => (await api.post<Record<string, number>>('/admin/reviews/google/run')).data,
    onSuccess: (r) => {
      toast.success(g('ran', r));
      void qc.invalidateQueries({ queryKey: ['admin-reviews'] });
    },
    onError: (err) => toastError(err),
  });
  const ro = !canEdit;

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (canEdit && urlValid && placeValid && !linkMissing) save.mutate();
      }}
    >
      <Switch checked={s.enabled} onChange={(v) => setS({ ...s, enabled: v })} label={g('enabled')} showLabel disabled={ro} />
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div>
          <label htmlFor={ids.url} className="label">
            {g('url')}
          </label>
          <input
            id={ids.url}
            type="url"
            inputMode="url"
            className="input"
            placeholder="https://g.page/r/…/review"
            value={s.url}
            maxLength={500}
            disabled={ro}
            aria-describedby={ids.urlHint}
            aria-invalid={!urlValid || linkMissing || undefined}
            onChange={(e) => setS({ ...s, url: e.target.value })}
          />
          <p id={ids.urlHint} className={!urlValid || linkMissing ? 'mt-1 text-xs text-danger-fg' : 'mt-1 text-xs text-muted'}>
            {!urlValid ? g('urlInvalid') : linkMissing ? g('urlRequired') : g('urlHint')}
          </p>
        </div>
        <div>
          <label htmlFor={ids.place} className="label">
            {g('placeId')}
          </label>
          <input
            id={ids.place}
            className="input"
            placeholder="ChIJ…"
            value={s.placeId}
            maxLength={200}
            disabled={ro}
            aria-describedby={ids.placeHint}
            aria-invalid={!placeValid || undefined}
            onChange={(e) => setS({ ...s, placeId: e.target.value })}
          />
          <p id={ids.placeHint} className="mt-1 text-xs text-muted">
            {g('placeIdHint')}
          </p>
        </div>
      </div>

      <fieldset>
        <legend className="label">{g('triggers')}</legend>
        <div className="mt-1 divide-y divide-line/60 rounded-xl border border-line">
          {TRIGGERS.map((tr) => (
            <div key={tr} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <Switch
                checked={s.triggers[tr].enabled}
                onChange={(v) => setS({ ...s, triggers: { ...s.triggers, [tr]: { ...s.triggers[tr], enabled: v } } })}
                label={g(`trigger.${tr}`)}
                showLabel
                disabled={ro}
              />
              <label className="flex items-center gap-2 text-sm text-muted">
                {g('delay')}
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={90}
                  className="input w-20"
                  value={s.triggers[tr].delayDays}
                  disabled={ro || !s.triggers[tr].enabled}
                  onChange={(e) =>
                    setS({ ...s, triggers: { ...s.triggers, [tr]: { ...s.triggers[tr], delayDays: Math.min(90, Math.max(0, Math.round(Number(e.target.value) || 0))) } } })
                  }
                />
              </label>
            </div>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <NumberField label={g('reminderDays')} value={s.reminderDays} min={0} max={30} disabled={ro} onChange={(n) => setS({ ...s, reminderDays: n })} />
        <NumberField label={g('cooldownDays')} value={s.cooldownDays} min={30} max={730} disabled={ro} onChange={(n) => setS({ ...s, cooldownDays: n })} />
        <NumberField label={g('maxAge')} value={s.maxAgeDays} min={7} max={365} disabled={ro} onChange={(n) => setS({ ...s, maxAgeDays: n })} />
        <NumberField label={g('lowScore')} value={s.lowScoreMax} min={0} max={10} disabled={ro} onChange={(n) => setS({ ...s, lowScoreMax: n })} />
        <NumberField label={g('lookback')} value={s.lowScoreLookbackDays} min={7} max={730} disabled={ro} onChange={(n) => setS({ ...s, lowScoreLookbackDays: n })} />
        <NumberField label={g('holdDays')} value={s.holdDays} min={1} max={90} disabled={ro} onChange={(n) => setS({ ...s, holdDays: n })} />
      </div>

      <fieldset>
        <legend className="label">{g('channels')}</legend>
        <div className="mt-1 flex flex-wrap gap-x-6 gap-y-2">
          <Checkbox checked={s.channels.inApp} disabled={ro} onChange={(e) => setS({ ...s, channels: { ...s.channels, inApp: e.target.checked } })} label={g('inApp')} />
          <Checkbox checked={s.channels.whatsapp} disabled={ro} onChange={(e) => setS({ ...s, channels: { ...s.channels, whatsapp: e.target.checked } })} label={g('whatsapp')} />
        </div>
      </fieldset>

      {canEdit ? (
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className="btn-secondary btn-sm" onClick={() => run.mutate()} disabled={run.isPending || !initial.enabled}>
            {run.isPending ? <Spinner className="size-3.5" /> : <Play className="size-3.5" aria-hidden />} {g('runNow')}
          </button>
          <button type="submit" className="btn-primary btn-sm" disabled={save.isPending || !urlValid || !placeValid || linkMissing}>
            {save.isPending && <Spinner className="size-3.5" />} {g('save')}
          </button>
        </div>
      ) : (
        <p className="rounded-lg bg-sunken px-4 py-3 text-sm text-muted">{g('readOnly')}</p>
      )}
    </form>
  );
};

const Preview = ({ canEdit }: { canEdit: boolean }) => {
  const g = useG();
  const { i18n } = useTranslation();
  const ui = (i18n.resolvedLanguage ?? 'az').slice(0, 2);
  const [q, setQ] = useState({ locale: (LOCALES as readonly string[]).includes(ui) ? ui : 'az', trigger: 'APPROVED' as Trigger, kind: 'invite' as 'invite' | 'reminder' });
  const [shown, setShown] = useState(false);
  const ids = { lang: useId(), trig: useId(), kind: useId() };
  const preview = useQuery({
    queryKey: ['admin-reviews', 'google-preview', q],
    enabled: shown,
    queryFn: async () => (await api.get<{ subject: string; html: string }>('/admin/reviews/google/preview', { params: q })).data,
  });
  const test = useMutation({
    mutationFn: async () => (await api.post<{ to: string }>('/admin/reviews/google/test', q)).data,
    onSuccess: (r) => toast.success(g('preview.testSent', { to: r.to })),
    onError: (err) => toastError(err),
  });
  return (
    <section className="mt-8" aria-labelledby={`${ids.lang}-h`}>
      <h3 id={`${ids.lang}-h`} className="mb-3 text-sm font-semibold text-ink">
        {g('preview.title')}
      </h3>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor={ids.lang} className="label">
            {g('preview.language')}
          </label>
          <select id={ids.lang} className="input" value={q.locale} onChange={(e) => setQ({ ...q, locale: e.target.value })}>
            {LOCALES.map((l) => (
              <option key={l} value={l}>
                {l.toUpperCase()}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={ids.trig} className="label">
            {g('triggers')}
          </label>
          <select id={ids.trig} className="input" value={q.trigger} onChange={(e) => setQ({ ...q, trigger: e.target.value as Trigger })}>
            {TRIGGERS.map((tr) => (
              <option key={tr} value={tr}>
                {g(`trigger.${tr}`)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={ids.kind} className="label">
            {g('preview.kind')}
          </label>
          <select id={ids.kind} className="input" value={q.kind} onChange={(e) => setQ({ ...q, kind: e.target.value as 'invite' | 'reminder' })}>
            <option value="invite">{g('preview.invite')}</option>
            <option value="reminder">{g('preview.reminder')}</option>
          </select>
        </div>
        <button type="button" className="btn-secondary btn-sm" onClick={() => setShown(true)}>
          <Eye className="size-3.5" aria-hidden /> {g('preview.show')}
        </button>
        {canEdit && (
          <button type="button" className="btn-secondary btn-sm" onClick={() => test.mutate()} disabled={test.isPending}>
            {test.isPending ? <Spinner className="size-3.5" /> : <Send className="size-3.5" aria-hidden />} {g('preview.test')}
          </button>
        )}
      </div>
      {shown && (
        <div className="mt-4 overflow-hidden rounded-xl border border-line bg-white">
          {preview.data ? (
            <>
              <p className="border-b border-line bg-sunken px-4 py-2 text-xs text-muted">{preview.data.subject}</p>
              <iframe title={g('preview.frame')} srcDoc={preview.data.html} sandbox="" className="h-[36rem] w-full" />
            </>
          ) : (
            <div className="grid h-40 place-items-center text-primary">
              <Spinner className="size-6" />
            </div>
          )}
        </div>
      )}
    </section>
  );
};

const Invites = () => {
  const g = useG();
  const { i18n } = useTranslation();
  const lng = i18n.resolvedLanguage ?? 'az';
  const { data } = useQuery({ queryKey: [...KEY, 'invites'], queryFn: async () => (await api.get<{ items: Invite[] }>('/admin/reviews/google/invites')).data });
  if (!data) return null;
  return (
    <section className="mt-8">
      <h3 className="mb-3 text-sm font-semibold text-ink">{g('recent')}</h3>
      {data.items.length === 0 ? (
        <p className="text-sm text-muted">{g('empty')}</p>
      ) : (
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <table className="w-full min-w-[46rem] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                {(['client', 'trigger', 'status', 'sent', 'opened', 'rating', 'google', 'feedback'] as const).map((c) => (
                  <th key={c} scope="col" className="py-2 pr-3 font-semibold">
                    {g(`col.${c}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.items.map((r) => (
                <tr key={r.id} className="border-b border-line/60 align-top last:border-0">
                  <th scope="row" className="py-2 pr-3 text-left font-medium text-ink">
                    {r.client ? `${r.client.firstName} ${r.client.lastName}`.trim() : '—'}
                    {r.case && <span className="block text-xs font-normal text-muted">{r.case.number}</span>}
                  </th>
                  <td className="py-2 pr-3">{g(`trigger.${r.trigger}`)}</td>
                  <td className="py-2 pr-3">
                    {g(`status.${r.status}`)}
                    {r.status === 'HELD' && r.holdUntil && <span className="block text-xs text-muted">→ {dateLabel(r.holdUntil, lng)}</span>}
                    {r.staffTaskId && <span className="block text-xs text-muted">{g('task')}</span>}
                  </td>
                  <td className="py-2 pr-3 whitespace-nowrap">
                    {dateLabel(r.sentAt, lng)}
                    {r.remindedAt && <span className="block text-xs text-muted">{g('reminded')}</span>}
                  </td>
                  <td className="py-2 pr-3 whitespace-nowrap">{dateLabel(r.openedAt, lng)}</td>
                  <td className="py-2 pr-3 tabular-nums">{r.rating === null ? '—' : <span className={r.rating <= 3 ? 'font-semibold text-danger-fg' : 'font-semibold'}>{r.rating}/5</span>}</td>
                  <td className="py-2 pr-3 tabular-nums">{r.googleClicks || '—'}</td>
                  <td className="max-w-[16rem] py-2 text-xs text-muted">{r.feedback ? <span className="line-clamp-3 whitespace-pre-line">{r.feedback}</span> : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};

export const GoogleReviewPanel = ({ canEdit }: { canEdit: boolean }) => {
  const g = useG();
  const { i18n } = useTranslation();
  const { data } = useQuery({ queryKey: KEY, queryFn: async () => (await api.get<Data>('/admin/reviews/google')).data });
  if (!data) return null;
  const { totals, months, distribution, legacy } = data.stats;
  const max = Math.max(1, ...months.map((m) => m.sent));
  const distMax = Math.max(1, ...distribution);
  const lng = i18n.resolvedLanguage ?? 'az';

  return (
    <Panel title={g('title')} icon={Star}>
      <p className="-mt-1 mb-3 text-sm text-muted">{g('intro')}</p>
      <p className="mb-5 flex gap-2 rounded-xl bg-sunken px-4 py-3 text-xs text-muted">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        <span>{g('policy')}</span>
      </p>
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-6">
        <StatTile label={g('tiles.sent')} value={totals.sent} icon={Send} />
        <StatTile label={g('tiles.opened')} value={totals.opened} hint={pct(totals.openRate)} icon={MailOpen} />
        <StatTile label={g('tiles.rated')} value={totals.averageRating === null ? '—' : totals.averageRating.toFixed(1)} hint={String(totals.rated)} icon={Star} />
        <StatTile label={g('tiles.google')} value={totals.googleClicked} hint={pct(totals.clickRate)} icon={MousePointerClick} tone={totals.googleClicked > 0 ? 'good' : undefined} />
        <StatTile label={g('tiles.low')} value={`${totals.lowRatings} / ${totals.held}`} icon={ThumbsDown} />
        <StatTile label={g('tiles.optedOut')} value={totals.optedOut} icon={UserX} />
      </div>

      <h3 className="mb-2 text-sm font-semibold text-ink">{g('distribution')}</h3>
      <ul className="mb-6 space-y-1.5" aria-label={g('distribution')}>
        {[5, 4, 3, 2, 1].map((n) => (
          <li key={n} className="flex items-center gap-3 text-sm">
            <span className="w-6 text-right tabular-nums text-muted">{n}</span>
            <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-sunken" aria-hidden>
              <span className={`block h-full rounded-full ${BAR[n - 1]}`} style={{ width: `${(distribution[n - 1] / distMax) * 100}%` }} />
            </span>
            <span className="w-8 tabular-nums">{distribution[n - 1]}</span>
          </li>
        ))}
      </ul>

      <Form initial={data.settings} canEdit={canEdit} />
      <Preview canEdit={canEdit} />

      <h3 className="mt-8 mb-3 text-sm font-semibold text-ink">{g('statsTitle')}</h3>
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <table className="w-full min-w-[36rem] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              <th scope="col" className="py-2 pr-3 font-semibold">
                {g('month')}
              </th>
              <th scope="col" className="py-2 pr-3 font-semibold">
                {g('sent')}
              </th>
              {(['opened', 'rated', 'low', 'googleClicked'] as const).map((c) => (
                <th key={c} scope="col" className="py-2 pr-3 text-right font-semibold last:pr-0">
                  {g(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...months].reverse().map((m) => (
              <tr key={m.month} className="border-b border-line/60 last:border-0">
                <th scope="row" className="py-2 pr-3 text-left font-medium whitespace-nowrap text-ink">
                  {monthLabel(m.month, lng)}
                </th>
                <td className="py-2 pr-3">
                  <span className="flex items-center gap-2">
                    <span className="h-2 rounded-full bg-primary/70" style={{ width: `${Math.max(m.sent ? 6 : 0, (m.sent / max) * 120)}px` }} aria-hidden />
                    <span className="tabular-nums">{m.sent}</span>
                  </span>
                </td>
                <td className="py-2 pr-3 text-right tabular-nums">{m.opened}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{m.rated}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{m.low}</td>
                <td className="py-2 text-right tabular-nums">{m.googleClicked}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {legacy.sent > 0 && <p className="mt-3 text-xs text-muted">{g('legacy', legacy)}</p>}

      <Invites />
    </Panel>
  );
};

export default GoogleReviewPanel;
