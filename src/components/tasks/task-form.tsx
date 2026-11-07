"use client";

/* New / edit task in a centered modal. */
import { useEffect, useState } from "react";
import { Plus, Repeat, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/toast-context";
import {
  Button, DateInput, Field, FormGrid, FormSection, IconButton, Modal, ModalCancel, NumberInput, Select, TextInput, Textarea,
} from "@/components/ui-kit";
import { AttachmentPicker } from "@/components/workplace/attachments";
import type { FileRef } from "@/components/workplace/files";
import { PRIORITY_OPTIONS, loadEmployees } from "@/components/workplace/pickers";
import type { Task } from "./types";

const FREQS = [
  { value: "", label: "Doesn't repeat" }, { value: "daily", label: "Every day" }, { value: "weekly", label: "Every week" },
  { value: "monthly", label: "Every month" }, { value: "yearly", label: "Every year" },
];

export function TaskFormModal({ open, task, onClose, onSaved }: {
  open: boolean; task: Task | null; onClose: () => void; onSaved: (t: Task) => void;
}) {
  const toast = useToast();
  const { user } = useAuth();
  const init = () => ({
    title: task?.title ?? "", description: task?.description ?? "",
    assignee: task ? task.assignee_employee_id : (user?.employee_id ?? null),
    assigneeLabel: task?.assignee_name ?? (user?.employee_id ? user.full_name : ""),
    priority: task?.priority ?? "medium", start: task?.start_date ?? "", due: task?.due_date ?? "",
    labels: (task?.labels ?? []).join(", "), checklist: [] as string[],
    freq: task?.recurrence?.freq ?? "", interval: task?.recurrence?.interval ?? 1, until: task?.recurrence?.until ?? "",
    remind: task?.remind_days_before ?? 1,
  });
  const [v, setV] = useState(init);
  const [files, setFiles] = useState<FileRef[]>([]);
  const [newItem, setNewItem] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (open) { setV(init()); setFiles([]); setNewItem(""); setError(""); } }, [open, task?.uuid]);
  const editing = !!task;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!v.title.trim()) { setError("Give the task a title"); return; }
    if (v.freq && !v.due) { toast.error("A repeating task needs a due date"); return; }
    const recurrence = v.freq ? { freq: v.freq, interval: v.interval || 1, until: v.until || null } : null;
    const labels = v.labels.split(",").map((x) => x.trim()).filter(Boolean);
    setSaving(true);
    try {
      const body = {
        title: v.title.trim(), description: v.description.trim() || null, assignee_employee_id: v.assignee,
        priority: v.priority, start_date: v.start || null, due_date: v.due || null, labels, recurrence,
        remind_days_before: v.remind ?? 1,
      };
      const out = editing
        ? await api.put<Task>(`/tasks/${task!.uuid}`, body)
        : await api.post<Task>("/tasks", { ...body, checklist: [...v.checklist, ...(newItem.trim() ? [newItem.trim()] : [])], attachments: files.map((f) => f.uuid) });
      toast.success(editing ? "Task updated" : "Task created");
      onSaved(out);
    } catch (err) { toast.error("Couldn't save the task", { description: err instanceof Error ? err.message : undefined }); }
    finally { setSaving(false); }
  }

  return (
    <Modal open={open} onClose={onClose} size="lg" busy={saving} dirty={v.title !== (task?.title ?? "") && !!v.title}
      title={editing ? "Edit task" : "New task"}
      footer={<><ModalCancel /><Button variant="primary" type="submit" form="task-form" loading={saving}>{editing ? "Save changes" : "Create task"}</Button></>}>
      <form id="task-form" onSubmit={submit} noValidate className="space-y-6">
        <FormGrid>
          <Field label="Title" required error={error} className="sm:col-span-2">
            <TextInput autoFocusInModal value={v.title} maxLength={200} onValueChange={(x) => { setV({ ...v, title: x }); setError(""); }} placeholder="What needs doing" />
          </Field>
          <Field label="Assign to">
            <Select value={v.assignee} onChange={(x, o) => setV({ ...v, assignee: x, assigneeLabel: o?.label ?? "" })} loadOptions={loadEmployees}
              clearable placeholder="Search people" selectedOption={v.assignee ? { value: v.assignee, label: v.assigneeLabel || "Selected" } : null} />
          </Field>
          <Field label="Priority">
            <Select value={v.priority} onChange={(x) => setV({ ...v, priority: x || "medium" })} options={PRIORITY_OPTIONS} />
          </Field>
          <Field label="Start" aside="Optional"><DateInput value={v.start} onChange={(x) => setV({ ...v, start: x })} clearable /></Field>
          <Field label="Due"><DateInput value={v.due} onChange={(x) => setV({ ...v, due: x })} min={v.start || undefined} clearable /></Field>
          <Field label="Details" aside="Optional" className="sm:col-span-2">
            <Textarea rows={3} autoGrow maxRows={10} value={v.description} onValueChange={(x) => setV({ ...v, description: x })} />
          </Field>
          <Field label="Labels" aside="Comma separated" className="sm:col-span-2">
            <TextInput value={v.labels} onValueChange={(x) => setV({ ...v, labels: x })} placeholder="payroll, onboarding" />
          </Field>
        </FormGrid>
        {!editing && (
          <FormSection title="Checklist" description="Small steps the assignee ticks off.">
            <ul className="space-y-2">
              {v.checklist.map((c, i) => (
                <li key={i} className="flex items-center gap-2 rounded-lg border border-line px-3 py-1.5 text-[14px]">
                  <span className="flex-1 truncate">{c}</span>
                  <IconButton icon={Trash2} label="Remove" size="sm" onClick={() => setV({ ...v, checklist: v.checklist.filter((_, j) => j !== i) })} />
                </li>
              ))}
            </ul>
            <div className="mt-2 flex gap-2">
              <TextInput value={newItem} onValueChange={setNewItem} placeholder="Add a step"
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (newItem.trim()) { setV({ ...v, checklist: [...v.checklist, newItem.trim()] }); setNewItem(""); } } }} />
              <Button icon={Plus} onClick={() => { if (newItem.trim()) { setV({ ...v, checklist: [...v.checklist, newItem.trim()] }); setNewItem(""); } }}>Add</Button>
            </div>
          </FormSection>
        )}
        <FormSection title="Repeat and reminders">
          <FormGrid columns={3}>
            <Field label="Repeat"><Select value={v.freq} onChange={(x) => setV({ ...v, freq: x || "" })} options={FREQS} /></Field>
            {v.freq && <Field label="Every"><NumberInput value={v.interval} onChange={(x) => setV({ ...v, interval: x ?? 1 })} min={1} max={12} suffix={v.freq.replace("ly", "").replace("dai", "day") + "(s)"} /></Field>}
            {v.freq && <Field label="Until" aside="Optional"><DateInput value={v.until} onChange={(x) => setV({ ...v, until: x })} clearable /></Field>}
            <Field label="Remind" hint="Days before the due date"><NumberInput value={v.remind} onChange={(x) => setV({ ...v, remind: x ?? 0 })} min={0} max={30} suffix="days" /></Field>
          </FormGrid>
          {v.freq && <p className="mt-3 flex items-center gap-2 text-[12.5px] text-muted"><Repeat size={13} strokeWidth={1.4} /> When this is done, the next one is created with the same checklist.</p>}
        </FormSection>
        {!editing && <Field label="Attachments" aside="Optional"><AttachmentPicker value={files} onChange={setFiles} /></Field>}
      </form>
    </Modal>
  );
}
