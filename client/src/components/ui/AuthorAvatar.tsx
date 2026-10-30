import { useState } from 'react';
import clsx from 'clsx';

/** "Aysel Məmmədova" → "AM", "Namizəd A." → "NA", "" → "?". */
export const initialsOf = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0).toLocaleUpperCase())
    .join('') || '?';

/**
 * Round author photo of a testimonial (Testimonial.authorPhoto, CMS upload) with an initials fallback (no photo, or
 * the photo fails to load). Decorative: the name is always written next to it, so the image has an empty alt.
 */
export const AuthorAvatar = ({ name, photo, className, fallbackClassName }: { name: string; photo?: string | null; className?: string; fallbackClassName?: string }) => {
  const [broken, setBroken] = useState(false);
  if (photo && !broken) {
    return (
      <img
        src={photo}
        alt=""
        width={80}
        height={80}
        loading="lazy"
        decoding="async"
        onError={() => setBroken(true)}
        className={clsx('shrink-0 rounded-full object-cover', className)}
      />
    );
  }
  return (
    <span aria-hidden className={clsx('grid shrink-0 place-items-center rounded-full font-display text-sm font-bold', className, fallbackClassName)}>
      {initialsOf(name)}
    </span>
  );
};
