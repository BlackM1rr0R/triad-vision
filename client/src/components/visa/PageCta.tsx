import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Reveal } from '@/components/motion';
import { buttonClass } from '@/components/ui/Button';

/**
 * Closing call-to-action for the visa / service / Ausbildung pages. Each page passes its own copy.
 * Static decoration only (no continuous animation).
 */
export const PageCta = ({
  icon,
  title,
  text,
  primary,
  secondary,
}: {
  icon?: ReactNode;
  title: string;
  text: string;
  primary: { to: string; label: string };
  secondary?: { to: string; label: string };
}) => (
  <section className="pb-16 sm:pb-20 lg:pb-28">
    <div className="container-x">
      <Reveal>
        {/* The one dark band of the page: solid navy, the primary button turns amber inside it. */}
        <div className="rounded-3xl bg-navy-900 px-6 py-10 text-white sm:px-12 sm:py-14" data-on-dark>
          <div className="grid items-center gap-8 lg:grid-cols-[1fr_auto] lg:gap-12">
            <div className="flex gap-5">
              {icon && <span className="hidden size-14 shrink-0 place-items-center rounded-2xl bg-white/10 text-white sm:grid">{icon}</span>}
              <div>
                <h2 className="font-display text-2xl leading-tight font-semibold text-balance sm:text-[2rem]">{title}</h2>
                <p className="mt-3 max-w-[60ch] leading-relaxed text-white/80">{text}</p>
              </div>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row lg:flex-col xl:flex-row">
              <Link to={primary.to} className={buttonClass({ size: 'lg', className: 'w-full sm:w-auto' })}>
                {primary.label} <ArrowRight className="size-4" aria-hidden />
              </Link>
              {secondary && (
                <Link to={secondary.to} className="btn-outline btn-lg w-full sm:w-auto">
                  {secondary.label}
                </Link>
              )}
            </div>
          </div>
        </div>
      </Reveal>
    </div>
  </section>
);
