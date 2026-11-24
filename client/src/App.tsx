import { Suspense, useEffect, useSyncExternalStore } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { RequireAuth, useAuth } from './lib/auth';
import { whenIdle } from './lib/idle';
import { PageLoader } from './components/ui/Spinner';
import { SiteLayout } from './components/layout/SiteLayout';
import { getImpersonation, subscribeImpersonation } from './lib/api';
import { splitLocalePath } from './lib/siteLocale';
// Route pages: React.lazy plus preloading before hydration of server-rendered pages (lib/lazyRoute.tsx).
import { lazyRoute } from './lib/lazyRoute';

// "View as client" bar: its chunk (and copy) loads only while an admin is actually viewing a portal.
const ImpersonationBanner = lazyRoute('ImpersonationBanner', () => import('./components/privacyTools/ImpersonationBanner').then((m) => ({ default: m.ImpersonationBanner })));
const ImpersonationGate = () => {
  const active = useSyncExternalStore(subscribeImpersonation, getImpersonation, getImpersonation) !== null;
  return active ? (
    <Suspense fallback={null}>
      <ImpersonationBanner />
    </Suspense>
  ) : null;
};

// Re-acceptance of updated legal texts: own chunk, fetched only for signed-in users.
const LegalGate = lazyRoute('LegalGate', () => import('./components/legal/LegalGate'));
const LegalGateHost = () => {
  const { user } = useAuth();
  return user ? (
    <Suspense fallback={null}>
      <LegalGate />
    </Suspense>
  ) : null;
};

const Home = lazyRoute('Home', () => import('./pages/Home'));
const About = lazyRoute('About', () => import('./pages/About'));
const Services = lazyRoute('Services', () => import('./pages/Services'));
const ServiceDetail = lazyRoute('ServiceDetail', () => import('./pages/ServiceDetail'));
const Eligibility = lazyRoute('Eligibility', () => import('./pages/Eligibility'));
const EligibilityQuiz = lazyRoute('EligibilityQuiz', () => import('./pages/EligibilityQuiz'));
const PathFinder = lazyRoute('PathFinder', () => import('./pages/PathFinder')); // "which path fits me" wizard (shareable result URL)
const StartHere = lazyRoute('StartHere', () => import('./pages/start/StartHere')); // "Start here" wizard: 3 questions → personal plan
const StartPlan = lazyRoute('StartPlan', () => import('./pages/start/StartPlan')); // personal plan (/start/plan?w=…&p=…&l=…)
const Visas = lazyRoute('Visas', () => import('./pages/Visas'));
const VisaDetail = lazyRoute('VisaDetail', () => import('./pages/VisaDetail'));
const Partners = lazyRoute('Partners', () => import('./pages/Partners'));
const Stories = lazyRoute('Stories', () => import('./pages/Stories'));
const Ausbildung = lazyRoute('Ausbildung', () => import('./pages/Ausbildung'));
const FaqPage = lazyRoute('FaqPage', () => import('./pages/FaqPage'));
const News = lazyRoute('News', () => import('./pages/News'));
const NewsDetail = lazyRoute('NewsDetail', () => import('./pages/NewsDetail'));
const Contact = lazyRoute('Contact', () => import('./pages/Contact'));
const Cooperation = lazyRoute('Cooperation', () => import('./pages/Cooperation'));
const DevelopersPage = lazyRoute('DevelopersPage', () => import('./pages/Developers')); // public vacancy API docs for partners (/developers)
const AdminPublicApiKeys = lazyRoute('AdminPublicApiKeys', () => import('./pages/admin/PublicApiKeys')); // partner vacancy API keys + usage (ADMIN+)
const Login = lazyRoute('Login', () => import('./pages/auth/Login'));
const Register = lazyRoute('Register', () => import('./pages/auth/Register'));
const PartnerLink = lazyRoute('PartnerLink', () => import('./pages/auth/PartnerLink')); // /p/:code — referral partner's short sign-up link
const ForgotPassword = lazyRoute('ForgotPassword', () => import('./pages/auth/ForgotPassword'));
const ResetPassword = lazyRoute('ResetPassword', () => import('./pages/auth/ResetPassword'));
const NotFound = lazyRoute('NotFound', () => import('./pages/NotFound'));
const AccessibilityPage = lazyRoute('AccessibilityPage', () => import('./pages/Accessibility'));
// Simplified public navigation: all tools on one page, one landing page per audience.
const ToolsPage = lazyRoute('ToolsPage', () => import('./pages/Tools'));
const ForWorkers = lazyRoute('ForWorkers', () => import('./pages/ForWorkers'));
const ForEmployers = lazyRoute('ForEmployers', () => import('./pages/ForEmployers'));

const AccountLayout = lazyRoute('AccountLayout', () => import('./pages/account/AccountLayout'));
const AccountHome = lazyRoute('AccountHome', () => import('./pages/account/AccountHome'));
const CaseView = lazyRoute('CaseView', () => import('./pages/account/CaseView'));
const Notifications = lazyRoute('Notifications', () => import('./pages/account/Notifications'));
const Profile = lazyRoute('Profile', () => import('./pages/account/Profile'));
const AccountApplications = lazyRoute('AccountApplications', () => import('./pages/account/Applications'));
const AccountExternalApplications = lazyRoute('AccountExternalApplications', () => import('./pages/account/ExternalApplications')); // apply via Triad Vision: status

