import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bold, Heading, Italic, Link2, List, type LucideIcon } from 'lucide-react';

export const PLACEHOLDERS = ['firstName', 'lastName', 'caseNumber', 'appointmentDate'] as const;

/**
 * Textarea with basic formatting (the server renders the same small syntax): **bold**, *italic*,
 * [text](https://…), "- " lists, "## " headings, plus a placeholder picker that inserts {{…}} at the cursor.
 */
export const RichTextArea = ({
  id,
  value,
  onChange,
  rows = 10,
  allowedHosts,
  maxLength = 20_000,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  allowedHosts?: string[];
  maxLength?: number;
}) => {
  const { t } = useTranslation();
  const ref = useRef<HTMLTextAreaElement>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [url, setUrl] = useState('https://');

  const apply = (fn: (sel: string) => { text: string; caret?: number }, block = false) => {
    const el = ref.current;
    if (!el) return;
    let start = el.selectionStart;
    const end = el.selectionEnd;
    if (block) start = value.lastIndexOf('\n', start - 1) + 1;
    const { text, caret } = fn(value.slice(start, end));
    const next = value.slice(0, start) + text + value.slice(end);
    onChange(next.slice(0, maxLength));
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + (caret ?? text.length);
      el.setSelectionRange(pos, pos);
    });
  };

  const wrap = (mark: string) => apply((sel) => ({ text: `${mark}${sel || '…'}${mark}`, caret: sel ? undefined : mark.length + 1 }));
  const prefixLines = (prefix: string) => apply((sel) => ({ text: (sel || '').split('\n').map((l) => `${prefix}${l.replace(/^(- |## )/, '')}`).join('\n') }), true);
  const insertLink = () => {
    const u = url.trim();
    if (!/^https?:\/\/\S+$/.test(u)) return;
    apply((sel) => ({ text: `[${sel || u}](${u})` }));
    setLinkOpen(false);
    setUrl('https://');
  };

  const tool = (icon: LucideIcon, label: string, onClick: () => void) => {
    const Icon = icon;
    return (
      <button type="button" title={label} aria-label={label} onClick={onClick} className="grid size-9 place-items-center rounded-md text-ink/70 hover:bg-surface hover:text-navy-900">
        <Icon className="size-4" aria-hidden />
      </button>
    );
  };

  return (
    <div className="rounded-lg border border-line bg-field focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-500/15">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-line px-1.5 py-1" role="toolbar" aria-controls={id}>
        {tool(Bold, t('campaigns.wizard.toolbar.bold'), () => wrap('**'))}
        {tool(Italic, t('campaigns.wizard.toolbar.italic'), () => wrap('*'))}
        {tool(Link2, t('campaigns.wizard.toolbar.link'), () => setLinkOpen((v) => !v))}
        {tool(List, t('campaigns.wizard.toolbar.list'), () => prefixLines('- '))}
        {tool(Heading, t('campaigns.wizard.toolbar.heading'), () => prefixLines('## '))}
        <span className="mx-1 h-5 w-px bg-line" aria-hidden />
        <select
          className="min-h-9 rounded-md border-0 bg-transparent px-1.5 text-xs font-semibold text-brand-700 outline-none"
          value=""
          aria-label={t('campaigns.wizard.placeholders')}
          onChange={(e) => {
            const k = e.target.value;
            if (k) apply(() => ({ text: `{{${k}}}` }));
          }}
        >
          <option value="">{`{{ }} ${t('campaigns.wizard.placeholders')}`}</option>
          {PLACEHOLDERS.map((p) => (
            <option key={p} value={p}>
              {t(`campaigns.wizard.ph.${p}`)} — {`{{${p}}}`}
            </option>
          ))}
        </select>
      </div>
      {linkOpen && (
        <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface px-2 py-2">
          <input
            className="input min-w-0 flex-1 py-1.5"
            aria-label={t('campaigns.wizard.linkUrl')}
            placeholder={t('campaigns.wizard.linkUrl')}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                insertLink();
              }
            }}
          />
          <button type="button" className="btn-primary btn-sm" onClick={insertLink}>
            OK
          </button>
          {allowedHosts?.length ? <p className="w-full text-[11px] text-muted">{t('campaigns.wizard.linkHosts', { hosts: allowedHosts.join(', ') })}</p> : null}
        </div>
      )}
      <textarea
        id={id}
        ref={ref}
        rows={rows}
        maxLength={maxLength}
        className="block w-full resize-y rounded-b-lg bg-transparent px-3.5 py-2.5 font-mono text-sm leading-relaxed text-ink outline-none"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
};
