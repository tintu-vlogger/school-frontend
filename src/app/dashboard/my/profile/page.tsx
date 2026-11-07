"use client";

/*
 * Portal profile. A parent picks a child (from /students/mine) and sees their profile,
 * guardians and documents (read-only); a student sees their own. Anyone can change their
 * own password here.
 */
import { useEffect, useState } from "react";
import { KeyRound, Phone, Mail, UserRound } from "lucide-react";
import { api } from "@/lib/api";
import { useAccess } from "@/lib/access";
import { useInstitution } from "@/lib/institution";
import { useToast } from "@/lib/toast-context";
import { formatDate } from "@/lib/datetime";
import { PageHeader, Paper, PaperHeader, EmptyState } from "@/components/shell/page";
import { Avatar, Badge, Button, Field, KeyValue, Skeleton, TextInput } from "@/components/ui-kit";
import { errText } from "@/components/academics/shared";
import { genderLabel, relationLabel, type StudentBrief, type StudentDoc, type StudentFull } from "@/components/students/shared";
import { DocumentList } from "@/components/students/student-detail";

export default function MyProfilePage() {
  const { term } = useInstitution();
  const { portalRole } = useAccess();
  const [kids, setKids] = useState<StudentBrief[] | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [s, setS] = useState<StudentFull | null>(null);
  const [docs, setDocs] = useState<{ uuid: string; rows: StudentDoc[] } | null>(null);

  useEffect(() => {
    api.get<StudentBrief[]>("/students/mine").then((r) => { setKids(r); setPick((p) => p ?? r[0]?.uuid ?? null); }).catch(() => setKids([]));
  }, []);
  useEffect(() => {
    if (!pick) return;
    let live = true;
    api.get<StudentFull>(`/students/${pick}`).then((r) => { if (live) setS(r); }).catch(() => {});
    api.get<StudentDoc[]>(`/students/${pick}/documents`).then((r) => { if (live) setDocs({ uuid: pick, rows: r }); }).catch(() => { if (live) setDocs({ uuid: pick, rows: [] }); });
    return () => { live = false; };
  }, [pick]);
  const cur = s && s.uuid === pick ? s : null;
  const isParent = portalRole === "parent";

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={isParent ? "Profile" : "My profile"}
        description={isParent ? `Your children's details as the school has them. To correct anything, contact the office.` : "Your details as the school has them. To correct anything, contact the office."} />

      {isParent && kids && kids.length > 1 && (
        <div className="-mx-1 mb-5 flex gap-2 overflow-x-auto px-1 pb-1">
          {kids.map((k) => (
            <button key={k.uuid} type="button" onClick={() => setPick(k.uuid)}
              className={`flex shrink-0 items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition-colors ${k.uuid === pick ? "border-primary/40 bg-primary-soft/50" : "border-line bg-surface hover:bg-sunken/50"}`}>
              <Avatar name={k.name} src={k.photo_url} size={30} />
              <span><span className="block text-[14px] text-ink">{k.first_name}</span><span className="block text-[12px] text-muted">{k.section_label ?? k.program_name ?? ""}</span></span>
            </button>
          ))}
        </div>
      )}

      {kids === null ? <Skeleton className="h-48 w-full rounded-2xl" /> : kids.length === 0 ? (
        <Paper className="mb-5"><EmptyState icon={UserRound} title={`No ${term("student").toLowerCase()} linked to this sign-in`} hint="Ask the school office to link your account." /></Paper>
      ) : !cur ? <Skeleton className="h-48 w-full rounded-2xl" /> : (
        <div className="space-y-5">
          <Paper className="p-5">
            <div className="flex flex-wrap items-center gap-4">
              <Avatar name={cur.name} src={cur.photo_url} size={72} />
              <div className="min-w-0 flex-1">
                <p className="text-[20px] font-light text-ink">{cur.name}</p>
                <p className="text-[13.5px] text-muted">
                  {[cur.section_label ?? cur.program_name, cur.roll_no ? `${term("roll")} ${cur.roll_no}` : null, cur.session_name].filter(Boolean).join(" · ")}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Badge tone="neutral">Admission no. {cur.admission_no}</Badge>
                  {cur.house_name && <Badge>{cur.house_name} house</Badge>}
                  {cur.class_teacher_name && <Badge tone="accent">{term("teacher")}: {cur.class_teacher_name}</Badge>}
                </div>
              </div>
            </div>
          </Paper>

          <Paper>
            <PaperHeader title="Details" />
            <div className="p-5">
              <KeyValue columns={3} items={[
                { label: "Date of birth", value: cur.date_of_birth ? formatDate(cur.date_of_birth) : null },
                { label: "Gender", value: genderLabel(cur.gender) }, { label: "Blood group", value: cur.blood_group },
                { label: "Email", value: cur.email }, { label: "Phone", value: cur.phone },
                { label: "Admission date", value: cur.admission_date ? formatDate(cur.admission_date) : null },
                { label: "Address", value: [cur.address, cur.city, cur.state, cur.pincode].filter(Boolean).join(", "), span: 3 },
                { label: "Medical notes", value: cur.medical_notes, span: 2 }, { label: "Allergies", value: cur.allergies },
              ]} />
            </div>
          </Paper>

          <Paper>
            <PaperHeader title={term("guardians")} />
            <div className="grid gap-3 p-5 sm:grid-cols-2">
              {cur.guardians.length === 0 ? <p className="text-[13.5px] text-muted">None on record.</p> : cur.guardians.map((g) => (
                <div key={g.link_id} className="flex items-start gap-3 rounded-xl border border-line p-3">
                  <Avatar name={g.name} size={34} />
                  <div className="min-w-0 text-[13px]">
                    <p className="text-[14px] text-ink">{g.name}{g.is_primary && <span className="ml-2 text-[12px] text-primary">Primary</span>}</p>
                    <p className="text-muted">{relationLabel(g.relation)}</p>
                    {g.phone && <p className="mt-1 flex items-center gap-1.5 text-ink/80"><Phone size={13} strokeWidth={1.4} />{g.phone}</p>}
                    {g.email && <p className="flex items-center gap-1.5 truncate text-ink/80"><Mail size={13} strokeWidth={1.4} />{g.email}</p>}
                  </div>
                </div>
              ))}
            </div>
          </Paper>

          <Paper>
            <PaperHeader title="Documents" />
            <div className="p-5">
              {!docs || docs.uuid !== pick ? <Skeleton className="h-16 w-full" /> : docs.rows.length === 0
                ? <p className="text-[13.5px] text-muted">No documents on file yet.</p>
                : <DocumentList docs={docs.rows} />}
            </div>
          </Paper>
        </div>
      )}

      <ChangePassword />
    </div>
  );
}

