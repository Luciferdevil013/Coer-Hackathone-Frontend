"use client";

import Link from "next/link";
import { useState } from "react";
import type { Finding, GraphNode, Summary } from "@/lib/api";
import { fmtINR, fmtTime, timeAgo } from "@/lib/format";
import { SeverityPill } from "./ui";

export function ScoreRing({ score, size = 200, animate = true }: { score: number | null; size?: number; animate?: boolean }) {
  const c = 2 * Math.PI * 54; // r=54 in a 120 viewBox
  const off = c * (1 - (score ?? 0) / 100);
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 120 120" aria-hidden="true" className="-rotate-90">
        <circle cx="60" cy="60" r="54" fill="none" stroke="rgba(236,237,230,0.08)" strokeWidth="8" />
        <circle cx="60" cy="60" r="54" fill="none" stroke="#C9F25C" strokeWidth="8" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={off} style={{ transition: animate ? "stroke-dashoffset 1.6s cubic-bezier(.2,.7,.2,1)" : undefined }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-semibold leading-none tracking-[-0.05em]" style={{ fontSize: size * 0.3 }}>{score ?? "—"}</span>
        <span className="font-mono text-xs text-fg-3">/ 100</span>
      </div>
    </div>
  );
}

/** Health score after every scan, action, undo and commit (real snapshots, not a simulation). */
export function TrendChart({ history }: { history: Summary["history"] }) {
  const [hover, setHover] = useState<number | null>(null);
  if (history.length < 2) {
    return (
      <div className="flex h-[230px] items-center justify-center rounded-xl border border-dashed border-line-2 px-6 text-center text-sm text-fg-3">
        The trend starts after your first action. Approve or undo a recommendation and watch the score move.
      </div>
    );
  }
  const scores = history.map((h) => h.score);
  const lo = Math.max(0, Math.floor((Math.min(...scores) - 8) / 10) * 10);
  const hi = Math.min(100, Math.ceil((Math.max(...scores) + 8) / 10) * 10);
  const n = history.length;
  const xs = (i: number) => (i / (n - 1)) * 100;
  const ys = (v: number) => 100 - ((v - lo) / (hi - lo)) * 100;
  const pts = history.map((h, i) => `${xs(i).toFixed(2)},${ys(h.score).toFixed(2)}`);
  const area = `M0,100 L${pts.join(" L")} L100,100 Z`;
  const idx = hover ?? n - 1;
  const hx = xs(idx);
  const ticks = [hi, Math.round((hi + lo) / 2), lo];
  const tip = hx > 80 ? "translate(-100%, calc(-100% - 14px))" : hx < 20 ? "translate(0, calc(-100% - 14px))" : "translate(-50%, calc(-100% - 14px))";
  return (
    <div>
      <div className="grid grid-cols-[28px_minmax(0,1fr)] gap-2.5">
        <div className="relative h-[230px] font-mono text-[11px] text-fg-4">
          {ticks.map((t, i) => <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: `${i * 50}%` }}>{t}</span>)}
        </div>
        <div className="relative h-[230px]" onMouseLeave={() => setHover(null)}>
          <div className="absolute inset-x-0 top-0 border-t border-dashed border-line" />
          <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-line" />
          <div className="absolute inset-x-0 bottom-0 border-t border-line-2" />
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" className="absolute inset-0 h-full w-full overflow-visible">
            <path d={area} fill="#C9F25C" fillOpacity="0.1" />
            <polyline points={pts.join(" ")} fill="none" stroke="#C9F25C" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          </svg>
          <div className="absolute inset-y-0 w-px bg-fg/30" style={{ left: `${hx}%` }} />
          <div className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-lime shadow-[0_0_0_2px_#111412]" style={{ left: `${hx}%`, top: `${ys(history[idx].score)}%` }} />
          <div role="status" className="pointer-events-none absolute flex max-w-[260px] flex-col rounded-[10px] bg-fg px-3 py-2 text-ink-950 shadow-[0_10px_30px_rgba(0,0,0,0.4)]"
            style={{ left: `${hx}%`, top: `${ys(history[idx].score)}%`, transform: tip }}>
            <span className="truncate text-[11px] text-fg-ink">{fmtTime(history[idx].at)} · {history[idx].reason}</span>
            <span className="text-[15px] font-semibold">Score {history[idx].score}</span>
          </div>
          {history.map((_, i) => {
            const w = 100 / (n - 1);
            return <div key={i} className="absolute inset-y-0" style={{ left: `${xs(i) - w / 2}%`, width: `${w}%` }} onMouseEnter={() => setHover(i)} />;
          })}
        </div>
      </div>
      <div className="mt-2 flex justify-between pl-[38px] font-mono text-[11px] text-fg-4">
        <span>{timeAgo(history[0].at)}</span><span>Now</span>
      </div>
    </div>
  );
}

