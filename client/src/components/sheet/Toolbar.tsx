import { memo, useCallback, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { AlignCenter, AlignLeft, AlignRight, ArrowDownAZ, ArrowUpAZ, Baseline, Bold, ChevronDown, Italic, PaintBucket, Snowflake, Underline, WrapText } from 'lucide-react';
import { NUMBER_FORMATS } from './format';
import type { CellStyle, Pos } from './model';
import { Popover } from './Popups';
import { Sep, ToolButton } from './Grid';

const PALETTE = [
  '#000000', '#434343', '#666666', '#999999', '#CCCCCC', '#FFFFFF',
  '#C00000', '#FF0000', '#FFC000', '#FFFF00', '#92D050', '#00B050',
  '#00B0F0', '#0070C0', '#002060', '#7030A0', '#F4B084', '#FCE4D6',
  '#FFF2CC', '#E2EFDA', '#DDEBF7', '#D9E1F2', '#EDE7F6', '#F2F2F2',
];

function ColorButton({ label, icon, value, onPick }: { label: string; icon: ReactNode; value?: string; onPick: (c: string | undefined) => void }) {
  const { t } = useTranslation();
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  return (
    <>
      <ToolButton
        label={label}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setAt(at ? null : { x: r.left, y: r.bottom + 4 });
        }}
      >
        <span className="flex flex-col items-center">
          {icon}
          <span className="mt-0.5 h-1 w-4 rounded-sm border border-line" style={{ background: value ?? 'transparent' }} />
        </span>
      </ToolButton>
      {at && (
        <Popover x={at.x} y={at.y} onClose={() => setAt(null)}>
          <div className="grid grid-cols-6 gap-1">
            {PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                title={c}
                aria-label={c}
                onClick={() => {
                  onPick(c);
                  setAt(null);
                }}
                className={clsx('h-6 w-6 rounded border border-line', value === c && 'ring-2 ring-brand-500')}
                style={{ background: c }}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              onPick(undefined);
              setAt(null);
            }}
            className="mt-2 w-full rounded-md px-2 py-1 text-xs font-semibold text-muted hover:bg-surface"
          >
            {t('sheet.format.noColor')}
          </button>
        </Popover>
      )}
    </>
  );
}

function FormatPicker({ value, onPick }: { value?: string; onPick: (fmt: string | undefined) => void }) {
  const { t } = useTranslation();
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const current = NUMBER_FORMATS.find((f) => f.fmt === value);
  return (
    <>
      <button
        type="button"
        title={t('sheet.format.numberFormat')}
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setAt(at ? null : { x: r.left, y: r.bottom + 4 });
        }}
        className="flex h-8 items-center gap-1 rounded-md px-2 text-xs font-semibold text-ink/80 hover:bg-surface"
      >
        <span className="max-w-24 truncate">{current ? t(`sheet.format.fmt.${current.key}`) : value ? value : t('sheet.format.fmt.general')}</span>
        <ChevronDown size={13} />
      </button>
      {at && (
        <Popover x={at.x} y={at.y} onClose={() => setAt(null)} className="w-60">
          {NUMBER_FORMATS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => {
                onPick(f.fmt);
                setAt(null);
              }}
              className={clsx('flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface', f.fmt === value && 'font-semibold text-brand-600')}
            >
              <span>{t(`sheet.format.fmt.${f.key}`)}</span>
              <span className="code-id text-[11px] text-muted">{f.fmt ?? ''}</span>
            </button>
          ))}
        </Popover>
      )}
    </>
  );
}

interface FormatBarProps {
  style: CellStyle | undefined;
  active: Pos | null;
  cells: () => Pos[];
  onFormat: (cells: Pos[], patch: Partial<CellStyle>) => void;
  frozen: boolean;
  onToggleFreeze: () => void;
  onSort: (c: number, dir: 'asc' | 'desc') => void;
  disabled?: boolean;
}

/**
 * Formatting controls of the .xlsx editor (bold … number format, freeze, sort). The callbacks read the
 * latest props through a ref, so the controls only re-render when the active cell's style changes —
 * not on every cursor move.
 */
export function FormatBar(props: FormatBarProps) {
  const latest = useRef(props);
  latest.current = props;
  const set = useCallback((patch: Partial<CellStyle>) => latest.current.onFormat(latest.current.cells(), patch), []);
  const sort = useCallback((dir: 'asc' | 'desc') => {
    const a = latest.current.active;
    if (a) latest.current.onSort(a.c, dir);
  }, []);
  const freeze = useCallback(() => latest.current.onToggleFreeze(), []);
  if (props.disabled) return null;
  return <FormatControls style={props.style} hasActive={!!props.active} frozen={props.frozen} set={set} sort={sort} freeze={freeze} />;
}

const FormatControls = memo(function FormatControls({
  style,
  hasActive,
  frozen,
  set,
  sort,
  freeze,
}: {
  style: CellStyle | undefined;
  hasActive: boolean;
  frozen: boolean;
  set: (patch: Partial<CellStyle>) => void;
  sort: (dir: 'asc' | 'desc') => void;
  freeze: () => void;
}) {
  const { t } = useTranslation();
  const s = style ?? {};
  return (
    <>
      <ToolButton label={t('sheet.format.bold')} shortcut="Ctrl+B" active={!!s.b} onClick={() => set({ b: !s.b })}>
        <Bold size={16} />
      </ToolButton>
      <ToolButton label={t('sheet.format.italic')} shortcut="Ctrl+I" active={!!s.i} onClick={() => set({ i: !s.i })}>
        <Italic size={16} />
      </ToolButton>
      <ToolButton label={t('sheet.format.underline')} shortcut="Ctrl+U" active={!!s.u} onClick={() => set({ u: !s.u })}>
        <Underline size={16} />
      </ToolButton>
      <ColorButton label={t('sheet.format.textColor')} icon={<Baseline size={15} />} value={s.color} onPick={(color) => set({ color })} />
      <ColorButton label={t('sheet.format.fillColor')} icon={<PaintBucket size={15} />} value={s.fill} onPick={(fill) => set({ fill })} />
      <Sep />
      <ToolButton label={t('sheet.format.alignLeft')} active={s.align === 'left'} onClick={() => set({ align: s.align === 'left' ? undefined : 'left' })}>
        <AlignLeft size={16} />
      </ToolButton>
      <ToolButton label={t('sheet.format.alignCenter')} active={s.align === 'center'} onClick={() => set({ align: s.align === 'center' ? undefined : 'center' })}>
        <AlignCenter size={16} />
      </ToolButton>
      <ToolButton label={t('sheet.format.alignRight')} active={s.align === 'right'} onClick={() => set({ align: s.align === 'right' ? undefined : 'right' })}>
        <AlignRight size={16} />
      </ToolButton>
      <ToolButton label={t('sheet.format.wrap')} active={!!s.wrap} onClick={() => set({ wrap: !s.wrap })}>
        <WrapText size={16} />
      </ToolButton>
      <FormatPicker value={s.numFmt} onPick={(numFmt) => set({ numFmt })} />
      <Sep />
      <ToolButton label={t('sheet.freezeFirstRow')} active={frozen} onClick={freeze}>
        <Snowflake size={16} />
      </ToolButton>
      <ToolButton label={t('sheet.sortAsc')} disabled={!hasActive} onClick={() => sort('asc')}>
        <ArrowDownAZ size={16} />
      </ToolButton>
      <ToolButton label={t('sheet.sortDesc')} disabled={!hasActive} onClick={() => sort('desc')}>
        <ArrowUpAZ size={16} />
      </ToolButton>
      <Sep />
    </>
  );
});
