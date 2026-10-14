import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Magnetic, Reveal } from '@/components/motion';

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
        <div className="relative isolate overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 via-brand-700 to-navy-900 px-6 py-10 text-white sm:px-12 sm:py-14 lg:rounded-[2rem]">
          <svg aria-hidden className="absolute -top-24 -right-24 -z-10 size-[420px] text-white/10" viewBox="0 0 200 200" fill="none">
            {[30, 50, 70, 90].map((r) => (
              <circle key={r} cx="100" cy="100" r={r} stroke="currentColor" strokeWidth="1" />
            ))}
          </svg>
          <div className="absolute inset-0 -z-10 opacity-[0.07] [background-image:linear-gradient(white_1px,transparent_1px),linear-gradient(90deg,white_1px,transparent_1px)] [background-size:32px_32px]" />
          <div className="grid items-center gap-8 lg:grid-cols-[1fr_auto] lg:gap-12">
            <div className="flex gap-5">
              {icon && <span className="hidden size-14 shrink-0 place-items-center rounded-2xl bg-white/15 sm:grid">{icon}</span>}
              <div>
                <h2 className="font-display text-2xl leading-tight font-extrabold text-balance sm:text-[2rem]">{title}</h2>
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/80 sm:text-base">{text}</p>
              </div>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row lg:flex-col xl:flex-row">
              <Magnetic className="w-full sm:w-auto">
                <Link to={primary.to} className="btn-white group w-full px-6 py-3.5 sm:w-auto">
                  {primary.label} <ArrowRight className="size-4 transition group-hover:translate-x-1" />
                </Link>
              </Magnetic>
              {secondary && (
                <Link to={secondary.to} className="btn-outline w-full px-6 py-3.5 sm:w-auto">
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
