import { Suspense, lazy, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Languages } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { pagesAiDocs } from '@/i18n/pagesAiDocs';

registerCopy(pagesAiDocs);

const TranslateDraftDialog = lazy(() => import('./TranslateDraftDialog'));

/** "AI layihə tərcüməsi" on a translation order: pick one of the source files (PDF / image) and open the dialog. */
export const OrderDraftButton = ({ orderId, files, onCreated }: { orderId: string; files: { id: string; filename: string; mimeType: string }[]; onCreated?: () => void }) => {
  const { t } = useTranslation();
  const usable = files.filter((f) => f.mimeType === 'application/pdf' || f.mimeType.startsWith('image/'));
  const [fileId, setFileId] = useState(usable[0]?.id ?? '');
  const [open, setOpen] = useState(false);
  if (!usable.length) return null;
  const file = usable.find((f) => f.id === fileId) ?? usable[0];

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-line p-3">
      {usable.length > 1 && (
        <select className="input !w-auto max-w-full !py-1.5 text-xs" value={file.id} onChange={(e) => setFileId(e.target.value)} aria-label={t('aiDocs.draft.file')}>
          {usable.map((f) => (
            <option key={f.id} value={f.id}>
              {f.filename}
            </option>
          ))}
        </select>
      )}
      <button type="button" className="btn btn-sm border border-line bg-card text-ink hover:bg-surface" onClick={() => setOpen(true)}>
        <Languages className="size-3.5 text-brand-600" aria-hidden /> {t('aiDocs.draft.action')}
      </button>
      {open && (
        <Suspense fallback={null}>
          <TranslateDraftDialog source={{ translationOrderId: orderId, fileId: file.id }} fileName={file.filename} where="order" onClose={() => setOpen(false)} onCreated={onCreated} />
        </Suspense>
      )}
    </div>
  );
};

export default OrderDraftButton;
