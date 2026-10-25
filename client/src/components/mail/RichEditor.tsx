import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { Bold, Italic, Link2, List, ListOrdered, Quote, RemoveFormatting, Underline } from 'lucide-react';

/**
 * Small contentEditable editor (bold/italic/underline/lists/link/quote) for composing mail. No
 * dependency; the server sanitises the html again before storing or sending.
 */
export interface RichEditorHandle {
  getHtml: () => string;
  setHtml: (html: string) => void;
  insertHtml: (html: string) => void;
  focus: () => void;
}

const Tool = ({ onClick, label, children }: { onClick: () => void; label: string; children: ReactNode }) => (
  <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={onClick} className="grid size-8 place-items-center rounded-md text-muted hover:bg-sunken hover:text-ink" title={label} aria-label={label}>
    {children}
  </button>
);

export const RichEditor = forwardRef<RichEditorHandle, { initialHtml: string; placeholder?: string; onChange?: () => void; onSend?: () => void; className?: string; autoFocus?: boolean }>(
  ({ initialHtml, placeholder, onChange, onSend, className, autoFocus }, ref) => {
    const { t } = useTranslation();
    const el = useRef<HTMLDivElement>(null);
    const initial = useRef(initialHtml);

    useEffect(() => {
      if (el.current && el.current.innerHTML !== initial.current) el.current.innerHTML = initial.current;
      if (autoFocus) el.current?.focus();
    }, [autoFocus]);

    const exec = useCallback(
      (cmd: string, value?: string) => {
        el.current?.focus();
        document.execCommand(cmd, false, value);
        onChange?.();
      },
      [onChange],
    );

    useImperativeHandle(ref, () => ({
      getHtml: () => el.current?.innerHTML ?? '',
      setHtml: (html) => {
        if (el.current) el.current.innerHTML = html;
        onChange?.();
      },
      insertHtml: (html) => {
        el.current?.focus();
        document.execCommand('insertHTML', false, html);
        onChange?.();
      },
      focus: () => el.current?.focus(),
    }));

    const link = () => {
      const url = window.prompt(t('mail.editor.linkPrompt'), 'https://');
      if (!url || !/^https?:\/\//i.test(url)) return;
      exec('createLink', url);
    };

    return (
      <div className={clsx('flex min-h-0 flex-col', className)}>
        <div className="flex shrink-0 flex-wrap items-center gap-0.5 border-b border-line px-1 py-0.5">
          <Tool onClick={() => exec('bold')} label={t('mail.editor.bold')}>
            <Bold className="size-4" />
          </Tool>
          <Tool onClick={() => exec('italic')} label={t('mail.editor.italic')}>
            <Italic className="size-4" />
          </Tool>
          <Tool onClick={() => exec('underline')} label={t('mail.editor.underline')}>
            <Underline className="size-4" />
          </Tool>
          <span className="mx-1 h-5 w-px bg-line" aria-hidden />
          <Tool onClick={() => exec('insertUnorderedList')} label={t('mail.editor.bullets')}>
            <List className="size-4" />
          </Tool>
          <Tool onClick={() => exec('insertOrderedList')} label={t('mail.editor.numbered')}>
            <ListOrdered className="size-4" />
          </Tool>
          <Tool onClick={() => exec('formatBlock', 'blockquote')} label={t('mail.editor.quote')}>
            <Quote className="size-4" />
          </Tool>
          <Tool onClick={link} label={t('mail.editor.link')}>
            <Link2 className="size-4" />
          </Tool>
          <Tool onClick={() => exec('removeFormat')} label={t('mail.editor.clear')}>
            <RemoveFormatting className="size-4" />
          </Tool>
        </div>
        <div
          ref={el}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          aria-label={placeholder}
          data-placeholder={placeholder}
          onInput={() => onChange?.()}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
              e.preventDefault();
              onSend?.();
            }
          }}
          onPaste={(e) => {
            // Paste as plain text (keeps styles of other apps out of the message).
            const text = e.clipboardData.getData('text/plain');
            if (text) {
              e.preventDefault();
              document.execCommand('insertText', false, text);
            }
          }}
          className="tv-editor min-h-[10rem] flex-1 overflow-y-auto px-3 py-2 text-sm leading-relaxed text-ink outline-none [&_a]:text-link [&_a]:underline [&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-line [&_blockquote]:pl-3 [&_blockquote]:text-muted [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6 empty:before:text-subtle empty:before:content-[attr(data-placeholder)]"
        />
      </div>
    );
  },
);
RichEditor.displayName = 'RichEditor';
