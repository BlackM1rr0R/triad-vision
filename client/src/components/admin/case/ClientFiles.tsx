import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { FileStack, FolderUp, Upload } from 'lucide-react';
import type { CaseDetail } from '@/lib/types';
import { Spinner } from '@/components/ui/Spinner';
import { stageLabel, toastError } from '../labels';
import { Panel } from '../ui';
import { DocIcon, DocLinks, DocMeta, uploadCaseDocument, useCaseRefresh } from './shared';
import { useCaseIntel } from '@/components/docsIntel/api';
import { FormButtons, PacketActions } from '@/components/docsIntel/PacketAndForms';

/** Embassy packet + pre-filled forms (document intelligence module). */
const DocIntelPanels = ({ c }: { c: CaseDetail }) => {
  const { t } = useTranslation();
  const intel = useCaseIntel(c.id);
  return (
    <>
      <Panel title={t('docsIntel.packet.title')} icon={FileStack}>
        <p className="mb-3 text-xs text-muted">{t('docsIntel.packet.desc')}</p>
        <PacketActions caseId={c.id} caseNumber={c.number} allowed canStore accepted={intel.data?.packet.accepted} total={intel.data?.packet.total} />
      </Panel>
      <Panel title={t('docsIntel.forms.title')} icon={FileStack}>
        <p className="mb-3 text-xs text-muted">{t('docsIntel.forms.desc')}</p>
        <FormButtons caseId={c.id} caseNumber={c.number} missing={intel.data?.forms} />
      </Panel>
    </>
  );
};

/** Files staff attach for the client: the visa scan or any other document. */
export const ClientFiles = ({ c }: { c: CaseDetail }) => {
  const { t } = useTranslation();
  const refresh = useCaseRefresh(c.id);
  const ref = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<'VISA' | 'OTHER'>(c.status === 'APPROVED' ? 'VISA' : 'OTHER');
  const [busy, setBusy] = useState(false);

  const upload = async (file: File) => {
    setBusy(true);
    try {
      await uploadCaseDocument(c.id, file, stage);
      await refresh();
      toast.success(t('admin.case.files.uploaded'));
    } catch (err) {
      toastError(err, t('admin.case.files.uploadFailed'));
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = '';
    }
  };

  return (
    <>
    <Panel title={t('admin.case.files.title')} icon={FolderUp}>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label htmlFor="cf-stage" className="sr-only">
          {t('admin.case.files.fileType')}
        </label>
        <select id="cf-stage" className="input w-auto min-w-0 flex-1 py-2 sm:flex-none" value={stage} onChange={(e) => setStage(e.target.value as 'VISA' | 'OTHER')}>
          <option value="VISA">{t('admin.case.files.visa')}</option>
          <option value="OTHER">{t('admin.case.files.other')}</option>
        </select>
        <input
          ref={ref}
          type="file"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          accept="application/pdf,image/jpeg,image/png,image/webp,.doc,.docx"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
          }}
        />
        <button type="button" className="btn-primary btn-sm" onClick={() => ref.current?.click()} disabled={busy}>
          {busy ? <Spinner className="size-3.5" /> : <Upload className="size-3.5" />} {t('admin.common.uploadFile')}
        </button>
      </div>
      {c.otherDocuments.length === 0 ? (
        <p className="text-sm text-muted">{t('admin.case.files.empty')}</p>
      ) : (
        <ul className="space-y-2">
          {c.otherDocuments.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-line px-3 py-2.5">
              <div className="flex min-w-0 flex-[1_1_13rem] items-center gap-3">
                <DocIcon mime={d.mimeType} className="size-4 shrink-0 text-link" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium" title={d.originalName}>{d.originalName}</p>
                  <DocMeta doc={d} />
                </div>
              </div>
              <span className={d.stage === 'VISA' ? 'badge whitespace-nowrap bg-success-bg text-success-fg' : 'badge whitespace-nowrap bg-sunken text-muted'}>
                {stageLabel(d.stage)}
              </span>
              <DocLinks doc={d} />
            </li>
          ))}
        </ul>
      )}
    </Panel>
    <DocIntelPanels c={c} />
    </>
  );
};