const AdminLayout = lazyRoute('AdminLayout', () => import('./pages/admin/AdminLayout'));
const AdminDashboard = lazyRoute('AdminDashboard', () => import('./pages/admin/Dashboard'));
const AdminOversight = lazyRoute('AdminOversight', () => import('./pages/admin/Oversight'));
const AdminStaffDetail = lazyRoute('AdminStaffDetail', () => import('./pages/admin/StaffDetail'));
const AdminCases = lazyRoute('AdminCases', () => import('./pages/admin/CasesList'));
const AdminReview = lazyRoute('AdminReview', () => import('./pages/admin/Review')); // fast document review queue (full screen)
const AdminNotifications = lazyRoute('AdminNotifications', () => import('./pages/admin/Notifications')); // notification center history + settings
const AdminInbox = lazyRoute('AdminInbox', () => import('./pages/admin/Inbox')); // case threads awaiting the team's answer (phone "Mesajlar" tab)
const AdminCase = lazyRoute('AdminCase', () => import('./pages/admin/CaseAdmin'));
const AdminInquiries = lazyRoute('AdminInquiries', () => import('./pages/admin/Inquiries'));
const AdminUsers = lazyRoute('AdminUsers', () => import('./pages/admin/Users'));
const AdminClient360 = lazyRoute('AdminClient360', () => import('./pages/admin/Client360')); // client 360° page
const AdminTeamLoad = lazyRoute('AdminTeamLoad', () => import('./pages/admin/TeamLoad')); // team workload board
const AdminCannedReplies = lazyRoute('AdminCannedReplies', () => import('./pages/admin/CannedReplies')); // canned replies
const AdminCoverLetterTemplates = lazyRoute('AdminCoverLetterTemplates', () => import('./pages/admin/CoverLetterTemplates')); // Anschreiben templates
const AdminMailboxes = lazyRoute('AdminMailboxes', () => import('./pages/admin/Mailboxes'));
const AdminSignatures = lazyRoute('AdminSignatures', () => import('./pages/admin/Signatures'));
const SignPage = lazyRoute('SignPage', () => import('./pages/SignPage'));
const QuotePage = lazyRoute('QuotePage', () => import('./pages/QuotePage'));
const PackagesPage = lazyRoute('PackagesPage', () => import('./pages/Packages')); // service packages + online order
const PackageOrderStatus = lazyRoute('PackageOrderStatus', () => import('./pages/PackageOrderStatus'));
const AccountPayments = lazyRoute('AccountPayments', () => import('./pages/account/Payments')); // Documents › Payments
const AccountAllTools = lazyRoute('AccountAllTools', () => import('./pages/account/AllTools')); // stage-based portal: All tools (/account/all)
const AdminClientInvoices = lazyRoute('AdminClientInvoices', () => import('./pages/admin/ClientInvoices'));
const AdminPackages = lazyRoute('AdminPackages', () => import('./pages/admin/Packages'));
const AdminAccounting = lazyRoute('AdminAccounting', () => import('./pages/admin/Accounting'));
const AdminCountersign = lazyRoute('AdminCountersign', () => import('./pages/admin/Countersign'));
const AdminTrust = lazyRoute('AdminTrust', () => import('./pages/admin/TrustAdmin')); // Trust Center facts + AVV template approval (/admin/trust)
const SharePage = lazyRoute('SharePage', () => import('./pages/SharePage'));
const CandidateSharePage = lazyRoute('CandidateSharePage', () => import('./pages/CandidateSharePage')); // employer share link of a candidate
const AccountSignatures = lazyRoute('AccountSignatures', () => import('./pages/account/Signatures'));
const WorkspaceLayout = lazyRoute('WorkspaceLayout', () => import('./pages/workspace/WorkspaceLayout'));
const WorkspaceDrive = lazyRoute('WorkspaceDrive', () => import('./pages/workspace/Drive'));
const WorkspaceTasks = lazyRoute('WorkspaceTasks', () => import('./pages/workspace/Tasks'));
const WorkspaceHome = lazyRoute('WorkspaceHome', () => import('./pages/workspace/Home'));
const WorkspaceMail = lazyRoute('WorkspaceMail', () => import('./pages/workspace/Mail'));
const WorkspaceChat = lazyRoute('WorkspaceChat', () => import('./pages/workspace/Chat'));
const WorkspaceCalendar = lazyRoute('WorkspaceCalendar', () => import('./pages/workspace/Calendar'));
const WorkspaceContacts = lazyRoute('WorkspaceContacts', () => import('./pages/workspace/Contacts'));
const WorkspaceTeam = lazyRoute('WorkspaceTeam', () => import('./pages/workspace/Team'));
const WorkspaceLiveChats = lazyRoute('WorkspaceLiveChats', () => import('./pages/workspace/LiveChats')); // AI → human live chat queue
const AdminCalls = lazyRoute('AdminCalls', () => import('./pages/admin/Calls')); // call log, callback requests, phone provider
const AdminDocsAudit = lazyRoute('AdminDocsAudit', () => import('./pages/admin/DocsAudit'));
const AdminContent = lazyRoute('AdminContent', () => import('./pages/admin/ContentManager'));
const AdminSettings = lazyRoute('AdminSettings', () => import('./pages/admin/Settings'));
const Impressum = lazyRoute('Impressum', () => import('./pages/legal/Impressum'));
const Privacy = lazyRoute('Privacy', () => import('./pages/legal/Privacy'));
// Versioned legal texts: AGB (/agb, /terms), cookie policy, archived versions.
const TermsPage = lazyRoute('TermsPage', () => import('./pages/legal/LegalDocument').then((m) => ({ default: m.TermsPage })));
const CookiesPage = lazyRoute('CookiesPage', () => import('./pages/legal/LegalDocument').then((m) => ({ default: m.CookiesPage })));
const LegalArchivedVersion = lazyRoute('LegalArchivedVersion', () => import('./pages/legal/LegalDocument').then((m) => ({ default: m.LegalArchivedVersion })));
const AdminLegal = lazyRoute('AdminLegal', () => import('./pages/admin/Legal'));
const AdminWaitingRoom = lazyRoute('AdminWaitingRoom', () => import('./pages/admin/WaitingRoom'));
const AccountWaitingRoom = lazyRoute('AccountWaitingRoom', () => import('./pages/account/WaitingRoom'));
const AccountCases = lazyRoute('AccountCases', () => import('./pages/account/Cases')); // Home › My applications
const AccountGuides = lazyRoute('AccountGuides', () => import('./pages/account/Guides')); // Learn › Guides
const VerifyEmail = lazyRoute('VerifyEmail', () => import('./pages/auth/VerifyEmail'));
const ConfirmEmailChange = lazyRoute('ConfirmEmailChange', () => import('./pages/auth/ConfirmEmailChange')); // link mailed to the new address (e-mail change)
const TwoFactor = lazyRoute('TwoFactor', () => import('./pages/auth/TwoFactor'));
const Jobs = lazyRoute('Jobs', () => import('./pages/jobs/Jobs'));
const JobCompare = lazyRoute('JobCompare', () => import('./pages/jobs/JobCompare')); // /compare-jobs?v=a,b,c (noindex)
const JobDetail = lazyRoute('JobDetail', () => import('./pages/jobs/JobDetail'));
const JobLanding = lazyRoute('JobLanding', () => import('./pages/jobs/JobLanding')); // /jobs/in/:city/:profession (server lib/jobLandings.ts)
const StudyCatalogue = lazyRoute('StudyCatalogue', () => import('./pages/study/StudyCatalogue')); // /study: programme catalogue (curated by staff)
const StudyProgrammeDetail = lazyRoute('StudyProgrammeDetail', () => import('./pages/study/StudyProgrammeDetail')); // /study/:slug + apply via Triad Vision
const GlossaryIndex = lazyRoute('GlossaryIndex', () => import('./pages/glossary/GlossaryIndex')); // /glossary: German bureaucracy glossary (static terms, server lib/glossary)
const GlossaryTermPage = lazyRoute('GlossaryTermPage', () => import('./pages/glossary/GlossaryTermPage')); // /glossary/:slug
const PlatformPage = lazyRoute('PlatformPage', () => import('./pages/platform/PlatformPage')); // /platform: the platform for other agencies (owner instance only; demo request)
const AdminStudyProgrammes = lazyRoute('AdminStudyProgrammes', () => import('./pages/admin/StudyProgrammes')); // /admin/study: catalogue CRUD + CSV
const GermanyJobs = lazyRoute('GermanyJobs', () => import('./pages/jobs/GermanyJobs')); // /jobs/germany(/search): Adzuna search, BA link, apply via Triad Vision
const EmployerRegister = lazyRoute('EmployerRegister', () => import('./pages/company/EmployerRegister'));
const CompanyApp = lazyRoute('CompanyApp', () => import('./pages/company/CompanyApp'));
const AgentApp = lazyRoute('AgentApp', () => import('./pages/agent/AgentApp'));
const PartnerApp = lazyRoute('PartnerApp', () => import('./pages/partner/PartnerApp'));
const AdminHelp = lazyRoute('AdminHelp', () => import('./pages/admin/Help'));
const AdminAnnouncements = lazyRoute('AdminAnnouncements', () => import('./pages/admin/Announcements'));
const AccountCv = lazyRoute('AccountCv', () => import('./pages/account/Cv'));
const AccountLetters = lazyRoute('AccountLetters', () => import('./pages/account/Letters'));
const AccountLetterExplain = lazyRoute('AccountLetterExplain', () => import('./pages/account/LetterExplain'));
const AccountVault = lazyRoute('AccountVault', () => import('./pages/account/Vault'));
const AccountArrival = lazyRoute('AccountArrival', () => import('./pages/account/Arrival'));
const AccountArrivalPrep = lazyRoute('AccountArrivalPrep', () => import('./pages/account/ArrivalPrep')); // Home › Arrival preparation
const AccountArrivalCard = lazyRoute('AccountArrivalCard', () => import('./pages/account/ArrivalCard')); // digital arrival card (offline)
const AccountBadges = lazyRoute('AccountBadges', () => import('./pages/account/Badges')); // badges / achievements (private)
const AccountVisaStory = lazyRoute('AccountVisaStory', () => import('./pages/account/VisaStory')); // visa approved: 'Your visa story' (Triad Wrapped) slides
const AccountDocChecklist = lazyRoute('AccountDocChecklist', () => import('./pages/account/DocChecklist')); // Documents › Document checklist
const SalaryCalculator = lazyRoute('SalaryCalculator', () => import('./pages/tools/SalaryCalculator'));
const StartCalculator = lazyRoute('StartCalculator', () => import('./pages/growth/Calculator'));
const PlacementMapPage = lazyRoute('PlacementMapPage', () => import('./pages/growth/MapPage'));
const InfoEvents = lazyRoute('InfoEvents', () => import('./pages/growth/Events'));
const InfoEventDetail = lazyRoute('InfoEventDetail', () => import('./pages/growth/EventDetail'));
const CostCalculatorPage = lazyRoute('CostCalculatorPage', () => import('./pages/growth/CostCalculator')); // client cost calculator
const BudgetPage = lazyRoute('BudgetPage', () => import('./pages/tools/Budget')); // first-month budget in Germany (/budget)
const LifeInGermanyPage = lazyRoute('LifeInGermanyPage', () => import('./pages/tools/LifeInGermany')); // Life in Germany simulator (/life-in-germany)
const PhraseOfTheDayPage = lazyRoute('PhraseOfTheDayPage', () => import('./pages/PhraseOfTheDay')); // German phrase of the day + last 30 days (/phrase-of-the-day)
const WhenInGermanyPage = lazyRoute('WhenInGermanyPage', () => import('./pages/tools/WhenInGermany')); // arrival-month estimator (/when-in-germany)
const PayslipExplainedPage = lazyRoute('PayslipExplainedPage', () => import('./pages/tools/PayslipExplained')); // German payslip explainer (/payslip-explained)
const GermanApartmentPage = lazyRoute('GermanApartmentPage', () => import('./pages/tools/GermanApartment')); // virtual German apartment (/german-apartment)
const WorkScenesHub = lazyRoute('WorkScenesHub', () => import('./pages/tools/workScenes/WorkScenesHub')); // interactive work scenes hub (/work-scenes)
const WorkSceneKitchen = lazyRoute('WorkSceneKitchen', () => import('./pages/tools/workScenes/RestaurantKitchen')); // /work-scenes/restaurant-kitchen
const WorkSceneTruck = lazyRoute('WorkSceneTruck', () => import('./pages/tools/workScenes/TruckCab')); // /work-scenes/truck-cab
const WorkSceneHospital = lazyRoute('WorkSceneHospital', () => import('./pages/tools/workScenes/HospitalWard')); // /work-scenes/hospital-ward
const WorkSceneConstruction = lazyRoute('WorkSceneConstruction', () => import('./pages/tools/workScenes/ConstructionSite')); // /work-scenes/construction-site
const ProfessionHubPage = lazyRoute('ProfessionHubPage', () => import('./pages/tools/ProfessionHub')); // profession hubs (/for/:profession)
const WorkSceneElectrical = lazyRoute('WorkSceneElectrical', () => import('./pages/tools/workScenes/ElectricalPanel')); // /work-scenes/electrical-panel
const ResidenceCardExplainedPage = lazyRoute('ResidenceCardExplainedPage', () => import('./pages/tools/ResidenceCardExplained')); // eAT specimen explained (/residence-card-explained)
const ShortageBarometerPage = lazyRoute('ShortageBarometerPage', () => import('./pages/tools/ShortageBarometer')); // BA Engpassanalyse barometer (/shortage-barometer)
const TaxRefundCalculatorPage = lazyRoute('TaxRefundCalculatorPage', () => import('./pages/tools/TaxRefundCalculator')); // tax refund estimate (/tax-refund-calculator)
const ShiftPayCalculatorPage = lazyRoute('ShiftPayCalculatorPage', () => import('./pages/tools/ShiftPayCalculator')); // night / Sunday / holiday supplements (/shift-pay-calculator)
const DrivingTimeCalculatorPage = lazyRoute('DrivingTimeCalculatorPage', () => import('./pages/tools/DrivingTimeCalculator')); // drivers' hours VO 561/2006 + §21a ArbZG (/driving-time-calculator)
const WorkScheduleCheckPage = lazyRoute('WorkScheduleCheckPage', () => import('./pages/tools/WorkScheduleCheck')); // shift plan vs ArbZG (/work-schedule-check)
const TaxClassChooserPage = lazyRoute('TaxClassChooserPage', () => import('./pages/tools/TaxClassChooser')); // Steuerklassenwahl III/V, IV/IV, Faktor (/tax-class-chooser)
const EmployerCostCalculatorPage = lazyRoute('EmployerCostCalculatorPage', () => import('./pages/tools/EmployerCostCalculator')); // employer cost, B2B (/employer-cost-calculator)
const RentCheckPage = lazyRoute('RentCheckPage', () => import('./pages/tools/RentCheck')); // fair rent check (/rent-check)
const RealSalariesPage = lazyRoute('RealSalariesPage', () => import('./pages/tools/RealSalaries')); // real salary database, k-anonymous ranges (/real-salaries)
const AdminRealSalaries = lazyRoute('AdminRealSalaries', () => import('./pages/admin/RealSalaries')); // real salary database: records, exclusions, recompute
const HealthInsuranceComparisonPage = lazyRoute('HealthInsuranceComparisonPage', () => import('./pages/tools/HealthInsuranceComparison')); // Krankenkassen comparison (/health-insurance-comparison)
const EmergencyWallpaperPage = lazyRoute('EmergencyWallpaperPage', () => import('./pages/tools/EmergencyWallpaper')); // lock-screen emergency wallpaper (/emergency-wallpaper, rendered on the device)
const AccountReadiness = lazyRoute('AccountReadiness', () => import('./pages/account/Readiness')); // Germany readiness score 0–100 (/account/readiness)
const AccountEmergencyWallpaper = lazyRoute('AccountEmergencyWallpaper', () => import('./pages/account/EmergencyWallpaper')); // emergency wallpaper prefilled from the case
const AdminEmployerChecklistTemplates = lazyRoute('AdminEmployerChecklistTemplates', () => import('./pages/admin/EmployerChecklistTemplates')); // employer arrival checklist templates (ADMIN+ edits)
const HolidayPlannerPage = lazyRoute('HolidayPlannerPage', () => import('./pages/tools/HolidayPlanner')); // public holidays + bridge days (/holiday-planner)
const GradeConverterPage = lazyRoute('GradeConverterPage', () => import('./pages/tools/GradeConverter')); // grade conversion, modified Bavarian formula (/grade-converter)
const WeekendTripsPage = lazyRoute('WeekendTripsPage', () => import('./pages/tools/WeekendTrips')); // Deutschlandticket day trips (/weekend-trips)
const EmployerGuideAzerbaijanPage = lazyRoute('EmployerGuideAzerbaijanPage', () => import('./pages/EmployerGuideAzerbaijan')); // employer guide, German first (/employer-guide-azerbaijan)
const AzerbaijanInGermanyPage = lazyRoute('AzerbaijanInGermanyPage', () => import('./pages/AzerbaijanInGermany')); // embassy, culture, associations map (/azerbaijan-in-germany)
const WhichCityPage = lazyRoute('WhichCityPage', () => import('./pages/tools/WhichCity')); // "Which German city suits you?" quiz (/which-city)
const PermanentResidencePage = lazyRoute('PermanentResidencePage', () => import('./pages/tools/PermanentResidence')); // settlement permit + citizenship timeline (/permanent-residence)
const ApartmentViewingPage = lazyRoute('ApartmentViewingPage', () => import('./pages/tools/ApartmentViewing')); // viewing simulator + Mieterselbstauskunft (/apartment-viewing)
const SendMoneyHomePage = lazyRoute('SendMoneyHomePage', () => import('./pages/tools/SendMoneyHome')); // money for family / remittance calculator (/send-money-home)
const WorkplaceEtiquettePage = lazyRoute('WorkplaceEtiquettePage', () => import('./pages/tools/WorkplaceEtiquette')); // German workplace etiquette quiz (/workplace-etiquette)
const NovruzCardPage = lazyRoute('NovruzCardPage', () => import('./pages/tools/NovruzCard')); // Novruz greeting cards for employers (/novruz-card)
const PocketGuidePage = lazyRoute('PocketGuidePage', () => import('./pages/tools/PocketGuide')); // printable Germany pocket guide PDF (/pocket-guide)
const FiveYearsInGermanyPage = lazyRoute('FiveYearsInGermanyPage', () => import('./pages/tools/FiveYearsInGermany')); // 5-year time machine (/five-years-in-germany)
const CountryComparePage = lazyRoute('CountryComparePage', () => import('./pages/tools/CountryCompare')); // Germany vs PL / CZ / UK / AT (/germany-vs-other-countries)
const VisaRefusalPage = lazyRoute('VisaRefusalPage', () => import('./pages/tools/VisaRefusal')); // refusal reasons + new-application cover letter (/visa-refusal)
const VisaChecklistPage = lazyRoute('VisaChecklistPage', () => import('./pages/tools/VisaChecklist')); // public document checklist (/visa-document-checklist)
const DrivingLicencePage = lazyRoute('DrivingLicencePage', () => import('./pages/tools/DrivingLicence')); // Azerbaijani licence in Germany guide (/driving-licence-germany)
const FamilyReunificationCheckPage = lazyRoute('FamilyReunificationCheckPage', () => import('./pages/tools/FamilyReunificationCheck')); // public family reunification self-check
const GermanSimulatorPage = lazyRoute('GermanSimulatorPage', () => import('./pages/games/GermanSimulator')); // Bürgeramt dialogue simulator (/german-simulator)
const PronunciationPage = lazyRoute('PronunciationPage', () => import('./pages/games/Pronunciation')); // pronunciation trainer (/pronunciation)
const PriceGamePage = lazyRoute('PriceGamePage', () => import('./pages/games/PriceGame')); // "guess the price" (/price-game)
const TrafficSignsPage = lazyRoute('TrafficSignsPage', () => import('./pages/games/TrafficSigns')); // StVO signs learn + exam (/traffic-signs)
const WasteSortingPage = lazyRoute('WasteSortingPage', () => import('./pages/games/WasteSorting')); // Mülltrennung game (/waste-sorting)
const GermanStreetPage = lazyRoute('GermanStreetPage', () => import('./pages/games/GermanStreet')); // virtual German street hub (/german-street)
const TicketMachinePage = lazyRoute('TicketMachinePage', () => import('./pages/games/TicketMachine')); // ticket machine simulator (/ticket-machine)
const SupermarketGamePage = lazyRoute('SupermarketGamePage', () => import('./pages/games/SupermarketGame')); // supermarket game (/supermarket-game)
const AdventCalendarPage = lazyRoute('AdventCalendarPage', () => import('./pages/tools/AdventCalendar')); // German Advent calendar (/advent-calendar)
const Changes2027Page = lazyRoute('Changes2027Page', () => import('./pages/tools/Changes2027')); // what changes on 1 January 2027 (/changes-2027)
const GermanMockExamPage = lazyRoute('GermanMockExamPage', () => import('./pages/tools/GermanMockExam')); // German mock exams (/german-mock-exam, /a1, /b1)
const GermanLevelSelfPage = lazyRoute('GermanLevelSelfPage', () => import('./pages/tools/GermanLevelSelf')); // CEFR self-assessment + study plan (/german-level-test-self)
const AccountBudget = lazyRoute('AccountBudget', () => import('./pages/account/Budget')); // personalised first-month budget
const EmbedPage = lazyRoute('EmbedPage', () => import('./pages/embed/EmbedPage')); // embeddable widgets for other sites' iframes (/embed/:widget, outside the site layout)
const WidgetsPage = lazyRoute('WidgetsPage', () => import('./pages/Widgets')); // widget configurator + iframe snippets (/widgets)
const AdminTvDisplay = lazyRoute('AdminTvDisplay', () => import('./pages/admin/TvDisplay')); // office wall TV (/admin/tv): display token or staff session, full screen
const AdminQuarterlyReport = lazyRoute('AdminQuarterlyReport', () => import('./pages/admin/QuarterlyReport')); // quarterly labour mobility report PDF (STAFF read, ADMIN+ publish)
const ReportsPage = lazyRoute('ReportsPage', () => import('./pages/Reports')); // published quarterly reports (/reports)
const AdminYearReview = lazyRoute('AdminYearReview', () => import('./pages/admin/YearReview')); // staff 'Year in review' (per-staff counts ADMIN+, server-side)
const AdminTvSettings = lazyRoute('AdminTvSettings', () => import('./pages/admin/TvSettings')); // Admin → TV mode: display tokens + settings (ADMIN+)
const AdminCityCosts = lazyRoute('AdminCityCosts', () => import('./pages/admin/CityCosts')); // Sayt → Şəhər xərcləri (budget calculator data)
const AdminDataFreshness = lazyRoute('AdminDataFreshness', () => import('./pages/admin/DataFreshness')); // Sayt → Məlumatların aktuallığı (yearly figures, review dates; ADMIN+)
const AdminPastPlacements = lazyRoute('AdminPastPlacements', () => import('./pages/admin/PastPlacements')); // Sayt → Keçmiş yerləşdirmələr (real historical numbers for the public map; STAFF read, ADMIN+ edit)
const LandingPageView = lazyRoute('LandingPageView', () => import('./pages/growth/LandingPage')); // public landing pages /l/:slug
const AccountReferral = lazyRoute('AccountReferral', () => import('./pages/account/Referral'));
const AdminGrowthEvents = lazyRoute('AdminGrowthEvents', () => import('./pages/admin/GrowthEvents'));
const AdminGrowthTools = lazyRoute('AdminGrowthTools', () => import('./pages/admin/GrowthTools'));
const AdminLandingPages = lazyRoute('AdminLandingPages', () => import('./pages/admin/LandingPages')); // landing page builder
const AdminLeadMagnets = lazyRoute('AdminLeadMagnets', () => import('./pages/admin/LeadMagnets')); // e-book lead magnets + starter e-book
const SearchPage = lazyRoute('SearchPage', () => import('./pages/SearchPage')); // full site search results (/search?q=, noindex)
const CompareVisas = lazyRoute('CompareVisas', () => import('./pages/tools/CompareVisas')); // "which visa fits me?" table + wizard
const EbookPage = lazyRoute('EbookPage', () => import('./pages/growth/Ebook')); // e-book lead magnet /ebook/:slug
const JobAlertManage = lazyRoute('JobAlertManage', () => import('./pages/JobAlertManage')); // job alert confirm / manage / unsubscribe link
const VacancyRequestManage = lazyRoute('VacancyRequestManage', () => import('./pages/VacancyRequestManage')); // guest cancel link of a vacancy request
const JobAlertGermanyManage = lazyRoute('JobAlertGermanyManage', () => import('./pages/JobAlertGermanyManage')); // Germany job alert (/jobs/germany) confirm / manage / unsubscribe link
const AccountSavedJobs = lazyRoute('AccountSavedJobs', () => import('./pages/account/SavedJobs')); // Learn › Saved jobs (Germany job search) + job alerts
const AnerkennungGuide = lazyRoute('AnerkennungGuide', () => import('./pages/tools/Anerkennung'));
const CitiesGuide = lazyRoute('CitiesGuide', () => import('./pages/tools/Cities'));
// SEO: topic guides and interactive tools (Chancenkarte points, Blue Card salary check)
const Guides = lazyRoute('Guides', () => import('./pages/guides/Guides'));
const GuideDetail = lazyRoute('GuideDetail', () => import('./pages/guides/GuideDetail'));
const ChancenkarteCalculator = lazyRoute('ChancenkarteCalculator', () => import('./pages/tools/ChancenkarteCalculator'));
const BlueCardCheck = lazyRoute('BlueCardCheck', () => import('./pages/tools/BlueCardCheck'));
const AdminGuides = lazyRoute('AdminGuides', () => import('./pages/admin/Guides'));
const AdminToolAnalytics = lazyRoute('AdminToolAnalytics', () => import('./pages/admin/ToolAnalytics')); // per-tool views, interactions, result e-mails, attributed sign-ups (/admin/tool-analytics)
const ResultEmailManage = lazyRoute('ResultEmailManage', () => import('./pages/ResultEmailManage')); // 'e-mail me my result' confirm / unsubscribe link (/result-email)
const RateAlertManage = lazyRoute('RateAlertManage', () => import('./pages/RateAlertManage')); // EUR → AZN rate alert confirm / manage / re-arm / unsubscribe link (/rate-alert)
const AdminSearchPerformance = lazyRoute('AdminSearchPerformance', () => import('./pages/admin/SearchPerformance')); // Google Search Console (ADMIN+)
const AdminArrivals = lazyRoute('AdminArrivals', () => import('./pages/admin/Arrivals'));
const AdminPartnerHousing = lazyRoute('AdminPartnerHousing', () => import('./pages/admin/PartnerHousing')); // partner landlords + Anmeldung deadlines
const AdminExpiring = lazyRoute('AdminExpiring', () => import('./pages/admin/Expiring'));
const AdminRecognition = lazyRoute('AdminRecognition', () => import('./pages/admin/Recognition')); // Anerkennung procedures
const AdminAccelerated = lazyRoute('AdminAccelerated', () => import('./pages/admin/Accelerated')); // § 81a accelerated procedures
const AdminAuthorities = lazyRoute('AdminAuthorities', () => import('./pages/admin/Authorities')); // authorities catalogue: Botschaft / Ausländerbehörde / …
const AdminFamilyReunion = lazyRoute('AdminFamilyReunion', () => import('./pages/admin/FamilyReunion')); // Familiennachzug: waiting families
const AdminOriginals = lazyRoute('AdminOriginals', () => import('./pages/admin/Originals'));
const AdminDuplicates = lazyRoute('AdminDuplicates', () => import('./pages/admin/Duplicates'));
const AdminHistory = lazyRoute('AdminHistory', () => import('./pages/admin/History')); // field-level change history + revert
const AdminStorageReport = lazyRoute('AdminStorageReport', () => import('./pages/admin/StorageReport'));
const QrRedirect = lazyRoute('QrRedirect', () => import('./pages/QrRedirect'));
const AdminToday = lazyRoute('AdminToday', () => import('./pages/admin/Today'));
const StatusPage = lazyRoute('StatusPage', () => import('./pages/Status')); // public status check without login
const TrustPage = lazyRoute('TrustPage', () => import('./pages/Trust')); // public Trust Center (/trust)
const CandidateCataloguePage = lazyRoute('CandidateCataloguePage', () => import('./pages/CandidateCatalogue')); // anonymous candidate catalogue (/kandidaten, German first)
const AdminBrowserErrors = lazyRoute('AdminBrowserErrors', () => import('./pages/admin/BrowserErrors')); // "Brauzer xətaları": browser error log (ADMIN+)
const AdminProblemReports = lazyRoute('AdminProblemReports', () => import('./pages/admin/ProblemReports')); // "Problem bildirişləri"

