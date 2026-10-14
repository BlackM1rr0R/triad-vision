import {
  Award,
  Briefcase,
  ChefHat,
  Circle,
  Clock,
  Factory,
  GraduationCap,
  HardHat,
  HeartPulse,
  Languages,
  Laptop,
  Package,
  Plane,
  ShieldCheck,
  Sprout,
  Stamp,
  Truck,
  Users,
  UserSearch,
  type LucideProps,
} from '@/components/icons';
import type { ComponentType } from 'react';

/**
 * CMS records store lucide icon names (e.g. "Truck"). Only the icons used by the content are bundled
 * instead of the full lucide set; unknown names fall back to a neutral icon.
 */
const ICONS: Record<string, ComponentType<LucideProps>> = {
  Award,
  Briefcase,
  ChefHat,
  Clock,
  Factory,
  GraduationCap,
  HardHat,
  HeartPulse,
  Languages,
  Laptop,
  Package,
  Plane,
  ShieldCheck,
  Sprout,
  Stamp,
  Truck,
  Users,
  UserSearch,
};

export const CmsIcon = ({ name, ...props }: { name: string } & LucideProps) => {
  const Cmp = ICONS[name] ?? Circle;
  return <Cmp {...props} />;
};
