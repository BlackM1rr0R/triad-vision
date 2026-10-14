import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import SignaturePadLib from 'signature_pad';
import { useTranslation } from 'react-i18next';
import { Eraser, PenLine } from 'lucide-react';

export interface SignaturePadHandle {
  isEmpty: () => boolean;
  toDataURL: () => string;
  clear: () => void;
}

/** Hand-drawn signature field (mouse, pen or finger) backed by `signature_pad`, sharp on HiDPI screens. */
export const SignaturePad = ({
  ref,
  onChange,
  label,
}: {
  ref?: Ref<SignaturePadHandle>;
  onChange?: (empty: boolean) => void;
  label?: string;
}) => {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePadLib | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const pad = new SignaturePadLib(canvas, { penColor: '#0b1f44', minWidth: 0.9, maxWidth: 2.8, throttle: 8 });
    padRef.current = pad;

    let lastW = 0;
    let lastH = 0;
    let lastRatio = 0;
    const resize = () => {
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      if (!w || !h || (w === lastW && h === lastH && ratio === lastRatio)) return;
      lastW = w;
      lastH = h;
      lastRatio = ratio;
      const data = pad.toData();
      canvas.width = w * ratio;
      canvas.height = h * ratio;
      canvas.getContext('2d')?.scale(ratio, ratio);
      pad.clear();
      if (data.length) pad.fromData(data);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    window.addEventListener('resize', resize);

    const onEnd = () => {
      const isEmpty = pad.isEmpty();
      setEmpty(isEmpty);
      onChangeRef.current?.(isEmpty);
    };
    pad.addEventListener('endStroke', onEnd);

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', resize);
      pad.removeEventListener('endStroke', onEnd);
      pad.off();
      padRef.current = null;
    };
  }, []);

  const clear = () => {
    padRef.current?.clear();
    setEmpty(true);
    onChangeRef.current?.(true);
  };

  useImperativeHandle(ref, () => ({
    isEmpty: () => padRef.current?.isEmpty() ?? true,
    toDataURL: () => padRef.current?.toDataURL('image/png') ?? '',
    clear,
  }));

  return (
    <div>
      <div className="relative overflow-hidden rounded-xl border-2 border-dashed border-brand-400/60 bg-white focus-within:border-brand-600">
        <canvas
          ref={canvasRef}
          className="block aspect-[2/1] max-h-60 min-h-40 w-full cursor-crosshair touch-none sm:aspect-[5/2]"
          role="img"
          aria-label={label ?? t('portal.contract.signTitle')}
        />
        {empty && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted/70">
            <PenLine className="size-7" aria-hidden />
            <span className="px-4 text-center text-xs">{t('portal.contract.signText')}</span>
          </div>
        )}
        <div className="pointer-events-none absolute right-6 bottom-10 left-6 border-b border-line" aria-hidden />
      </div>
      <div className="mt-2 flex justify-end">
        <button type="button" onClick={clear} className="btn btn-sm min-h-10 text-muted hover:bg-surface hover:text-navy-900" disabled={empty}>
          <Eraser className="size-4" aria-hidden />
          {t('portal.contract.clear')}
        </button>
      </div>
    </div>
  );
};

export default SignaturePad;