const AdminMyDay = lazyRoute('AdminMyDay', () => import('./pages/admin/MyDay')); // "Bu günüm": day plan on the my-work queue
/** /admin: the own start page (pages/admin/AdminIndex), else STAFF → queue, ADMIN+ → dashboard (also at /admin/dashboard). */
const AdminIndex = lazyRoute('AdminIndex', () => import('./pages/admin/AdminIndex'));
const AdminPartners = lazyRoute('AdminPartners', () => import('./pages/admin/Partners'));
const AdminClientRegister = lazyRoute('AdminClientRegister', () => import('./pages/admin/ClientRegister'));
const AdminSettlements = lazyRoute('AdminSettlements', () => import('./pages/admin/Settlements'));
const SheetEditor = lazyRoute('SheetEditor', () => import('./pages/workspace/SheetEditor'));
const PdfEditor = lazyRoute('PdfEditor', () => import('./pages/workspace/PdfEditor'));
const AccountInterviewPrep = lazyRoute('AccountInterviewPrep', () => import('./pages/account/InterviewPrep'));
const AdminInterviewPrep = lazyRoute('AdminInterviewPrep', () => import('./pages/admin/InterviewPrep'));
const AdminFinance = lazyRoute('AdminFinance', () => import('./pages/admin/Finance'));
const AdminReports = lazyRoute('AdminReports', () => import('./pages/admin/Reports'));
const AdminProfitability = lazyRoute('AdminProfitability', () => import('./pages/admin/Profitability'));
const AdminBizAnalytics = lazyRoute('AdminBizAnalytics', () => import('./pages/admin/BizAnalytics'));
const AdminAi = lazyRoute('AdminAi', () => import('./pages/admin/Ai'));
const AdminAiSettings = lazyRoute('AdminAiSettings', () => import('./pages/admin/AiSettings'));
const AdminWeeklyReports = lazyRoute('AdminWeeklyReports', () => import('./pages/admin/WeeklyReports'));
const AdminSecurityAlerts = lazyRoute('AdminSecurityAlerts', () => import('./pages/admin/SecurityAlerts'));
const AdminSensitiveAccess = lazyRoute('AdminSensitiveAccess', () => import('./pages/admin/SensitiveAccess'));
const AdminAccessCenter = lazyRoute('AdminAccessCenter', () => import('./pages/admin/access/AccessCenter')); // Access Center (SUPER_ADMIN + "manage access")
const AdminAiMailTriage = lazyRoute('AdminAiMailTriage', () => import('./pages/admin/AiMailTriage'));
const AdminSurveys = lazyRoute('AdminSurveys', () => import('./pages/admin/Surveys'));
const AdminCampaigns = lazyRoute('AdminCampaigns', () => import('./pages/admin/Campaigns'));
const Unsubscribe = lazyRoute('Unsubscribe', () => import('./pages/Unsubscribe'));
const AdminContractTemplates = lazyRoute('AdminContractTemplates', () => import('./pages/admin/ContractTemplates'));
const AdminCandidateRequests = lazyRoute('AdminCandidateRequests', () => import('./pages/admin/CandidateRequests'));
const AdminCandidatePool = lazyRoute('AdminCandidatePool', () => import('./pages/admin/CandidatePool')); // anonymous candidate pool
const AdminSkillVideos = lazyRoute('AdminSkillVideos', () => import('./pages/admin/SkillVideos'));
const SurveyAnswer = lazyRoute('SurveyAnswer', () => import('./pages/SurveyAnswer'));
const SuccessSharePage = lazyRoute('SuccessSharePage', () => import('./pages/SuccessSharePage')); // public "visa approved" share card + lead form
const GoogleReviewOptOut = lazyRoute('GoogleReviewOptOut', () => import('./pages/GoogleReviewLink')); // Google review request: opt-out
const GoogleReviewRedirect = lazyRoute('GoogleReviewRedirect', () => import('./pages/GoogleReviewLink').then((m) => ({ default: m.GoogleReviewRedirect }))); // tracked link → Google
const GoogleReviewRate = lazyRoute('GoogleReviewRate', () => import('./pages/GoogleReviewRate')); // Google review request: one-click 1–5 rating (no gating)
const GoogleReviewRateRedirect = lazyRoute('GoogleReviewRateRedirect', () => import('./pages/GoogleReviewRate').then((m) => ({ default: m.GoogleReviewRateRedirect }))); // rating page → Google (click counter)
const ReferralLandingPage = lazyRoute('ReferralLandingPage', () => import('./pages/ReferralLandingPage')); // personal referral page /r/<slug>
const ReferralTermsPage = lazyRoute('ReferralTermsPage', () => import('./pages/ReferralTermsPage'));
const CheckInAnswer = lazyRoute('CheckInAnswer', () => import('./pages/CheckInAnswer')); // post-arrival check-in (one tap)
const AdminTimeTracking = lazyRoute('AdminTimeTracking', () => import('./pages/admin/TimeTracking')); // staff time tracking
const AdminKpi = lazyRoute('AdminKpi', () => import('./pages/admin/Kpi')); // staff KPI leaderboard (ADMIN+)
const AdminTraining = lazyRoute('AdminTraining', () => import('./pages/admin/Training')); // internal training: learn / authoring / progress
const AdminWhatsNew = lazyRoute('AdminWhatsNew', () => import('./pages/admin/WhatsNew')); // Yeniliklər: release notes per role, seen per user, ADMIN+ manage
const AdminTrainingChecklist = lazyRoute('AdminTrainingChecklist', () => import('./pages/admin/TrainingChecklist')); // new staff checklist (10 real tasks, team progress ADMIN+)
const AdminSetupChecklist = lazyRoute('AdminSetupChecklist', () => import('./pages/admin/SetupChecklist')); // owner setup checklist (ADMIN+)
const AdminCourse = lazyRoute('AdminCourse', () => import('./pages/admin/Course')); // pre-departure course: builder + progress report
const AccountCourse = lazyRoute('AccountCourse', () => import('./pages/account/Course')); // Learn › Course: overview, lesson player, quizzes, certificate
const CertificateVerify = lazyRoute('CertificateVerify', () => import('./pages/CertificateVerify')); // public course certificate check
const ArrivalCertificateVerify = lazyRoute('ArrivalCertificateVerify', () => import('./pages/ArrivalCertificateVerify')); // public arrival certificate check
const ReadyCertificateVerify = lazyRoute('ReadyCertificateVerify', () => import('./pages/ReadyCertificateVerify')); // public Germany Ready practice certificate check
const AccountGermanyReady = lazyRoute('AccountGermanyReady', () => import('./pages/account/GermanyReady')); // Germany Ready: practice points, weekly challenge, certificate (/account/germany-ready)
const AccountFutureLetter = lazyRoute('AccountFutureLetter', () => import('./pages/account/FutureLetter')); // letter to my future self (/account/future-letter)
const AccountRateAlerts = lazyRoute('AccountRateAlerts', () => import('./pages/account/RateAlerts')); // EUR → AZN rate alerts (/account/rate-alerts)
const AccountPocketGuide = lazyRoute('AccountPocketGuide', () => import('./pages/account/PocketGuide')); // personalised pocket guide PDF (/account/pocket-guide)
const AdminGermanyReady = lazyRoute('AdminGermanyReady', () => import('./pages/admin/GermanyReady')); // Germany Ready: challenge order + certificate revoke
const OriginalsVerify = lazyRoute('OriginalsVerify', () => import('./pages/OriginalsVerify')); // public hand-over receipt check (QR on the act)
const UploadByLink = lazyRoute('UploadByLink', () => import('./pages/UploadByLink')); // login-free case upload link
const AccountRuleChanges = lazyRoute('AccountRuleChanges', () => import('./pages/account/RuleChanges')); // Qayda dəyişiklikləri (portal)
const AdminDataQuality = lazyRoute('AdminDataQuality', () => import('./pages/admin/DataQuality')); // data-quality panel
const AdminRuleChanges = lazyRoute('AdminRuleChanges', () => import('./pages/admin/RuleChanges')); // rule-change notices
const AdminShifts = lazyRoute('AdminShifts', () => import('./pages/admin/Shifts')); // team calendar: shifts, leave, handovers
const AdminCheckIns = lazyRoute('AdminCheckIns', () => import('./pages/admin/CheckIns')); // post-arrival check-ins + retention
const AdminAgents = lazyRoute('AdminAgents', () => import('./pages/admin/Agents'));
const AdminTranslations = lazyRoute('AdminTranslations', () => import('./pages/admin/Translations'));
const AdminPrivacyRequests = lazyRoute('AdminPrivacyRequests', () => import('./pages/admin/PrivacyRequests'));
const AccountPrivacyCenter = lazyRoute('AccountPrivacyCenter', () => import('./pages/account/PrivacyCenter'));
const Booking = lazyRoute('Booking', () => import('./pages/booking/Booking'));
const BookingManage = lazyRoute('BookingManage', () => import('./pages/booking/BookingManage'));
const ReviewPage = lazyRoute('ReviewPage', () => import('./pages/ReviewPage'));
const AdminSecurity = lazyRoute('AdminSecurity', () => import('./pages/admin/Security'));
const AdminCompanies = lazyRoute('AdminCompanies', () => import('./pages/admin/Companies'));
const AdminCompanyProfile = lazyRoute('AdminCompanyProfile', () => import('./pages/admin/CompanyProfile')); // full employer profile: legal data, contracts, contacts, history
const AdminVacancies = lazyRoute('AdminVacancies', () => import('./pages/admin/Vacancies'));
const AdminJobChannels = lazyRoute('AdminJobChannels', () => import('./pages/admin/JobChannels')); // job board feeds (ADMIN+)
const AdminCandidates = lazyRoute('AdminCandidates', () => import('./pages/admin/Candidates'));
const AdminBookings = lazyRoute('AdminBookings', () => import('./pages/admin/Bookings'));
const AdminClientTasks = lazyRoute('AdminClientTasks', () => import('./pages/admin/ClientTasks')); // client tasks across cases (client process)
const AdminInvoices = lazyRoute('AdminInvoices', () => import('./pages/admin/Invoices'));
const AdminQuotes = lazyRoute('AdminQuotes', () => import('./pages/admin/Quotes'));
const AdminReviews = lazyRoute('AdminReviews', () => import('./pages/admin/Reviews'));
const AdminMessaging = lazyRoute('AdminMessaging', () => import('./pages/admin/Messaging'));
const AdminKanban = lazyRoute('AdminKanban', () => import('./pages/admin/Kanban'));
const AdminKnowledgeBase = lazyRoute('AdminKnowledgeBase', () => import('./pages/admin/KnowledgeBase'));
const AdminIntegrations = lazyRoute('AdminIntegrations', () => import('./pages/admin/Integrations'));
const AdminAutomation = lazyRoute('AdminAutomation', () => import('./pages/admin/Automation')); // automation rules + automatic assignment
const AdminInterviews = lazyRoute('AdminInterviews', () => import('./pages/admin/Interviews'));
const AdminOfficialForms = lazyRoute('AdminOfficialForms', () => import('./pages/admin/OfficialForms')); // official forms: templates, field mapping, preview
const AdminEmploymentContracts = lazyRoute('AdminEmploymentContracts', () => import('./pages/admin/EmploymentContracts')); // Arbeitsvertrag tracker: warnings, probation ending
const AdminJourney = lazyRoute('AdminJourney', () => import('./pages/admin/Journey'));
const AdminGermanExamDates = lazyRoute('AdminGermanExamDates', () => import('./pages/admin/GermanExamDates'));
const AdminRequirements = lazyRoute('AdminRequirements', () => import('./pages/admin/Requirements'));
const AdminCaseForms = lazyRoute('AdminCaseForms', () => import('./pages/admin/CaseForms')); // smart questionnaire builder
const AdminDocGuides = lazyRoute('AdminDocGuides', () => import('./pages/admin/DocGuides')); // "Necə almalı?" document guides
const AdminModules = lazyRoute('AdminModules', () => import('./pages/admin/SystemModules')); // module toggles (SUPER_ADMIN)
const AdminBrand = lazyRoute('AdminBrand', () => import('./pages/admin/SystemBrand')); // white-label brand (SUPER_ADMIN)
const AdminLicense = lazyRoute('AdminLicense', () => import('./pages/admin/SystemLicense')); // white-label licence status (SUPER_ADMIN)
const AdminCustomers = lazyRoute('AdminCustomers', () => import('./pages/admin/SystemCustomers')); // owner instance: customer agencies (SUPER_ADMIN)
const AdminOnboarding = lazyRoute('AdminOnboarding', () => import('./pages/admin/AgencyOnboarding')); // onboarding wizard of a new agency instance (SUPER_ADMIN)
const AdminUsage = lazyRoute('AdminUsage', () => import('./pages/admin/SystemUsage')); // admin page usage statistics (SUPER_ADMIN)
const AdminDesignSystem = lazyRoute('AdminDesignSystem', () => import('./pages/admin/DesignSystem')); // design tokens + component catalogue (ADMIN+)
const AccountCaseForm = lazyRoute('AccountCaseForm', () => import('./pages/account/CaseForm'));
const AccountConfirmData = lazyRoute('AccountConfirmData', () => import('./pages/account/ConfirmData'));
const AccountOnboarding = lazyRoute('AccountOnboarding', () => import('./pages/account/Onboarding'));
const AccountHousing = lazyRoute('AccountHousing', () => import('./pages/account/Housing')); // housing search checklist + Anmeldung
const AccountGerman = lazyRoute('AccountGerman', () => import('./pages/account/German'));
const AccountInterviews = lazyRoute('AccountInterviews', () => import('./pages/account/Interviews'));
const AdminAnalytics = lazyRoute('AdminAnalytics', () => import('./pages/admin/Analytics'));
const AdminOverview = lazyRoute('AdminOverview', () => import('./pages/admin/Overview')); // analytics landing ("İcmal")

