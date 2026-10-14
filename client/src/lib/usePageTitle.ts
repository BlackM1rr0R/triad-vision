import { useEffect } from 'react';

const DEFAULT_TITLE = 'Triad Vision';

/**
 * Sets `document.title` for the lifetime of a page ("<title> · Triad Vision") and restores the
 * previous title on unmount. Pass nothing (or an empty string) for the default site title.
 */
export const usePageTitle = (title?: string | null) => {
  useEffect(() => {
    const previous = document.title;
    document.title = title ? `${title} · ${DEFAULT_TITLE}` : DEFAULT_TITLE;
    return () => {
      document.title = previous;
    };
  }, [title]);
};
