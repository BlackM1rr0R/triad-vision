import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { FileDown, GraduationCap, Plus, Search, ShieldCheck, ShieldOff, Undo2, X } from 'lucide-react';
import { api, errorCode } from '@/lib/api';
import i18n, { registerCopy } from '@/i18n';
import { pagesPartnerSchools } from '@/i18n/pagesPartnerSchools';
import { TONE_CLASS } from '@/components/ui/status';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { SearchEmpty } from '@/components/illustrations';
import { day } from '@/components/agents/format';
import { accessOf, downloadFile, portalError, type PartnerMe, type PortalStep } from '@/components/partnerPortal/api';
import { ErrorRetry, Loading, Section, StatusPill, StepBar } from '@/components/partnerPortal/ui';
import type { CaseStatus } from '@/lib/types';

registerCopy(pagesPartnerSchools);

type RecordStatus = 'PENDING' | 'CONFIRMED' | 'REJECTED';
interface StudentRecord {
  id: string;
  kind: 'ATTENDANCE' | 'EXAM';
  courseName: string | null;
  periodFrom: string | null;
  periodTo: string | null;
  attendancePct: number | null;
  level: string | null;
  examDate: string | null;
  provider: string | null;
  passed: boolean | null;
  certificate: { name: string | null } | null;
  status: RecordStatus;
  reviewNote: string | null;
  createdAt: string;
}
interface Student {
  id: string;
  firstName: string;
  lastName: string;
  registeredAt: string;
  consent: boolean;
  germanLevel: string | null;
  stage: { status: CaseStatus; step: PortalStep; refused?: boolean; updatedAt: string } | null;
  records: StudentRecord[];
  pendingRecords: number;
}

const KEY = ['partner-portal', 'students'] as const;
const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
const PROVIDERS = ['GOETHE', 'TELC', 'OSD', 'TESTDAF', 'ECL', 'OTHER'] as const;
const STATUS_TONE: Record<RecordStatus, string> = { PENDING: TONE_CLASS.warning, CONFIRMED: TONE_CLASS.success, REJECTED: TONE_CLASS.danger };

const schoolError = (err: unknown) => {
  const code = errorCode(err);
  return i18n.exists(`partnerSchools.errors.${code}`) ? i18n.t(`partnerSchools.errors.${code}`) : portalError(err);
};

const todayIso = () => new Date().toISOString().slice(0, 10);

