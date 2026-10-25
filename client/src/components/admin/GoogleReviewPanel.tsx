import { useEffect, useId, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { MousePointerClick, Play, Send, Star, UserX } from 'lucide-react';
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
 * Admin → Rəylər → "Google rəyləri": settings of the one-time Google review request (lib/googleReview on the
 * API: link, on/off, trigger + delay, channels, low-score threshold) and sent / clicked per month.
 */

interface Settings {
  enabled: boolean;
  url: string;
  trigger: 'APPROVED' | 'ARRIVAL';
  delayDays: number;
  channels: { email: boolean; inApp: boolean; whatsapp: boolean };
  lowScoreMax: number;
  maxAgeDays: number;
}
interface Month {
  month: string;
  sent: number;
  clicked: number;
  internal: number;
  clicks: number;
}
interface Data {
  settings: Settings;
  stats: { months: Month[]; totals: { sent: number; clicked: number; internal: number; optedOut: number; clickRate: number | null } };
}

const KEY = ['admin-reviews', 'google'];

const monthLabel = (m: string, lng: string) => {
  const [y, mo] = m.split('-').map(Number);
  try {
    return new Intl.DateTimeFormat(lng, { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, mo - 1, 1)));
  } catch {
    return m;
  }
};

const Form = ({ initial, canEdit }: { initial: Settings; canEdit: boolean }) => {
  const { t } = useTranslation();
  const g = (k: string, o?: Record<string, unknown>) => String(t(`googleReview.${k}`, o));
  const qc = useQueryClient();
  const [s, setS] = useState<Settings>(initial);
  useEffect(() => setS(initial), [initial]);
  const ids = { url: useId(), trigger: useId(), delay: useId(), low: useId(), age: useId(), urlHint: useId() };
  const urlValid = s.url.trim() === '' || /^https:\/\/\S+$/i.test(s.url.trim());
  const urlMissing = s.enabled && !s.url.trim();

  const save = useMutation({
    mutationFn: async () => (await api.put<{ settings: Settings }>('/admin/reviews/google', { ...s, url: s.url.trim() })).data,
    onSuccess: () => {
      toast.success(g('saved'));
      void qc.invalidateQueries({ queryKey: KEY });
    },
    onError: (err) => (errorCode(err) === 'URL_REQUIRED' ? toast.error(g('urlRequired')) : toastError(err)),
  });
  const run = useMutation({
    mutationFn: async () => (await api.post<{ sent: number; internal: number; skipped: number }>('/admin/reviews/google/run')).data,
    onSuccess: (r) => {
      toast.success(g('ran', r));
      void qc.invalidateQueries({ queryKey: KEY });
    },
    onError: (err) => toastError(err),
  });
  const num = (v: string, min: number, max: number) => Math.min(max, Math.max(min, Math.round(Number(v) || 0)));

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (canEdit && urlValid && !urlMissing) save.mutate();
      }}
    >
      <Switch checked={s.enabled} onChange={(v) => setS({ ...s, enabled: v })} label={g('enabled')} showLabel disabled={!canEdit} />
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
          disabled={!canEdit}
          aria-describedby={ids.urlHint}
          aria-invalid={!urlValid || urlMissing || undefined}
          onChange={(e) => setS({ ...s, url: e.target.value })}
        />
        <p id={ids.urlHint} className={!urlValid || urlMissing ? 'mt-1 text-xs text-danger-fg' : 'mt-1 text-xs text-muted'}>
          {!urlValid ? g('urlInvalid') : urlMissing ? g('urlRequired') : g('urlHint')}
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label htmlFor={ids.trigger} className="label">
            {g('trigger')}
          </label>
          <select id={ids.trigger} className="input" value={s.trigger} disabled={!canEdit} onChange={(e) => setS({ ...s, trigger: e.target.value as Settings['trigger'] })}>
            <option value="APPROVED">{g('triggerApproved')}</option>
            <option value="ARRIVAL">{g('triggerArrival')}</option>
          </select>
        </div>
        <div>
          <label htmlFor={ids.delay} className="label">
            {g('delay')}
          </label>
          <input id={ids.delay} type="number" min={0} max={60} className="input" value={s.delayDays} disabled={!canEdit} onChange={(e) => setS({ ...s, delayDays: num(e.target.value, 0, 60) })} />
        </div>
        <div>
          <label htmlFor={ids.low} className="label">
            {g('lowScore')}
          </label>
          <input id={ids.low} type="number" min={0} max={10} className="input" value={s.lowScoreMax} disabled={!canEdit} onChange={(e) => setS({ ...s, lowScoreMax: num(e.target.value, 0, 10) })} />
        </div>
        <div>
          <label htmlFor={ids.age} className="label">
            {g('maxAge')}
          </label>
          <input id={ids.age} type="number" min={7} max={365} className="input" value={s.maxAgeDays} disabled={!canEdit} onChange={(e) => setS({ ...s, maxAgeDays: num(e.target.value, 7, 365) })} />
        </div>
      </div>
      <fieldset>
        <legend className="label">{g('channels')}</legend>
        <div className="mt-1 flex flex-wrap gap-x-6 gap-y-2">
          <Checkbox checked={s.channels.email} disabled={!canEdit} onChange={(e) => setS({ ...s, channels: { ...s.channels, email: e.target.checked } })} label={g('email')} />
          <Checkbox checked={s.channels.inApp} disabled={!canEdit} onChange={(e) => setS({ ...s, channels: { ...s.channels, inApp: e.target.checked } })} label={g('inApp')} />
          <Checkbox checked={s.channels.whatsapp} disabled={!canEdit} onChange={(e) => setS({ ...s, channels: { ...s.channels, whatsapp: e.target.checked } })} label={g('whatsapp')} />
        </div>
      </fieldset>
      <p className="text-xs text-muted">{g('privacyNote')}</p>
      {canEdit ? (
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className="btn-secondary btn-sm" onClick={() => run.mutate()} disabled={run.isPending || !initial.enabled || !initial.url}>
            {run.isPending ? <Spinner className="size-3.5" /> : <Play className="size-3.5" aria-hidden />} {g('runNow')}
          </button>
          <button type="submit" className="btn-primary btn-sm" disabled={save.isPending || !urlValid || urlMissing}>
            {save.isPending && <Spinner className="size-3.5" />} {g('save')}
          </button>
        </div>
      ) : (
        <p className="rounded-lg bg-sunken px-4 py-3 text-sm text-muted">{g('readOnly')}</p>
      )}
    </form>
  );
};

