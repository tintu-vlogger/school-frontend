"use client";

/*
 * Face attendance admin (HR, permission time.face.manage):
 *   ReviewTab      flagged face checks (PIN instead of face, repeated failures, suspected
 *                  spoofing, kiosk/server disagreement) with accept or reject
 *   EnrolmentsTab  who is enrolled; HR enrols in person with the employee's consent, or
 *                  deletes someone's face data on a written request
 *   KiosksTab      face check off / on / required per kiosk, its location, own threshold
 *   SettingsTab    company switch, threshold, liveness, snapshots, locations, web selfie
 *                  match and the consent notice
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Camera, Check, Pencil, RotateCcw, ScanFace, ShieldOff, X } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDateTime } from "@/lib/datetime";
import { Paper, PaperHeader } from "@/components/shell/page";
import {
  Avatar, Badge, Button, Checkbox, DataTable, Field, FilterBar, FormGrid, FormSection, KeyValue, Modal, ModalCancel, MultiSelect,
  NumberInput, RadioCards, Select, Skeleton, Textarea, Toggle, type BadgeTone, type FilterValues,
} from "@/components/ui-kit";
import { errorText } from "@/components/attendance/shared";
import { EnrolModal } from "./enrol-modal";
import type { LivenessLevel, LivenessRules } from "./face-engine";

const S = 1.4;

export type FaceConfig = {
  enabled: boolean; threshold: number; margin: number; liveness: LivenessLevel; snapshot: "off" | "flagged" | "all";
  snapshot_retention_days: number; flag_after_failures: number; frequent_fallback_count: number; refresh_minutes: number;
  location_ids: number[]; require_location_ids: number[]; self_clock: "off" | "locations" | "everyone";
  self_clock_location_ids: number[]; unenrolled_web: "allow" | "block"; allow_self_enrol: boolean;
  consent_version: number; consent_text: string;
};
type SettingsResp = { config: FaceConfig; default_consent_text: string; liveness_levels: Record<LivenessLevel, LivenessRules> };
type Loc = { id: number; name: string; city: string | null; active: boolean };

function useLocations() {
  const [locs, setLocs] = useState<Loc[]>([]);
  useEffect(() => { api.get<Loc[]>("/organization/locations").then(setLocs).catch(() => setLocs([])); }, []);
  return locs;
}

export function useFaceSettings() {
  const [data, setData] = useState<SettingsResp | null>(null);
  const load = useCallback(() => api.get<SettingsResp>("/face-attendance/settings").then(setData).catch(() => {}), []);
  useEffect(() => { load(); }, [load]);
  return { data, load };
}

const LEVELS: { value: LivenessLevel; label: string; description: string }[] = [
  { value: "off", label: "Off", description: "No liveness check (not advised)" },
  { value: "basic", label: "Basic", description: "Photo and screen check, face size" },
  { value: "standard", label: "Standard", description: "Basic plus a blink or head turn" },
  { value: "strict", label: "Strict", description: "Blink and head turn, higher scores" },
];
const pct = (x: number | null | undefined) => (x == null ? "–" : `${Math.round(x * 100)}%`);

/* ── Review ────────────────────────────────────────────────────────── */

type Ev = {
  uuid: string; kind: string; kind_label: string; source: string; kiosk_name: string | null;
  employee: { uuid: string; name: string; employee_code: string | null } | null; occurred_at: string;
  score: number | null; client_score: number | null; threshold: number | null; attempts: number | null;
  liveness: { passed: boolean; real: number | null; live: number | null; face_px: number | null; challenges: string[] } | null;
  offline: boolean; has_snapshot: boolean; flagged: boolean; reasons: { code: string; label: string }[];
  review_status: "open" | "accepted" | "rejected" | null; reviewed_by_name: string | null; reviewed_at: string | null; review_note: string | null;
  punch: { uuid: string; punched_at: string; ignored: boolean } | null;
};

