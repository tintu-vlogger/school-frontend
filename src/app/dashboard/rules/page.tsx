"use client";

/*
 * Rules: try a condition or formula with sample values before using it in an approval
 * flow, a leave policy or a salary part. Uses the same engine as the server.
 */
import { useEffect, useState } from "react";
import { CheckCircle2, CircleAlert, FlaskConical, Play } from "lucide-react";
import { api } from "@/lib/api";
import { PageHeader, Paper, PaperHeader } from "@/components/shell/page";
import { Badge, Button, Field, Textarea } from "@/components/ui-kit";

type Fn = { name: string; help: string };
type Result = { result: unknown; type: string; fields: string[] };

const EXAMPLES = [
  { label: "Long leave by a manager", text: "employee.grade in ['M1', 'M2'] and request.days > 3" },
  { label: "40% of basic, rounded", text: "round(basic * 0.4, 0)" },
  { label: "Years of service", text: "years_between(employee.joined_on, today())" },
  { label: "Gratuity eligible", text: "if(years_between(employee.joined_on, today()) >= 5, 'Yes', 'No')" },
  { label: "Amount band", text: "request.amount between 10000 and 50000" },
];

const SAMPLE = `{
  "employee": { "grade": "M1", "joined_on": "2019-06-01", "state": "KA" },
  "request": { "days": 4, "amount": 25000 },
  "basic": 32000
}`;

export default function RulesPage() {
  const [expression, setExpression] = useState(EXAMPLES[0].text);
  const [sample, setSample] = useState(SAMPLE);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<{ message: string; position?: number | null } | null>(null);
  const [running, setRunning] = useState(false);
  const [fns, setFns] = useState<Fn[]>([]);

  useEffect(() => { api.get<Fn[]>("/rules/functions").then(setFns).catch(() => {}); }, []);

  async function run() {
    let variables: Record<string, unknown> = {};
    try {
      variables = sample.trim() ? JSON.parse(sample) : {};
    } catch {
      setResult(null);
      setError({ message: "The sample values are not valid JSON. Check commas and quotes." });
      return;
    }
    setRunning(true);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("hrms_token") : null;
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/rules/evaluate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ expression, variables }),
      });
      const body = await res.json();
      if (!res.ok) { setResult(null); setError({ message: body.detail, position: body.position }); }
      else { setError(null); setResult(body); }
    } catch {
      setError({ message: "Couldn't reach the server. Try again." });
    } finally {
      setRunning(false);
    }
  }

  const shown = result ? (typeof result.result === "boolean" ? (result.result ? "Yes (true)" : "No (false)") : result.result === null ? "Empty" : String(result.result)) : "";

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Settings" title="Rules"
        description="Write a condition or a formula and try it with sample values. The same rules are used in approval flows, policies and salary formulas." />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Paper>
            <PaperHeader title="Try a rule" action={<Button variant="primary" icon={Play} loading={running} onClick={run}>Run</Button>} />
            <div className="space-y-5 px-5 py-5">
              <Field label="Condition or formula">
                <Textarea value={expression} onValueChange={setExpression} rows={3} autoGrow className="font-mono text-[13.5px]"
                  onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") run(); }} />
              </Field>
              <div className="-mt-2 flex flex-wrap gap-1.5">
                {EXAMPLES.map((x) => (
                  <button key={x.label} type="button" onClick={() => { setExpression(x.text); setResult(null); setError(null); }}
                    className="rounded-full border border-line px-3 py-1 text-[12.5px] text-muted transition-colors hover:border-primary/40 hover:text-primary">
                    {x.label}
                  </button>
                ))}
              </div>
              <Field label="Sample values" hint="The fields the rule can use, as JSON.">
                <Textarea value={sample} onValueChange={setSample} rows={7} className="font-mono text-[13px]" />
              </Field>
            </div>
          </Paper>

          {(result || error) && (
            <Paper className={error ? "border-rose-200" : "border-emerald-200"}>
              <div className="flex items-start gap-3 px-5 py-4">
                {error ? <CircleAlert size={20} strokeWidth={1.4} className="mt-0.5 text-rose-600" />
                  : <CheckCircle2 size={20} strokeWidth={1.4} className="mt-0.5 text-emerald-600" />}
                <div className="min-w-0 flex-1">
                  {error ? (
                    <>
                      <p className="text-[14.5px] text-ink">{error.message}</p>
                      {error.position != null && (
                        <pre className="mt-2 overflow-x-auto rounded-lg bg-sunken px-3 py-2 font-mono text-[12.5px] text-muted">
                          {expression}{"\n"}{" ".repeat(Math.max(0, error.position))}<span className="text-rose-600">^</span>
                        </pre>
                      )}
                    </>
                  ) : result && (
                    <>
                      <p className="text-[12px] uppercase tracking-[0.06em] text-faint">Result · {result.type}</p>
                      <p className="mt-1 break-all text-[22px] font-light text-ink">{shown}</p>
                      {result.fields.length > 0 && (
                        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[12.5px] text-muted">
                          Uses {result.fields.map((f) => <Badge key={f}>{f}</Badge>)}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </Paper>
          )}
        </div>

        <Paper className="h-fit">
          <PaperHeader title="What you can use" />
          <div className="space-y-4 px-5 py-4 text-[13px]">
            <div>
              <p className="mb-1.5 text-muted">Compare and combine</p>
              <p className="font-mono text-[12.5px] leading-6 text-ink">== != &lt; &lt;= &gt; &gt;=<br />and or not<br />in [..] · not in · between a and b<br />+ - * / %</p>
            </div>
            <div>
              <p className="mb-1.5 text-muted">Functions</p>
              <ul className="space-y-1.5">
                {fns.map((f) => (
                  <li key={f.name} className="flex gap-2">
                    <FlaskConical size={13} strokeWidth={1.4} className="mt-1 shrink-0 text-faint" />
                    <span><span className="font-mono text-[12.5px] text-ink">{f.name}()</span> <span className="text-faint">{f.help}</span></span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Paper>
      </div>
    </div>
  );
}
