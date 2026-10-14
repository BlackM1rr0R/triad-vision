import clsx from 'clsx';

export const Spinner = ({ className }: { className?: string }) => (
  <span className={clsx('inline-block size-5 animate-spin rounded-full border-2 border-current border-t-transparent', className)} />
);

export const PageLoader = () => (
  <div className="grid min-h-[50vh] place-items-center text-brand-600">
    <Spinner className="size-10 border-4" />
  </div>
);