function ChangePassword() {
  const toast = useToast();
  const [v, setV] = useState({ current: "", next: "", again: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (v.next.length < 8) { setError("Use at least 8 characters"); return; }
    if (v.next !== v.again) { setError("The two passwords don't match"); return; }
    setSaving(true);
    try {
      await api.post("/auth/change-password", { current_password: v.current, new_password: v.next });
      toast.success("Password changed");
      setV({ current: "", next: "", again: "" });
      setError("");
    } catch (err) { setError(errText(err) ?? "Couldn't change the password"); } finally { setSaving(false); }
  }
  return (
    <Paper className="mt-5">
      <PaperHeader title="Change password" />
      <form onSubmit={save} className="grid gap-4 p-5 sm:grid-cols-3" noValidate>
        <Field label="Current password"><TextInput type="password" autoComplete="current-password" value={v.current} onValueChange={(x) => setV({ ...v, current: x })} /></Field>
        <Field label="New password" hint="At least 8 characters"><TextInput type="password" autoComplete="new-password" value={v.next} onValueChange={(x) => { setV({ ...v, next: x }); setError(""); }} /></Field>
        <Field label="New password again" error={error}><TextInput type="password" autoComplete="new-password" value={v.again} onValueChange={(x) => { setV({ ...v, again: x }); setError(""); }} /></Field>
        <div className="sm:col-span-3"><Button type="submit" variant="primary" icon={KeyRound} loading={saving}>Change password</Button></div>
      </form>
    </Paper>
  );
}
