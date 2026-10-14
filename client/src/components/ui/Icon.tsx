import {
  Award,
  Baby,
  BadgeCheck,
  BookOpen,
  Briefcase,
  BriefcaseBusiness,
  Building,
  Building2,
  Bus,
  Calculator,
  Calendar,
  Car,
  ChefHat,
  Circle,
  CircleCheck,
  CircleHelp,
  Clock,
  Code,
  Cpu,
  Factory,
  FileCheck2,
  Forklift,
  Globe,
  GraduationCap,
  Hammer,
  Handshake,
  HardHat,
  Heart,
  HeartPulse,
  Hotel,
  House,
  Languages,
  Laptop,
  Layers,
  Leaf,
  LogIn,
  Mail,
  MapPin,
  MessageCircle,
  Newspaper,
  Package,
  Paintbrush,
  Phone,
  Plane,
  Scale,
  Search,
  ShieldCheck,
  Sparkles,
  Sprout,
  Stamp,
  Star,
  Stethoscope,
  Tractor,
  Truck,
  UserPlus,
  UserSearch,
  Users,
  UtensilsCrossed,
  Warehouse,
  Wrench,
  Zap,
  type LucideIcon,
  type LucideProps,
} from 'lucide-react';

/**
 * Icons that CMS content may reference by name. Importing lucide's full `icons` map would ship
 * ~1500 icons (≈700 KB) to every visitor, so only this curated set is bundled.
 */
const REGISTRY: Record<string, LucideIcon> = {
  Award, Baby, BadgeCheck, BookOpen, Briefcase, BriefcaseBusiness, Building, Building2, Bus, Calculator, Calendar, Car,
  ChefHat, Circle, CircleCheck, CircleHelp, Clock, Code, Cpu, Factory, FileCheck2, Forklift, Globe, GraduationCap,
  Hammer, Handshake, HardHat, Heart, HeartPulse, Hotel, House, Languages, Laptop, Layers, Leaf, LogIn, Mail, MapPin,
  MessageCircle, Newspaper, Package, Paintbrush, Phone, Plane, Scale, Search, ShieldCheck, Sparkles, Sprout, Stamp,
  Star, Stethoscope, Tractor, Truck, UserPlus, UserSearch, Users, UtensilsCrossed, Warehouse, Wrench, Zap,
};

export const ICON_NAMES = Object.keys(REGISTRY).sort();
export const hasIcon = (name: string) => name in REGISTRY;

/** Renders a CMS icon by its PascalCase lucide name, with a neutral fallback for unknown names. */
export const Icon = ({ name, ...props }: { name: string } & LucideProps) => {
  const Cmp = REGISTRY[name] ?? Circle;
  return <Cmp {...props} />;
};
