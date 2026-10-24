import { Fragment, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Keyboard } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { pagesAdminUx } from '@/i18n/pagesAdminUx';
import { Modal } from '@/components/ui/Modal';
import { hasOpenOverlay } from '@/components/ui/overlay';
import { isMacPlatform, isTypingTarget } from '@/components/command/keys';
import { activeGroups, keyLabel, useShortcutGroups, useShortcuts, type ShortcutDef } from './registry';

registerCopy(pagesAdminUx);

/** A second key of a sequence ("g" then "c") must follow within this time. */
const SEQUENCE_MS = 1200;
const OPEN_EVENT = 'tv:shortcuts-open';

/** Opens the cheat sheet from a button (no shared context needed). */
export const openShortcutSheet = () => window.dispatchEvent(new Event(OPEN_EVENT));

const isInteractive = (target: EventTarget | null) => {
  const el = target as HTMLElement | null;
  return !!el?.closest?.('a[href], button, [role="button"], [role="tab"], [role="menuitem"], [role="option"], summary, label');
};

/** Normalised key of an event ("J" with Shift stays "J"; letters are lower-case otherwise). */
const eventKey = (e: KeyboardEvent) => (e.key.length === 1 && !e.shiftKey ? e.key.toLowerCase() : e.key);

const Kbd = ({ k }: { k: string }) => (
  <kbd className="inline-flex min-w-6 items-center justify-center rounded border border-line bg-surface px-1.5 py-0.5 font-sans text-[11px] leading-none font-semibold text-ink">{keyLabel(k)}</kbd>
);

const Keys = ({ keys }: { keys: string[] }) => {
  const { t } = useTranslation();
  return (
    <span className="inline-flex shrink-0 items-center gap-1">
      {keys.map((k, i) => (
        <Fragment key={`${k}-${i}`}>
          {i > 0 && <span className="text-[10px] text-muted">{t('ux.shortcuts.then')}</span>}
          <Kbd k={k} />
        </Fragment>
      ))}
    </span>
  );
};

const ShortcutSheet = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const { t } = useTranslation();
  const groups = useShortcutGroups();
  const global = groups.filter((g) => g.scope === 'global').flatMap((g) => g.defs);
  const pages = groups.filter((g) => g.scope === 'page' && g.defs.length);
  const mod = isMacPlatform() ? '⌘' : 'Ctrl';
  const Row = ({ d }: { d: Pick<ShortcutDef, 'keys' | 'labelKey'> }) => (
    <li className="flex items-center justify-between gap-4 py-1.5 text-sm">
      <span className="min-w-0 text-ink/90">{t(d.labelKey)}</span>
      <Keys keys={d.keys} />
    </li>
  );
  return (
    <Modal open={open} onClose={onClose} title={t('ux.shortcuts.title')} description={t('ux.shortcuts.subtitle')} icon={<Keyboard className="size-5 text-brand-600" aria-hidden />} size="lg">
      <div className="grid gap-6 sm:grid-cols-2">
        <section aria-labelledby="sc-global">
          <h3 id="sc-global" className="mb-1 text-[11px] font-semibold tracking-wide text-muted uppercase">
            {t('ux.shortcuts.global')}
          </h3>
          <ul className="divide-y divide-line">
            <li className="flex items-center justify-between gap-4 py-1.5 text-sm">
              <span className="min-w-0 text-ink/90">{t('ux.shortcuts.keys.palette')}</span>
              <span className="inline-flex items-center gap-1">
                <Kbd k={mod} />
                <Kbd k="k" />
              </span>
            </li>
            {global.map((d) => (
              <Row key={d.id} d={d} />
            ))}
          </ul>
        </section>
        {pages.map((g, i) => (
          <section key={i} aria-label={g.titleKey ? t(g.titleKey) : t('ux.shortcuts.page')}>
            <h3 className="mb-1 text-[11px] font-semibold tracking-wide text-muted uppercase">{g.titleKey ? t(g.titleKey) : t('ux.shortcuts.page')}</h3>
            <ul className="divide-y divide-line">
              {g.defs.map((d) => (
                <Row key={d.id} d={d} />
              ))}
            </ul>
          </section>
        ))}
      </div>
      <p className="mt-5 text-xs text-muted">{t('ux.shortcuts.typingHint')}</p>
    </Modal>
  );
};

/**
 * Global admin shortcut layer: `?` cheat sheet, `g` + c / i / t / d navigation, and the dispatcher for page
 * shortcuts registered with useShortcuts. Listens on document, so a page key such as "/" runs before the
 * Ctrl+K host (window listener), which skips events that were already handled.
 */
export const ShortcutLayer = () => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const pending = useRef<{ key: string; at: number } | null>(null);

  useShortcuts(
    [
      { id: 'help', keys: ['?'], labelKey: 'ux.shortcuts.keys.help', handler: () => setOpen(true) },
      { id: 'goCases', keys: ['g', 'c'], labelKey: 'ux.shortcuts.keys.goCases', handler: () => navigate('/admin/cases') },
      { id: 'goInquiries', keys: ['g', 'i'], labelKey: 'ux.shortcuts.keys.goInquiries', handler: () => navigate('/admin/inquiries') },
      { id: 'goToday', keys: ['g', 't'], labelKey: 'ux.shortcuts.keys.goToday', handler: () => navigate('/admin/today') },
      { id: 'goDashboard', keys: ['g', 'd'], labelKey: 'ux.shortcuts.keys.goDashboard', handler: () => navigate('/admin') },
    ],
    { scope: 'global' },
  );

  useEffect(() => {
    const show = () => setOpen(true);
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTypingTarget(e.target) || hasOpenOverlay()) return;
      const key = eventKey(e);
      if (key === 'Shift') return;
      // Newest registration first, page groups before the global one.
      const list = [...activeGroups()].reverse().sort((a, b) => (a.scope === b.scope ? 0 : a.scope === 'page' ? -1 : 1));
      const defs = list.flatMap((g) => g.defs.filter((d) => d.handler));
      const now = Date.now();
      const prefix = pending.current && now - pending.current.at < SEQUENCE_MS ? pending.current.key : null;
      pending.current = null;
      const interactive = isInteractive(e.target);
      const allowed = (d: ShortcutDef) => !interactive || d.overInteractive || key === 'Escape' || /^[a-z?]$/.test(key);
      if (prefix) {
        const seq = defs.find((d) => d.keys.length === 2 && d.keys[0] === prefix && d.keys[1] === key);
        if (seq) {
          e.preventDefault();
          seq.handler!(e);
          return;
        }
      }
      const single = defs.find((d) => d.keys.length === 1 && d.keys[0] === key && allowed(d));
      if (single) {
        e.preventDefault();
        single.handler!(e);
        return;
      }
      if (defs.some((d) => d.keys.length === 2 && d.keys[0] === key)) pending.current = { key, at: now };
    };
    window.addEventListener(OPEN_EVENT, show);
    document.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener(OPEN_EVENT, show);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  return <ShortcutSheet open={open} onClose={() => setOpen(false)} />;
};
