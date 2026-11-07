"use client";

/*
 * Continuous feedback pieces.
 *   <FeedbackCard item={f} view="received" onAnswer={...} />   one item in a feed
 *   <GiveFeedbackModal open onClose onSaved />                  praise, suggestion or feedback for a colleague
 *   <AskFeedbackModal open onClose onSaved isManager />         ask up to 10 people (about me or a reportee)
 *   <AnswerFeedbackModal item={f | null} onClose onSaved />     answer or decline a request
 */
import { useState } from "react";
import { Lightbulb, Lock, MessageSquare, Sparkles, Users } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatRelative } from "@/lib/datetime";
import {
  Avatar, Badge, Button, Checkbox, Field, Modal, ModalCancel, MultiSelect, RadioCards, Select, Textarea, type BadgeTone, type SelectOption,
} from "@/components/ui-kit";
import { searchEmployees, STROKE } from "../shared";
import type { FeedbackItem } from "../types";

const err = (e: unknown) => (e instanceof Error ? e.message : undefined);

export const KIND: Record<string, { label: string; tone: BadgeTone; icon: typeof Sparkles }> = {
  praise: { label: "Praise", tone: "good", icon: Sparkles },
  suggestion: { label: "Suggestion", tone: "warn", icon: Lightbulb },
  feedback: { label: "Feedback", tone: "info", icon: MessageSquare },
};

export function FeedbackCard({ item, view, onAnswer }: {
  item: FeedbackItem; view: "received" | "given" | "requests" | "asked" | "team"; onAnswer?: () => void;
}) {
  const k = KIND[item.kind] ?? KIND.feedback;
  const Icon = k.icon;
  const isRequest = item.status !== "given";
  // who to show as the headline person
  const lead = view === "given" || view === "asked" ? item.receiver : item.giver;
  const headline = (() => {
    if (view === "given") return <>To <span className="text-ink">{item.receiver?.name}</span></>;
    if (view === "team") return <><span className="text-ink">{item.giver.name}</span> about <span className="text-ink">{item.receiver?.name}</span></>;
    if (view === "requests") return <><span className="text-ink">{item.requested_by?.name ?? item.receiver?.name}</span> asked{item.requested_by && item.receiver && item.requested_by.id !== item.receiver.id ? <> about <span className="text-ink">{item.receiver.name}</span></> : null}</>;
    if (view === "asked") return <>Asked <span className="text-ink">{item.giver.name}</span>{item.receiver && item.requested_by && item.receiver.id !== item.requested_by.id ? <> about <span className="text-ink">{item.receiver.name}</span></> : null}</>;
    return <span className="text-ink">{item.giver.name}</span>;
  })();
  const who = view === "asked" ? item.giver : lead;
  return (
    <article className="rounded-2xl border border-line bg-surface p-5">
      <header className="flex items-start gap-3">
        <Avatar name={who?.name ?? "?"} src={who?.photo} size={38} />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] text-muted">{headline}</p>
          <p className="text-[12.5px] text-faint">{formatRelative(item.given_at ?? item.created_at)}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {item.status === "given" && item.visibility === "manager" && view !== "team" && (
            <span className="hidden items-center gap-1 text-[12px] text-faint sm:inline-flex"><Users size={13} strokeWidth={STROKE} />Shared with manager</span>
          )}
          {item.status === "given" && item.visibility === "private" && (view === "given" || view === "received") && (
            <span className="hidden items-center gap-1 text-[12px] text-faint sm:inline-flex"><Lock size={13} strokeWidth={STROKE} />Private</span>
          )}
          {isRequest
            ? <Badge tone={item.status === "declined" ? "neutral" : "warn"} dot>{item.status === "declined" ? "Declined" : "Waiting"}</Badge>
            : <Badge tone={k.tone}><Icon size={12} strokeWidth={STROKE} className="mr-1 inline" />{k.label}</Badge>}
        </div>
      </header>
      {item.prompt && (
        <p className="mt-4 border-l-2 border-line-strong pl-3 text-[13.5px] italic text-muted">{item.prompt}</p>
      )}
      {item.message && <p className="mt-3 whitespace-pre-line text-[14.5px] leading-relaxed text-ink/90">{item.message}</p>}
      {view === "requests" && item.mine_to_answer && onAnswer && (
        <div className="mt-4 flex justify-end"><Button variant="primary" size="sm" onClick={onAnswer}>Answer</Button></div>
      )}
    </article>
  );
}

