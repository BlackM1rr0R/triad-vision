import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { Bot, Download, Eye, KeyRound, Package, UserCog } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { api } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesTimeCare } from '@/i18n/pagesTimeCare';

registerCopy(pagesTimeCare);

const KINDS = ['VIEW', 'DOWNLOAD', 'REVEAL', 'EMBASSY_PACKAGE', 'AI_CHECK', 'SUPPORT_VIEW'] as const;
type Kind = (typeof KINDS)[number];
const ICON: Record<Kind, LucideIcon> = { VIEW: Eye, DOWNLOAD: Download, REVEAL: KeyRound, EMBASSY_PACKAGE: Package, AI_CHECK: Bot, SUPPORT_VIEW: UserCog };

interface Item {
  id: string;
  at: string;
  kind: Kind;
  actor: { name: string; role: string | null };
  what: string | null;
  detail: string | null;
  reason: string | null;
  count: number;
}
interface AccessLog {
  total: number;
  counts: Record<Kind, number>;
  days: { day: string; items: Item[] }[];
}

/**
 * "Sənədlərimə kim baxıb?" — grouped by day, filter by kind and period. Used in the client's privacy centre
 * (endpoint /privacy/access-log) and on the admin case page for one client (/admin/access-log/:clientId).
 */
export function AccessLogSection({ endpoint, compact }: { endpoint: string; compact?: boolean }) {
  const { t, i18n } = useTranslation();
  const [kind, setKind] = useState<Kind | ''>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const q = useQuery({
    queryKey: ['access-log', endpoint, kind, from, to],
    queryFn: async () => (await api.get<AccessLog>(endpoint, { params: { ...(kind ? { kind } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}) } })).data,
    placeholderData: keepPreviousData,
  });
  const day = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(i18n.language, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
  const time = (s: string) => new Date(s).toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' });
  const describe = (it: Item) => {
    const parts: string[] = [];
    if (it.kind === 'REVEAL' && it.detail) parts.push(t(`accessLog.fields.${it.detail}`, { defaultValue: it.detail }));
    if (it.kind === 'AI_CHECK' && it.detail) parts.push(t(`accessLog.checks.${it.detail}`, { defaultValue: it.detail }));
    if (it.what) parts.push(it.what);
    if (it.kind === 'SUPPORT_VIEW' && it.detail) parts.push(t(`accessLog.supportReasons.${it.detail}`, { defaultValue: it.detail }));
    if ((it.kind === 'VIEW' || it.kind === 'DOWNLOAD') && it.detail === 'DRIVE') parts.push(t('accessLog.drive'));
    return parts.join(' · ');
  };

  return (
    <div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-wrap gap-1.5" role="group">
          {(['', ...KINDS] as const).map((k) => (
            <button
              key={k || 'all'}
              type="button"
              aria-pressed={kind === k}
              onClick={() => setKind(k)}
              className={clsx('min-h-9 rounded-full border px-3 text-xs font-semibold transition', kind === k ? 'border-navy-900 bg-navy-900 text-white' : 'border-line bg-card text-ink/75 hover:border-brand-400')}
            >
              {k ? t(`accessLog.kinds.${k}`) : t('accessLog.all')}
              {k && q.data && !kind ? <span className="ml-1 text-[10px] opacity-70">{q.data.counts[k]}</span> : null}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <label className="block">
            <span className="label">{t('accessLog.from')}</span>
            <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="block">
            <span className="label">{t('accessLog.to')}</span>
            <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
        </div>
      </div>
      {q.data && q.data.total === 0 && <p className="mt-4 text-sm text-muted">{t('accessLog.empty')}</p>}
      <div className={clsx('mt-4 space-y-4', compact && 'max-h-[28rem] overflow-y-auto pr-1')}>
        {q.data?.days.map((g) => (
          <section key={g.day}>
            <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-muted uppercase">{day(g.day)}</h3>
            <ul className="divide-y divide-line rounded-xl border border-line">
              {g.items.map((it) => {
                const Icon = ICON[it.kind];
                const what = describe(it);
                return (
                  <li key={it.id} className="flex gap-3 px-3 py-2.5">
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface text-brand-600">
                      <Icon className="size-4" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-ink">
                        <strong>{it.actor.name}</strong>
                        {it.actor.role && <span className="text-muted">, {t(`accessLog.roles.${it.actor.role}`, { defaultValue: it.actor.role })}</span>}
                        <span className="text-muted"> — {t(`accessLog.kinds.${it.kind}`)}</span>
                      </p>
                      {what && <p className="truncate text-xs text-muted">{what}</p>}
                      {it.reason && (
                        <p className="mt-0.5 text-xs break-words">
                          <span className="font-semibold">{t('accessLog.reason')}:</span> {it.reason}
                        </p>
                      )}
                    </div>
                    <div className="shrink-0 text-right text-xs text-muted tabular-nums">
                      {time(it.at)}
                      {it.count > 1 && <span className="block">{t('accessLog.times', { count: it.count })}</span>}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

export default AccessLogSection;
