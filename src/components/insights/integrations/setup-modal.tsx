"use client";

/*
 * Setup modal for one integration. Fields are drawn from the integration's definition.
 * Secret fields are never prefilled: leave them blank to keep what is saved.
 */
import { useState } from "react";
import { CheckCircle2, Lock, PlugZap, ShieldCheck, XCircle } from "lucide-react";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/datetime";
import {
  Badge, Button, Field, FormGrid, Modal, ModalCancel, NumberInput, Select, TextInput, Toggle, useToast,
} from "@/components/ui-kit";
import { STATUS, type Integration, type IntegrationField } from "./types";

type Value = string | number | boolean | null;

const AI_HINTS: Record<string, { base_url: string; model: string; note: string }> = {
  openai: {
    base_url: "https://api.openai.com/v1", model: "gpt-4o-mini",
    note: "Works with OpenAI and any service that speaks the same API: Azure OpenAI, Groq, Together, or a local Ollama or vLLM server.",
  },
  anthropic: { base_url: "Leave blank to use the default", model: "model name", note: "Enter the model name exactly as your Anthropic account lists it." },
  gemini: { base_url: "Leave blank to use the default", model: "gemini-2.0-flash", note: "Use an API key from Google AI Studio." },
};

function initial(it: Integration): Record<string, Value> {
  const v: Record<string, Value> = {};
  for (const f of it.fields) {
    if (f.secret || f.type === "password") v[f.key] = "";
    else if (f.type === "toggle") v[f.key] = Boolean(it.config[f.key]);
    else if (f.type === "number") v[f.key] = it.config[f.key] === undefined || it.config[f.key] === null || it.config[f.key] === "" ? null : Number(it.config[f.key]);
    else v[f.key] = it.config[f.key] === undefined || it.config[f.key] === null ? "" : String(it.config[f.key]);
  }
  return v;
}

