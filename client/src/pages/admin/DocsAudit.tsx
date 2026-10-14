import { Link, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { ArrowLeft, ChevronLeft, ChevronRight, ScrollText } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { hasMinRole, type AuditItem } from '@/lib/types';
import { Spinner } from '@/components/ui/Spinner';
import { AUDIT_ACTIONS, auditActionLabel, fmtDateTime, fullName } from '@/components/admin/labels';
import { EmptyState, ErrorBlock, LoadingBlock, PageHead } from '@/components/admin/ui';

const ACTION_TONE = (action: string) =>
  action === 'LOGIN_FAILED'
    ? 'bg-red-100 text-red-700'
    : action.startsWith('DOC_')
      ? 'bg-brand-100 text-brand-700'
      : action.startsWith('USER_') || action === 'DOC_GRANT_CHANGED'
        ? 'bg-violet-100 text-violet-800'
        : 'bg-amber-100 text-amber-800';

/** Compact, human-readable rendering of the details JSON. */
const detailsText = (d: Record<string, unknown> | null) =>
  d
    ? Object.entries(d)
        .filter(([, v]) => v !== null && v !== undefined && v !== '')
        .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
        .join(' · ')
    : '';

export default function DocsAudit() {
  const { t } = useTranslation();
  const { user: me } = useAuth();
  const isSuper = hasMinRole(me?.role, 'SUPER_ADMIN');
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('page')) || 1);
  const action = params.get('action') ?? '';

  const q = useQuery({
    queryKey: ['docs-audit', { page, action }],
    queryFn: async () =>
      (await api.get<{ items: AuditItem[]; total: number; pageSize: number }>('/docs/audit', { params: { page, action: action || undefined } })).data,
    enabled: isSuper,
    placeholderData: keepPreviousData,
  });

  const set = (next: { page?: number; action?: string }) => {
    const p = new URLSearchParams(params);
    const a = next.action ?? action;
    if (a) p.set('action', a);
    else p.delete('action');
    const pg = next.action !== undefined ? 1 : (next.page ?? page);
    if (pg > 1) p.set('page', String(pg));
    else p.delete('page');
    setParams(p, { replace: true });
  };

  const total = q.data?.total ?? 0;
  const pageSize = q.data?.pageSize ?? 50;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const items = q.data?.items ?? [];

  return (
    <div>
      <PageHead
        title={t('admin.layout.audit')}
        subtitle={q.data ? t('admin.docsAudit.entries', { count: total }) : t('admin.docsAudit.subtitle')}
        actions={
          <>
            {q.isFetching && !q.isLoading && <Spinner className="size-4 text-brand-600" />}
            <Link to="/admin/docs" className="btn-white btn-sm border border-line">
              <ArrowLeft className="size-3.5" /> {t('admin.nav.docs')}
            </Link>
          </>
        }
      />

      {!isSuper ? (
        <div className="rounded-xl border border-line bg-white">
          <EmptyState icon={ScrollText} title={t('admin.docsAudit.superOnly')} />
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-xs font-semibold text-muted">
              {t('admin.docsAudit.action')}
              <select className="input min-h-9 w-64 py-1 text-xs" value={action} onChange={(e) => set({ action: e.target.value })}>
                <option value="">{t('admin.common.all')}</option>
                <option value="DOC_">{t('admin.docsAudit.allDocOps')}</option>
                {AUDIT_ACTIONS.map((k) => (
                  <option key={k} value={k}>
                    {auditActionLabel(k)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {q.isLoading ? (
            <LoadingBlock />
          ) : q.error ? (
            <ErrorBlock error={q.error} onRetry={() => q.refetch()} />
          ) : items.length === 0 ? (
            <div className="rounded-xl border border-line bg-white">
              <EmptyState icon={ScrollText} title={t('admin.docsAudit.notFound')} />
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-line bg-white">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="border-b border-line bg-surface/70 text-[11px] font-semibold tracking-wide whitespace-nowrap text-muted uppercase">
                  <tr>
                    <th className="px-4 py-2.5">{t('admin.docsAudit.th.time')}</th>
                    <th className="px-3 py-2.5">{t('admin.docsAudit.th.action')}</th>
                    <th className="px-3 py-2.5">{t('admin.docsAudit.th.actor')}</th>
                    <th className="px-3 py-2.5">{t('admin.docsAudit.th.target')}</th>
                    <th className="px-3 py-2.5">{t('admin.docsAudit.th.details')}</th>
                    <th className="px-3 py-2.5">{t('admin.docsAudit.th.ip')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {items.map((it) => (
                    <tr key={it.id} className="align-top">
                      <td className="px-4 py-2 text-xs whitespace-nowrap text-muted">{fmtDateTime(it.createdAt)}</td>
                      <td className="px-3 py-2">
                        <span className={clsx('badge text-[10px] whitespace-nowrap', ACTION_TONE(it.action))}>{auditActionLabel(it.action)}</span>
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {it.actor ? (
                          <>
                            <span className="font-semibold text-navy-900">{fullName(it.actor)}</span>
                            <span className="block text-muted">{it.actor.email}</span>
                          </>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="max-w-[14rem] truncate px-3 py-2 font-mono text-[11px] text-muted" title={it.target ?? undefined}>
                        {it.target ?? '—'}
                      </td>
                      <td className="max-w-[24rem] px-3 py-2 text-xs break-words text-ink/80">{detailsText(it.details) || '—'}</td>
                      <td className="px-3 py-2 font-mono text-[11px] whitespace-nowrap text-muted">{it.ip ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {pages > 1 && (
            <nav className="mt-4 flex items-center justify-between gap-3" aria-label={t('admin.common.pagination')}>
              <button type="button" className="btn-white btn-sm border border-line" disabled={page <= 1} onClick={() => set({ page: page - 1 })}>
                <ChevronLeft className="size-3.5" /> {t('admin.common.prev')}
              </button>
              <span className="text-xs text-muted tabular-nums">{t('admin.common.pageOf', { page, pages })}</span>
              <button type="button" className="btn-white btn-sm border border-line" disabled={page >= pages} onClick={() => set({ page: page + 1 })}>
                {t('admin.common.next')} <ChevronRight className="size-3.5" />
              </button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