const STATUS_TONE: Record<string, BadgeTone> = { open: "warn", accepted: "good", rejected: "bad" };
const STATUS_LABEL: Record<string, string> = { open: "To review", accepted: "Accepted", rejected: "Rejected" };

export function ReviewTab({ onChanged }: { onChanged?: () => void }) {
  const toast = useToast();
  const [filters, setFilters] = useState<FilterValues>({ status: ["open"] });
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: Ev[]; total: number } | null>(null);
  const [open, setOpen] = useState<Ev | null>(null);
  const load = useCallback(() => {
    const p = new URLSearchParams({ page: String(page), size: "25", status: filters.status?.[0] ?? "all" });
    if (filters.kind?.[0]) p.set("kind", filters.kind[0]);
    api.get<{ items: Ev[]; total: number }>(`/face-attendance/events?${p}`).then(setData)
      .catch((e) => { setData({ items: [], total: 0 }); toast.error(errorText(e)); });
  }, [page, filters, toast]);
  useEffect(() => { load(); }, [load]);

  return (
    <Paper>
      <PaperHeader title="Face checks to review" />
      <div className="px-5 py-4">
        <p className="mb-3 max-w-3xl text-[13.5px] text-muted">
          Punches made with a PIN after the face check failed, faces not recognised several times, suspected photos or screens
          held to the camera, and matches the server did not agree with. Reject a punch to take it out of attendance.
        </p>
        <FilterBar values={filters} onChange={(v) => { setFilters(v); setPage(1); }} filters={[
          { key: "status", label: "Show", options: [{ value: "open", label: "To review" }, { value: "flagged", label: "All flagged" }, { value: "reviewed", label: "Reviewed" }, { value: "all", label: "Every check" }] },
          { key: "kind", label: "Kind", options: [
            { value: "pin_fallback", label: "PIN instead of face" }, { value: "no_match", label: "Face not recognised" }, { value: "spoof", label: "Liveness failed" },
            { value: "face_punch", label: "Punch by face" }, { value: "selfie_match", label: "Selfie matched" }, { value: "selfie_fail", label: "Selfie did not match" }] },
        ]} />
        <DataTable rows={data?.items ?? []} loading={!data} rowKey={(r) => r.uuid} onRowClick={setOpen}
          pagination={data ? { page, size: 25, total: data.total, onPageChange: setPage } : undefined}
          columns={[
            { key: "when", header: "When", cell: (r) => <span className="tabular text-ink">{formatDateTime(r.occurred_at)}</span> },
            { key: "who", header: "Person", cell: (r) => r.employee ? <div><p className="text-ink">{r.employee.name}</p><p className="text-[12px] text-faint">{r.employee.employee_code}</p></div> : <span className="text-faint">Unknown</span> },
            { key: "what", header: "What happened", cell: (r) => <div><p className="text-ink">{r.kind_label}</p><p className="text-[12px] text-muted">{r.reasons.map((x) => x.label).join(" · ")}</p></div> },
            { key: "where", header: "Where", hideBelow: "md", cell: (r) => <span className="text-muted">{r.source === "web" ? "Web or phone" : r.kiosk_name ?? "Kiosk"}{r.offline ? " · offline" : ""}</span> },
            { key: "score", header: "Match", align: "right", hideBelow: "sm", cell: (r) => <span className="tabular text-muted">{pct(r.score ?? r.client_score)}</span> },
            { key: "status", header: "Status", cell: (r) => r.review_status ? <Badge tone={STATUS_TONE[r.review_status]} dot>{STATUS_LABEL[r.review_status]}</Badge> : <Badge tone="neutral">Not flagged</Badge> },
          ]}
          emptyTitle={filters.status?.[0] === "open" ? "Nothing to review" : "No face checks"} emptyHint="Flagged face checks appear here." />
      </div>
      {open && <ReviewModal ev={open} onClose={() => setOpen(null)} onDone={() => { setOpen(null); load(); onChanged?.(); }} />}
    </Paper>
  );
}

