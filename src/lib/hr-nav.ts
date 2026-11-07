/*
 * The tenant app's navigation map. One list drives the icon rail, the section panel,
 * breadcrumbs and the "coming soon" pages: a page without its own route is rendered by
 * app/dashboard/[...slug] from the description here.
 */
import type { LucideIcon } from "lucide-react";
import { AppWindow, FolderOpen, Shapes, LayoutTemplate } from "lucide-react";
import { Armchair, Compass, GitFork } from "lucide-react";
import { ArchiveRestore, Luggage, PlaneTakeoff, TicketsPlane } from "lucide-react";
import { ArrowRightLeft, BellRing, Zap } from "lucide-react";
import { HeartPulse, PiggyBank, ShieldPlus, TicketPercent } from "lucide-react";
import { ArrowDownUp } from "lucide-react";
import { MonitorPlay, PartyPopper } from "lucide-react";
import { CalendarCheck2, CalendarCog } from "lucide-react";
import { UserCheck, ClipboardCheck, FileClock, Clock3, ScanFace } from "lucide-react";
import { FilePlus2, UserSearch, CalendarClock, Gift, Hourglass, DoorClosed, Globe } from "lucide-react";
import {
  LayoutGrid, Users, Clock, Wallet, Sprout, MessagesSquare, ChartNoAxesColumn, Settings2,
  Home, Sparkles, Inbox, ListChecks,
  UserRound, FileCheck2, Network, Building2, BadgeCheck, UsersRound, Lightbulb, Tags, FileText, Laptop,
  Fingerprint, Timer, CalendarRange, Plane, CalendarDays, Router,
  PlayCircle, Layers, Receipt, Landmark, ReceiptIndianRupee, HandCoins, FileSignature,
  Briefcase, DoorOpen, GraduationCap, Target, TrendingUp, LogOut,
  Rss, Megaphone, ClipboardList, Heart, LifeBuoy, ShieldAlert,
  FileBarChart, PieChart, ShieldCheck, History,
  Building, MapPin, Layers3, Coins, KeyRound, Workflow, SlidersHorizontal, FileCode, Hash, Plug, CreditCard, TextCursorInput, ListTree,
  Scale, Grid3x3, Handshake, MessageSquareHeart, BookOpenCheck, Library, Gauge,
} from "lucide-react";

export type HrPage = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Shown on the placeholder page and as the panel tooltip. */
  intro?: string;
  /** Planned capabilities, listed on the placeholder page. */
  features?: string[];
  /** Shown to people holding any of these permissions (see /roles/my-permissions). */
  need?: string[];
  /** Also shown to people who manage a team (anyone with direct reports). */
  team?: boolean;
  /** Self-service: needs the person's own employee record. */
  self?: boolean;
  /** Not for the company owner (e.g. resigning). */
  notOwner?: boolean;
  /** The access rule covers this exact address only, not the pages below it
   *  (e.g. an employee's profile under the employee list). */
  exactOnly?: boolean;
};

export type HrSection = {
  key: string;
  label: string;
  icon: LucideIcon;
  pages: HrPage[];
};

/** What the signed-in person may use; built from /roles/my-permissions. */
export type Access = {
  permissions: Set<string>;
  /** The HR admin role: every permission. */
  isAdmin: boolean;
  isOwner: boolean;
  hasEmployee: boolean;
  isManager: boolean;
};

/** Whether a navigation page is open to this person. */
export function canUse(page: HrPage, a: Access): boolean {
  if (page.self && !a.hasEmployee) return false;
  if (page.notOwner && a.isOwner) return false;
  if (!page.need || page.need.length === 0 || a.isAdmin) return true;
  if (page.need.some((p) => a.permissions.has(p))) return true;
  return !!page.team && a.isManager;
}

