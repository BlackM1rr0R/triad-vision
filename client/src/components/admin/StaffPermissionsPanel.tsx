import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { Check, ShieldCheck, X } from 'lucide-react';
import { api, errorCode } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesUserPerms } from '@/i18n/pagesUserPerms';
import { adminSimpleCopy } from '@/i18n/adminSimple';
import { Modal } from '@/components/admin/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { roleLabel, fullName } from '@/components/admin/labels';
import type { AdminUser } from '@/components/admin/types';
import { StaffDeskSelect, useStaffDesks } from '@/components/admin/StaffDeskSelect';
import { StaffProfileSelect } from '@/components/admin/StaffProfileSelect';
import { joinSummary, scopeKind, summarizePermissions, type PermissionMatrixLike } from '@/lib/permissionSummary';

registerCopy(pagesUserPerms);
registerCopy(adminSimpleCopy);

type Preview = {
  superAdmin: boolean;
  matrix: PermissionMatrixLike;
  caseScope: string;
  breakGlassCaseIds: string[];
};

/**
 * One line for the user card: "Əməkdaş · Marketinq · Rəhbərlik profili" (role · desk · work profile).
 * Desk / profile rows come from the same query the editors use (GET /admin/nav/desks), so it is free.
 */
export function StaffSummaryLine({ u, className }: { u: AdminUser; className?: string }) {
  const { t } = useTranslation();
  const rows = useStaffDesks(true);
  const row = (rows.data as { id: string; desk: string | null; defaultDesk: string; workProfile?: string | null; defaultWorkProfile?: string }[] | undefined)?.find((d) => d.id === u.id);
  const text = joinSummary([
    roleLabel(u.role),
    row ? t(`anav.desks.${row.desk ?? row.defaultDesk}`) : null,
    row ? t('userPerms.profileOf', { name: t(`wprof.names.${row.workProfile ?? row.defaultWorkProfile ?? 'CASES'}`) }) : null,
  ]);
  return <span className={clsx('block min-w-0 truncate text-xs font-medium text-ink/80', className)}>{text}</span>;
}

const Tick = ({ on, label, tone = 'ok' }: { on: boolean; label: string; tone?: 'ok' | 'muted' }) => (
  <span className={clsx('inline-flex items-center gap-1 text-xs', on ? (tone === 'ok' ? 'text-success-fg' : 'text-ink/70') : 'text-muted/70')}>
    {on ? <Check className="size-3.5" aria-hidden /> : <X className="size-3.5" aria-hidden />}
    {label}
  </span>
);

/**
 * "İcazələr" panel of one staff member: what they can see and do (the effective permissions from the SAME resolver that
 * enforces access: GET /admin/access/staff/users/:id/preview, super admin / "manage access" only), plus the editors for
 * role, desk and work profile with a one-sentence explanation each. Nothing here changes how access is enforced.
 */
export function StaffPermissionsPanel({ user, onClose, roleEditor, canEditDeskProfile }: { user: AdminUser | null; onClose: () => void; roleEditor: React.ReactNode; canEditDeskProfile: boolean }) {
  const { t } = useTranslation();
  const preview = useQuery({
    queryKey: ['admin-access-preview', user?.id],
    queryFn: async () => (await api.get<Preview>(`/admin/access/staff/users/${user!.id}/preview`)).data,
    enabled: !!user,
    retry: false,
    staleTime: 15_000,
  });
  const forbidden = preview.isError && errorCode(preview.error) === 'FORBIDDEN';
  const rows = preview.data ? summarizePermissions(preview.data.matrix) : [];
  const name = user ? fullName(user) : '';
  return (
    <Modal open={!!user} onClose={onClose} title={t('userPerms.title', { name })} size="lg">
      {user && (
        <div className="space-y-5 text-sm">
          <p className="text-xs font-medium text-ink/80" data-testid="perm-summary-line">
            <StaffSummaryLine u={user} />
          </p>

          <section aria-labelledby="perm-see">
            <h3 id="perm-see" className="mb-2 text-sm font-semibold text-ink">
              {t('userPerms.seeTitle')}
            </h3>
            {preview.isLoading && (
              <p className="flex items-center gap-2 text-muted">
                <Spinner /> {t('userPerms.loading')}
              </p>
            )}
            {forbidden && <p className="rounded-lg bg-sunken p-3 text-xs text-muted">{t('userPerms.noRight')}</p>}
            {preview.isError && !forbidden && (
              <p className="text-danger-fg" role="alert">
                {t('userPerms.error')}
              </p>
            )}
            {preview.data?.superAdmin && (
              <p className="mb-2 flex items-center gap-2 rounded-lg bg-sunken p-3 text-xs text-ink/80">
                <ShieldCheck className="size-4 shrink-0 text-success-fg" aria-hidden /> {t('userPerms.superAll')}
              </p>
            )}
            {preview.data && (
              <ul className="divide-y divide-line rounded-lg border border-line" data-testid="perm-areas">
                {rows.map((r) => (
                  <li key={r.area} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2" data-level={r.level}>
                    <span className="w-44 shrink-0 font-medium text-ink">{t(`userPerms.areas.${r.area}`)}</span>
                    {r.level === 'none' ? (
                      <Tick on={false} label={t('userPerms.none')} />
                    ) : (
                      <>
                        <Tick on={r.canView} label={t('userPerms.canView')} />
                        <Tick on={r.canEdit} label={t('userPerms.canEdit')} />
                        {r.canDelete && <Tick on label={t('userPerms.canDelete')} tone="muted" />}
                        {r.canExport && <Tick on label={t('userPerms.canExport')} tone="muted" />}
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {preview.data && (
            <section aria-labelledby="perm-scope">
              <h3 id="perm-scope" className="mb-1 text-sm font-semibold text-ink">
                {t('userPerms.scopeTitle')}
              </h3>
              <p className="text-xs text-ink/80">{t(`userPerms.scope.${scopeKind(preview.data.caseScope)}`)}</p>
              {preview.data.breakGlassCaseIds.length > 0 && <p className="mt-1 text-xs text-muted">{t('userPerms.breakGlass', { count: preview.data.breakGlassCaseIds.length })}</p>}
            </section>
          )}

          <section className="space-y-3 border-t border-line pt-4">
            <div>
              <h3 className="text-sm font-semibold text-ink">{t('userPerms.roleTitle')}</h3>
              <p className="mb-1.5 text-xs text-muted">{t('userPerms.roleHint')}</p>
              {roleEditor}
            </div>
            {canEditDeskProfile && (
              <>
                <div>
                  <h3 className="text-sm font-semibold text-ink">{t('userPerms.deskTitle')}</h3>
                  <p className="mb-1.5 text-xs text-muted">{t('userPerms.deskHint')}</p>
                  <StaffDeskSelect userId={user.id} name={name} className="block max-w-72 [&_select]:w-full" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-ink">{t('userPerms.profileTitle')}</h3>
                  <p className="mb-1.5 text-xs text-muted">{t('userPerms.profileHint')}</p>
                  <StaffProfileSelect userId={user.id} name={name} className="block max-w-72 [&_select]:w-full" />
                </div>
              </>
            )}
          </section>

          <p className="border-t border-line pt-3">
            <Link to="/admin/access" className="text-sm font-medium text-link hover:underline" onClick={onClose}>
              {t('userPerms.moreLink')}
            </Link>
          </p>
        </div>
      )}
    </Modal>
  );
}