function ReviewModal({ ev, onClose, onDone }: { ev: Ev; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [img, setImg] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [addPunch, setAddPunch] = useState(false);
  const [saving, setSaving] = useState<"accept" | "reject" | null>(null);
  const canReview = ev.flagged && ev.review_status === "open";

  async function showPhoto() {
    try { setImg((await api.get<{ image: string }>(`/face-attendance/events/${ev.uuid}/snapshot`)).image); } catch (e) { toast.error(errorText(e)); }
  }
  async function decide(decision: "accept" | "reject") {
    setSaving(decision);
    try {
      await api.post(`/face-attendance/events/${ev.uuid}/review`, { decision, note: note || null, add_punch: decision === "accept" && addPunch });
      toast.success(decision === "accept" ? "Accepted" : "Rejected", { description: decision === "reject" && ev.punch ? "The punch no longer counts in attendance." : undefined });
      onDone();
    } catch (e) { toast.error(errorText(e)); } finally { setSaving(null); }
  }

  const live = ev.liveness;
  return (
    <Modal open onClose={onClose} size="lg" busy={!!saving} title={ev.kind_label}
      description={`${ev.employee?.name ?? "Unknown person"} · ${formatDateTime(ev.occurred_at)}`}
      footer={canReview ? (
        <><ModalCancel /><Button variant="danger" icon={X} loading={saving === "reject"} disabled={note.trim().length < 3} onClick={() => decide("reject")}>Reject</Button>
          <Button variant="primary" icon={Check} loading={saving === "accept"} onClick={() => decide("accept")}>Accept</Button></>
      ) : <Button onClick={onClose}>Close</Button>}>
      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_220px]">
        <div className="space-y-4">
          {ev.reasons.length > 0 && (
            <div className="flex flex-wrap gap-1.5">{ev.reasons.map((r) => <Badge key={r.code} tone="warn">{r.label}</Badge>)}</div>
          )}
          <KeyValue items={[
            { label: "Where", value: ev.source === "web" ? "Web or phone" : ev.kiosk_name ?? "Kiosk" },
            { label: "Punch", value: ev.punch ? `${formatDateTime(ev.punch.punched_at)}${ev.punch.ignored ? " (not counted)" : ""}` : "No punch made" },
            { label: "Match (server)", value: pct(ev.score) },
            { label: "Match (tablet)", value: pct(ev.client_score) },
            { label: "Needed", value: ev.threshold != null ? `${pct(1 - ev.threshold)} or more` : "–" },
            { label: "Face tries", value: ev.attempts ?? "–" },
            { label: "Photo / screen check", value: live ? pct(live.real) : "–" },
            { label: "Liveness", value: live ? `${pct(live.live)}${live.challenges?.length ? ` · ${live.challenges.join(", ").replace("turn_left", "head turn")}` : ""}` : "–" },
          ]} />
          {ev.review_status && ev.review_status !== "open" && (
            <p className="text-[13px] text-muted">{STATUS_LABEL[ev.review_status]} by {ev.reviewed_by_name} on {ev.reviewed_at ? formatDateTime(ev.reviewed_at) : ""}{ev.review_note ? `: ${ev.review_note}` : ""}</p>
          )}
          {canReview && (
            <>
              <Field label="Note" hint="Needed to reject. Kept in the audit log."><Textarea value={note} onValueChange={setNote} rows={2} maxLength={300} placeholder="e.g. Checked with the manager: was at the gate" /></Field>
              {!ev.punch && ev.employee && <Checkbox checked={addPunch} onChange={setAddPunch} label="Add the punch on accept" description={`Records a punch for ${ev.employee.name} at ${formatDateTime(ev.occurred_at)}.`} />}
            </>
          )}
        </div>
        <div>
          {img ? <img src={img} alt="Snapshot from the face check" className="w-full rounded-xl border border-line" />
            : ev.has_snapshot ? (
              <button type="button" onClick={showPhoto} className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong text-[13px] text-muted hover:border-primary/50">
                <Camera size={20} strokeWidth={S} />Show snapshot
                <span className="text-[11.5px] text-faint">Viewing is logged</span>
              </button>
            ) : <div className="flex aspect-[4/3] w-full items-center justify-center rounded-xl bg-sunken text-[12.5px] text-faint">No snapshot kept</div>}
        </div>
      </div>
    </Modal>
  );
}

