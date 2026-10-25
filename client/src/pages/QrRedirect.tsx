import { lazy, useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { FolderOpen, FolderKanban, QrCode } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { isStaffRole } from '@/lib/types';
import { registerCopy } from '@/i18n';
import { pagesOriginals } from '@/i18n/pagesOriginals';
import { driveFolderHref } from '@/components/originals/api';

registerCopy(pagesOriginals);

const NotFound = lazy(() => import('./NotFound'));

const PREF_KEY = 'tv.qrTarget';
type Target = 'drive' | 'case';
const readPref = (): Target | null => {
  try {
    const v = localStorage.getItem(PREF_KEY);
    return v === 'drive' || v === 'case' ? v : null;
  } catch {
    return null;
  }
};
const writePref = (v: Target) => {
  try {
    localStorage.setItem(PREF_KEY, v);
  } catch {
    /* private mode */
  }
};

/**
 * /q/:caseId (and /admin/q/:caseId after the login) — target of the QR label on a paper folder. Staff go
 * to the client's drive folder or the admin case page (choice remembered); anonymous visitors log in first;
 * everybody else sees the plain 404 page, so the code reveals nothing.
 */
export default function QrRedirect() {
  const { t } = useTranslation();
  const { caseId = '' } = useParams();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const staff = !!user && isStaffRole(user.role);
  const [remember, setRemember] = useState(true);
  const q = useQuery({
    queryKey: ['qr', caseId],
    queryFn: async () => (await api.get<{ caseId: string; number: string; driveFolderId: string | null }>(`/originals/qr/${encodeURIComponent(caseId)}`)).data,
    enabled: staff && !!caseId,
    retry: false,
  });
  const pref = readPref();

  const go = (target: Target, save: boolean) => {
    if (!q.data) return;
    if (save) writePref(target);
    navigate(target === 'drive' && q.data.driveFolderId ? driveFolderHref(q.data.driveFolderId) : `/admin/cases/${q.data.caseId}`, { replace: true });
  };

  useEffect(() => {
    if (q.data && pref) go(pref, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data, pref]);

  if (loading) return <div className="grid min-h-[60vh] place-items-center text-sm text-muted">{t('originals.qr.resolving')}</div>;
  if (!user) return <Navigate to="/login" replace state={{ from: `/admin/q/${encodeURIComponent(caseId)}` }} />;
  if (!staff || q.isError) return <NotFound />;
  if (!q.data || pref) return <div className="grid min-h-[60vh] place-items-center text-sm text-muted">{t('originals.qr.resolving')}</div>;

  return (
    <div className="mx-auto grid min-h-[60vh] max-w-md place-items-center px-4">
      <div className="card w-full space-y-4 rounded-3xl p-6 text-center sm:p-8">
        <span className="mx-auto grid size-12 place-items-center rounded-xl chip-sky">
          <QrCode className="size-6" aria-hidden />
        </span>
        <h1 className="type-card-title text-ink">{t('originals.qr.choose')}</h1>
        <p className="font-mono text-xs text-muted">{q.data.number}</p>
        {!q.data.driveFolderId && <p className="text-xs text-muted">{t('originals.qr.noFolder')}</p>}
        <div className="grid gap-2">
          {q.data.driveFolderId && (
            <button type="button" className="btn-primary min-h-11 w-full" onClick={() => go('drive', remember)}>
              <FolderOpen className="size-4" aria-hidden /> {t('originals.qr.drive')}
            </button>
          )}
          <button type="button" className="btn-secondary min-h-11 w-full" onClick={() => go('case', remember)}>
            <FolderKanban className="size-4" aria-hidden /> {t('originals.qr.case')}
          </button>
        </div>
        <label className="flex min-h-11 items-center justify-center gap-2 text-sm text-ink">
          <input type="checkbox" className="size-4 accent-primary" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          {t('originals.qr.remember')}
        </label>
      </div>
    </div>
  );
}
