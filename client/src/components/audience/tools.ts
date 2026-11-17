import {
  BadgeEuro,
  Building,
  CalendarClock,
  CalendarRange,
  ReceiptText,
  CalendarDays,
  Calculator,
  ClipboardCheck,
  Compass,
  Car,
  Landmark,
  Users,
  MapPin,
  CreditCard,
  GraduationCap,
  HeartHandshake,
  HeartPulse,
  Smartphone,
  Map as MapIcon,
  MapPinned,
  BookA,
  BookOpen,
  Briefcase,
  Scale,
  ScanSearch,
  Sparkles,
  PiggyBank,
  WalletCards,
  HandCoins,
  Moon,
  Truck,
  ClipboardList,
  Percent,
  Building2,
  House,
  PartyPopper,
  TrainFront,
  Flag,
  School,
  Sofa,
  IdCard,
  Gauge,
  Mic,
  Coins,
  Recycle,
  TriangleAlert,
  MessagesSquare,
  type LucideIcon,
  HardHat,
  Globe2,
  ListChecks,
  FileWarning,
  Store,
  Ticket,
  ShoppingCart,
  KeyRound,
  Send,
  Hourglass,
} from 'lucide-react';

/**
 * Every public tool of the site, in the groups of the /tools page. Also used by the worker landing page and
 * the header menus. Titles and descriptions: pagesAudience copy (toolsPage.items.<key>).
 * Mirrors TOOL_GROUPS in server/src/lib/seoCatalogue.ts (crawlable /tools body, breadcrumbs, tool analytics).
 * Task-based groups: am I eligible? · money & taxes · plan the move · life in Germany · learn German · for
 * employers · explore. Tags, keywords and the featured row: components/tools/hub/toolMeta.ts.
 */
export type ToolGroup = 'eligibility' | 'costs' | 'plan' | 'life' | 'learn' | 'employers' | 'explore';

export interface ToolItem {
  key: string;
  to: string;
  icon: LucideIcon;
  group: ToolGroup;
}

export const TOOL_GROUPS: ToolGroup[] = ['eligibility', 'costs', 'plan', 'life', 'learn', 'employers', 'explore'];