/* ── Enrolments ────────────────────────────────────────────────────── */

type Enr = {
  employee_uuid: string; name: string; employee_code: string | null; image: string | null; location_name: string | null;
  status: "active" | "withdrawn" | "not_enrolled";
  enrolment: { consent_by: string; consent_at: string; samples: number; quality: number; captured_by_name: string | null; withdrawn_at: string | null; withdraw_reason: string | null; withdrawn_by_name: string | null } | null;
};
const ENR_TONE: Record<Enr["status"], BadgeTone> = { active: "good", withdrawn: "neutral", not_enrolled: "neutral" };
const ENR_LABEL: Record<Enr["status"], string> = { active: "Enrolled", withdrawn: "Consent withdrawn", not_enrolled: "Not enrolled" };

export function EnrolmentsTab({ settings, onChanged }: { settings: SettingsResp | null; onChanged?: () => void }) {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<FilterValues>({});
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: Enr[]; total: number } | null>(null);
  const [enrolling, setEnrolling] = useState<Enr | null>(null);
  const [removing, setRemoving] = useState<Enr | null>(null);
  const [viewing, setViewing] = useState<Enr | null>(null);
  const load = useCallback(() => {
    const p = new URLSearchParams({ page: String(page), size: "25", q });
    if (filters.status?.[0]) p.set("status", filters.status[0]);
    api.get<{ items: Enr[]; total: number }>(`/face-attendance/enrolments?${p}`).then(setData)
      .catch((e) => { setData({ items: [], total: 0 }); toast.error(errorText(e)); });
  }, [page, q, filters, toast]);
  useEffect(() => { load(); }, [load]);
  const cfg = settings?.config;

  return (
    <Paper>
      <PaperHeader title="Enrolled faces" />
      <div className="px-5 py-4">
        <p className="mb-3 max-w-3xl text-[13.5px] text-muted">
          People can set up face sign-in themselves in My attendance. Enrol someone here only in person, after they have read the
          consent notice and agreed. Face templates are encrypted and never shown.
        </p>
        {cfg && !cfg.enabled && <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-800">Face attendance is switched off. Switch it on in Settings to enrol people.</p>}
        <FilterBar searchPlaceholder="Search by name or employee ID" onSearchChange={(v) => { setQ(v); setPage(1); }} values={filters}
          onChange={(v) => { setFilters(v); setPage(1); }}
          filters={[{ key: "status", label: "Status", options: [{ value: "enrolled", label: "Enrolled" }, { value: "not_enrolled", label: "Not enrolled" }, { value: "withdrawn", label: "Consent withdrawn" }] }]} />
        <DataTable rows={data?.items ?? []} loading={!data} rowKey={(r) => r.employee_uuid} onRowClick={setViewing}
          pagination={data ? { page, size: 25, total: data.total, onPageChange: setPage } : undefined}
          columns={[
            { key: "name", header: "Person", cell: (r) => <div className="flex items-center gap-2.5"><Avatar name={r.name} src={r.image} size={30} /><div><p className="text-ink">{r.name}</p><p className="text-[12px] text-faint">{r.employee_code}</p></div></div> },
            { key: "loc", header: "Location", hideBelow: "md", cell: (r) => <span className="text-muted">{r.location_name ?? "–"}</span> },
            { key: "status", header: "Status", cell: (r) => <Badge tone={ENR_TONE[r.status]} dot={r.status === "active"}>{ENR_LABEL[r.status]}</Badge> },
            { key: "consent", header: "Consent", hideBelow: "sm", cell: (r) => r.enrolment && r.status === "active"
              ? <span className="text-muted">{r.enrolment.consent_by === "self" ? "Self" : "With HR"} · {formatDateTime(r.enrolment.consent_at)}</span>
              : <span className="text-faint">–</span> },
          ]}
          rowActions={(r) => [
            { label: r.status === "active" ? "Enrol again" : "Enrol", icon: ScanFace, onSelect: () => setEnrolling(r), disabled: !cfg?.enabled },
            ...(r.status === "active" ? [{ label: "Delete face data", icon: ShieldOff, danger: true, onSelect: () => setRemoving(r) }] : []),
          ]}
          emptyTitle="No people found" />
      </div>
      {viewing && (
        <Modal open onClose={() => setViewing(null)} size="md" title={viewing.name} description={ENR_LABEL[viewing.status]}
          footer={<><Button onClick={() => setViewing(null)}>Close</Button>
            {cfg?.enabled && <Button variant="primary" icon={ScanFace} onClick={() => { setEnrolling(viewing); setViewing(null); }}>{viewing.status === "active" ? "Enrol again" : "Enrol"}</Button>}</>}>
          {viewing.enrolment ? (
            <KeyValue items={viewing.status === "active" ? [
              { label: "Consent", value: viewing.enrolment.consent_by === "self" ? "Given by the employee" : "Given in person to HR" },
              { label: "When", value: formatDateTime(viewing.enrolment.consent_at) },
              { label: "Recorded by", value: viewing.enrolment.captured_by_name ?? "–" },
              { label: "Samples", value: `${viewing.enrolment.samples} (alike: ${pct(viewing.enrolment.quality)})` },
            ] : [
              { label: "Face data deleted", value: viewing.enrolment.withdrawn_at ? formatDateTime(viewing.enrolment.withdrawn_at) : "–" },
              { label: "By", value: viewing.enrolment.withdrawn_by_name ?? "–" },
              { label: "Reason", value: viewing.enrolment.withdraw_reason ?? "–", span: 2 },
            ]} />
          ) : <p className="text-[14px] text-muted">Not enrolled. They punch with their employee ID and PIN.</p>}
        </Modal>
      )}
      {enrolling && settings && (
        <EnrolModal who="hr" personName={enrolling.name} path={`/face-attendance/enrolments/${enrolling.employee_uuid}`}
          consent={{ text: settings.config.consent_text, version: settings.config.consent_version, level: settings.config.liveness, rules: settings.liveness_levels[settings.config.liveness] }}
          onClose={() => setEnrolling(null)} onDone={() => { setEnrolling(null); load(); onChanged?.(); }} />
      )}
      {removing && <RemoveModal row={removing} onClose={() => setRemoving(null)} onDone={() => { setRemoving(null); load(); onChanged?.(); }} />}
    </Paper>
  );
}

