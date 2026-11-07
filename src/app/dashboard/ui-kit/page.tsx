"use client";

/*
 * Hidden showcase of the UI kit (not in the navigation): /dashboard/ui-kit.
 * Every component with realistic sample data, for visual checks while building pages.
 */
import { useMemo, useState } from "react";
import {
  Ban, Briefcase, Building2, CalendarClock, CheckCircle2, Clock, Download, Laptop, Mail, Pencil, Plus, Trash2,
  UserPlus, Users, Home, Plane,
} from "lucide-react";
import { PageHeader } from "@/components/shell/page";
import {
  Avatar, AvatarGroup, Badge, MasterSelect, Button, Calendar, Checkbox, Chip, DataTable, DateInput, DateRangeInput, Field, FileDrop,
  FilterBar, FormGrid, FormSection, IconButton, KeyValue, Menu, Modal, ModalCancel, MultiSelect, NumberInput, RadioCards,
  Section, Select, Skeleton, SkeletonText, StatCard, StatGrid, Stepper, Tabs, Textarea, TextInput, TimeInput, Timeline,
  Toggle, paginate, useConfirm, useToast, type Column, type FilterValues, type ModalSize, type SelectOption,
} from "@/components/ui-kit";

type Person = { id: number; name: string; email: string; dept: string; role: string; status: "active" | "inactive" | "probation"; joined: string };

const FIRST = ["Asha", "Rahul", "Meera", "Arjun", "Divya", "Karthik", "Neha", "Vikram", "Lakshmi", "Rohan", "Sneha", "Anil", "Priya", "Sanjay", "Fatima", "George"];
const LAST = ["Menon", "Sharma", "Nair", "Iyer", "Pillai", "Reddy", "Kapoor", "Das", "Thomas", "Joseph", "Khan", "Varghese"];
const DEPTS = ["Finance", "Engineering", "Sales", "Operations", "People"];
const ROLES = ["Analyst", "Engineer", "Manager", "Executive", "Lead"];
const PEOPLE: Person[] = Array.from({ length: 57 }, (_, i) => {
  const name = `${FIRST[i % FIRST.length]} ${LAST[(i * 7) % LAST.length]}`;
  return {
    id: i + 1, name, email: `${name.toLowerCase().replace(" ", ".")}@acme.in`, dept: DEPTS[(i * 3) % DEPTS.length], role: ROLES[(i * 5) % ROLES.length],
    status: i % 9 === 0 ? "inactive" : i % 7 === 0 ? "probation" : "active",
    joined: `202${(i % 5) + 1}-${String((i % 12) + 1).padStart(2, "0")}-${String((i % 27) + 1).padStart(2, "0")}`,
  };
});
const STATUS_TONE = { active: "good", inactive: "neutral", probation: "warn" } as const;

const CITY_OPTIONS: SelectOption[] = ["Kochi", "Bengaluru", "Chennai", "Mumbai", "Pune", "Hyderabad", "Delhi", "Kolkata", "Ahmedabad", "Jaipur"].map((c) => ({ value: c.toLowerCase(), label: c }));
const loadPeople = (q: string) => new Promise<SelectOption<number>[]>((res) =>
  setTimeout(() => res(PEOPLE.filter((p) => p.name.toLowerCase().includes(q.toLowerCase())).slice(0, 20).map((p) => ({ value: p.id, label: p.name, description: `${p.role} · ${p.dept}` }))), 350));

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-6">
      <h2 className="mb-5 text-[12px] uppercase tracking-[0.08em] text-faint">{title}</h2>
      {children}
    </section>
  );
}