/**
 * Warm the route chunks once the first page is interactive, so later navigations render
 * instantly instead of waiting on a network round-trip. Admin chunks are only fetched by staff.
 */
const PREFETCH = [
  () => import('./pages/Home'),
  () => import('./pages/About'),
  () => import('./pages/Services'),
  () => import('./pages/ServiceDetail'),
  () => import('./pages/Eligibility'),
  () => import('./pages/Visas'),
  () => import('./pages/VisaDetail'),
  () => import('./pages/Partners'),
  () => import('./pages/Stories'),
  () => import('./pages/Ausbildung'),
  () => import('./pages/FaqPage'),
  () => import('./pages/News'),
  () => import('./pages/NewsDetail'),
  () => import('./pages/Contact'),
  () => import('./pages/Cooperation'),
  () => import('./pages/auth/Login'),
  () => import('./pages/auth/Register'),
  () => import('./pages/auth/ForgotPassword'),
  () => import('./pages/auth/ResetPassword'),
  () => import('./pages/NotFound'),
  () => import('./pages/account/AccountLayout'),
  () => import('./pages/account/AccountHome'),
  () => import('./pages/account/CaseView'),
  () => import('./pages/account/Notifications'),
  () => import('./pages/account/Profile'),
];
const prefetchRoutes = () => {
  // One chunk per idle period, starting a few seconds after load, so warming never competes with
  // scrolling or the first interactions. Skipped on metered / very slow connections (Save-Data, 2G):
  // those visitors only download the pages they open (hover/focus intent still warms the next one).
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (conn?.saveData || /(^|-)2g$/.test(conn?.effectiveType ?? '')) return;
  const queue = [...PREFETCH];
  const next = () => {
    const load = queue.shift();
    if (!load) return;
    void load()
      .catch(() => undefined)
      .finally(() => whenIdle(next, 3000));
  };
  window.setTimeout(() => whenIdle(next, 3000), 5000);
};