const KIND_OPTIONS = [
  { value: "praise" as const, label: "Praise", description: "Thank them for something specific", icon: Sparkles },
  { value: "suggestion" as const, label: "Suggestion", description: "Something to try or change", icon: Lightbulb },
  { value: "feedback" as const, label: "Feedback", description: "General observations", icon: MessageSquare },
];

const VIS_OPTIONS = [
  { value: "private" as const, label: "Only them", description: "Private between the two of you", icon: Lock },
  { value: "manager" as const, label: "Them and their manager", description: "Their manager can see it too", icon: Users },
];

export function GiveFeedbackModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [to, setTo] = useState<number | null>(null);
  const [toOpt, setToOpt] = useState<SelectOption<number> | null>(null);
  const [kind, setKind] = useState<"praise" | "suggestion" | "feedback">("praise");
  const [message, setMessage] = useState("");
  const [vis, setVis] = useState<"private" | "manager">("private");
  const [kudos, setKudos] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (!to) er.to = "Pick who it is for.";
    if (message.trim().length < 3) er.message = "Write your feedback.";
    setErrors(er);
    if (Object.keys(er).length) return;
    setSaving(true);
    try {
      await api.post("/performance/feedback", { receiver_employee_id: to, message: message.trim(), kind, visibility: vis, also_kudos: kind === "praise" && kudos });
      toast.success(`Sent to ${toOpt?.label ?? "them"}`);
      onSaved();
    } catch (x) {
      toast.error("Couldn't send the feedback", { description: err(x) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} size="lg" title="Give feedback" busy={saving} dirty={!!message.trim()}
      description="Specific, timely feedback helps people grow. Say what happened and why it mattered."
      footer={<><ModalCancel /><Button variant="primary" type="submit" form="give-feedback" loading={saving}>Send</Button></>}>
      <form id="give-feedback" onSubmit={save} className="space-y-5">
        <Field label="For" required error={errors.to}>
          <Select<number> value={to} selectedOption={toOpt} loadOptions={searchEmployees} placeholder="Search people"
            onChange={(v, o) => { setTo(v); setToOpt(o); }} />
        </Field>
        <Field label="Kind"><RadioCards options={KIND_OPTIONS} value={kind} onChange={setKind} columns={3} /></Field>
        <Field label="Message" required error={errors.message}>
          <Textarea value={message} onValueChange={setMessage} rows={5} maxLength={5000} autoGrow
            placeholder={kind === "praise" ? "In Tuesday's client call you summarised the open issues clearly. The client loved it." : "What you noticed, and what could make it even better."} />
        </Field>
        <Field label="Who can see it"><RadioCards options={VIS_OPTIONS} value={vis} onChange={setVis} columns={2} /></Field>
        {kind === "praise" && (
          <Checkbox checked={kudos} onChange={setKudos} label="Also post as kudos" description="Shows on the company feed for everyone to see." />
        )}
      </form>
    </Modal>
  );
}

