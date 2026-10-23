/** Keyboard helpers shared by the palette host and dialog. */

export const isMacPlatform = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** Focus is in a text field / editor: single-key shortcuts ("/") must not fire. */
export const isTypingTarget = (target: EventTarget | null) => {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || !!el.closest('[contenteditable="true"], [role="textbox"]');
};
