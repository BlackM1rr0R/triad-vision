import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, Printer, Square } from 'lucide-react';
import { Stagger, StaggerItem } from '@/components/motion';

/** While printing, everything except the print sheet is hidden. Scoped by a body class so normal printing is untouched. */
const PRINT_CSS = `
.tv-print-sheet{display:none}
@media print{
  body.tv-print-list > *:not(.tv-print-sheet){display:none !important}
  body.tv-print-list .tv-print-sheet{display:block !important;color:#0b1f44;font-family:Inter,system-ui,sans-serif}
  @page{margin:18mm}
}`;

export const CheckList = ({ items, columns = 1 }: { items: string[]; columns?: 1 | 2 }) => (
  <Stagger className={columns === 2 ? 'grid gap-3 sm:grid-cols-2' : 'grid gap-3'}>
    {items.map((it) => (
      <StaggerItem key={it}>
        <div className="flex h-full items-start gap-3 rounded-xl border border-line bg-card p-4">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
          <span className="text-sm leading-relaxed text-ink">{it}</span>
        </div>
      </StaggerItem>
    ))}
  </Stagger>
);

/** Document checklist with a "print" button that prints only a clean version of the list. */
export const PrintableChecklist = ({
  items,
  heading,
  subheading,
  note,
  printLabel,
}: {
  items: string[];
  heading: string;
  subheading: string;
  note: string;
  printLabel: string;
}) => {
  useEffect(() => {
    const done = () => document.body.classList.remove('tv-print-list');
    window.addEventListener('afterprint', done);
    return () => {
      window.removeEventListener('afterprint', done);
      done();
    };
  }, []);

  const print = () => {
    document.body.classList.add('tv-print-list');
    window.print();
    // Some browsers don't fire afterprint reliably; print() blocks until the dialog closes anyway.
    setTimeout(() => document.body.classList.remove('tv-print-list'), 500);
  };

  return (
    <>
      <style>{PRINT_CSS}</style>
      <ol className="grid gap-2.5 sm:grid-cols-2">
        {items.map((it, i) => (
          <li key={it} className="flex items-start gap-3 rounded-xl border border-line bg-card p-4">
            <span className="grid size-6 shrink-0 place-items-center rounded-md bg-sunken font-display text-xs font-semibold text-ink tabular-nums">{i + 1}</span>
            <span className="text-sm leading-relaxed text-ink">{it}</span>
          </li>
        ))}
      </ol>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted">{note}</p>
        <button type="button" onClick={print} className="btn-ghost btn-sm">
          <Printer className="size-4" /> {printLabel}
        </button>
      </div>
      {createPortal(
        <div className="tv-print-sheet" aria-hidden>
          <p
            style={{
              fontSize: 11,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: '#1565e8',
              fontWeight: 700,
            }}
          >
            Triad Vision · triad-vision.de
          </p>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: '6px 0 2px' }}>{heading}</h1>
          <p style={{ fontSize: 14, color: '#5b6b88', margin: '0 0 18px' }}>{subheading}</p>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {items.map((it) => (
              <li
                key={it}
                style={{
                  display: 'flex',
                  gap: 10,
                  alignItems: 'flex-start',
                  padding: '9px 0',
                  borderBottom: '1px solid #dfe7f3',
                  fontSize: 14,
                }}
              >
                <Square size={16} style={{ flexShrink: 0, marginTop: 2 }} />
                <span>{it}</span>
              </li>
            ))}
          </ul>
          <p style={{ fontSize: 11, color: '#5b6b88', marginTop: 16 }}>
            {note} · {new Date().toLocaleDateString()}
          </p>
        </div>,
        document.body,
      )}
    </>
  );
};
