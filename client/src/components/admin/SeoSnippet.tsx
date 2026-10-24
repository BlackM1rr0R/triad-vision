import clsx from 'clsx';

/** "12 / 60" counter that turns amber near and red over the recommended length. */
export const CharCount = ({ value, max, label }: { value: string; max: number; label?: (count: number, max: number) => string }) => {
  const n = value.trim().length;
  return (
    <span className={clsx('text-[11px] tabular-nums', n > max ? 'font-semibold text-red-600' : n > max * 0.9 ? 'text-amber-600' : 'text-muted')}>
      {label ? label(n, max) : `${n} / ${max}`}
    </span>
  );
};

const cut = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1).replace(/\s+\S*$/, '')}…` : s);

/** Google-like search result preview (title ~60 characters, description ~155). */
export const SeoSnippet = ({ title, description, url, caption }: { title: string; description: string; url: string; caption?: string }) => {
  let host = url;
  try {
    const u = new URL(url, window.location.origin);
    host = `${u.host}${u.pathname === '/' ? '' : u.pathname.split('/').filter(Boolean).map((p) => ` › ${decodeURIComponent(p)}`).join('')}`;
  } catch {
    /* keep raw */
  }
  return (
    <figure className="rounded-xl border border-line bg-white p-4 font-[Arial,sans-serif] dark:bg-white">
      {caption && <figcaption className="mb-2 text-[11px] font-semibold text-muted">{caption}</figcaption>}
      <p className="truncate text-xs text-[#202124]">{host}</p>
      <p className="mt-1 text-lg leading-snug text-[#1a0dab]">{cut(title || '—', 62)}</p>
      <p className="mt-1 text-sm leading-snug text-[#4d5156]">{cut(description || '—', 158)}</p>
    </figure>
  );
};