/** Route prefix → page chunk, used to start loading a page as soon as the user points at its link. */
const INTENT: [string, () => Promise<unknown>][] = [
  ['/about', () => import('./pages/About')],
  ['/services/', () => import('./pages/ServiceDetail')],
  ['/services', () => import('./pages/Services')],
  ['/packages', () => import('./pages/Packages')],
  ['/visas/', () => import('./pages/VisaDetail')],
  ['/visas', () => import('./pages/Visas')],
  ['/partners', () => import('./pages/Partners')],
  ['/stories', () => import('./pages/Stories')],
  ['/ausbildung', () => import('./pages/Ausbildung')],
  ['/eligibility', () => import('./pages/Eligibility')],
  ['/uygunluq-testi', () => import('./pages/EligibilityQuiz')],
  ['/path-finder', () => import('./pages/PathFinder')],
  ['/faq', () => import('./pages/FaqPage')],
  ['/news/', () => import('./pages/NewsDetail')],
  ['/news', () => import('./pages/News')],
  ['/contact', () => import('./pages/Contact')],
  ['/tools', () => import('./pages/Tools')],
  ['/for-workers', () => import('./pages/ForWorkers')],
  ['/for-employers', () => import('./pages/ForEmployers')],
  ['/cooperation', () => import('./pages/Cooperation')],
  ['/login', () => import('./pages/auth/Login')],
  ['/register', () => import('./pages/auth/Register')],
  ['/account', () => import('./pages/account/AccountLayout')],
];
const warmed = new Set<string>();
const prefetchIntent = (e: Event) => {
  const a = (e.target as HTMLElement | null)?.closest?.('a[href^="/"]');
  // Language-prefixed links (/de/visas) warm the same chunk as /visas.
  const raw = a?.getAttribute('href');
  const href = raw ? splitLocalePath(raw.split(/[?#]/)[0]).rest : null;
  if (!href) return;
  const hit = INTENT.find(([prefix]) => href === prefix || href.startsWith(prefix.endsWith('/') ? prefix : `${prefix}/`) || href.startsWith(prefix + '?'));
  if (!hit || warmed.has(hit[0])) return;
  warmed.add(hit[0]);
  void hit[1]().catch(() => warmed.delete(hit[0]));
};

export default function App() {
  const location = useLocation();
  useEffect(prefetchRoutes, []);
  useEffect(() => {
    document.addEventListener('pointerover', prefetchIntent, { passive: true });
    document.addEventListener('touchstart', prefetchIntent, { passive: true });
    document.addEventListener('focusin', prefetchIntent);
    return () => {
      document.removeEventListener('pointerover', prefetchIntent);
      document.removeEventListener('touchstart', prefetchIntent);
      document.removeEventListener('focusin', prefetchIntent);
    };
  }, []);
  // The site layout animates its own page transitions; only switching between site and admin remounts the shell.
  const area = location.pathname.startsWith('/admin') ? 'admin' : 'site';

  return (
    <>
    {/* "View as client": persistent read-only bar (renders nothing otherwise). */}
    <ImpersonationGate />
    {/* Updated AGB / privacy policy to re-accept (signed-in users only; renders nothing otherwise). */}
    <LegalGateHost />
    <Suspense fallback={<PageLoader />}>
      <Routes location={location} key={area}>
          <Route element={<SiteLayout />}>
            <Route index element={<Home />} />
            <Route path="about" element={<About />} />
            <Route path="tools" element={<ToolsPage />} />
            <Route path="widgets" element={<WidgetsPage />} />
            <Route path="for-workers" element={<ForWorkers />} />
            <Route path="for-employers" element={<ForEmployers />} />
            {/* Short / guessable aliases of the new pages. */}
            <Route path="calculators" element={<Navigate to="/tools" replace />} />
            <Route path="workers" element={<Navigate to="/for-workers" replace />} />
            <Route path="candidates" element={<Navigate to="/for-workers" replace />} />
            <Route path="employers" element={<Navigate to="/for-employers" replace />} />
            <Route path="services" element={<Services />} />
            <Route path="services/:slug" element={<ServiceDetail />} />
            <Route path="eligibility" element={<Eligibility />} />
            <Route path="uygunluq-testi" element={<EligibilityQuiz />} />
            <Route path="path-finder" element={<PathFinder />} />
            <Route path="start" element={<StartHere />} />
            <Route path="start/plan" element={<StartPlan />} />
            <Route path="visas" element={<Visas />} />
            <Route path="visas/:slug" element={<VisaDetail />} />
            <Route path="partners" element={<Partners />} />
            <Route path="stories" element={<Stories />} />
            <Route path="ausbildung" element={<Ausbildung />} />
            <Route path="faq" element={<FaqPage />} />
            <Route path="news" element={<News />} />
            <Route path="salary-calculator" element={<SalaryCalculator />} />
            <Route path="anerkennung" element={<AnerkennungGuide />} />
            <Route path="cities" element={<CitiesGuide />} />
            <Route path="guides" element={<Guides />} />
            <Route path="search" element={<SearchPage />} />
            <Route path="compare-visas" element={<CompareVisas />} />
            <Route path="ebook/:slug" element={<EbookPage />} />
            <Route path="job-alert" element={<JobAlertManage />} />
            <Route path="vacancy-request" element={<VacancyRequestManage />} />
            <Route path="job-alert/germany" element={<JobAlertGermanyManage />} />
            <Route path="result-email" element={<ResultEmailManage />} />
            <Route path="rate-alert" element={<RateAlertManage />} />
            <Route path="guides/:slug" element={<GuideDetail />} />
            <Route path="chancenkarte-calculator" element={<ChancenkarteCalculator />} />
            <Route path="blue-card-check" element={<BlueCardCheck />} />
            <Route path="calculator" element={<StartCalculator />} />
            <Route path="map" element={<PlacementMapPage />} />
            <Route path="events" element={<InfoEvents />} />
            <Route path="events/:slug" element={<InfoEventDetail />} />
            <Route path="cost-calculator" element={<CostCalculatorPage />} />
            <Route path="budget" element={<BudgetPage />} />
            <Route path="life-in-germany" element={<LifeInGermanyPage />} />
            <Route path="phrase-of-the-day" element={<PhraseOfTheDayPage />} />
            <Route path="when-in-germany" element={<WhenInGermanyPage />} />
            <Route path="payslip-explained" element={<PayslipExplainedPage />} />
            <Route path="german-apartment" element={<GermanApartmentPage />} />
            <Route path="work-scenes" element={<WorkScenesHub />} />
            <Route path="work-scenes/restaurant-kitchen" element={<WorkSceneKitchen />} />
            <Route path="work-scenes/truck-cab" element={<WorkSceneTruck />} />
            <Route path="work-scenes/hospital-ward" element={<WorkSceneHospital />} />
            <Route path="work-scenes/construction-site" element={<WorkSceneConstruction />} />
            <Route path="work-scenes/electrical-panel" element={<WorkSceneElectrical />} />
            <Route path="for/:profession" element={<ProfessionHubPage />} />
            <Route path="residence-card-explained" element={<ResidenceCardExplainedPage />} />
            <Route path="shortage-barometer" element={<ShortageBarometerPage />} />
            <Route path="tax-refund-calculator" element={<TaxRefundCalculatorPage />} />
            <Route path="shift-pay-calculator" element={<ShiftPayCalculatorPage />} />
            <Route path="driving-time-calculator" element={<DrivingTimeCalculatorPage />} />
            <Route path="work-schedule-check" element={<WorkScheduleCheckPage />} />
            <Route path="tax-class-chooser" element={<TaxClassChooserPage />} />
            <Route path="employer-cost-calculator" element={<EmployerCostCalculatorPage />} />
            <Route path="rent-check" element={<RentCheckPage />} />
            <Route path="real-salaries" element={<RealSalariesPage />} />
            <Route path="health-insurance-comparison" element={<HealthInsuranceComparisonPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="emergency-wallpaper" element={<EmergencyWallpaperPage />} />
            <Route path="holiday-planner" element={<HolidayPlannerPage />} />
            <Route path="grade-converter" element={<GradeConverterPage />} />
            <Route path="weekend-trips" element={<WeekendTripsPage />} />
            <Route path="employer-guide-azerbaijan" element={<EmployerGuideAzerbaijanPage />} />
            <Route path="azerbaijan-in-germany" element={<AzerbaijanInGermanyPage />} />
            <Route path="which-city" element={<WhichCityPage />} />
            <Route path="permanent-residence" element={<PermanentResidencePage />} />
            <Route path="apartment-viewing" element={<ApartmentViewingPage />} />
            <Route path="send-money-home" element={<SendMoneyHomePage />} />
            <Route path="workplace-etiquette" element={<WorkplaceEtiquettePage />} />
            <Route path="novruz-card" element={<NovruzCardPage />} />
            <Route path="pocket-guide" element={<PocketGuidePage />} />
            <Route path="five-years-in-germany" element={<FiveYearsInGermanyPage />} />
            <Route path="germany-vs-other-countries" element={<CountryComparePage />} />
            <Route path="visa-refusal" element={<VisaRefusalPage />} />
            <Route path="visa-document-checklist" element={<VisaChecklistPage />} />
            <Route path="driving-licence-germany" element={<DrivingLicencePage />} />
            <Route path="family-reunification-check" element={<FamilyReunificationCheckPage />} />
            <Route path="german-simulator" element={<GermanSimulatorPage />} />
            <Route path="pronunciation" element={<PronunciationPage />} />
            <Route path="price-game" element={<PriceGamePage />} />
            <Route path="traffic-signs" element={<TrafficSignsPage />} />
            <Route path="waste-sorting" element={<WasteSortingPage />} />
            <Route path="german-street" element={<GermanStreetPage />} />
            <Route path="ticket-machine" element={<TicketMachinePage />} />
            <Route path="supermarket-game" element={<SupermarketGamePage />} />
            <Route path="advent-calendar" element={<AdventCalendarPage />} />
            <Route path="changes-2027" element={<Changes2027Page />} />
            <Route path="german-mock-exam" element={<GermanMockExamPage />} />
            <Route path="german-mock-exam/a1" element={<GermanMockExamPage level="a1" />} />
            <Route path="german-mock-exam/b1" element={<GermanMockExamPage level="b1" />} />
            <Route path="german-level-test-self" element={<GermanLevelSelfPage />} />
            <Route path="l/:slug" element={<LandingPageView />} />
            <Route path="survey/:token" element={<SurveyAnswer />} />
            <Route path="success/:token" element={<SuccessSharePage />} />
            <Route path="certificate/:code" element={<CertificateVerify />} />
            <Route path="arrival-certificate/:code" element={<ArrivalCertificateVerify />} />
            <Route path="ready-certificate/:code" element={<ReadyCertificateVerify />} />
            <Route path="originals/verify/:code" element={<OriginalsVerify />} />
            <Route path="upload/:token" element={<UploadByLink />} />
            <Route path="r/review/:token" element={<GoogleReviewRedirect />} />
            <Route path="r/review/:token/optout" element={<GoogleReviewOptOut />} />
            <Route path="r/rate/:token" element={<GoogleReviewRate />} />
            <Route path="r/rate/:token/google" element={<GoogleReviewRateRedirect />} />
            <Route path="r/:slug" element={<ReferralLandingPage />} />
            <Route path="referral-terms" element={<ReferralTermsPage />} />
            <Route path="check-in/:key" element={<CheckInAnswer />} />
            <Route path="unsubscribe" element={<Unsubscribe />} />
            <Route path="news/:slug" element={<NewsDetail />} />
            <Route path="contact" element={<Contact />} />
            <Route path="cooperation" element={<Cooperation />} />
            <Route path="developers" element={<DevelopersPage />} />
            <Route path="accessibility" element={<AccessibilityPage />} />
            <Route path="status" element={<StatusPage />} />
            <Route path="trust" element={<TrustPage />} />
            <Route path="kandidaten" element={<CandidateCataloguePage />} />
            <Route path="login" element={<Login />} />
            <Route path="register" element={<Register />} />
            <Route path="p/:code" element={<PartnerLink />} />
            <Route path="forgot-password" element={<ForgotPassword />} />
            <Route path="reset-password" element={<ResetPassword />} />
            <Route path="verify-email" element={<VerifyEmail />} />
            <Route path="confirm-email-change" element={<ConfirmEmailChange />} />
            <Route path="login/2fa" element={<TwoFactor />} />
            <Route path="impressum" element={<Impressum />} />
            <Route path="privacy" element={<Privacy />} />
            <Route path="agb" element={<TermsPage />} />
            <Route path="terms" element={<TermsPage />} />
            <Route path="cookies" element={<CookiesPage />} />
            <Route path="legal/:kind/:version" element={<LegalArchivedVersion />} />
            <Route path="jobs" element={<Jobs />} />
            <Route path="study" element={<StudyCatalogue />} />
            <Route path="study/:slug" element={<StudyProgrammeDetail />} />
            <Route path="glossary" element={<GlossaryIndex />} />
            <Route path="glossary/:slug" element={<GlossaryTermPage />} />
            <Route path="platform" element={<PlatformPage />} />
            <Route path="jobs/germany" element={<GermanyJobs />} />
            <Route path="jobs/germany/search" element={<GermanyJobs />} />
            <Route path="jobs/:slug" element={<JobDetail />} />
            <Route path="jobs/in/:city/:profession" element={<JobLanding />} />
            <Route path="compare-jobs" element={<JobCompare />} />
            <Route path="employers/register" element={<EmployerRegister />} />
            <Route
              path="company/*"
              element={
                <RequireAuth roles={['COMPANY']}>
                  <CompanyApp />
                </RequireAuth>
              }
            />
            <Route
              path="agent/*"
              element={
                <RequireAuth roles={['AGENT']}>
                  <AgentApp />
                </RequireAuth>
              }
            />
            <Route
              path="partner/*"
              element={
                <RequireAuth roles={['AGENT']}>
                  <PartnerApp />
                </RequireAuth>
              }
            />
            <Route path="booking" element={<Booking />} />
            <Route path="booking/manage" element={<BookingManage />} />
            <Route path="review" element={<ReviewPage />} />
            <Route path="sign/:token" element={<SignPage />} />
            <Route path="angebot/:token" element={<QuotePage />} />
            <Route path="packages" element={<PackagesPage />} />
            <Route path="packages/order/:token" element={<PackageOrderStatus />} />
            <Route path="share/:token" element={<SharePage />} />
            <Route path="kandidat/:token" element={<CandidateSharePage />} />
            <Route path="q/:caseId" element={<QrRedirect />} />
            <Route
              path="account"
              element={
                <RequireAuth roles={['CLIENT']}>
                  <AccountLayout />
                </RequireAuth>
              }
            >
              <Route index element={<AccountHome />} />
              <Route path="cases" element={<AccountCases />} />
              <Route path="cases/:id" element={<CaseView />} />
              <Route path="cases/:id/forms/:formId" element={<AccountCaseForm />} />
              <Route path="cases/:id/confirm" element={<AccountConfirmData />} />
              <Route path="notifications" element={<Notifications />} />
              <Route path="profile" element={<Profile />} />
              <Route path="applications" element={<AccountApplications />} />
              <Route path="saved-jobs" element={<AccountSavedJobs />} />
              <Route path="job-applications" element={<AccountExternalApplications />} />
              <Route path="onboarding" element={<AccountOnboarding />} />
              <Route path="housing" element={<AccountHousing />} />
              <Route path="german" element={<AccountGerman />} />
              <Route path="interviews" element={<AccountInterviews />} />
              <Route path="privacy" element={<AccountPrivacyCenter />} />
              <Route path="waiting-room" element={<AccountWaitingRoom />} />
              <Route path="course" element={<AccountCourse />} />
              <Route path="course/:courseId" element={<AccountCourse />} />
              <Route path="course/:courseId/lesson/:lessonId" element={<AccountCourse />} />
              <Route path="guides" element={<AccountGuides />} />
              <Route path="cv" element={<AccountCv />} />
              <Route path="letters/*" element={<AccountLetters />} />
              <Route path="letters-explain" element={<AccountLetterExplain />} />
              <Route path="vault" element={<AccountVault />} />
              <Route path="referral" element={<AccountReferral />} />
              <Route path="arrival" element={<AccountArrival />} />
              <Route path="arrival-prep" element={<AccountArrivalPrep />} />
              <Route path="arrival-card" element={<AccountArrivalCard />} />
              <Route path="readiness" element={<AccountReadiness />} />
              <Route path="germany-ready" element={<AccountGermanyReady />} />
              <Route path="future-letter" element={<AccountFutureLetter />} />
              <Route path="rate-alerts" element={<AccountRateAlerts />} />
              <Route path="pocket-guide" element={<AccountPocketGuide />} />
              <Route path="emergency-wallpaper" element={<AccountEmergencyWallpaper />} />
              <Route path="badges" element={<AccountBadges />} />
              <Route path="visa-story/:caseId" element={<AccountVisaStory />} />
              <Route path="rule-changes" element={<AccountRuleChanges />} />
              <Route path="checklist" element={<AccountDocChecklist />} />
              <Route path="budget" element={<AccountBudget />} />
              <Route path="interview-prep" element={<AccountInterviewPrep />} />
              <Route path="signatures" element={<AccountSignatures />} />
              <Route path="signatures/:signerId" element={<AccountSignatures />} />
              <Route path="payments" element={<AccountPayments />} />
              <Route path="all" element={<AccountAllTools />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Route>

          {/* Team workspace: full-screen documents + tasks for staff (outside the site and admin layouts). */}
          <Route
            path="workspace"
            element={
              <RequireAuth roles={['STAFF', 'ADMIN', 'SUPER_ADMIN']}>
                <WorkspaceLayout />
              </RequireAuth>
            }
          >
            <Route index element={<Navigate to="home" replace />} />
            <Route path="home" element={<WorkspaceHome />} />
            <Route path="sheet/:id" element={<SheetEditor />} />
            <Route path="pdf/:nodeId" element={<PdfEditor />} />
            <Route path="drive/*" element={<WorkspaceDrive />} />
            <Route path="tasks/*" element={<WorkspaceTasks />} />
            <Route path="mail/*" element={<WorkspaceMail />} />
            <Route path="chat/*" element={<WorkspaceChat />} />
            <Route path="calendar/*" element={<WorkspaceCalendar />} />
            <Route path="contacts/*" element={<WorkspaceContacts />} />
            <Route path="team/*" element={<WorkspaceTeam />} />
            <Route path="live-chats" element={<WorkspaceLiveChats />} />
            <Route path="settlements/*" element={<AdminSettlements />} />
          </Route>

          {/* Office wall TV: outside the admin layout and login (a read-only display token, or the staff session). */}
          {/* Embeddable widgets: minimal chrome for iframes on other sites (framing allowed for /embed/* only, deploy/Caddyfile). */}
          <Route path="embed/:widget" element={<EmbedPage />} />
          <Route path="admin/tv" element={<AdminTvDisplay />} />
          <Route
            path="admin"
            element={
              <RequireAuth roles={['STAFF', 'ADMIN', 'SUPER_ADMIN']}>
                <AdminLayout />
              </RequireAuth>
            }
          >
            <Route index element={<AdminIndex />} />
            <Route path="today" element={<AdminToday />} />
            <Route path="my-day" element={<AdminMyDay />} />
            <Route
              path="system/modules"
              element={
                <RequireAuth roles={['SUPER_ADMIN']}>
                  <AdminModules />
                </RequireAuth>
              }
            />
            <Route
              path="system/usage"
              element={
                <RequireAuth roles={['SUPER_ADMIN']}>
                  <AdminUsage />
                </RequireAuth>
              }
            />
            <Route
              path="system/brand"
              element={
                <RequireAuth roles={['SUPER_ADMIN']}>
                  <AdminBrand />
                </RequireAuth>
              }
            />
            <Route
              path="system/license"
              element={
                <RequireAuth roles={['SUPER_ADMIN']}>
                  <AdminLicense />
                </RequireAuth>
              }
            />
            <Route
              path="system/customers"
              element={
                <RequireAuth roles={['SUPER_ADMIN']}>
                  <AdminCustomers />
                </RequireAuth>
              }
            />
            <Route
              path="system/onboarding"
              element={
                <RequireAuth roles={['SUPER_ADMIN']}>
                  <AdminOnboarding />
                </RequireAuth>
              }
            />
            <Route path="dashboard" element={<AdminDashboard />} />
            <Route
              path="oversight"
              element={
                <RequireAuth roles={['SUPER_ADMIN']}>
                  <AdminOversight />
                </RequireAuth>
              }
            />
            <Route
              path="oversight/staff/:id"
              element={
                <RequireAuth roles={['SUPER_ADMIN']}>
                  <AdminStaffDetail />
                </RequireAuth>
              }
            />
            <Route
              path="ai"
              element={
                <RequireAuth roles={['SUPER_ADMIN']}>
                  <AdminAi />
                </RequireAuth>
              }
            />
            <Route
              path="ai/settings"
              element={
                <RequireAuth roles={['SUPER_ADMIN']}>
                  <AdminAiSettings />
                </RequireAuth>
              }
            />
            <Route
              path="weekly-reports"
              element={
                <RequireAuth roles={['SUPER_ADMIN']}>
                  <AdminWeeklyReports />
                </RequireAuth>
              }
            />
            <Route
              path="security-alerts"
              element={
                <RequireAuth roles={['SUPER_ADMIN']}>
                  <AdminSecurityAlerts />
                </RequireAuth>
              }
            />
            <Route
              path="sensitive-access"
              element={
                <RequireAuth roles={['SUPER_ADMIN']}>
                  <AdminSensitiveAccess />
                </RequireAuth>
              }
            />
            <Route
              path="access"
              element={
                <RequireAuth roles={['ADMIN', 'SUPER_ADMIN']}>
                  <AdminAccessCenter />
                </RequireAuth>
              }
            />
            <Route
              path="ai/mail-triage"
              element={
                <RequireAuth roles={['SUPER_ADMIN']}>
                  <AdminAiMailTriage />
                </RequireAuth>
              }
            />
            <Route path="cases" element={<AdminCases />} />
            <Route path="review" element={<AdminReview />} />
            <Route path="inbox" element={<AdminInbox />} />
            <Route path="notifications" element={<AdminNotifications />} />
            <Route path="cases/:id" element={<AdminCase />} />
            <Route path="inquiries" element={<AdminInquiries />} />
            <Route path="calls" element={<AdminCalls />} />
            <Route path="users" element={<AdminUsers />} />
            <Route path="clients/:id" element={<AdminClient360 />} />
            <Route path="team-load" element={<AdminTeamLoad />} />
            <Route path="canned-replies" element={<AdminCannedReplies />} />
            <Route path="cover-letter-templates" element={<AdminCoverLetterTemplates />} />
            <Route
              path="mailboxes"
              element={
                <RequireAuth roles={['ADMIN', 'SUPER_ADMIN']}>
                  <AdminMailboxes />
                </RequireAuth>
              }
            />
            <Route path="docs" element={<Navigate to="/workspace/drive" replace />} />
            <Route path="docs/audit" element={<AdminDocsAudit />} />
            <Route path="content/:resource" element={<AdminContent />} />
            <Route path="guides" element={<AdminGuides />} />
            <Route path="tool-analytics" element={<AdminToolAnalytics />} />
            <Route
              path="search-performance"
              element={
                <RequireAuth roles={['ADMIN', 'SUPER_ADMIN']}>
                  <AdminSearchPerformance />
                </RequireAuth>
              }
            />
            <Route path="settings" element={<AdminSettings />} />
            <Route
              path="design-system"
              element={
                <RequireAuth roles={['ADMIN', 'SUPER_ADMIN']}>
                  <AdminDesignSystem />
                </RequireAuth>
              }
            />
            <Route path="security" element={<AdminSecurity />} />
            <Route path="companies" element={<AdminCompanies />} />
            <Route path="companies/:id" element={<AdminCompanyProfile />} />
            <Route path="vacancies" element={<AdminVacancies />} />
            <Route path="job-channels" element={<RequireAuth roles={['ADMIN', 'SUPER_ADMIN']}><AdminJobChannels /></RequireAuth>} />
            <Route path="candidates" element={<AdminCandidates />} />
            <Route path="bookings" element={<AdminBookings />} />
            <Route path="client-tasks" element={<AdminClientTasks />} />
            <Route
              path="invoices"
              element={
                <RequireAuth roles={['ADMIN', 'SUPER_ADMIN']}>
                  <AdminInvoices />
                </RequireAuth>
              }
            />
            <Route
              path="quotes"
              element={
                <RequireAuth roles={['ADMIN', 'SUPER_ADMIN']}>
                  <AdminQuotes />
                </RequireAuth>
              }
            />
            <Route
              path="client-invoices"
              element={
                <RequireAuth roles={['ADMIN', 'SUPER_ADMIN']}>
                  <AdminClientInvoices />
                </RequireAuth>
              }
            />
            <Route
              path="packages"
              element={
                <RequireAuth roles={['ADMIN', 'SUPER_ADMIN']}>
                  <AdminPackages />
                </RequireAuth>
              }
            />
            <Route
              path="accounting"
              element={
                <RequireAuth roles={['ADMIN', 'SUPER_ADMIN']}>
                  <AdminAccounting />
                </RequireAuth>
              }
            />
            <Route
              path="countersign"
              element={
                <RequireAuth roles={['ADMIN', 'SUPER_ADMIN']}>
                  <AdminCountersign />
                </RequireAuth>
              }
            />
            <Route
              path="trust"
              element={
                <RequireAuth roles={['ADMIN', 'SUPER_ADMIN']}>
                  <AdminTrust />
                </RequireAuth>
              }
            />
            <Route path="reviews" element={<AdminReviews />} />
            <Route path="analytics" element={<AdminAnalytics />} />
            <Route path="overview" element={<AdminOverview />} />
            <Route path="messaging" element={<AdminMessaging />} />
            <Route path="kanban" element={<AdminKanban />} />
            <Route path="kb" element={<AdminKnowledgeBase />} />
            <Route path="help" element={<AdminHelp />} />
            <Route path="tasks/*" element={<WorkspaceTasks />} />
            <Route path="announcements" element={<AdminAnnouncements />} />
            <Route path="arrivals/*" element={<AdminArrivals />} />
            <Route path="partner-housing" element={<AdminPartnerHousing />} />
            <Route path="expiring" element={<AdminExpiring />} />
            <Route path="recognition" element={<AdminRecognition />} />
            <Route path="data-quality" element={<AdminDataQuality />} />
            <Route path="rule-changes" element={<AdminRuleChanges />} />
            <Route path="accelerated" element={<AdminAccelerated />} />
            <Route path="authorities/*" element={<AdminAuthorities />} />
            <Route path="family-reunion" element={<AdminFamilyReunion />} />
            <Route path="originals" element={<AdminOriginals />} />
            <Route
              path="duplicates"
              element={
                <RequireAuth roles={['ADMIN', 'SUPER_ADMIN']}>
                  <AdminDuplicates />
                </RequireAuth>
              }
            />
            <Route
              path="history"
              element={
                <RequireAuth roles={['ADMIN', 'SUPER_ADMIN']}>
                  <AdminHistory />
                </RequireAuth>
              }
            />
            <Route path="q/:caseId" element={<QrRedirect />} />
            <Route
              path="storage"
              element={
                <RequireAuth roles={['ADMIN', 'SUPER_ADMIN']}>
                  <AdminStorageReport />
                </RequireAuth>
              }
            />
            {/* Admins + the staff member chosen in its settings (the API decides; others see "no access"). */}
            <Route path="problems" element={<AdminProblemReports />} />
            <Route
              path="browser-errors"
              element={
                <RequireAuth roles={['ADMIN', 'SUPER_ADMIN']}>
                  <AdminBrowserErrors />
                </RequireAuth>
              }
            />
            <Route path="partners/*" element={<AdminPartners />} />
            <Route path="register" element={<AdminClientRegister />} />
            <Route path="settlements/*" element={<AdminSettlements />} />
            <Route path="interview-prep" element={<AdminInterviewPrep />} />
            <Route path="finance/*" element={<AdminFinance />} />
            <Route path="reports" element={<AdminReports />} />
            <Route path="profitability" element={<AdminProfitability />} />
            <Route
              path="business-analytics"
              element={
                <RequireAuth roles={['ADMIN', 'SUPER_ADMIN']}>
                  <AdminBizAnalytics />
                </RequireAuth>
              }
            />
            <Route path="surveys/*" element={<AdminSurveys />} />
            <Route path="time" element={<AdminTimeTracking />} />
            <Route path="year-review" element={<AdminYearReview />} />
            <Route path="quarterly-report" element={<AdminQuarterlyReport />} />
            <Route path="employer-checklist-templates" element={<AdminEmployerChecklistTemplates />} />
            <Route path="real-salaries" element={<AdminRealSalaries />} />
            <Route path="public-api-keys" element={<RequireAuth roles={['ADMIN', 'SUPER_ADMIN']}><AdminPublicApiKeys /></RequireAuth>} />
            <Route
              path="kpi"
              element={
                <RequireAuth roles={['ADMIN', 'SUPER_ADMIN']}>
                  <AdminKpi />
                </RequireAuth>
              }
            />
            <Route path="training" element={<AdminTraining />} />
            <Route path="whats-new" element={<AdminWhatsNew />} />
            <Route path="training-checklist" element={<AdminTrainingChecklist />} />
            <Route
              path="setup-checklist"
              element={
                <RequireAuth roles={['ADMIN', 'SUPER_ADMIN']}>
                  <AdminSetupChecklist />
                </RequireAuth>
              }
            />
            <Route path="course" element={<AdminCourse />} />
            <Route path="shifts" element={<AdminShifts />} />
            <Route path="check-ins" element={<AdminCheckIns />} />
            <Route
              path="campaigns/*"
              element={
                <RequireAuth roles={['ADMIN', 'SUPER_ADMIN']}>
                  <AdminCampaigns />
                </RequireAuth>
              }
            />
            <Route path="events" element={<AdminGrowthEvents />} />
            <Route path="study" element={<AdminStudyProgrammes />} />
            <Route path="site-tools" element={<AdminGrowthTools />} />
            <Route
              path="tv-settings"
              element={
                <RequireAuth roles={['ADMIN', 'SUPER_ADMIN']}>
                  <AdminTvSettings />
                </RequireAuth>
              }
            />
            <Route
              path="city-costs"
              element={
                <RequireAuth roles={['ADMIN', 'SUPER_ADMIN']}>
                  <AdminCityCosts />
                </RequireAuth>
              }
            />
            <Route path="past-placements" element={<AdminPastPlacements />} />
            <Route path="germany-ready" element={<AdminGermanyReady />} />
            <Route
              path="data-freshness"
              element={
                <RequireAuth roles={['ADMIN', 'SUPER_ADMIN']}>
                  <AdminDataFreshness />
                </RequireAuth>
              }
            />
            <Route path="landing-pages/*" element={<AdminLandingPages />} />
            <Route path="lead-magnets" element={<AdminLeadMagnets />} />
            <Route path="contract-templates/*" element={<AdminContractTemplates />} />
            <Route path="candidate-requests/*" element={<AdminCandidateRequests />} />
            <Route path="candidate-pool" element={<AdminCandidatePool />} />
            <Route path="skill-videos" element={<AdminSkillVideos />} />
            <Route path="agents/*" element={<AdminAgents />} />
            <Route path="translations/*" element={<AdminTranslations />} />
            <Route path="privacy-requests/*" element={<AdminPrivacyRequests />} />
            <Route path="waiting-room" element={<AdminWaitingRoom />} />
            <Route
              path="legal/*"
              element={
                <RequireAuth roles={['ADMIN', 'SUPER_ADMIN']}>
                  <AdminLegal />
                </RequireAuth>
              }
            />
            <Route path="integrations" element={<AdminIntegrations />} />
            <Route
              path="automation"
              element={
                <RequireAuth roles={['ADMIN', 'SUPER_ADMIN']}>
                  <AdminAutomation />
                </RequireAuth>
              }
            />
            <Route path="interviews" element={<AdminInterviews />} />
            <Route path="employment-contracts" element={<AdminEmploymentContracts />} />
            <Route path="official-forms" element={<AdminOfficialForms />} />
            <Route path="journey" element={<AdminJourney />} />
            <Route path="exam-dates" element={<AdminGermanExamDates />} />
            <Route path="requirements" element={<AdminRequirements />} />
            <Route path="case-forms" element={<AdminCaseForms />} />
            <Route path="doc-guides" element={<AdminDocGuides />} />
            <Route path="signatures" element={<AdminSignatures />} />
            <Route path="signatures/sign/:signerId" element={<AdminSignatures />} />
          </Route>
        </Routes>
    </Suspense>
    </>
  );
}