export function PriorityRow({ f }: { f: Finding }) {
  const meta = f.savings_inr_year >= 1 ? { text: `Save ${fmtINR(f.savings_inr_year)}/yr`, cls: "text-lime" }
    : f.category === "risk" ? { text: `Risk: ${f.risk_score >= 70 ? "high" : "medium"}`, cls: "text-risk" }
      : { text: f.action === "CLEAN" ? "Needs cleaning" : "Review", cls: "text-fg-3" };
  return (
    <div className="row-hover flex flex-wrap items-center gap-x-4 gap-y-2.5 rounded-xl border-t border-line px-2.5 py-3.5">
      <SeverityPill severity={f.severity} />
      <span className="min-w-0 flex-[1_1_240px] text-[15px] font-medium">{f.title}</span>
      <span className={`font-mono text-xs ${meta.cls}`}>{meta.text}</span>
      <Link href={`/findings/${f.id}`} className="flex min-h-[40px] items-center rounded-full border border-line-3 px-4 text-[13px] font-medium hover:border-lime/60 hover:text-lime">Review</Link>
    </div>
  );
}

export function PipelineGraph({ nodes }: { nodes: GraphNode[] }) {
  return (
    <div className="flex flex-wrap items-stretch gap-y-3">
      {nodes.map((n, i) => (
        <div key={n.id} className="flex items-center">
          <div title={n.reason || n.detail}
            className={`w-44 rounded-xl border px-3 py-2.5 text-xs ${n.type === "op"
              ? n.destructive ? "border-warn/50 bg-warn/[0.06]" : "border-line-2 bg-ink-850"
              : "border-lime/40 bg-lime/[0.06]"}`}>
            <div className="flex items-center gap-1.5 font-semibold text-fg">
              {n.type === "op" && <span className="rounded bg-ink-950 px-1 font-mono text-[10px] text-fg-3">{n.id}</span>}
              <span className="truncate">{n.label}</span>
            </div>
            <div className="mt-0.5 truncate text-fg-3">{n.type === "op" ? summarizeParams(n.params ?? {}) : n.detail}</div>
            {n.destructive && <div className="mt-1 font-mono text-[10px] uppercase text-warn">Removes rows · needs approval</div>}
          </div>
          {i < nodes.length - 1 && <div className="mx-1 h-px w-5 bg-line-3" />}
        </div>
      ))}
    </div>
  );
}

function summarizeParams(p: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(p)) {
    if (Array.isArray(v) && v.length) parts.push(k === "clusters" ? `${v.length} reviewed groups` : `${k}: ${v.join(", ")}`);
    else if (v && typeof v === "object" && Object.keys(v).length) parts.push(`${k}: ${Object.keys(v).join(", ")}`);
    else if ((typeof v === "string" || typeof v === "number") && k !== "country" && k !== "output_format") parts.push(`${k}: ${v}`);
  }
  return parts.join(" · ") || "all columns";
}