export const TOOLS: ToolItem[] = [
  { key: 'pathFinder', to: '/path-finder', icon: Compass, group: 'eligibility' },
  { key: 'quiz', to: '/uygunluq-testi', icon: Sparkles, group: 'eligibility' },
  { key: 'visaCheck', to: '/eligibility', icon: ClipboardCheck, group: 'eligibility' },
  { key: 'compare', to: '/compare-visas', icon: Scale, group: 'eligibility' },
  { key: 'blueCard', to: '/blue-card-check', icon: CreditCard, group: 'eligibility' },
  { key: 'chancenkarte', to: '/chancenkarte-calculator', icon: Calculator, group: 'eligibility' },
  { key: 'anerkennung', to: '/anerkennung', icon: GraduationCap, group: 'eligibility' },
  { key: 'familyCheck', to: '/family-reunification-check', icon: Users, group: 'eligibility' },
  { key: 'countryCompare', to: '/germany-vs-other-countries', icon: Globe2, group: 'eligibility' },
  { key: 'visaChecklist', to: '/visa-document-checklist', icon: ListChecks, group: 'eligibility' },
  { key: 'visaRefusal', to: '/visa-refusal', icon: FileWarning, group: 'eligibility' },
  { key: 'gradeConverter', to: '/grade-converter', icon: School, group: 'eligibility' },
  { key: 'salary', to: '/salary-calculator', icon: BadgeEuro, group: 'costs' },
  { key: 'cost', to: '/cost-calculator', icon: WalletCards, group: 'costs' },
  { key: 'budget', to: '/budget', icon: PiggyBank, group: 'costs' },
  { key: 'life', to: '/life-in-germany', icon: HeartHandshake, group: 'life' },
  { key: 'payslip', to: '/payslip-explained', icon: ReceiptText, group: 'costs' },
  { key: 'taxRefund', to: '/tax-refund-calculator', icon: HandCoins, group: 'costs' },
  { key: 'shiftPay', to: '/shift-pay-calculator', icon: Moon, group: 'costs' },
  { key: 'taxClass', to: '/tax-class-chooser', icon: Percent, group: 'costs' },
  { key: 'employerCost', to: '/employer-cost-calculator', icon: Building2, group: 'employers' },
  { key: 'rentCheck', to: '/rent-check', icon: House, group: 'costs' },
  { key: 'sendMoneyHome', to: '/send-money-home', icon: Send, group: 'costs' }, // money for family (remittance) calculator
  { key: 'realSalaries', to: '/real-salaries', icon: BadgeEuro, group: 'costs' }, // contract salaries of placed workers (k-anonymous ranges)
  { key: 'healthInsurance', to: '/health-insurance-comparison', icon: HeartPulse, group: 'costs' },
  { key: 'whenInGermany', to: '/when-in-germany', icon: CalendarRange, group: 'plan' },
  { key: 'permanentResidence', to: '/permanent-residence', icon: Landmark, group: 'plan' },
  { key: 'fiveYears', to: '/five-years-in-germany', icon: Hourglass, group: 'plan' }, // 5-year time machine (salary, savings, residence milestones)
  { key: 'whichCity', to: '/which-city', icon: MapPin, group: 'plan' },
  { key: 'drivingLicence', to: '/driving-licence-germany', icon: Car, group: 'life' },
  { key: 'germanApartment', to: '/german-apartment', icon: Sofa, group: 'life' },
  { key: 'apartmentViewing', to: '/apartment-viewing', icon: KeyRound, group: 'life' }, // viewing simulator + Mieterselbstauskunft generator
  { key: 'germanStreet', to: '/german-street', icon: Store, group: 'life' }, // virtual street: hub of the games and scenes (pages/games/GermanStreet)
  { key: 'residenceCard', to: '/residence-card-explained', icon: IdCard, group: 'plan' },
  { key: 'startDate', to: '/calculator', icon: CalendarClock, group: 'plan' },
  { key: 'cities', to: '/cities', icon: Building, group: 'plan' },
  { key: 'holidayPlanner', to: '/holiday-planner', icon: PartyPopper, group: 'life' },
  { key: 'weekendTrips', to: '/weekend-trips', icon: TrainFront, group: 'life' },
  { key: 'drivingTime', to: '/driving-time-calculator', icon: Truck, group: 'life' },
  { key: 'workSchedule', to: '/work-schedule-check', icon: ClipboardList, group: 'life' },
  { key: 'emergencyWallpaper', to: '/emergency-wallpaper', icon: Smartphone, group: 'life' },
  { key: 'events', to: '/events', icon: CalendarDays, group: 'plan' },
  { key: 'status', to: '/status', icon: ScanSearch, group: 'plan' },
  { key: 'map', to: '/map', icon: MapPinned, group: 'explore' },
  { key: 'azInGermany', to: '/azerbaijan-in-germany', icon: Flag, group: 'explore' },
  { key: 'guides', to: '/guides', icon: BookOpen, group: 'explore' },
  { key: 'glossary', to: '/glossary', icon: BookA, group: 'explore' },
  { key: 'shortageBarometer', to: '/shortage-barometer', icon: Gauge, group: 'explore' },
  { key: 'jobs', to: '/jobs', icon: Briefcase, group: 'explore' },
  { key: 'visas', to: '/visas', icon: MapIcon, group: 'explore' },
  // Learning games (pages/games): also linked from the portal German page (components/games/GameLinks).
  { key: 'mockExam', to: '/german-mock-exam', icon: GraduationCap, group: 'learn' },
  { key: 'levelSelf', to: '/german-level-test-self', icon: Gauge, group: 'learn' },
  { key: 'simulator', to: '/german-simulator', icon: MessagesSquare, group: 'learn' },
  { key: 'pronunciation', to: '/pronunciation', icon: Mic, group: 'learn' },
  { key: 'priceGame', to: '/price-game', icon: Coins, group: 'learn' },
  { key: 'trafficSigns', to: '/traffic-signs', icon: TriangleAlert, group: 'learn' },
  { key: 'wasteSorting', to: '/waste-sorting', icon: Recycle, group: 'learn' },
  { key: 'ticketMachine', to: '/ticket-machine', icon: Ticket, group: 'learn' },
  { key: 'supermarketGame', to: '/supermarket-game', icon: ShoppingCart, group: 'learn' },
  { key: 'workScenes', to: '/work-scenes', icon: HardHat, group: 'learn' }, // interactive workplaces (pages/tools/workScenes)
  // Employers (titles: i18n/pagesToolsHub.ts toolsPage.items).
  { key: 'employerGuide', to: '/employer-guide-azerbaijan', icon: BookOpen, group: 'employers' },
  { key: 'candidateCatalogue', to: '/kandidaten', icon: Users, group: 'employers' },
];
