import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { toast } from 'sonner';
import { AlertTriangle, Check, CircleDashed, ClipboardCheck, Pencil, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useL10n } from '@/lib/l10n';
import { registerCopy } from '@/i18n';
import { pagesFamilyReunion } from '@/i18n/pagesFamilyReunion';
import { TONE_CLASS, TONE_TEXT } from '@/components/ui/status';
import { Spinner } from '@/components/ui/Spinner';
import { useApiError } from '@/components/portal/useApiError';
import { SPONSOR_TITLES, memberName, type CheckStatus, type FamilyOverview, type FamilyReadiness, type ReadinessCheck, type ReadinessStatus, type SponsorTitle } from './types';

registerCopy(pagesFamilyReunion);

/**
 * Familiennachzug readiness (server/src/lib/family/readiness.ts): the step timeline, one line per legal check
 * (main applicant's title, flat, income; per member age / language / parent rule) and the form for the main
 * applicant's data. Same card in the client portal and the admin family panel.
 */

export const READINESS_TONE: Record<ReadinessStatus, keyof typeof TONE_CLASS> = { READY: 'success', ATTENTION: 'warning', INCOMPLETE: 'info', BLOCKED: 'danger' };
const CHECK_TONE: Record<CheckStatus, keyof typeof TONE_TEXT> = { ok: 'success', warn: 'warning', fail: 'danger', missing: 'neutral' };
const CHECK_ICON: Record<CheckStatus, typeof Check> = { ok: Check, warn: AlertTriangle, fail: X, missing: CircleDashed };

