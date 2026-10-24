import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, FileStack, Pencil, ScanLine, Sparkles } from 'lucide-react';
import { errorCode } from '@/lib/api';
import { Spinner } from '@/components/ui/Spinner';
import { Skeleton, SkeletonText } from '@/components/ui/Skeleton';
import {
  applyOcr,
  expiryState,
  intelKey,
  mrzOf,
  profileDiff,
  PROFILE_KEYS,
  runOcr,
  useCaseIntel,
  useIntelRefresh,
  type CaseIntel,
} from '@/components/docsIntel/api';
import { useOcrStatus } from '@/components/docsIntel/OcrBadge';
import { FormButtons, PacketActions } from '@/components/docsIntel/PacketAndForms';

const Section = ({ icon: Icon, title, desc, children }: { icon: typeof ScanLine; title: string; desc?: string; children: React.ReactNode }) => (
  <div className="rounded-xl border border-line bg-white/60 p-4 sm:p-5">
    <h4 className="flex items-center gap-2 text-sm font-bold text-navy-900">
      <Icon className="size-4 text-brand-600" aria-hidden /> {title}
    </h4>
    {desc && <p className="mt-0.5 mb-3 text-xs text-muted">{desc}</p>}
    {!desc && <div className="mb-3" />}
    {children}
  </div>
);

const PassportSection = ({ intel, caseId }: { intel: CaseIntel; caseId: string }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const refresh = useIntelRefresh(caseId);
  const status = useOcrStatus();
  const [busy, setBusy] = useState<'run' | 'apply' | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const p = intel.passport;

  if (!p) return <p className="text-sm text-muted">{t('docsIntel.panel.noPassport')}</p>;
  const mrz = mrzOf(p.ocr);
  const st = status(p.ocr, p.ocrAt, p.isImage);
  const diff = p.extracted ? profileDiff(intel.profile, p.extracted) : [];
  const expiry = expiryState(mrz?.expiryDate);

  const run = async () => {
    setBusy('run');
    try {
      await runOcr(p.id);
      await refresh();
    } catch (err) {
      const code = errorCode(err);
      toast.error(code === 'OCR_UNAVAILABLE' ? t('docsIntel.ocr.unavailable') : t('docsIntel.ocr.error', { message: code }));
    } finally {
      setBusy(null);
    }
  };
  const confirm = async () => {
    setBusy('apply');
    try {
      const { profile } = await applyOcr(p.id);
      qc.setQueryData(intelKey(caseId), (old: CaseIntel | undefined) => (old ? { ...old, profile } : old));
      setConfirmed(true);
      toast.success(t('docsIntel.ocr.confirmed'));
      await refresh();
    } catch (err) {
      toast.error(t('docsIntel.ocr.error', { message: errorCode(err) }));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-3">
      {!mrz && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className={clsx(st.tone === 'warn' ? 'text-amber-700' : st.tone === 'danger' ? 'text-danger' : 'text-muted')}>{st.text}</span>
          {p.isImage && intel.ocrAvailable && !p.ocrAt && (
            <button type="button" className="btn-secondary btn-sm" onClick={run} disabled={!!busy}>
              {busy === 'run' ? <Spinner className="size-3.5" /> : <ScanLine className="size-3.5" aria-hidden />} {t('docsIntel.ocr.run')}
            </button>
          )}
        </div>
      )}
      {mrz && (
        <>
          <dl className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
            <div className="flex justify-between gap-3 sm:col-span-2">
              <dt className="text-muted">{t('docsIntel.ocr.fields.surname')} / {t('docsIntel.ocr.fields.givenNames')}</dt>
              <dd className="font-mono font-semibold text-navy-900">{mrz.surname} {mrz.givenNames}</dd>
            </div>
            {PROFILE_KEYS.map((k) => {
              const label = k === 'passportNumber' ? 'documentNumber' : k === 'passportExpiry' ? 'expiryDate' : k;
              return (
                <div key={k} className="flex justify-between gap-3">
                  <dt className="text-muted">{t(`docsIntel.ocr.fields.${label}`)}</dt>
                  <dd className={clsx('font-mono font-semibold', diff.includes(k) ? 'text-brand-700' : 'text-navy-900')}>{p.extracted?.[k] ?? '—'}</dd>
                </div>
              );
            })}
          </dl>
          {!mrz.valid && (
            <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {t('docsIntel.ocr.invalid')}
            </p>
          )}
          {expiry === 'soon' && (
            <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {t('docsIntel.ocr.expiryWarning')}
            </p>
          )}
          {expiry === 'expired' && (
            <p className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-danger">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {t('docsIntel.ocr.expired')}
            </p>
          )}
          {diff.length > 0 && !confirmed ? (
            <div className="space-y-2">
              <p className="text-xs text-muted">{t('docsIntel.ocr.checkHint')}</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-primary btn-sm" onClick={confirm} disabled={!!busy}>
                  {busy === 'apply' ? <Spinner className="size-3.5" /> : <CheckCircle2 className="size-3.5" aria-hidden />} {t('docsIntel.ocr.correct')}
                </button>
                <Link to="/account/profile" className="btn-secondary btn-sm">
                  <Pencil className="size-3.5" aria-hidden /> {t('docsIntel.ocr.fix')}
                </Link>
              </div>
            </div>
          ) : (
            <p className="flex items-center gap-1.5 text-xs text-emerald-700">
              <CheckCircle2 className="size-3.5" aria-hidden /> {t('docsIntel.ocr.matches')}
            </p>
          )}
        </>
      )}
    </div>
  );
};

