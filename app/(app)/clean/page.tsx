"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, Bot, CheckCircle2, HelpCircle, Play, ShieldCheck, Sparkles, Trash2, XCircle } from "lucide-react";
import { api, type Asset, type PlanResponse, type Run } from "@/lib/api";
import { fmtBytes, fmtNum } from "@/lib/format";
import { useWsResource } from "@/components/hooks";
import { ConfirmDialog, Empty, PageHeader, Spinner, useToast } from "@/components/ui";
import { PipelineGraph } from "@/components/widgets";

interface Profile {
  rows: number;
  suggested_prompt: string;
  columns: { name: string; inferred_type: string; null_rate: number; pii_entity: string | null; samples: string[] }[];
  issues: { message: string }[];
}

const EXAMPLES = [
  "Trim whitespace, normalize emails and standardize phone numbers to +91 format",
  "Remove duplicate customers by email and quarantine rows missing email",
  "Convert all dates to YYYY-MM-DD and validate with our business rules",
  "Mask Aadhaar and PAN numbers",
];

function Studio() {
  const params = useSearchParams();
  const toast = useToast();
  const { data: assets, wsId } = useWsResource<Asset[]>("/assets?limit=2000");
  const tabular = useMemo(() => (assets ?? []).filter((a) => a.kind === "tabular" && a.status === "active" && a.content_available), [assets]);
  const [assetId, setAssetId] = useState<string>("");
  const [prompt, setPrompt] = useState(params.get("prompt") ?? "");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [plan, setPlan] = useState<PlanResponse | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [busy, setBusy] = useState<"" | "plan" | "dry" | "commit" | "validate">("");
  const [tab, setTab] = useState<"changes" | "quarantine" | "output">("changes");
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    if (!tabular.length) return;
    const wanted = params.get("asset");
    setAssetId((cur) => cur || (tabular.find((a) => a.id === wanted)?.id ?? tabular.find((a) => a.name === "customers_master.csv")?.id ?? tabular[0].id));
  }, [tabular, params]);

  useEffect(() => {
    if (!assetId || !wsId) return;
    setProfile(null);
    setPlan(null);
    setRun(null);
    api<Profile>(`/workspaces/${wsId}/assets/${assetId}/profile`).then((p) => {
      setProfile(p);
      setPrompt((cur) => cur || p.suggested_prompt);
    }).catch((e) => toast({ kind: "error", text: (e as Error).message }));
  }, [assetId, wsId, toast]);

  async function makePlan() {
    setBusy("plan");
    setRun(null);
    try {
      setPlan(await api<PlanResponse>(`/workspaces/${wsId}/pipelines/plan`, { method: "POST", json: { asset_id: assetId, prompt } }));
    } catch (e) {
      toast({ kind: "error", text: (e as Error).message });
    } finally {
      setBusy("");
    }
  }

  const removeStep = useCallback(async (stepId: string) => {
    if (!plan) return;
    setBusy("validate");
    try {
      const spec = { ...plan.spec, steps: plan.spec.steps.filter((s) => s.id !== stepId) };
      const r = await api<{ validation: PlanResponse["validation"]; spec: PlanResponse["spec"]; graph: PlanResponse["graph"] }>(
        `/workspaces/${wsId}/pipelines/validate`, { method: "POST", json: { asset_id: assetId, spec } });
      setPlan({ ...plan, spec: r.spec, graph: r.graph ?? plan.graph, validation: r.validation });
      setRun(null);
    } catch (e) {
      toast({ kind: "error", text: (e as Error).message });
    } finally {
      setBusy("");
    }
  }, [plan, wsId, assetId, toast]);

  async function dryRun() {
    if (!plan) return;
    setBusy("dry");
    try {
      setRun(await api<Run>(`/workspaces/${wsId}/pipelines/dry-run`, { method: "POST", json: { asset_id: assetId, spec: plan.spec, prompt, planner: plan.planner } }));
      setTab("changes");
    } catch (e) {
      toast({ kind: "error", text: (e as Error).message });
    } finally {
      setBusy("");
    }
  }

  async function commit() {
    if (!run) return;
    setBusy("commit");
    try {
      setRun(await api<Run>(`/workspaces/${wsId}/runs/${run.id}/commit`, { method: "POST" }));
      setConfirm(false);
      toast({ kind: "success", text: "Committed. The cleaned file and quarantine report were written as new files." });
    } catch (e) {
      toast({ kind: "error", text: (e as Error).message });
    } finally {
      setBusy("");
    }
  }

  if (assets && !tabular.length) return <Empty title="No tabular data yet" body="Upload a CSV, Excel or JSON file to use Clean Studio." action={<Link className="btn-primary" href="/sources">Go to Data Sources</Link>} />;
  const asset = tabular.find((a) => a.id === assetId);
  const t = run?.metrics.totals;

  return (
    <>
      <PageHeader subtitle="Describe the cleanup in plain English. AI drafts a pipeline from approved operators, the platform validates it, and you dry-run before anything is written." />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-2">
          <label className="label" htmlFor="asset">Dataset</label>
          <select id="asset" className="input mt-1.5" value={assetId} onChange={(e) => { setAssetId(e.target.value); setPrompt(""); }}>
            {tabular.map((a) => <option key={a.id} value={a.id}>{a.path} · {fmtBytes(a.size_bytes)}{a.source === "pipeline-output" ? " (cleaned output)" : ""}</option>)}
          </select>
          <label className="label mt-4 block" htmlFor="prompt">What should happen to this data?</label>
          <textarea id="prompt" className="input mt-1.5 min-h-[104px] py-3 font-normal" value={prompt} onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g. Remove duplicate customers by email, standardize phone numbers and quarantine rows without email" />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {EXAMPLES.map((e) => <button key={e} onClick={() => setPrompt(e)} className="rounded-full border border-line px-2.5 py-1 text-xs text-fg-2 hover:bg-ink-800">{e}</button>)}
          </div>
          <div className="mt-4 flex items-center gap-2">
            <button className="btn-primary" onClick={makePlan} disabled={!assetId || prompt.trim().length < 3 || !!busy}>
              {busy === "plan" ? <Spinner /> : <Sparkles className="h-4 w-4" />} Generate plan
            </button>
            <span className="text-xs text-fg-3">Only metadata and masked samples are sent to the AI.</span>
          </div>
        </div>

        <div className="card p-5">
          <div className="label">Profile</div>
          {!profile ? <div className="mt-6 flex justify-center text-fg-4"><Spinner /></div> : (
            <>
              <div className="mt-1 text-sm text-fg-2">{fmtNum(profile.rows)} rows · {profile.columns.length} columns · {asset?.owner}</div>
              <ul className="mt-3 max-h-56 space-y-1 overflow-y-auto pr-1 text-xs">
                {profile.columns.map((c) => (
                  <li key={c.name} className="flex items-center gap-2">
                    <code className="truncate font-medium text-fg">{c.name}</code>
                    <span className="text-fg-4">{c.inferred_type}</span>
                    {c.pii_entity && <span className="rounded bg-risk/10 px-1 text-[10px] font-medium text-risk">{c.pii_entity}</span>}
                    <span className="ml-auto text-fg-4">{c.null_rate > 0 ? `${(c.null_rate * 100).toFixed(1)}% empty` : ""}</span>
                  </li>
                ))}
              </ul>
              {profile.issues.length > 0 && (
                <div className="mt-3 border-t border-line pt-3 text-xs text-warn">
                  {profile.issues.slice(0, 4).map((i, k) => <div key={k} className="flex gap-1.5"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />{i.message}</div>)}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {plan && (
        <div className="card mt-4 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <div className="font-semibold">Proposed pipeline</div>
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${plan.planner === "llm" ? "bg-lime/10 text-lime" : "bg-ink-850 text-fg-2"}`}>
              {plan.planner === "llm" ? <><Sparkles className="h-3 w-3" /> Planned by Claude</> : <><Bot className="h-3 w-3" /> Deterministic planner</>}
            </span>
            <span className="rounded-full bg-ink-850 px-2 py-0.5 text-[11px] text-fg-2">Tenant rules v{plan.rule_set_version}</span>
            {plan.reviewed_groups > 0 && <span className="rounded-full bg-lime/10 px-2 py-0.5 text-[11px] text-lime">{plan.reviewed_groups} reviewed duplicate groups included</span>}
            <span className={`ml-auto inline-flex items-center gap-1 text-sm font-medium ${plan.validation.valid ? "text-lime" : "text-risk"}`}>
              {plan.validation.valid ? <><ShieldCheck className="h-4 w-4" /> Validated</> : <><XCircle className="h-4 w-4" /> Invalid</>}
            </span>
          </div>
          {plan.note && <div className="mt-2 text-xs text-warn">{plan.note}</div>}
          <div className="mt-4 overflow-x-auto pb-1"><PipelineGraph nodes={plan.graph.nodes} /></div>

          <div className="mt-4 divide-y divide-line rounded-lg border border-line">
            {plan.spec.steps.map((s) => (
              <div key={s.id} className="flex items-start gap-3 px-3 py-2 text-sm">
                <code className="mt-0.5 rounded bg-ink-850 px-1.5 text-xs">{s.id}</code>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-fg">{s.op}</div>
                  <div className="truncate font-mono text-xs text-fg-3">{JSON.stringify(s.params).slice(0, 220)}</div>
                  {s.reason && <div className="text-xs text-fg-3">From: {s.reason}</div>}
                </div>
                <button className="btn-ghost px-2 py-1" title="Remove step" onClick={() => removeStep(s.id)} disabled={!!busy}><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {plan.validation.errors.length > 0 && <Notes tone="error" title="Errors (must fix)" items={plan.validation.errors} />}
            {plan.questions.length > 0 && <Notes tone="question" title="Questions before running" items={plan.questions} />}
            {plan.assumptions.length > 0 && <Notes tone="info" title="Assumptions" items={plan.assumptions} />}
            {plan.validation.warnings.length > 0 && <Notes tone="warn" title="Warnings" items={plan.validation.warnings} />}
          </div>
          <div className="mt-4 flex items-center gap-2">
            <button className="btn-primary" onClick={dryRun} disabled={!plan.validation.valid || !plan.spec.steps.length || !!busy}>
              {busy === "dry" ? <Spinner /> : <Play className="h-4 w-4" />} Dry run on full data
            </button>
            <span className="text-xs text-fg-3">Writes to staging only. The original file is never modified.</span>
          </div>
        </div>
      )}

      {run && t && (
        <div className="card mt-4 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <div className="font-semibold">{run.status === "committed" ? "Committed run" : "Dry-run results"}</div>
            <code className="text-xs text-fg-4">run {run.id}</code>
            {run.status === "committed" && <span className="inline-flex items-center gap-1 rounded-full bg-lime/10 px-2 py-0.5 text-xs font-medium text-lime"><CheckCircle2 className="h-3 w-3" /> Approved by {run.approved_by}</span>}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
            <Stat label="Rows in" value={fmtNum(t.rows_in)} />
            <Stat label="Rows out" value={fmtNum(t.rows_out)} accent="text-lime" />
            <Stat label="Cells changed" value={fmtNum(t.cells_changed)} />
            <Stat label="Duplicates merged" value={fmtNum(t.duplicates_removed)} />
            <Stat label="Quarantined" value={fmtNum(t.rows_quarantined)} accent={t.rows_quarantined ? "text-warn" : undefined} />
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead className="bg-ink-850"><tr><th className="th">Step</th><th className="th">Rows in → out</th><th className="th">Changed</th><th className="th">Merged</th><th className="th">Quarantined</th><th className="th">Notes</th></tr></thead>
              <tbody className="divide-y divide-line">
                {run.metrics.steps.map((s) => (
                  <tr key={s.id}><td className="td"><code className="text-xs">{s.id}</code> {s.title}</td><td className="td">{fmtNum(s.rows_in)} → {fmtNum(s.rows_out)}</td>
                    <td className="td">{fmtNum(s.cells_changed)}</td><td className="td">{fmtNum(s.rows_removed)}</td><td className="td">{fmtNum(s.rows_quarantined)}</td>
                    <td className="td text-xs text-fg-3">{s.notes.join("; ")}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex gap-1 rounded-lg bg-ink-850 p-1 text-sm">
            {(["changes", "quarantine", "output"] as const).map((k) => (
              <button key={k} onClick={() => setTab(k)} className={`rounded-md px-3 py-1.5 font-medium ${tab === k ? "bg-ink-875 shadow-sm" : "text-fg-2"}`}>
                {k === "changes" ? "Before / after" : k === "quarantine" ? `Quarantine (${fmtNum(t.rows_quarantined)})` : "Output preview"}
              </button>
            ))}
          </div>
          <div className="mt-3 max-h-96 overflow-auto rounded-lg border border-line">
            {tab === "changes" ? (
              <table className="w-full text-xs"><thead className="sticky top-0 bg-ink-850"><tr><th className="th">Row</th><th className="th">Step</th><th className="th">Column</th><th className="th">Before</th><th className="th">After</th></tr></thead>
                <tbody className="divide-y divide-line">{run.preview.changes.map((c, i) => (
                  <tr key={i}><td className="td">{c.row}</td><td className="td">{c.op}</td><td className="td font-mono">{c.column}</td>
                    <td className="td"><span className="whitespace-pre rounded bg-risk/10 px-1 text-risk">{visible(c.before)}</span></td>
                    <td className="td"><span className="whitespace-pre rounded bg-lime/10 px-1 text-lime">{visible(c.after)}</span></td></tr>))}
                </tbody></table>
            ) : (
              <Grid rows={tab === "quarantine" ? run.preview.quarantine : run.preview.output_head} highlight={tab === "quarantine" ? "__reason" : undefined} />
            )}
          </div>
          {run.status === "dry_run" ? (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button className="btn-primary" onClick={() => setConfirm(true)} disabled={!!busy}><ShieldCheck className="h-4 w-4" /> Approve & commit</button>
              <span className="text-xs text-fg-3">Creates <b>{asset?.name.replace(/\.[^.]+$/, "")}.cleaned.csv</b> and a quarantine report. Lineage records pipeline, rule set v{run.rule_set_version} and operator versions.</span>
            </div>
          ) : (
            <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg bg-lime/10 p-3 text-sm text-lime">
              <CheckCircle2 className="h-4 w-4" /> Output written as a new dataset with full lineage. Related CLEAN recommendations were resolved.
              <Link href="/sources?source=pipeline-output" className="ml-auto font-medium underline">View in Data Sources</Link>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog open={confirm} title="Approve and commit this pipeline?" busy={busy === "commit"} confirmLabel="Approve & commit" onClose={() => setConfirm(false)} onConfirm={commit}
        body={t && <>Writes {fmtNum(t.rows_out)} cleaned rows to a <b>new file</b> and {fmtNum(t.rows_quarantined)} rows to a quarantine report. The source file stays untouched. Your approval is recorded in the audit trail.</>} />
    </>
  );
}

/** Make invisible differences visible: leading/trailing/double spaces become ␣. */
function visible(v: unknown): string {
  const s = v == null ? "" : String(v);
  if (!s) return "∅";
  return s.replace(/^ +| +$/g, (m) => "␣".repeat(m.length)).replace(/ {2,}/g, (m) => "␣".repeat(m.length));
}

function Stat({ label, value, accent }: { label: string; value: React.ReactNode; accent?: string }) {
  return (
    <div className="rounded-xl border border-line bg-ink-950 p-4">
      <div className="label">{label}</div>
      <div className={`mt-1.5 text-2xl font-semibold tracking-[-0.03em] ${accent ?? "text-fg"}`}>{value}</div>
    </div>
  );
}

function Notes({ tone, title, items }: { tone: "error" | "warn" | "info" | "question"; title: string; items: string[] }) {
  const cls = { error: "border-risk/40 bg-risk/10 text-risk", warn: "border-warn/40 bg-warn/10 text-warn", info: "border-line bg-ink-850 text-fg-2", question: "border-lime/50 bg-lime/10 text-lime" }[tone];
  return (
    <div className={`rounded-lg border p-3 text-xs ${cls}`}>
      <div className="mb-1 flex items-center gap-1 font-semibold">{tone === "question" && <HelpCircle className="h-3.5 w-3.5" />}{title}</div>
      <ul className="list-disc space-y-0.5 pl-4">{items.map((x, i) => <li key={i}>{x}</li>)}</ul>
    </div>
  );
}

function Grid({ rows, highlight }: { rows: Record<string, string | number>[]; highlight?: string }) {
  if (!rows.length) return <div className="p-6 text-center text-sm text-fg-3">No rows.</div>;
  const cols = Object.keys(rows[0]);
  return (
    <table className="w-full text-xs">
      <thead className="sticky top-0 bg-ink-850"><tr>{cols.map((c) => <th key={c} className="th whitespace-nowrap">{c === "__reason" ? "reason" : c === "_row" ? "row" : c}</th>)}</tr></thead>
      <tbody className="divide-y divide-line">
        {rows.map((r, i) => <tr key={i}>{cols.map((c) => <td key={c} className={`td whitespace-nowrap ${c === highlight ? "font-medium text-warn" : ""}`}>{String(r[c] ?? "")}</td>)}</tr>)}
      </tbody>
    </table>
  );
}

export default function Page() {
  return <Suspense fallback={null}><Studio /></Suspense>;
}
