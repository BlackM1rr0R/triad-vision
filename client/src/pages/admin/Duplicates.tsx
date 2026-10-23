import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { AlertTriangle, ArrowLeft, Check, Copy, GitMerge, Info, RefreshCw, RotateCcw, Search, ShieldCheck, X } from 'lucide-react';
import { api, errorCode } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesDuplicates } from '@/i18n/pagesDuplicates';
import { useAuth } from '@/lib/auth';
import { hasMinRole } from '@/lib/types';
import { usePageTitle } from '@/lib/usePageTitle';
import { Spinner } from '@/components/ui/Spinner';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Chip, EmptyState, ErrorBlock, LoadingBlock, PageHead, Panel } from '@/components/admin/ui';
import { fmtDate, fmtDateTime, statusLabel, toastError } from '@/components/admin/labels';
import { duplicatesKey, useUserDuplicates } from '@/components/duplicates/DuplicateBadge';
import type { CaseStatus } from '@/lib/types';

registerCopy(pagesDuplicates);

type PairStatus = 'OPEN' | 'NOT_DUPLICATE' | 'MERGED';
const STATUSES: PairStatus[] = ['OPEN', 'NOT_DUPLICATE', 'MERGED'];

interface Reason {
  rule: string;
  strength: 'strong' | 'medium';
  value?: string;
}
interface Brief {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  birthDate: string | null;
  passportNumber: string | null;
  city: string | null;
  isActive: boolean;
  createdAt: string;
  mergedIntoId: string | null;
  _count: { cases: number };
}
interface Pair {
  id: string;
  userAId: string;
  userBId: string;
  score: number;
  reasons: Reason[];
  status: PairStatus;
  detectedAt: string;
  decidedAt: string | null;
  userA: Brief;
  userB: Brief;
}
interface ListResponse {
  items: Pair[];
  total: number;
  counts: Partial<Record<PairStatus, number>>;
  canMerge: boolean;
  settings: { mergeMinRole: 'ADMIN' | 'SUPER_ADMIN' };
}
interface Summary {
  profile: Record<string, unknown> & { id: string; email: string; firstName: string; lastName: string; emailVerifiedAt: string | null; createdAt: string; isActive: boolean };
  cases: { id: string; number: string; status: CaseStatus; visaType: string; createdAt: string; family: boolean; documents: number; active: boolean }[];
  counts: Record<'cases' | 'activeCases' | 'documents' | 'messages' | 'applications' | 'bookings', number>;
  lastLoginAt: string | null;
}
interface CompareResponse {
  a: Summary;
  b: Summary;
  suggestedPrimaryId: string;
  conflicts: string[];
  fields: string[];
  activeCaseClashes: { visaType: string; cases: { id: string; number: string }[] }[];
  blocker: string | null;
  canMerge: boolean;
}
type Side = 'a' | 'b';

const DATE_FIELDS = new Set(['birthDate', 'passportExpiry']);
const isEmpty = (v: unknown) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
const fullName = (u: { firstName: unknown; lastName: unknown }) => `${String(u.firstName ?? '')} ${String(u.lastName ?? '')}`.trim();

const useFmt = () => {
  const { t } = useTranslation();
  return (field: string, v: unknown) => {
    if (isEmpty(v)) return t('duplicates.cmp.empty');
    if (typeof v === 'boolean') return v ? t('duplicates.cmp.yes') : t('duplicates.cmp.no');
    if (DATE_FIELDS.has(field)) return fmtDate(String(v));
    return String(v);
  };
};

const useDupError = () => {
  const { t, i18n } = useTranslation();
  return (err: unknown) => {
    const code = errorCode(err);
    if (code && i18n.exists(`duplicates.blocker.${code}`)) toast.error(t(`duplicates.blocker.${code}`));
    else if (code && i18n.exists(`duplicates.errors.${code}`)) toast.error(t(`duplicates.errors.${code}`));
    else toastError(err);
  };
};