/**
 * Portal case page section: extracted passport data (confirm / fix), the embassy packet when the case
 * has reached the embassy step, and the pre-filled forms. Loads its own data.
 */
export default function DocIntelPanel({ caseId, caseNumber }: { caseId: string; caseNumber?: string }) {
  const { t } = useTranslation();
  const q = useCaseIntel(caseId);

  return (
    <section id="doc-intel" className="card scroll-mt-28 overflow-hidden lg:scroll-mt-36" aria-labelledby="doc-intel-title">
      <div className="flex flex-wrap items-center gap-4 border-b border-line p-5 sm:p-6">
        <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-lg shadow-brand-600/25">
          <Sparkles className="size-6" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h3 id="doc-intel-title" className="text-xl font-bold text-navy-900">
            {t('docsIntel.panel.title')}
          </h3>
          <p className="mt-0.5 text-sm text-muted">{t('docsIntel.panel.subtitle')}</p>
        </div>
      </div>
      <div className="space-y-4 p-5 sm:p-6">
        {q.isLoading && (
          <div className="space-y-3" role="status" aria-label={t('ui.loading')}>
            <Skeleton className="h-4 w-40" />
            <SkeletonText lines={2} />
            <Skeleton className="h-9 w-32" />
          </div>
        )}
        {q.isError && <p className="text-sm text-danger">{t('common.error')}</p>}
        {q.data && (
          <>
            <Section icon={ScanLine} title={t('docsIntel.ocr.title')}>
              <PassportSection intel={q.data} caseId={caseId} />
            </Section>
            <Section icon={FileStack} title={t('docsIntel.packet.title')} desc={t('docsIntel.packet.desc')}>
              <PacketActions caseId={caseId} caseNumber={caseNumber ?? caseId} allowed={q.data.packet.allowed} canStore={false} accepted={q.data.packet.accepted} total={q.data.packet.total} />
            </Section>
            <Section icon={FileStack} title={t('docsIntel.forms.title')} desc={t('docsIntel.forms.desc')}>
              <FormButtons caseId={caseId} caseNumber={caseNumber ?? caseId} missing={q.data.forms} profileLink="/account/profile" />
            </Section>
          </>
        )}
      </div>
    </section>
  );
}