function RemoveModal({ row, onClose, onDone }: { row: Enr; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    try {
      await api.post(`/face-attendance/enrolments/${row.employee_uuid}/remove`, { reason });
      toast.success("Face data deleted");
      onDone();
    } catch (e) { toast.error(errorText(e)); } finally { setSaving(false); }
  }
  return (
    <Modal open onClose={onClose} size="sm" busy={saving} title="Delete face data?"
      description={`${row.name}'s face templates and face check photos are deleted now. This can't be undone.`}
      footer={<><ModalCancel /><Button variant="danger" loading={saving} disabled={reason.trim().length < 3} onClick={save}>Delete</Button></>}>
      <Field label="Reason" required hint="For example: asked in writing to withdraw consent."><Textarea value={reason} onValueChange={setReason} rows={2} maxLength={300} autoFocus /></Field>
    </Modal>
  );
}

/* ── Kiosks ────────────────────────────────────────────────────────── */

type FKiosk = { uuid: string; name: string; active: boolean; location_note: string | null; mode: "off" | "on" | "required"; effective_mode: "off" | "on" | "required"; location_id: number | null; location_name: string | null; threshold: number | null; liveness: LivenessLevel | null; people: number };
const MODE_LABEL = { off: "Off", on: "Face first, PIN any time", required: "Face required" };
const MODE_TONE: Record<string, BadgeTone> = { off: "neutral", on: "good", required: "accent" };