// ─── List ──────────────────────────────────────────────────────────────

const ScoreBadge = ({ score }: { score: number }) => (
  <span
    className={clsx(
      'inline-flex min-h-6 items-center rounded-full px-2.5 text-xs font-bold tabular-nums',
      score >= 90 ? 'bg-red-50 text-red-700' : score >= 70 ? 'bg-amber-50 text-amber-800' : 'bg-surface text-ink/75',
    )}
  >
    {score}
  </span>
);

const ReasonChips = ({ reasons }: { reasons: Reason[] }) => {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap gap-1.5">
      {reasons.map((r) => (
        <span
          key={r.rule}
          title={r.value ? `${t(`duplicates.strength.${r.strength}`)} · ${r.value}` : t(`duplicates.strength.${r.strength}`)}
          className={clsx(
            'inline-flex min-h-6 items-center gap-1 rounded-full border px-2 text-[11px] font-semibold',
            r.strength === 'strong' ? 'border-red-200 bg-red-50 text-red-700' : 'border-amber-200 bg-amber-50 text-amber-800',
          )}
        >
          {t(`duplicates.rules.${r.rule}`, { defaultValue: r.rule })}
        </span>
      ))}
    </div>
  );
};

const BriefCard = ({ u, label }: { u: Brief; label: string }) => {
  const { t } = useTranslation();
  return (
    <div className="min-w-0 rounded-lg border border-line bg-surface/50 p-3 text-xs">
      <p className="text-[10px] font-bold tracking-wider text-muted uppercase">{label}</p>
      <p className="mt-0.5 truncate text-sm font-semibold text-navy-900">
        {fullName(u)} {!u.isActive && <span className="ml-1 text-[11px] font-medium text-muted">· {t('duplicates.inactive')}</span>}
      </p>
      <p className="truncate text-ink/80">{u.email}</p>
      <p className="text-muted">
        {[u.phone, u.passportNumber, u.birthDate ? fmtDate(u.birthDate) : null, u.city].filter(Boolean).join(' · ') || '—'}
      </p>
      <p className="mt-1 text-muted">{t('duplicates.cases', { count: u._count.cases })}</p>
    </div>
  );
};

const PairRow = ({ p, onCompare }: { p: Pair; onCompare: () => void }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const onError = useDupError();
  const decide = useMutation({
    mutationFn: async (action: 'not-duplicate' | 'reopen') => api.post(`/admin/duplicates/${p.id}/${action}`),
    onSuccess: (_r, action) => {
      toast.success(action === 'reopen' ? t('duplicates.reopened') : t('duplicates.dismissed'));
      void qc.invalidateQueries({ queryKey: duplicatesKey });
    },
    onError,
  });
  return (
    <li className="rounded-xl border border-line bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <ScoreBadge score={p.score} />
        <ReasonChips reasons={p.reasons} />
        <span className="ml-auto text-[11px] text-muted">{fmtDateTime(p.decidedAt ?? p.detectedAt)}</span>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <BriefCard u={p.userA} label="A" />
        <BriefCard u={p.userB} label="B" />
      </div>
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        {p.status === 'OPEN' && (
          <button type="button" className="btn-secondary btn-sm" disabled={decide.isPending} onClick={() => decide.mutate('not-duplicate')}>
            <X className="size-3.5" aria-hidden /> {t('duplicates.notDuplicate')}
          </button>
        )}
        {p.status === 'NOT_DUPLICATE' && (
          <button type="button" className="btn-secondary btn-sm" disabled={decide.isPending} onClick={() => decide.mutate('reopen')}>
            <RotateCcw className="size-3.5" aria-hidden /> {t('duplicates.reopen')}
          </button>
        )}
        {p.status !== 'MERGED' && (
          <button type="button" className="btn-primary btn-sm" onClick={onCompare}>
            <GitMerge className="size-3.5" aria-hidden /> {t('duplicates.compare')}
          </button>
        )}
      </div>
    </li>
  );
};

