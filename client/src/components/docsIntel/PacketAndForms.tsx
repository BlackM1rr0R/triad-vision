import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, Download, FileStack, FileText, Save } from 'lucide-react';
import { errorCode } from '@/lib/api';
import { Spinner } from '@/components/ui/Spinner';
import { downloadPdf, FORM_KINDS, formUrl, packetUrl, storePacket, useIntelRefresh, type FormKind } from './api';

const errorText = (t: (k: string, o?: Record<string, unknown>) => string, has: (k: string) => boolean, err: unknown) => {
  const code = errorCode(err);
  return has(`docsIntel.errors.${code}`) ? t(`docsIntel.errors.${code}`) : t('docsIntel.ocr.error', { message: code });
};

/** Download (and optionally store) the embassy packet. `allowed` false shows the "not yet" note instead. */
export const PacketActions = ({
  caseId,
  caseNumber,
  allowed,
  canStore,
  accepted,
  total,
  compact,
}: {
  caseId: string;
  caseNumber: string;
  allowed: boolean;
  canStore: boolean;
  accepted?: number;
  total?: number;
  compact?: boolean;
}) => {
  const { t, i18n } = useTranslation();
  const refresh = useIntelRefresh(caseId);
  const [busy, setBusy] = useState<'download' | 'store' | null>(null);

  const download = async () => {
    setBusy('download');
    try {
      await downloadPdf(packetUrl(caseId), `${caseNumber}-sefirlik-paketi.pdf`);
    } catch (err) {
      toast.error(errorText(t, (k) => i18n.exists(k), err));
    } finally {
      setBusy(null);
    }
  };
  const store = async () => {
    setBusy('store');
    try {
      await storePacket(caseId);
      toast.success(t('docsIntel.packet.saved'));
      await refresh();
    } catch (err) {
      toast.error(errorText(t, (k) => i18n.exists(k), err));
    } finally {
      setBusy(null);
    }
  };

  if (!allowed) return <p className="text-sm text-muted">{t('docsIntel.packet.notYet')}</p>;
  return (
    <div className={clsx('flex flex-wrap items-center gap-2', compact && 'gap-1.5')}>
      <button type="button" className="btn-primary btn-sm" onClick={download} disabled={!!busy}>
        {busy === 'download' ? <Spinner className="size-3.5" /> : <Download className="size-3.5" aria-hidden />} {busy === 'download' ? t('docsIntel.packet.building') : t('docsIntel.packet.download')}
      </button>
      {canStore && (
        <button type="button" className="btn-white btn-sm border border-line" onClick={store} disabled={!!busy}>
          {busy === 'store' ? <Spinner className="size-3.5" /> : <Save className="size-3.5" aria-hidden />} {t('docsIntel.packet.save')}
        </button>
      )}
      {accepted !== undefined && total !== undefined && <span className="text-xs text-muted">{t('docsIntel.packet.docs', { accepted, total })}</span>}
    </div>
  );
};

/** Three form buttons with the missing-profile-field warning. */
export const FormButtons = ({
  caseId,
  caseNumber,
  missing,
  profileLink,
}: {
  caseId: string;
  caseNumber: string;
  missing?: Partial<Record<FormKind, { missing: string[] }>>;
  /** Where "complete profile" should lead (portal only). */
  profileLink?: string;
}) => {
  const { t, i18n } = useTranslation();
  const [busy, setBusy] = useState<FormKind | null>(null);
  const [lastMissing, setLastMissing] = useState<Partial<Record<FormKind, string[]>>>({});
  const fieldLabel = (f: string) => (i18n.exists(`docsIntel.forms.fields.${f}`) ? t(`docsIntel.forms.fields.${f}`) : f);

  const generate = async (kind: FormKind) => {
    setBusy(kind);
    try {
      const { missing: m } = await downloadPdf(formUrl(caseId, kind), `${caseNumber}-${kind}.pdf`);
      setLastMissing((s) => ({ ...s, [kind]: m }));
      toast.success(m.length ? t('docsIntel.forms.downloaded', { count: m.length }) : t('docsIntel.forms.downloadedOk'));
    } catch (err) {
      toast.error(errorText(t, (k) => i18n.exists(k), err));
    } finally {
      setBusy(null);
    }
  };

  const allMissing = [...new Set(FORM_KINDS.flatMap((k) => lastMissing[k] ?? missing?.[k]?.missing ?? []))];

  return (
    <div className="space-y-3">
      <ul className="grid gap-2 sm:grid-cols-3">
        {FORM_KINDS.map((kind) => {
          const m = lastMissing[kind] ?? missing?.[kind]?.missing;
          return (
            <li key={kind} className="flex flex-col rounded-lg border border-line bg-white p-3">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-navy-900">
                <FileText className="size-4 shrink-0 text-brand-600" aria-hidden />
                {t(`docsIntel.forms.kinds.${kind}`)}
              </p>
              <p className="mt-0.5 flex-1 text-xs text-muted">{t(`docsIntel.forms.hints.${kind}`)}</p>
              {m && (
                <p className={clsx('mt-2 flex items-start gap-1 text-[11px]', m.length ? 'text-amber-700' : 'text-emerald-700')}>
                  {m.length ? <AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden /> : <CheckCircle2 className="mt-0.5 size-3 shrink-0" aria-hidden />}
                  {m.length ? t('docsIntel.forms.missing', { fields: m.map(fieldLabel).join(', ') }) : t('docsIntel.forms.complete')}
                </p>
              )}
              <button type="button" className="btn-white btn-sm mt-3 w-full border border-line" onClick={() => generate(kind)} disabled={!!busy}>
                {busy === kind ? <Spinner className="size-3.5" /> : <Download className="size-3.5" aria-hidden />} PDF
              </button>
            </li>
          );
        })}
      </ul>
      {profileLink && allMissing.length > 0 && (
        <Link to={profileLink} className="btn-ghost btn-sm">
          <FileStack className="size-3.5" aria-hidden /> {t('docsIntel.forms.openProfile')}
        </Link>
      )}
    </div>
  );
};