export const HR_SECTIONS: HrSection[] = [
  {
    key: "home",
    label: "Home",
    icon: LayoutGrid,
    pages: [
      { label: "Overview", href: "/dashboard", icon: Home },
      { label: "Assistant", href: "/dashboard/assistant", icon: Sparkles },
      { label: "Approvals", href: "/dashboard/inbox", icon: Inbox },
      { label: "My notifications", href: "/dashboard/notifications", icon: BellRing },
      { label: "Tasks", href: "/dashboard/tasks", icon: ListChecks },
      { label: "Documents", href: "/dashboard/documents", icon: FolderOpen },
      { label: "Services", href: "/dashboard/services", icon: Shapes },
      { label: "My assets", href: "/dashboard/assets/mine", icon: Laptop, self: true },
      { label: "My pay", href: "/dashboard/payroll/me", icon: Wallet, self: true },
      { label: "My benefits", href: "/dashboard/benefits/me", icon: ShieldPlus, self: true },
      { label: "My trips", href: "/dashboard/travel", icon: PlaneTakeoff, self: true, exactOnly: true },
      { label: "Team trips", href: "/dashboard/travel/team", icon: Luggage, need: ["payroll.travel.manage"], team: true },
    ],
  },
  {
    key: "people",
    label: "People",
    icon: Users,
    pages: [
      { label: "Employees", href: "/dashboard/staff", icon: UserRound, need: ["people.employees.view"], exactOnly: true },
      { label: "Org chart", href: "/dashboard/org-chart", icon: Network },
      { label: "Departments", href: "/dashboard/departments", icon: Building2, need: ["people.departments.view"] },
      { label: "Designations", href: "/dashboard/designations", icon: BadgeCheck, need: ["people.designations.view"] },
      { label: "Teams", href: "/dashboard/teams", icon: UsersRound },
      { label: "Skills", href: "/dashboard/skills", icon: Lightbulb },
      { label: "Tags", href: "/dashboard/tags", icon: Tags },
      { label: "Employee documents", href: "/dashboard/employee-documents", icon: FileCheck2, need: ["people.documents.verify"] },
      { label: "Letters", href: "/dashboard/documents/letters", icon: FileText, need: ["workplace.letters.manage"] },
      { label: "HR processes", href: "/dashboard/hr-processes", icon: ArrowRightLeft, need: ["people.processes.manage"] },
      { label: "Assets", href: "/dashboard/assets", icon: Laptop, need: ["workplace.assets.manage"] },
    ],
  },
  {
    key: "time",
    label: "Time",
    icon: Clock,
    pages: [
      { label: "Attendance", href: "/dashboard/attendance", icon: Fingerprint },
      { label: "Team attendance", href: "/dashboard/attendance/team", icon: UserCheck, need: ["time.attendance.manage", "time.roster.manage"], team: true },
      { label: "Attendance admin", href: "/dashboard/attendance/admin", icon: ClipboardCheck, need: ["time.attendance.manage"] },
      { label: "Attendance reports", href: "/dashboard/attendance/reports", icon: FileClock, need: ["time.attendance.manage"] },
      { label: "Timesheets", href: "/dashboard/timesheets", icon: Timer },
      { label: "Leave", href: "/dashboard/leave", icon: Plane },
      { label: "Team leave", href: "/dashboard/leave/team", icon: CalendarCheck2, need: ["time.leave.approve", "time.leave.manage"], team: true },
      { label: "Leave admin", href: "/dashboard/leave/admin", icon: ShieldCheck, need: ["time.leave.manage"] },
      { label: "Leave reports", href: "/dashboard/leave/reports", icon: FileBarChart, need: ["time.leave.manage"] },
      { label: "Shifts & roster", href: "/dashboard/roster", icon: CalendarRange, need: ["time.roster.manage"] },
      { label: "Holidays", href: "/dashboard/holidays", icon: CalendarDays },
      { label: "Devices", href: "/dashboard/devices", icon: Router, need: ["time.attendance.settings"] },
      { label: "Face attendance", href: "/dashboard/face-attendance", icon: ScanFace, need: ["time.face.manage"] },
    ],
  },
  {
    key: "pay",
    label: "Payroll",
    icon: Wallet,
    pages: [
      { label: "Overview", href: "/dashboard/payroll", icon: PieChart, need: ["payroll.view"] },
      { label: "Pay runs", href: "/dashboard/payroll/runs", icon: PlayCircle, need: ["payroll.view"] },
      { label: "Employee salaries", href: "/dashboard/payroll/salaries", icon: Wallet, need: ["payroll.view"] },
      { label: "Salary revisions", href: "/dashboard/payroll/revisions", icon: TrendingUp, need: ["payroll.view"] },
      { label: "Salary structures", href: "/dashboard/salary-structures", icon: Layers, need: ["payroll.view"] },
      { label: "Salary components", href: "/dashboard/payroll/components", icon: Layers3, need: ["payroll.view"] },
      { label: "Income tax", href: "/dashboard/tax", icon: ReceiptIndianRupee, need: ["payroll.view", "payroll.tax.manage"] },
      { label: "Statutory", href: "/dashboard/statutory", icon: Landmark, need: ["payroll.view", "payroll.statutory.manage"] },
      { label: "Expenses", href: "/dashboard/expenses", icon: Receipt, need: ["expenses.manage"] },
      { label: "Loans & advances", href: "/dashboard/loans", icon: HandCoins, need: ["loans.manage"] },
      { label: "Travel desk", href: "/dashboard/travel/desk", icon: TicketsPlane, need: ["payroll.travel.manage"] },
      { label: "Travel policy", href: "/dashboard/travel/policy", icon: Luggage, need: ["payroll.travel.policy"] },
      { label: "Flexible benefits", href: "/dashboard/payroll/flexible-benefits", icon: TicketPercent, need: ["payroll.tax.manage"] },
      { label: "Benefits & insurance", href: "/dashboard/benefits", icon: HeartPulse, need: ["benefits.manage"] },
      { label: "Payroll budgets", href: "/dashboard/payroll/budgets", icon: PiggyBank, need: ["payroll.view"] },
      { label: "Final settlements", href: "/dashboard/settlements", icon: FileSignature, need: ["payroll.view", "payroll.settlements.manage"] },
    ],
  },
  {
    key: "talent",
    label: "Talent",
    icon: Sprout,
    pages: [
      { label: "Hiring", href: "/dashboard/recruitment", icon: Briefcase, need: ["talent.hiring.manage"] },
      { label: "Hiring requests", href: "/dashboard/recruitment/requisitions", icon: FilePlus2 },
      { label: "Candidates", href: "/dashboard/recruitment/candidates", icon: UserSearch, need: ["talent.hiring.manage"] },
      { label: "Interviews", href: "/dashboard/recruitment/interviews", icon: CalendarClock },
      { label: "Offers", href: "/dashboard/recruitment/offers", icon: FileSignature, need: ["talent.offers.manage", "talent.hiring.manage"] },
      { label: "Refer a friend", href: "/dashboard/recruitment/referrals", icon: Gift },
      { label: "Onboarding", href: "/dashboard/onboarding", icon: DoorOpen, need: ["talent.onboarding.manage"] },
      { label: "Probation", href: "/dashboard/probation", icon: Hourglass },
      { label: "Goals & OKRs", href: "/dashboard/goals", icon: Target },
      { label: "Reviews", href: "/dashboard/performance", icon: ClipboardCheck },
      { label: "Calibration", href: "/dashboard/performance/calibration", icon: Scale, need: ["talent.performance.admin"] },
      { label: "Nine-box", href: "/dashboard/performance/nine-box", icon: Grid3x3, need: ["talent.performance.admin"] },
      { label: "One-to-ones", href: "/dashboard/performance/one-on-ones", icon: Handshake },
      { label: "Feedback", href: "/dashboard/performance/feedback", icon: MessageSquareHeart },
      { label: "Improvement plans", href: "/dashboard/performance/pip", icon: LifeBuoy },
      { label: "Promotions & pay", href: "/dashboard/promotions", icon: TrendingUp, need: ["talent.increments.manage"], team: true },
      { label: "Learning", href: "/dashboard/learning", icon: GraduationCap },
      { label: "My learning", href: "/dashboard/learning/my", icon: BookOpenCheck },
      { label: "Learning admin", href: "/dashboard/learning/admin", icon: Library, need: ["talent.learning.manage"] },
      { label: "Positions", href: "/dashboard/positions", icon: Armchair, need: ["talent.positions.view", "talent.positions.manage"], exactOnly: true },
      { label: "Position chart", href: "/dashboard/positions/chart", icon: GitFork, need: ["talent.positions.view", "talent.positions.manage"] },
      { label: "Succession", href: "/dashboard/succession", icon: Layers, need: ["talent.succession.manage"] },
      { label: "Internal jobs", href: "/dashboard/internal-jobs", icon: Compass, exactOnly: true },
      { label: "My applications", href: "/dashboard/internal-jobs/my", icon: ClipboardList, self: true },
      { label: "Exits", href: "/dashboard/exits", icon: LogOut, need: ["talent.exits.manage"] },
      { label: "Clearances", href: "/dashboard/exits/clearances", icon: ClipboardCheck },
      { label: "My resignation", href: "/dashboard/exits/me", icon: DoorClosed, self: true, notOwner: true },
    ],
  },
  {
    key: "engage",
    label: "Engage",
    icon: MessagesSquare,
    pages: [
      { label: "Buzz", href: "/dashboard/buzz", icon: Rss },
      { label: "Kudos", href: "/dashboard/kudos", icon: Heart },
      { label: "Announcements", href: "/dashboard/announcements", icon: Megaphone },
      { label: "Surveys", href: "/dashboard/surveys", icon: ClipboardList },
      { label: "Kiosk screens", href: "/dashboard/kiosk", icon: MonitorPlay, need: ["engage.settings.manage"] },
      { label: "Help desk", href: "/dashboard/helpdesk", icon: LifeBuoy },
      { label: "Grievances", href: "/dashboard/grievances", icon: ShieldAlert },
    ],
  },
  {
    key: "insights",
    label: "Insights",
    icon: ChartNoAxesColumn,
    pages: [
      { label: "Reports", href: "/dashboard/reports", icon: FileBarChart },
      { label: "Dashboards", href: "/dashboard/dashboards", icon: PieChart },
      { label: "Compliance", href: "/dashboard/compliance", icon: ShieldCheck, need: ["insights.compliance.view"] },
      { label: "Audit log", href: "/dashboard/audit", icon: History, need: ["insights.audit.view"] },
    ],
  },
  {
    key: "admin",
    label: "Settings",
    icon: Settings2,
    pages: [
      { label: "Company", href: "/dashboard/settings", icon: Building, need: ["settings.company.manage"] },
      { label: "Company website", href: "/dashboard/settings/website", icon: AppWindow, need: ["settings.company.manage"] },
      { label: "Legal entities", href: "/dashboard/entities", icon: Landmark, need: ["settings.organization.manage"] },
      { label: "Regions & locations", href: "/dashboard/locations", icon: MapPin, need: ["settings.organization.manage"] },
      { label: "Grades", href: "/dashboard/grades", icon: Layers3, need: ["settings.organization.manage"] },
      { label: "Cost centres", href: "/dashboard/cost-centres", icon: Coins, need: ["settings.organization.manage"] },
      { label: "Masters", href: "/dashboard/masters", icon: ListTree, need: ["settings.masters.manage"] },
      { label: "Engagement", href: "/dashboard/engage-settings", icon: PartyPopper, need: ["engage.settings.manage"] },
      { label: "Roles & access", href: "/dashboard/roles", icon: KeyRound, need: ["settings.roles.manage"] },
      { label: "Rules", href: "/dashboard/rules", icon: SlidersHorizontal, need: ["settings.rules.manage"] },
      { label: "Approval flows", href: "/dashboard/workflows", icon: Workflow, need: ["settings.workflows.manage"] },
      { label: "Automation", href: "/dashboard/automation", icon: Zap, need: ["settings.automation.manage"] },
      { label: "Notifications", href: "/dashboard/settings/notifications", icon: BellRing, need: ["settings.notifications.manage"] },
      { label: "Performance settings", href: "/dashboard/performance/settings", icon: Gauge, need: ["talent.performance.admin"] },
      { label: "Hiring and careers page", href: "/dashboard/recruitment/settings", icon: Globe, need: ["talent.hiring.manage"] },
      { label: "Onboarding settings", href: "/dashboard/onboarding/settings", icon: DoorOpen, need: ["talent.onboarding.manage"] },
      { label: "Probation settings", href: "/dashboard/probation/settings", icon: Hourglass, need: ["talent.probation.manage"] },
      { label: "Exit settings", href: "/dashboard/exits/settings", icon: LogOut, need: ["talent.exits.manage"] },
      { label: "Shifts & attendance", href: "/dashboard/attendance/settings", icon: Clock3, need: ["time.attendance.settings"] },
      { label: "Payroll settings", href: "/dashboard/payroll/settings", icon: Wallet, need: ["payroll.settings"] },
      { label: "Leave types", href: "/dashboard/leave/types", icon: Plane, need: ["settings.leave.manage"] },
      { label: "Work week", href: "/dashboard/leave/work-week", icon: CalendarCog, need: ["settings.leave.manage"] },
      { label: "Services & forms", href: "/dashboard/settings/services", icon: LayoutTemplate, need: ["settings.services.manage"] },
      { label: "Custom fields", href: "/dashboard/custom-fields", icon: TextCursorInput, need: ["settings.custom_fields.manage"] },
      { label: "Templates", href: "/dashboard/templates", icon: FileCode, need: ["workplace.letters.manage"] },
      { label: "Numbering", href: "/dashboard/numbering", icon: Hash, need: ["settings.numbering.manage"] },
      { label: "Import & export", href: "/dashboard/settings/import-export", icon: ArrowDownUp, need: ["insights.data.import", "insights.data.export"] },
      { label: "Integrations", href: "/dashboard/settings/integrations", icon: Plug, need: ["settings.integrations.manage"] },
      { label: "Sign-in options", href: "/dashboard/settings/sign-in", icon: KeyRound, need: ["settings.company.manage"] },
      { label: "Recycle bin", href: "/dashboard/settings/recycle-bin", icon: ArchiveRestore, need: ["settings.recycle_bin.manage"] },
      { label: "Subscription", href: "/dashboard/subscription", icon: CreditCard, need: ["settings.company.manage"] },
    ],
  },
];

