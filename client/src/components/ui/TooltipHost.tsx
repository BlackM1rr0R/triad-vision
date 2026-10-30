import { useEffect } from 'react';

/**
 * Fast tooltips for every button / link with a `title` (or a `data-tooltip`) on every surface.
 *
 * The browser's native title tooltip appears only after ~1 s and cannot be styled. This host (mounted once
 * in main.tsx) listens on the document: hovering a matching control for 200 ms, or focusing it with the
 * keyboard, shows one small chip next to it (fixed position, so `overflow-hidden` parents do not clip it).
 * While the chip is visible the `title` attribute is parked in `data-tv-title` so the native tooltip does
 * not appear on top; it is put back when the pointer leaves. Moving from one control to the next while a
 * chip is up shows the next one at once. Escape, a click, scrolling and touch input hide it.
 *
 * Icon-only buttons keep their aria-label (the accessible name); the chip is only the visual hint.
 * Use `data-tooltip="…"` for a hint without a native title, `data-tooltip=""` / `data-no-tooltip` to opt out.
 */
const SELECTOR = 'button[title], a[title], [role="button"][title], [role="menuitem"][title], [role="tab"][title], summary[title], [data-tooltip], [data-tv-title]';
const SHOW_DELAY = 200;
/** After a chip was visible, the next one within this window shows without delay. */
const WARM_WINDOW = 600;
const GAP = 6;
const MARGIN = 8;

const CHIP_CLASS =
  'pointer-events-none fixed top-0 left-0 z-[200] w-max max-w-64 rounded-md bg-ink px-2 py-1 text-xs leading-snug font-medium text-canvas shadow-[var(--tv-shadow-raised)] transition-opacity duration-100 motion-reduce:transition-none';

const textOf = (el: HTMLElement) => (el.dataset.tooltip ?? el.getAttribute('title') ?? el.dataset.tvTitle ?? '').trim();

const findTarget = (node: EventTarget | null): HTMLElement | null => {
  if (!(node instanceof Element)) return null;
  const el = node.closest<HTMLElement>(SELECTOR);
  if (!el || el.hasAttribute('data-no-tooltip') || el.dataset.tooltip === '') return null;
  return textOf(el) ? el : null;
};

export const TooltipHost = () => {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const chip = document.createElement('div');
    chip.setAttribute('role', 'tooltip');
    chip.id = 'tv-tooltip';
    chip.className = CHIP_CLASS;
    chip.style.opacity = '0';
    chip.style.visibility = 'hidden';
    document.body.appendChild(chip);

    let current: HTMLElement | null = null;
    let timer: number | undefined;
    let lastHidden = 0;
    let lastPointerType = 'mouse';

    const restoreTitle = (el: HTMLElement) => {
      const parked = el.dataset.tvTitle;
      if (parked === undefined) return;
      // React may have set a new title meanwhile: keep that one
      if (!el.hasAttribute('title')) el.setAttribute('title', parked);
      delete el.dataset.tvTitle;
      if (el.dataset.tvLabel !== undefined) {
        el.removeAttribute('aria-label');
        delete el.dataset.tvLabel;
      }
    };

    const place = (el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      const c = chip.getBoundingClientRect();
      const vw = document.documentElement.clientWidth;
      let top = r.top - c.height - GAP;
      if (top < MARGIN) top = r.bottom + GAP; // no room above: below
      let left = r.left + r.width / 2 - c.width / 2;
      left = Math.max(MARGIN, Math.min(left, vw - c.width - MARGIN));
      chip.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
    };

    const show = (el: HTMLElement) => {
      if (!el.isConnected) return;
      const text = textOf(el);
      if (!text) return;
      const title = el.getAttribute('title');
      if (title !== null) {
        el.dataset.tvTitle = title;
        // the title was the only accessible name (no aria-label, no text): keep it as aria-label meanwhile
        if (!el.hasAttribute('aria-label') && !el.hasAttribute('aria-labelledby') && !el.textContent?.trim()) {
          el.setAttribute('aria-label', title);
          el.dataset.tvLabel = '';
        }
        el.removeAttribute('title');
      }
      chip.textContent = text;
      chip.style.visibility = 'visible';
      place(el);
      chip.style.opacity = '1';
    };

    /** Hides the chip but keeps the title parked until the pointer leaves (no native tooltip right after a click). */
    const dismiss = () => {
      window.clearTimeout(timer);
      timer = undefined;
      if (chip.style.visibility === 'visible') lastHidden = Date.now();
      chip.style.opacity = '0';
      chip.style.visibility = 'hidden';
    };

    const hide = () => {
      window.clearTimeout(timer);
      timer = undefined;
      if (current) {
        restoreTitle(current);
        if (chip.style.visibility === 'visible') lastHidden = Date.now();
      }
      current = null;
      chip.style.opacity = '0';
      chip.style.visibility = 'hidden';
    };

    const schedule = (el: HTMLElement, immediate: boolean) => {
      if (current === el) return;
      hide();
      current = el;
      if (immediate || Date.now() - lastHidden < WARM_WINDOW) show(el);
      else timer = window.setTimeout(() => current === el && show(el), SHOW_DELAY);
    };

    const onOver = (e: PointerEvent) => {
      lastPointerType = e.pointerType;
      if (e.pointerType === 'touch') return;
      const el = findTarget(e.target);
      if (el) schedule(el, false);
      else if (current && !current.contains(e.target as Node)) hide();
    };
    const onOut = (e: PointerEvent) => {
      if (!current) return;
      const to = e.relatedTarget as Node | null;
      if (to && current.contains(to)) return;
      if (findTarget(to) === current) return;
      if (document.activeElement === current && current.matches(':focus-visible')) return;
      hide();
    };
    const onFocusIn = (e: FocusEvent) => {
      const el = findTarget(e.target);
      if (!el || lastPointerType === 'touch') return;
      // keyboard focus only (a mouse click focuses too; hover already handles that case)
      if (!el.matches(':focus-visible')) return;
      schedule(el, false);
    };
    const onFocusOut = (e: FocusEvent) => {
      if (current && e.target === current) hide();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Tab') lastPointerType = 'keyboard';
      if (e.key === 'Escape' && current && chip.style.visibility === 'visible') dismiss();
    };
    const onDown = (e: PointerEvent) => {
      lastPointerType = e.pointerType;
      dismiss();
    };

    document.addEventListener('pointerover', onOver, true);
    document.addEventListener('pointerout', onOut, true);
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('focusin', onFocusIn, true);
    document.addEventListener('focusout', onFocusOut, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('scroll', dismiss, true);
    window.addEventListener('blur', hide);
    return () => {
      hide();
      document.removeEventListener('pointerover', onOver, true);
      document.removeEventListener('pointerout', onOut, true);
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('focusin', onFocusIn, true);
      document.removeEventListener('focusout', onFocusOut, true);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('scroll', dismiss, true);
      window.removeEventListener('blur', hide);
      chip.remove();
    };
  }, []);
  return null;
};
