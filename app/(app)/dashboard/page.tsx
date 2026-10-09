"use client";

import Link from "next/link";
import { useState } from "react";
import { AlertTriangle, CheckCircle2, Database, Info, Upload } from "lucide-react";
import { api, type AuditEvent } from "@/lib/api";
import { bytesParts, fmtBytes, fmtINR, fmtINRShort, fmtNum, healthColor, SOURCE_META, timeAgo } from "@/lib/format";
import { useSummary, useWsResource } from "@/components/hooks";
import { Empty, Kpi, Loading, Spinner, useToast } from "@/components/ui";
import { PriorityRow, TrendChart } from "@/components/widgets";
import { useWorkspace } from "@/components/workspace";

const EVENT_TEXT: Record<string, (e: AuditEvent) => string> = {
  "scan.completed": (e) => `Scan completed · ${fmtNum(Number(e.data.assets ?? 0))} assets`,
  "pipeline.commit": () => "Cleaned dataset committed",
  "pipeline.dry_run": () => "Pipeline dry run",
  "action.undo": () => "Action undone",
  "rows.reviewed": () => "Duplicate records reviewed",
  "rules.updated": () => "Tenant rules updated",
  "findings.bulk_apply": (e) => `Bulk-approved ${e.data.applied} recommendations`,
  "workspace.created": () => "Workspace created",
  "files.uploaded": (e) => `${e.data.count} files uploaded`,
};

function eventText(e: AuditEvent) {
  const fn = EVENT_TEXT[e.event];
  if (fn) return fn(e);
  if (e.event.startsWith("finding.")) return `${e.event.split(".")[1].toUpperCase()} · ${String(e.data.title ?? "")}`;
  return e.event;
}

function eventDot(e: AuditEvent) {
  if (e.event.includes("secure") || e.event.includes("delete")) return "bg-risk";
  if (e.event.includes("archive") || e.event.includes("undo")) return "bg-warn";
  if (e.event.includes("commit") || e.event.includes("scan") || e.event.includes("bulk")) return "bg-lime";
  return "bg-ink-400";
}

