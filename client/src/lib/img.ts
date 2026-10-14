/**
 * Requests an image at the size it is actually displayed. Unsplash (and our seed data) bake
 * `w=1200` into URLs; a 300px card doesn't need that. Non-Unsplash URLs are returned unchanged.
 */
export const sized = (url: string, width: number) => {
  if (!url.includes('images.unsplash.com')) return url;
  const u = new URL(url);
  u.searchParams.set('w', String(width));
  u.searchParams.set('auto', 'format');
  u.searchParams.set('q', u.searchParams.get('q') ?? '70');
  return u.toString();
};

/** srcSet for responsive <img>: browser picks the smallest that is sharp on the current screen. */
export const srcSet = (url: string, widths: number[]) =>
  url.includes('images.unsplash.com') ? widths.map((w) => `${sized(url, w)} ${w}w`).join(', ') : undefined;