/** Attendance / exam result form of a language school (multipart: the certificate is optional). */
function RecordForm({ studentId, onDone }: { studentId: string; onDone: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [kind, setKind] = useState<'EXAM' | 'ATTENDANCE'>('EXAM');
  const [f, setF] = useState({ attendancePct: '', courseName: '', periodFrom: '', periodTo: '', level: 'B1', examDate: '', provider: 'GOETHE', passed: true, note: '' });
  const [file, setFile] = useState<File | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const save = useMutation({
    mutationFn: async () => {
      const fd = new FormData();
      fd.append('kind', kind);
      if (f.courseName.trim()) fd.append('courseName', f.courseName.trim());
      if (f.note.trim()) fd.append('note', f.note.trim());
      if (kind === 'ATTENDANCE') {
        fd.append('attendancePct', f.attendancePct);
        if (f.periodFrom) fd.append('periodFrom', f.periodFrom);
        if (f.periodTo) fd.append('periodTo', f.periodTo);
      } else {
        fd.append('level', f.level);
        fd.append('examDate', f.examDate);
        fd.append('provider', f.provider);
        fd.append('passed', String(f.passed));
        if (file) fd.append('certificate', file);
      }
      return (await api.post(`/partner/students/${studentId}/records`, fd)).data;
    },
    onSuccess: async () => {
      toast.success(t('partnerSchools.form.done'));
      await qc.invalidateQueries({ queryKey: KEY });
      onDone();
    },
    onError: (err) => toast.error(schoolError(err)),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };
  const id = (k: string) => `rec-${studentId}-${k}`;
  return (
    <form onSubmit={submit} className="mt-3 grid gap-3 rounded-xl border border-line bg-sunken p-3 sm:grid-cols-2">
      <fieldset className="sm:col-span-2">
        <legend className="label">{t('partnerSchools.form.kind')}</legend>
        <div className="flex flex-wrap gap-2">
          {(['EXAM', 'ATTENDANCE'] as const).map((k) => (
            <label key={k} className={clsx('flex min-h-11 cursor-pointer items-center rounded-xl border px-3 text-sm font-semibold has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-focus/40', kind === k ? 'border-primary bg-primary text-primary-contrast' : 'border-line bg-card text-ink')}>
              <input type="radio" className="sr-only" name={id('kind')} checked={kind === k} onChange={() => setKind(k)} />
              {t(`partnerSchools.kind.${k}`)}
            </label>
          ))}
        </div>
      </fieldset>
      {kind === 'ATTENDANCE' ? (
        <>
          <label className="block" htmlFor={id('pct')}>
            <span className="label">{t('partnerSchools.form.attendancePct')}</span>
            <input id={id('pct')} className="input" type="number" inputMode="numeric" min={0} max={100} required value={f.attendancePct} onChange={set('attendancePct')} />
          </label>
          <label className="block" htmlFor={id('course')}>
            <span className="label">{t('partnerSchools.form.courseName')}</span>
            <input id={id('course')} className="input" maxLength={160} value={f.courseName} onChange={set('courseName')} />
          </label>
          <label className="block" htmlFor={id('from')}>
            <span className="label">{t('partnerSchools.form.periodFrom')}</span>
            <input id={id('from')} className="input" type="date" value={f.periodFrom} onChange={set('periodFrom')} />
          </label>
          <label className="block" htmlFor={id('to')}>
            <span className="label">{t('partnerSchools.form.periodTo')}</span>
            <input id={id('to')} className="input" type="date" value={f.periodTo} onChange={set('periodTo')} />
          </label>
        </>
      ) : (
        <>
          <label className="block" htmlFor={id('level')}>
            <span className="label">{t('partnerSchools.form.level')}</span>
            <select id={id('level')} className="input" value={f.level} onChange={set('level')}>
              {LEVELS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="block" htmlFor={id('date')}>
            <span className="label">{t('partnerSchools.form.examDate')}</span>
            <input id={id('date')} className="input" type="date" required max={todayIso()} value={f.examDate} onChange={set('examDate')} />
          </label>
          <label className="block" htmlFor={id('provider')}>
            <span className="label">{t('partnerSchools.form.provider')}</span>
            <select id={id('provider')} className="input" value={f.provider} onChange={set('provider')}>
              {PROVIDERS.map((p) => (
                <option key={p} value={p}>
                  {t(`partnerSchools.providers.${p}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-h-11 items-center gap-3 self-end text-sm text-ink">
            <input type="checkbox" className="size-5" checked={f.passed} onChange={(e) => setF((x) => ({ ...x, passed: e.target.checked }))} />
            {t('partnerSchools.form.passed')}
          </label>
          <label className="block sm:col-span-2" htmlFor={id('file')}>
            <span className="label">{t('partnerSchools.form.certificate')}</span>
            <input id={id('file')} className="input" type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
        </>
      )}
      <label className="block sm:col-span-2" htmlFor={id('note')}>
        <span className="label">{t('partnerSchools.form.note')}</span>
        <textarea id={id('note')} className="input min-h-20" maxLength={1000} value={f.note} onChange={set('note')} />
      </label>
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <button type="submit" className="btn-primary btn-sm" disabled={save.isPending}>
          {save.isPending && <Spinner className="size-4" />} {t('partnerSchools.form.submit')}
        </button>
        <button type="button" className="btn-ghost btn-sm" onClick={onDone}>
          {t('partnerSchools.close')}
        </button>
      </div>
    </form>
  );
}

function RecordRow({ r }: { r: StudentRecord }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const withdraw = useMutation({
    mutationFn: async () => (await api.delete(`/partner/student-records/${r.id}`)).data,
    onSuccess: async () => {
      toast.success(t('partnerSchools.form.withdrawn'));
      await qc.invalidateQueries({ queryKey: KEY });
    },
    onError: (err) => toast.error(schoolError(err)),
  });
  const detail =
    r.kind === 'EXAM'
      ? [r.level, r.provider ? t(`partnerSchools.providers.${r.provider}`) : null, r.examDate ? day(r.examDate) : null, r.passed == null ? null : r.passed ? t('partnerSchools.passedYes') : t('partnerSchools.passedNo')]
      : [`${r.attendancePct ?? 0}%`, r.courseName, r.periodFrom || r.periodTo ? `${day(r.periodFrom)} – ${day(r.periodTo)}` : null];
  return (
    <li className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-card px-3 py-2 text-sm">
      <span className="font-semibold text-ink">{t(`partnerSchools.kind.${r.kind}`)}</span>
      <span className="text-muted">{detail.filter(Boolean).join(' · ')}</span>
      <span className={clsx('badge ml-auto', STATUS_TONE[r.status])}>{t(`partnerSchools.status.${r.status}`)}</span>
      {r.certificate && (
        <button type="button" className="btn-ghost btn-sm" onClick={() => downloadFile(`/partner/student-records/${r.id}/certificate`, r.certificate?.name ?? 'certificate').catch((e) => toast.error(schoolError(e)))}>
          <FileDown className="size-4" aria-hidden /> {t('partnerSchools.form.certificateLink')}
        </button>
      )}
      {r.status === 'PENDING' && (
        <button type="button" className="btn-ghost btn-sm" disabled={withdraw.isPending} onClick={() => withdraw.mutate()}>
          <Undo2 className="size-4" aria-hidden /> {t('partnerSchools.form.withdraw')}
        </button>
      )}
      {r.reviewNote && r.status !== 'PENDING' && <p className="w-full text-xs text-muted">{t('partnerSchools.reviewNote', { note: r.reviewNote })}</p>}
    </li>
  );
}

function StudentCard({ s, canRecord, showStage }: { s: Student; canRecord: boolean; showStage: boolean }) {
  const { t } = useTranslation();
  const [adding, setAdding] = useState(false);
  return (
    <li className="rounded-2xl border border-line bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold text-ink">
            {s.firstName} {s.lastName}
          </p>
          <p className="text-xs text-muted">{t('partnerSchools.registered', { date: day(s.registeredAt) })}</p>
        </div>
        {s.consent ? (
          <span className={clsx('badge inline-flex items-center gap-1', TONE_CLASS.success)}>
            <ShieldCheck className="size-3.5" aria-hidden /> {t('partnerSchools.consentGiven')}
          </span>
        ) : (
          <span className={clsx('badge inline-flex items-center gap-1', TONE_CLASS.neutral)} title={t('partnerSchools.consentPendingHint')}>
            <ShieldOff className="size-3.5" aria-hidden /> {t('partnerSchools.consentPending')}
          </span>
        )}
      </div>
      {s.consent ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
          {s.stage ? (
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <StatusPill status={s.stage.status} />
              <div className="min-w-40 flex-1">
                <StepBar step={s.stage.step} status={s.stage.status} />
              </div>
            </div>
          ) : (
            // Without the case-stage permission the server sends no stage at all: "no case" would be false.
            <p className="text-sm text-muted">{showStage ? t('partnerSchools.noCase') : t('partnerAccess.noStage')}</p>
          )}
          <p className="text-sm text-ink">
            <span className="text-muted">{t('partnerSchools.level')}: </span>
            <span className="font-semibold">{s.germanLevel && s.germanLevel !== 'none' ? s.germanLevel : t('partnerSchools.levelNone')}</span>
          </p>
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted">{t('partnerSchools.consentPendingHint')}</p>
      )}
      {s.consent && (canRecord || s.records.length > 0) && (
        <div className="mt-3 border-t border-line pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold tracking-wide text-muted uppercase">{t('partnerSchools.records')}</p>
            {canRecord && !adding && (
              <button type="button" className="btn-secondary btn-sm" onClick={() => setAdding(true)}>
                <Plus className="size-4" aria-hidden /> {t('partnerSchools.addRecord')}
              </button>
            )}
            {adding && (
              <button type="button" className="btn-ghost btn-sm" onClick={() => setAdding(false)} aria-label={t('partnerSchools.close')}>
                <X className="size-4" aria-hidden />
              </button>
            )}
          </div>
          {adding && <RecordForm studentId={s.id} onDone={() => setAdding(false)} />}
          {s.records.length ? (
            <ul className="mt-2 grid gap-2">
              {s.records.map((r) => (
                <RecordRow key={r.id} r={r} />
              ))}
            </ul>
          ) : (
            !adding && <p className="mt-2 text-sm text-muted">{t('partnerSchools.noRecords')}</p>
          )}
        </div>
      )}
    </li>
  );
}

/** /partner/students — colleges and language schools: referred students, stage with consent, records. */
export default function PartnerStudentsPage({ me }: { me: PartnerMe }) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  // Records are the school's own data: the client list (needed for this page) is enough, not the documents level
  // (server: lib/partnerAccess/permissions.ts → schoolRecordAccess).
  const canRecord = me.partner.category === 'LANGUAGE_SCHOOL';
  const showStage = accessOf(me).permissions.caseStage;
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: [...KEY, search.trim()],
    queryFn: async () => (await api.get<{ items: Student[] }>('/partner/students', { params: { search: search.trim() || undefined } })).data,
    placeholderData: keepPreviousData,
  });
  const items = data?.items ?? [];
  return (
    <Section title={t('partnerSchools.title')} icon={GraduationCap} actions={isFetching && !isLoading ? <Spinner className="size-4 text-link" /> : undefined}>
      <p className="text-sm text-muted">{t('partnerSchools.intro')}</p>
      {canRecord && <p className="mt-2 text-sm text-muted">{t('partnerSchools.introLanguage')}</p>}
      <p className="mt-2 text-sm text-muted">
        {t('partnerSchools.addHint')}{' '}
        <Link to="/partner/people" className="font-semibold text-link hover:underline">
          {t('partnerSchools.addLink')}
        </Link>
      </p>
      <label className="relative mt-4 block max-w-sm">
        <span className="sr-only">{t('partnerSchools.search')}</span>
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
        <input className="input pl-9" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('partnerSchools.search')} maxLength={120} />
      </label>
      <div className="mt-4">
        {isLoading ? (
          <Loading />
        ) : isError ? (
          <ErrorRetry onRetry={() => refetch()} />
        ) : items.length === 0 ? (
          <EmptyState illustration={<SearchEmpty className="w-32" />} title={search.trim() ? t('partnerSchools.notFound') : t('partnerSchools.empty')} />
        ) : (
          <ul className="grid gap-3">
            {items.map((s) => (
              <StudentCard key={s.id} s={s} canRecord={canRecord} showStage={showStage} />
            ))}
          </ul>
        )}
      </div>
    </Section>
  );
}
