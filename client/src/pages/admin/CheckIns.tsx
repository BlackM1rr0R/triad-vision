import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, PlaneLanding, Send, Settings2 } from 'lucide-react';
import { api, errorCode } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { hasMinRole } from '@/lib/types';
import { usePageTitle } from '@/lib/usePageTitle';
import { registerCopy } from '@/i18n';
import { pagesTimeCare } from '@/i18n/pagesTimeCare';
import { Chip, ErrorBlock, LoadingBlock, PageHead, Panel, StatTile, Switch } from '@/components/admin/ui';
import { Modal } from '@/components/settlement/Modal';
import { RISK_LEVELS, RiskBadge, RiskReasons, type RiskReason } from '@/components/postArrival/RiskBadge';

registerCopy(pagesTimeCare);

const TOPICS = ['HOUSING', 'SALARY', 'WORKPLACE', 'TEAM', 'LANGUAGE', 'HOMESICK', 'HEALTH', 'DOCUMENTS', 'OTHER'] as const;
const REASONS = ['QUIT', 'DISMISSED', 'CONTRACT_ENDED', 'CHANGED_EMPLOYER', 'RETURNED_HOME', 'OTHER'] as const;
const STATUS = ['all', 'issue', 'noAnswer', 'employed', 'left'] as const;
type Status = (typeof STATUS)[number];
const RISK = ['all', ...RISK_LEVELS] as const;
type Risk = (typeof RISK)[number];
const SORTS = ['arrived', 'risk'] as const;
type Sort = (typeof SORTS)[number];

interface CheckInRow {
  id: string;
  audience: 'WORKER' | 'EMPLOYER';
  offsetDays: number;
  sentAt: string | null;
  answer: 'OK' | 'ISSUE' | null;
  topics: string[];
  comment: string | null;
  answeredAt: string | null;
  resolvedAt: string | null;
}
interface Worker {
  id: string;
  caseId: string;
  caseNumber: string;
  worker: string;
  company: string | null;
  staff: string | null;
  arrivedAt: string;
  leftJobAt: string | null;
  leftReason: string | null;
  openIssue: boolean;
  riskScore: number | null;
  riskLevel: string | null;
  riskReasons: RiskReason[];
  riskAt: string | null;
  checkIns: CheckInRow[];
}
interface Overview {
  totals: { followUps: number; sent: number; answered: number; ok: number; issue: number; openIssues: number; responseRate: number | null; left: number; highRisk: number; mediumRisk: number };
  byOffset: { audience: 'WORKER' | 'EMPLOYER'; offsetDays: number; sent: number; answered: number; ok: number; issue: number }[];
  topics: Record<string, number>;
  retention: { months: number; eligible: number; employed: number; pct: number | null }[];
  leftReasons: Record<string, number>;
  workers: Worker[];
}
interface Settings {
  enabled: boolean;
  workerOffsets: number[];
  employerEnabled: boolean;
  employerOffsets: number[];
}

