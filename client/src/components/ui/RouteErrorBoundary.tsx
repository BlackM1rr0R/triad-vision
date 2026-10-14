import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * Last line of defence for a route that throws while rendering or whose lazy chunk failed to load
 * (typically right after a deployment, when the old chunk names are gone). Without this the user
 * is left with a blank page; with it they get a one-click reload. A chunk error reloads by itself.
 */
export class RouteErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[route]', error, info.componentStack);
    if (isChunkError(error) && reloadOnce()) window.location.reload();
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="grid min-h-[70vh] place-items-center bg-white px-6 text-center">
        <div>
          <p className="font-display text-xl font-bold text-navy-900">Səhifə yüklənmədi · Page failed to load</p>
          <p className="mt-2 text-sm text-muted">Yenidən cəhd edin · Please try again</p>
          <button type="button" className="btn-primary mt-6" onClick={() => window.location.reload()}>
            Yenilə · Reload
          </button>
        </div>
      </div>
    );
  }
}

const isChunkError = (e: Error) => /Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk|preload/i.test(e.message);

/** Reloads at most once per minute so a genuinely broken deploy cannot loop forever. */
export const reloadOnce = () => {
  try {
    const last = Number(sessionStorage.getItem('tv_reload') ?? 0);
    if (Date.now() - last < 60_000) return false;
    sessionStorage.setItem('tv_reload', String(Date.now()));
    return true;
  } catch {
    return true;
  }
};
