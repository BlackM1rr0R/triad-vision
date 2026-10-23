import { useEffect, useRef, useState } from 'react';
import SignaturePadLib from 'signature_pad';
import { useTranslation } from 'react-i18next';
import { Eraser } from 'lucide-react';
import { Modal } from '@/components/admin/Modal';
import { Spinner } from '@/components/ui/Spinner';

/** Draw a signature (mouse, pen, finger) and save it as a transparent PNG to the stamp library. */
export const SignatureDialog = ({ busy, onSave, onClose }: { busy: boolean; onSave: (name: string, pngDataUrl: string) => void; onClose: () => void }) => {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePadLib | null>(null);
  const [empty, setEmpty] = useState(true);
  const [name, setName] = useState('');

  useEffect(() => {
    // The modal animates in; wait a frame so the canvas has its size.
    const id = window.setTimeout(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      canvas.width = canvas.offsetWidth * ratio;
      canvas.height = canvas.offsetHeight * ratio;
      canvas.getContext('2d')?.scale(ratio, ratio);
      const pad = new SignaturePadLib(canvas, { penColor: '#0b1f44', minWidth: 1, maxWidth: 3, throttle: 8 });
      pad.addEventListener('endStroke', () => setEmpty(pad.isEmpty()));
      padRef.current = pad;
    }, 120);
    return () => {
      window.clearTimeout(id);
      padRef.current?.off();
      padRef.current = null;
    };
  }, []);

  const clear = () => {
    padRef.current?.clear();
    setEmpty(true);
  };

  return (
    <Modal
      open
      onClose={() => !busy && onClose()}
      title={t('pdfTools.stamp.draw')}
      description={t('pdfTools.stamp.drawHint')}
      footer={
        <>
          <button type="button" className="btn-secondary btn-sm" onClick={onClose} disabled={busy}>
            {t('pdfTools.common.cancel')}
          </button>
          <button
            type="button"
            className="btn-primary btn-sm"
            disabled={busy || empty || !name.trim()}
            onClick={() => padRef.current && onSave(name.trim(), padRef.current.toDataURL('image/png'))}
          >
            {busy && <Spinner className="size-3.5" />} {t('pdfTools.stamp.saveDrawing')}
          </button>
        </>
      }
    >
      <label className="mb-3 block">
        <span className="mb-1 block text-xs font-semibold text-muted">{t('pdfTools.stamp.name')}</span>
        <input
          className="w-full rounded-lg border border-line bg-card px-3 py-2 text-sm text-ink focus:border-brand-500 focus:outline-none"
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('pdfTools.stamp.namePlaceholder')}
        />
      </label>
      <div className="relative overflow-hidden rounded-xl border-2 border-dashed border-brand-400/60 bg-white">
        <canvas ref={canvasRef} className="block h-48 w-full cursor-crosshair touch-none" />
        <div className="pointer-events-none absolute right-6 bottom-10 left-6 border-b border-slate-300" aria-hidden />
      </div>
      <div className="mt-2 flex justify-end">
        <button type="button" onClick={clear} className="btn btn-sm text-muted hover:bg-surface" disabled={empty}>
          <Eraser className="size-4" aria-hidden /> {t('pdfTools.stamp.clear')}
        </button>
      </div>
    </Modal>
  );
};

export default SignatureDialog;
