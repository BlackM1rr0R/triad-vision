/**
 * Anchors of portal-home cards that live in the folded "More" area (AccountHome): a link to one of them opens the area
 * first, so the card is mounted and the page scrolls to it (server links: lib/permits/service.ts → /account#permits).
 */
export const MORE_AREA_ANCHORS = ['permits'] as const;

/** Pure: does this location hash point at a card inside "More"? */
export const opensMoreArea = (hash: string) => (MORE_AREA_ANCHORS as readonly string[]).includes(decodeURIComponent(hash.replace(/^#/, '')));
