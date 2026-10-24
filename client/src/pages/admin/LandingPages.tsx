import { useState } from 'react';
import { Link, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Copy, ExternalLink, FileText, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button, IconButton, buttonClass } from '@/components/ui/Button';
import { StatusPill } from '@/components/ui/Badge';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState, ErrorBlock, LoadingBlock, PageHead } from '@/components/admin/ui';
import { fmtRelative } from '@/components/admin/labels';
import { LandingEditor } from '@/components/landing/LandingEditor';
import type { LandingRow } from '@/components/marketing/api';
import { registerCopy } from '@/i18n';
import { pagesMarketing } from '@/i18n/pagesMarketing';
import { api, errorCode } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { hasMinRole } from '@/lib/types';
import { usePageTitle } from '@/lib/usePageTitle';

registerCopy(pagesMarketing);

interface ListResponse {
  pages: LandingRow[];
  totals: { views: number; submissions: number; rate: number | null };
}

const pct = (r: number | null) => (r == null ? '—' : `${r}%`);

const LandingList = ({ canPublish }: { canPublish: boolean }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState<LandingRow | null>(null);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin', 'landing', 'list'],
    queryFn: async () => (await api.get<ListResponse>('/admin/marketing/landing-pages')).data,
  });
  const refresh = () => void qc.invalidateQueries({ queryKey: ['admin', 'landing'] });
  const onError = (err: unknown) => toast.error(t(`mk.landing.editor.errors.${errorCode(err)}`, { defaultValue: t('mk.common.error') }));
  const duplicate = useMutation({
    mutationFn: async (id: string) => (await api.post<{ page: LandingRow }>(`/admin/marketing/landing-pages/${id}/duplicate`)).data.page,
    onSuccess: (p) => {
      toast.success(t('mk.landing.duplicated'));
      refresh();
      navigate(`/admin/landing-pages/${p.id}`);
    },
    onError,
  });
  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: LandingRow['status'] }) => api.post(`/admin/marketing/landing-pages/${id}/status`, { status }),
    onSuccess: (_r, v) => {
      toast.success(v.status === 'PUBLISHED' ? t('mk.landing.published') : t('mk.landing.unpublished'));
      refresh();
    },
    onError,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/marketing/landing-pages/${id}`),
    onSuccess: () => {
      toast.success(t('mk.landing.deleted'));
      setConfirm(null);
      refresh();
    },
    onError,
  });

  return (
    <div>
      <PageHead
        title={t('mk.landing.title')}
        subtitle={t('mk.landing.subtitle')}
        actions={
          <Link to="/admin/landing-pages/new" className={buttonClass({ size: 'sm' })}>
            <Plus className="size-4" aria-hidden /> {t('mk.landing.new')}
          </Link>
        }
      />
      {isLoading ? (
        <LoadingBlock />
      ) : error ? (
        <ErrorBlock error={error} onRetry={() => refetch()} />
      ) : !data?.pages.length ? (
        <div className="rounded-xl border border-line bg-card">
          <EmptyState icon={FileText} title={t('mk.landing.empty')} />
        </div>
      ) : (
        <>
          <p className="mb-3 text-sm text-muted">{t('mk.landing.totals', { views: data.totals.views, submissions: data.totals.submissions, rate: pct(data.totals.rate) })}</p>
          <div className="overflow-x-auto rounded-xl border border-line bg-card">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-surface text-left text-xs text-muted">
                <tr>
                  <th className="px-4 py-2 font-semibold">{t('mk.landing.col.page')}</th>
                  <th className="px-4 py-2 font-semibold">{t('mk.landing.col.status')}</th>
                  <th className="px-4 py-2 text-right font-semibold">{t('mk.landing.col.views')}</th>
                  <th className="px-4 py-2 text-right font-semibold">{t('mk.landing.col.submissions')}</th>
                  <th className="px-4 py-2 text-right font-semibold">{t('mk.landing.col.rate')}</th>
                  <th className="px-4 py-2 font-semibold">{t('mk.landing.col.updated')}</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.pages.map((p) => (
                  <tr key={p.id} className="hover:bg-surface/60">
                    <td className="px-4 py-2.5">
                      <Link to={`/admin/landing-pages/${p.id}`} className="font-semibold text-ink hover:text-brand-600">
                        {p.title}
                      </Link>
                      <span className="block text-xs text-muted">
                        /l/{p.slug} · {p.locale.toUpperCase()}
                        {p.country ? ` · ${p.country}` : ''}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusPill domain="publication" status={p.status} label={t(`mk.landing.statuses.${p.status}`)} />
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{p.views}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{p.submissions}</td>
                    <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{pct(p.rate)}</td>
                    <td className="px-4 py-2.5 text-xs text-muted">{fmtRelative(p.updatedAt)}</td>
                    <td className="px-4 py-2.5">
                      <span className="flex justify-end gap-1">
                        {p.status === 'PUBLISHED' && (
                          <a href={`/l/${p.slug}`} target="_blank" rel="noreferrer" className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface hover:text-ink" aria-label={t('mk.landing.actions.view')} title={t('mk.landing.actions.view')}>
                            <ExternalLink className="size-4" aria-hidden />
                          </a>
                        )}
                        <IconButton icon={Pencil} label={t('mk.landing.actions.edit')} size="sm" variant="ghost" onClick={() => navigate(`/admin/landing-pages/${p.id}`)} />
                        <IconButton icon={Copy} label={t('mk.landing.actions.duplicate')} size="sm" variant="ghost" onClick={() => duplicate.mutate(p.id)} />
                        {canPublish && (
                          <Button variant="outline" size="sm" onClick={() => setStatus.mutate({ id: p.id, status: p.status === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED' })}>
                            {p.status === 'PUBLISHED' ? t('mk.landing.actions.unpublish') : t('mk.landing.actions.publish')}
                          </Button>
                        )}
                        {canPublish && p.status !== 'PUBLISHED' && <IconButton icon={Trash2} label={t('mk.landing.actions.delete')} size="sm" variant="danger" onClick={() => setConfirm(p)} />}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm && remove.mutate(confirm.id)}
        title={t('mk.landing.actions.delete')}
        message={confirm ? t('mk.landing.confirmDelete', { title: confirm.title }) : ''}
        confirmLabel={t('mk.common.delete')}
        tone="danger"
        loading={remove.isPending}
      />
    </div>
  );
};

const EditorRoute = ({ canPublish }: { canPublish: boolean }) => {
  const { id = 'new' } = useParams();
  const editId = id === 'new' ? null : id;
  // keyed by id: a new page that was just saved (or a duplicate) starts with fresh editor state
  return <LandingEditor key={editId ?? 'new'} id={editId} canPublish={canPublish} />;
};

/** /admin/landing-pages — list with conversion stats + the section editor (/admin/landing-pages/:id). */
export default function AdminLandingPages() {
  const { t } = useTranslation();
  const { user } = useAuth();
  usePageTitle(t('mk.landing.title'));
  const canPublish = hasMinRole(user?.role, 'ADMIN');
  return (
    <Routes>
      <Route index element={<LandingList canPublish={canPublish} />} />
      <Route path=":id" element={<EditorRoute canPublish={canPublish} />} />
    </Routes>
  );
}