/** Section rail order: everything except Settings, which sits at the bottom. */
export const MAIN_SECTIONS = HR_SECTIONS.filter((s) => s.key !== "admin");
export const ADMIN_SECTION = HR_SECTIONS.find((s) => s.key === "admin")!;

const ALL_PAGES = HR_SECTIONS.flatMap((s) => s.pages.map((p) => ({ ...p, section: s })));

/** Pages added at run time (custom services), each placed in a section by key. */
export type ExtraPage = HrPage & { sectionKey: string };

function withExtra(extra?: ExtraPage[]) {
  if (!extra?.length) return ALL_PAGES;
  const out = [...ALL_PAGES];
  for (const p of extra) {
    const section = HR_SECTIONS.find((s) => s.key === p.sectionKey) ?? HR_SECTIONS[0];
    out.push({ ...p, section });
  }
  return out;
}

/** The page and section a path belongs to (longest matching href wins). */
export function findPage(pathname: string, extra?: ExtraPage[]) {
  let best: (typeof ALL_PAGES)[number] | null = null;
  for (const p of withExtra(extra)) {
    const hit = p.href === "/dashboard" ? pathname === "/dashboard" : pathname === p.href || pathname.startsWith(p.href + "/");
    if (hit && (!best || p.href.length > best.href.length)) best = p;
  }
  return best;
}

/** Sections and pages a person may see; `extra` pages are already filtered by the API. */
export function visibleSections(a: Access, extra?: ExtraPage[]) {
  return HR_SECTIONS
    .map((s) => ({ ...s, pages: [...s.pages.filter((p) => canUse(p, a)), ...(extra ?? []).filter((p) => p.sectionKey === s.key)] }))
    .filter((s) => s.pages.length > 0);
}

/** Whether this person may open `pathname`. Addresses outside the navigation map are open
 *  (the page itself decides); an address under a page follows that page's rule. */
export function canOpen(pathname: string, a: Access): boolean {
  const page = findPage(pathname);
  if (!page) return true;
  if (page.exactOnly && page.href !== pathname) return true;
  return canUse(page, a);
}