export default function Overview() {
  const { workspaces, refresh, setCurrent, loading: wsLoading } = useWorkspace();
  const { data: s, error, reload } = useSummary();
  const { data: events } = useWsResource<AuditEvent[]>("/audit?limit=6", [s?.history.length]);
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function loadDemo() {
    setBusy(true);
    try {
      const r = await api<{ workspaces: { id: string }[] }>("/demo/setup", { method: "POST" });
      await refresh();
      setCurrent(r.workspaces[0].id);
      toast({ kind: "success", text: "Demo companies loaded. The first scan is running." });
    } catch (e) {
      toast({ kind: "error", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  if (wsLoading) return <Loading />;
  if (!workspaces.length) {
    return (
      <Empty icon={<Database className="h-9 w-9" />} title="Connect your first data source"
        body="Load two demo companies (an Indian retailer and an NBFC with planted problems), or create a workspace and upload your own files."
        action={<div className="flex flex-wrap gap-2">
          <button className="btn-primary" onClick={loadDemo} disabled={busy}>{busy ? <Spinner /> : <Database className="h-4 w-4" />} Load demo companies</button>
          <Link className="btn-secondary" href="/sources"><Upload className="h-4 w-4" /> Upload your own data</Link>
        </div>} />
    );
  }
  if (error) return <Empty title="Could not load the overview" body={error} action={<button className="btn-secondary" onClick={reload}>Retry</button>} />;
  if (!s) return <Loading />;
  if (!s.has_scan) {
    return s.running_scan
      ? <div className="card p-6"><div className="flex items-center gap-3 text-sm text-fg-2"><Spinner /> {s.running_scan.stage}… {Math.round(s.running_scan.progress * 100)}%</div></div>
      : <Empty title="No scan yet" body="Upload files or connect a source, then press Run scan." action={<Link href="/sources" className="btn-primary">Add data</Link>} />;
  }

  const t = s.totals;
  const reclaim = t.redundant_bytes + t.stale_bytes;
  const open = s.severity.critical + s.severity.warning + s.severity.info;
  const first = s.history[0]?.score;
  const delta = s.health_score != null && first != null ? s.health_score - first : 0;
  const sevTotal = Math.max(1, s.severity.critical + s.severity.warning);
  const [totalNum, totalUnit] = bytesParts(t.total_bytes);
  const [recNum, recUnit] = bytesParts(reclaim);
  const maxDept = Math.max(1, ...s.by_department.map((d) => d.bytes));

  return (
    <div className="flex flex-col gap-4">
      {s.running_scan && (
        <div className="card flex items-center gap-3 border-lime/30 p-4 text-sm text-fg-2"><Spinner /> Re-scanning: {s.running_scan.stage} · {Math.round(s.running_scan.progress * 100)}%</div>
      )}

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(190px,100%),1fr))] gap-3">
        <Kpi label="Data health score" value={s.health_score ?? "—"} unit="/ 100"
          sub={delta > 0 ? `▲ ${delta} pts since first scan` : delta < 0 ? `▼ ${-delta} pts since first scan` : "Baseline · act to improve"} subTone={delta > 0 ? "lime" : delta < 0 ? "risk" : "muted"} />
        <Kpi label="Total data" value={totalNum} unit={totalUnit} sub={`${s.by_source.length} source${s.by_source.length === 1 ? "" : "s"} connected`} />
        <Kpi label="Reclaimable" value={recNum} unit={recUnit} sub={`${t.total_bytes ? Math.round((100 * reclaim) / t.total_bytes) : 0}% of all storage`} />
        <Kpi label="Annual storage waste" value={fmtINRShort(s.recommendations.annual_waste_inr)} sub={`${fmtINR(s.resolved.savings_inr_year)}/yr saved so far`} subTone="lime" />
        <Kpi label="Open issues" value={fmtNum(open)} sub={`${s.severity.critical} critical`} subTone="risk" tone="risk" />
      </div>

      <div className="flex flex-wrap gap-4">
        <section aria-labelledby="trend-h" className="card flex min-w-0 flex-[2_1_520px] flex-col gap-4 p-[22px]">
          <div className="flex flex-col gap-0.5">
            <h2 id="trend-h" className="text-base font-semibold">Data health score over time</h2>
            <span className="text-[13px] text-fg-3">{delta >= 0 ? "+" : ""}{delta} pts across {s.history.length} recorded changes · hover for details</span>
          </div>
          <TrendChart history={s.history} />
        </section>

        <section aria-labelledby="sev-h" className="card flex min-w-0 flex-[1_1_300px] flex-col gap-4 p-[22px]">
          <h2 id="sev-h" className="text-base font-semibold">Issues by severity</h2>
          <div className="flex h-3 gap-0.5 overflow-hidden rounded-full">
            <div className="bg-risk" style={{ width: `${(100 * s.severity.critical) / sevTotal}%` }} />
            <div className="flex-1 bg-warn" />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center justify-between gap-3 border-b border-line py-3.5">
              <span className="flex items-center gap-2.5"><AlertTriangle className="h-4 w-4 text-risk" />Critical</span>
              <span className="text-[22px] font-semibold tracking-[-0.03em]">{s.severity.critical}</span>
            </div>
            <div className="flex items-center justify-between gap-3 border-b border-line py-3.5">
              <span className="flex items-center gap-2.5"><Info className="h-4 w-4 text-warn" />Warning</span>
              <span className="text-[22px] font-semibold tracking-[-0.03em]">{s.severity.warning}</span>
            </div>
            <div className="flex items-center justify-between gap-3 py-3.5">
              <span className="flex items-center gap-2.5"><CheckCircle2 className="h-4 w-4 text-lime" />Healthy data</span>
              <span className="text-[22px] font-semibold tracking-[-0.03em]">{Math.round(s.healthy_pct)}%</span>
            </div>
          </div>
          <Link href="/actions" className="mt-auto flex min-h-[44px] items-center justify-center rounded-xl border border-line-3 font-medium hover:border-lime/60">Open Action Center</Link>
        </section>
      </div>

      <div className="flex flex-wrap gap-4">
        <section aria-labelledby="dept-h" className="card flex min-w-0 flex-[1_1_420px] flex-col gap-4 p-[22px]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="dept-h" className="text-base font-semibold">Storage by owner</h2>
            <div className="flex gap-4 text-xs text-fg-2">
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px] bg-ink-400" />Useful</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px] bg-lime" />Reclaimable</span>
            </div>
          </div>
          <div className="flex flex-col gap-3.5">
            {s.by_department.map((d) => (
              <div key={d.name} className="grid grid-cols-[96px_minmax(0,1fr)_124px] items-center gap-3" title={`${d.name}: ${fmtBytes(d.bytes)} total, ${fmtBytes(d.reclaimable)} reclaimable`}>
                <span className="truncate text-fg-2">{d.name}</span>
                <div className="flex h-3.5 gap-0.5">
                  <div className="rounded-l bg-ink-400" style={{ width: `${((d.bytes - d.reclaimable) / maxDept) * 100}%` }} />
                  <div className="rounded-r bg-lime" style={{ width: `${(d.reclaimable / maxDept) * 100}%` }} />
                </div>
                <span className="text-right font-mono text-xs">{fmtBytes(d.bytes)} <span className="text-fg-3">· {fmtBytes(d.reclaimable, 0)}</span></span>
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby="src-h" className="card flex min-w-0 flex-[1_1_360px] flex-col gap-3.5 p-[22px]">
          <div className="flex items-center justify-between gap-3">
            <h2 id="src-h" className="text-base font-semibold">Connected sources</h2>
            <Link href="/sources" className="flex min-h-[36px] items-center px-2 text-[13px] text-fg-2 hover:text-lime">View all →</Link>
          </div>
          {s.by_source.map((src) => (
            <div key={src.id} className="flex items-center gap-3.5 border-t border-line py-2.5">
              <span className="flex h-9 w-9 flex-none items-center justify-center rounded-[10px] bg-ink-750 font-mono text-[11px] text-fg-2">{SOURCE_META[src.id]?.abbr ?? "··"}</span>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="font-medium">{SOURCE_META[src.id]?.name ?? src.name}</span>
                <span className="text-xs text-fg-3">{fmtBytes(src.bytes)} · {fmtNum(src.objects)} objects · {src.issues} issues</span>
              </div>
              <span className="font-mono text-[13px]" style={{ color: healthColor(src.health) }}>{src.health}</span>
            </div>
          ))}
        </section>
      </div>

      <div className="flex flex-wrap gap-4">
        <section aria-labelledby="top-h" className="card flex min-w-0 flex-[2_1_520px] flex-col gap-1.5 p-[22px]">
          <div className="flex items-center justify-between gap-3 pb-2">
            <h2 id="top-h" className="text-base font-semibold">AI Action Center · top priorities</h2>
            <span className="font-mono text-[11px] text-fg-3">RANKED BY RISK + ₹</span>
          </div>
          {s.top_findings.length ? s.top_findings.slice(0, 5).map((f) => <PriorityRow key={f.id} f={f} />)
            : <div className="border-t border-line py-6 text-sm text-fg-3">Nothing open. Your data is in great shape.</div>}
        </section>

        <section aria-labelledby="act-h" className="card flex min-w-0 flex-[1_1_300px] flex-col gap-4 p-[22px]">
          <div className="flex items-center justify-between">
            <h2 id="act-h" className="text-base font-semibold">Activity</h2>
            <Link href="/audit" className="text-[13px] text-fg-2 hover:text-lime">Audit log →</Link>
          </div>
          <div className="flex flex-col">
            {(events ?? []).slice(0, 5).map((e) => (
              <div key={e.id} className="flex gap-3 pb-4">
                <span className={`mt-1.5 h-2 w-2 flex-none rounded-full ${eventDot(e)}`} />
                <div className="flex min-w-0 flex-col">
                  <span className="truncate">{eventText(e)}</span>
                  <span className="text-xs text-fg-3">{e.actor} · {timeAgo(e.created_at)}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
