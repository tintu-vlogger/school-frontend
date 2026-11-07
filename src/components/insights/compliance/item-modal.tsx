"use client";

/*
 * Detail of one compliance item: plain-language guidance, the facts, and (for items kept
 * in Compliance) Mark as done / Not needed / Reopen. Payroll items point to Payroll.
 */
import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, CheckCircle2, Info, RotateCcw, Ban } from "lucide-react";
import { api } from "@/lib/api";
import { formatDate, todayISO } from "@/lib/datetime";
import {
  Badge, Button, DateInput, Field, FormGrid, KeyValue, Modal, TextInput, Textarea, useToast,
} from "@/components/ui-kit";
import { STATUS_META, dueText, formatAmount, itemWhere, type ComplianceItem } from "./types";

export function ComplianceItemModal({ item, onClose, onChanged }: {
  item: ComplianceItem | null; onClose: () => void; onChanged: () => void;
}) {
  return (
    <Modal open={!!item} onClose={onClose} size="lg" title={item?.label}
      description={item ? [item.period, itemWhere(item)].filter(Boolean).join(" · ") : undefined}>
      {item && <ItemBody key={item.key} item={item} onClose={onClose} onChanged={onChanged} />}
    </Modal>
  );
}

function ItemBody({ item, onClose, onChanged }: { item: ComplianceItem; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState(false);
  const [doneOn, setDoneOn] = useState(todayISO());
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const meta = STATUS_META[item.status];
  const open = item.status === "pending" || item.status === "late";
  const amount = formatAmount(item.amount);
  const due = dueText(item);

  async function mark(status: "done" | "not_applicable" | "pending") {
    setBusy(status);
    try {
      await api.post("/compliance/records", {
        key: item.key, status,
        ...(status === "done" ? { done_on: doneOn || null, reference: reference.trim() || null, notes: notes.trim() || null } : {}),
      });
      toast.success(status === "done" ? "Marked as done" : status === "pending" ? "Reopened" : "Marked as not needed");
      onChanged();
      onClose();
    } catch (e) {
      toast.error("Couldn't save", { description: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={meta.tone} dot>{meta.label}</Badge>
        {due && <span className={item.status === "late" ? "text-[13px] text-rose-700" : "text-[13px] text-muted"}>{due}</span>}
      </div>

      <div className="flex gap-3 rounded-xl border border-line bg-sunken/60 p-4">
        <Info size={17} strokeWidth={1.4} className="mt-0.5 shrink-0 text-primary" />
        <p className="text-[14px] leading-relaxed text-ink">{item.guidance}</p>
      </div>

      <KeyValue columns={2} items={[
        { label: "Due date", value: formatDate(item.due_date) },
        { label: "Period", value: item.period },
        { label: "Legal entity", value: item.legal_entity || "All entities" },
        { label: "State", value: item.state_name || item.state },
        ...(amount ? [{ label: "Amount", value: <span className="tabular">{amount}</span> }] : []),
        { label: "Reference", value: item.reference },
        { label: "Done on", value: item.done_on ? formatDate(item.done_on) : null },
        { label: "Tracked in", value: item.source === "payroll" ? "Payroll" : "Compliance" },
      ]} />

      {item.source === "payroll" && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line p-4">
          <p className="text-[13.5px] text-muted">{item.action || "This is updated from Payroll."}</p>
          <Link href="/dashboard/payroll" className="inline-flex items-center gap-1.5 text-[13.5px] text-primary hover:text-primary-dark">
            Open Payroll <ArrowUpRight size={14} strokeWidth={1.4} />
          </Link>
        </div>
      )}

      {item.markable && open && !form && (
        <div className="flex flex-wrap gap-2 border-t border-line pt-5">
          <Button variant="primary" icon={CheckCircle2} onClick={() => setForm(true)}>Mark as done</Button>
          <Button icon={Ban} loading={busy === "not_applicable"} onClick={() => mark("not_applicable")}>Not needed</Button>
        </div>
      )}

      {item.markable && open && form && (
        <div className="space-y-5 border-t border-line pt-5">
          <FormGrid columns={2}>
            <Field label="Done on" required>
              <DateInput value={doneOn} onChange={setDoneOn} max={todayISO()} />
            </Field>
            <Field label="Reference" hint="Challan, acknowledgement or receipt number">
              <TextInput value={reference} onValueChange={setReference} placeholder="Optional" />
            </Field>
          </FormGrid>
          <Field label="Notes">
            <Textarea value={notes} onValueChange={setNotes} rows={2} placeholder="Optional" />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" loading={busy === "done"} disabled={!doneOn} onClick={() => mark("done")}>Save</Button>
            <Button variant="ghost" onClick={() => setForm(false)}>Back</Button>
          </div>
        </div>
      )}

      {item.markable && !open && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
          <p className="text-[13px] text-muted">
            {item.status === "done" ? "Marked as done." : "Marked as not needed."} Reopen it if this was a mistake.
          </p>
          <Button icon={RotateCcw} loading={busy === "pending"} onClick={() => mark("pending")}>Reopen</Button>
        </div>
      )}
    </div>
  );
}