// ─── Compare + merge ───────────────────────────────────────────────────

const ConfirmMerge = ({ open, onClose, onConfirm, pending, primary, secondary }: { open: boolean; onClose: () => void; onConfirm: () => void; pending: boolean; primary: string; secondary: string }) => {
  const { t } = useTranslation();
  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      onConfirm={onConfirm}
      loading={pending}
      title={t('duplicates.confirm.title')}
      message={
        <>
          <p>{t('duplicates.confirm.intro', { primary, secondary })}</p>
          <p className="mt-2 text-xs text-muted">{t('duplicates.options.noUndo')}</p>
        </>
      }
      confirmText="MERGE"
      cancelLabel={t('duplicates.confirm.cancel')}
      confirmLabel={
        <>
          <GitMerge className="size-3.5" aria-hidden /> {t('duplicates.confirm.submit')}
        </>
      }
    />
  );
};

const AccountHeader = ({ s, side, primary, suggested, onPrimary }: { s: Summary; side: Side; primary: boolean; suggested: boolean; onPrimary: () => void }) => {
  const { t } = useTranslation();
  return (
    <div className={clsx('min-w-0 rounded-xl border p-4', primary ? 'border-brand-500 bg-brand-50' : 'border-line bg-white')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-bold tracking-wider text-muted uppercase">{t('duplicates.cmp.account', { side: side.toUpperCase() })}</p>
        {suggested && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">{t('duplicates.cmp.suggested')}</span>}
      </div>
      <p className="mt-1 truncate text-base font-bold text-navy-900">{fullName(s.profile)}</p>
      <p className="truncate text-xs text-ink/80">{s.profile.email}</p>
      <label className="mt-3 inline-flex min-h-10 cursor-pointer items-center gap-2 text-sm font-semibold text-navy-900">
        <input type="radio" name="primary" checked={primary} onChange={onPrimary} className="size-4 accent-brand-600" />
        {primary ? t('duplicates.cmp.primary') : t('duplicates.cmp.makePrimary')}
      </label>
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 border-t border-line pt-3 text-xs">
        {(Object.keys(s.counts) as (keyof Summary['counts'])[]).map((k) => (
          <div key={k} className="contents">
            <dt className="text-muted">{t(`duplicates.cmp.counts.${k}`)}</dt>
            <dd className="text-right font-semibold text-ink tabular-nums">{s.counts[k]}</dd>
          </div>
        ))}
        <dt className="text-muted">{t('duplicates.cmp.lastLogin')}</dt>
        <dd className="text-right text-ink">{s.lastLoginAt ? fmtDateTime(s.lastLoginAt) : t('duplicates.cmp.never')}</dd>
        <dt className="text-muted">{t('duplicates.cmp.createdAt')}</dt>
        <dd className="text-right text-ink">{fmtDate(s.profile.createdAt)}</dd>
        <dt className="text-muted">{t('duplicates.cmp.verified')}</dt>
        <dd className="text-right text-ink">{s.profile.emailVerifiedAt ? t('duplicates.cmp.yes') : t('duplicates.cmp.no')}</dd>
      </dl>
      <div className="mt-3 border-t border-line pt-3">
        <p className="text-[11px] font-bold tracking-wider text-muted uppercase">{t('duplicates.cmp.casesTitle')}</p>
        {s.cases.length === 0 ? (
          <p className="mt-1 text-xs text-muted">{t('duplicates.cmp.noCases')}</p>
        ) : (
          <ul className="mt-1 space-y-1 text-xs">
            {s.cases.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-x-2">
                <Link to={`/admin/cases/${c.id}`} className="font-semibold text-brand-700 hover:underline">
                  {c.number}
                </Link>
                <span className="text-ink/80">{t(`duplicates.visaTypes.${c.visaType}`, { defaultValue: c.visaType })}</span>
                <span className={clsx(c.active ? 'text-emerald-700' : 'text-muted')}>{statusLabel(c.status)}</span>
                <span className="text-muted">{t('duplicates.cmp.docs', { count: c.documents })}</span>
                {c.family && <span className="text-muted">· {t('duplicates.cmp.family')}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

const defaultChoices = (cmp: CompareResponse, primary: Side) => {
  const other: Side = primary === 'a' ? 'b' : 'a';
  return Object.fromEntries(cmp.fields.map((f) => [f, isEmpty(cmp[primary].profile[f]) && !isEmpty(cmp[other].profile[f]) ? other : primary])) as Record<string, Side>;
};

const ComparePanel = ({ aId, bId, onDone, onBack }: { aId: string; bId: string; onDone: () => void; onBack: () => void }) => {
  const { t } = useTranslation();
  const fmt = useFmt();
  const qc = useQueryClient();
  const onError = useDupError();
  const q = useQuery({
    queryKey: [...duplicatesKey, 'compare', aId, bId],
    queryFn: async () => (await api.get<CompareResponse>('/admin/duplicates/compare', { params: { a: aId, b: bId } })).data,
  });
  const cmp = q.data;
  const [primary, setPrimary] = useState<Side>('a');
  const [choices, setChoices] = useState<Record<string, Side>>({});
  const [twoActive, setTwoActive] = useState(false);
  const [driveMerge, setDriveMerge] = useState(true);
  const [inform, setInform] = useState(false);
  const [message, setMessage] = useState('');
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!cmp) return;
    const p: Side = cmp.suggestedPrimaryId === cmp.b.profile.id ? 'b' : 'a';
    setPrimary(p);
    setChoices(defaultChoices(cmp, p));
    setDriveMerge(cmp.activeCaseClashes.length === 0);
  }, [cmp]);

  const primaryUser = cmp ? cmp[primary] : null;
  const secondaryUser = cmp ? cmp[primary === 'a' ? 'b' : 'a'] : null;
  const notice = useQuery({
    queryKey: [...duplicatesKey, 'notice', primaryUser?.profile.id],
    queryFn: async () => (await api.get<{ body: string }>('/admin/duplicates/notice-template', { params: { userId: primaryUser!.profile.id } })).data,
    enabled: inform && !!primaryUser,
  });
  useEffect(() => {
    if (notice.data && !message) setMessage(notice.data.body);
  }, [notice.data, message]);

  const merge = useMutation({
    mutationFn: async () => {
      const fields = Object.fromEntries(Object.entries(choices).map(([f, side]) => [f, side === primary ? 'primary' : 'secondary']));
      return (
        await api.post('/admin/duplicates/merge', {
          primaryId: primaryUser!.profile.id,
          secondaryId: secondaryUser!.profile.id,
          fields,
          confirm: 'MERGE',
          allowTwoActiveCases: twoActive,
          driveFolders: driveMerge ? 'MERGE' : 'KEEP',
          informClient: inform,
          clientMessage: inform ? message.trim() || null : null,
        })
      ).data;
    },
    onSuccess: () => {
      toast.success(t('duplicates.merged'));
      setConfirming(false);
      void qc.invalidateQueries({ queryKey: duplicatesKey });
      void qc.invalidateQueries({ queryKey: ['admin-users'] });
      onDone();
    },
    onError: (err) => {
      setConfirming(false);
      onError(err);
    },
  });

  if (q.isLoading) return <LoadingBlock />;
  if (q.error || !cmp || !primaryUser || !secondaryUser) return <ErrorBlock error={q.error} onRetry={() => q.refetch()} />;

  const clash = cmp.activeCaseClashes.length > 0;
  const canSubmit = cmp.canMerge && !cmp.blocker && (!clash || twoActive);
  const pickPrimary = (s: Side) => {
    setPrimary(s);
    setChoices(defaultChoices(cmp, s));
  };

  return (
    <div className="space-y-5">
      <button type="button" onClick={onBack} className="-my-2 inline-flex min-h-10 items-center gap-1.5 text-xs font-semibold text-muted transition hover:text-navy-900">
        <ArrowLeft className="size-3.5" aria-hidden /> {t('duplicates.back')}
      </button>

      {cmp.blocker && (
        <p className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> {t(`duplicates.blocker.${cmp.blocker}`, { defaultValue: t('duplicates.blocker.NOT_MERGEABLE') })}
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {(['a', 'b'] as Side[]).map((s) => (
          <AccountHeader key={s} s={cmp[s]} side={s} primary={primary === s} suggested={cmp.suggestedPrimaryId === cmp[s].profile.id} onPrimary={() => pickPrimary(s)} />
        ))}
      </div>

      <Panel title={t('duplicates.cmp.field')} icon={Copy} bodyClassName="p-0 sm:p-0">
        <ul className="divide-y divide-line">
          {cmp.fields.map((f) => {
            const va = cmp.a.profile[f];
            const vb = cmp.b.profile[f];
            const conflict = cmp.conflicts.includes(f);
            const both = isEmpty(va) && isEmpty(vb);
            if (both) return null;
            return (
              <li key={f} className="px-4 py-3 sm:px-6">
                <p className="mb-1.5 flex items-center gap-2 text-xs font-semibold text-navy-900">
                  {t(`duplicates.fields.${f}`, { defaultValue: f })}
                  {conflict && <span className="rounded-full bg-amber-50 px-1.5 text-[10px] font-semibold text-amber-800">{t('duplicates.cmp.conflict')}</span>}
                </p>
                <div className="grid grid-cols-2 gap-2" role={conflict ? 'radiogroup' : undefined} aria-label={t(`duplicates.fields.${f}`)}>
                  {(['a', 'b'] as Side[]).map((s) => {
                    const v = s === 'a' ? va : vb;
                    const chosen = choices[f] === s;
                    return conflict ? (
                      <label
                        key={s}
                        className={clsx(
                          'flex min-h-10 min-w-0 cursor-pointer items-start gap-2 rounded-lg border px-2.5 py-2 text-xs break-words transition',
                          chosen ? 'border-brand-500 bg-brand-50 text-navy-900' : 'border-line text-ink/80 hover:border-brand-300',
                        )}
                      >
                        <input type="radio" name={`f-${f}`} checked={chosen} onChange={() => setChoices((c) => ({ ...c, [f]: s }))} className="mt-0.5 size-3.5 shrink-0 accent-brand-600" />
                        <span className="min-w-0 break-all sm:break-words">
                          <span className="mr-1 font-bold text-muted">{s.toUpperCase()}</span>
                          {fmt(f, v)}
                        </span>
                      </label>
                    ) : (
                      <div key={s} className={clsx('flex min-h-10 min-w-0 items-start gap-1.5 rounded-lg border px-2.5 py-2 text-xs break-all', chosen ? 'border-line bg-surface text-navy-900' : 'border-transparent text-muted')}>
                        {chosen && <Check className="mt-0.5 size-3.5 shrink-0 text-brand-600" aria-label={t('duplicates.cmp.keep')} />}
                        <span>
                          <span className="mr-1 font-bold text-muted">{s.toUpperCase()}</span>
                          {fmt(f, v)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ul>
        <p className="flex items-start gap-2 border-t border-line px-4 py-3 text-xs text-muted sm:px-6">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {t('duplicates.cmp.consentNote')}
        </p>
      </Panel>

      {clash && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="size-4" aria-hidden /> {t('duplicates.clash.title')}
          </p>
          <p className="mt-1 text-xs">
            {t('duplicates.clash.text')} {cmp.activeCaseClashes.map((c) => `${t(`duplicates.visaTypes.${c.visaType}`, { defaultValue: c.visaType })}: ${c.cases.map((x) => x.number).join(', ')}`).join(' · ')}
          </p>
          <label className="mt-2 inline-flex min-h-10 cursor-pointer items-center gap-2 text-sm font-semibold">
            <input type="checkbox" checked={twoActive} onChange={(e) => setTwoActive(e.target.checked)} className="size-4 accent-brand-600" /> {t('duplicates.clash.confirm')}
          </label>
        </div>
      )}

      <Panel>
        <div className="space-y-3 text-sm">
          <label className="flex cursor-pointer items-start gap-2">
            <input type="checkbox" checked={driveMerge} onChange={(e) => setDriveMerge(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-brand-600" />
            <span>
              {t('duplicates.options.driveMerge')}
              <span className="block text-xs text-muted">{t('duplicates.options.driveKeep')}</span>
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-2">
            <input type="checkbox" checked={inform} onChange={(e) => setInform(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-brand-600" />
            <span>{t('duplicates.options.inform')}</span>
          </label>
          {inform && (
            <div>
              <label className="label" htmlFor="dup-msg">
                {t('duplicates.options.message')}
              </label>
              <textarea id="dup-msg" className="input min-h-28" maxLength={4000} value={message} onChange={(e) => setMessage(e.target.value)} />
            </div>
          )}
          <p className="flex items-start gap-2 rounded-lg bg-surface p-3 text-xs text-muted">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {t('duplicates.options.noUndo')}
          </p>
          {!cmp.canMerge && <p className="text-xs font-semibold text-danger">{t('duplicates.noPermission')}</p>}
          <div className="flex justify-end">
            <button type="button" className="btn-danger btn-sm" disabled={!canSubmit || merge.isPending} onClick={() => setConfirming(true)}>
              <GitMerge className="size-3.5" aria-hidden /> {t('duplicates.merge')}
            </button>
          </div>
        </div>
      </Panel>

      <ConfirmMerge
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => merge.mutate()}
        pending={merge.isPending}
        primary={`${fullName(primaryUser.profile)} (${primaryUser.profile.email})`}
        secondary={`${fullName(secondaryUser.profile)} (${secondaryUser.profile.email})`}
      />
    </div>
  );
};

// ─── Page ──────────────────────────────────────────────────────────────

export default function Duplicates() {
  const { t } = useTranslation();
  usePageTitle(t('duplicates.title'));
  const { user } = useAuth();
  const isSuper = hasMinRole(user?.role, 'SUPER_ADMIN');
  const qc = useQueryClient();
  const onError = useDupError();
  const [params, setParams] = useSearchParams();
  const status = (STATUSES as string[]).includes(params.get('status') ?? '') ? (params.get('status') as PairStatus) : 'OPEN';
  const userParam = params.get('user');
  const a = params.get('a');
  const b = params.get('b');
  const [search, setSearch] = useState(params.get('q') ?? '');
  const [debounced, setDebounced] = useState(search);
  useEffect(() => {
    const h = window.setTimeout(() => setDebounced(search.trim()), 300);
    return () => window.clearTimeout(h);
  }, [search]);

  const setParam = (next: Record<string, string | null>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    setParams(p, { replace: true });
  };

  // Old links of a merged client resolve to the primary account.
  const resolved = useUserDuplicates(userParam);
  const [mergedNotice, setMergedNotice] = useState(false);
  useEffect(() => {
    if (resolved.data?.merged && resolved.data.resolvedId !== userParam) {
      setMergedNotice(true);
      setParam({ user: resolved.data.resolvedId });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolved.data]);

  const list = useQuery({
    queryKey: [...duplicatesKey, 'list', status, debounced, userParam],
    queryFn: async () => (await api.get<ListResponse>('/admin/duplicates', { params: { status, search: debounced || undefined, userId: userParam || undefined } })).data,
    placeholderData: keepPreviousData,
    enabled: !a || !b,
  });

  const scan = useMutation({
    mutationFn: async () => (await api.post<{ found: number; created: number }>('/admin/duplicates/scan')).data,
    onSuccess: (r) => {
      toast.success(t('duplicates.scanned', r));
      void qc.invalidateQueries({ queryKey: duplicatesKey });
    },
    onError,
  });
  const saveSettings = useMutation({
    mutationFn: async (mergeMinRole: 'ADMIN' | 'SUPER_ADMIN') => api.put('/admin/duplicates/settings', { mergeMinRole }),
    onSuccess: () => {
      toast.success(t('duplicates.settings.saved'));
      void qc.invalidateQueries({ queryKey: duplicatesKey });
    },
    onError,
  });

  const counts = list.data?.counts ?? {};
  const items = useMemo(() => list.data?.items ?? [], [list.data]);

  if (a && b) {
    return (
      <div>
        <PageHead title={t('duplicates.title')} subtitle={t('duplicates.subtitle')} />
        <ComparePanel aId={a} bId={b} onBack={() => setParam({ a: null, b: null })} onDone={() => setParam({ a: null, b: null, status: 'MERGED' })} />
      </div>
    );
  }

  return (
    <div>
      <PageHead
        title={t('duplicates.title')}
        subtitle={t('duplicates.subtitle')}
        actions={
          <>
            {isSuper && list.data && (
              <label className="flex items-center gap-2 text-xs text-muted">
                {t('duplicates.settings.label')}
                <select
                  className="input min-h-10 w-auto py-1.5 text-xs"
                  value={list.data.settings.mergeMinRole}
                  onChange={(e) => saveSettings.mutate(e.target.value as 'ADMIN' | 'SUPER_ADMIN')}
                  disabled={saveSettings.isPending}
                >
                  <option value="SUPER_ADMIN">{t('duplicates.settings.SUPER_ADMIN')}</option>
                  <option value="ADMIN">{t('duplicates.settings.ADMIN')}</option>
                </select>
              </label>
            )}
            <button type="button" className="btn-secondary btn-sm" onClick={() => scan.mutate()} disabled={scan.isPending}>
              {scan.isPending ? <Spinner className="size-3.5" /> : <RefreshCw className="size-3.5" aria-hidden />} {t('duplicates.scan')}
            </button>
          </>
        }
      />

      {mergedNotice && (
        <p className="mb-4 flex items-start gap-2 rounded-lg border border-brand-200 bg-brand-50 p-3 text-sm text-navy-900">
          <Info className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden /> {t('duplicates.mergedInto')}
        </p>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1">
          {STATUSES.map((s) => (
            <Chip key={s} active={status === s} onClick={() => setParam({ status: s === 'OPEN' ? null : s })} count={counts[s] ?? 0}>
              {t(`duplicates.status.${s}`)}
            </Chip>
          ))}
        </div>
        <label className="relative ml-auto w-full sm:w-72">
          <span className="sr-only">{t('duplicates.search')}</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input className="input pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('duplicates.search')} />
        </label>
      </div>

      {userParam && (
        <p className="mb-4 flex flex-wrap items-center gap-2 text-xs text-muted">
          {t('duplicates.filteredBy')}
          <button type="button" className="font-semibold text-brand-700 hover:underline" onClick={() => setParam({ user: null })}>
            {t('duplicates.clearFilter')}
          </button>
        </p>
      )}

      {list.isLoading ? (
        <LoadingBlock />
      ) : list.error ? (
        <ErrorBlock error={list.error} onRetry={() => list.refetch()} />
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-line bg-white">
          <EmptyState icon={Copy} title={t('duplicates.empty')}>
            {t('duplicates.emptyHint')}
          </EmptyState>
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((p) => (
            <PairRow key={p.id} p={p} onCompare={() => setParam({ a: p.userAId, b: p.userBId })} />
          ))}
        </ul>
      )}
    </div>
  );
}
