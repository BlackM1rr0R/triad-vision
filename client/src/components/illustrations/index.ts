/*
 * Illustration set (Direction B, "warm human"): small inline SVGs painted with the --ill-* tokens (index.css),
 * so they follow the light and dark theme. Decorative (aria-hidden) unless a `title` is passed.
 * Use them where they help: the hero, "who are you?" cards, the next-step card, empty states, success and
 * error screens. Size them with a width class (they scale by their viewBox).
 *
 *   <EmptyState illustration={<EmptyInbox />} title="No messages yet" />
 *   <Traveller className="w-full max-w-md" animated />
 */
export type { IllustrationProps } from './Svg';
export { Traveller } from './Traveller';
export { Worker } from './Worker';
export { Employer } from './Employer';
export { Documents } from './Documents';
export { PassportUpload } from './PassportUpload';
export { Germany } from './Germany';
export { Success } from './Success';
export { EmptyInbox } from './EmptyInbox';
export { SearchEmpty } from './SearchEmpty';
export { Lost } from './Lost';
export { CalendarDay } from './CalendarDay';
export { Learning } from './Learning';
export { Handshake } from './Handshake';
