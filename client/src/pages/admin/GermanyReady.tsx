import { useEffect, useId, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, ExternalLink, RotateCcw, Save, Search, ShieldOff } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useL10n } from '@/lib/l10n';
import { usePageTitle } from '@/lib/usePageTitle';
import { registerCopy } from '@/i18n';
import { pagesGermanyReady } from '@/i18n/pagesGermanyReady';
import { PageHeader } from '@/components/ui/PageHeader';
import { Spinner } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/Button';

registerCopy(pagesGermanyReady);

interface ChallengeState {
  challenges: { key: string; goal: number; activityIds: string[]; item: string | null }[];
  order: string[];
  upcoming: { week: string; key: string }[];
}

interface StaffCert {
  id: string;
  userId: string;
  number: string;
  level: string;
  points: number;
  activities: number;
  issuedAt: string;
  levelAt: string;
  revokedAt: string | null;
  revokeReason: string | null;
  verifyUrl: string;
}

const KEY = ['admin-ready-challenges'] as const;

const ChallengeOrder = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const canEdit = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';
  const qc = useQueryClient();
  const q = useQuery({ queryKey: KEY, queryFn: async () => (await api.get<ChallengeState>('/admin/ready/challenges')).data });
  const [order, setOrder] = useState<string[]>([]);
  useEffect(() => {
    if (q.data) setOrder(q.data.order);
  }, [q.data]);
  const save = useMutation({
    mutationFn: async () => (await api.put<ChallengeState>('/admin/ready/challenges', { order })).data,
    onSuccess: (d) => {
      qc.setQueryData(KEY, d);
      toast.success(t('readyAdmin.saved'));
    },
    onError: () => toast.error(t('futureLetter.errors.generic')),
  });
  const move = (i: number, d: -1 | 1) =>
    setOrder((o) => {
      const n = [...o];
      const j = i + d;
      if (j < 0 || j >= n.length) return o;
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });
  if (!q.data) return <Spinner className="size-5" />;
  const dirty = order.join() !== q.data.order.join();
  return (
    <section className="card p-5" aria-labelledby="ready-order-h">
      <h2 id="ready-order-h" className="type-section-title text-ink">
        {t('readyAdmin.challenges')}
      </h2>
      <p className="mt-1 text-sm text-muted">{t('readyAdmin.challengesHint')}</p>
      <ol className="mt-4 space-y-2">
        {order.map((k, i) => (
          <li key={k} className="flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm">
            <span className="w-6 text-right text-muted tabular-nums">{i + 1}.</span>
            <span className="min-w-0 flex-1 text-ink">{t(`gready.challenge.k.${k}`)}</span>
            {canEdit && (
              <>
                <button type="button" className="grid size-11 place-items-center rounded-lg hover:bg-sunken disabled:opacity-40" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`${t('readyAdmin.up')}: ${k}`}>
                  <ArrowUp className="size-4" aria-hidden />
                </button>
                <button type="button" className="grid size-11 place-items-center rounded-lg hover:bg-sunken disabled:opacity-40" disabled={i === order.length - 1} onClick={() => move(i, 1)} aria-label={`${t('readyAdmin.down')}: ${k}`}>
                  <ArrowDown className="size-4" aria-hidden />
                </button>
              </>
            )}
          </li>
        ))}
      </ol>
      {canEdit && (
        <Button className="mt-4" icon={Save} loading={save.isPending} disabled={!dirty} onClick={() => save.mutate()}>
          {t('readyAdmin.save')}
        </Button>
      )}
      <h3 className="mt-6 text-sm font-semibold text-ink">{t('readyAdmin.upcoming')}</h3>
      <ul className="mt-2 space-y-1 text-sm">
        {q.data.upcoming.map((u) => (
          <li key={u.week} className="flex gap-3">
            <span className="w-20 shrink-0 text-muted tabular-nums">{u.week}</span>
            <span className="text-ink">{t(`gready.challenge.k.${u.key}`)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
};

const CertificateLookup = () => {
  const { t } = useTranslation();
  const { dateTime } = useL10n();
  const id = useId();
  const [number, setNumber] = useState('');
  const [cert, setCert] = useState<StaffCert | null | undefined>(undefined);
  const [reason, setReason] = useState('');
  const find = useMutation({
    mutationFn: async () => (await api.get<{ certificate: StaffCert | null }>('/admin/ready/certificates', { params: { number: number.trim() } })).data.certificate,
    onSuccess: (c) => setCert(c),
    onError: () => setCert(null),
  });
  const act = useMutation({
    mutationFn: async (kind: 'revoke' | 'restore') => (await api.post<{ certificate: StaffCert }>(`/admin/ready/certificates/${cert!.id}/${kind}`, kind === 'revoke' ? { reason: reason || undefined } : {})).data.certificate,
    onSuccess: (c) => setCert(c),
    onError: () => toast.error(t('futureLetter.errors.generic')),
  });
  return (
    <section className="card p-5" aria-labelledby="ready-lookup-h">
      <h2 id="ready-lookup-h" className="type-section-title text-ink">
        {t('readyAdmin.lookup')}
      </h2>
      <form
        className="mt-3 flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (number.trim()) find.mutate();
        }}
      >
        <div>
          <label htmlFor={`${id}-n`} className="label">
            {t('readyAdmin.number')}
          </label>
          <input id={`${id}-n`} className="input min-h-11" value={number} onChange={(e) => setNumber(e.target.value)} placeholder="GR-2026-XXXXXX" />
        </div>
        <Button type="submit" variant="secondary" icon={Search} loading={find.isPending}>
          {t('readyAdmin.find')}
        </Button>
      </form>
      {cert === null && <p className="mt-3 text-sm text-muted">{t('readyAdmin.notFound')}</p>}
      {cert && (
        <div className="mt-4 space-y-3 rounded-2xl border border-line p-4 text-sm">
          <p className="font-semibold text-ink">
            {cert.number} · {t(`gready.level.${cert.level}`)} · {cert.points} · {cert.activities}
          </p>
          <a href={cert.verifyUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-link hover:underline">
            {t('readyAdmin.open')} <ExternalLink className="size-3.5" aria-hidden />
          </a>
          {cert.revokedAt ? (
            <>
              <p className="text-danger-fg">
                {t('readyAdmin.revokedAt', { date: dateTime(cert.revokedAt) })}
                {cert.revokeReason ? ` — ${cert.revokeReason}` : ''}
              </p>
              <Button variant="secondary" icon={RotateCcw} loading={act.isPending} onClick={() => act.mutate('restore')}>
                {t('readyAdmin.restore')}
              </Button>
            </>
          ) : (
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label htmlFor={`${id}-r`} className="label">
                  {t('readyAdmin.reason')}
                </label>
                <input id={`${id}-r`} className="input min-h-11" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
              </div>
              <Button variant="danger" icon={ShieldOff} loading={act.isPending} onClick={() => act.mutate('revoke')}>
                {t('readyAdmin.revoke')}
              </Button>
            </div>
          )}
        </div>
      )}
    </section>
  );
};

/** /admin/germany-ready — weekly challenge pool order (ADMIN+ edit) and practice certificate lookup / revoke (STAFF+). */
export default function AdminGermanyReady() {
  const { t } = useTranslation();
  usePageTitle(t('readyAdmin.title'));
  return (
    <div className="space-y-6">
      <PageHeader title={t('readyAdmin.title')} subtitle={t('gready.selfReported')} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 [&>*]:min-w-0">
        <ChallengeOrder />
        <CertificateLookup />
      </div>
    </div>
  );
}