export function KiosksTab({ settings }: { settings: SettingsResp | null }) {
  const toast = useToast();
  const locs = useLocations();
  const [rows, setRows] = useState<FKiosk[] | null>(null);
  const [editing, setEditing] = useState<FKiosk | null>(null);
  const load = useCallback(() => api.get<{ items: FKiosk[] }>("/face-attendance/kiosks").then((r) => setRows(r.items))
    .catch((e) => { setRows([]); toast.error(errorText(e)); }), [toast]);
  useEffect(() => { load(); }, [load]);
  return (
    <Paper>
      <PaperHeader title="Kiosks" />
      <div className="px-5 py-4">
        <p className="mb-3 max-w-3xl text-[13.5px] text-muted">
          Choose which clock-in kiosks check faces. A kiosk downloads only the face templates of people at its location and keeps
          them on the tablet so it works offline. Add kiosks in Shifts &amp; attendance settings, Kiosks.
        </p>
        {settings && !settings.config.enabled && <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-800">Face attendance is switched off for the company, so every kiosk uses PINs.</p>}
        <DataTable rows={rows ?? []} loading={!rows} rowKey={(k) => k.uuid} onRowClick={setEditing}
          rowClassName={(k) => (k.active ? undefined : "[&_td]:opacity-60")}
          columns={[
            { key: "name", header: "Kiosk", cell: (k) => <div><p className="text-ink">{k.name}</p>{k.location_note && <p className="text-[12px] text-faint">{k.location_note}</p>}</div> },
            { key: "loc", header: "Location", hideBelow: "sm", cell: (k) => <span className="text-muted">{k.location_name ?? "All locations"}</span> },
            { key: "people", header: "Faces", align: "right", hideBelow: "md", cell: (k) => <span className="tabular text-muted">{k.people}</span> },
            { key: "mode", header: "Face check", cell: (k) => <div><Badge tone={MODE_TONE[k.effective_mode]} dot={k.effective_mode !== "off"}>{MODE_LABEL[k.effective_mode]}</Badge>
              {k.mode !== k.effective_mode && <p className="mt-0.5 text-[11.5px] text-faint">Set to {MODE_LABEL[k.mode].toLowerCase()}</p>}</div> },
          ]}
          rowActions={(k) => [{ label: "Edit", icon: Pencil, onSelect: () => setEditing(k) }]}
          emptyTitle="No kiosks yet" emptyHint="Add a clock-in kiosk in Shifts & attendance settings first." />
      </div>
      {editing && <KioskFaceModal kiosk={editing} locs={locs} settings={settings} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </Paper>
  );
}

function KioskFaceModal({ kiosk, locs, settings, onClose, onSaved }: { kiosk: FKiosk; locs: Loc[]; settings: SettingsResp | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [mode, setMode] = useState(kiosk.mode);
  const [loc, setLoc] = useState<number | null>(kiosk.location_id);
  const [thr, setThr] = useState<number | null>(kiosk.threshold);
  const [lv, setLv] = useState<LivenessLevel | null>(kiosk.liveness);
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    try {
      await api.put(`/face-attendance/kiosks/${kiosk.uuid}`, { mode, location_id: loc, threshold: thr, liveness: lv });
      toast.success("Saved", { description: "The kiosk picks up the change at its next refresh." });
      onSaved();
    } catch (e) { toast.error(errorText(e, "Couldn't save")); } finally { setSaving(false); }
  }
  return (
    <Modal open onClose={onClose} size="md" busy={saving} title={`Face check: ${kiosk.name}`}
      footer={<><ModalCancel /><Button variant="primary" loading={saving} onClick={save}>Save</Button></>}>
      <div className="space-y-4">
        <Field label="Face check">
          <RadioCards value={mode} onChange={setMode} columns={1} options={[
            { value: "off", label: "Off", description: "Employee ID and PIN only" },
            { value: "on", label: "Face first", description: "Face check, with the PIN always offered" },
            { value: "required", label: "Face required", description: "PIN only after the face is not recognised; those punches go to HR review" },
          ]} />
        </Field>
        <Field label="Location" hint="Only people at this location are recognised here. Leave empty for everyone.">
          <Select value={loc} onChange={setLoc} clearable placeholder="All locations" options={locs.filter((l) => l.active).map((l) => ({ value: l.id, label: l.name, description: l.city ?? undefined }))} />
        </Field>
        <FormGrid>
          <Field label="Own match threshold" hint={`Empty uses the company's (${settings?.config.threshold ?? 0.4}). Lower is stricter.`}>
            <NumberInput value={thr} onChange={setThr} min={0.15} max={0.7} step={0.01} placeholder={String(settings?.config.threshold ?? "")} />
          </Field>
          <Field label="Own liveness level">
            <Select value={lv} onChange={setLv} clearable placeholder={`Company's (${settings?.config.liveness ?? "standard"})`} options={LEVELS.map((l) => ({ value: l.value, label: l.label, description: l.description }))} />
          </Field>
        </FormGrid>
      </div>
    </Modal>
  );
}

/* ── Settings ──────────────────────────────────────────────────────── */

export function SettingsTab({ settings, onSaved }: { settings: SettingsResp | null; onSaved: () => void }) {
  const toast = useToast();
  const locs = useLocations();
  const [c, setC] = useState<FaceConfig | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (settings) setC(settings.config); }, [settings]);
  const dirty = useMemo(() => !!c && !!settings && JSON.stringify(c) !== JSON.stringify(settings.config), [c, settings]);
  if (!c || !settings) return <Paper className="p-6"><Skeleton className="h-80 w-full rounded-xl" /></Paper>;
  const set = <K extends keyof FaceConfig>(k: K, v: FaceConfig[K]) => setC({ ...c, [k]: v });
  const locOptions = locs.filter((l) => l.active).map((l) => ({ value: l.id, label: l.name }));

  async function save() {
    setSaving(true);
    try {
      await api.put("/face-attendance/settings", { config: c });
      toast.success("Settings saved");
      onSaved();
    } catch (e) { toast.error(errorText(e, "Couldn't save")); } finally { setSaving(false); }
  }

  return (
    <Paper>
      <PaperHeader title="Face attendance settings" action={<div className="flex gap-2">
        {dirty && <Button size="sm" variant="ghost" icon={RotateCcw} onClick={() => setC(settings.config)}>Undo</Button>}
        <Button size="sm" variant="primary" loading={saving} disabled={!dirty} onClick={save}>Save</Button>
      </div>} />
      <div className="space-y-6 px-5 py-5">
        <Toggle checked={c.enabled} onChange={(v) => set("enabled", v)} label="Use face attendance"
          description="Kiosks can recognise faces and people can enrol. Switch on per kiosk under Kiosks." />

        <FormSection title="Matching" description="A face matches when it is at least this alike to the person's enrolled samples.">
          <FormGrid>
            <Field label="Match threshold" hint={`Cosine distance. ${c.threshold} means at least ${Math.round((1 - c.threshold) * 100)}% alike. Lower is stricter.`}>
              <NumberInput value={c.threshold} onChange={(v) => set("threshold", v ?? 0.4)} min={0.15} max={0.7} step={0.01} />
            </Field>
            <Field label="Margin over the next person" hint="Stops two similar-looking people being mixed up.">
              <NumberInput value={c.margin} onChange={(v) => set("margin", v ?? 0)} min={0} max={0.2} step={0.01} />
            </Field>
          </FormGrid>
        </FormSection>

        <FormSection title="Liveness" description="Stops someone punching with a photo or a phone screen.">
          <RadioCards value={c.liveness} onChange={(v) => set("liveness", v)} columns={4} options={LEVELS} />
        </FormSection>

        <FormSection title="Snapshots" description="A small photo with the face check, for HR to look at a doubtful punch.">
          <FormGrid>
            <Field label="Keep a snapshot">
              <RadioCards value={c.snapshot} onChange={(v) => set("snapshot", v)} columns={3} options={[
                { value: "off", label: "Never" }, { value: "flagged", label: "Flagged only" }, { value: "all", label: "Every check" }]} />
            </Field>
            <Field label="Delete snapshots after" hint="Kept no longer than needed (DPDP Act).">
              <NumberInput value={c.snapshot_retention_days} onChange={(v) => set("snapshot_retention_days", v ?? 30)} min={1} max={365} suffix="days" />
            </Field>
          </FormGrid>
        </FormSection>

        <FormSection title="Review" description="When a punch goes to HR for review.">
          <FormGrid>
            <Field label="Flag a PIN punch after" hint="Failed face tries in a row before the PIN was used.">
              <NumberInput value={c.flag_after_failures} onChange={(v) => set("flag_after_failures", v ?? 3)} min={1} max={10} suffix="tries" />
            </Field>
            <Field label="Flag frequent PIN use" hint="Someone enrolled who needed the PIN this many times in 7 days.">
              <NumberInput value={c.frequent_fallback_count} onChange={(v) => set("frequent_fallback_count", v ?? 3)} min={1} max={30} suffix="times" />
            </Field>
          </FormGrid>
        </FormSection>

        <FormSection title="Locations" description="Where kiosks may check faces, and where the face is required.">
          <FormGrid>
            <Field label="Face check at" hint="Empty means every location.">
              <MultiSelect value={c.location_ids} onChange={(v) => set("location_ids", v)} options={locOptions} placeholder="Every location" />
            </Field>
            <Field label="Face required at" hint="Kiosks here offer the PIN only after the face is not recognised.">
              <MultiSelect value={c.require_location_ids} onChange={(v) => set("require_location_ids", v)} options={locOptions} placeholder="None" />
            </Field>
            <Field label="Kiosks download faces every">
              <NumberInput value={c.refresh_minutes} onChange={(v) => set("refresh_minutes", v ?? 30)} min={5} max={1440} suffix="minutes" />
            </Field>
          </FormGrid>
        </FormSection>

        <FormSection title="Web and phone clock-in" description="Ask for a selfie that matches the person's enrolled face.">
          <RadioCards value={c.self_clock} onChange={(v) => set("self_clock", v)} columns={3} options={[
            { value: "off", label: "Not needed" }, { value: "locations", label: "At chosen locations" }, { value: "everyone", label: "Everyone" }]} />
          {c.self_clock === "locations" && (
            <Field label="Locations" className="mt-3"><MultiSelect value={c.self_clock_location_ids} onChange={(v) => set("self_clock_location_ids", v)} options={locOptions} /></Field>
          )}
          {c.self_clock !== "off" && (
            <Field label="People who have not enrolled" className="mt-3" hint="Face data needs consent, so allowing a choice is the safe default.">
              <RadioCards value={c.unenrolled_web} onChange={(v) => set("unenrolled_web", v)} columns={2} options={[
                { value: "allow", label: "Clock in without a face check" }, { value: "block", label: "Must enrol or use the kiosk" }]} />
            </Field>
          )}
        </FormSection>

        <FormSection title="Consent" description="Shown before anyone enrols (Digital Personal Data Protection Act, 2023). Changing it starts a new version.">
          <Toggle checked={c.allow_self_enrol} onChange={(v) => set("allow_self_enrol", v)} label="People can enrol themselves" description="From My attendance, after reading and agreeing to the notice." />
          <Field label={`Consent notice (version ${c.consent_version})`} className="mt-3"
            aside={<button type="button" className="text-[12.5px] text-primary hover:underline" onClick={() => set("consent_text", settings.default_consent_text)}>Use the standard text</button>}>
            <Textarea value={c.consent_text} onValueChange={(v) => set("consent_text", v)} rows={12} />
          </Field>
        </FormSection>
      </div>
    </Paper>
  );
}
