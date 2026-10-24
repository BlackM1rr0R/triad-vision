import { SearchButton } from '../search/SearchPalette';

/**
 * Search position of the public header (desktop bar, tablet/phone bar): the smart site search trigger. The
 * button (and Ctrl/Cmd+K, "/") opens the search dialog (components/search/SearchDialog.tsx: server index of
 * guides, visas, jobs, events, tools … with typo tolerance and cross-language synonyms; "all results" → /search).
 * `light`: the header floats transparent over a dark hero (white icon); otherwise it is solid (dark icon).
 */
export const HeaderSearchSlot = ({ light = false, className }: { light?: boolean; className?: string }) => <SearchButton light={light} className={className} />;
