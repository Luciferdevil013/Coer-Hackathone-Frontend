"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Bot, CheckCircle2, FileText, Sparkles, Wand2 } from "lucide-react";
import { api, type Asset, type FindingDetail } from "@/lib/api";
import { fmtBytes, fmtDate, fmtINR, fmtNum, KIND_LABEL } from "@/lib/format";
import { useWsResource } from "@/components/hooks";
import { ActionBadge, Confidence, ConfirmDialog, Empty, SeverityPill, Spinner, useToast } from "@/components/ui";

type Pending = { action: "APPLY" | "ARCHIVE" | "DELETE" | "SECURE" | "KEEP" | "IGNORE"; title: string; body: React.ReactNode; danger?: boolean } | null;

export default function FindingPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { data: f, reload, wsId, error } = useWsResource<FindingDetail>(`/findings/${id}`, [id]);
  const [explanation, setExplanation] = useState<{ text: string; source: string } | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!f || !wsId) return;
    if (f.explanation) {
      setExplanation({ text: f.explanation, source: f.explanation_source });
      return;
    }
    api<{ explanation: string; source: string }>(`/workspaces/${wsId}/findings/${f.id}/explain`, { method: "POST" })
      .then((r) => setExplanation({ text: r.explanation, source: r.source }))
      .catch(() => setExplanation(null));
  }, [f, wsId]);

  if (error) return <Empty title="Recommendation not found" body={error} action={<Link className="btn-secondary" href="/actions">Back to Action Center</Link>} />;
  if (!f) return <div className="flex justify-center py-24 text-fg-4"><Spinner className="h-6 w-6" /></div>;

  const plan: { asset_id: string; action: string; reason: string }[] = f.details.plan ?? [];
  const counts = plan.reduce<Record<string, number>>((a, p) => ({ ...a, [p.action]: (a[p.action] ?? 0) + 1 }), {});
  const actionable = ["DELETE", "ARCHIVE", "SECURE"].includes(f.action);
  const isOpen = f.status === "open";

  async function run(action: NonNullable<Pending>["action"]) {
    setBusy(true);
    try {
      const r = await api<{ action_id: string; note: string }>(`/workspaces/${wsId}/findings/${f!.id}/actions`, { method: "POST", json: { action, confirm: true } });
      setPending(null);
      await reload();
      toast({
        kind: "success", text: r.note,
        action: { label: "Undo", run: async () => {
          try {
            await api(`/workspaces/${wsId}/actions/${r.action_id}/undo`, { method: "POST" });
            toast({ kind: "info", text: "Undone. Everything is restored." });
            reload();
          } catch (e) { toast({ kind: "error", text: (e as Error).message }); }
        } },
      });
    } catch (e) {
      toast({ kind: "error", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  function applyDialog(): Pending {
    const parts = Object.entries(counts).filter(([a]) => a !== "KEEP").map(([a, n]) => `${a.toLowerCase()} ${n} item${n > 1 ? "s" : ""}`);
    return {
      action: "APPLY", danger: f!.action === "DELETE",
      title: `Apply recommendation: ${f!.action}`,
      body: <>
        <p>This will {parts.length ? parts.join(" and ") : f!.action.toLowerCase() + " the target"}{counts.KEEP ? `, keeping ${counts.KEEP}` : ""}.</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-fg-3">
          {f!.action === "DELETE" || counts.DELETE ? <li>Deleted files go to a restorable trash, not a permanent delete.</li> : null}
          {f!.action === "ARCHIVE" || counts.ARCHIVE ? <li>Archived files move to cold storage and stay restorable.</li> : null}
          {f!.action === "SECURE" ? <li>Access is restricted to the owner and the file moves to the encrypted vault.</li> : null}
          <li>You can undo this from the toast or the Audit page.</li>
        </ul>
      </>,
    };
  }

  return (
    <>
      <button onClick={() => router.back()} className="mb-4 inline-flex items-center gap-1.5 text-sm text-fg-3 hover:text-fg"><ArrowLeft className="h-4 w-4" /> Back</button>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-fg-3">
            <SeverityPill severity={f.severity} /> <span>{KIND_LABEL[f.kind]}</span>
            {f.status !== "open" && <span className="inline-flex items-center gap-1 rounded bg-lime/10 px-1.5 py-0.5 font-medium text-lime"><CheckCircle2 className="h-3 w-3" />{f.status} · {f.resolution}</span>}
          </div>
          <h2 className="text-[28px] font-semibold leading-tight tracking-[-0.03em] text-fg">{f.title}</h2>
          <p className="mt-1 max-w-3xl text-sm text-fg-2">{f.summary}</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="card p-5">
            <div className="flex items-center gap-2">
              <div className="label">Why this recommendation?</div>
              {explanation && (
                <span className={`ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${explanation.source === "claude" ? "bg-lime/10 text-lime" : "bg-ink-850 text-fg-2"}`}>
                  {explanation.source === "claude" ? <><Sparkles className="h-3 w-3" /> Written by Claude from the evidence</> : <><Bot className="h-3 w-3" /> Generated from evidence</>}
                </span>
              )}
            </div>
            <p className="mt-2 text-[15px] leading-relaxed text-fg">{explanation?.text ?? <span className="text-fg-4">Preparing explanation…</span>}</p>
            <div className="mt-4 grid gap-x-6 gap-y-2 sm:grid-cols-2">
              {f.evidence.map((e, i) => (
                <div key={i} className="flex flex-col border-l-2 border-line pl-3">
                  <span className="text-xs text-fg-3">{e.label}</span>
                  <span className="text-sm font-medium text-fg [overflow-wrap:anywhere]">{String(e.value)}</span>
                </div>
              ))}
            </div>
          </div>

          {f.kind === "duplicate_rows" ? <DuplicateReview f={f} wsId={wsId!} onSaved={reload} />
            : f.kind === "data_quality" ? <QualityPanel f={f} />
              : f.kind === "unused_columns" ? <UnusedColumns f={f} />
              : f.kind === "anomalous_values" ? <AnomalyPanel f={f} />
                : f.kind === "sensitive_data" ? <SensitivePanel f={f} />
                  : plan.length > 0 && <PlanTable f={f} plan={plan} />}
        </div>

        <div className="space-y-4">
          <div className="card p-5">
            <div className="label">Recommended action</div>
            <div className="mt-2 flex items-center gap-3"><ActionBadge action={f.action} size="md" /><Confidence value={f.confidence} /></div>
            <dl className="mt-4 space-y-2 text-sm">
              {f.savings_inr_year >= 1 && <Row k="Annual saving" v={<span className="font-semibold text-lime">{fmtINR(f.savings_inr_year)}</span>} />}
              {f.bytes_affected > 0 && <Row k="Data affected" v={fmtBytes(f.bytes_affected)} />}
              {f.records_affected > 0 && <Row k="Records" v={fmtNum(f.records_affected)} />}
              {f.risk_score > 0 && <Row k="Risk score" v={<span className="font-semibold text-risk">{Math.round(f.risk_score)}/100</span>} />}
              {plan.length > 0 && <Row k="Plan" v={Object.entries(counts).map(([a, n]) => `${a} ${n}`).join(" · ")} />}
            </dl>
            {isOpen ? (
              <div className="mt-5 space-y-2">
                {f.action === "CLEAN" ? (
                  <Link href={`/clean?asset=${f.target_asset_ids[0]}${f.details.suggested_prompt ? `&prompt=${encodeURIComponent(f.details.suggested_prompt)}` : ""}`} className="btn-primary w-full">
                    <Wand2 className="h-4 w-4" /> Open in Clean Studio
                  </Link>
                ) : actionable ? (
                  <button className={f.action === "DELETE" ? "btn-danger w-full" : "btn-primary w-full"} onClick={() => setPending(applyDialog())}>
                    Apply: {f.action === "SECURE" ? "secure" : f.action.toLowerCase()} {plan.length ? "as planned" : ""}
                  </button>
                ) : null}
                {f.action === "DELETE" && f.kind !== "exact_duplicate" && (
                  <button className="btn-secondary w-full" onClick={() => setPending({ action: "ARCHIVE", title: "Archive instead of delete", body: "All targets move to cold storage instead of the trash. You can restore them at any time." })}>Archive instead</button>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <button className="btn-secondary" onClick={() => setPending({ action: "KEEP", title: "Keep as is", body: "Mark this as intentional. It stays dismissed on future scans." })}>Keep</button>
                  <button className="btn-secondary" onClick={() => setPending({ action: "IGNORE", title: "Ignore recommendation", body: "Hide this recommendation. It stays dismissed on future scans." })}>Ignore</button>
                </div>
              </div>
            ) : (
              <div className="mt-5 rounded-lg bg-ink-850 p-3 text-sm text-fg-2">
                This recommendation is {f.status}. <Link href="/audit" className="font-medium text-lime hover:underline">Undo from the audit log</Link>
              </div>
            )}
          </div>
          {f.actions.length > 0 && (
            <div className="card p-5">
              <div className="label mb-2">History</div>
              <ul className="space-y-2 text-sm">
                {f.actions.map((a) => (
                  <li key={a.id} className="text-fg-2"><b className="text-fg">{a.action}</b> by {a.actor} · {fmtDate(a.created_at)}{a.status === "undone" && <span className="ml-1 text-warn">(undone)</span>}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog open={!!pending} title={pending?.title ?? ""} body={pending?.body} danger={pending?.danger} busy={busy}
        confirmLabel="Confirm" onConfirm={() => pending && run(pending.action)} onClose={() => setPending(null)} />
    </>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="flex justify-between gap-3"><dt className="shrink-0 text-fg-3">{k}</dt><dd className="min-w-0 text-right text-fg">{v}</dd></div>;
}

function PlanTable({ f, plan }: { f: FindingDetail; plan: { asset_id: string; action: string; reason: string }[] }) {
  const chain: { asset_id: string; similarity_to_latest: number | null }[] | undefined = f.details.chain;
  const sim = new Map(chain?.map((c) => [c.asset_id, c.similarity_to_latest]));
  const rows = plan.slice(0, 200);
  return (
    <div className="card overflow-hidden">
      <div className="border-b border-line px-5 py-3">
        <div className="font-semibold">{f.kind === "version_chain" ? "Version chain" : f.kind === "redundant_backup" ? "Backup series" : "Per-file plan"}</div>
        {f.kind === "version_chain" && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
            {chain?.map((c, i) => {
              const a = f.assets[c.asset_id];
              const p = plan.find((x) => x.asset_id === c.asset_id);
              return (
                <span key={c.asset_id} className="flex items-center gap-1.5">
                  <span className={`rounded-md px-2 py-1 font-medium ${p?.action === "KEEP" ? "bg-lime/10 text-lime" : "bg-ink-850 text-fg-2"}`}>{a?.name}</span>
                  {i < (chain?.length ?? 0) - 1 && <ArrowRight className="h-3 w-3 text-fg-4" />}
                </span>
              );
            })}
          </div>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead className="bg-ink-850"><tr><th className="th">File</th><th className="th">Size</th><th className="th">Modified</th>{chain && <th className="th">Similarity</th>}<th className="th">Action</th></tr></thead>
          <tbody className="divide-y divide-line">
            {rows.map((p) => {
              const a: Asset | undefined = f.assets[p.asset_id];
              const s = sim.get(p.asset_id);
              return (
                <tr key={p.asset_id}>
                  <td className="td min-w-[260px]"><div className="break-words font-medium text-fg">{a?.path}</div><div className="text-xs text-fg-3">{p.reason}</div></td>
                  <td className="td whitespace-nowrap">{fmtBytes(a?.size_bytes)}</td>
                  <td className="td whitespace-nowrap">{fmtDate(a?.modified_at)}</td>
                  {chain && <td className="td">{s == null ? "—" : `${(s * 100).toFixed(1)}%`}</td>}
                  <td className="td"><ActionBadge action={p.action as never} />{a && a.status !== "active" && <span className="ml-2 text-xs text-fg-4">{a.status}</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {plan.length > rows.length && <div className="px-5 py-2 text-xs text-fg-3">+ {plan.length - rows.length} more objects</div>}
    </div>
  );
}

function SensitivePanel({ f }: { f: FindingDetail }) {
  const ents: Record<string, number> = f.details.entities ?? {};
  const cols: Record<string, string> = f.details.columns ?? {};
  return (
    <div className="card p-5">
      <div className="font-semibold">Personal data found</div>
      <div className="mt-3 flex flex-wrap gap-2">
        {Object.entries(ents).map(([k, v]) => <span key={k} className="rounded-full bg-risk/10 px-2.5 py-1 text-xs font-medium text-risk">{k.replace("_", " ")} · {fmtNum(v)}</span>)}
      </div>
      {Object.keys(cols).length > 0 && (
        <div className="mt-4 text-sm text-fg-2">Columns: {Object.entries(cols).map(([c, e]) => <code key={c} className="mr-2 rounded bg-ink-850 px-1.5 py-0.5 text-xs">{c} → {e}</code>)}</div>
      )}
      {f.details.past_retention && (
        <div className="mt-4 rounded-lg border border-warn/40 bg-warn/10 p-3 text-sm text-warn">
          <b>DPDP Act:</b> this data has been unused for {fmtNum(f.details.days_since_use)} days, past the retention window. Personal data must be erased once its purpose is served. Give users 48 hours&apos; notice first.
        </div>
      )}
      {f.target_asset_ids[0] && f.assets[f.target_asset_ids[0]]?.kind === "tabular" && (
        <Link href={`/clean?asset=${f.target_asset_ids[0]}&prompt=${encodeURIComponent("Mask Aadhaar, PAN and bank account numbers")}`} className="btn-secondary mt-4"><Wand2 className="h-4 w-4" /> Create a masked copy in Clean Studio</Link>
      )}
    </div>
  );
}

function AnomalyPanel({ f }: { f: FindingDetail }) {
  type Flag = { column: string; value: number; median: number; z: number; scale?: string; rule?: string };
  const rows: { row: number; score: number; flags: Flag[]; context: Record<string, string> }[] = f.details.rows ?? [];
  const fmt = (v: number) => new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(v);
  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-5 py-3">
        <div className="font-semibold">Flagged rows</div>
        <span className="font-mono text-[11px] text-fg-3">ISOLATION FOREST · {f.details.params?.n_estimators} TREES · ROBUST Z ≥ {f.details.params?.robust_z_threshold} · SCIKIT-LEARN</span>
      </div>
      <div className="max-h-[520px] overflow-auto">
        <table className="w-full min-w-[640px]">
          <thead className="sticky top-0 bg-ink-875"><tr><th className="th">Row</th><th className="th">Column</th><th className="th">Value</th><th className="th">Median</th><th className="th">Robust z</th><th className="th">Why flagged</th><th className="th">Forest score</th><th className="th">Context</th></tr></thead>
          <tbody>
            {rows.flatMap((r) => r.flags.map((fl, i) => (
              <tr key={`${r.row}-${fl.column}`} className="row-hover">
                <td className="td font-mono text-xs">{i === 0 ? r.row : ""}</td>
                <td className="td font-mono text-xs text-fg">{fl.column}</td>
                <td className="td font-mono text-[13px] font-semibold text-risk">{fmt(fl.value)}</td>
                <td className="td font-mono text-xs">{fmt(fl.median)}</td>
                <td className="td font-mono text-xs text-warn">{fl.z > 0 ? "+" : ""}{fl.z}{fl.scale === "log" && <span className="text-fg-4"> log</span>}</td>
                <td className="td text-xs">{fl.rule ?? "isolation forest + robust z"}</td>
                <td className="td font-mono text-xs">{i === 0 ? r.score : ""}</td>
                <td className="td max-w-[220px] truncate text-xs text-fg-3">{i === 0 ? Object.values(r.context ?? {}).join(" · ") : ""}</td>
              </tr>
            )))}
          </tbody>
        </table>
      </div>
      <div className="px-5 py-3 text-xs text-fg-3">The forest scores how easily a row is isolated from the rest (lower is stranger); the robust z-score (median / MAD, log scale for skewed amounts, threshold raised for large files) shows which value is responsible. Rows are flagged only when both agree, or when an amount is off by 100× or more.</div>
    </div>
  );
}

function UnusedColumns({ f }: { f: FindingDetail }) {
  const cols: { column: string; last_referenced: string; systems_using: number; historic_systems: string[]; non_null: number; bytes: number }[] = f.details.columns;
  return (
    <div className="card overflow-hidden">
      <div className="border-b border-line px-5 py-3 font-semibold">Columns in <code className="text-sm">{f.details.table}</code></div>
      <table className="w-full">
        <thead className="bg-ink-850"><tr><th className="th">Column</th><th className="th">Last referenced</th><th className="th">Systems (now / ever)</th><th className="th">Values</th><th className="th">Size</th></tr></thead>
        <tbody className="divide-y divide-line">
          {cols.map((c) => (
            <tr key={c.column}>
              <td className="td font-mono text-xs">{c.column}</td><td className="td">{c.last_referenced}</td>
              <td className="td">{c.systems_using} / {c.historic_systems.length ? c.historic_systems.join(", ") : "none"}</td>
              <td className="td">{fmtNum(c.non_null)}</td><td className="td">{fmtBytes(c.bytes)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="px-5 py-3 text-xs text-fg-3">Archiving exports these column values (with primary keys) to cold storage. Dropping them from the live database is left to your DBA.</div>
    </div>
  );
}

function QualityPanel({ f }: { f: FindingDetail }) {
  const issues: { code: string; column: string | null; count: number; message: string; suggested_op: string | null }[] = f.details.issues;
  return (
    <div className="card p-5">
      <div className="font-semibold">Issues found</div>
      <ul className="mt-3 divide-y divide-line text-sm">
        {issues.map((i, k) => (
          <li key={k} className="flex items-center gap-3 py-2">
            <FileText className="h-4 w-4 text-fg-4" /><span className="flex-1 text-fg-2">{i.message}</span>
            {i.suggested_op && <code className="rounded bg-fg/5 px-1.5 py-0.5 text-xs text-fg-2">{i.suggested_op}</code>}
          </li>
        ))}
      </ul>
      <div className="mt-4 rounded-lg bg-ink-850 p-3 text-sm text-fg-2"><span className="label">Suggested request</span><p className="mt-1">&ldquo;{f.details.suggested_prompt}&rdquo;</p></div>
    </div>
  );
}

function DuplicateReview({ f, wsId, onSaved }: { f: FindingDetail; wsId: string; onSaved: () => void }) {
  type Cluster = { cluster_id: string; row_ids: number[]; confidence: number; exact: boolean; reasons: string[]; conflict_columns: string[]; decision: string | null; rows: Record<string, string | number>[] };
  const clusters: Cluster[] = useMemo(() => f.details.clusters ?? [], [f.details.clusters]);
  const toast = useToast();
  const router = useRouter();
  const [filter, setFilter] = useState<"likely" | "conflict" | "exact">("likely");
  const [decisions, setDecisions] = useState<Record<string, string>>(() => Object.fromEntries(clusters.filter((c) => c.decision).map((c) => [c.cluster_id, c.decision!])));
  const [saving, setSaving] = useState(false);
  const shown = useMemo(() => clusters.filter((c) => filter === "conflict" ? c.conflict_columns.length : filter === "exact" ? c.exact && !c.conflict_columns.length : !c.exact && !c.conflict_columns.length).slice(0, 40), [clusters, filter]);
  const merged = Object.values(decisions).filter((d) => d === "merge").length;

  async function save(): Promise<boolean> {
    if (!Object.keys(decisions).length) return true;
    setSaving(true);
    try {
      await api(`/workspaces/${wsId}/findings/${f.id}/row-decisions`, { method: "POST", json: { decisions } });
      toast({ kind: "success", text: `Saved ${Object.keys(decisions).length} review decisions. Approved merges are applied in Clean Studio.` });
      onSaved();
      return true;
    } catch (e) {
      toast({ kind: "error", text: (e as Error).message });
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function saveAndClean() {
    if (await save()) {
      router.push(`/clean?asset=${f.target_asset_ids[0]}&prompt=${encodeURIComponent("Trim whitespace, normalize emails, standardize phone numbers to +91 format, remove duplicate records by email and quarantine rows missing email")}`);
    }
  }

  const tabs = [
    ["likely", "Likely duplicates", clusters.filter((c) => !c.exact && !c.conflict_columns.length).length],
    ["exact", "Exact", clusters.filter((c) => c.exact && !c.conflict_columns.length).length],
    ["conflict", "Conflicting IDs", clusters.filter((c) => c.conflict_columns.length).length],
  ] as const;

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
        <div className="font-semibold">Review duplicate groups</div>
        <div className="ml-auto flex gap-1 rounded-lg bg-ink-850 p-1">
          {tabs.map(([k, l, n]) => (
            <button key={k} onClick={() => setFilter(k)} className={`rounded-md px-2.5 py-1 text-xs font-medium ${filter === k ? "bg-ink-875 shadow-sm" : "text-fg-2"}`}>{l} <span className="text-fg-4">{n}</span></button>
          ))}
        </div>
      </div>
      <div className="max-h-[560px] divide-y divide-line overflow-y-auto">
        {shown.map((c) => {
          const cols = Object.keys(c.rows[0] ?? {}).filter((k) => k !== "_row");
          const d = decisions[c.cluster_id];
          return (
            <div key={c.cluster_id} className="px-5 py-3">
              <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                <span className="font-semibold text-fg">Duplicate confidence {Math.round(c.confidence * 100)}%</span>
                <span className="text-fg-3">{c.reasons.join(" · ")}</span>
                {c.conflict_columns.length > 0 && <span className="rounded bg-risk/10 px-1.5 py-0.5 font-medium text-risk">{c.conflict_columns.join(", ")} conflict: cannot merge</span>}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-xs">
                  <thead><tr>{["row", ...cols].map((k) => <th key={k} className="px-2 py-1 text-left font-medium text-fg-3">{k}</th>)}</tr></thead>
                  <tbody>{c.rows.map((r) => <tr key={r._row} className="border-t border-line">{["_row", ...cols].map((k) => <td key={k} className="px-2 py-1 text-fg-2">{String(r[k] ?? "")}</td>)}</tr>)}</tbody>
                </table>
              </div>
              <div className="mt-2 flex gap-1.5">
                {(["merge", "keep_both", "ignore"] as const).map((opt) => (
                  <button key={opt} disabled={opt === "merge" && c.conflict_columns.length > 0}
                    onClick={() => setDecisions((x) => ({ ...x, [c.cluster_id]: opt }))}
                    className={`rounded-md border px-2.5 py-1 text-xs font-medium disabled:opacity-40 ${d === opt ? "border-lime/50 bg-lime/10 text-lime" : "border-line text-fg-2 hover:bg-ink-800"}`}>
                    {opt === "merge" ? "Merge" : opt === "keep_both" ? "Keep both" : "Ignore"}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
        {!shown.length && <div className="p-6 text-center text-sm text-fg-3">No groups in this view.</div>}
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-line bg-ink-850 px-5 py-3">
        <span className="text-xs text-fg-3">{merged} groups marked to merge · exact duplicates are removed by the dedupe step</span>
        <button className="btn-secondary ml-auto" onClick={() => save()} disabled={saving || !Object.keys(decisions).length}>{saving && <Spinner />} Save decisions</button>
        <button className="btn-primary" onClick={saveAndClean} disabled={saving}><Wand2 className="h-4 w-4" /> Save & clean with decisions</button>
      </div>
    </div>
  );
}
