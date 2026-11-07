/*
 * The tenant app's navigation map. One list drives the icon rail, the section panel,
 * breadcrumbs and the "coming soon" pages: a page without its own route is rendered by
 * app/dashboard/[...slug] from the description here.
 */
import type { LucideIcon } from "lucide-react";
import { School, BookMarked, UserCog, Replace, NotebookPen, ArrowBigUpDash, Award, IdCard, Presentation, CalendarX2,
  ClipboardPen, Video, FileSpreadsheet, PencilLine, ScrollText, ChartColumnBig, Sigma, IndianRupee, ReceiptText, Bus,
  BedDouble, BookOpen, CalendarCheck, Wallet2, Bell } from "lucide-react";
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
  /** Institution module this page belongs to; hidden when the institution switches it off
   *  (Settings > Institution profile). Keys: admissions, attendance, timetable, exams, lms,
   *  online_classes, fees, library, transport, hostel, wellbeing, comms, staff_payroll. */
  module?: string;
  /** Portal pages: which portal sign-ins see it. */
  who?: ("parent" | "student")[];
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
  /** "parent" or "student" for portal sign-ins, null for staff. */
  portalRole?: "parent" | "student" | null;
  /** Institution modules switched on (missing = on). */
  modules?: Record<string, boolean>;
};