/** Seven steps from "family added" to "entry"; the current one is highlighted. */
export const ReunionTimeline = ({ r }: { r: FamilyReadiness }) => {
  const { t } = useTranslation();
  const { date, dateTime } = useL10n();
  return (
    <ol className="grid gap-2 sm:grid-cols-7 sm:gap-1" aria-label={t('familyReunion.timelineTitle')}>
      {r.timeline.map((s, i) => (
        <li key={s.key} className="flex items-start gap-2 sm:flex-col sm:items-center sm:text-center" aria-current={s.state === 'current' ? 'step' : undefined}>
          <span
            className={clsx(
              'grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold',
              s.state === 'done' ? TONE_CLASS.success : s.state === 'current' ? 'bg-primary text-white' : 'bg-sunken text-muted',
            )}
          >
            {s.state === 'done' ? <Check className="size-3.5" aria-hidden /> : i + 1}
          </span>
          <span className="min-w-0 text-xs">
            <span className={clsx('block', s.state === 'current' ? 'font-semibold text-ink' : 'text-muted')}>{t(`familyReunion.steps.${s.key}`)}</span>
            {s.state === 'current' && <span className="sr-only">{t('familyReunion.current')}</span>}
            {s.date && <span className="block text-[11px] text-muted">{s.key === 'appointment' ? dateTime(s.date) : date(s.date)}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
};

const CheckLine = ({ c, data }: { c: ReadinessCheck; data: FamilyOverview }) => {
  const { t } = useTranslation();
  const Icon = CHECK_ICON[c.status];
  const member = c.memberCaseId ? data.members.find((m) => m.caseId === c.memberCaseId) : null;
  const params = { ...c.params, paragraph: c.params.paragraph ?? '' };
  const textKey = c.code === 'LIVING_SPACE' && c.params.exempt ? 'exempt' : c.status;
  return (
    <li className="flex items-start gap-2.5 py-2 text-sm">
      <Icon className={clsx('mt-0.5 size-4 shrink-0', TONE_TEXT[CHECK_TONE[c.status]])} aria-hidden />
      <span className="min-w-0">
        <span className="font-semibold text-ink">
          {member && <>{memberName(member)} · </>}
          {t(`familyReunion.checks.${c.code}.title`, params)}
        </span>
        <span className="sr-only"> ({t(`familyReunion.checkStatus.${c.status}`)})</span>
        <span className="block text-xs text-muted">{t(`familyReunion.checks.${c.code}.${textKey}`, params)}</span>
      </span>
    </li>
  );
};

interface InfoForm {
  sponsorTitle: SponsorTitle | '';
  titleIssuedAt: string;
  livingSpaceM2: string;
  warmRent: string;
  netMonthly: string;
  notes: string;
}

const formOf = (r: FamilyReadiness): InfoForm => ({
  sponsorTitle: r.info?.sponsorTitle ?? r.inferred.sponsorTitle ?? '',
  titleIssuedAt: r.info?.titleIssuedAt ?? r.inferred.titleIssuedAt ?? '',
  livingSpaceM2: r.info?.livingSpaceM2?.toString() ?? '',
  warmRent: r.info?.warmRent?.toString() ?? '',
  netMonthly: r.info?.netMonthly?.toString() ?? '',
  notes: r.info?.notes ?? '',
});
const int = (v: string) => (v.trim() === '' ? null : Math.max(0, Math.round(Number(v))));

const InfoFields = ({ caseId, r, onDone, onCancel }: { caseId: string; r: FamilyReadiness; onDone: () => Promise<unknown>; onCancel: () => void }) => {
  const { t } = useTranslation();
  const apiError = useApiError();
  const [f, setF] = useState<InfoForm>(() => formOf(r));
  const [busy, setBusy] = useState(false);
  const set = (k: keyof InfoForm) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));
  const id = (k: string) => `reunion-${caseId}-${k}`;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.put(`/family/cases/${caseId}/reunion/info`, {
        sponsorTitle: f.sponsorTitle || null,
        titleIssuedAt: f.titleIssuedAt || null,
        livingSpaceM2: int(f.livingSpaceM2),
        warmRent: int(f.warmRent),
        netMonthly: int(f.netMonthly),
        notes: f.notes.trim() || null,
      });
      toast.success(t('familyReunion.form.saved'));
      await onDone();
    } catch (err) {
      apiError(err);
    } finally {
      setBusy(false);
    }
  };
  const num = (k: 'livingSpaceM2' | 'warmRent' | 'netMonthly', hint?: string | null) => (
    <div className="min-w-0">
      <label htmlFor={id(k)} className="label">
        {t(`familyReunion.form.${k}`)}
      </label>
      <input id={id(k)} type="number" inputMode="numeric" min={0} step={1} className="input" value={f[k]} onChange={set(k)} />
      {hint && <p className="mt-1 text-[11px] text-muted">{hint}</p>}
    </div>
  );
  return (
    <form onSubmit={(e) => void submit(e)} className="mt-3 grid gap-3 rounded-xl border border-line bg-surface/60 p-3.5 sm:grid-cols-2">
      <div className="min-w-0">
        <label htmlFor={id('title')} className="label">
          {t('familyReunion.form.title')}
        </label>
        <select id={id('title')} className="input" value={f.sponsorTitle} onChange={set('sponsorTitle')}>
          <option value="">{t('familyReunion.form.none')}</option>
          {SPONSOR_TITLES.map((s) => (
            <option key={s} value={s}>
              {t(`familyReunion.titles.${s}`)}
            </option>
          ))}
        </select>
        {!r.info?.sponsorTitle && r.inferred.sponsorTitle && <p className="mt-1 text-[11px] text-muted">{t('familyReunion.form.inferred', { value: t(`familyReunion.titles.${r.inferred.sponsorTitle}`) })}</p>}
      </div>
      <div className="min-w-0">
        <label htmlFor={id('issued')} className="label">
          {t('familyReunion.form.titleIssuedAt')}
        </label>
        <input id={id('issued')} type="date" className="input" value={f.titleIssuedAt} onChange={set('titleIssuedAt')} />
      </div>
      {num('livingSpaceM2')}
      {num('warmRent')}
      {num('netMonthly', r.inferred.grossMonthly != null ? t('familyReunion.form.gross', { gross: r.inferred.grossMonthly }) : null)}
      <div className="min-w-0 sm:col-span-2">
        <label htmlFor={id('notes')} className="label">
          {t('familyReunion.form.notes')}
        </label>
        <textarea id={id('notes')} className="input min-h-16" maxLength={2000} value={f.notes} onChange={set('notes')} />
      </div>
      <div className="flex flex-wrap justify-end gap-2 sm:col-span-2">
        <button type="button" className="btn-ghost btn-sm" onClick={onCancel} disabled={busy}>
          {t('familyReunion.form.cancel')}
        </button>
        <button type="submit" className="btn-primary btn-sm" disabled={busy}>
          {busy && <Spinner className="size-3.5" />} {t('familyReunion.form.save')}
        </button>
      </div>
    </form>
  );
};

export const ReunionReadinessCard = ({ caseId, data, onChanged, className }: { caseId: string; data: FamilyOverview; onChanged: () => Promise<unknown>; className?: string }) => {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const r = data.readiness;
  if (!r) return null;
  const titleId = `reunion-ready-${caseId}`;
  return (
    <section className={clsx('rounded-xl border border-line bg-card p-3.5 sm:p-4', className)} aria-labelledby={titleId}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 id={titleId} className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">
            <ClipboardCheck className="size-4 text-brand-600" aria-hidden />
            {t('familyReunion.title')}
            <span className={clsx('badge', TONE_CLASS[READINESS_TONE[r.status]])}>{t(`familyReunion.status.${r.status}`)}</span>
          </h3>
          <p className="mt-1 text-xs text-muted">{t('familyReunion.subtitle')}</p>
        </div>
        {!editing && (
          <button type="button" className="btn-secondary btn-sm shrink-0" onClick={() => setEditing(true)}>
            <Pencil className="size-3.5" aria-hidden /> {t('familyReunion.form.edit')}
          </button>
        )}
      </div>
      <div className="mt-4">
        <ReunionTimeline r={r} />
      </div>
      {editing && (
        <InfoFields
          caseId={data.main.id}
          r={r}
          onCancel={() => setEditing(false)}
          onDone={async () => {
            setEditing(false);
            await onChanged();
          }}
        />
      )}
      <ul className="mt-3 divide-y divide-line border-t border-line">
        {r.checks.map((c) => (
          <CheckLine key={`${c.code}-${c.memberCaseId ?? 'main'}`} c={c} data={data} />
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-muted">{t('familyReunion.disclaimer', { asOf: r.asOf })}</p>
    </section>
  );
};

export default ReunionReadinessCard;