export const GoogleReviewPanel = ({ canEdit }: { canEdit: boolean }) => {
  const { t, i18n } = useTranslation();
  const g = (k: string, o?: Record<string, unknown>) => String(t(`googleReview.${k}`, o));
  const { data } = useQuery({ queryKey: KEY, queryFn: async () => (await api.get<Data>('/admin/reviews/google')).data });
  if (!data) return null;
  const { totals, months } = data.stats;
  const max = Math.max(1, ...months.map((m) => m.sent));
  const lng = i18n.resolvedLanguage ?? 'az';

  return (
    <Panel title={g('title')} icon={Star}>
      <p className="-mt-1 mb-4 text-sm text-muted">{g('intro')}</p>
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label={g('tiles.sent')} value={totals.sent} icon={Send} />
        <StatTile label={g('tiles.clicked')} value={totals.clicked} icon={MousePointerClick} tone={totals.clicked > 0 ? 'good' : undefined} />
        <StatTile label={g('tiles.rate')} value={totals.clickRate === null ? '—' : `${Math.round(totals.clickRate * 100)}%`} icon={Star} />
        <StatTile label={g('tiles.optedOut')} value={totals.optedOut} icon={UserX} />
      </div>
      <Form initial={data.settings} canEdit={canEdit} />
      <h3 className="mt-8 mb-3 text-sm font-semibold text-ink">{g('statsTitle')}</h3>
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <table className="w-full min-w-[34rem] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              <th scope="col" className="py-2 pr-3 font-semibold">
                {g('month')}
              </th>
              <th scope="col" className="py-2 pr-3 font-semibold">
                {g('sent')}
              </th>
              <th scope="col" className="py-2 pr-3 text-right font-semibold">
                {g('clicked')}
              </th>
              <th scope="col" className="py-2 pr-3 text-right font-semibold">
                {g('clicks')}
              </th>
              <th scope="col" className="py-2 text-right font-semibold">
                {g('internal')}
              </th>
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
                <td className="py-2 pr-3 text-right tabular-nums">{m.clicked}</td>
                <td className="py-2 pr-3 text-right text-muted tabular-nums">{m.clicks}</td>
                <td className="py-2 text-right tabular-nums">{m.internal}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
};

export default GoogleReviewPanel;