/** Whether a navigation page is open to this person. */
export function canUse(page: HrPage, a: Access): boolean {
  if (page.module && a.modules && a.modules[page.module] === false) return false;
  if (a.portalRole) return !!page.who?.includes(a.portalRole);
  if (page.who) return false;
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
      { label: "Approvals", href: "/dashboard/inbox", icon: Inbox },
      { label: "My notifications", href: "/dashboard/notifications", icon: BellRing },
      { label: "Tasks", href: "/dashboard/tasks", icon: ListChecks },
      { label: "Documents", href: "/dashboard/documents", icon: FolderOpen },
      { label: "Services", href: "/dashboard/services", icon: Shapes },
      { label: "My assets", href: "/dashboard/assets/mine", icon: Laptop, self: true },
      { label: "My pay", href: "/dashboard/payroll/me", icon: Wallet, self: true },
    ],
  },
  {
    key: "academics",
    label: "Academics",
    icon: School,
    pages: [
      { label: "Classes & sections", href: "/dashboard/academics", icon: School, need: ["academics.view"], exactOnly: true },
      { label: "Subjects", href: "/dashboard/academics/subjects", icon: BookMarked, need: ["academics.view"] },
      { label: "Curriculum", href: "/dashboard/academics/curriculum", icon: ListTree, need: ["academics.view"] },
      { label: "Teacher allocation", href: "/dashboard/academics/allocation", icon: UserCog, need: ["academics.view"] },
      { label: "Sessions & terms", href: "/dashboard/academics/sessions", icon: CalendarRange, need: ["academics.view"] },
      { label: "Rooms & houses", href: "/dashboard/academics/rooms", icon: DoorOpen, need: ["academics.view"] },
      { label: "Timetable", href: "/dashboard/timetable", icon: CalendarClock, need: ["timetable.view"], module: "timetable" },
      { label: "Substitutions", href: "/dashboard/timetable/substitutions", icon: Replace, need: ["timetable.manage"], module: "timetable" },
      { label: "My timetable", href: "/dashboard/timetable/mine", icon: CalendarClock, need: ["timetable.view"], module: "timetable", self: true },
      { label: "Syllabus & lesson plans", href: "/dashboard/lms/lesson-plans", icon: NotebookPen, need: ["lms.view"], module: "lms" },
    ],
  },
  {
    key: "students",
    label: "Students",
    icon: GraduationCap,
    pages: [
      { label: "Students", href: "/dashboard/students", icon: GraduationCap, need: ["students.view"], exactOnly: true },
      { label: "Parents & guardians", href: "/dashboard/students/guardians", icon: UsersRound, need: ["students.view"] },
      { label: "Admissions", href: "/dashboard/admissions", icon: FilePlus2, need: ["admissions.view"], module: "admissions", exactOnly: true },
      { label: "Enquiries", href: "/dashboard/admissions/enquiries", icon: UserSearch, need: ["admissions.view"], module: "admissions" },
      { label: "Applications", href: "/dashboard/admissions/applications", icon: ClipboardList, need: ["admissions.view"], module: "admissions" },
      { label: "Admission settings", href: "/dashboard/admissions/settings", icon: SlidersHorizontal, need: ["admissions.settings.manage"], module: "admissions" },
      { label: "Promotion", href: "/dashboard/students/promotion", icon: ArrowBigUpDash, need: ["students.promote"] },
      { label: "Certificates", href: "/dashboard/certificates", icon: Award, need: ["admissions.certificates.view", "admissions.certificates.manage"], module: "admissions" },
      { label: "ID cards", href: "/dashboard/students/id-cards", icon: IdCard, need: ["students.view"] },
      { label: "Portal sign-ins", href: "/dashboard/students/accounts", icon: KeyRound, need: ["students.portal.manage"] },
    ],
  },
  {
    key: "learning",
    label: "Teaching",
    icon: Presentation,
    pages: [
      { label: "Student attendance", href: "/dashboard/student-attendance", icon: UserCheck, need: ["attendance.view", "attendance.mark", "attendance.mark.any"], module: "attendance" },
      { label: "Mark register", href: "/dashboard/student-attendance/register", icon: ClipboardCheck, need: ["attendance.view", "attendance.mark", "attendance.mark.any"], module: "attendance" },
      { label: "Leave requests", href: "/dashboard/student-attendance/leave", icon: CalendarX2, need: ["attendance.view", "attendance.mark", "attendance.mark.any", "attendance.leave.manage"], module: "attendance" },
      { label: "Attendance reports", href: "/dashboard/student-attendance/reports", icon: ChartColumnBig, need: ["attendance.view", "attendance.mark", "attendance.mark.any"], module: "attendance" },
      { label: "Attendance settings", href: "/dashboard/student-attendance/settings", icon: SlidersHorizontal, need: ["attendance.settings"], module: "attendance" },
      { label: "Homework & assignments", href: "/dashboard/lms/homework", icon: ClipboardPen, need: ["lms.view"], module: "lms" },
      { label: "Study materials", href: "/dashboard/lms/materials", icon: FolderOpen, need: ["lms.view"], module: "lms" },
      { label: "Online classes", href: "/dashboard/lms/online-classes", icon: Video, need: ["lms.view"], module: "online_classes" },
      { label: "Quizzes & tests", href: "/dashboard/lms/quizzes", icon: ListChecks, need: ["lms.view"], module: "lms" },
    ],
  },
  {
    key: "exams",
    label: "Exams",
    icon: FileSpreadsheet,
    pages: [
      { label: "Exams", href: "/dashboard/exams", icon: FileSpreadsheet, need: ["exams.view"], module: "exams" },
      { label: "Marks entry", href: "/dashboard/exams/marks", icon: PencilLine, need: ["exams.marks", "exams.view"], module: "exams" },
      { label: "Results & report cards", href: "/dashboard/exams/report-cards", icon: ScrollText, need: ["exams.view"], module: "exams" },
      { label: "Results analysis", href: "/dashboard/exams/analysis", icon: ChartColumnBig, need: ["exams.view"], module: "exams" },
      { label: "Grading schemes", href: "/dashboard/exams/grading", icon: Sigma, need: ["exams.manage"], module: "exams" },
    ],
  },
  {
    key: "fees",
    label: "Fees",
    icon: IndianRupee,
    pages: [
      { label: "Fees overview", href: "/dashboard/fees", icon: IndianRupee, need: ["fees.view"], module: "fees", exactOnly: true },
      { label: "Collect fees", href: "/dashboard/fees/collect", icon: HandCoins, need: ["fees.collect"], module: "fees" },
      { label: "Invoices", href: "/dashboard/fees/invoices", icon: Receipt, need: ["fees.view"], module: "fees" },
      { label: "Payments & receipts", href: "/dashboard/fees/payments", icon: ReceiptText, need: ["fees.view"], module: "fees" },
      { label: "Fee structures", href: "/dashboard/fees/structures", icon: Layers, need: ["fees.manage"], module: "fees" },
      { label: "Concessions & scholarships", href: "/dashboard/fees/concessions", icon: TicketPercent, need: ["fees.manage"], module: "fees" },
      { label: "Dues & reminders", href: "/dashboard/fees/dues", icon: BellRing, need: ["fees.view"], module: "fees" },
      { label: "Expenses & income", href: "/dashboard/fees/ledger", icon: Landmark, need: ["fees.view"], module: "fees" },
      { label: "Fee reports", href: "/dashboard/fees/reports", icon: FileBarChart, need: ["fees.view"], module: "fees" },
      { label: "Fee settings", href: "/dashboard/fees/settings", icon: SlidersHorizontal, need: ["fees.settings", "fees.view"], module: "fees" },
    ],
  },
  {
    key: "campus",
    label: "Campus",
    icon: Building2,
    pages: [
      { label: "Library", href: "/dashboard/library", icon: Library, need: ["library.view"], module: "library" },
      { label: "Transport", href: "/dashboard/transport", icon: Bus, need: ["transport.view"], module: "transport" },
      { label: "Hostel", href: "/dashboard/hostel", icon: BedDouble, need: ["hostel.view"], module: "hostel" },
      { label: "Health & infirmary", href: "/dashboard/wellbeing/health", icon: HeartPulse, need: ["wellbeing.view"], module: "wellbeing" },
      { label: "Discipline & merits", href: "/dashboard/wellbeing/discipline", icon: ShieldAlert, need: ["wellbeing.view", "wellbeing.counselling"], module: "wellbeing" },
      { label: "Visitors & gate pass", href: "/dashboard/wellbeing/visitors", icon: DoorClosed, need: ["wellbeing.view"], module: "wellbeing" },
      { label: "Inventory & assets", href: "/dashboard/assets", icon: Laptop, need: ["workplace.assets.manage"] },
    ],
  },
  {
    key: "comms",
    label: "Communicate",
    icon: MessagesSquare,
    pages: [
      { label: "Notices & circulars", href: "/dashboard/comms/notices", icon: Megaphone, need: ["comms.view"], module: "comms" },
      { label: "Messages", href: "/dashboard/comms/messages", icon: MessagesSquare, module: "comms" },
      { label: "Events calendar", href: "/dashboard/comms/events", icon: CalendarDays, need: ["comms.view"], module: "comms" },
      { label: "Parent-teacher meetings", href: "/dashboard/comms/ptm", icon: Handshake, need: ["comms.ptm.manage", "comms.view"], module: "comms" },
      { label: "Class diary", href: "/dashboard/comms/diary", icon: NotebookPen, need: ["comms.diary.post"], module: "comms" },
      { label: "Staff room (Buzz)", href: "/dashboard/buzz", icon: Rss },
      { label: "Kudos", href: "/dashboard/kudos", icon: Heart },
      { label: "Staff announcements", href: "/dashboard/announcements", icon: Megaphone },
      { label: "Surveys", href: "/dashboard/surveys", icon: ClipboardList },
      { label: "Help desk", href: "/dashboard/helpdesk", icon: LifeBuoy },
      { label: "Grievances", href: "/dashboard/grievances", icon: ShieldAlert },
    ],
  },
  {
    key: "people",
    label: "Staff",
    icon: Users,
    pages: [
      { label: "Staff directory", href: "/dashboard/staff", icon: UserRound, need: ["people.employees.view"], exactOnly: true },
      { label: "Org chart", href: "/dashboard/org-chart", icon: Network },
      { label: "Departments", href: "/dashboard/departments", icon: Building2, need: ["people.departments.view"] },
      { label: "Designations", href: "/dashboard/designations", icon: BadgeCheck, need: ["people.designations.view"] },
      { label: "Teams", href: "/dashboard/teams", icon: UsersRound },
      { label: "Skills", href: "/dashboard/skills", icon: Lightbulb },
      { label: "Tags", href: "/dashboard/tags", icon: Tags },
      { label: "Staff documents", href: "/dashboard/employee-documents", icon: FileCheck2, need: ["people.documents.verify"] },
      { label: "Letters", href: "/dashboard/documents/letters", icon: FileText, need: ["workplace.letters.manage"] },
      { label: "Staff processes", href: "/dashboard/hr-processes", icon: ArrowRightLeft, need: ["people.processes.manage"] },
    ],
  },
  {
    key: "time",
    label: "Staff time",
    icon: Clock,
    pages: [
      { label: "Staff attendance", href: "/dashboard/attendance", icon: Fingerprint },
      { label: "Team attendance", href: "/dashboard/attendance/team", icon: UserCheck, need: ["time.attendance.manage", "time.roster.manage"], team: true },
      { label: "Attendance admin", href: "/dashboard/attendance/admin", icon: ClipboardCheck, need: ["time.attendance.manage"] },
      { label: "Attendance reports", href: "/dashboard/attendance/reports", icon: FileClock, need: ["time.attendance.manage"] },
      { label: "Staff leave", href: "/dashboard/leave", icon: Plane },
      { label: "Team leave", href: "/dashboard/leave/team", icon: CalendarCheck2, need: ["time.leave.approve", "time.leave.manage"], team: true },
      { label: "Leave admin", href: "/dashboard/leave/admin", icon: ShieldCheck, need: ["time.leave.manage"] },
      { label: "Leave reports", href: "/dashboard/leave/reports", icon: FileBarChart, need: ["time.leave.manage"] },
      { label: "Holidays", href: "/dashboard/holidays", icon: CalendarDays },
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
      { label: "Final settlements", href: "/dashboard/settlements", icon: FileSignature, need: ["payroll.view", "payroll.settlements.manage"] },
    ],
  },
  {
    key: "talent",
    label: "HR",
    icon: Sprout,
    pages: [
      { label: "Staff hiring", href: "/dashboard/recruitment", icon: Briefcase, need: ["talent.hiring.manage"] },
      { label: "Candidates", href: "/dashboard/recruitment/candidates", icon: UserSearch, need: ["talent.hiring.manage"] },
      { label: "Interviews", href: "/dashboard/recruitment/interviews", icon: CalendarClock },
      { label: "Offers", href: "/dashboard/recruitment/offers", icon: FileSignature, need: ["talent.offers.manage", "talent.hiring.manage"] },
      { label: "Onboarding", href: "/dashboard/onboarding", icon: DoorOpen, need: ["talent.onboarding.manage"] },
      { label: "Probation", href: "/dashboard/probation", icon: Hourglass },
      { label: "Reviews", href: "/dashboard/performance", icon: ClipboardCheck },
      { label: "One-to-ones", href: "/dashboard/performance/one-on-ones", icon: Handshake },
      { label: "Feedback", href: "/dashboard/performance/feedback", icon: MessageSquareHeart },
      { label: "Improvement plans", href: "/dashboard/performance/pip", icon: LifeBuoy },
      { label: "Promotions & pay", href: "/dashboard/promotions", icon: TrendingUp, need: ["talent.increments.manage"], team: true },
      { label: "Staff training", href: "/dashboard/learning", icon: GraduationCap },
      { label: "My training", href: "/dashboard/learning/my", icon: BookOpenCheck },
      { label: "Training admin", href: "/dashboard/learning/admin", icon: Library, need: ["talent.learning.manage"] },
      { label: "Exits", href: "/dashboard/exits", icon: LogOut, need: ["talent.exits.manage"] },
      { label: "Clearances", href: "/dashboard/exits/clearances", icon: ClipboardCheck },
      { label: "My resignation", href: "/dashboard/exits/me", icon: DoorClosed, self: true, notOwner: true },
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
      { label: "Institution profile", href: "/dashboard/settings/institution", icon: School, need: ["academics.profile.manage"] },
      { label: "Institution", href: "/dashboard/settings", icon: Building, need: ["settings.company.manage"] },
      { label: "Website", href: "/dashboard/settings/website", icon: AppWindow, need: ["settings.company.manage"] },
      { label: "Campuses & locations", href: "/dashboard/locations", icon: MapPin, need: ["settings.organization.manage"] },
      { label: "Masters", href: "/dashboard/masters", icon: ListTree, need: ["settings.masters.manage"] },
      { label: "Engagement", href: "/dashboard/engage-settings", icon: PartyPopper, need: ["engage.settings.manage"] },
      { label: "Roles & access", href: "/dashboard/roles", icon: KeyRound, need: ["settings.roles.manage"] },
      { label: "Rules", href: "/dashboard/rules", icon: SlidersHorizontal, need: ["settings.rules.manage"] },
      { label: "Approval flows", href: "/dashboard/workflows", icon: Workflow, need: ["settings.workflows.manage"] },
      { label: "Automation", href: "/dashboard/automation", icon: Zap, need: ["settings.automation.manage"] },
      { label: "Notifications", href: "/dashboard/settings/notifications", icon: BellRing, need: ["settings.notifications.manage"] },
      { label: "Hiring and careers page", href: "/dashboard/recruitment/settings", icon: Globe, need: ["talent.hiring.manage"] },
      { label: "Onboarding settings", href: "/dashboard/onboarding/settings", icon: DoorOpen, need: ["talent.onboarding.manage"] },
      { label: "Teaching & learning", href: "/dashboard/lms/settings", icon: MonitorPlay, need: ["lms.settings.manage"], module: "lms" },
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

/*
 * The parent and student portal. Pages live under /dashboard/my/<area>; each module owns
 * its own page there (attendance, timetable, homework, results, fees …).
 */
const BOTH: ("parent" | "student")[] = ["parent", "student"];
export const PORTAL_SECTIONS: HrSection[] = [
  {
    key: "portal",
    label: "My school",
    icon: LayoutGrid,
    pages: [
      { label: "Home", href: "/dashboard", icon: Home, who: BOTH },
      { label: "Profile", href: "/dashboard/my/profile", icon: UserRound, who: BOTH },
      { label: "Attendance", href: "/dashboard/my/attendance", icon: CalendarCheck, who: BOTH, module: "attendance" },
      { label: "Timetable", href: "/dashboard/my/timetable", icon: CalendarClock, who: BOTH, module: "timetable" },
      { label: "Homework", href: "/dashboard/my/homework", icon: ClipboardPen, who: BOTH, module: "lms" },
      { label: "Online classes", href: "/dashboard/my/classes", icon: Video, who: BOTH, module: "online_classes" },
      { label: "Study materials", href: "/dashboard/my/materials", icon: BookOpen, who: BOTH, module: "lms" },
      { label: "Quizzes & tests", href: "/dashboard/my/quizzes", icon: ListChecks, who: BOTH, module: "lms" },
      { label: "Exams & results", href: "/dashboard/my/results", icon: ScrollText, who: BOTH, module: "exams" },
      { label: "Fees", href: "/dashboard/my/fees", icon: Wallet2, who: BOTH, module: "fees" },
      { label: "Notices", href: "/dashboard/my/notices", icon: Megaphone, who: BOTH, module: "comms" },
      { label: "Messages", href: "/dashboard/my/messages", icon: MessagesSquare, who: BOTH, module: "comms" },
      { label: "Events", href: "/dashboard/my/events", icon: CalendarDays, who: BOTH, module: "comms" },
      { label: "Meetings", href: "/dashboard/my/meetings", icon: Handshake, who: ["parent"], module: "comms" },
      { label: "Class diary", href: "/dashboard/my/diary", icon: NotebookPen, who: BOTH, module: "comms" },
      { label: "Leave requests", href: "/dashboard/my/leave", icon: CalendarX2, who: BOTH, module: "attendance" },
      { label: "Library", href: "/dashboard/my/library", icon: Library, who: BOTH, module: "library" },
      { label: "Transport", href: "/dashboard/my/transport", icon: Bus, who: BOTH, module: "transport" },
      { label: "Hostel", href: "/dashboard/my/hostel", icon: BedDouble, who: BOTH, module: "hostel" },
      { label: "Health & merits", href: "/dashboard/my/wellbeing", icon: HeartPulse, who: BOTH, module: "wellbeing" },
      { label: "Notifications", href: "/dashboard/notifications", icon: Bell, who: BOTH },
    ],
  },
];

/** Section rail order: everything except Settings, which sits at the bottom. */
export const MAIN_SECTIONS = HR_SECTIONS.filter((s) => s.key !== "admin");
export const ADMIN_SECTION = HR_SECTIONS.find((s) => s.key === "admin")!;

const ALL_PAGES = [...HR_SECTIONS, ...PORTAL_SECTIONS].flatMap((s) => s.pages.map((p) => ({ ...p, section: s })));

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
  if (a.portalRole) {
    return PORTAL_SECTIONS.map((s) => ({ ...s, pages: s.pages.filter((p) => canUse(p, a)) })).filter((s) => s.pages.length > 0);
  }
  return HR_SECTIONS
    .map((s) => ({ ...s, pages: [...s.pages.filter((p) => canUse(p, a)), ...(extra ?? []).filter((p) => p.sectionKey === s.key)] }))
    .filter((s) => s.pages.length > 0);
}

/** Whether this person may open `pathname`. Addresses outside the navigation map are open
 *  (the page itself decides); an address under a page follows that page's rule. */
export function canOpen(pathname: string, a: Access): boolean {
  if (a.portalRole) {
    // Parents and students only use the portal pages (and their own settings pages).
    if (pathname === "/dashboard" || pathname.startsWith("/dashboard/my/") || pathname === "/dashboard/notifications"
        || pathname.startsWith("/dashboard/profile")) {
      const p = findPage(pathname);
      return !p || !p.who || canUse(p, a);
    }
    return false;
  }
  const page = findPage(pathname);
  if (!page) return true;
  if (page.exactOnly && page.href !== pathname) return true;
  return canUse(page, a);
}