export default function UiKitPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const [tab, setTab] = useState("overview");
  const [pill, setPill] = useState("week");
  const [size, setSize] = useState<ModalSize | null>(null);
  const [wizard, setWizard] = useState(false);
  const [step, setStep] = useState(0);
  const [detail, setDetail] = useState<Person | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [draft, setDraft] = useState("");

  // fields
  const [text, setText] = useState("");
  const [notes, setNotes] = useState("");
  const [num, setNum] = useState<number | null>(3);
  const [date, setDate] = useState("2026-11-07");
  const [range, setRange] = useState({ from: "", to: "" });
  const [time, setTime] = useState("09:30");
  const [toggle, setToggle] = useState(true);
  const [check, setCheck] = useState(false);
  const [mode, setMode] = useState<string>("office");
  const [city, setCity] = useState<string | null>("kochi");
  const [manager, setManager] = useState<number | null>(null);
  const [cities, setCities] = useState<string[]>(["chennai", "pune"]);
  const [team, setTeam] = useState<number[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [blood, setBlood] = useState<number | null>(null);

  // table
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<FilterValues>({});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [loading, setLoading] = useState(false);
  const filtered = useMemo(() => PEOPLE.filter((p) =>
    (!q || p.name.toLowerCase().includes(q.toLowerCase()) || p.email.includes(q.toLowerCase())) &&
    (!filters.status?.length || filters.status.includes(p.status)) &&
    (!filters.dept?.length || filters.dept.includes(p.dept))), [q, filters]);

  const columns: Column<Person>[] = [
    {
      key: "name", header: "Name", sortable: true, sortValue: (p) => p.name,
      cell: (p) => (
        <div className="flex items-center gap-3">
          <Avatar name={p.name} size={34} />
          <div className="min-w-0"><p className="truncate text-ink">{p.name}</p><p className="truncate text-[12.5px] text-muted">{p.email}</p></div>
        </div>
      ),
    },
    { key: "dept", header: "Department", sortable: true, sortValue: (p) => p.dept, cell: (p) => <span className="text-muted">{p.dept}</span>, hideBelow: "md" },
    { key: "role", header: "Role", cell: (p) => <span className="text-muted">{p.role}</span>, hideBelow: "lg" },
    { key: "joined", header: "Joined", sortable: true, sortValue: (p) => p.joined, cell: (p) => <span className="tabular text-muted">{p.joined}</span>, hideBelow: "sm" },
    { key: "status", header: "Status", cell: (p) => <Badge tone={STATUS_TONE[p.status]} dot>{p.status[0].toUpperCase() + p.status.slice(1)}</Badge> },
  ];

  return (
    <div className="space-y-6 pb-24">
      <PageHeader eyebrow="Internal" title="UI kit" description="Every building block in one place. Add, edit and details open in modals; lists use FilterBar and DataTable."
        actions={<><Button icon={Download}>Export</Button><Button variant="primary" icon={UserPlus} onClick={() => setFormOpen(true)}>Add employee</Button></>} />

      <StatGrid>
        <StatCard label="Headcount" value={128} icon={Users} trend={{ value: "+4", direction: "up" }} hint="this month" />
        <StatCard label="On leave today" value={6} icon={Plane} hint="2 unplanned" />
        <StatCard label="Open positions" value={9} icon={Briefcase} trend={{ value: "-2", direction: "down", good: true }} hint="vs last month" />
        <StatCard label="Attrition" value="3.1%" icon={CalendarClock} trend={{ value: "0.4%", direction: "up", good: false }} hint="trailing 12 months" />
      </StatGrid>

      <Block title="DataTable + FilterBar">
        <FilterBar
          searchPlaceholder="Search by name or email"
          onSearchChange={(v) => { setQ(v); setPage(1); }}
          filters={[
            { key: "status", label: "Status", options: [{ value: "active", label: "Active" }, { value: "probation", label: "Probation" }, { value: "inactive", label: "Inactive" }] },
            { key: "dept", label: "Department", multiple: true, options: DEPTS.map((d) => ({ value: d, label: d })) },
          ]}
          values={filters}
          onChange={(v) => { setFilters(v); setPage(1); }}
          actions={<Button size="sm" onClick={() => { setLoading(true); setTimeout(() => setLoading(false), 1200); }}>Simulate loading</Button>}
        />
        <DataTable
          rows={paginate(filtered, page, pageSize)}
          rowKey={(p) => p.id}
          columns={columns}
          loading={loading}
          onRowClick={setDetail}
          selectable
          bulkActions={[
            { label: "Send email", icon: Mail, onSelect: (rows, clear) => { toast.success(`Email queued for ${rows.length} people`); clear(); } },
            { label: "Deactivate", icon: Ban, danger: true, onSelect: async (rows, clear) => { if (await confirm({ title: `Deactivate ${rows.length} people?`, message: "They will no longer be able to sign in.", confirmLabel: "Deactivate", tone: "danger" })) { toast.success("Deactivated"); clear(); } } },
          ]}
          rowActions={(p) => [
            { label: "View details", icon: Users, onSelect: () => setDetail(p) },
            { label: "Edit", icon: Pencil, onSelect: () => setFormOpen(true) },
            "separator",
            { label: "Delete", icon: Trash2, danger: true, onSelect: () => confirm({ title: `Delete ${p.name}?`, message: "This can't be undone.", confirmLabel: "Delete", tone: "danger", onConfirm: () => new Promise((r) => setTimeout(r, 800)) }).then((ok) => ok && toast.success("Deleted")) },
          ]}
          pagination={{ page, size: pageSize, total: filtered.length, onPageChange: setPage, onSizeChange: (s) => { setPageSize(s); setPage(1); } }}
          emptyTitle="No one matches these filters"
          emptyHint="Try a different search, or clear the filters."
        />
        <div className="mt-6">
          <p className="mb-2 text-[13px] text-muted">Loading skeleton and empty state</p>
          <div className="grid gap-4 lg:grid-cols-2">
            <DataTable rows={[]} rowKey={(p: Person) => p.id} columns={columns.slice(0, 2)} loading skeletonRows={3} />
            <DataTable rows={[]} rowKey={(p: Person) => p.id} columns={columns.slice(0, 2)} emptyTitle="No employees yet" emptyHint="Add people one by one or import a spreadsheet." emptyAction={<Button variant="primary" size="sm" icon={Plus}>Add employee</Button>} />
          </div>
        </div>
      </Block>

      <Block title="Modals">
        <div className="flex flex-wrap gap-2">
          {(["sm", "md", "lg", "xl", "full"] as ModalSize[]).map((s) => <Button key={s} onClick={() => setSize(s)}>Size {s}</Button>)}
          <Button onClick={() => { setStep(0); setWizard(true); }}>Multi-step (Stepper)</Button>
          <Button onClick={() => setFormOpen(true)}>Form with unsaved-changes guard</Button>
          <Button variant="danger" icon={Trash2} onClick={() => confirm({ title: "Delete this department?", message: "Employees keep their records; the department is removed from them.", confirmLabel: "Delete", tone: "danger" }).then((ok) => ok && toast.success("Department deleted"))}>Confirm (danger)</Button>
          <Button onClick={() => confirm({ title: "Publish the roster?", message: "Everyone on it will be notified.", confirmLabel: "Publish" })}>Confirm (primary)</Button>
        </div>
      </Block>

      <Block title="Toasts">
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => toast.success("Employee added")}>Success</Button>
          <Button onClick={() => toast.error("Couldn't save the changes", { description: "The email address is already used by another employee." })}>Error with description</Button>
          <Button onClick={() => toast.warning("Payroll is locked for October")}>Warning</Button>
          <Button onClick={() => toast.info("3 employees archived", { action: { label: "Undo", onClick: () => toast.success("Restored") } })}>Info with action</Button>
        </div>
      </Block>

      <Block title="Tabs and Stepper">
        <Tabs value={tab} onChange={setTab} items={[{ value: "overview", label: "Overview" }, { value: "job", label: "Job", icon: Briefcase }, { value: "leave", label: "Leave", count: 3 }, { value: "docs", label: "Documents" }, { value: "x", label: "Disabled", disabled: true }]} />
        <p className="py-4 text-[13.5px] text-muted">Active tab: {tab}</p>
        <Tabs variant="pill" value={pill} onChange={setPill} items={[{ value: "day", label: "Day" }, { value: "week", label: "Week" }, { value: "month", label: "Month" }]} />
        <div className="mt-8 grid gap-10 lg:grid-cols-[2fr_1fr]">
          <Stepper current={1} steps={[{ label: "Personal", description: "Name and contact" }, { label: "Job", description: "Role and team" }, { label: "Pay" }, { label: "Review" }]} />
          <Stepper orientation="vertical" current={2} steps={[{ label: "Request submitted" }, { label: "Manager approved" }, { label: "HR review", description: "Waiting for Priya" }, { label: "Done" }]} />
        </div>
      </Block>

      <Block title="Fields">
        <FormGrid columns={3}>
          <Field label="Full name" required hint="As on government ID"><TextInput value={text} onValueChange={setText} placeholder="e.g. Asha Menon" /></Field>
          <Field label="Work email" error={text === "x" ? "Doesn't look right" : undefined}><TextInput leading={Mail} placeholder="name@company.com" /></Field>
          <Field label="Experience" aside="Optional"><NumberInput value={num} onChange={setNum} min={0} max={50} suffix="years" /></Field>
          <Field label="Date of joining"><DateInput value={date} onChange={setDate} clearable /></Field>
          <Field label="Leave dates"><DateRangeInput value={range} onChange={setRange} /></Field>
          <Field label="Shift starts"><TimeInput value={time} onChange={setTime} /></Field>
          <Field label="City (static, clearable)"><Select value={city} onChange={setCity} options={CITY_OPTIONS} clearable /></Field>
          <Field label="Reporting manager (async search)" hint="Results load as you type"><Select value={manager} onChange={setManager} loadOptions={loadPeople} placeholder="Search people" clearable /></Field>
          <Field label="Error state" error="Pick a department"><Select value={null} onChange={() => {}} options={DEPTS.map((d) => ({ value: d, label: d }))} /></Field>
          <Field label="Preferred cities (multi)"><MultiSelect value={cities} onChange={setCities} options={CITY_OPTIONS} /></Field>
          <Field label="Team (async multi)"><MultiSelect value={team} onChange={setTeam} loadOptions={loadPeople} placeholder="Add people" /></Field>
          <Field label="Blood group (MasterSelect)" hint="A company list; admins can add values inline"><MasterSelect type="blood_group" value={blood} onChange={setBlood} clearable /></Field>
          <Field label="Disabled"><TextInput value="Locked by payroll" disabled readOnly /></Field>
          <Field label="Notes" className="sm:col-span-2 lg:col-span-3"><Textarea value={notes} onValueChange={setNotes} autoGrow placeholder="Anything HR should know" /></Field>
        </FormGrid>
        <div className="mt-6 grid gap-6">
          <div className="grid gap-4 lg:grid-cols-2">
            <Toggle checked={toggle} onChange={setToggle} label="Allow remote check-in" description="Employees can mark attendance from the mobile app." />
            <Checkbox checked={check} onChange={setCheck} label="Send a welcome email" description="With sign-in details and the handbook." />
            <div className="flex items-center gap-4"><Toggle size="sm" checked={!toggle} onChange={(v) => setToggle(!v)} aria-label="Small toggle" /><Checkbox checked indeterminate onChange={() => {}} aria-label="Indeterminate" /></div>
          </div>
          <Field label="Work mode">
            <RadioCards value={mode} onChange={setMode} options={[
              { value: "office", label: "Office", description: "Fixed desk, 5 days", icon: Building2 },
              { value: "hybrid", label: "Hybrid", description: "2–3 office days", icon: Laptop },
              { value: "remote", label: "Remote", description: "Works from home", icon: Home },
            ]} columns={3} />
          </Field>
        </div>
        <div className="mt-6"><Field label="Documents"><FileDrop value={files} onChange={setFiles} multiple accept="image/*,.pdf" maxSizeMb={5} onReject={(r) => toast.error(r[0])} /></Field></div>
      </Block>

      <div className="grid gap-6 lg:grid-cols-2">
        <Block title="Avatar, Badge, Chip, Menu">
          <div className="flex flex-wrap items-center gap-3">
            <Avatar name="Asha Menon" size={44} /><Avatar name="Dr. Rahul Sharma" size={36} /><Avatar name="Meera" size={28} /><Avatar name="Karthik Iyer" size={36} square />
            <AvatarGroup people={PEOPLE.slice(0, 7)} />
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Badge>Neutral</Badge><Badge tone="accent">Accent</Badge><Badge tone="good" dot>Active</Badge><Badge tone="warn" dot>Probation</Badge><Badge tone="bad" dot>Exited</Badge><Badge tone="info">Info</Badge>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Chip onRemove={() => {}}>Finance</Chip><Chip onRemove={() => {}}>Kochi</Chip><Chip>Read only</Chip>
            <Menu items={[{ label: "Edit", icon: Pencil, onSelect: () => {} }, { label: "Mark complete", icon: CheckCircle2, onSelect: () => {}, hint: "⌘K" }, "separator", { label: "Delete", icon: Trash2, danger: true, onSelect: () => {} }]} />
            <IconButton icon={Pencil} label="Edit" />
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button variant="primary" icon={Plus}>Primary</Button><Button>Secondary</Button><Button variant="ghost">Ghost</Button><Button variant="danger">Danger</Button><Button variant="primary" loading>Saving</Button><Button size="sm">Small</Button>
          </div>
        </Block>
        <Block title="Timeline">
          <Timeline items={[
            { id: 1, title: "Leave approved", description: "3 days casual leave, 12–14 Nov", time: "Today, 10:42", tone: "good", icon: CheckCircle2 },
            { id: 2, title: "Manager review", description: "Forwarded by Arjun Iyer", time: "Yesterday", tone: "accent", icon: Users },
            { id: 3, title: "Request submitted", time: "5 Nov", icon: Clock },
            { id: 4, title: "Shift changed to 10:00–19:00", time: "1 Nov" },
          ]} />
        </Block>
        <Block title="KeyValue">
          <KeyValue items={[
            { label: "Employee code", value: "EMP-0042" }, { label: "Department", value: "Finance" },
            { label: "Reporting manager", value: "Arjun Iyer" }, { label: "Date of joining", value: "12 Mar 2024" },
            { label: "Personal email", value: "" }, { label: "Address", value: "14/2 MG Road, Kochi, Kerala 682016", span: 2 },
          ]} />
        </Block>
        <Block title="Skeleton">
          <div className="flex items-center gap-3"><Skeleton className="h-10 w-10 rounded-full" /><div className="flex-1 space-y-2"><Skeleton className="h-3 w-1/3" /><Skeleton className="h-2.5 w-1/4" /></div></div>
          <SkeletonText lines={4} className="mt-5" />
          <div className="mt-5"><Calendar value={date} onPick={setDate} /></div>
        </Block>
      </div>

      {/* Size demo */}
      <Modal open={!!size} onClose={() => setSize(null)} size={size ?? "md"} title={`Modal, size ${size}`} description="Sticky header and footer; only the body scrolls."
        footer={<><ModalCancel /><Button variant="primary" onClick={() => setSize(null)}>Done</Button></>}>
        <div className="space-y-4">
          {Array.from({ length: size === "sm" ? 2 : 14 }, (_, i) => <SkeletonText key={i} lines={3} />)}
        </div>
      </Modal>

      {/* Detail modal (row click) */}
      <Modal open={!!detail} onClose={() => setDetail(null)} size="lg" title={detail?.name} description={detail ? `${detail.role} · ${detail.dept}` : undefined}
        leading={detail && <Avatar name={detail.name} size={44} />}
        headerActions={<Button size="sm" icon={Pencil} onClick={() => { setDetail(null); setFormOpen(true); }}>Edit</Button>}>
        {detail && (
          <>
            <Section title="Contact"><KeyValue items={[{ label: "Email", value: detail.email }, { label: "Status", value: <Badge tone={STATUS_TONE[detail.status]} dot>{detail.status}</Badge> }, { label: "Joined", value: detail.joined }, { label: "Phone", value: "" }]} /></Section>
            <Section title="Recent activity" className="border-t border-line"><Timeline items={[{ id: 1, title: "Profile updated", time: "2 days ago" }, { id: 2, title: "Joined the company", time: detail.joined, tone: "good" }]} /></Section>
          </>
        )}
      </Modal>

      {/* Dirty-guarded form */}
      <Modal open={formOpen} onClose={() => { setFormOpen(false); setDraft(""); }} size="md" title="Add employee" description="Type something, then try to close: you'll be asked first." dirty={!!draft}
        footer={<><ModalCancel /><Button variant="primary" onClick={() => { setFormOpen(false); setDraft(""); toast.success("Employee added"); }}>Add employee</Button></>}>
        <FormSection title="Personal details">
          <FormGrid>
            <Field label="First name" required><TextInput autoFocusInModal value={draft} onValueChange={setDraft} /></Field>
            <Field label="Last name"><TextInput /></Field>
            <Field label="Department" className="sm:col-span-2"><Select value={null} onChange={() => {}} options={DEPTS.map((d) => ({ value: d, label: d }))} /></Field>
          </FormGrid>
        </FormSection>
        <FormSection title="Job"><FormGrid><Field label="Start date"><DateInput value="" onChange={() => {}} /></Field><Field label="Shift"><TimeInput value="09:00" onChange={() => {}} /></Field></FormGrid></FormSection>
      </Modal>

      {/* Wizard */}
      <Modal open={wizard} onClose={() => setWizard(false)} size="xl" title="Onboard a new hire" dirty={step > 0}
        footerStart={<span className="text-[13px] text-faint">Step {step + 1} of 3</span>}
        footer={<>
          {step > 0 && <Button onClick={() => setStep(step - 1)}>Back</Button>}
          <Button variant="primary" onClick={() => (step < 2 ? setStep(step + 1) : (setWizard(false), toast.success("Onboarding started")))}>{step < 2 ? "Continue" : "Start onboarding"}</Button>
        </>}>
        <Stepper className="mb-8" current={step} onStepClick={setStep} steps={[{ label: "Personal" }, { label: "Job" }, { label: "Review" }]} />
        {step === 0 && <FormGrid><Field label="First name" required><TextInput /></Field><Field label="Last name"><TextInput /></Field><Field label="Personal email"><TextInput leading={Mail} /></Field><Field label="Date of birth"><DateInput value="" onChange={() => {}} /></Field></FormGrid>}
        {step === 1 && <FormGrid><Field label="Department"><Select value={null} onChange={() => {}} options={DEPTS.map((d) => ({ value: d, label: d }))} /></Field><Field label="Reporting manager"><Select value={null} onChange={() => {}} loadOptions={loadPeople} /></Field></FormGrid>}
        {step === 2 && <KeyValue items={[{ label: "Name", value: "Asha Menon" }, { label: "Department", value: "Finance" }, { label: "Manager", value: "Arjun Iyer" }]} />}
      </Modal>
    </div>
  );
}
