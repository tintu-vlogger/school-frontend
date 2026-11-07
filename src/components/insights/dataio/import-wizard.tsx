"use client";

/*
 * Import wizard (in a modal): Upload → Match columns → Options → Check → Import.
 * The file is uploaded first, columns are auto-matched by the server, the import is
 * checked row by row, then run in the background while we poll its progress.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, Download, FileSpreadsheet, Loader2, Upload, XCircle,
} from "lucide-react";
import { api } from "@/lib/api";
import { downloadWithAuth, postForm } from "@/components/people/types";
import {
  Badge, Button, Checkbox, DataTable, Field, FileDrop, Modal, ModalCancel, RadioCards, Select, Stepper, paginate, useToast,
  type BadgeTone, type Column,
} from "@/components/ui-kit";
import { cellText, type DataEntity, type EntitiesResponse, type FullJob, type JobError, type Mode, type PreviewRow } from "./types";

const SKIP = "__skip__";
const STEPS = [
  { label: "Upload" }, { label: "Match columns" }, { label: "Options" }, { label: "Check" }, { label: "Import" },
];
const MODE_HELP: Record<Mode, string> = {
  add: "Every row becomes a new record. Rows that already exist are reported as problems.",
  update: "Rows change records you already have. Rows that don't match anything are reported.",
  upsert: "Rows that match are updated, the rest are added.",
};
const ACTION: Record<string, { label: string; tone: BadgeTone }> = {
  add: { label: "Add", tone: "good" },
  update: { label: "Update", tone: "info" },
  error: { label: "Problem", tone: "bad" },
};

export function templateDownload(entity: Pick<DataEntity, "key" | "label">, format: "xlsx" | "csv" = "xlsx") {
  return downloadWithAuth(`/data/entities/${entity.key}/template?format=${format}`, `${entity.key}-template.${format}`);
}

/** Mount with a fresh `key` for every new import so the wizard starts clean. */
export function ImportWizard({ entity, limits, modes, open, onClose, onFinished }: {
  entity: DataEntity;
  limits: Pick<EntitiesResponse, "max_rows" | "max_mb">;
  modes: EntitiesResponse["modes"];
  open: boolean;
  onClose: () => void;
  onFinished: () => void;
}) {
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [files, setFiles] = useState<File[]>([]);
  const [job, setJob] = useState<FullJob | null>(null);
  const [samples, setSamples] = useState<PreviewRow[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [mode, setMode] = useState<Mode>(entity.modes[0] ?? "add");
  const [matchKey, setMatchKey] = useState<string | null>(entity.match_keys[0]?.value ?? null);
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);

  const columns = entity.columns;
  const needsMatch = (mode === "update" || mode === "upsert") && entity.match_keys.length > 0;
  const missingRequired = columns.filter((c) => c.required && !mapping[c.key]);

  async function upload() {
    if (!files[0]) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("entity", entity.key);
      fd.append("file", files[0]);
      const j = await postForm<FullJob>("/data/imports", fd);
      setJob(j);
      setSamples(j.preview ?? []);
      setMapping({ ...(j.mapping ?? {}) });
      if (j.mode && entity.modes.includes(j.mode)) setMode(j.mode);
      if (j.match_key) setMatchKey(j.match_key);
      setStep(1);
    } catch (e) {
      toast.error("Couldn't read the file", { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function check() {
    if (!job) return;
    setBusy(true);
    try {
      const clean = Object.fromEntries(Object.entries(mapping).filter(([, v]) => v));
      await api.put(`/data/imports/${job.uuid}`, { mapping: clean, mode, match_key: needsMatch ? matchKey : null });
      const j = await api.post<FullJob>(`/data/imports/${job.uuid}/validate`);
      setJob(j);
      setAck(false);
      setStep(3);
    } catch (e) {
      toast.error("Couldn't check the file", { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function run() {
    if (!job) return;
    setBusy(true);
    try {
      const j = await api.post<FullJob>(`/data/imports/${job.uuid}/run`);
      setJob((prev) => ({ ...(prev as FullJob), ...j }));
      setStep(4);
    } catch (e) {
      toast.error("Couldn't start the import", { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  // Poll while the import runs.
  const polling = step === 4 && !!job && (job.status === "queued" || job.status === "running");
  const jobUuid = job?.uuid;
  useEffect(() => {
    if (!polling || !jobUuid) return;
    const uuid = jobUuid;
    const t = setInterval(() => {
      api.get<FullJob>(`/data/imports/${uuid}`)
        .then((j) => {
          setJob(j);
          if (j.status === "done" || j.status === "failed") onFinished();
        })
        .catch(() => { /* keep trying */ });
    }, 1000);
    return () => clearInterval(t);
  }, [polling, jobUuid, onFinished]);

  const opts = job?.options ?? {};
  const good = (opts.would_add ?? 0) + (opts.would_update ?? 0);
  const bad = opts.rows_with_errors ?? 0;

  let footerStart: ReactNode = <span className="text-[12.5px] text-faint">Step {step + 1} of {STEPS.length}</span>;
  let footer: ReactNode = null;
  if (step === 0) {
    footer = <>
      <ModalCancel />
      <Button variant="primary" icon={Upload} loading={busy} disabled={!files.length} onClick={upload}>Upload</Button>
    </>;
  } else if (step === 1) {
    footer = <>
      <Button icon={ArrowLeft} onClick={() => { setStep(0); setJob(null); setFiles([]); }}>Choose another file</Button>
      <Button variant="primary" iconRight={ArrowRight} disabled={missingRequired.length > 0} onClick={() => setStep(2)}>Next</Button>
    </>;
  } else if (step === 2) {
    footer = <>
      <Button icon={ArrowLeft} onClick={() => setStep(1)}>Back</Button>
      <Button variant="primary" iconRight={ArrowRight} loading={busy} disabled={needsMatch && !matchKey} onClick={check}>Check the file</Button>
    </>;
  } else if (step === 3) {
    footer = <>
      <Button icon={ArrowLeft} onClick={() => setStep(2)}>Back</Button>
      <Button variant="primary" loading={busy} disabled={good === 0 || (bad > 0 && !ack)} onClick={run}>
        {bad > 0 ? `Import ${good} good ${good === 1 ? "row" : "rows"}` : `Import ${good} ${good === 1 ? "row" : "rows"}`}
      </Button>
    </>;
  } else {
    footerStart = polling ? <span className="text-[12.5px] text-faint">You can close this window; the import keeps running.</span> : null;
    footer = <Button variant={polling ? "secondary" : "primary"} onClick={onClose}>{polling ? "Close" : "Done"}</Button>;
  }

  return (
    <Modal open={open} onClose={onClose} size="xl" title={`Import ${entity.label.toLowerCase()}`} description={entity.description}
      busy={busy} dirty={step > 0 && step < 4} dirtyTitle="Stop this import?" dirtyMessage="Nothing has been imported yet. You'll need to upload the file again."
      footerStart={footerStart} footer={footer}>
      <div className="mb-6 border-b border-line pb-5">
        <Stepper steps={STEPS} current={step}
          onStepClick={step < 4 ? (i) => { if (i >= 1 && i < step) setStep(i); } : undefined} />
      </div>
      <div>
        {step === 0 && <UploadStep entity={entity} limits={limits} files={files} setFiles={setFiles} />}
        {step === 1 && job && (
          <MatchStep entity={entity} headers={job.headers} samples={samples} mapping={mapping} setMapping={setMapping} missing={missingRequired.map((c) => c.label)} />
        )}
        {step === 2 && (
          <div className="space-y-6">
            <Field label="How to import">
              <RadioCards<Mode> columns={entity.modes.length >= 3 ? 3 : 2} value={mode} onChange={setMode}
                options={entity.modes.map((m) => ({ value: m, label: modes.find((x) => x.value === m)?.label ?? m, description: MODE_HELP[m] }))} />
            </Field>
            {needsMatch && (
              <Field label="Find existing records by" required hint="Rows are matched to what you already have using this.">
                <div className="max-w-sm">
                  <Select<string> value={matchKey} onChange={(v) => setMatchKey(v)} options={entity.match_keys} />
                </div>
              </Field>
            )}
            {entity.note && (
              <div className="flex gap-3 rounded-xl border border-line bg-sunken/60 p-4">
                <AlertTriangle size={16} strokeWidth={1.4} className="mt-0.5 shrink-0 text-amber-600" />
                <p className="text-[13.5px] leading-relaxed text-ink">{entity.note}</p>
              </div>
            )}
          </div>
        )}
        {step === 3 && job && <CheckStep entity={entity} job={job} ack={ack} setAck={setAck} />}
        {step === 4 && job && <RunStep job={job} />}
      </div>
    </Modal>
  );
}

/* ── steps ──────────────────────────────────────────────────────────────── */

function UploadStep({ entity, limits, files, setFiles }: {
  entity: DataEntity; limits: Pick<EntitiesResponse, "max_rows" | "max_mb">; files: File[]; setFiles: (f: File[]) => void;
}) {
  const toast = useToast();
  return (
    <div className="space-y-5">
      <FileDrop value={files} onChange={setFiles} accept=".xlsx,.csv" maxSizeMb={limits.max_mb} maxFiles={1}
        title="Drop an Excel or CSV file here"
        hint={`Up to ${limits.max_rows.toLocaleString("en-IN")} rows and ${limits.max_mb} MB. The first row must hold the column names.`}
        onReject={(r) => toast.error(r[0] ?? "That file can't be used")} />
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line p-4">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-sunken text-muted"><FileSpreadsheet size={17} strokeWidth={1.4} /></span>
          <div>
            <p className="text-[14px] text-ink">Start from the template</p>
            <p className="text-[12.5px] text-muted">It has every column for {entity.label.toLowerCase()} with an example row.</p>
          </div>
        </div>
        <Button size="sm" icon={Download} onClick={() => templateDownload(entity).catch((e: Error) => toast.error(e.message))}>Download template</Button>
      </div>
    </div>
  );
}

function MatchStep({ entity, headers, samples, mapping, setMapping, missing }: {
  entity: DataEntity; headers: string[]; samples: PreviewRow[]; mapping: Record<string, string>;
  setMapping: (fn: (m: Record<string, string>) => Record<string, string>) => void; missing: string[];
}) {
  const options = useMemo(() => [{ value: SKIP, label: "Don't import" }, ...headers.map((h) => ({ value: h, label: h }))], [headers]);
  const used = useMemo(() => {
    const c: Record<string, number> = {};
    Object.values(mapping).forEach((h) => { if (h) c[h] = (c[h] ?? 0) + 1; });
    return c;
  }, [mapping]);
  const sampleOf = (h: string) => samples.map((r) => cellText(r.values[h])).filter(Boolean).slice(0, 3);
  const matched = entity.columns.filter((c) => mapping[c.key]).length;

  return (
    <div className="space-y-4">
      <p className="text-[13.5px] text-muted">
        Tell us which column in your file holds each field. We matched {matched} of {entity.columns.length} by name; check them below.
      </p>
      {missing.length > 0 && (
        <div className="flex gap-2 rounded-lg border border-rose-200 bg-rose-50/60 px-3 py-2 text-[13px] text-rose-700">
          <XCircle size={16} strokeWidth={1.4} className="mt-0.5 shrink-0" />
          Choose a column for: {missing.join(", ")}.
        </div>
      )}
      <div className="divide-y divide-line rounded-xl border border-line">
        {entity.columns.map((c) => {
          const h = mapping[c.key] || "";
          const sample = h ? sampleOf(h) : [];
          return (
            <div key={c.key} className="grid items-center gap-3 px-4 py-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
              <div className="min-w-0">
                <p className="text-[14px] text-ink">
                  {c.label}{c.required && <span className="ml-0.5 text-rose-500" aria-label="required">*</span>}
                </p>
                {(c.help || c.example) && (
                  <p className="truncate text-[12px] text-faint">{c.help || `For example ${c.example}`}</p>
                )}
              </div>
              <Select<string> aria-label={`File column for ${c.label}`} value={h || SKIP} options={options}
                onChange={(v) => setMapping((m) => ({ ...m, [c.key]: !v || v === SKIP ? "" : v }))} />
              <div className="min-w-0 text-[12.5px]">
                {h && used[h] > 1 && <p className="text-amber-700">Also used for another field</p>}
                {sample.length > 0
                  ? <p className="truncate text-muted" title={sample.join(", ")}>{sample.join(" · ")}</p>
                  : <p className="text-faint">{h ? "No values in the first rows" : "Left empty"}</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CheckStep({ entity, job, ack, setAck }: { entity: DataEntity; job: FullJob; ack: boolean; setAck: (v: boolean) => void }) {
  const o = job.options ?? {};
  const bad = o.rows_with_errors ?? 0;
  const good = (o.would_add ?? 0) + (o.would_update ?? 0);
  const [errPage, setErrPage] = useState(1);
  const labelOf = (key: string | null) => (key ? entity.columns.find((c) => c.key === key)?.label ?? key : "Row");

  const mapped = entity.columns.filter((c) => job.mapping?.[c.key]).slice(0, 5);
  const previewCols: Column<PreviewRow>[] = [
    { key: "row", header: "Row", width: "64px", cell: (r) => <span className="tabular text-faint">{r.row}</span> },
    { key: "action", header: "Will", width: "100px", cell: (r) => { const a = ACTION[r.action ?? ""] ?? ACTION.add; return <Badge tone={a.tone}>{a.label}</Badge>; } },
    ...mapped.map((c) => ({
      key: c.key, header: c.label, hideBelow: "md" as const,
      cell: (r: PreviewRow) => <span className="block max-w-[180px] truncate text-[13px] text-ink">{cellText(r.values[c.key]) || <span className="text-faint">—</span>}</span>,
    })),
    {
      key: "problems", header: "Problems",
      cell: (r) => r.errors?.length ? <span className="text-[12.5px] text-rose-700">{r.errors.join("; ")}</span> : <span className="text-faint">—</span>,
    },
  ];
  const errCols: Column<JobError>[] = [
    { key: "row", header: "Row", width: "72px", cell: (e) => <span className="tabular">{e.row}</span>, sortable: true, sortValue: (e) => e.row },
    { key: "column", header: "Column", cell: (e) => labelOf(e.column) },
    { key: "message", header: "Problem", cell: (e) => <span className="text-rose-700">{e.message}</span> },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <Count label="Will add" value={o.would_add ?? 0} tone="text-emerald-700" />
        <Count label="Will update" value={o.would_update ?? 0} tone="text-sky-700" />
        <Count label="Rows with problems" value={bad} tone={bad ? "text-rose-700" : "text-ink"} />
      </div>

      {bad > 0 && good > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
          <Checkbox checked={ack} onChange={setAck} label={`Import the ${good} good ${good === 1 ? "row" : "rows"} and skip the ${bad} with problems`}
            description="You can download the skipped rows afterwards, fix them and import them again." />
        </div>
      )}
      {good === 0 && (
        <p className="rounded-xl border border-rose-200 bg-rose-50/50 p-4 text-[13.5px] text-rose-700">
          No row can be imported yet. Fix the problems below in your file, or go back and change the column matching.
        </p>
      )}

      <div>
        <p className="mb-2 text-[13px] text-muted">First {Math.min(50, job.preview.length)} rows</p>
        <DataTable rows={job.preview.slice(0, 50)} rowKey={(r) => r.row} columns={previewCols} emptyTitle="No rows in the file"
          rowClassName={(r) => (r.action === "error" ? "bg-rose-50/40" : undefined)} />
      </div>

      {job.errors.length > 0 && (
        <div>
          <p className="mb-2 text-[13px] text-muted">All problems ({job.errors.length})</p>
          <DataTable rows={paginate(job.errors, errPage, 25)} rowKey={(e) => `${e.row}-${e.column}-${e.message}`} columns={errCols}
            pagination={job.errors.length > 25 ? { page: errPage, size: 25, total: job.errors.length, onPageChange: setErrPage } : undefined} />
        </div>
      )}
    </div>
  );
}

function Count({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-xl border border-line p-4">
      <p className="text-[12.5px] text-muted">{label}</p>
      <p className={`tabular mt-1.5 text-[26px] font-extralight leading-none ${tone}`}>{value.toLocaleString("en-IN")}</p>
    </div>
  );
}

export function ProgressBar({ value, tone = "bg-primary" }: { value: number; tone?: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-sunken" role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100}>
      <div className={`h-full rounded-full transition-[width] duration-500 ${tone}`} style={{ width: `${v}%` }} />
    </div>
  );
}

function RunStep({ job }: { job: FullJob }) {
  const toast = useToast();
  const running = job.status === "queued" || job.status === "running";
  if (running) {
    return (
      <div className="mx-auto max-w-md py-10 text-center">
        <Loader2 size={26} strokeWidth={1.3} className="mx-auto mb-4 animate-spin text-primary" />
        <p className="text-[15px] text-ink">Importing {job.entity_label.toLowerCase()}…</p>
        <p className="mt-1 text-[13px] text-muted">{job.message || "Working through the rows"}</p>
        <div className="mt-6"><ProgressBar value={job.progress} /></div>
        <p className="tabular mt-2 text-[12.5px] text-faint">{job.processed.toLocaleString("en-IN")} of {job.total.toLocaleString("en-IN")} rows</p>
      </div>
    );
  }
  const failed = job.status === "failed";
  return (
    <div className="mx-auto max-w-xl py-6 text-center">
      {failed
        ? <XCircle size={30} strokeWidth={1.2} className="mx-auto mb-3 text-rose-600" />
        : <CheckCircle2 size={30} strokeWidth={1.2} className="mx-auto mb-3 text-emerald-600" />}
      <p className="text-[16px] text-ink">{failed ? "The import stopped" : "Import finished"}</p>
      {job.message && <p className="mt-1 text-[13.5px] text-muted">{job.message}</p>}
      <div className="mt-6 grid grid-cols-2 gap-3 text-left sm:grid-cols-4">
        <Count label="Added" value={job.added} tone="text-emerald-700" />
        <Count label="Updated" value={job.updated} tone="text-sky-700" />
        <Count label="Unchanged" value={job.skipped} tone="text-ink" />
        <Count label="Failed" value={job.failed} tone={job.failed ? "text-rose-700" : "text-ink"} />
      </div>
      {job.failed > 0 && (
        <div className="mt-6">
          <Button icon={Download} onClick={() => downloadWithAuth(`/data/imports/${job.uuid}/errors`, `${job.entity}-rows-to-fix.xlsx`).catch((e: Error) => toast.error(e.message))}>
            Download rows to fix
          </Button>
        </div>
      )}
    </div>
  );
}