export function AskFeedbackModal({ open, onClose, onSaved, isManager }: { open: boolean; onClose: () => void; onSaved: () => void; isManager: boolean }) {
  const toast = useToast();
  const [about, setAbout] = useState<"me" | "team">("me");
  const [aboutId, setAboutId] = useState<number | null>(null);
  const [aboutOpt, setAboutOpt] = useState<SelectOption<number> | null>(null);
  const [givers, setGivers] = useState<number[]>([]);
  const [giverOpts, setGiverOpts] = useState<SelectOption<number>[]>([]);
  const [prompt, setPrompt] = useState("");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (!givers.length) er.givers = "Pick at least one person.";
    if (about === "team" && !aboutId) er.about = "Pick the team member.";
    setErrors(er);
    if (Object.keys(er).length) return;
    setSaving(true);
    try {
      const r = await api.post<{ requested: number }>("/performance/feedback/requests", {
        giver_employee_ids: givers, about_employee_id: about === "team" ? aboutId : undefined, prompt: prompt.trim() || undefined,
      });
      toast.success(`Asked ${r.requested} ${r.requested === 1 ? "person" : "people"}`);
      onSaved();
    } catch (x) {
      toast.error("Couldn't send the request", { description: err(x) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} size="md" title="Ask for feedback" busy={saving} dirty={givers.length > 0 || !!prompt}
      description="People you ask get a request in their feedback page."
      footer={<><ModalCancel /><Button variant="primary" type="submit" form="ask-feedback" loading={saving}>Send request</Button></>}>
      <form id="ask-feedback" onSubmit={save} className="space-y-5">
        {isManager && (
          <Field label="About">
            <RadioCards value={about} onChange={setAbout} columns={2} options={[
              { value: "me", label: "Me", description: "Feedback on your own work" },
              { value: "team", label: "Someone in my team", description: "For a review or a check-in" },
            ]} />
          </Field>
        )}
        {about === "team" && (
          <Field label="Team member" required error={errors.about}>
            <Select<number> value={aboutId} selectedOption={aboutOpt} loadOptions={searchEmployees} placeholder="Search your team"
              onChange={(v, o) => { setAboutId(v); setAboutOpt(o); }} />
          </Field>
        )}
        <Field label="Ask" required error={errors.givers} hint="Up to 10 people.">
          <MultiSelect<number> value={givers} selectedOptions={giverOpts} loadOptions={searchEmployees} max={10} placeholder="Search people"
            onChange={(v, o) => { setGivers(v); setGiverOpts(o); }} />
        </Field>
        <Field label="Question" hint="Leave empty to ask what to keep doing and what to do better.">
          <Textarea value={prompt} onValueChange={setPrompt} rows={3} maxLength={1000}
            placeholder="How did the launch go from your side? What should I change next time?" />
        </Field>
      </form>
    </Modal>
  );
}

export function AnswerFeedbackModal({ item, onClose, onSaved }: { item: FeedbackItem | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState<"send" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function send(decline: boolean) {
    if (!item) return;
    if (!decline && message.trim().length < 3) { setError("Write your feedback."); return; }
    setSaving(decline ? "decline" : "send");
    try {
      await api.post(`/performance/feedback/${item.uuid}/answer`, decline ? { decline: true } : { message: message.trim() });
      toast.success(decline ? "Request declined" : "Feedback sent");
      setMessage("");
      onSaved();
    } catch (x) {
      toast.error("Couldn't save", { description: err(x) });
    } finally {
      setSaving(null);
    }
  }

  const asker = item?.requested_by?.name ?? item?.receiver?.name;
  const aboutOther = item?.receiver && item?.requested_by && item.receiver.id !== item.requested_by.id;
  return (
    <Modal open={!!item} onClose={onClose} size="md" title={asker ? `Feedback for ${aboutOther ? item!.receiver!.name : asker}` : "Answer"}
      busy={!!saving} dirty={!!message.trim()}
      description={aboutOther ? `${asker} asked about ${item!.receiver!.name}.` : undefined}
      footerStart={<Button variant="ghost" onClick={() => send(true)} loading={saving === "decline"}>Decline</Button>}
      footer={<><ModalCancel /><Button variant="primary" onClick={() => send(false)} loading={saving === "send"}>Send</Button></>}>
      {item && (
        <div className="space-y-5">
          <div className="rounded-xl bg-sunken/60 p-4">
            <p className="text-[12px] uppercase tracking-[0.08em] text-faint">Their question</p>
            <p className="mt-1 text-[14.5px] text-ink">{item.prompt}</p>
          </div>
          <Field label="Your feedback" required error={error}>
            <Textarea value={message} onValueChange={(v) => { setMessage(v); setError(null); }} rows={6} autoGrow maxLength={5000} data-autofocus />
          </Field>
        </div>
      )}
    </Modal>
  );
}