/** Mount with a fresh `key` per opening. */
export function SetupModal({ integration, open, onClose, onSaved }: {
  integration: Integration; open: boolean; onClose: () => void; onSaved: (it: Integration) => void;
}) {
  const toast = useToast();
  const [it, setIt] = useState(integration);
  const [baseline, setBaseline] = useState(() => ({
    values: initial(integration), enabled: integration.status === "not_set_up" ? true : integration.enabled,
  }));
  const [values, setValues] = useState<Record<string, Value>>(baseline.values);
  const [enabled, setEnabled] = useState(baseline.enabled);
  const [clear, setClear] = useState<string[]>([]);
  const [busy, setBusy] = useState<"save" | "test" | null>(null);
  const [tested, setTested] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const dirty = enabled !== baseline.enabled || clear.length > 0
    || Object.keys(values).some((k) => values[k] !== baseline.values[k]);
  const isAi = it.kind === "ai_model";
  const provider = String(values.provider || "openai");
  const aiHint = AI_HINTS[provider] ?? AI_HINTS.openai;
  const set = (k: string, v: Value) => { setValues((s) => ({ ...s, [k]: v })); setErrors((e) => ({ ...e, [k]: "" })); };

  function validate() {
    const e: Record<string, string> = {};
    for (const f of it.fields) {
      if (!f.required || f.type === "toggle") continue;
      const v = values[f.key];
      const hasSaved = !!it.secret_hints[f.key] && !clear.includes(f.key);
      if ((v === null || v === "") && !(f.type === "password" && hasSaved)) e[f.key] = `Enter the ${f.label.toLowerCase()}`;
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function save(): Promise<Integration | null> {
    const config: Record<string, Value> = {};
    for (const f of it.fields) {
      const v = values[f.key];
      if (f.type === "password" || f.secret) { if (typeof v === "string" && v.trim()) config[f.key] = v.trim(); }
      else config[f.key] = typeof v === "string" ? v.trim() : v;
    }
    const r = await api.put<Integration>(`/integrations/${it.kind}`, { enabled, config, ...(clear.length ? { clear_secrets: clear } : {}) });
    setIt(r);
    onSaved(r);
    return r;
  }

  async function onSave() {
    if (!validate()) return;
    setBusy("save");
    try {
      await save();
      toast.success(`${it.label} saved`);
      onClose();
    } catch (e) {
      toast.error("Couldn't save", { description: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  async function onTest() {
    if (dirty && !validate()) return;
    setBusy("test");
    try {
      if (dirty) {
        await save();
        const next = { ...values };
        for (const f of it.fields) if (f.type === "password" || f.secret) next[f.key] = "";
        setValues(next);
        setBaseline({ values: next, enabled });
        setClear([]);
      }
      const r = await api.post<Integration>(`/integrations/${it.kind}/test`);
      setIt(r);
      onSaved(r);
      setTested(true);
    } catch (e) {
      toast.error("Couldn't test the connection", { description: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  function placeholder(f: IntegrationField) {
    if (isAi && f.key === "base_url") return aiHint.base_url;
    if (isAi && f.key === "model") return aiHint.model;
    if (f.type === "password" && it.secret_hints[f.key] && !clear.includes(f.key)) return "Leave blank to keep";
    return f.placeholder || undefined;
  }

  function control(f: IntegrationField) {
    const v = values[f.key];
    if (f.type === "toggle") return <Toggle checked={Boolean(v)} onChange={(x) => set(f.key, x)} label={f.label} description={f.help || undefined} />;
    if (f.type === "select") {
      return <Select<string> value={v ? String(v) : null} onChange={(x) => set(f.key, x ?? "")} options={f.options ?? []} placeholder="Choose" invalid={!!errors[f.key]} />;
    }
    if (f.type === "number") {
      return <NumberInput value={typeof v === "number" ? v : null} onChange={(x) => set(f.key, x)} placeholder={placeholder(f)} step={f.key === "temperature" ? 0.1 : 1} min={0} invalid={!!errors[f.key]} />;
    }
    return (
      <TextInput type={f.type === "password" ? "password" : "text"} value={String(v ?? "")} onValueChange={(x) => set(f.key, x)}
        placeholder={placeholder(f)} autoComplete={f.type === "password" ? "new-password" : "off"} spellCheck={false} invalid={!!errors[f.key]} />
    );
  }

  function hint(f: IntegrationField) {
    const saved = it.secret_hints[f.key];
    if (f.type === "password" && saved) {
      if (clear.includes(f.key)) {
        return <span>Will be removed. <button type="button" className="text-primary hover:text-primary-dark" onClick={() => setClear((c) => c.filter((k) => k !== f.key))}>Keep it</button></span>;
      }
      return (
        <span>
          Saved ({saved}) — leave blank to keep.{" "}
          {!f.required && <button type="button" className="text-primary hover:text-primary-dark" onClick={() => setClear((c) => [...c, f.key])}>Remove</button>}
        </span>
      );
    }
    return f.help || undefined;
  }

  const st = STATUS[it.status] ?? STATUS.not_set_up;
  const toggles = it.fields.filter((f) => f.type === "toggle");
  const inputs = it.fields.filter((f) => f.type !== "toggle");

  return (
    <Modal open={open} onClose={onClose} size="lg" title={it.label} description={it.description} dirty={dirty} busy={!!busy}
      headerActions={<Badge tone={st.tone} dot>{st.label}</Badge>}
      footerStart={<Button icon={PlugZap} loading={busy === "test"} disabled={!!busy && busy !== "test"} onClick={onTest}>Test connection</Button>}
      footer={<><ModalCancel /><Button variant="primary" loading={busy === "save"} disabled={!!busy && busy !== "save"} onClick={onSave}>Save</Button></>}>
      <div className="space-y-6">
        {(tested || it.last_message) && it.last_tested_at && (
          <div className={`flex gap-3 rounded-xl border p-4 ${it.status === "error" ? "border-rose-200 bg-rose-50/50" : it.status === "connected" ? "border-emerald-200 bg-emerald-50/50" : "border-line bg-sunken/60"}`}>
            {it.status === "error"
              ? <XCircle size={17} strokeWidth={1.4} className="mt-0.5 shrink-0 text-rose-600" />
              : <CheckCircle2 size={17} strokeWidth={1.4} className="mt-0.5 shrink-0 text-emerald-600" />}
            <div className="min-w-0">
              <p className="text-[13.5px] text-ink">{it.last_message || (it.status === "connected" ? "Connected" : "Tested")}</p>
              <p className="mt-0.5 text-[12px] text-faint">Tested {formatDateTime(it.last_tested_at)}</p>
            </div>
          </div>
        )}

        {isAi && (
          <div className="flex gap-3 rounded-xl border border-line bg-sunken/60 p-4">
            <ShieldCheck size={17} strokeWidth={1.4} className="mt-0.5 shrink-0 text-primary" />
            <div className="space-y-1 text-[13px] leading-relaxed text-muted">
              <p className="text-ink">{aiHint.note}</p>
              <p>The key is stored encrypted and never shown again. Only data the person asking is allowed to see is sent to the model, and only what is needed to answer.</p>
            </div>
          </div>
        )}

        <FormGrid columns={2}>
          {inputs.map((f) => (
            <Field key={f.key} label={<span className="inline-flex items-center gap-1">{f.type === "password" && <Lock size={12} strokeWidth={1.4} className="text-faint" />}{f.label}</span>}
              required={f.required} hint={hint(f)} error={errors[f.key] || undefined}
              className={f.type === "password" || f.key === "base_url" ? "sm:col-span-2" : undefined}>
              {control(f)}
            </Field>
          ))}
        </FormGrid>

        {toggles.length > 0 && <div className="space-y-4">{toggles.map((f) => <div key={f.key}>{control(f)}</div>)}</div>}

        <div className="border-t border-line pt-5">
          <Toggle checked={enabled} onChange={setEnabled} label="Enabled"
            description={enabled ? "In use across the app." : "Settings are kept but nothing is sent through it."} />
        </div>

        {it.updated_at && (
          <p className="text-[12px] text-faint">Last changed {formatDateTime(it.updated_at)}{it.updated_by_name ? ` by ${it.updated_by_name}` : ""}</p>
        )}
      </div>
    </Modal>
  );
}
