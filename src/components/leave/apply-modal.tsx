"use client";

/*
 * ApplyLeaveModal: apply for leave (or change a pending request) with a live preview of
 * the days counted, weekends and holidays, sandwich days, the balance after this request,
 * loss of pay and who else in the team is away.
 *   <ApplyLeaveModal open onClose={...} onSaved={...} cards={summary.cards} />
 *   <ApplyLeaveModal ... employee={{ uuid, name }} />     // HR applying for someone (recorded as approved)
 *   <ApplyLeaveModal ... editing={detail} />               // change a pending request
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CalendarCheck, CircleAlert, Send, Users } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDate, todayISO } from "@/lib/datetime";
import {
  Button, DateInput, DateRangeInput, Field, FileDrop, FormGrid, Modal, ModalCancel, NumberInput, RadioCards, Select, Textarea,
  type SelectOption,
} from "@/components/ui-kit";
import { LeaveIcon, fmtDays, STROKE } from "./leave-ui";
import type { BalanceCard, DayItem, Holiday, LeaveDetail, Preview, TypeBrief } from "./types";

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved: (r: LeaveDetail) => void;
  cards: BalanceCard[];
  initialType?: string | null;
  employee?: { uuid: string; name: string } | null;
  editing?: LeaveDetail | null;
};

const fileToDataUrl = (f: File) => new Promise<string>((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result));
  r.onerror = rej;
  r.readAsDataURL(f);
});

export function ApplyLeaveModal({ open, onClose, onSaved, cards, initialType, employee, editing }: Props) {
  const toast = useToast();
  const types = useMemo(() => cards.filter((c) => c.applicable).map((c) => c.type), [cards]);
  const [typeUuid, setTypeUuid] = useState<string | null>(null);
  const [range, setRange] = useState({ from: "", to: "" });
  const [unit, setUnit] = useState("day");
  const [half, setHalf] = useState<"first" | "second">("first");
  const [hours, setHours] = useState<number | null>(2);
  const [reason, setReason] = useState("");
  const [grant, setGrant] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [optional, setOptional] = useState<Holiday[]>([]);
  const seq = useRef(0);

  // reset when opened
  useEffect(() => {
    if (!open) return;
    if (editing) {
      setTypeUuid(editing.leave_type.uuid);
      setRange({ from: editing.from_date, to: editing.to_date });
      setUnit(editing.unit);
      setHalf((editing.half as "first" | "second") || "first");
      setHours(editing.hours ?? 2);
      setReason(editing.reason || "");
      setGrant(editing.grant_option);
    } else {
      const first = initialType ? types.find((t) => t.code === initialType || t.uuid === initialType) : null;
      setTypeUuid(first?.uuid ?? null);
      setRange({ from: "", to: "" });
      setUnit("day");
      setReason("");
      setGrant(null);
    }
    setFiles([]);
    setPreview(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const t: TypeBrief | undefined = types.find((x) => x.uuid === typeUuid) ?? (editing ? cards.find((c) => c.type.uuid === editing.leave_type.uuid)?.type : undefined);
  const card = cards.find((c) => c.type.uuid === typeUuid);
  const isOptional = !!t?.only_optional_holidays;

  useEffect(() => {
    if (!open || !isOptional) return;
    const year = (range.from || todayISO()).slice(0, 4);
    api.get<{ holidays: Holiday[] }>(`/leave/me/holidays?year=${year}`).then((r) => setOptional(r.holidays.filter((h) => h.kind === "optional"))).catch(() => setOptional([]));
  }, [open, isOptional, range.from]);

  useEffect(() => {
    if (t && t.grant_options.length && !t.grant_options.some((o) => o.key === grant)) setGrant(t.grant_options[0].key);
    if (t && unit !== "day" && !((unit === "half_day" && t.allow_half_day) || (unit === "quarter_day" && t.allow_quarter_day) || (unit === "hour" && t.allow_hourly))) setUnit("day");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeUuid]);

  // fill the end date of a grant from the chosen option
  useEffect(() => {
    if (!t || !t.grant_options.length || !range.from || editing) return;
    const opt = t.grant_options.find((o) => o.key === grant);
    if (!opt || opt.days < 1) return;
    // maternity counts calendar days; others are best left for the person to choose
    if (opt.days >= 30) {
      const d = new Date(`${range.from}T12:00:00Z`);
      d.setUTCDate(d.getUTCDate() + Math.ceil(opt.days) - 1);
      const to = d.toISOString().slice(0, 10);
      if (to !== range.to) setRange((r) => ({ ...r, to }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grant, range.from]);

  const single = unit !== "day" || isOptional;
  const from = range.from;
  const to = single ? range.from : (range.to || range.from);

  // live preview
  useEffect(() => {
    if (!open || !typeUuid || !from) { setPreview(null); return; }
    const my = ++seq.current;
    setChecking(true);
    const timer = setTimeout(async () => {
      try {
        const body = {
          leave_type_uuid: typeUuid, from_date: from, to_date: to, unit, half: unit === "half_day" || unit === "quarter_day" ? half : null,
          hours: unit === "hour" ? hours : null, grant_option: grant, attachment: files.length ? "data:," : null,
          employee_uuid: employee?.uuid ?? null,
        };
        const p = await api.post<Preview>(`/leave/requests/preview${editing ? `?request_uuid=${editing.uuid}` : ""}`, body);
        if (my === seq.current) setPreview(p);
      } catch (e) {
        if (my === seq.current) setPreview({ ok: false, errors: [e instanceof Error ? e.message : "Couldn't check these dates"], warnings: [], days: 0, items: [] });
      } finally {
        if (my === seq.current) setChecking(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [open, typeUuid, from, to, unit, half, hours, grant, files.length, employee?.uuid, editing]);

  async function submit() {
    if (!typeUuid || !from) { toast.error("Pick the leave type and the dates."); return; }
    setSaving(true);
    try {
      const attachment = files[0] ? await fileToDataUrl(files[0]) : null;
      const body = {
        leave_type_uuid: typeUuid, from_date: from, to_date: to, unit, half: unit === "half_day" || unit === "quarter_day" ? half : null,
        hours: unit === "hour" ? hours : null, reason: reason || null, grant_option: grant, attachment,
        attachment_name: files[0]?.name ?? null, employee_uuid: employee?.uuid ?? null,
      };
      const r = editing
        ? await api.put<LeaveDetail>(`/leave/requests/${editing.uuid}`, body)
        : await api.post<LeaveDetail>("/leave/requests", body);
      toast.success(editing ? "Request updated" : r.status === "approved" ? "Leave recorded" : "Leave request sent",
        { description: r.status === "pending" ? "You'll be told when it is approved." : undefined });
      onSaved(r);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't send the request");
    } finally {
      setSaving(false);
    }
  }

  const unitOptions = t ? [
    { value: "day", label: "Full day", description: "One or more days" },
    ...(t.allow_half_day ? [{ value: "half_day", label: "Half day", description: "First or second half" }] : []),
    ...(t.allow_quarter_day ? [{ value: "quarter_day", label: "Quarter day", description: "A quarter of a day" }] : []),
    ...(t.allow_hourly ? [{ value: "hour", label: "Hours", description: `Up to ${t.hours_per_day} hours` }] : []),
  ] : [];
  const typeOptions: SelectOption[] = types.map((x) => ({ value: x.uuid, label: x.name, description: x.code, icon: <span className="h-2.5 w-2.5 rounded-full" style={{ background: x.color }} /> }));
  const dirty = !!from || !!reason;

  return (
    <Modal open={open} onClose={onClose} size="xl" busy={saving} dirty={dirty}
      title={editing ? "Change leave request" : employee ? `Record leave for ${employee.name}` : "Apply for leave"}
      description={employee ? "Recorded leave is approved straight away and taken from the balance." : "Your manager is told as soon as you send it."}
      footerStart={preview && preview.days > 0 ? <span className="text-[13.5px] text-muted">{fmtDays(preview.days)}{preview.lop_days ? ` · ${fmtDays(preview.lop_days)} unpaid` : ""}</span> : undefined}
      footer={<><ModalCancel /><Button variant="primary" icon={Send} loading={saving} disabled={!preview?.ok || checking} onClick={submit}>
        {editing ? "Save changes" : employee ? "Record leave" : "Send request"}</Button></>}>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <Field label="Leave type" required>
            <Select value={typeUuid} onChange={(v) => setTypeUuid(v)} options={typeOptions} placeholder="Choose leave type" disabled={!!editing} />
          </Field>
          {t?.description && <p className="-mt-3 text-[12.5px] text-faint">{t.description}</p>}

          {t && t.grant_options.length > 0 && (
            <Field label="Kind" required>
              <Select value={grant} onChange={(v) => setGrant(v)} options={t.grant_options.map((o) => ({ value: o.key, label: o.label, description: `Up to ${fmtDays(o.days)}` }))} />
            </Field>
          )}

          {t && unitOptions.length > 1 && !isOptional && (
            <Field label="Duration">
              <RadioCards value={unit} onChange={setUnit} options={unitOptions} columns={unitOptions.length > 2 ? 4 : 2} />
            </Field>
          )}

          {isOptional ? (
            <Field label="Optional holiday" required hint="Choose from the optional holidays in your holiday calendar.">
              <Select value={range.from || null} onChange={(v) => setRange({ from: v || "", to: v || "" })}
                options={optional.filter((h) => h.date >= todayISO()).map((h) => ({ value: h.date, label: h.name, description: `${h.weekday}, ${formatDate(h.date)}`, disabled: !!h.taken }))}
                placeholder="Pick a holiday" emptyText="No optional holidays left this year" />
            </Field>
          ) : single ? (
            <FormGrid>
              <Field label="Date" required><DateInput value={range.from} onChange={(v) => setRange({ from: v, to: v })} /></Field>
              {unit === "hour" ? (
                <Field label="Hours" required><NumberInput value={hours} onChange={setHours} min={0.5} max={t?.hours_per_day ?? 8} step={0.5} suffix="h" /></Field>
              ) : (
                <Field label="Which half">
                  <RadioCards value={half} onChange={(v) => setHalf(v as "first" | "second")} columns={2}
                    options={[{ value: "first", label: "First half" }, { value: "second", label: "Second half" }]} />
                </Field>
              )}
            </FormGrid>
          ) : (
            <Field label="Dates" required hint="Weekly offs and holidays are not counted unless the policy says so.">
              <DateRangeInput value={range} onChange={setRange} />
            </Field>
          )}

          <Field label="Reason">
            <Textarea value={reason} onValueChange={setReason} rows={3} autoGrow maxLength={2000} placeholder="A short note for your manager" />
          </Field>

          {(preview?.document_needed || (t?.document_after_days !== null && t?.document_after_days !== undefined) || files.length > 0) && (
            <Field label={preview?.document_needed ? "Supporting document (needed)" : "Supporting document"} hint="PDF or image, up to 5 MB.">
              <FileDrop value={files} onChange={setFiles} accept="image/*,.pdf" maxSizeMb={5} maxFiles={1}
                onReject={(r) => toast.error(r[0] ?? "That file can't be used")} />
            </Field>
          )}
        </div>

        <PreviewPanel preview={preview} checking={checking} card={card} type={t} />
      </div>
    </Modal>
  );
}

function PreviewPanel({ preview, checking, card, type }: { preview: Preview | null; checking: boolean; card?: BalanceCard; type?: TypeBrief }) {
  if (!type) {
    return (
      <aside className="rounded-2xl border border-dashed border-line p-6 text-center text-[13.5px] text-muted">
        <CalendarCheck size={24} strokeWidth={1.2} className="mx-auto mb-2 text-faint" />
        Choose a leave type and dates to see how many days are counted.
      </aside>
    );
  }
  const y = preview?.balance?.years?.[0];
  return (
    <aside className="space-y-4">
      <div className="rounded-2xl border border-line bg-canvas/40 p-5">
        <div className="flex items-center gap-3">
          <LeaveIcon name={type.icon} color={type.color} size={30} />
          <div>
            <p className="text-[14px] text-ink">{type.name}</p>
            {card && card.show_balance && <p className="text-[12.5px] text-muted">{fmtDays(card.available)} available now</p>}
          </div>
        </div>
        <div className={`mt-5 transition-opacity ${checking ? "opacity-50" : ""}`}>
          <p className="tabular text-[40px] font-extralight leading-none text-ink">{preview ? fmtDays(preview.days, true) : "–"}</p>
          <p className="mt-1 text-[12.5px] text-muted">
            {preview ? (preview.days === 1 ? "day counted" : "days counted") : "pick the dates"}
            {preview?.sandwich_days ? ` · includes ${fmtDays(preview.sandwich_days)} between leave days` : ""}
          </p>
        </div>
        {y && type.paid === "paid" && type.mode !== "grant" && (
          <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4 text-[12.5px]">
            <div><dt className="text-faint">Available</dt><dd className="tabular text-ink">{fmtDays(y.available, true)}</dd></div>
            <div><dt className="text-faint">After this</dt><dd className={`tabular ${y.after < 0 ? "text-rose-600" : "text-ink"}`}>{fmtDays(y.after, true)}</dd></div>
          </dl>
        )}
        {!!preview?.lop_days && (
          <p className="mt-3 rounded-lg bg-amber-50/70 px-3 py-2 text-[12.5px] text-amber-800">{fmtDays(preview.lop_days)} will be loss of pay.</p>
        )}
      </div>

      {preview && preview.items.length > 0 && preview.items.length <= 62 && <DayStrip items={preview.items} />}

      {!!preview?.errors.length && (
        <ul className="space-y-1.5">
          {preview.errors.map((e) => (
            <li key={e} className="flex gap-2 rounded-lg border border-rose-200 bg-rose-50/60 px-3 py-2 text-[12.5px] text-rose-700">
              <CircleAlert size={15} strokeWidth={STROKE} className="mt-px shrink-0" />{e}
            </li>
          ))}
        </ul>
      )}
      {!!preview?.warnings.length && (
        <ul className="space-y-1.5">
          {preview.warnings.map((e) => (
            <li key={e} className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 text-[12.5px] text-amber-800">
              <AlertTriangle size={15} strokeWidth={STROKE} className="mt-px shrink-0" />{e}
            </li>
          ))}
        </ul>
      )}
      {!!preview?.team_on_leave?.length && (
        <div className="rounded-xl border border-line px-4 py-3">
          <p className="mb-2 flex items-center gap-2 text-[12.5px] text-muted"><Users size={14} strokeWidth={STROKE} />Also away on these dates</p>
          <ul className="space-y-1 text-[12.5px]">
            {preview.team_on_leave.slice(0, 6).map((p) => (
              <li key={p.name + p.from_date} className="flex justify-between gap-2"><span className="truncate text-ink">{p.name}</span>
                <span className="shrink-0 text-faint">{formatDate(p.from_date, { year: undefined })}{p.to_date !== p.from_date ? ` – ${formatDate(p.to_date, { year: undefined })}` : ""}{p.status === "pending" ? " · pending" : ""}</span></li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  );
}

export function DayStrip({ items, compact }: { items: DayItem[]; compact?: boolean }) {
  return (
    <div className={compact ? "" : "rounded-xl border border-line p-3"}>
      <div className="flex flex-wrap gap-1.5">
        {items.map((it) => {
          const d = new Date(`${it.date}T12:00:00Z`);
          const off = it.amount === 0 || it.cancelled;
          const tone = it.cancelled ? "border-line bg-sunken/40 text-faint line-through"
            : it.sandwich ? "border-amber-200 bg-amber-50/70 text-amber-800"
            : it.kind === "holiday" ? "border-emerald-200 bg-emerald-50/60 text-emerald-700"
            : off ? "border-line bg-sunken/50 text-faint"
            : it.lop ? "border-rose-200 bg-rose-50/60 text-rose-700"
            : "border-primary/25 bg-primary-soft/50 text-primary";
          const title = [formatDate(it.date), it.holiday, it.sandwich ? "counted: between leave days" : off ? "not counted" : `${it.amount} day`, it.lop ? `${it.lop} unpaid` : null, it.cancelled ? "cancelled" : null].filter(Boolean).join(" · ");
          return (
            <span key={it.date} title={title} className={`flex w-[42px] flex-col items-center rounded-lg border py-1 text-center ${tone}`}>
              <span className="text-[10px] uppercase tracking-wide opacity-70">{d.toLocaleDateString("en-IN", { weekday: "short", timeZone: "UTC" }).slice(0, 2)}</span>
              <span className="tabular text-[13.5px] leading-tight">{d.getUTCDate()}</span>
              <span className="text-[9.5px] opacity-70">{it.amount > 0 && !it.cancelled ? (it.amount === 1 ? "" : it.amount) : "off"}</span>
            </span>
          );
        })}
      </div>
      {!compact && (
        <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-faint">
          <Legend c="bg-primary/50" l="Leave" /><Legend c="bg-line-strong" l="Weekly off" /><Legend c="bg-emerald-400" l="Holiday" />
          <Legend c="bg-amber-400" l="Sandwich" /><Legend c="bg-rose-400" l="Unpaid" />
        </div>
      )}
    </div>
  );
}

function Legend({ c, l }: { c: string; l: string }) {
  return <span className="inline-flex items-center gap-1"><span className={`h-1.5 w-1.5 rounded-full ${c}`} />{l}</span>;
}