/** Admin → Gəlişdən sonra: retention dashboard of the post-arrival check-ins. */
export default function CheckIns() {
  const { t, i18n } = useTranslation();
  usePageTitle(t('checkInAdmin.title'));
  const { user } = useAuth();
  const isAdmin = hasMinRole(user?.role, 'ADMIN');
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const status = ((STATUS as readonly string[]).includes(params.get('status') ?? '') ? params.get('status') : 'all') as Status;
  const risk = ((RISK as readonly string[]).includes(params.get('risk') ?? '') ? params.get('risk') : 'all') as Risk;
  const sort = ((SORTS as readonly string[]).includes(params.get('sort') ?? '') ? params.get('sort') : 'arrived') as Sort;
  // Keeps the other list params when one changes.
  const setParam = (key: string, value: string, fallback: string) => {
    const next = new URLSearchParams(params);
    if (value === fallback) next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  };
  const [left, setLeft] = useState<Worker | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const q = useQuery({ queryKey: ['check-ins', status, risk, sort], queryFn: async () => (await api.get<Overview>('/admin/check-ins/overview', { params: { status, risk, sort } })).data, placeholderData: keepPreviousData });
  const onError = (e: unknown) => toast.error(t(`time.errors.${errorCode(e)}`, { defaultValue: t('time.errors.generic') }));
  const refresh = () => void qc.invalidateQueries({ queryKey: ['check-ins'] });
  const resolve = useMutation({ mutationFn: async (id: string) => api.post(`/admin/check-ins/${id}/resolve`, {}), onSuccess: () => (refresh(), void qc.invalidateQueries({ queryKey: ['my-work'] })), onError });
  const undoLeft = useMutation({ mutationFn: async (id: string) => api.patch(`/admin/check-ins/follow-ups/${id}/left`, { left: false }), onSuccess: refresh, onError });
  const run = useMutation({
    mutationFn: async () => (await api.post<{ worker: number; employer: number }>('/admin/check-ins/run')).data,
    onSuccess: (d) => (toast.success(t('checkInAdmin.ran', d)), refresh()),
    onError,
  });
  const date = (s: string) => new Date(s).toLocaleDateString(i18n.language);

  if (q.isLoading) return <LoadingBlock />;
  if (q.error || !q.data) return <ErrorBlock error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data;
  const maxTopic = Math.max(0, ...Object.values(d.topics));

  return (
    <div className="space-y-6">
      <PageHead
        title={t('checkInAdmin.title')}
        subtitle={t('checkInAdmin.subtitle')}
        actions={
          isAdmin && (
            <>
              <button type="button" className="btn-secondary btn-sm" onClick={() => run.mutate()} disabled={run.isPending}>
                <Send className="size-4" /> {t('checkInAdmin.runNow')}
              </button>
              <button type="button" className="btn-secondary btn-sm" onClick={() => setShowSettings(true)}>
                <Settings2 className="size-4" /> {t('checkInAdmin.settings.title')}
              </button>
            </>
          )
        }
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <StatTile label={t('checkInAdmin.kpi.followUps')} value={d.totals.followUps} />
        <StatTile label={t('checkInAdmin.kpi.response')} value={d.totals.responseRate === null ? '—' : `${d.totals.responseRate}%`} hint={`${d.totals.answered} / ${d.totals.sent}`} />
        <StatTile label={t('checkInAdmin.kpi.ok')} value={d.totals.ok} tone="good" />
        <StatTile label={t('checkInAdmin.kpi.issues')} value={d.totals.issue} tone={d.totals.issue ? 'warn' : undefined} />
        <StatTile label={t('checkInAdmin.kpi.open')} value={d.totals.openIssues} tone={d.totals.openIssues ? 'danger' : undefined} />
        <StatTile label={t('checkInAdmin.kpi.left')} value={d.totals.left} />
        <StatTile
          label={t('postArrival.risk.kpi')}
          value={d.totals.highRisk}
          tone={d.totals.highRisk ? 'danger' : undefined}
          hint={t('postArrival.risk.kpiHint', { count: d.totals.mediumRisk })}
          to={risk === 'HIGH' ? undefined : '/admin/check-ins?risk=HIGH&sort=risk'}
        />
      </div>

      {d.totals.followUps === 0 ? (
        <Panel>
          <p className="text-sm text-muted">{t('checkInAdmin.noData')}</p>
        </Panel>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Panel title={t('checkInAdmin.retentionTitle')}>
            <ul className="space-y-3">
              {d.retention.map((r) => (
                <li key={r.months}>
                  <div className="flex justify-between gap-2 text-sm">
                    <span>{t('checkInAdmin.months', { n: r.months })}</span>
                    <strong className="tabular-nums">{r.pct === null ? '—' : `${r.pct}%`}</strong>
                  </div>
                  <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-sunken" aria-hidden>
                    <span className="block h-full rounded-full bg-success" style={{ width: `${r.pct ?? 0}%` }} />
                  </span>
                  <p className="mt-0.5 text-[11px] text-muted">{t('checkInAdmin.retentionOf', { employed: r.employed, eligible: r.eligible })}</p>
                </li>
              ))}
            </ul>
            {Object.values(d.leftReasons).some(Boolean) && (
              <div className="mt-4 border-t border-line pt-3">
                <p className="mb-1 text-xs font-semibold text-muted">{t('checkInAdmin.leftReasonsTitle')}</p>
                <ul className="space-y-0.5 text-sm">
                  {REASONS.filter((r) => d.leftReasons[r]).map((r) => (
                    <li key={r} className="flex justify-between">
                      <span>{t(`checkInAdmin.reasons.${r}`)}</span>
                      <span className="tabular-nums">{d.leftReasons[r]}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Panel>
          <Panel title={t('checkInAdmin.topicsTitle')}>
            <ul className="space-y-2 text-sm">
              {TOPICS.map((k) => (
                <li key={k}>
                  <div className="flex justify-between">
                    <span>{t(`checkIn.topics.${k}`)}</span>
                    <span className="tabular-nums">{d.topics[k] ?? 0}</span>
                  </div>
                  <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-sunken" aria-hidden>
                    <span className="block h-full rounded-full bg-warning" style={{ width: `${maxTopic ? Math.round(((d.topics[k] ?? 0) / maxTopic) * 100) : 0}%` }} />
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title={t('checkInAdmin.byOffset')}>
            <ul className="space-y-2 text-sm">
              {d.byOffset.map((b) => (
                <li key={`${b.audience}${b.offsetDays}`} className="flex flex-wrap justify-between gap-x-2">
                  <span>
                    {t(`checkInAdmin.${b.audience}`)} · {t('checkInAdmin.days', { n: b.offsetDays })}
                  </span>
                  <span className="text-xs text-muted tabular-nums">
                    {b.answered}/{b.sent} · 👍 {b.ok} · ⚠️ {b.issue}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      )}

      <Panel title={t('checkInAdmin.workersTitle')} icon={PlaneLanding} bodyClassName="p-0 sm:p-0">
        <div className="flex gap-2 overflow-x-auto border-b border-line px-5 py-3">
          {STATUS.map((s) => (
            <Chip key={s} active={status === s} onClick={() => setParam('status', s, 'all')}>
              {t(`checkInAdmin.filters.${s}`)}
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
          <span className="text-xs font-semibold text-muted">{t('postArrival.risk.filter')}:</span>
          {RISK.map((r) => (
            <Chip key={r} active={risk === r} onClick={() => setParam('risk', r, 'all')}>
              {r === 'all' ? t('postArrival.risk.all') : t(`postArrival.risk.levels.${r}`)}
            </Chip>
          ))}
          <label className="ml-auto flex items-center gap-2 text-xs text-muted">
            {t('postArrival.risk.sortLabel')}
            <select className="input h-9 w-auto py-1 text-xs" value={sort} onChange={(e) => setParam('sort', e.target.value, 'arrived')}>
              {SORTS.map((x) => (
                <option key={x} value={x}>
                  {t(`postArrival.risk.sort.${x}`)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <ul className="divide-y divide-line">
          {d.workers.map((w) => (
            <li key={w.id} className="flex flex-col gap-2 px-5 py-3 lg:flex-row lg:items-start lg:gap-4">
              <div className="min-w-0 lg:w-64 lg:shrink-0">
                <p className="truncate text-sm font-semibold text-ink">
                  {w.openIssue && <AlertTriangle className="mr-1 inline size-4 text-warning-fg" aria-hidden />}
                  {w.worker}
                </p>
                <p className="truncate text-xs text-muted">
                  <Link to={`/admin/cases/${w.caseId}`} className="hover:underline">
                    {w.caseNumber}
                  </Link>
                  {w.company && ` · ${w.company}`} · {t('checkInAdmin.cols.arrived')}: {date(w.arrivedAt)}
                </p>
                {!w.leftJobAt && (
                  <div className="mt-1.5 space-y-1" title={w.riskAt ? t('postArrival.risk.updated', { date: date(w.riskAt) }) : undefined}>
                    <RiskBadge level={w.riskLevel} score={w.riskScore} />
                    <RiskReasons reasons={w.riskReasons} />
                  </div>
                )}
              </div>
              <ul className="flex min-w-0 flex-1 flex-wrap gap-1.5">
                {w.checkIns.map((c) => (
                  <li
                    key={c.id}
                    className={clsx(
                      'max-w-full rounded-lg border px-2 py-1 text-[11px]',
                      c.answer === 'ISSUE' && !c.resolvedAt ? 'border-warning-border bg-warning-bg' : c.answer === 'OK' ? 'border-success-border bg-success-bg' : 'border-line bg-sunken',
                    )}
                  >
                    <span className="font-semibold">
                      {t(`checkInAdmin.${c.audience}`)} {t('checkInAdmin.days', { n: c.offsetDays })}:
                    </span>{' '}
                    {c.answer === 'OK' ? '👍' : c.answer === 'ISSUE' ? `⚠️ ${c.topics.map((x) => t(`checkIn.topics.${x}`)).join(', ')}` : t('checkInAdmin.pending')}
                    {c.comment && <span className="block break-words text-muted">“{c.comment}”</span>}
                    {c.answer === 'ISSUE' &&
                      (c.resolvedAt ? (
                        <span className="ml-1 text-success-fg">✓ {t('checkInAdmin.resolved')}</span>
                      ) : (
                        <button type="button" className="ml-1 font-semibold text-link hover:underline" onClick={() => resolve.mutate(c.id)}>
                          <CheckCircle2 className="inline size-3" aria-hidden /> {t('checkInAdmin.resolve')}
                        </button>
                      ))}
                  </li>
                ))}
              </ul>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {w.leftJobAt ? (
                  <>
                    <span className="text-xs text-muted">
                      {t('checkInAdmin.leftOn', { date: date(w.leftJobAt) })}
                      {w.leftReason && ` · ${t(`checkInAdmin.reasons.${w.leftReason}`)}`}
                    </span>
                    <button type="button" className="btn-secondary btn-sm" onClick={() => undoLeft.mutate(w.id)}>
                      {t('checkInAdmin.undoLeft')}
                    </button>
                  </>
                ) : (
                  <>
                    <span className="rounded-full bg-success-bg px-2 py-0.5 text-[11px] font-semibold text-success-fg">{t('checkInAdmin.employed')}</span>
                    <button type="button" className="btn-secondary btn-sm" onClick={() => setLeft(w)}>
                      {t('checkInAdmin.markLeft')}
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Panel>
      {left && <LeftDialog worker={left} onClose={() => setLeft(null)} onDone={refresh} />}
      {showSettings && <SettingsDialog onClose={() => setShowSettings(false)} />}
    </div>
  );
}

const LeftDialog = ({ worker, onClose, onDone }: { worker: Worker; onClose: () => void; onDone: () => void }) => {
  const { t } = useTranslation();
  const [form, setForm] = useState({ leftAt: new Date().toISOString().slice(0, 10), reason: 'QUIT' as (typeof REASONS)[number], note: '' });
  const save = useMutation({
    mutationFn: async () => api.patch(`/admin/check-ins/follow-ups/${worker.id}/left`, { left: true, ...form, note: form.note || null }),
    onSuccess: () => (onDone(), onClose()),
    onError: (e) => toast.error(t(`time.errors.${errorCode(e)}`, { defaultValue: t('time.errors.generic') })),
  });
  const submit = (e: FormEvent) => (e.preventDefault(), save.mutate());
  return (
    <Modal title={`${t('checkInAdmin.leftDialog.title')}: ${worker.worker}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <label className="block">
          <span className="label">{t('checkInAdmin.leftDialog.date')}</span>
          <input type="date" className="input" min={worker.arrivedAt.slice(0, 10)} value={form.leftAt} onChange={(e) => setForm((s) => ({ ...s, leftAt: e.target.value }))} required />
        </label>
        <label className="block">
          <span className="label">{t('checkInAdmin.leftDialog.reason')}</span>
          <select className="input" value={form.reason} onChange={(e) => setForm((s) => ({ ...s, reason: e.target.value as (typeof REASONS)[number] }))}>
            {REASONS.map((r) => (
              <option key={r} value={r}>
                {t(`checkInAdmin.reasons.${r}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">{t('checkInAdmin.leftDialog.note')}</span>
          <textarea className="input" rows={2} maxLength={1000} value={form.note} onChange={(e) => setForm((s) => ({ ...s, note: e.target.value }))} />
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary btn-sm" onClick={onClose}>
            {t('checkInAdmin.leftDialog.cancel')}
          </button>
          <button type="submit" className="btn-primary btn-sm" disabled={save.isPending}>
            {t('checkInAdmin.leftDialog.save')}
          </button>
        </div>
      </form>
    </Modal>
  );
};

const SettingsDialog = ({ onClose }: { onClose: () => void }) => {
  const { t } = useTranslation();
  const q = useQuery({ queryKey: ['check-ins', 'settings'], queryFn: async () => (await api.get<{ settings: Settings }>('/admin/check-ins/settings')).data.settings });
  const [draft, setDraft] = useState<(Settings & { offsetsText: string; employerText: string }) | null>(null);
  const s = draft ?? (q.data ? { ...q.data, offsetsText: q.data.workerOffsets.join(', '), employerText: q.data.employerOffsets.join(', ') } : null);
  const save = useMutation({
    mutationFn: async (v: Settings) => api.put('/admin/check-ins/settings', v),
    onSuccess: () => (toast.success(t('checkInAdmin.settings.saved')), onClose()),
    onError: (e) => toast.error(t(`time.errors.${errorCode(e)}`, { defaultValue: t('time.errors.generic') })),
  });
  if (!s) return null;
  const set = (patch: Partial<typeof s>) => setDraft({ ...s, ...patch });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const days = (text: string) =>
      text
        .split(/[,\s]+/)
        .map(Number)
        .filter((n) => Number.isInteger(n) && n > 0);
    const employerOffsets = days(s.employerText);
    save.mutate({ enabled: s.enabled, workerOffsets: days(s.offsetsText), employerEnabled: s.employerEnabled, employerOffsets: employerOffsets.length ? employerOffsets : [30, 90, 180] });
  };
  return (
    <Modal title={t('checkInAdmin.settings.title')} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm">{t('checkInAdmin.settings.enabled')}</span>
          <Switch checked={s.enabled} onChange={(v: boolean) => set({ enabled: v })} label={t('checkInAdmin.settings.enabled')} />
        </div>
        <label className="block">
          <span className="label">{t('checkInAdmin.settings.offsets')}</span>
          <input className="input" value={s.offsetsText} onChange={(e) => set({ offsetsText: e.target.value })} />
          <span className="mt-1 block text-[11px] text-muted">{t('postArrival.settings.offsetsHint')}</span>
        </label>
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm">{t('checkInAdmin.settings.employerEnabled')}</span>
          <Switch checked={s.employerEnabled} onChange={(v: boolean) => set({ employerEnabled: v })} label={t('checkInAdmin.settings.employerEnabled')} />
        </div>
        <label className="block">
          <span className="label">{t('postArrival.settings.employerOffsets')}</span>
          <input className="input" value={s.employerText} disabled={!s.employerEnabled} onChange={(e) => set({ employerText: e.target.value })} />
          <span className="mt-1 block text-[11px] text-muted">{t('postArrival.settings.employerOffsetsHint')}</span>
        </label>
        <div className="flex justify-end">
          <button type="submit" className="btn-primary btn-sm" disabled={save.isPending}>
            {t('checkInAdmin.settings.save')}
          </button>
        </div>
      </form>
    </Modal>
  );
};
